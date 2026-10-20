import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { variantesBusca } from '@/lib/fuzzy';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const busca = (new URL(req.url).searchParams.get('busca') || '').trim();
    const params: unknown[] = [];
    let where = '1=1';

    if (!isSuperAdmin(u) && u.empresa_id) {
      params.push(u.empresa_id);
      where += ` AND (empresa_id = $${params.length} OR empresa_id IS NULL)`;
    }

    if (busca) {
      const vars = variantesBusca(busca);
      const parts: string[] = [];
      params.push(`%${busca}%`);
      const p0 = `$${params.length}`;
      parts.push(
        `(marca ILIKE ${p0} OR modelo ILIKE ${p0} OR placa ILIKE ${p0} OR COALESCE(carro,'') ILIKE ${p0} OR COALESCE(cor,'') ILIKE ${p0} OR COALESCE(carroceria,'') ILIKE ${p0})`,
      );
      for (const v of vars) {
        if (v.toLowerCase() === busca.toLowerCase()) continue;
        params.push(`%${v}%`);
        const p = `$${params.length}`;
        parts.push(`(marca ILIKE ${p} OR modelo ILIKE ${p} OR COALESCE(carro,'') ILIKE ${p})`);
      }
      params.push(busca.toLowerCase());
      const pt = `$${params.length}`;
      const trgm = ` OR similarity(lower(COALESCE(modelo,'')), ${pt}) > 0.25
                     OR similarity(lower(COALESCE(marca,'')), ${pt}) > 0.25
                     OR similarity(lower(concat_ws(' ', marca, modelo)), ${pt}) > 0.3`;
      where += ` AND (${parts.join(' OR ')}${trgm})`;
    }

    try {
      const { rows } = await query(
        `SELECT * FROM public.estoque_carros WHERE ${where} ORDER BY id DESC LIMIT 200`,
        params,
      );
      return NextResponse.json(rows);
    } catch {
      // sem pg_trgm: só variantes
      const params2: unknown[] = [];
      let where2 = '1=1';
      if (!isSuperAdmin(u) && u.empresa_id) {
        params2.push(u.empresa_id);
        where2 += ` AND (empresa_id = $${params2.length} OR empresa_id IS NULL)`;
      }
      if (busca) {
        const vars = variantesBusca(busca);
        const parts: string[] = [];
        for (const v of [busca, ...vars]) {
          params2.push(`%${v}%`);
          const p = `$${params2.length}`;
          parts.push(
            `(marca ILIKE ${p} OR modelo ILIKE ${p} OR placa ILIKE ${p} OR COALESCE(carro,'') ILIKE ${p})`,
          );
        }
        where2 += ` AND (${parts.join(' OR ')})`;
      }
      const { rows } = await query(
        `SELECT * FROM public.estoque_carros WHERE ${where2} ORDER BY id DESC LIMIT 200`,
        params2,
      );
      return NextResponse.json(rows);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
