import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const leadId = new URL(req.url).searchParams.get('lead_id');
    const { rows } = await query(
      `SELECT m.id, m.mensagem, m.created_at, m.remetente_id,
              COALESCE(u.nome, u.login, CASE WHEN m.remetente_id IS NULL THEN 'Sistema' ELSE 'Usuário' END) AS remetente_nome,
              m.arquivo_nome, m.arquivo_mime,
              CASE WHEN m.arquivo_bytes IS NOT NULL THEN encode(m.arquivo_bytes, 'base64') ELSE NULL END AS arquivo_b64
       FROM public.chat_geral_mensagens m
       LEFT JOIN public.usuarios u ON u.id = m.remetente_id
       ${leadId ? 'WHERE m.lead_id = $1' : ''}
       ORDER BY m.created_at ASC
       LIMIT 500`,
      leadId ? [Number(leadId)] : [],
    );
    let reacoes: any[] = [];
    try {
      const r = await query(
        `SELECT mensagem_id, emoji, COUNT(*)::int AS n,
                BOOL_OR(usuario_id = $1) AS eu
         FROM public.chat_geral_reacoes
         GROUP BY mensagem_id, emoji`,
        [u.id],
      );
      reacoes = r.rows;
    } catch { /* tabela pode nao existir */ }
    const byId: Record<number, any[]> = {};
    for (const r of reacoes) {
      (byId[r.mensagem_id] ||= []).push({ emoji: r.emoji, n: r.n, eu: r.eu });
    }
    const out = rows.map((m: any) => ({ ...m, reacoes: byId[m.id] || [] }));
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const b = await req.json();
    const msg = String(b.mensagem || '').trim();
    const b64 = b.arquivo_b64 ? String(b.arquivo_b64) : null;
    const nome = b.arquivo_nome || null;
    const mime = b.arquivo_mime || null;
    if (!msg && !b64) return NextResponse.json({ error: 'mensagem vazia' }, { status: 400 });
    const leadId = b.lead_id ? Number(b.lead_id) : null;
    const texto = msg || (mime?.startsWith('audio') ? 'Áudio' : 'Mídia');
    let row: any = null;
    try {
      row = await queryOne(
        `INSERT INTO public.chat_geral_mensagens
           (remetente_id, mensagem, arquivo_nome, arquivo_mime, arquivo_bytes, lead_id)
         VALUES ($1, $2, $3, $4, CASE WHEN $5::text IS NULL THEN NULL ELSE decode($5::text, 'base64') END, $6)
         RETURNING id, mensagem, created_at, remetente_id, arquivo_nome, arquivo_mime`,
        [u.id, texto, nome, mime, b64, leadId],
      );
    } catch {
      row = await queryOne(
        `INSERT INTO public.chat_geral_mensagens (remetente_id, mensagem, lead_id)
         VALUES ($1, $2, $3)
         RETURNING id, mensagem, created_at, remetente_id`,
        [u.id, texto, leadId],
      );
    }
    if (leadId && msg) {
      try {
        const lead = await queryOne(`SELECT telefone FROM public.leads WHERE id = $1`, [leadId]);
        let tel = String(lead?.telefone || '').replace(/\D/g, '');
        if (tel && !tel.startsWith('55')) tel = `55${tel}`;
        const instance = process.env.ZAPI_INSTANCE_ID;
        const token = process.env.ZAPI_TOKEN;
        const clientToken = process.env.ZAPI_CLIENT_TOKEN || '';
        if (tel && instance && token) {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (clientToken) headers['Client-Token'] = clientToken;
          await fetch(
            `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
            { method: 'POST', headers, body: JSON.stringify({ phone: tel, message: msg }) },
          );
        }
      } catch (e) {
        console.error('zapi send', e);
      }
    }
    try {
      await notificar({
        titulo: 'Nova mensagem no chat',
        mensagem: `${u.nome || u.login}: ${texto.slice(0, 80)}`,
        tipo: 'chat',
        broadcast: true,
      });
    } catch { /* ok */ }
    return NextResponse.json({ ...row, remetente_nome: u.nome || u.login, arquivo_b64: b64, reacoes: [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro ao enviar' }, { status: 500 });
  }
}
