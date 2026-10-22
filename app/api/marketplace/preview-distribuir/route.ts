import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || String(u.tipo).toLowerCase() !== 'superadmin') {
    return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter((n: number) => n > 0) : [];
  const modo = String(b.modo || 'ids');

  let anunciosSql = `SELECT id, empresa_id, status FROM public.marketplace_anuncios WHERE status IN ('novo','selecionado')`;
  const params: any[] = [];
  if (modo === 'ids' && ids.length) {
    anunciosSql += ` AND id = ANY($1::bigint[])`;
    params.push(ids);
  } else if (modo === 'selecionados') {
    anunciosSql += ` AND status = 'selecionado'`;
  } else if (modo === 'todos_novos') {
    anunciosSql += ` AND status IN ('novo','selecionado')`;
  } else if (!ids.length) {
    return NextResponse.json({ error: 'informe ids, selecionados ou todos_novos' }, { status: 400 });
  }

  const { rows: anuncios } = await query(anunciosSql + ' ORDER BY id LIMIT 500', params);
  if (!anuncios.length) {
    return NextResponse.json({
      ok: false,
      anuncios: 0,
      vendedores: 0,
      aviso: 'Nenhum anúncio elegível. Nada seria criado.',
    });
  }

  const empresas = [...new Set(anuncios.map((a: any) => a.empresa_id).filter(Boolean))];
  let empresaId = b.empresa_id ? Number(b.empresa_id) : empresas[0] || null;
  if (empresas.length > 1 && !b.empresa_id) {
    return NextResponse.json({
      ok: false,
      aviso: 'Anúncios de várias empresas. Escolha empresa_id explicitamente.',
      empresas,
      anuncios: anuncios.length,
    });
  }

  const { rows: vendedores } = await query(
    empresaId
      ? `SELECT id, nome, loja FROM public.vendedores
          WHERE empresa_id=$1 AND LOWER(COALESCE(nome,'')) <> 'matheus'
            AND COALESCE(ativo, TRUE) IS NOT FALSE
          ORDER BY nome`
      : `SELECT id, nome, loja FROM public.vendedores
          WHERE LOWER(COALESCE(nome,'')) <> 'matheus' AND COALESCE(ativo, TRUE) IS NOT FALSE
          ORDER BY nome LIMIT 200`,
    empresaId ? [empresaId] : [],
  );

  const empresa = empresaId
    ? await queryOne(`SELECT id, nome FROM public.empresas WHERE id=$1`, [empresaId])
    : null;

  return NextResponse.json({
    ok: true,
    anuncios: anuncios.length,
    ids: anuncios.map((a: any) => a.id),
    vendedores: vendedores.length,
    vendedores_lista: vendedores.slice(0, 50),
    empresa_id: empresaId,
    empresa_nome: empresa?.nome || null,
    frase:
      vendedores.length === 0
        ? 'BLOQUEADO: não há vendedores na empresa. Nenhum lead seria criado.'
        : `Serão criados ${anuncios.length} lead(s), distribuídos ALEATORIAMENTE entre ${vendedores.length} vendedor(es) de ${empresa?.nome || 'empresa selecionada'}.`,
  });
}
