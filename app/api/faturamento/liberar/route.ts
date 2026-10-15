import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';

function limpa(p: string) {
  return String(p || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente', 'documentista', 'elfenai', 'elfenaí'].includes(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  try {
    const b = await req.json();
    const placa = limpa(b.placa);
    if (!placa) return NextResponse.json({ error: 'placa obrigatória' }, { status: 400 });

    const where = `REPLACE(REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ',''),'.','') = $1`;
    let carro: any = null;
    try {
      carro = await queryOne(`SELECT marca, modelo, carro, ano, ano_modelo, placa FROM public.estoque_carros WHERE ${where} LIMIT 1`, [placa]);
    } catch { /* ok */ }
    let ofi: any = null;
    try {
      ofi = await queryOne(`SELECT marca, modelo, ano_modelo, placa FROM public.oficina_carros WHERE ${where} LIMIT 1`, [placa]);
    } catch { /* ok */ }
    const c = carro || ofi || b;

    try { await query(`DELETE FROM public.estoque_carros WHERE ${where}`, [placa]); } catch { /* ok */ }
    try { await query(`DELETE FROM public.oficina_carros WHERE ${where}`, [placa]); } catch { /* ok */ }

    const txt = `${c.marca || ''} ${c.modelo || c.carro || ''} ${c.ano_modelo || c.ano || ''} ${b.placa || placa} vendido`.replace(/\s+/g, ' ').trim();
    await notificar({ titulo: 'Carro vendido', mensagem: txt, tipo: 'venda', broadcast: true });
    return NextResponse.json({ ok: true, mensagem: txt });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro ao liberar' }, { status: 500 });
  }
}
