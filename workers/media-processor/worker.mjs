/**
 * MANU — Processador de vídeos (Node.js 20+ com ffmpeg no PATH).
 * Execute em VPS, Docker ou computador que permaneça ligado; NUNCA em Vercel serverless.
 * Usa pg e @supabase/supabase-js existentes na raiz do projeto. Não depende de Python.
 * Originais continuam disponíveis até que a versão compactada esteja publicada.
 */
import pg from 'pg';
const { Pool } = pg;
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const must=(name)=>{const v=process.env[name];if(!v)throw new Error(`${name} não configurada`);return v;};
const pool=new Pool({connectionString:must('DATABASE_URL'),ssl:process.env.DB_SSL==='false'?false:{rejectUnauthorized:true},max:2});
const storage=createClient(must('SUPABASE_URL'),must('SUPABASE_SERVICE_ROLE_KEY'),{auth:{autoRefreshToken:false,persistSession:false}}).storage.from('manu_arquivos');
const command=process.env.FFMPEG_BIN||'ffmpeg';
const enabled=process.env.MEDIA_PROCESSOR_ENABLED==='true';
const once=process.argv.includes('--once');
const pauseMs=Math.max(2000,Math.min(60000,Number(process.env.MEDIA_POLL_MS)||10000));

async function run(args){
 return new Promise((resolve,reject)=>{
  const p=spawn(command,args,{stdio:['ignore','ignore','pipe']});let err='';
  p.stderr.on('data',b=>{err=(err+b.toString()).slice(-5000)});
  p.on('error',reject);p.on('close',code=>code===0?resolve():reject(new Error(`ffmpeg saiu com código ${code}: ${err.slice(-900)}`)));
 });
}
async function claimJob(){
 const c=await pool.connect();try{
  await c.query('BEGIN');
  const r=await c.query(`SELECT id FROM public.manu_media_jobs
   WHERE ((status='pending' AND available_at<=now()) OR (status='working' AND locked_at<now()-interval '20 minutes')) AND attempts<4
   ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`);
  if(!r.rowCount){await c.query('COMMIT');return null;}
  const result=await c.query(`UPDATE public.manu_media_jobs SET status='working',attempts=attempts+1,locked_at=now()
   WHERE id=$1 RETURNING *`,[r.rows[0].id]);
  await c.query('COMMIT');return result.rows[0];
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function processJob(job){
 const dir=await mkdtemp(join(tmpdir(),'manu-media-'));
 const ext=job.source_path.toLowerCase().endsWith('.webm')?'webm':'mp4';
 const inp=join(dir,`original.${ext}`),out=join(dir,'reduced.mp4');
 const converted=job.source_path.replace(/\.(mp4|webm)$/i,'.optimized.mp4');
 if(converted===job.source_path||!/^feed\/\d+\/[0-9a-f-]+\.(mp4|webm)$/i.test(job.source_path))throw new Error('Caminho de mídia inválido');
 try{
  const {data,error}=await storage.download(job.source_path);
  if(error||!data)throw new Error(error?.message||'Mídia original não encontrada');
  const bytes=Buffer.from(await data.arrayBuffer());
  if(bytes.length>26*1024*1024)throw new Error('Tamanho inválido');
  await writeFile(inp,bytes);
  // H.264/AAC progressivo, 720p máximo e metadados removidos, preservando proporção.
  // Não truncar vídeos: duração acima de 180s é mantida sem processamento.
  const duration=await new Promise((resolve,reject)=>{
   const probe=spawn(process.env.FFPROBE_BIN||'ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',inp]);
   let str='';probe.stdout.on('data',d=>{str+=d});probe.on('error',reject);
   probe.on('close',code=>code===0?resolve(Number(str.trim())):reject(new Error('ffprobe falhou')));
  });
  if(!Number.isFinite(duration)||duration<=0||duration>180){
   await pool.query(`UPDATE public.manu_media_jobs SET status='skipped',last_error='Duração fora de 3 minutos',finished_at=now() WHERE id=$1`,[job.id]);
   return;
  }
  await run(['-hide_banner','-loglevel','error','-y','-i',inp,
   '-map','0:v:0','-map','0:a:0?','-map_metadata','-1',
   '-vf',"scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
   '-c:v','libx264','-preset','medium','-crf','27','-pix_fmt','yuv420p',
   '-c:a','aac','-b:a','96k','-movflags','+faststart',out]);
  const finalSize=(await stat(out)).size;
  if(finalSize<1000)throw new Error('Arquivo processado vazio');
  if(finalSize>=bytes.length*0.97){
   await pool.query(`UPDATE public.manu_media_jobs SET status='skipped',processed_bytes=$2,finished_at=now(),last_error=NULL WHERE id=$1`,[job.id,finalSize]);
   return;
  }
  const optimized=await readFile(out);
  const {error:upErr}=await storage.upload(converted,optimized,{contentType:'video/mp4',upsert:true,cacheControl:'3600'});
  if(upErr)throw new Error(upErr.message);
  const {data:publicUrl}=storage.getPublicUrl(converted);
  // Só atualiza se o post ainda pertence ao usuário e aponta para o arquivo de origem.
  const {rows}=await pool.query(`UPDATE public.feed_posts p SET midia_url=$1,midia_tipo='video/mp4'
   WHERE p.id=$2 AND p.autor_id=$3 AND p.midia_url LIKE '%' || $4 RETURNING p.id`,
   [publicUrl.publicUrl,job.post_id,job.usuario_id,job.source_path]);
  if(!rows.length){await storage.remove([converted]);await pool.query(`UPDATE public.manu_media_jobs SET status='skipped',last_error='Post removido',finished_at=now() WHERE id=$1`,[job.id]);return;}
  await pool.query(`UPDATE public.manu_media_jobs SET status='done',output_path=$2,processed_bytes=$3,finished_at=now(),last_error=NULL WHERE id=$1`,[job.id,converted,finalSize]);
  // Apaga original SOMENTE depois de atualizar a referência do post.
  const {error:removeErr}=await storage.remove([job.source_path]);
  if(removeErr)console.warn('Original ainda precisa ser removido:',job.id);
  console.log(`Mídia ${job.id}: ${Math.round(bytes.length/1024)} KB -> ${Math.round(finalSize/1024)} KB`);
 }finally{await rm(dir,{recursive:true,force:true});}
}
async function loop(){
 if(!enabled)throw new Error('Configure MEDIA_PROCESSOR_ENABLED=true após verificar migrations, FFmpeg e secrets');
 console.log('MANU media processor iniciado');
 do{
  let job;
  try{job=await claimJob();if(job)await processJob(job);}
  catch(e){const message=String(e?.message||e).slice(0,700);console.error('Mídia não processada:',message);
   if(job){await pool.query(`UPDATE public.manu_media_jobs SET status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,
     available_at=now()+make_interval(secs=>LEAST(3600,30*power(2,attempts)::int)),locked_at=NULL,last_error=$2 WHERE id=$1`,[job.id,message]).catch(console.error);}}
  if(!job&&!once)await sleep(pauseMs);
 }while(!once);
 await pool.end();
}
loop().catch(e=>{console.error(e.message);process.exitCode=1;pool.end().catch(()=>{});});
