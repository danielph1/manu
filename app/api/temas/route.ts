import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

const TODOS = ['escuro', 'claro', 'azul', 'verde', 'rosa', 'preto', 'ambar', 'grafite', 'aurora', 'cristal', 'platinum'];
const LIVRE = ['admin', 'gerente', 'documento', 'documentista', 'elfenai', 'marketing', 'superadmin'];

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  if (LIVRE.includes(String(u.tipo || '').toLowerCase())) {
    return NextResponse.json({ liberados: TODOS, total: 0, mes: 0 });
  }

  let total = 0;
  let mes = 0;
  if (u.vendedor_id) {
    const r = await query(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(venda_concluida,FALSE) OR data_venda IS NOT NULL)::int AS total,
         COUNT(*) FILTER (WHERE (COALESCE(venda_concluida,FALSE) OR data_venda IS NOT NULL)
           AND COALESCE(data_venda, data_lead, created_at) >= date_trunc('month', CURRENT_DATE))::int AS mes
       FROM public.leads WHERE vendedor_id = $1`,
      [u.vendedor_id],
    );
    total = Number(r.rows[0]?.total || 0);
    mes = Number(r.rows[0]?.mes || 0);
  }

  const liberados = new Set(['escuro', 'claro']);
  const tipo = String(u.tipo || '').toLowerCase();
  if (tipo === 'guariba' || tipo === 'mecanico') liberados.add('preto');
  if (total >= 1) ['azul', 'verde'].forEach((t) => liberados.add(t));
  if (total >= 2) ['rosa', 'preto'].forEach((t) => liberados.add(t));
  if (mes >= 3) liberados.add('ambar');
  if (mes >= 4) liberados.add('aurora');
  if (mes >= 5) liberados.add('cristal');
  if (total >= 10) liberados.add('platinum');

  // aviso seco, uma vez por tema
  const novos = [...liberados].filter((t) => !['escuro', 'claro'].includes(t));
  for (const tema of novos) {
    const ja = await query(
      `SELECT 1 FROM public.notificacoes WHERE usuario_id = $1 AND tipo = 'tema' AND mensagem = $2 LIMIT 1`,
      [u.id, tema],
    );
    if (!ja.rows.length) {
      await query(
        `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem)
         VALUES ($1, 'tema', 'Tema liberado', $2)`,
        [u.id, tema],
      );
    }
  }

  return NextResponse.json({ liberados: [...liberados], total, mes });
}
