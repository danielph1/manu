import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, getPool } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || String(u.tipo).toLowerCase() !== 'superadmin') {
    return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (String(b.confirmacao || '') !== 'DESFAZER') {
    return NextResponse.json({ error: 'Digite DESFAZER para confirmar' }, { status: 400 });
  }
  const batchId = String(b.batch_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) {
    return NextResponse.json({ error: 'batch_id inválido' }, { status: 400 });
  }
  const lote = await queryOne(`SELECT * FROM public.marketplace_lotes WHERE id=$1`, [batchId]);
  if (!lote) return NextResponse.json({ error: 'lote não encontrado' }, { status: 404 });
  if (lote.desfeito) return NextResponse.json({ error: 'lote já foi desfeito' }, { status: 409 });

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows: an } = await client.query(
      `SELECT id, lead_id FROM public.marketplace_anuncios WHERE batch_id=$1 AND status='distribuido'`,
      [batchId],
    );
    const leadIds = an.map((x: any) => x.lead_id).filter(Boolean);
    if (leadIds.length) {
      try {
        await client.query(`DELETE FROM public.lead_transferencias WHERE lead_id = ANY($1::int[])`, [leadIds]);
      } catch { /* ok */ }
      try {
        await client.query(`DELETE FROM public.chat_geral_mensagens WHERE lead_id = ANY($1::int[])`, [leadIds]);
      } catch { /* ok */ }
      await client.query(`DELETE FROM public.leads WHERE id = ANY($1::int[])`, [leadIds]);
    }
    await client.query(
      `UPDATE public.marketplace_anuncios
          SET status='selecionado', lead_id=NULL, batch_id=NULL
        WHERE batch_id=$1`,
      [batchId],
    );
    await client.query(
      `UPDATE public.marketplace_lotes
          SET desfeito=TRUE, desfeito_em=now(), desfeito_por=$2
        WHERE id=$1`,
      [batchId, u.id],
    );
    await client.query('COMMIT');
    return NextResponse.json({
      ok: true,
      leads_apagados: leadIds.length,
      anuncios_restaurados: an.length,
      batch_id: batchId,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('desfazer', err);
    return NextResponse.json({ error: 'falha ao desfazer' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || String(u.tipo).toLowerCase() !== 'superadmin') {
    return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  }
  const { rows } = await query(
    `SELECT * FROM public.marketplace_lotes ORDER BY criado_em DESC LIMIT 30`,
  );
  return NextResponse.json(rows);
}
