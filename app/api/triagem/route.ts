import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

async function expirar() {
  const vencidos = await query(
    `SELECT id FROM public.triagem
     WHERE status = 'aguardando' AND created_at < now() - interval '1 minute'`,
  );
  for (const t of vencidos.rows) {
    const v = await queryOne(
      `SELECT id FROM public.vendedores
       WHERE LOWER(COALESCE(nome,'')) <> 'matheus'
       ORDER BY random() LIMIT 1`,
    );
    if (!v) continue;
    await virarLead(t.id, v.id);
  }
}

async function virarLead(triagemId: number, vendedorId: number) {
  const t = await queryOne(`SELECT * FROM public.triagem WHERE id = $1`, [triagemId]);
  if (!t || t.status !== 'aguardando') return;
  const lead = await queryOne(
    `INSERT INTO public.leads (nome_lead, telefone, email, produto_interesse, observacao, vendedor_id, data_lead, atribuido_em, rotacionar)
     VALUES ($1,$2,$3,$4,$5,$6, now(), now(), TRUE) RETURNING id`,
    [t.nome, t.telefone, t.email, t.interesse, `[${t.origem}] ${t.mensagem || ''}`.trim(), vendedorId],
  );
  await query(
    `UPDATE public.triagem SET status = 'atribuido', vendedor_id = $1, lead_id = $2 WHERE id = $3`,
    [vendedorId, lead?.id, triagemId],
  );
  if (lead?.id && t.mensagem) {
    await query(
      `INSERT INTO public.chat_geral_mensagens (remetente_id, mensagem, lead_id)
       VALUES (NULL, $1, $2)`,
      [`[${t.origem}] ${t.mensagem}`, lead.id],
    );
  }
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || u.tipo !== 'admin') return NextResponse.json({ error: 'sem acesso' }, { status: 403 });
  await expirar();
  const { rows } = await query(
    `SELECT * FROM public.triagem WHERE status = 'aguardando' ORDER BY created_at ASC`,
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || u.tipo !== 'admin') return NextResponse.json({ error: 'sem acesso' }, { status: 403 });
  const b = await req.json();
  const id = Number(b.id);
  let vendedorId = b.vendedor_id ? Number(b.vendedor_id) : 0;

  if (!vendedorId && b.loja) {
    const v = await queryOne(
      `SELECT id FROM public.vendedores
       WHERE UPPER(COALESCE(loja,'381')) = UPPER($1)
         AND LOWER(COALESCE(nome,'')) <> 'matheus'
       ORDER BY random() LIMIT 1`,
      [String(b.loja)],
    );
    vendedorId = v?.id || 0;
  }
  if (!vendedorId) return NextResponse.json({ error: 'escolha vendedor ou loja' }, { status: 400 });
  await virarLead(id, vendedorId);
  return NextResponse.json({ ok: true });
}
