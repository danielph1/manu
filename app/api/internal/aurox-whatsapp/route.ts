import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { validateWorkerSignature } from '@/lib/aurox-whatsapp/security';
import { processIncoming, processOutgoing, isDirectChat } from '@/lib/aurox-whatsapp/ingest';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(req:NextRequest) {
  try {
    const raw=await req.text();
    if (raw.length>8000) return NextResponse.json({error:'Payload acima do limite'}, {status:413});
    if(!validateWorkerSignature(raw,req.headers.get('x-aurox-timestamp'),req.headers.get('x-aurox-signature')))
      return NextResponse.json({error:'Assinatura inválida'}, {status:401});
    const b=JSON.parse(raw);
    const empresaId=Number(b?.empresa_id);
    if(!Number.isSafeInteger(empresaId)||empresaId<=0||!b?.instancia_id)
      return NextResponse.json({error:'Identificador ausente'}, {status:400});
    if(b.type==='status') {
      if(!['iniciando','qr','autenticando','conectado','desconectado','erro'].includes(b.status))
        return NextResponse.json({error:'Status inválido'}, {status:400});
      const number=String(b.phone||'').replace(/\D/g,'');
      if(number && (number.length<10||number.length>15)) return NextResponse.json({error:'Número inválido'}, {status:400});
      try {
        const r=await query(`UPDATE public.aurox_wa_instancias SET status=$3,
          numero=CASE WHEN $3='conectado' THEN NULLIF($4,'') WHEN $3='desconectado' THEN NULL ELSE numero END,
          conectado_em=CASE WHEN $3='conectado' THEN now() ELSE conectado_em END,
          ultimo_erro=CASE WHEN $3='erro' THEN LEFT($5,300) ELSE NULL END, atualizado_em=now()
          WHERE empresa_id=$1 AND instancia_id=$2 AND habilitada=TRUE`,
          [empresaId,String(b.instancia_id),b.status,number,String(b.error||'')]);
        return NextResponse.json({ok:Boolean(r.rowCount)},{status:r.rowCount?200:403});
      }catch(e:any){
        if(e?.code==='23505') return NextResponse.json({error:'Número já conectado a outra empresa'}, {status:409});
        throw e;
      }
    }
    if(b.type==='outgoing') {
      if(!isDirectChat(String(b.chat_id||'')))return NextResponse.json({ok:true,ignored:true});
      if(typeof b.message_id!=='string'||typeof b.body!=='string'||typeof b.sent_at!=='number')
        return NextResponse.json({error:'Envio invalido'}, {status:400});
      const result=await processOutgoing({...b,empresa_id:empresaId});
      return NextResponse.json(result,{status:result.ok?200:403});
    }
    if(b.type==='message') {
      if(!isDirectChat(String(b.chat_id||''))) return NextResponse.json({ok:true,ignored:true});
      if(typeof b.message_id!=='string'||typeof b.body!=='string')return NextResponse.json({error:'Mensagem inválida'}, {status:400});
      const result=await processIncoming({...b,empresa_id:empresaId});
      return NextResponse.json(result,{status:result.ok?200:403});
    }
    return NextResponse.json({error:'Evento desconhecido'}, {status:400});
  } catch(e:any) {
    console.error('[aurox-whatsapp] evento rejeitado',e?.code||'',e?.message||'erro');
    return NextResponse.json({error:'Falha ao processar evento'}, {status:500});
  }
}
