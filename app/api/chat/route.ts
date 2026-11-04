import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { leadAcessivel } from '@/lib/lead-access';
import { notificar } from '@/lib/notify';
import { enviarWhatsAppDaEmpresa } from '@/lib/zapi-empresa';
import { sendAuroxMessage } from '@/lib/aurox-whatsapp/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function idLead(value: unknown): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });
  const leadId = idLead(req.nextUrl.searchParams.get('lead_id'));
  if (!leadId) return NextResponse.json({ error: 'Selecione um lead para consultar o chat.' }, { status: 400 });
  try {
    const lead = await leadAcessivel(u, leadId);
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado nesta empresa ou sem permissão.' }, { status: 403 });
    const { rows } = await query(
      `SELECT m.id, m.mensagem, m.created_at, m.remetente_id, m.lead_id,
          CASE WHEN m.mensagem ILIKE 'Transferido de %' THEN 'Sistema'
            WHEN m.remetente_id IS NULL THEN COALESCE(NULLIF(TRIM(l.nome_lead), ''), 'Cliente')
            ELSE COALESCE(usr.nome,usr.login,'Equipe') END AS remetente_nome,
          CASE WHEN m.mensagem ILIKE 'Transferido de %' THEN 'sistema'
            WHEN m.remetente_id IS NULL THEN 'cliente' ELSE 'equipe' END AS remetente_tipo,
          m.arquivo_nome, m.arquivo_mime,
          CASE WHEN wam.media_path IS NOT NULL AND wc.id IS NOT NULL
                AND (wc.lead_id=m.lead_id OR wt.lead_id=m.lead_id)
                AND wam.empresa_id=COALESCE(l.empresa_id,v.empresa_id)
            THEN m.id ELSE NULL END AS aurox_media_chat_id,
          CASE WHEN wam.media_path IS NOT NULL AND wc.id IS NOT NULL
                AND (wc.lead_id=m.lead_id OR wt.lead_id=m.lead_id)
                AND wam.empresa_id=COALESCE(l.empresa_id,v.empresa_id)
            THEN wam.media_mime ELSE NULL END AS aurox_media_mime,
          CASE WHEN m.arquivo_bytes IS NOT NULL THEN encode(m.arquivo_bytes, 'base64') ELSE NULL END AS arquivo_b64
       FROM public.chat_geral_mensagens m
       LEFT JOIN public.usuarios usr ON usr.id=m.remetente_id
       JOIN public.leads l ON l.id=m.lead_id
       LEFT JOIN public.vendedores v ON v.id=l.vendedor_id
       LEFT JOIN public.aurox_wa_mensagens wam ON wam.id=m.aurox_wa_mensagem_id
       LEFT JOIN public.aurox_wa_contatos wc ON wc.id=wam.contato_id AND wc.empresa_id=wam.empresa_id
       LEFT JOIN public.triagem wt ON wt.id=wc.triagem_id AND wt.empresa_id=wc.empresa_id
       WHERE m.lead_id=$1 ORDER BY m.created_at ASC LIMIT 500`, [leadId],
    );
    let reacoes: Array<{ mensagem_id: number; emoji: string; n: number; eu: boolean }> = [];
    try {
      const r = await query<typeof reacoes[number]>(
        `SELECT mensagem_id, emoji, COUNT(*)::int AS n, BOOL_OR(usuario_id=$2) AS eu
           FROM public.chat_geral_reacoes WHERE mensagem_id=ANY($1::int[])
          GROUP BY mensagem_id, emoji`, [rows.map((m: any) => m.id), u.id],
      );
      reacoes = r.rows;
    } catch { /* reações opcionais */ }
    const porMensagem = new Map<number, typeof reacoes>();
    for (const r of reacoes) porMensagem.set(r.mensagem_id, [...(porMensagem.get(r.mensagem_id) || []), r]);
    return NextResponse.json(rows.map((m: any) => ({ ...m, reacoes: porMensagem.get(m.id) || [] })),
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e: any) {
    console.error('[chat GET]', e?.code || '', e?.message || 'erro');
    return NextResponse.json({ error: e?.code === '42703'
      ? 'Colunas de anexos do chat ausentes. Execute a migration 202611030001 no Supabase.'
      : 'Erro ao consultar mensagens. Confira a tabela chat_geral_mensagens.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });
  try {
    const b = await req.json().catch(() => null);
    const leadId = idLead(b?.lead_id);
    if (!leadId) return NextResponse.json({ error: 'Selecione o lead antes de enviar a mensagem.' }, { status: 400 });
    const lead = await leadAcessivel(u, leadId);
    if (!lead) return NextResponse.json({ error: 'Sem acesso ao lead desta empresa.' }, { status: 403 });
    const msg = String(b.mensagem || '').trim();
    const b64 = b.arquivo_b64 ? String(b.arquivo_b64) : null;
    if (!msg && !b64) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
    if (msg.length > 8000) return NextResponse.json({ error: 'Mensagem excede 8.000 caracteres.' }, { status: 400 });
    if (b64 && (b64.length > 5_500_000 || !/^[A-Za-z0-9+/=]+$/.test(b64))) {
      return NextResponse.json({ error: 'Arquivo maior que 4 MB ou inválido.' }, { status: 413 });
    }
    const mime = String(b.arquivo_mime || '').slice(0, 100) || null;
    const nome = String(b.arquivo_nome || '').slice(0, 150) || null;
    // A legenda só é interna; nunca enviar as palavras 'Áudio'/'Foto' ao cliente.
    const mimeBase = (mime || '').toLowerCase().split(';')[0].trim();
    const mediaPermitida = /^(image\/(jpeg|png|webp)|audio\/(ogg|mpeg|mp4|aac|webm))$/.test(mimeBase);
    if (b64 && !mediaPermitida) return NextResponse.json({ error: 'Apenas fotos e áudios são permitidos. Vídeos não são suportados.' }, { status: 415 });
    if (b64 && mimeBase.startsWith('audio/') && msg) return NextResponse.json({ error: 'Envie o áudio e o texto separadamente.' }, { status: 400 });
    if (b64 && Buffer.from(b64,'base64').length > 4_000_000)
      return NextResponse.json({ error: 'Arquivo ultrapassa 4 MB.' }, { status: 413 });
    const texto = msg || (mimeBase.startsWith('audio/') ? '[Áudio]' : '[Foto]');
    const row = await queryOne<any>(
      `INSERT INTO public.chat_geral_mensagens
          (remetente_id, mensagem, arquivo_nome, arquivo_mime, arquivo_bytes, lead_id)
       VALUES ($1, $2, $3, $4, CASE WHEN $5::text IS NULL THEN NULL ELSE decode($5::text, 'base64') END, $6)
       RETURNING id, mensagem, created_at, remetente_id, arquivo_nome, arquivo_mime`,
      [u.id, texto, nome, mime, b64, leadId],
    );
    // Priorizar Aurox-WhatsApp desta empresa, inclusive para leads manuais.
    // Sem sessão Aurox habilitada, manter Z-API legada; falha no Aurox não autoriza fallback.
    let whatsapp: {ok:boolean;status:string;message:string};
    if (/^\[interno\]/i.test(msg)) {
      // Observações de atendimento são PRIVADAS e nunca devem sair para o cliente.
      whatsapp = {ok:true,status:'internal_only',message:'Observação registrada apenas no MANU.'};
    } else if (b64) {
      // Nunca converter mídia em texto nem alternar para Z-API silenciosamente.
      whatsapp = lead.empresaId
        ? await sendAuroxMessage(lead.empresaId, leadId, msg, lead.telefone, {
            base64: b64, mime: mime || '', filename: nome || undefined,
          })
        : {ok:false,status:'invalid_scope',message:'Lead sem empresa; arquivo salvo apenas no MANU.'};
    } else if (msg && lead.empresaId) {
      const aurox = await sendAuroxMessage(lead.empresaId, leadId, msg, lead.telefone);
      whatsapp = aurox.routed ? aurox : await enviarWhatsAppDaEmpresa(lead.empresaId,String(lead.telefone || ''),msg);
    } else {
      whatsapp = {ok:false,status:'not_configured',message:'Mensagem salva no MANU; envio externo indisponível.'};
    }
    if (lead.empresaId) {
      notificar({ titulo: 'Nova mensagem no chat', mensagem: `${u.nome || u.login}: ${texto.slice(0, 80)}`,
        tipo: 'chat', broadcast: true, empresa_id: lead.empresaId, url: `/chat?lead=${leadId}` }).catch(() => {});
    }
    return NextResponse.json({ ...row, remetente_nome: u.nome || u.login, arquivo_b64: b64,
      reacoes: [], whatsapp, salvo_no_manu: true });
  } catch (e: any) {
    console.error('[chat POST]', e?.code || '', e?.message || 'erro');
    const migration = e?.code === '42703' || e?.code === '42P01';
    return NextResponse.json({ error: migration
      ? 'Estrutura do chat incompleta. Execute a migration 202611030001 e confira as tabelas.'
      : 'Não foi possível gravar a mensagem no MANU. Confira os logs do servidor e o banco.' }, { status: 500 });
  }
}
