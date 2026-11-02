import { NextRequest,NextResponse } from 'next/server';
import { query,queryOne,getPool } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Após a migration o feed exige foto ou vídeo; posts textuais históricos são preservados.
export async function GET(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 try{
  const {rows}=await query(`SELECT p.id,p.autor_id,p.texto,p.midia_url,p.midia_tipo,COALESCE(p.views,0) AS views,
   COALESCE(p.likes,0) AS likes,p.created_at,u.nome AS autor_nome,u.login AS autor_login,u.foto_url AS autor_foto,
   EXISTS(SELECT 1 FROM public.feed_likes fl WHERE fl.post_id=p.id AND fl.usuario_id=$1) AS eu_curti,
   (SELECT count(*)::int FROM public.feed_comentarios c WHERE c.post_id=p.id) AS comentarios
   FROM public.feed_posts p LEFT JOIN public.usuarios u ON u.id=p.autor_id
   WHERE COALESCE(p.ativo,TRUE)=TRUE ORDER BY p.created_at DESC LIMIT 100`,[u.id]);
  return NextResponse.json(rows,{headers:{'Cache-Control':'no-store'}});
 }catch(e:any){return NextResponse.json({error:e?.message||'Feed não disponível. Execute a migration do feed.'},{status:500});}
}
export async function POST(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 const b=await req.json().catch(()=>null);
 const path=String(b?.path||'');const texto=String(b?.texto||'').trim().slice(0,1000);
 if(!path.startsWith(`feed/${u.id}/`))return NextResponse.json({error:'Arquivo não autorizado'},{status:403});
 const client=await getPool().connect();
 try{
  const ticket=await queryOne<{tipo:string,usado_em:string|null}>(`SELECT tipo,usado_em FROM public.feed_upload_tickets WHERE usuario_id=$1 AND path=$2`,[u.id,path]);
  if(!ticket || ticket.usado_em)return NextResponse.json({error:'Arquivo não autorizado ou já publicado'},{status:403});
  // Arquivo existe no bucket? NÃO confiar no caminho enviado pelo navegador.
  const {data:files,error:err}=await supabaseAdmin.storage.from('manu_arquivos').list(path.substring(0,path.lastIndexOf('/')), {search:path.split('/').pop(),limit:10});
  const uploaded=files?.find(f=>f.name===path.split('/').pop());
  if(err||!uploaded) return NextResponse.json({error:'Envie o arquivo antes de publicar'},{status:400});
  const bytes=Number(uploaded.metadata?.size||0);
  if(bytes<100 || bytes>(ticket.tipo.startsWith('video')?25:1)*1024*1024)
    return NextResponse.json({error:'Arquivo maior que o permitido ou não verificado pelo Storage'},{status:400});
  const {data:url}=supabaseAdmin.storage.from('manu_arquivos').getPublicUrl(path);
  await client.query('BEGIN');
  const used=await client.query(`UPDATE public.feed_upload_tickets SET usado_em=now() WHERE path=$1 AND usuario_id=$2 AND usado_em IS NULL RETURNING path`,[path,u.id]);
  if(!used.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Arquivo já utilizado'},{status:409});}
  const {rows:[post]}=await client.query(`INSERT INTO public.feed_posts(autor_id,texto,midia_url,midia_tipo) VALUES($1,$2,$3,$4) RETURNING *`,[u.id,texto||null,url.publicUrl,ticket.tipo]);
  if(ticket.tipo.startsWith('video/')) {
   // Trabalho em fila: conversão FFmpeg ocorre em worker separado, jamais no request da Vercel.
   // Se a migration da fila não existir, NÃO confirma a publicação de vídeo silenciosamente.
   await client.query(`INSERT INTO public.manu_media_jobs(post_id,usuario_id,source_path,original_bytes)
     VALUES($1,$2,$3,$4)`,[post.id,u.id,path,bytes]);
  }
  await client.query('COMMIT');return NextResponse.json(post,{status:201});
 }catch(e:any){await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({error:e?.message||'Falha ao publicar'},{status:500});}
 finally{client.release();}
}
