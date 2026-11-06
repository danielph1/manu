import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { dispatchAuroxPush } from '@/lib/push/dispatch';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function authorized(req:NextRequest){
  const supplied=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
  const expected=process.env.PUSH_DISPATCH_SECRET||process.env.CRON_SECRET||'';
  if (!expected || !supplied || supplied.length!==expected.length)return false;
  return timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
}
export async function GET(req:NextRequest){
  if(!authorized(req))return NextResponse.json({error:'Não autorizado'},{status:401});
  try {return NextResponse.json({ok:true,...await dispatchAuroxPush(35)},{headers:{'Cache-Control':'no-store'}});}
  catch(e){console.error('[push cron]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Falha no despacho. Confira migrations e VAPID.'},{status:503});}
}
