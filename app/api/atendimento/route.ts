import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ROLES = new Set(['superadmin', 'admin', 'gerente', 'marketing']);

/**
 * Dashboard resiliente a tabelas legadas: cada bloco pode falhar independentemente.
 * Em erro, nao finge que existem zero leads: devolve avisos e estado incompleto.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const role = String(user.tipo || '').toLowerCase();
  if (!ROLES.has(role)) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });
  const requested = Number(req.nextUrl.searchParams.get('empresa_id'));
  const empresaId = role === 'superadmin' ? requested : Number(user.empresa_id);
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) {
    return NextResponse.json({ error: 'Selecione uma empresa valida' }, { status: 400 });
  }
  if (role !== 'superadmin' && empresaId !== Number(user.empresa_id)) {
    return NextResponse.json({ error: 'Empresa nao autorizada' }, { status: 403 });
  }
  try {
    const empresa = await queryOne<{ id: number }>('SELECT id FROM public.empresas WHERE id=$1 AND ativo=TRUE', [empresaId]);
    if (!empresa) return NextResponse.json({ error: 'Empresa inexistente ou inativa' }, { status: 404 });

    const colsRes = await query<{table_name:string; column_name:string}>(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=ANY($1::text[])`,
      [['leads','vendedores','triagem','manu_atendimento_transferencias']]);
    const cols = new Set(colsRes.rows.map((r) => `${r.table_name}.${r.column_name}`));
    const has = (table:string, col:string) => cols.has(`${table}.${col}`);
    const hasTable = (table:string) => Array.from(cols).some((k) => k.startsWith(`${table}.`));
    // Estas strings sao fixas no codigo, nunca derivadas de requisicoes do usuario.
    const clock = [
      has('leads', 'atribuido_em') ? 'l.atribuido_em::timestamptz' : '',
      has('leads', 'created_at') ? 'l.created_at::timestamptz' : '',
      has('leads', 'data_lead') ? 'l.data_lead::timestamptz' : '',
    ].filter(Boolean);
    const dateExpr = clock.length ? `COALESCE(${clock.join(', ')})` : 'NULL::timestamptz';
    const answered = has('leads','respondeu') ? 'COALESCE(l.respondeu,FALSE)' : 'FALSE';
    const sold = has('leads','venda_concluida') ? 'COALESCE(l.venda_concluida,FALSE)' : 'FALSE';
    const name = has('leads','nome_lead') ? 'l.nome_lead' : 'NULL::text';
    const phone = has('leads','telefone') ? 'l.telefone' : 'NULL::text';
    const email = has('leads','email') ? 'l.email' : 'NULL::text';
    const vehicle = has('leads','produto_interesse') ? 'l.produto_interesse' : 'NULL::text';
    const notes = has('leads','observacao') ? 'l.observacao' : 'NULL::text';
    const active = has('vendedores','ativo') ? 'COALESCE(v.ativo,TRUE)' : 'TRUE';
    const warns: string[] = [];

    async function section<T>(key: string, sql: string, args: unknown[]): Promise<T[]> {
      try { return (await query(sql,args)).rows as T[]; }
      catch (e) {
        console.error(`[atendimento:${key}]`, e instanceof Error ? e.message : 'erro');
        warns.push(`Nao foi possivel carregar ${key}. Verifique as colunas e a migration no servidor.`);
        return [];
      }
    }
    const leadQuery = `
      SELECT l.id, ${name} AS nome, ${phone} AS telefone, ${email} AS email,
             ${vehicle} AS veiculo, ${notes} AS mensagem,
             v.id AS vendedor_id, v.nome AS vendedor, v.loja,
             ${dateExpr} AS desde,
             GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now()-${dateExpr}))/60))::int AS minutos_aguardando
      FROM public.leads l JOIN public.vendedores v ON v.id=l.vendedor_id
      WHERE v.empresa_id=$1 AND ${answered}=FALSE AND ${sold}=FALSE
      ORDER BY desde ASC NULLS LAST LIMIT 150`;
    const triagemQuery = hasTable('triagem') && has('triagem','empresa_id')
      ? `SELECT id, nome, telefone, email, interesse AS veiculo, mensagem,
                origem, created_at AS desde,
                GREATEST(0,FLOOR(EXTRACT(EPOCH FROM(now()-created_at))/60))::int AS minutos_aguardando
           FROM public.triagem WHERE empresa_id=$1 AND status='aguardando'
           ORDER BY created_at ASC LIMIT 150`
      : null;
    if (!triagemQuery) warns.push('Triagem ainda nao tem empresa_id. Execute a migration de integracoes antes de importar leads.');
    const auditCount = hasTable('manu_atendimento_transferencias')
      ? `(SELECT COUNT(*)::int FROM public.manu_atendimento_transferencias t
           WHERE t.empresa_id=$1 AND t.de_vendedor_id=v.id
             AND t.motivo IN ('sem_resposta','auto','supervisao_atendimento')
             AND (t.criado_em AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date)`
      : '0::int';
    if (!hasTable('manu_atendimento_transferencias')) warns.push('A migration de auditoria de atendimento nao foi executada. Coluna de transferencias fica indisponivel.');
    const today = `(date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')`;
    const sellersQuery = `SELECT v.id, v.nome, v.loja,
        COUNT(l.id) FILTER (WHERE ${dateExpr} >= ${today})::int AS recebidos_hoje,
        COUNT(l.id) FILTER (WHERE ${answered}=FALSE AND ${sold}=FALSE
          AND ${dateExpr}<now()-interval '10 minutes')::int AS pendentes_atrasados,
        COUNT(l.id) FILTER (WHERE ${answered}=TRUE)::int AS atendidos_registrados,
        ${auditCount} AS perdidos_hoje
        FROM public.vendedores v LEFT JOIN public.leads l ON l.vendedor_id=v.id
        WHERE v.empresa_id=$1 AND ${active}
        GROUP BY v.id,v.nome,v.loja ORDER BY v.loja,v.nome`;
    const [leads, triagem, sellers] = await Promise.all([
      section('leads sem resposta',leadQuery,[empresaId]),
      triagemQuery ? section('fila de triagem',triagemQuery,[empresaId]) : Promise.resolve([]),
      section('indicadores de vendedores',sellersQuery,[empresaId]),
    ]);
    return NextResponse.json({
      empresa_id: empresaId, limite_minutos: 10,
      total_pendentes: leads.length+triagem.length,
      sem_resposta: leads, fila: triagem, vendedores: sellers,
      avisos: warns, incompleto: warns.length>0,
      atualizado_em: new Date().toISOString(),
    }, {headers:{'Cache-Control':'no-store'}});
  } catch (e) {
    console.error('[atendimento:principal]',e instanceof Error ? e.message : 'erro');
    return NextResponse.json({ error:'Falha ao consultar o banco do atendimento. Consulte os logs do servidor; os indicadores nao foram calculados.' },{status:500});
  }
}
