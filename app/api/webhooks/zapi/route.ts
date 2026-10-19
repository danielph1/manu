import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';

/** 1 telefone = 1 lead (ou 1 triagem). Mensagens extras só entram no chat. */

function onlyDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

function normTel(raw: string): string {
  let d = onlyDigits(raw);
  // tira 55 do país
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  // tira 0 inicial
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

/** Chaves possíveis para casar o mesmo número (8 e 9 dígitos finais) */
function chavesTel(d: string): string[] {
  const n = normTel(d);
  const out: string[] = [];
  if (n.length >= 9) out.push(n.slice(-9));
  if (n.length >= 8) out.push(n.slice(-8));
  if (n.length >= 11) out.push(n.slice(-11));
  if (n) out.push(n);
  return [...new Set(out.filter(Boolean))];
}

function texto(b: any): string {
  if (!b) return '';
  if (typeof b.text === 'string' && b.text.trim()) return b.text;
  if (b.text?.message) return String(b.text.message);
  if (typeof b.message === 'string' && b.message.trim()) return b.message;
  if (b.message?.text) return String(b.message.text);
  if (b.message?.conversation) return String(b.message.conversation);
  if (b.body) return String(b.body);
  if (b.hydratedTemplate?.message) return String(b.hydratedTemplate.message);
  const mt = String(b.messageType || b.type || '').toLowerCase();
  if (b.sticker || mt.includes('sticker')) return '[figurinha]';
  if (b.audio || mt.includes('audio')) return '[áudio]';
  if (b.video || mt.includes('video')) return '[vídeo]';
  if (b.document || mt.includes('document')) return '[documento]';
  if (b.image || mt.includes('image')) return b.image?.caption ? String(b.image.caption) : '[imagem]';
  return '';
}

function telefone(b: any): string {
  return normTel(
    b.phone || b.phoneNumber || b.senderPhone || b.from || b.chatId || b.participant || '',
  );
}

async function findLeadByPhone(tel: string) {
  const keys = chavesTel(tel);
  for (const k of keys) {
    if (k.length < 8) continue;
    try {
      const lead = await queryOne(
        `SELECT id, vendedor_id, COALESCE(nome_completo, nome_lead) AS nome, telefone
         FROM public.leads
         WHERE RIGHT(REGEXP_REPLACE(COALESCE(telefone,''), '[^0-9]', '', 'g'), $1) = $2
            OR REGEXP_REPLACE(COALESCE(telefone,''), '[^0-9]', '', 'g') LIKE $3
         ORDER BY id DESC LIMIT 1`,
        [k.length, k, `%${k}`],
      );
      if (lead?.id) return lead;
    } catch {
      try {
        const lead = await queryOne(
          `SELECT id, vendedor_id, COALESCE(nome_completo, nome_lead) AS nome, telefone
           FROM public.leads
           WHERE REPLACE(REPLACE(REPLACE(COALESCE(telefone,''),'-',''),' ',''),'+','') LIKE $1
           ORDER BY id DESC LIMIT 1`,
          [`%${k}%`],
        );
        if (lead?.id) return lead;
      } catch { /* ok */ }
    }
  }
  return null;
}

async function findTriagemByPhone(tel: string) {
  const keys = chavesTel(tel);
  for (const k of keys) {
    if (k.length < 8) continue;
    try {
      const t = await queryOne(
        `SELECT id, telefone FROM public.triagem
         WHERE RIGHT(REGEXP_REPLACE(COALESCE(telefone,''), '[^0-9]', '', 'g'), $1) = $2
            OR REGEXP_REPLACE(COALESCE(telefone,''), '[^0-9]', '', 'g') LIKE $3
         ORDER BY id DESC LIMIT 1`,
        [k.length, k, `%${k}`],
      );
      if (t?.id) return t;
    } catch {
      try {
        const t = await queryOne(
          `SELECT id, telefone FROM public.triagem
           WHERE REPLACE(REPLACE(REPLACE(COALESCE(telefone,''),'-',''),' ',''),'+','') LIKE $1
           ORDER BY id DESC LIMIT 1`,
          [`%${k}%`],
        );
        if (t?.id) return t;
      } catch { /* ok */ }
    }
  }
  return null;
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
    const keys = chavesTel(tel);
    const msg = texto(b).slice(0, 2000) || '[mensagem]';
    if (!keys.length) return NextResponse.json({ ok: true, ignored: 'sem telefone' });

    // 1) Já existe lead com esse telefone? → só mensagem no chat
    const lead = await findLeadByPhone(tel);
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

    // 2) Já está na triagem? → atualiza mensagem, NÃO cria outro
    const triagem = await findTriagemByPhone(tel);
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

    // 3) Novo contato → uma única triagem (telefone normalizado)
    const telStore = tel.length >= 10 ? tel : keys[0];
    const row = await queryOne(
      `INSERT INTO public.triagem (nome, telefone, email, interesse, origem, mensagem)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [nome, telStore, null, null, 'whatsapp', msg],
    );
    try {
      const { rows: admins } = await query(
        `SELECT id FROM public.usuarios WHERE LOWER(tipo) IN ('admin','gerente','marketing') AND COALESCE(ativo,TRUE)`,
      );
      for (const a of admins || []) {
        await query(
          `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem) VALUES ($1,'lead','Lead WhatsApp',$2)`,
          [a.id, `${nome} · ${telStore} · ${msg.slice(0, 80)}`],
        );
      }
    } catch { /* ok */ }

    return NextResponse.json({ ok: true, triagem_id: row?.id, acao: 'nova_triagem' });
  } catch (e: any) {
    console.error('zapi webhook', e);
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}
