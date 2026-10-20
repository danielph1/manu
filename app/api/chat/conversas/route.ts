import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin, isGerenteLoja } from '@/lib/tenant';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const where: string[] = ['TRUE'];
  const params: unknown[] = [];
  if (u.tipo === 'vendedor' && u.vendedor_id) {
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
    where.push(`(l.vendedor_id IS NULL OR l.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id = $${params.length}))`);
  }

  const { rows } = await query(
    `SELECT l.id, COALESCE(l.nome_completo, l.nome_lead) AS nome, l.telefone, l.email,
            COALESCE(l.marca_carro, l.produto_interesse) AS interesse,
            (SELECT mensagem FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id ORDER BY m.created_at DESC LIMIT 1) AS ultima,
            (SELECT COUNT(*)::int FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id) AS total,
            (SELECT MAX(id) FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id) AS ultimo_id
     FROM public.leads l
     WHERE ${where.join(' AND ')}
     ORDER BY l.created_at DESC
     LIMIT 100`,
    params,
  );
  return NextResponse.json(rows);
}
