import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { gestorIntegracoes } from '@/lib/integracoes/auth';
import { validarMapeamento } from '@/lib/integracoes/helpers';
import { verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const actor = await gestorIntegracoes(req);
    if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
    const { id } = await Promise.resolve(ctx.params);
    const body = await req.json().catch(() => ({}));
    const map = body.mapeamento != null ? validarMapeamento(body.mapeamento) : null;
    if (body.mapeamento != null && !map) {
      return NextResponse.json({ error: 'mapeamento inválido' }, { status: 400 });
    }
    const row = await queryOne(
      `UPDATE public.manu_integracoes SET
         ativo = COALESCE($2, ativo),
         nome = COALESCE(NULLIF($3, ''), nome),
         mapeamento = COALESCE($4::jsonb, mapeamento),
         atualizado_em = now()
       WHERE id=$1 AND ($5::boolean OR empresa_id=$6)
       RETURNING id, nome, ativo, mapeamento`,
      [
        id,
        body.ativo ?? null,
        body.nome?.trim() ?? null,
        map ? JSON.stringify(map) : null,
        actor.tipo === 'superadmin',
        actor.empresa_id,
      ],
    );
    if (!row) return NextResponse.json({ error: 'não encontrada' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    console.error('integracoes PATCH', err);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}

/** Exclui conexão — exige senha do usuário logado */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const actor = await gestorIntegracoes(req);
    if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
    const { id } = await Promise.resolve(ctx.params);
    const body = await req.json().catch(() => ({}));
    const senha = String(body.senha || body.password || '');
    if (!senha) return NextResponse.json({ error: 'informe sua senha' }, { status: 400 });

    const user = await queryOne<{ senha_hash: string | null }>(
      `SELECT senha_hash FROM public.usuarios WHERE id=$1`,
      [actor.id],
    );
    if (!user || !verifyPassword(senha, user.senha_hash)) {
      return NextResponse.json({ error: 'senha incorreta' }, { status: 401 });
    }

    // eventos primeiro (FK restrict)
    await query(`DELETE FROM public.manu_integracao_eventos WHERE integracao_id=$1`, [id]);
    const row = await queryOne(
      `DELETE FROM public.manu_integracoes
        WHERE id=$1 AND ($2::boolean OR empresa_id=$3)
        RETURNING id`,
      [id, actor.tipo === 'superadmin', actor.empresa_id],
    );
    if (!row) return NextResponse.json({ error: 'não encontrada ou sem permissão' }, { status: 404 });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    console.error('integracoes DELETE', err);
    return NextResponse.json({ error: 'falha ao excluir' }, { status: 500 });
  }
}
