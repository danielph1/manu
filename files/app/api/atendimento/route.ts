import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['superadmin', 'admin', 'gerente', 'marketing']);
const MINUTES_LIMIT = 10;

/**
 * Visao da EMPRESA; nem mesmo o superadmin mistura empresas num mesmo relatorio.
 * "Sem resposta" e definido pelo campo leads.respondeu; nao implica que a
 * pessoa foi ignorada por outros canais fora do MANU.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const role = String(user.tipo).toLowerCase();
  if (!ALLOWED.has(role)) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });
  const requested = Number(req.nextUrl.searchParams.get('empresa_id'));
  const empresaId = role === 'superadmin' ? requested : Number(user.empresa_id);
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) {
    return NextResponse.json({ error: 'Selecione uma empresa valida' }, { status: 400 });
  }
  if (role !== 'superadmin' && empresaId !== Number(user.empresa_id)) {
    return NextResponse.json({ error: 'Empresa nao autorizada' }, { status: 403 });
  }

  try {
    const empresa = await queryOne('SELECT id FROM public.empresas WHERE id=$1 AND ativo=TRUE', [empresaId]);
    if (!empresa) return NextResponse.json({ error: 'Empresa indisponivel' }, { status: 404 });

    const [leads, triagem, equipe] = await Promise.all([
      query(`
        SELECT l.id, l.nome_lead AS nome, l.telefone, l.email,
               l.produto_interesse AS veiculo, l.observacao AS mensagem,
               v.id AS vendedor_id, v.nome AS vendedor, v.loja,
               COALESCE(l.atribuido_em, l.created_at, l.data_lead::timestamp) AS desde,
               GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                 now() - COALESCE(l.atribuido_em, l.created_at, l.data_lead::timestamp)
               )) / 60))::int AS minutos_aguardando
          FROM public.leads l
          JOIN public.vendedores v ON v.id = l.vendedor_id
         WHERE v.empresa_id=$1 AND COALESCE(l.respondeu, FALSE) = FALSE
           AND COALESCE(l.venda_concluida, FALSE) = FALSE
         ORDER BY desde ASC NULLS LAST LIMIT 150`, [empresaId]),
      query(`SELECT id, nome, telefone, email, interesse AS veiculo, mensagem,
                    origem, created_at AS desde,
                    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now()-created_at))/60))::int AS minutos_aguardando
               FROM public.triagem
              WHERE empresa_id=$1 AND status='aguardando'
              ORDER BY created_at ASC LIMIT 150`, [empresaId]),
      query(`SELECT v.id, v.nome, v.loja,
                    COUNT(l.id) FILTER (WHERE
                       COALESCE(l.atribuido_em, l.created_at, l.data_lead::timestamp)
                         >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')
                    )::int AS recebidos_hoje,
                    COUNT(l.id) FILTER (WHERE COALESCE(l.respondeu, FALSE) = FALSE
                       AND COALESCE(l.venda_concluida,FALSE) = FALSE
                       AND COALESCE(l.atribuido_em, l.created_at, l.data_lead::timestamp)
                             < now() - interval '10 minutes')::int AS pendentes_atrasados,
                    COUNT(l.id) FILTER (WHERE COALESCE(l.respondeu,FALSE) = TRUE)::int AS atendidos_registrados,
                    (SELECT COUNT(*)::int FROM public.manu_atendimento_transferencias t
                      WHERE t.empresa_id=$1 AND t.de_vendedor_id=v.id AND t.motivo='sem_resposta'
                        AND (t.criado_em AT TIME ZONE 'America/Sao_Paulo')::date =
                            (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS perdidos_hoje
               FROM public.vendedores v
               LEFT JOIN public.leads l ON l.vendedor_id=v.id
              WHERE v.empresa_id=$1 AND COALESCE(v.ativo,TRUE)=TRUE
              GROUP BY v.id, v.nome, v.loja ORDER BY v.loja, v.nome`, [empresaId]),
    ]);

    return NextResponse.json({
      empresa_id: empresaId,
      limite_minutos: MINUTES_LIMIT,
      total_pendentes: triagem.rows.length + leads.rows.length,
      fila: triagem.rows,
      sem_resposta: leads.rows,
      vendedores: equipe.rows,
      atualizado_em: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('atendimento', e instanceof Error ? e.message : 'erro');
    return NextResponse.json({ error: 'Falha no painel. Confira migrations e colunas do banco.' }, { status: 500 });
  }
}
