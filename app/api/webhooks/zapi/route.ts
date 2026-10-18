import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Webhook Z-API — Ao receber
 * URL: https://SEU-DOMINIO.vercel.app/api/webhooks/zapi
 *
 * 1) acha lead pelo telefone (ou cria triagem)
 * 2) grava mensagem em chat_geral_mensagens com lead_id
 * 3) notifica vendedor / admin
 */

function texto(b: any): string {
  if (!b) return '';
  if (typeof b.text === 'string') return b.text;
  if (b.text?.message) return String(b.text.message);
  if (b.body) return String(b.body);
  if (b.message) return String(b.message);
  if (b.mensagem) return String(b.mensagem);
  if (b.image?.caption) return String(b.image.caption);
  if (b.audio) return '[áudio]';
  if (b.video) return '[vídeo]';
  if (b.document) return '[documento]';
  return '';
}

function telefone(b: any): string {
  const raw = String(b.phone || b.phoneNumber || b.senderPhone || b.from || '').replace(/\D/g, '');
  if (raw.startsWith('55') && raw.length >= 12) return raw.slice(2);
  return raw;
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
    const fromMe = b.fromMe === true;
    if (b.isGroup === true) {
      return NextResponse.json({ ok: true, ignored: 'group' });
    }

    const nome =
      String(b.senderName || b.chatName || b.notification || b.pushName || '').trim() ||
      'WhatsApp';
    const tel = telefone(b);
    const msg = texto(b).slice(0, 2000);

    if (!tel && !msg) {
      return NextResponse.json({ ok: true, ignored: 'sem telefone/mensagem' });
    }

    // lead pelo telefone
    let lead: any = null;
    if (tel) {
      try {
        lead = await queryOne(
          `SELECT id, vendedor_id, COALESCE(nome_completo, nome_lead) AS nome
           FROM public.leads
           WHERE REPLACE(REPLACE(COALESCE(telefone,''),'-',''),' ','') LIKE $1
           ORDER BY id DESC LIMIT 1`,
          [`%${tel.slice(-9)}%`],
        );
      } catch { /* ok */ }
    }

    // sem lead e não é fromMe → triagem
    if (!lead && !fromMe) {
      try {
        const recente = tel
          ? await queryOne(
              `SELECT id FROM public.triagem
               WHERE REPLACE(REPLACE(COALESCE(telefone,''),'-',''),' ','') LIKE $1
                 AND created_at > now() - interval '2 minutes'
               LIMIT 1`,
              [`%${tel.slice(-9)}%`],
            )
          : null;
        if (!recente?.id) {
          await queryOne(
            `INSERT INTO public.triagem (nome, telefone, email, interesse, origem, mensagem)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [nome, tel || null, null, null, 'whatsapp', msg || null],
          );
        }
      } catch { /* ok */ }
    }

    // com lead → grava no chat
    let chatId = null;
    if (lead?.id && msg) {
      try {
        let remetenteId = null;
        if (fromMe && lead.vendedor_id) {
          const vendUser = await queryOne(
            `SELECT id FROM public.usuarios WHERE vendedor_id = $1 LIMIT 1`,
            [lead.vendedor_id],
          );
          remetenteId = vendUser?.id || null;
        }
        const row = await queryOne(
          `INSERT INTO public.chat_geral_mensagens (remetente_id, mensagem, lead_id)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [remetenteId, msg, lead.id],
        );
        chatId = row?.id;
      } catch (e) {
        console.error('chat insert', e);
      }
    }

    if (!fromMe) {
      try {
        const ids: number[] = [];
        if (lead?.vendedor_id) {
          const vu = await queryOne(`SELECT id FROM public.usuarios WHERE vendedor_id = $1 LIMIT 1`, [lead.vendedor_id]);
          if (vu?.id) ids.push(vu.id);
        }
        const { rows: admins } = await query(
          `SELECT id FROM public.usuarios
           WHERE LOWER(tipo) IN ('admin','gerente','marketing') AND COALESCE(ativo,TRUE)`,
        );
        for (const a of admins || []) ids.push(a.id);
        for (const id of [...new Set(ids)]) {
          await query(
            `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem)
             VALUES ($1,'chat',$2,$3)`,
            [id, lead ? `WhatsApp · ${lead.nome || nome}` : 'Lead WhatsApp', (msg || '').slice(0, 100)],
          );
        }
      } catch { /* ok */ }
    }

    return NextResponse.json({ ok: true, lead_id: lead?.id || null, chat_id: chatId });
  } catch (e: any) {
    console.error('zapi webhook', e);
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}
