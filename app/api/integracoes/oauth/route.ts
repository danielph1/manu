import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lista conexões OAuth/QR — NUNCA devolve access_token */
export async function GET(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  const isSuper = actor.tipo === 'superadmin';
  const { rows } = await query(
    `SELECT o.id, o.empresa_id, e.nome AS empresa_nome, o.provedor, o.status, o.label,
            o.external_id, o.meta, o.criado_em, o.atualizado_em
       FROM public.manu_conexoes_oauth o
       JOIN public.empresas e ON e.id = o.empresa_id
      WHERE ($1::boolean OR o.empresa_id = $2)
      ORDER BY o.atualizado_em DESC`,
    [isSuper, actor.empresa_id],
  );
  // strip any accidental token keys from meta
  const safe = rows.map((r: any) => {
    const meta = { ...(r.meta || {}) };
    delete meta.access_token;
    delete meta.refresh_token;
    delete meta.token;
    return { ...r, meta };
  });
  return NextResponse.json(safe, { headers: { 'Cache-Control': 'no-store' } });
}
