import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    // O superadmin pode escolher a empresa; os demais recebem apenas seus vendedores.
    // Nunca agrupar por nome: pessoas com nomes iguais em lojas diferentes são distintas.
    const params: unknown[] = [];
    const where: string[] = ['COALESCE(v.ativo,FALSE)=TRUE', 'v.empresa_id IS NOT NULL',
      `EXISTS(SELECT 1 FROM public.usuarios u WHERE u.vendedor_id=v.id AND u.empresa_id=v.empresa_id
        AND LOWER(u.tipo)='vendedor' AND COALESCE(u.ativo,FALSE)
        AND LOWER(COALESCE(u.status,'ativo'))='ativo')`];
    if (u.tipo !== 'superadmin') {
      if (!u.empresa_id) return NextResponse.json({ error: 'Usuário sem empresa vinculada' }, { status: 403 });
      params.push(Number(u.empresa_id));
      where.push(`v.empresa_id=$${params.length}`);
    }
    if (u.tipo === 'gerente' && u.loja) {
      params.push(u.loja);
      where.push(`UPPER(COALESCE(v.loja,''))=UPPER($${params.length})`);
    }
    const { rows } = await query(
      `SELECT v.id, v.nome, v.loja, v.empresa_id, e.nome AS empresa_nome,
              COALESCE(v.ativo, TRUE) AS ativo
       FROM public.vendedores v
       JOIN public.empresas e ON e.id = v.empresa_id
       WHERE ${where.join(' AND ')}
       ORDER BY e.nome, v.loja, v.nome, v.id`, params,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
