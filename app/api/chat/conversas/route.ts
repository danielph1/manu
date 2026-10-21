import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin, isGerenteLoja } from '@/lib/tenant';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const busca = (new URL(req.url).searchParams.get('busca') || '').trim();
  const where: string[] = ['TRUE'];
  const params: unknown[] = [];

  const tipo = String(u.tipo || '').toLowerCase();
  if (tipo === 'vendedor' && u.vendedor_id) {
    params.push(u.vendedor_id);
    where.push(`l.vendedor_id = $${params.length}`);
  } else if (isGerenteLoja(u) && u.loja) {
    params.push(String(u.loja).toUpperCase());
    let g = `l.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($${params.length})`;
    if (u.empresa_id) {
      params.push(u.empresa_id);
      g += ` AND empresa_id = $${params.length}`;
    }
    g += ')';
    where.push(g);
  } else if (!isSuperAdmin(u) && u.empresa_id) {
    params.push(u.empresa_id);
    where.push(
      `(l.vendedor_id IS NULL OR l.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id = $${params.length}))`,
    );
  }

  if (busca) {
    params.push(`%${busca}%`);
    const p = `$${params.length}`;
    where.push(`(
      COALESCE(l.nome_lead,'') ILIKE ${p}
      OR COALESCE(l.nome_completo,'') ILIKE ${p}
      OR COALESCE(l.telefone,'') ILIKE ${p}
      OR COALESCE(l.email,'') ILIKE ${p}
      OR COALESCE(l.cpf,'') ILIKE ${p}
      OR COALESCE(l.cpf_cnpj,'') ILIKE ${p}
      OR COALESCE(l.marca_carro,'') ILIKE ${p}
      OR COALESCE(l.modelo,'') ILIKE ${p}
      OR COALESCE(l.produto_interesse,'') ILIKE ${p}
      OR COALESCE(l.placa_carro,'') ILIKE ${p}
    )`);
  }

  const { rows } = await query(
    `SELECT l.id,
            COALESCE(NULLIF(TRIM(l.nome_completo),''), NULLIF(TRIM(l.nome_lead),''), l.telefone, 'Lead') AS nome,
            l.telefone, l.email,
            COALESCE(l.marca_carro, l.produto_interesse) AS interesse,
            (SELECT mensagem FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id ORDER BY m.created_at DESC LIMIT 1) AS ultima,
            (SELECT COUNT(*)::int FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id) AS total,
            (SELECT MAX(id) FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id) AS ultimo_id,
            (SELECT MAX(m.created_at) FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id) AS ultima_em,
            COALESCE(l.created_at, l.data_lead) AS criado_em
     FROM public.leads l
     WHERE ${where.join(' AND ')}
     ORDER BY
       -- último a chegar / última mensagem no topo (estilo redes sociais)
       COALESCE(
         (SELECT MAX(m.created_at) FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id),
         l.created_at,
         l.data_lead
       ) DESC NULLS LAST,
       l.id DESC
     LIMIT 300`,
    params,
  );
  return NextResponse.json(rows);
}
