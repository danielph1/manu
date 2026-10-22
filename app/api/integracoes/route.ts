import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { query, queryOne } from '@/lib/db';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { gerarToken, hashToken, urlWebhook, validarMapeamento } from '@/lib/integracoes/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const actor = await gestorIntegracoes(req);
    if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
    const isSuper = actor.tipo === 'superadmin';
    const { rows } = await query(
      `SELECT i.id, i.empresa_id, e.nome AS empresa_nome, i.nome, i.plataforma, i.ativo,
              i.mapeamento, i.criado_em, i.ultimo_evento_em,
              (SELECT count(*)::int FROM public.manu_integracao_eventos ev WHERE ev.integracao_id=i.id) AS eventos
       FROM public.manu_integracoes i
       JOIN public.empresas e ON e.id=i.empresa_id
       WHERE ($1::boolean OR i.empresa_id=$2) ORDER BY i.criado_em DESC`,
      [isSuper, actor.empresa_id],
    );
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('integracoes GET', err instanceof Error ? err.message : 'erro');
    return NextResponse.json({ error: 'não foi possível consultar integrações' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await gestorIntegracoes(req);
    if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    const nome = String(body.nome || '').trim();
    const plataforma = String(body.plataforma || '').toLowerCase().trim();
    const map = validarMapeamento(body.mapeamento ?? {});
    if (nome.length < 2 || nome.length > 100) return NextResponse.json({ error: 'nome entre 2 e 100 caracteres' }, { status: 400 });
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(plataforma)) return NextResponse.json({ error: 'código da plataforma inválido' }, { status: 400 });
    if (!map) return NextResponse.json({ error: 'mapeamento inválido' }, { status: 400 });
    const empresaId = escopoEmpresa(actor, body.empresa_id);
    if (!empresaId) return NextResponse.json({ error: 'escolha uma empresa' }, { status: 400 });
    const empresa = await queryOne(`SELECT id FROM public.empresas WHERE id=$1 AND ativo=TRUE`, [empresaId]);
    if (!empresa) return NextResponse.json({ error: 'empresa inválida ou inativa' }, { status: 422 });
    // Gera URL antes de inserir para não criar uma integração sem endereço copiável.
    const token = gerarToken();
    const id = randomUUID();
    const webhook_url = urlWebhook(id, token);
    const row = await queryOne<{id:string}>(
      `INSERT INTO public.manu_integracoes (id,empresa_id,nome,plataforma,token_hash,mapeamento,criado_por)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id`,
      [id,empresaId,nome,plataforma,hashToken(token),JSON.stringify(map),actor.id],
    );
    if (!row) throw new Error('erro ao criar');
    return NextResponse.json(
      { id: row.id, webhook_url, aviso: 'Guarde esta URL: o segredo não pode ser recuperado; apenas rotacionado.' },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    if (err?.code === '23505') return NextResponse.json({ error: 'já existe uma integração com esse nome nesta empresa' }, { status: 409 });
    console.error('integracoes POST', err instanceof Error ? err.message : 'erro');
    return NextResponse.json({ error: 'não foi possível criar integração. Confira a migração e o Supabase URL.' }, { status: 500 });
  }
}
