import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    const { rows } = await query(
      `SELECT c.id, c.texto, c.created_at, u.nome AS autor_nome, u.foto_url
       FROM public.feed_comentarios c
       LEFT JOIN public.usuarios u ON u.id = c.autor_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC
       LIMIT 100`,
      [Number(id)],
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    const b = await req.json();
    const texto = String(b.texto || '').trim();
    if (!texto) return NextResponse.json({ error: 'vazio' }, { status: 400 });
    const row = await queryOne(
      `INSERT INTO public.feed_comentarios (post_id, autor_id, texto)
       VALUES ($1,$2,$3) RETURNING *`,
      [Number(id), u.id, texto],
    );
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
