import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  try {
    // remove prontos > 4 dias
    try {
      await query(
        `
        DELETE FROM public.oficina_carros
        WHERE COALESCE(pronto, FALSE) = TRUE
          AND COALESCE(updated_at, created_at, NOW()) < (NOW() - INTERVAL '4 days')
        `,
      );
    } catch { /* ok */ }

    const busca = (new URL(req.url).searchParams.get('busca') || '').trim();
    const params: unknown[] = [];
    let where = '1=1';
    if (busca) {
      params.push(`%${busca}%`);
      const p = `$${params.length}`;
      where = `(marca ILIKE ${p} OR modelo ILIKE ${p} OR placa ILIKE ${p} OR COALESCE(cor,'') ILIKE ${p})`;
    }

    const { rows } = await query(
      `
      SELECT *
      FROM public.oficina_carros
      WHERE ${where}
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 200
      `,
      params,
    );
    const clean = (v: unknown) => {
      if (v == null) return v;
      const s = String(v).trim().toLowerCase();
      if (s === 'nan' || s === 'none' || s === 'null' || s === 'undefined') return '';
      return v;
    };
    const out = rows.map((r: any) => ({
      ...r,
      onde_esta: clean(r.onde_esta),
      observacao: clean(r.observacao),
      mecanica: clean(r.mecanica),
      lataria: clean(r.lataria),
      valor_final: clean(r.valor_final),
    }));
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente', 'guariba', 'mecanico'].includes(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }

  try {
    const b = await req.json();
    const placa = String(b.placa || '').replace(/[-\s]/g, '').toUpperCase();
    if (!b.marca || !b.modelo || !b.ano_modelo || !placa) {
      return NextResponse.json({ error: 'marca, modelo, ano e placa obrigatórios' }, { status: 400 });
    }

    const existe = await queryOne(
      `SELECT id FROM public.oficina_carros
       WHERE REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ','') = $1`,
      [placa],
    );
    if (existe) {
      return NextResponse.json({ error: 'placa já na oficina' }, { status: 409 });
    }

    // estoque
    let estoqueId: number | null = null;
    const est = await queryOne<{ id: number; status: string }>(
      `SELECT id, status FROM public.estoque_carros
       WHERE REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ','') = $1
       ORDER BY id DESC LIMIT 1`,
      [placa],
    );
    const preco = b.valor_carro != null ? Number(b.valor_carro) : null;
    let recal = false;
    if (est) {
      estoqueId = est.id;
      if (String(est.status || '').toLowerCase().includes('vend')) {
        recal = true;
        await query(`UPDATE public.estoque_carros SET status = 'RECAL' WHERE id = $1`, [est.id]);
      }
    } else {
      try {
        const ins = await queryOne<{ id: number }>(
          `INSERT INTO public.estoque_carros (marca, carro, modelo, preco, ano, patio, cor, placa, status)
           VALUES ($1,$2,$3,$4,$5,'Oficina',$6,$7,'Disponível') RETURNING id`,
          [
            b.marca,
            `${b.marca} ${b.modelo}`,
            b.modelo,
            preco ?? 0,
            b.ano_modelo,
            b.cor || null,
            placa,
          ],
        );
        estoqueId = ins?.id ?? null;
      } catch { /* colunas diferentes */ }
    }

    const row = await queryOne(
      `
      INSERT INTO public.oficina_carros (
        marca, modelo, ano_modelo, placa, cor,
        estoque_carro_id, atualizado_por_id, onde_esta, observacao, valor_final, pronto
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Oficina',$8,$9,FALSE)
      RETURNING *
      `,
      [
        b.marca,
        b.modelo,
        b.ano_modelo,
        placa,
        b.cor || null,
        estoqueId,
        u.id,
        recal ? 'RECAL — veículo retornou (já havia sido vendido).' : null,
        preco != null ? String(preco) : null,
      ],
    );
    await notificar({
      titulo: 'Carro na oficina',
      mensagem: `${b.marca} ${b.modelo} · ${placa}`,
      tipo: 'oficina',
      tipos: ['admin', 'gerente', 'guariba', 'mecanico'],
    });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente', 'guariba', 'mecanico'].includes(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }

  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const row = await queryOne(
      `
      UPDATE public.oficina_carros SET
        onde_esta = COALESCE($2, onde_esta),
        pronto = COALESCE($3, pronto),
        observacao = COALESCE($4, observacao),
        mecanica = COALESCE($5, mecanica),
        lataria = COALESCE($6, lataria),
        valor_final = COALESCE($7, valor_final),
        atualizado_por_id = $8,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        b.id,
        b.onde_esta ?? null,
        b.pronto ?? null,
        b.observacao ?? null,
        b.mecanica ?? null,
        b.lataria ?? null,
        b.valor_final ?? null,
        u.id,
      ],
    );

    // sync pátio estoque
    if (row?.placa && b.onde_esta) {
      try {
        await query(
          `UPDATE public.estoque_carros SET patio = $2
           WHERE REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ','') = REPLACE(REPLACE(UPPER($1),'-',''),' ','')`,
          [row.placa, b.onde_esta],
        );
      } catch { /* ok */ }
    }

    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
