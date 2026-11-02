import { NextRequest,NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase';
export const runtime='nodejs';
const TYPES:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'};
// Video vai DIRETO ao Storage: não passa pelo limite de payload da função Vercel.
export async function POST(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 const b=await req.json().catch(()=>null);
 const tipo=String(b?.tipo||'');const size=Number(b?.size||0);
 if(!TYPES[tipo]||!Number.isSafeInteger(size)||size<100||size>(tipo.startsWith('video')?25:1)*1024*1024)
  return NextResponse.json({error:'Imagem até 1MB ou vídeo MP4/WebM até 25MB. Comprima antes de enviar.'},{status:400});
 const path=`feed/${u.id}/${randomUUID()}.${TYPES[tipo]}`;
 try{
  const {data,error}=await supabaseAdmin.storage.from('manu_arquivos').createSignedUploadUrl(path);
  if(error||!data?.token)throw new Error(error?.message||'Não foi possível autorizar upload');
  await query(`INSERT INTO public.feed_upload_tickets(usuario_id,path,tipo) VALUES($1,$2,$3)`,[u.id,path,tipo]);
  return NextResponse.json({path,token:data.token},{headers:{'Cache-Control':'no-store'}});
 }catch(e:any){return NextResponse.json({error:e?.message||'Falha no Storage (verifique bucket manu_arquivos e migration)'},{status:500});}
}
