import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';

/** 1 telefone = 1 lead (ou 1 triagem). Mensagens extras só entram no chat. */

function normTel(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d;
}

function chaveTel(d: string): string {
  const n = normTel(d);
  if (n.length >= 9) return n.slice(-9);
  if (n.length >= 8) return n.slice(-8);
  return n;
}

function texto(b: any): string {
  if (!b) return '';
  if (typeof b.text === 'string') return b.text;
  if (b.text?.message) return String(b.text.message);
  if (b.body) return String(b.body);
  if (b.message) return String(b.message);
  if (b.sticker || b.type === 'sticker' || b.messageType === 'sticker') return '[figurinha]';
  if (b.audio || b.messageType === 'audio') return '[áudio]';
  if (b.video || b.messageType === 'video') return '[vídeo]';
  if (b.document || b.messageType === 'document') return '[documento]';
  if (b.image || b.messageType === 'image') return b.image?.caption ? String(b.image.caption) : '[imagem]';
  return '';
}

function telefone(b: any): string {
  return normTel(b.phone || b.phoneNumber || b.senderPhone || b.from || '');
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'z-api webhook' });
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    if (b.type && /status|connected|disconnected|presence/i.test(String(b.type))) {
      return NextResponse.json({ ok: true, ignored: 'status' });
    }
    if (b.isGroup === true) return NextResponse.json({ ok: true, ignored: 'group' });

    const fromMe = b.fromMe === true;
    const nome =
      String(b.senderName || b.chatName || b.notification || b.pushName || '').trim() || 'WhatsApp';
    const tel = telefone(b);
    const chave = chaveTel(tel);
    const msg = texto(b).slice(0, 2000) || '[mensagem]';
    if (!chave) return NextResponse.json({ ok: true, ignored: 'sem telefone' });

    let lead: any = null;
    try {
      lead = await queryOne(
        `SELECT id, vendedor_id, COALESCE(nome_completo, nome_lead) AS nome
         FROM public.leads
         WHERE REPLACE(REPLACE(REPLACE(COALESCE(telefone,''),'-',''),' ',''),'+','') LIKE $1
         ORDER BY id DESC LIMIT 1`,
        [`%${chave.slice(-8)}%`],
      );
    } catch { /* ok */ }

    if (lead?.id) {
      let chatId = null;
      try {
        let remetenteId = null;
        if (fromMe && lead.vendedor_id) {
          const vu = await queryOne(`SELECT id FROM public.usuarios WHERE vendedor_id = $1 LIMIT 1`, [lead.vendedor_id]);
          remetenteId = vu?.id || null;
        }
        const row = await queryOne(
          `INSERT INTO public.chat_geral_mensagens (remetente_id, mensagem, lead_id)
           VALUES ($1,$2,$3) RETURNING id`,
          [remetenteId, msg, lead.id],
        );
        chatId = row?.id;
      } catch (e) {
        console.error('chat insert', e);
      }
      if (!fromMe) {
        try {
          const ids: number[] = [];
          if (lead.vendedor_id) {
            const vu = await queryOne(`SELECT id FROM public.usuarios WHERE vendedor_id = $1 LIMIT 1`, [lead.vendedor_id]);
            if (vu?.id) ids.push(vu.id);
          }
          const { rows: admins } = await query(
            `SELECT id FROM public.usuarios WHERE LOWER(tipo) IN ('admin','gerente','marketing') AND COALESCE(ativo,TRUE)`,
          );
          for (const a of admins || []) ids.push(a.id);
          for (const id of [...new Set(ids)]) {
            await query(
              `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem) VALUES ($1,'chat',$2,$3)`,
              [id, `WhatsApp · ${lead.nome || nome}`, msg.slice(0, 100)],
            );
          }
        } catch { /* ok */ }
      }
      return NextResponse.json({ ok: true, lead_id: lead.id, chat_id: chatId, acao: 'mensagem_no_lead' });
    }

    if (fromMe) return NextResponse.json({ ok: true, ignored: 'fromMe sem lead' });

    let triagem: any = null;
    try {
      triagem = await queryOne(
        `SELECT id FROM public.triagem
         WHERE REPLACE(REPLACE(REPLACE(COALESCE(telefone,''),'-',''),' ',''),'+','') LIKE $1
         ORDER BY id DESC LIMIT 1`,
        [`%${chave.slice(-8)}%`],
      );
    } catch { /* ok */ }

    if (triagem?.id) {
      try {
        await query(
          `UPDATE public.triagem
           SET mensagem = COALESCE(mensagem,'') || E'\n' || $1,
               nome = CASE WHEN COALESCE(nome,'') IN ('','WhatsApp','Sem nome') THEN $2 ELSE nome END
           WHERE id = $3`,
          [msg.slice(0, 500), nome, triagem.id],
        );
      } catch { /* ok */ }
      return NextResponse.json({ ok: true, triagem_id: triagem.id, acao: 'atualizou_triagem' });
    }

    const row = await queryOne(
      `INSERT INTO public.triagem (nome, telefone, email, interesse, origem, mensagem)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [nome, tel || chave, null, null, 'whatsapp', msg],
    );
    try {
      const { rows: admins } = await query(
        `SELECT id FROM public.usuarios WHERE LOWER(tipo) IN ('admin','gerente','marketing') AND COALESCE(ativo,TRUE)`,
      );
      for (const a of admins || []) {
        await query(
          `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem) VALUES ($1,'lead','Lead WhatsApp',$2)`,
          [a.id, `${nome} · ${tel || chave} · ${msg.slice(0, 80)}`],
        );
      }
    } catch { /* ok */ }

    return NextResponse.json({ ok: true, triagem_id: row?.id, acao: 'nova_triagem' });
  } catch (e: any) {
    console.error('zapi webhook', e);
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}
