import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { gestorIntegracoes } from '@/lib/integracoes/auth';
import { validarMapeamento } from '@/lib/integracoes/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await gestorIntegracoes(req);
    if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    if (Object.keys(body).some((k) => !['ativo','nome','mapeamento'].includes(k))) return NextResponse.json({ error: 'campo não editável' }, { status: 400 });
    const map = body.mapeamento === undefined ? null : validarMapeamento(body.mapeamento);
    if (body.mapeamento !== undefined && !map) return NextResponse.json({ error: 'mapeamento inválido' }, { status: 400 });
    if (body.ativo !== undefined && typeof body.ativo !== 'boolean') return NextResponse.json({ error: 'ativo precisa ser booleano' }, { status: 400 });
    if (body.nome !== undefined && (typeof body.nome !== 'string' || body.nome.trim().length < 2 || body.nome.trim().length > 100)) {
      return NextResponse.json({ error: 'nome inválido' }, { status: 400 });
    }
    const updated = await queryOne(
      `UPDATE public.manu_integracoes SET
       ativo=COALESCE($2::boolean, ativo), nome=COALESCE($3::text, nome),
       mapeamento=COALESCE($4::jsonb, mapeamento), atualizado_em=now()
       WHERE id=$1 AND ($5::boolean OR empresa_id=$6) RETURNING id,nome,ativo,mapeamento`,
      [id, body.ativo ?? null, body.nome?.trim() ?? null, map ? JSON.stringify(map) : null, actor.tipo==='superadmin', actor.empresa_id],
    );
    return updated ? NextResponse.json(updated) : NextResponse.json({error:'não encontrada'}, {status:404});
  } catch (err) {
    console.error('integracoes PATCH', err instanceof Error ? err.message : 'erro');
    return NextResponse.json({error:'não foi possível salvar'}, {status:500});
  }
}
