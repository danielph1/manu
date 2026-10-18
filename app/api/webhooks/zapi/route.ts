import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Webhook Z-API — Ao receber mensagem
 * No Z-API, campo "Ao receber":
 *   https://manu-manu-automoveis.vercel.app/api/webhooks/zapi
 *
 * Env no Vercel (opcional):
 *   ZAPI_INSTANCE_ID, ZAPI_TOKEN
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

    // ignora status / presença / mensagens enviadas por você / grupos
    if (b.type && /status|connected|disconnected|presence/i.test(String(b.type))) {
      return NextResponse.json({ ok: true, ignored: 'status' });
    }
    if (b.fromMe === true || b.isGroup === true) {
      return NextResponse.json({ ok: true, ignored: 'fromMe/group' });
    }

    const nome =
      String(b.senderName || b.chatName || b.notification || b.pushName || '').trim() ||
      'WhatsApp';
    const tel = telefone(b);
    const msg = texto(b).slice(0, 2000);

    if (!tel && !msg) {
      return NextResponse.json({ ok: true, ignored: 'sem telefone/mensagem' });
    }

    // evita duplicar o mesmo telefone em menos de 2 minutos
    if (tel) {
      try {
        const recente = await queryOne(
          `SELECT id FROM public.triagem
           WHERE REPLACE(REPLACE(COALESCE(telefone,''),'-',''),' ','') LIKE $1
             AND created_at > now() - interval '2 minutes'
           LIMIT 1`,
          [`%${tel.slice(-9)}%`],
        );
        if (recente?.id) {
          return NextResponse.json({ ok: true, existente: recente.id });
        }
      } catch {
        /* ok */
      }
    }

    const row = await queryOne(
      `INSERT INTO public.triagem (nome, telefone, email, interesse, origem, mensagem)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [nome, tel || null, null, null, 'whatsapp', msg || null],
    );

    // notifica admin / gerente / marketing
    try {
      const { rows: admins } = await query(
        `SELECT id FROM public.usuarios
         WHERE LOWER(tipo) IN ('admin','gerente','marketing') AND COALESCE(ativo,TRUE)`,
      );
      for (const a of admins || []) {
        await query(
          `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem)
           VALUES ($1,'lead','Lead WhatsApp',$2)`,
          [a.id, `${nome} · ${tel || 'sem tel'} · ${(msg || '').slice(0, 80)}`],
        );
      }
    } catch {
      /* ok */
    }

    return NextResponse.json({ ok: true, triagem_id: row?.id });
  } catch (e: any) {
    console.error('zapi webhook', e);
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}
