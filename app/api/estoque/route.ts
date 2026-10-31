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

    if (!isSuperAdmin(u)) {
      if (!u.empresa_id) return NextResponse.json({ error: 'Empresa nao associada' }, { status: 403 });
      params.push(u.empresa_id);
      where += ` AND empresa_id = $${params.length}`;
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
        `SELECT e.*, (
            SELECT f.url FROM public.estoque_fotos f
            WHERE f.carro_id = e.id ORDER BY f.ordem, f.id LIMIT 1
          ) AS capa_url
         FROM public.estoque_carros e WHERE ${where} ORDER BY e.id DESC LIMIT 200`,
        params,
      );
      return NextResponse.json(rows);
    } catch {
      // sem pg_trgm: só variantes
      const params2: unknown[] = [];
      let where2 = '1=1';
      if (!isSuperAdmin(u)) {
        if (!u.empresa_id) return NextResponse.json({ error: 'Empresa nao associada' }, { status: 403 });
        params2.push(u.empresa_id);
        where2 += ` AND empresa_id = $${params2.length}`;
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
        `SELECT e.*, (
            SELECT f.url FROM public.estoque_fotos f
            WHERE f.carro_id = e.id ORDER BY f.ordem, f.id LIMIT 1
          ) AS capa_url
         FROM public.estoque_carros e WHERE ${where2} ORDER BY e.id DESC LIMIT 200`,
        params2,
      );
      return NextResponse.json(rows);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

/** Cadastro manual do veiculo - papéis de gestao, isolado por empresa. */
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const canAdd = ['superadmin', 'admin', 'gerente', 'marketing'].includes(String(u.tipo).toLowerCase());
  if (!canAdd) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
  const marca = String(b.marca || '').trim().slice(0, 90);
  const modelo = String(b.modelo || '').trim().slice(0, 120);
  const placa = String(b.placa || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const ano = Number(b.ano);
  const preco = Number(b.preco ?? 0);
  const empresaId = u.tipo === 'superadmin' ? Number(b.empresa_id) : Number(u.empresa_id);
  if (!empresaId || !Number.isSafeInteger(empresaId)) return NextResponse.json({ error: 'Empresa obrigatoria' }, { status: 400 });
  if (!marca || !modelo || !/^[A-Z0-9]{7}$/.test(placa) || !Number.isInteger(ano) || ano < 1900 || ano > new Date().getFullYear() + 2 || !Number.isFinite(preco) || preco < 0) {
    return NextResponse.json({ error: 'Preencha marca, modelo, ano, placa valida e preco' }, { status: 400 });
  }
  const patio = u.tipo === 'gerente' ? String(u.loja || '') : String(b.patio || u.loja || '').slice(0, 100);
  try {
    const existing = await query(`SELECT id FROM public.estoque_carros
      WHERE empresa_id=$1 AND REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ','')=$2 LIMIT 1`, [empresaId, placa]);
    if (existing.rows.length) return NextResponse.json({ error: 'Placa ja cadastrada na empresa' }, { status: 409 });
    const row = await query(`INSERT INTO public.estoque_carros
      (empresa_id, marca, carro, modelo, placa, ano, cor, preco, patio, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Disponível') RETURNING id`,
      [empresaId, marca, `${marca} ${modelo}`, modelo, placa, ano,
        String(b.cor || '').slice(0, 60), preco, patio]);
    return NextResponse.json({ ok: true, id: row.rows[0]?.id }, { status: 201 });
  } catch (e) {
    console.error('estoque POST', e instanceof Error ? e.message : 'erro');
    return NextResponse.json({ error: 'Nao foi possivel cadastrar o veiculo' }, { status: 500 });
  }
}
