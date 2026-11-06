import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { resolverEscopoMetricas, periodoMetricas } from '@/lib/metricas/escopo';
import { analisarDesempenho, type Linha, type Vendedor } from '@/lib/desempenho/analise';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

export async function GET(req:NextRequest) {
  const usuario=await requireUser(req);
  if(!usuario) return json({error:'Não autenticado'},401);
  const sp=req.nextUrl.searchParams;
  let escopo:ReturnType<typeof resolverEscopoMetricas>;
  try {escopo=resolverEscopoMetricas(usuario,sp.get('empresa_id'),sp.get('loja'));}
  catch {return json({error:'Empresa, loja ou permissão inválida'},403);}
  const {empresaId,loja}=escopo;
  const periodo=sp.get('periodo')||'90dias';
  if(!['mes','mes_passado','90dias','tudo'].includes(periodo))return json({error:'Período inválido'},400);
  const range=periodo==='90dias'
    ? {inicio:new Date(Date.now()-90*24*60*60*1000).toISOString().slice(0,10),fim:null,etiqueta:'Últimos 90 dias'}
    : periodoMetricas(periodo);
  try {
    const empresa=await queryOne<{id:number;nome:string}>(
      'SELECT id,nome FROM public.empresas WHERE id=$1 AND ativo=TRUE',[empresaId]);
    if(!empresa) return json({error:'Empresa inexistente ou inativa'},404);
    const {rows:colunas}=await query<{table_name:string;column_name:string}>(`
      SELECT table_name,column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=ANY($1::text[])`,[
      ['leads','vendedores','fichas_credito','origens_lead','triagem','manu_atendimento_transferencias']]);
    const cols=new Map<string,Set<string>>();
    for(const c of colunas){if(!cols.has(c.table_name))cols.set(c.table_name,new Set());cols.get(c.table_name)!.add(c.column_name);}
    const has=(t:string,...cs:string[])=>cs.every(c=>cols.get(t)?.has(c));
    const mandatory=has('leads','empresa_id','vendedor_id','data_lead','respondeu','gerou_ficha','aprovado','venda_concluida','nome_lead','telefone','produto_interesse','observacao')
      && has('vendedores','id','empresa_id','nome','loja') && has('fichas_credito','lead_id','status_geral');
    if(!mandatory)return json({error:'Estrutura necessária de leads, vendedores ou fichas incompleta. Confira migrations.'},503);
    const canTri=has('triagem','lead_id','empresa_id','origem');
    const canOrigem=has('origens_lead','id','nome')&&has('leads','origem_id');
    const canTransfer=has('manu_atendimento_transferencias','empresa_id','lead_id');
    const hasEmail=has('leads','email');
    const hasVendaDate=has('leads','data_venda');
    const hasCreated=has('leads','created_at');
    const data=hasCreated?'COALESCE(l.data_lead::date,l.created_at::date)':'l.data_lead::date';
    const source=canTri&&canOrigem?`COALESCE(NULLIF(t.origem,''),NULLIF(o.nome,''),'Não identificada')`
      :canTri?`COALESCE(NULLIF(t.origem,''),'Não identificada')`
      :canOrigem?`COALESCE(NULLIF(o.nome,''),'Não identificada')`:`'Não identificada'`;
    const triJoin=canTri?`LEFT JOIN LATERAL (
      SELECT t.origem FROM public.triagem t
      WHERE t.empresa_id=$1 AND t.lead_id=l.id ORDER BY t.id ASC LIMIT 1
    ) t ON true`:'';
    const origJoin=canOrigem?'LEFT JOIN public.origens_lead o ON o.id=l.origem_id':'';
    const ficha=`EXISTS (SELECT 1 FROM public.fichas_credito ff WHERE ff.lead_id=l.id)`;
    const aprovado=`(COALESCE(l.aprovado,FALSE) OR EXISTS (
      SELECT 1 FROM public.fichas_credito fa WHERE fa.lead_id=l.id
      AND LOWER(COALESCE(fa.status_geral,'')) ~ '^(aprov|liberad)'))`;
    const venda=hasVendaDate?'(COALESCE(l.venda_concluida,FALSE) OR l.data_venda IS NOT NULL)':'COALESCE(l.venda_concluida,FALSE)';
    const transfer=canTransfer?`EXISTS(SELECT 1 FROM public.manu_atendimento_transferencias tr
       WHERE tr.empresa_id=$1 AND tr.lead_id=l.id)`:'FALSE';
    const qualidade=`(
      CASE WHEN LENGTH(TRIM(COALESCE(l.nome_lead,'')))>2 THEN 25 ELSE 0 END +
      CASE WHEN LENGTH(REGEXP_REPLACE(COALESCE(l.telefone,''),'[^0-9]','','g'))>=10
           ${hasEmail?"OR COALESCE(l.email,'') LIKE '%@%.%'":''}
           THEN 25 ELSE 0 END +
      CASE WHEN LENGTH(TRIM(COALESCE(l.produto_interesse,'')))>2 THEN 25 ELSE 0 END +
      CASE WHEN LENGTH(TRIM(COALESCE(l.observacao,'')))>2 THEN 25 ELSE 0 END
    )`;
    const params:unknown[]=[empresaId];let where='(l.empresa_id=$1 OR l.empresa_id IS NULL)';
    if(loja){params.push(loja);where+=` AND UPPER(COALESCE(v.loja,''))=$${params.length}`;}
    if(range.inicio){params.push(range.inicio);where+=` AND ${data} >= $${params.length}::date`;}
    if(range.fim){params.push(range.fim);where+=` AND ${data} < $${params.length}::date`;}
    const {rows:linhas}=await query<Linha>(`
      WITH base AS (
        SELECT v.id AS vendedor_id,v.nome AS vendedor,v.loja,${source} AS origem,
          COALESCE(l.respondeu,FALSE) AS respondeu,
          ${ficha} AS ficha,${aprovado} AS aprovado,${venda} AS venda,
          (${data} < CURRENT_DATE - INTERVAL '30 days') AS maduro,
          ${qualidade} AS completude,${transfer} AS transferido
        FROM public.leads l
        JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=$1
        ${triJoin} ${origJoin}
        WHERE ${where}
      )
      SELECT vendedor_id,vendedor,loja,origem,
        COUNT(*)::int AS leads,
        COUNT(*) FILTER (WHERE respondeu)::int AS respondidos,
        COUNT(*) FILTER (WHERE ficha)::int AS fichas,
        COUNT(*) FILTER (WHERE ficha AND aprovado)::int AS aprovados,
        COUNT(*) FILTER (WHERE venda)::int AS vendas,
        COUNT(*) FILTER (WHERE maduro)::int AS maduros,
        COUNT(*) FILTER (WHERE maduro AND venda)::int AS vendas_maduros,
        COUNT(*) FILTER (WHERE maduro AND respondeu)::int AS respondidos_maduros,
        COUNT(*) FILTER (WHERE maduro AND ficha)::int AS fichas_maduros,
        COALESCE(SUM(completude),0)::int AS completude_total,
        COUNT(*) FILTER (WHERE transferido)::int AS transferidos
      FROM base GROUP BY vendedor_id,vendedor,loja,origem ORDER BY vendedor,origem
      LIMIT 5001`,params);
    if(linhas.length>5000)return json({error:'Número elevado de combinações vendedor/origem; refine o período ou a loja.'},413);
    const sellerParams:unknown[]=[empresaId];let sellerWhere='empresa_id=$1';
    if(loja){sellerParams.push(loja);sellerWhere+=` AND UPPER(COALESCE(loja,''))=$2`;}
    const {rows:cadastro}=await query<{id:number;nome:string;loja:string|null}>(`
      SELECT id,nome,loja FROM public.vendedores WHERE ${sellerWhere}
      AND COALESCE(ativo,TRUE)=TRUE ORDER BY nome LIMIT 500`,sellerParams);
    const resultado=analisarDesempenho(linhas,cadastro as Vendedor[]);
    const avisos:string[]=[];
    if(!canTri&&!canOrigem)avisos.push('Não há vínculo de origem disponível. A análise por canal fica limitada.');
    if(!canTransfer)avisos.push('Não existe auditoria de transferências acessível: movimentações anteriores não podem ser identificadas.');
    if(!range.inicio)avisos.push('Histórico completo mistura períodos antigos com mudanças de canal e equipe. Prefira 90 dias para comparação.');
    return json({empresa,loja:loja||null,periodo:{...range,coorte:'Data de recebimento do lead',maturacao_dias:30},
      ...resultado,avisos,atualizado_em:new Date().toISOString(),
      metodologia:{
        atribuicao:'Carteira atribuída ao vendedor atual. Transferências podem afetar a atribuição de resultados.',
        origem:'Primeira origem na triagem vinculada; se não existir, origem cadastrada no lead (quando disponível).',
        denominadores:'Fichas contam registros existentes em fichas_credito. Aprovações usam o status registrado no lead ou na ficha. Vendas usam sinalização de venda no CRM; não equivalem a pagamentos. Taxas: ficha/leads, aprovados/fichas, vendas/leads. Vendas à vista não precisam de aprovação.',
        maturacao:'A comparação de vendas usa apenas leads recebidos há pelo menos 30 dias. O período filtra entrada de leads, não a data em que venderam.',
        completude:'Mede nome, contato, interesse e descrição (0 a 100), não intenção real de compra.',
        inferencia:'Comparações são observacionais; distribuição dos leads, volume, estoque, crédito e trabalho em equipe podem explicar diferenças. Não use como decisão disciplinar automática.',
      }},200);
  }catch(e){console.error('[desempenho] consulta falhou',e instanceof Error?e.message:'erro');
    return json({error:'Não foi possível calcular desempenho. Confira as tabelas e os índices.'},500);}
}
