import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente', 'documentista', 'elfenai', 'elfenaí'].includes(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  const b = await req.json();
  const placa = String(b.placa || '').replace(/[- ]/g, '').toUpperCase();
  if (!placa) return NextResponse.json({ error: 'placa obrigatória' }, { status: 400 });

  const carro = await queryOne(
    `SELECT marca, modelo, carro, ano, ano_modelo, placa FROM public.estoque_carros
     WHERE REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ','') = $1 LIMIT 1`,
    [placa],
  );
  const ofi = await queryOne(
    `SELECT marca, modelo, ano_modelo, placa FROM public.oficina_carros
     WHERE REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ','') = $1 LIMIT 1`,
    [placa],
  );
  const c = carro || ofi || b;
  await query(`DELETE FROM public.estoque_carros WHERE REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ','') = $1`, [placa]);
  await query(`DELETE FROM public.oficina_carros WHERE REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ','') = $1`, [placa]);

  const txt = `${c.marca || ''} ${c.modelo || c.carro || ''} ${c.ano_modelo || c.ano || ''} ${b.placa || placa} vendido`.replace(/\s+/g, ' ').trim();
  await notificar({ titulo: 'Carro vendido', mensagem: txt, tipo: 'venda', broadcast: true });
  return NextResponse.json({ ok: true, mensagem: txt });
}
