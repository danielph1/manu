import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { leadAcessivel } from '@/lib/lead-access';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Eventos auditaveis de contato. Abrir um link NAO comprova envio. */
export async function POST(req:NextRequest) {
  const usuario = await requireUser(req);
  if(!usuario) return NextResponse.json({error:'Não autenticado'},{status:401});
  const b=await req.json().catch(()=>null);
  const leadId=Number(b?.lead_id);
  const acao=String(b?.acao||'');
  if(!Number.isSafeInteger(leadId)||leadId<=0 || !['abrir_whatsapp','marcar_lidas'].includes(acao))
    return NextResponse.json({error:'Evento inválido'},{status:400});
  const lead=await leadAcessivel(usuario,leadId);
  if(!lead || !lead.empresaId) return NextResponse.json({error:'Lead fora do escopo da empresa'},{status:403});
  try {
    if(acao==='abrir_whatsapp') {
      // Limita notificações duplicadas ao apertar várias vezes no link.
      const {rows}=await query<{id:number}>(`INSERT INTO public.manu_lead_acoes_contato
         (empresa_id,lead_id,usuario_id,acao)
         SELECT $1,$2,$3,'abrir_whatsapp' WHERE NOT EXISTS(
           SELECT 1 FROM public.manu_lead_acoes_contato
           WHERE empresa_id=$1 AND lead_id=$2 AND usuario_id=$3 AND acao='abrir_whatsapp'
             AND registrado_em>now()-interval '2 minutes'
         ) RETURNING id`,[lead.empresaId,leadId,usuario.id]);
      if(rows.length) {
        const responsavel=String(usuario.nome||usuario.login||'Colaborador').slice(0,90);
        await notificar({titulo:'Tentativa de contato pelo WhatsApp',
          mensagem:`${responsavel} abriu o WhatsApp para contatar o lead #${leadId}. O envio externo ainda não foi confirmado.`,
          tipo:'lead',empresa_id:lead.empresaId,tipos:['admin','gerente']});
      }
      return NextResponse.json({ok:true,registrado:rows.length>0,atendido:false},
        {headers:{'Cache-Control':'private, no-store'}});
    }
    const ate=Number(b?.ate_mensagem_id);
    if(!Number.isSafeInteger(ate)||ate<=0)
      return NextResponse.json({error:'Mensagem de leitura inválida'},{status:400});
    // Um ID forjado de outro lead nao pode marcar leitura de mensagens de outra empresa.
    const {rows}=await query<{id:number}>(`SELECT MAX(m.id)::bigint AS id
      FROM public.chat_geral_mensagens m
      WHERE m.lead_id=$1 AND m.id<=$2 AND m.remetente_id IS NULL
        AND m.mensagem NOT ILIKE 'Transferido de %'`,[leadId,ate]);
    const leitura=Number(rows[0]?.id||0);
    if(leitura<=0) return NextResponse.json({ok:true,lido_ate:0});
    await query(`INSERT INTO public.manu_lead_atendimento_estado
      (lead_id,empresa_id,ultimo_cliente_id,ultimo_lido_id)
      SELECT l.id,l.empresa_id,
         COALESCE((SELECT MAX(m.id) FROM public.chat_geral_mensagens m
           WHERE m.lead_id=l.id AND m.remetente_id IS NULL AND m.mensagem NOT ILIKE 'Transferido de %'),0),
         $3
      FROM public.leads l WHERE l.id=$1 AND l.empresa_id=$2
      ON CONFLICT(lead_id) DO UPDATE SET
        ultimo_cliente_id=GREATEST(manu_lead_atendimento_estado.ultimo_cliente_id,EXCLUDED.ultimo_cliente_id),
        ultimo_lido_id=GREATEST(manu_lead_atendimento_estado.ultimo_lido_id,EXCLUDED.ultimo_lido_id),
        atualizado_em=now()`,[leadId,lead.empresaId,leitura]);
    // Ler somente nao marca automaticamente atendido. Isso exige envio confirmado.
    return NextResponse.json({ok:true,lido_ate:leitura,atendido_automaticamente:false},
      {headers:{'Cache-Control':'private, no-store'}});
  }catch(e){
    console.error('[lead atendimento]',e instanceof Error?e.message:'erro');
    return NextResponse.json({error:'Registro de atendimento indisponível; confira a migration.'},{status:503});
  }
}
