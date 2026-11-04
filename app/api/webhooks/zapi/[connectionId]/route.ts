import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { validarZapiAssinatura } from '@/lib/zapi-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
function phone(value: unknown) {
  const d = digits(String(value || '').split('@')[0]);
  return d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
}
function texto(b: any) {
  return String(typeof b.text === 'string' ? b.text : b.text?.message ||
    (typeof b.message === 'string' ? b.message : b.message?.text) ||
    b.image?.caption || b.body || (b.image ? '[imagem]' : b.audio ? '[áudio]' : b.video ? '[vídeo]' : '[mensagem]')).slice(0, 2000);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  let novoEvento: number | null = null;
  try {
    const { connectionId } = await params;
    const sig = req.nextUrl.searchParams.get('sig') || '';
    if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return NextResponse.json({ error: 'conexão inválida' }, { status: 403 });
    const owners = await query<{ id: string; empresa_id: number; external_id: string; status: string; meta: any }>(
      `SELECT id, empresa_id, external_id, status, meta FROM public.manu_conexoes_oauth
        WHERE id=$1 AND provedor='whatsapp_qr'`, [connectionId],
    );
    const conn = owners.rows[0];
    if (!conn || conn.status !== 'conectado' || conn.meta?.webhook_registered !== true ||
        !validarZapiAssinatura(connectionId, conn.external_id, sig)) {
      return NextResponse.json({ error: 'webhook não autorizado' }, { status: 403 });
    }
    const duplicate = await query<{ empresa_id: number }>(
      `SELECT DISTINCT empresa_id FROM public.manu_conexoes_oauth
        WHERE provedor='whatsapp_qr' AND external_id=$1 AND status='conectado'`, [conn.external_id],
    );
    if (duplicate.rows.length !== 1 || Number(duplicate.rows[0].empresa_id) !== Number(conn.empresa_id)) {
      return NextResponse.json({ error: 'instância com vínculo de empresa conflitante' }, { status: 409 });
    }
    const raw = await req.text();
    if (raw.length > 125_000) return NextResponse.json({ error: 'payload muito grande' }, { status: 413 });
    const b = JSON.parse(raw);
    if (String(b.instanceId || conn.external_id) !== String(conn.external_id)) return NextResponse.json({ error: 'instância não confere' }, { status: 403 });
    if (b.isGroup || b.isNewsletter || b.broadcast) return NextResponse.json({ ok: true, ignored: 'grupo' });
    const tipo = String(b.type || '').toLowerCase();
    if (tipo && tipo !== 'receivedcallback') return NextResponse.json({ ok: true, ignored: 'evento de status' });
    if (b.fromMe) return NextResponse.json({ ok: true, ignored: 'mensagem própria' });
    const tel = phone(b.phone || b.senderPhone || b.from || b.chatId || '');
    if (tel.length < 10) return NextResponse.json({ ok: true, ignored: 'telefone inválido' });
    const nome = String(b.senderName || b.chatName || 'WhatsApp').slice(0, 200);
    const mensagem = texto(b);
    const messageId = String(b.messageId || b.zaapId || '').slice(0, 160);
    if (!messageId) return NextResponse.json({ error: 'messageId obrigatório para evitar duplicação' }, { status: 400 });
    // Deduplicação atômica por conexão e ID da mensagem.
    const ev = await queryOne<{ id: number }>(
      `INSERT INTO public.manu_zapi_eventos(conexao_id, empresa_id, mensagem_id)
       VALUES ($1,$2,$3) ON CONFLICT (conexao_id, mensagem_id) DO NOTHING RETURNING id`,
      [conn.id, conn.empresa_id, messageId],
    );
    if (!ev) return NextResponse.json({ ok: true, duplicado: true });
    novoEvento = Number(ev.id);
    const lead = await queryOne<{ id: number }>(
      `SELECT l.id FROM public.leads l LEFT JOIN public.vendedores v ON v.id=l.vendedor_id
        WHERE COALESCE(l.empresa_id, v.empresa_id)=$1
          AND RIGHT(REGEXP_REPLACE(COALESCE(l.telefone,''),'[^0-9]','','g'),9)=RIGHT($2,9)
        ORDER BY l.id DESC LIMIT 1`, [conn.empresa_id, tel],
    );
    if (lead) {
      await query(`INSERT INTO public.chat_geral_mensagens(remetente_id,mensagem,lead_id)
                   VALUES (NULL,$1,$2)`, [`[cliente] ${mensagem}`, lead.id]);
      novoEvento = null;
      return NextResponse.json({ ok: true, lead_id: lead.id });
    }
    const triagem = await queryOne<{ id: number }>(
      `SELECT id FROM public.triagem WHERE empresa_id=$1 AND status='aguardando'
        AND RIGHT(REGEXP_REPLACE(COALESCE(telefone,''),'[^0-9]','','g'),9)=RIGHT($2,9)
        ORDER BY id DESC LIMIT 1`, [conn.empresa_id, tel],
    );
    if (triagem) {
      await query(`UPDATE public.triagem SET mensagem=CONCAT_WS(E'\n',NULLIF(mensagem,''),$2)
        WHERE id=$1 AND empresa_id=$3`, [triagem.id, mensagem, conn.empresa_id]);
      novoEvento = null;
      return NextResponse.json({ ok: true, triagem_id: triagem.id });
    }
    const newLead = await queryOne<{ id: number }>(
      `INSERT INTO public.triagem(empresa_id,nome,telefone,origem,mensagem,status)
       VALUES ($1,$2,$3,'whatsapp',$4,'aguardando') RETURNING id`, [conn.empresa_id,nome,tel,mensagem],
    );
    novoEvento = null;
    return NextResponse.json({ ok: true, triagem_id: newLead?.id });
  } catch (e: any) {
    if (novoEvento) {
      try { await query('DELETE FROM public.manu_zapi_eventos WHERE id=$1', [novoEvento]); } catch {}
    }
    console.error('[ZAPI WEBHOOK] falha', e?.code || '', e?.message || 'erro');
    return NextResponse.json({ error: 'erro ao processar callback da Z-API' }, { status: 500 });
  }
}
