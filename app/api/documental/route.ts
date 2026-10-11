import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser, can } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!can.verDocumental(u) && u.tipo !== 'admin') {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  try {
    const params: unknown[] = [];
    let scope = '1=1';
    if (u.tipo === 'vendedor' && u.vendedor_id) {
      params.push(u.vendedor_id);
      scope = `f.vendedor_id = $${params.length}`;
    } else if (u.tipo === 'gerente' && u.loja) {
      params.push(u.loja);
      scope = `f.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($${params.length}))`;
    }
    const { rows } = await query(
      `SELECT
         f.id,
         f.lead_id,
         f.vendedor_id,
         f.status_geral,
         COALESCE(f.comprou, FALSE) AS comprou,
         l.nome_lead,
         l.telefone,
         l.cpf,
         v.nome AS vendedor_nome,
         p.id AS processo_id,
         p.status AS processo_status,
         p.gravame,
         p.reconheceu_firma,
         p.documento_pronto
       FROM public.fichas_credito f
       LEFT JOIN public.leads l ON l.id = f.lead_id
       LEFT JOIN public.vendedores v ON v.id = f.vendedor_id
       LEFT JOIN public.processos_transferencia p ON p.ficha_id = f.id
       WHERE ${scope}
         AND (COALESCE(f.comprou, FALSE) = TRUE OR COALESCE(l.venda_concluida, FALSE) = TRUE)
       ORDER BY f.id DESC
       LIMIT 200`,
      params,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
