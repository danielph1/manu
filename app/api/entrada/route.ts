import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';

// Recebe lead de Facebook, OLX, WebMotors, NaPista, Instagram, WhatsApp.
// Header: x-entrada-secret
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-entrada-secret') || '';
  const expected = process.env.ENTRADA_SECRET || 'manu-entrada';
  if (secret !== expected) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });

  const b = await req.json();
  const nome = String(b.nome || b.name || 'Sem nome').trim();
  const telefone = String(b.telefone || b.phone || '').trim();
  const email = String(b.email || '').trim();
  const interesse = String(b.interesse || b.veiculo || b.vehicle || '').trim();
  const origem = String(b.origem || b.source || 'outro').toLowerCase();
  const mensagem = String(b.mensagem || b.message || '').trim();

  const row = await queryOne(
    `INSERT INTO public.triagem (nome, telefone, email, interesse, origem, mensagem)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [nome, telefone, email, interesse, origem, mensagem],
  );
  return NextResponse.json({ ok: true, id: row?.id });
}
