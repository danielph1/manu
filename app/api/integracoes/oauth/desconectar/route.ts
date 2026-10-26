import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Remove conexão OAuth/credencial da empresa (trocar conta ou sair da plataforma). */
export async function POST(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const row = await queryOne<{ id: string; empresa_id: number; integracao_id: string | null }>(
    `SELECT id, empresa_id, integracao_id FROM public.manu_conexoes_oauth WHERE id=$1`,
    [id],
  );
  if (!row) return NextResponse.json({ error: 'conexão não encontrada' }, { status: 404 });

  if (actor.tipo !== 'superadmin' && Number(row.empresa_id) !== Number(actor.empresa_id)) {
    return NextResponse.json({ error: 'sem permissão nesta empresa' }, { status: 403 });
  }

  // desativa integração webhook ligada
  if (row.integracao_id) {
    try {
      await query(
        `UPDATE public.manu_integracoes SET ativo=false, atualizado_em=now() WHERE id=$1`,
        [row.integracao_id],
      );
    } catch { /* ok */ }
  }

  await query(`DELETE FROM public.manu_conexoes_oauth WHERE id=$1`, [id]);

  return NextResponse.json({ ok: true, message: 'Canal desconectado. Pode conectar outra conta.' });
}
