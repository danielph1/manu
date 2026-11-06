import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
export const runtime='nodejs';
export const dynamic='force-dynamic';

function endpointValido(raw:unknown){
  if(typeof raw!=='string'||raw.length>2048)return false;
  try{
    const u=new URL(raw);
    const h=u.hostname.toLowerCase();
    return u.protocol==='https:' && (h==='fcm.googleapis.com' ||
      h==='updates.push.services.mozilla.com' || h==='web.push.apple.com' ||
      h.endsWith('.push.apple.com') || h.endsWith('.notify.windows.com') ||
      h.endsWith('.push.microsoft.com') || h==='push.services.mozilla.com');
  }catch{return false;}
}
export async function GET(req:NextRequest){
  const u=await requireUser(req);
  if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
  try{
    const {rows}=await query<{total:number}>(
      `SELECT COUNT(*)::int AS total FROM public.push_subscriptions WHERE usuario_id=$1 AND ativo=TRUE`,[u.id]);
    return NextResponse.json({total:rows[0]?.total||0},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Migração de push pendente'},{status:503});}
}
export async function POST(req:NextRequest){
  const u=await requireUser(req);
  if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
  try{
    const b=await req.json().catch(()=>({}));
    const endpoint=String(b.endpoint||'');
    const p256dh=String(b.keys?.p256dh||'');
    const auth=String(b.keys?.auth||'');
    if(!endpointValido(endpoint)||!/^[-_A-Za-z0-9]{60,220}$/.test(p256dh)||!/^[-_A-Za-z0-9]{12,100}$/.test(auth))
      return NextResponse.json({error:'Inscrição push inválida'},{status:400});
    const old=await queryOne<{id:number}>(`SELECT id FROM public.push_subscriptions WHERE endpoint=$1 LIMIT 1`,[endpoint]);
    if(old)await query(`UPDATE public.push_subscriptions SET usuario_id=$1,p256dh=$2,auth=$3,ativo=TRUE,updated_at=now() WHERE id=$4`,[u.id,p256dh,auth,old.id]);
    else await query(`INSERT INTO public.push_subscriptions(usuario_id,endpoint,p256dh,auth,ativo) VALUES($1,$2,$3,$4,TRUE)`,[u.id,endpoint,p256dh,auth]);
    return NextResponse.json({ok:true});
  }catch(e){console.error('[push subscribe]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Não foi possível registrar este aparelho. Verifique o SQL v18.'},{status:503});}
}
export async function DELETE(req:NextRequest){
  const u=await requireUser(req);
  if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
  const b=await req.json().catch(()=>({}));
  const endpoint=b.endpoint;
  if(!endpointValido(endpoint))return NextResponse.json({error:'Inscrição inválida'},{status:400});
  await query(`UPDATE public.push_subscriptions SET ativo=FALSE,updated_at=now() WHERE usuario_id=$1 AND endpoint=$2`,[u.id,endpoint]);
  return NextResponse.json({ok:true});
}
