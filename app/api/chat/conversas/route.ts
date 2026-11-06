import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isGerenteLoja } from '@/lib/tenant';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const busca = (new URL(req.url).searchParams.get('busca') || '').trim();
  const where: string[] = ['TRUE'];
  const params: unknown[] = [];

  const tipo = String(u.tipo || '').toLowerCase();
  if (tipo === 'vendedor' && !u.vendedor_id) return NextResponse.json({ error: 'Usuário vendedor sem vínculo cadastrado' }, { status: 403 });
  if (tipo === 'gerente' && !u.loja) return NextResponse.json({ error: 'Gerente sem loja atribuída' }, { status: 403 });
  // Toda consulta deve estar limitada à empresa, inclusive para leads sem vendedor.
  if (tipo !== 'superadmin') {
    if (!u.empresa_id) return NextResponse.json({ error: 'Usuário sem empresa definida' }, { status: 403 });
    params.push(Number(u.empresa_id));
    where.push(`COALESCE(l.empresa_id, (SELECT vv.empresa_id FROM public.vendedores vv WHERE vv.id=l.vendedor_id)) = $${params.length}`);
  }

  if (tipo === 'vendedor' && u.vendedor_id) {
    params.push(u.vendedor_id);
    where.push(`l.vendedor_id = $${params.length}`);
  } else if (isGerenteLoja(u) && u.loja) {
    params.push(String(u.loja).toUpperCase());
    let g = `l.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'')) = UPPER($${params.length})`;
    if ((u as any).empresa_id) {
      params.push((u as any).empresa_id);
      g += ` AND empresa_id = $${params.length}`;
    }
    g += ')';
    where.push(g);
  }

  if (busca) {
    // um único padrão — ILIKE em campos comuns
    params.push(`%${busca}%`);
    const p = `$${params.length}`;
    where.push(`(
      COALESCE(l.nome_lead,'') ILIKE ${p}
      OR COALESCE(l.nome_completo,'') ILIKE ${p}
      OR COALESCE(l.telefone,'') ILIKE ${p}
      OR COALESCE(l.email,'') ILIKE ${p}
      OR COALESCE(l.cpf,'') ILIKE ${p}
      OR COALESCE(l.produto_interesse,'') ILIKE ${p}
      OR COALESCE(l.observacao,'') ILIKE ${p}
    )`);
  }

  const sql = `
    SELECT l.id,
           COALESCE(NULLIF(TRIM(l.nome_completo),''), NULLIF(TRIM(l.nome_lead),''), l.telefone, 'Lead') AS nome,
           l.telefone, l.email,
           (COALESCE(TRIM(l.comentario_interno),'')<>'' OR COALESCE(l.rotacionar,TRUE)=FALSE) AS fixado,
           COALESCE(l.produto_interesse, '') AS interesse,
           (SELECT mensagem FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id ORDER BY m.created_at DESC LIMIT 1) AS ultima,
           (SELECT COUNT(*)::int FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id) AS total,
           (SELECT MAX(m.created_at) FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id) AS ultima_em,
           COALESCE(l.created_at, l.data_lead) AS criado_em
    FROM public.leads l
    WHERE ${where.join(' AND ')}
    ORDER BY
      COALESCE(
        (SELECT MAX(m.created_at) FROM public.chat_geral_mensagens m WHERE m.lead_id = l.id),
        l.created_at,
        l.data_lead
      ) DESC NULLS LAST,
      l.id DESC
    LIMIT 300`;

  try {
    const { rows } = await query(sql, params);
    return NextResponse.json(rows);
  } catch (err: any) {
    console.error('[conversas]', err?.message || err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
