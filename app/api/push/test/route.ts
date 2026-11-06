import {NextRequest,NextResponse} from 'next/server';
import {requireUser} from '@/lib/session';
import {query} from '@/lib/db';
import {dispatchAuroxPush} from '@/lib/push/dispatch';
export const runtime='nodejs';
export async function POST(req:NextRequest){
  const u=await requireUser(req);
  if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
  try{
    await query(`INSERT INTO public.aurox_push_outbox(usuario_id,titulo,mensagem,tipo,destino)
      VALUES($1,'Teste de notificação','Mensagem de teste no seu dispositivo','teste','/configuracoes/notificacoes')`,[u.id]);
    const result=await dispatchAuroxPush(20);
    return NextResponse.json({ok:true,despacho:result});
  }catch(e){console.error('[push test]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Falha no teste. Verifique VAPID, migração e inscrição.'},{status:503});}
}
