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
 try{
  const {data,error}=await supabaseAdmin.storage.from(BUCKET_COLETIVO).createSignedUploadUrl(path);
  if(error||!data?.token)throw new Error(error?.message||'Upload indisponível');
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
 }catch(e){console.error('[coletivo upload]',e instanceof Error?e.message:'erro');
  return NextResponse.json({error:'Não foi possível criar o upload assinado. Confira Storage e migration.'},{status:503});}
}
