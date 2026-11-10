import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {getPool} from '@/lib/db';
import {requireUser} from '@/lib/session';
import {supabaseAdmin} from '@/lib/supabase';
import {BUCKET_COLETIVO,MIDIAS,type MimeColetivo} from '@/lib/anuncio-coletivo';
export const runtime='nodejs';export const dynamic='force-dynamic';
const GESTORES=new Set(['marketing','gerente','admin','superadmin']);
export async function POST(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(!GESTORES.has(u.tipo))return NextResponse.json({error:'Acesso restrito à gestão comercial'},{status:403});
 const b=await req.json().catch(()=>null);
 const empresaId=u.tipo==='superadmin'?Number(b?.empresa_id):Number(u.empresa_id);
 if(!Number.isSafeInteger(empresaId)||empresaId<=0)return NextResponse.json({error:'Selecione uma empresa'},{status:400});
 const mime=String(b?.mime||'') as MimeColetivo;
 const max=MIDIAS[mime]?.max;
 const size=Number(b?.size);
 if(!max||!Number.isSafeInteger(size)||size<100||size>max)
  return NextResponse.json({error:'Foto JPG/PNG de até 4 MB ou vídeo MP4 de até 8 MB'},{status:400});
 const path=`coletivo/${empresaId}/${randomUUID()}.${MIDIAS[mime].ext}`;
 let etapa:'storage'|'banco'='storage';
 try{
  const {data,error}=await supabaseAdmin.storage.from(BUCKET_COLETIVO).createSignedUploadUrl(path);
  if(error||!data?.token){
   const status=String((error as {statusCode?:string|number;status?:number}|null)?.statusCode||
     (error as {status?:number}|null)?.status||'');
   const detalhe=String(error?.message||'').slice(0,240);
   console.error('[coletivo upload] storage',status,detalhe||'token ausente');
   const bucketAusente=status==='404'||/bucket.*(not found|does not exist|não existe)/i.test(detalhe);
   if(bucketAusente)return NextResponse.json({
     code:'STORAGE_BUCKET_MISSING',
     error:'Bucket privado manu_arquivos não encontrado. Crie-o em Supabase → Storage.'
   },{status:503});
   if(status==='401'||status==='403'||/unauthori[sz]ed|invalid.*(api|jwt|key)|permission denied/i.test(detalhe))
    return NextResponse.json({code:'STORAGE_CREDENTIALS',
     error:'O servidor não tem permissão no Storage. Confira SUPABASE_SERVICE_ROLE_KEY na Vercel e faça Redeploy.'},
     {status:503});
   return NextResponse.json({code:'STORAGE_SIGNED_UPLOAD',
    error:'Supabase Storage recusou o upload assinado. Consulte os logs [coletivo upload] na Vercel.'},
    {status:503});
  }
  etapa='banco';
  const db=await getPool().connect();
  try{
   await db.query('BEGIN');
   const {rows}=await db.query<{id:number}>(`INSERT INTO public.aurox_coletivo_midia
    (empresa_id,criado_por,path,mime,bytes_esperados)
    SELECT $1,$2,$3,$4,$5 FROM public.empresas WHERE id=$1 AND ativo=TRUE RETURNING id`,
    [empresaId,u.id,path,mime,size]);
   if(!rows[0]){await db.query('ROLLBACK');return NextResponse.json({error:'Empresa inativa ou inexistente'},{status:403});}
   await db.query('COMMIT');
   return NextResponse.json({id:rows[0].id,path,token:data.token},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 }catch(e){
  const erro=e as {code?:string;message?:string};
  const codigo=String(erro?.code||'');
  const detalhe=String(erro?.message||'').slice(0,300);
  console.error('[coletivo upload]',{etapa,codigo,detalhe});
  if(etapa==='banco'&&(codigo==='42P01'||codigo==='42703'))return NextResponse.json({
    code:'DB_MIGRATION_MISSING',
    error:'A tabela ou coluna de mídia coletiva está ausente. Execute a migration 202611090004_anuncio_coletivo.sql no Supabase.'
  },{status:503});
  if(etapa==='banco'&&(codigo==='53300'||/EMAXCONNSESSION|too many clients|remaining connection slots/i.test(detalhe)))
   return NextResponse.json({code:'DB_CONNECTIONS_EXHAUSTED',
    error:'Banco sem conexões disponíveis. Verifique DATABASE_POOLER_URL (Transaction, porta 6543), limites de pool e logs.'},
    {status:503});
  return NextResponse.json({code:etapa==='banco'?'DB_UPLOAD_METADATA':'STORAGE_UNAVAILABLE',
    error:etapa==='banco'?'Falha ao registrar mídia no banco. Consulte [coletivo upload] nos logs da Vercel.':
     'Falha de comunicação com Supabase Storage. Consulte [coletivo upload] nos logs da Vercel.'},
    {status:503});
 }
}
