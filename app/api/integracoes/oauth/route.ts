import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Apenas conexões da empresa explicitamente selecionada, inclusive para superadmin. */
export async function GET(req: NextRequest) {
  try {
    const actor = await gestorIntegracoes(req);
    if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
    const solicitada = req.nextUrl.searchParams.get('empresa_id');
    const empresaId = escopoEmpresa(actor, solicitada ?? actor.empresa_id);
    if (!empresaId) return NextResponse.json({ error: 'Selecione uma empresa antes de consultar as conexões.' }, { status: 400 });
    const { rows } = await query(
      `SELECT o.id, o.empresa_id, e.nome AS empresa_nome, o.provedor, o.status, o.label,
              o.external_id, o.criado_em, o.atualizado_em
         FROM public.manu_conexoes_oauth o
         JOIN public.empresas e ON e.id = o.empresa_id
        WHERE o.empresa_id = $1
        ORDER BY o.atualizado_em DESC NULLS LAST, o.criado_em DESC`,
      [empresaId],
    );
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[integracoes/oauth] falha consulta por empresa', e instanceof Error ? e.message : 'erro');
    return NextResponse.json({ error: 'Não foi possível consultar as conexões desta empresa.' }, { status: 500 });
  }
}
