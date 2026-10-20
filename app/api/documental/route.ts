import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser, can } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!can.verDocumental(u) && u.tipo !== 'admin' && u.tipo !== 'superadmin') {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  try {
    const params: unknown[] = [];
    let scope = '1=1';

    if (u.empresa_id && u.tipo !== 'superadmin') {
      params.push(u.empresa_id);
      scope = `(f.vendedor_id IS NULL OR f.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id = $${params.length}))`;
    }

    if (u.tipo === 'vendedor' && u.vendedor_id) {
      params.push(u.vendedor_id);
      scope += ` AND f.vendedor_id = $${params.length}`;
    } else if (u.tipo === 'gerente' && u.loja) {
      params.push(u.loja);
      scope += ` AND f.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($${params.length}))`;
    }

    let rows: any[] = [];
    try {
      const r = await query(
        `
        SELECT
          f.id, f.lead_id, f.vendedor_id, f.status_geral,
          COALESCE(f.comprou, FALSE) AS comprou,
          f.data_compra,
          l.nome_lead, l.nome_completo, l.telefone, l.cpf,
          COALESCE(l.placa_carro, fat.placa, '') AS placa_carro,
          COALESCE(l.marca_carro, fat.marca, '') AS marca_carro,
          COALESCE(l.modelo, fat.modelo, l.produto_interesse, '') AS modelo,
          COALESCE(l.ano_carro, fat.ano_modelo, '') AS ano_carro,
          COALESCE(
            l.carro_selecionado,
            NULLIF(TRIM(CONCAT_WS(' ', l.marca_carro, l.modelo)), ''),
            NULLIF(TRIM(CONCAT_WS(' ', fat.marca, fat.modelo)), ''),
            ''
          ) AS carro_selecionado,
          v.nome AS vendedor_nome,
          p.id AS processo_id,
          p.status AS processo_status,
          COALESCE(p.gravame, FALSE) AS gravame,
          COALESCE(p.reconheceu_firma, FALSE) AS reconheceu_firma,
          COALESCE(p.documento_pronto, FALSE) AS documento_pronto,
          fat.placa AS fat_placa
        FROM public.fichas_credito f
        LEFT JOIN public.leads l ON l.id = f.lead_id
        LEFT JOIN public.vendedores v ON v.id = f.vendedor_id
        LEFT JOIN public.processos_transferencia p ON p.ficha_id = f.id
        LEFT JOIN LATERAL (
          SELECT placa, marca, modelo, ano_modelo
          FROM public.faturamentos
          WHERE lead_id = f.lead_id OR ficha_id = f.id
          ORDER BY id DESC LIMIT 1
        ) fat ON TRUE
        WHERE ${scope}
          AND (
            COALESCE(f.comprou, FALSE) = TRUE
            OR COALESCE(l.venda_concluida, FALSE) = TRUE
            OR p.id IS NOT NULL
            OR fat.placa IS NOT NULL
          )
        ORDER BY f.id DESC
        LIMIT 200
        `,
        params,
      );
      rows = r.rows;
    } catch {
      const r = await query(
        `
        SELECT
          f.id, f.lead_id, f.vendedor_id, f.status_geral,
          COALESCE(f.comprou, FALSE) AS comprou,
          l.nome_lead, l.cpf, l.telefone,
          v.nome AS vendedor_nome,
          p.id AS processo_id,
          COALESCE(p.gravame, FALSE) AS gravame,
          COALESCE(p.reconheceu_firma, FALSE) AS reconheceu_firma,
          COALESCE(p.documento_pronto, FALSE) AS documento_pronto
        FROM public.fichas_credito f
        LEFT JOIN public.leads l ON l.id = f.lead_id
        LEFT JOIN public.vendedores v ON v.id = f.vendedor_id
        LEFT JOIN public.processos_transferencia p ON p.ficha_id = f.id
        WHERE ${scope}
          AND (COALESCE(f.comprou, FALSE) = TRUE OR COALESCE(l.venda_concluida, FALSE) = TRUE)
        ORDER BY f.id DESC LIMIT 200
        `,
        params,
      );
      rows = r.rows;
    }

    const normalized = rows.map((r) => ({
      ...r,
      lead: {
        nome_lead: r.nome_lead || r.nome_completo || '—',
        cpf: r.cpf || '—',
        telefone: r.telefone,
        placa_carro: r.placa_carro || r.fat_placa || '',
        ano_carro: r.ano_carro || '',
        carro_selecionado:
          r.carro_selecionado ||
          [r.marca_carro, r.modelo].filter(Boolean).join(' ') ||
          '',
      },
      vendedor: { nome: r.vendedor_nome || '—' },
      processo: [
        {
          id: r.processo_id,
          gravame: !!r.gravame,
          reconheceu_firma: !!r.reconheceu_firma,
          documento_pronto: !!r.documento_pronto,
          status: r.processo_status,
        },
      ],
    }));

    return NextResponse.json(normalized);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
