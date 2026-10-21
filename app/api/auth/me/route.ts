import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const row = await queryOne(
      `SELECT u.id, u.login, u.nome, u.tipo, u.vendedor_id, u.loja,
              COALESCE(u.ativo,TRUE) AS ativo,
              COALESCE(u.foto_url,'') AS foto_url,
              u.empresa_id,
              e.nome AS empresa_nome
       FROM public.usuarios u
       LEFT JOIN public.empresas e ON e.id = u.empresa_id
       WHERE u.id = $1`,
      [u.id],
    );
    return NextResponse.json(row || u);
  } catch {
    return NextResponse.json(u);
  }
}
