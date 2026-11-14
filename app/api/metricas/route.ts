import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { resolverEscopoMetricas, periodoMetricas, indiceQualidade, projetarCorpos } from '@/lib/metricas/escopo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FONTES = ['empresas','vendedores','leads','triagem','origens_lead','fichas_credito','ficha_bancos',
  'estoque_carros','faturamentos','oficina_carros','manu_movimentos_caixa','manu_atendimento_transferencias','usuarios','manu_integracoes','manu_integracao_eventos'];

type Caps = Map<string, Set<string>>;
const existe = (caps: Caps, tabela: string, ...colunas: string[]) => !!caps.get(tabela) && colunas.every(c => caps.get(tabela)!.has(c));
async function colunas(): Promise<Caps> {
  const { rows } = await query<{table_name:string;column_name:string}>(
    `SELECT table_name,column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name = ANY($1::text[])`, [FONTES]);
  const m: Caps = new Map();
  for (const r of rows) { if (!m.has(r.table_name)) m.set(r.table_name,new Set()); m.get(r.table_name)!.add(r.column_name); }
  return m;
}
const n = (x: unknown) => Number.isFinite(Number(x)) ? Number(x) : 0;
const taxa = (a: number,b: number) => b ? a / b : null;
const dateRange = (col: string, di: string|null, df: string|null, params: unknown[]) => {
  let clause='';
  if (di) {params.push(di);clause += ` AND ${col}::date >= $${params.length}::date`;}
  if (df) {params.push(df);clause += ` AND ${col}::date < $${params.length}::date`;}
  return clause;
};

export async function GET(req: NextRequest) {
  const usuario = await requireUser(req);
  if (!usuario) return NextResponse.json({error:'não autenticado'}, {status:401});
  const sp = req.nextUrl.searchParams;
  let escopo: ReturnType<typeof resolverEscopoMetricas>;
  try { escopo = resolverEscopoMetricas(usuario, sp.get('empresa_id'), sp.get('loja')); }
  catch (e) { const code=String((e as Error).message);return NextResponse.json({error: code==='EMPRESA_OBRIGATORIA'?'Selecione a empresa para consultar métricas':code==='PERMISSAO'?'Sem permissão':code==='LOJA_OBRIGATORIA'?'Gerente sem loja atribuída':'Loja inválida'}, {status:code==='PERMISSAO'?403:400}); }
  const { empresaId, loja, papel } = escopo;
  const leituraFinanceira=papel==='superadmin'||papel==='admin';
  const { inicio, fim, etiqueta } = periodoMetricas(sp.get('periodo') || 'mes');
  const alertas:string[]=[];
  const disponibilidade:Record<string,boolean>={};
  const executar = async <T,>(rotulo:string, requisito:boolean, fn:()=>Promise<T>):Promise<T|null> => {
    if (!requisito) {disponibilidade[rotulo]=false;alertas.push(`${rotulo}: tabelas ou colunas necessárias ausentes. Execute o diagnóstico SQL.`);return null;}
    try { const r=await fn(); disponibilidade[rotulo]=true; return r; }
    catch(e) {disponibilidade[rotulo]=false;console.error('[metricas]',rotulo,e instanceof Error?e.message:'erro');alertas.push(`${rotulo}: consulta indisponível; o painel não substituirá por zero.`);return null;}
  };
  try {
    const empresa = await queryOne<{id:number;nome:string}>(`SELECT id,nome FROM public.empresas WHERE id=$1`,[empresaId]);
    if(!empresa) return NextResponse.json({error:'Empresa inexistente'}, {status:404});
    // Somente dados vinculados com segurança a esta empresa. Leads antigos sem empresa e sem vendedor não entram.
    const vendasScope = (p:unknown[], alias='l', vendedor='v') => {
      p.push(empresaId); let sql=` AND (${alias}.empresa_id=$${p.length} OR (${alias}.empresa_id IS NULL AND ${vendedor}.empresa_id=$${p.length}))`;
      if(loja){p.push(loja);sql+=` AND UPPER(COALESCE(${vendedor}.loja,''))=$${p.length}`;}
      return sql;
    };
    const withVendedores = ` LEFT JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=${empresaId}`;
    const filtroLead = (p:unknown[], d='l.data_lead') => dateRange(d,inicio,fim,p)+vendasScope(p);
    const caps = await colunas();
    const baseLeads = existe(caps,'leads','empresa_id','vendedor_id','data_lead','respondeu','gerou_ficha','aprovado','venda_concluida','nome_lead','telefone','produto_interesse','observacao');
    const leadOk = baseLeads && existe(caps,'vendedores','empresa_id','loja');
    let funil = await executar('Funil de leads',leadOk,async()=>{
      const p:unknown[]=[]; const w=filtroLead(p);
      const venda = existe(caps,'leads','data_venda') ? `(COALESCE(l.venda_concluida,false) OR l.data_venda IS NOT NULL)` : `COALESCE(l.venda_concluida,false)`;
      return await queryOne<any>(`SELECT COUNT(*)::int AS leads,
      COUNT(*) FILTER (WHERE COALESCE(l.respondeu,false))::int AS responderam,
      COUNT(*) FILTER (WHERE COALESCE(l.gerou_ficha,false))::int AS fichas,
      COUNT(*) FILTER (WHERE COALESCE(l.aprovado,false))::int AS aprovados,
      COUNT(*) FILTER (WHERE ${venda})::int AS vendidos
      FROM public.leads l ${withVendedores} WHERE 1=1 ${w}`,p);
    });
    if(funil) funil=Object.fromEntries(Object.entries(funil).map(([k,v])=>[k,n(v)]));
    const vendedores = await executar('Desempenho dos vendedores',leadOk,async()=>{
      const p:unknown[]=[empresaId];let where=`v.empresa_id=$1`;
      if(loja){p.push(loja);where+=` AND UPPER(COALESCE(v.loja,''))=$${p.length}`;}
      const pLeads:unknown[]=[];
      dateRange('l.data_lead',inicio,fim,pLeads);
      // pLeads tem parâmetros de período: os índices são deslocados pelos parâmetros do vendedor.
      for(const val of pLeads) p.push(val);
      let dateSQL='';const iniIndex=loja?3:2;
      if(inicio)dateSQL+=` AND l.data_lead::date >= $${iniIndex}::date`;
      if(fim)dateSQL+=` AND l.data_lead::date < $${iniIndex+(inicio?1:0)}::date`;
      const sold=existe(caps,'leads','data_venda')?`(COALESCE(l.venda_concluida,false) OR l.data_venda IS NOT NULL)`:`COALESCE(l.venda_concluida,false)`;
      return (await query(`SELECT v.id,v.nome,v.loja,COUNT(l.id)::int AS leads_atuais,
        COUNT(l.id) FILTER (WHERE COALESCE(l.respondeu,false))::int AS respondidos,
        COUNT(l.id) FILTER (WHERE COALESCE(l.gerou_ficha,false))::int AS fichas,
        COUNT(l.id) FILTER (WHERE COALESCE(l.aprovado,false))::int AS aprovados,
        COUNT(l.id) FILTER (WHERE ${sold})::int AS vendidos,
        COUNT(l.id) FILTER (WHERE NOT COALESCE(l.respondeu,false) AND COALESCE(l.atribuido_em,l.data_lead::timestamp) < NOW()-INTERVAL '10 minutes')::int AS atrasados
        FROM public.vendedores v LEFT JOIN public.leads l ON l.vendedor_id=v.id ${dateSQL}
        WHERE ${where} GROUP BY v.id,v.nome,v.loja ORDER BY leads_atuais DESC,v.nome`,p)).rows.map((r:any)=>({
          ...r, leads_atuais:n(r.leads_atuais), respondidos:n(r.respondidos),fichas:n(r.fichas),
          aprovados:n(r.aprovados),vendidos:n(r.vendidos),atrasados:n(r.atrasados),
          conversao:taxa(n(r.vendidos),n(r.leads_atuais)),taxa_resposta:taxa(n(r.respondidos),n(r.leads_atuais)),
        }));
    });
    const funcionarios = await executar('Quadro de funcionários',existe(caps,'usuarios','id','empresa_id','nome','tipo','loja','vendedor_id'),async()=>{
      const p:unknown[]=[empresaId];let w='u.empresa_id=$1';
      if(loja){p.push(loja);w+=` AND UPPER(COALESCE(u.loja,''))=$${p.length}`;}
      if(existe(caps,'usuarios','ativo'))w+=' AND COALESCE(u.ativo,true)=true';
      const rows=(await query(`SELECT u.id,u.nome,u.tipo,u.loja,u.vendedor_id
        FROM public.usuarios u WHERE ${w} ORDER BY u.tipo,u.nome LIMIT 2000`,p)).rows;
      const stats=new Map((vendedores||[]).map((v:any)=>[Number(v.id),v]));
      return rows.map((u:any)=>{
        const v=stats.get(Number(u.vendedor_id)) as any;
        return {id:u.id,nome:u.nome,cargo:u.tipo,loja:u.loja||'—',
          leads_atuais:v?.leads_atuais??null,respondidos:v?.respondidos??null,
          vendas:v?.vendidos??null,conversao:v?.conversao??null,
          observacao:v?'Indicadores de carteira comercial atual':'Sem indicadores operacionais vinculados'};
      });
    });
    // Atribuições passadas não são somadas aos leads atualmente na carteira.
    const transferencias = await executar('Transferências por atraso',existe(caps,'manu_atendimento_transferencias','empresa_id','de_vendedor_id','motivo','criado_em'),async()=>{
      const p:unknown[]=[empresaId];const w=dateRange('tr.criado_em',inicio,fim,p);
      return (await query(`SELECT tr.de_vendedor_id AS vendedor_id,COUNT(*)::int AS passados_atraso
        FROM public.manu_atendimento_transferencias tr
        WHERE tr.empresa_id=$1 AND LOWER(tr.motivo) IN ('auto','atraso','sem_atendimento') ${w}
        GROUP BY tr.de_vendedor_id`,p)).rows;
    });
    if(vendedores && transferencias){const map=new Map(transferencias.map((x:any)=>[n(x.vendedor_id),n(x.passados_atraso)]));
      for(const v of vendedores as any[])v.passados_atraso=map.get(n(v.id))??0;}

    const origens = await executar('Origem e qualidade de leads',leadOk,async()=>{
      const p:unknown[]=[];const w=filtroLead(p);
      const temTriagem = existe(caps,'triagem','lead_id','empresa_id','origem','mensagem');
      const temOrigem = existe(caps,'origens_lead','id','nome') && existe(caps,'leads','origem_id');
      const joinTriagem=temTriagem ? `LEFT JOIN LATERAL (SELECT t.origem,t.mensagem FROM public.triagem t WHERE t.lead_id=l.id AND t.empresa_id=${empresaId} ORDER BY t.id LIMIT 1) t ON TRUE` : '';
      const joinOrigem=temOrigem?'LEFT JOIN public.origens_lead o ON o.id=l.origem_id':'';
      const expr=temTriagem&&temOrigem?`COALESCE(NULLIF(t.origem,''),NULLIF(o.nome,''),'Não identificada')`:temTriagem?`COALESCE(NULLIF(t.origem,''),'Não identificada')`:temOrigem?`COALESCE(NULLIF(o.nome,''),'Não identificada')`:`'Não identificada'`;
      const message = temTriagem?`COALESCE(NULLIF(l.observacao,''),t.mensagem)`:`l.observacao`;
      const email = existe(caps,'leads','email')?'l.email':'NULL::text';
      const rows=(await query(`SELECT l.id,l.nome_lead AS nome,l.telefone,${email} AS email,
        l.produto_interesse AS veiculo,${message} AS mensagem,${expr} AS origem,
        COALESCE(l.respondeu,false) AS respondeu,COALESCE(l.gerou_ficha,false) AS gerou_ficha,
        COALESCE(l.aprovado,false) AS aprovado,COALESCE(l.venda_concluida,false) AS vendido
        FROM public.leads l ${withVendedores} ${joinTriagem} ${joinOrigem} WHERE 1=1 ${w}
        ORDER BY l.id DESC LIMIT 50000`,p)).rows;
      const grouped=new Map<string,any>();let completos=0, qualidadeTotal=0;
      for(const l of rows){const origem=String(l.origem||'Não identificada');const q=indiceQualidade(l);qualidadeTotal+=q;if(q>=75)completos++;
        if(!grouped.has(origem))grouped.set(origem,{origem,leads:0,respondidos:0,fichas:0,aprovados:0,vendidos:0,completude_total:0});
        const g=grouped.get(origem)!;g.leads++;g.respondidos+=Number(!!l.respondeu);g.fichas+=Number(!!l.gerou_ficha);g.aprovados+=Number(!!l.aprovado);g.vendidos+=Number(!!l.vendido);g.completude_total+=q;
      }
      return {total_avaliados:rows.length,avaliacao_limitada:rows.length===50000,
        media_completude:rows.length?Math.round(qualidadeTotal/rows.length):null,
        qualificados_cadastralmente:completos,
        por_origem:[...grouped.values()].map(g=>({...g,completude_media:Math.round(g.completude_total/g.leads),
          conversao:taxa(g.vendidos,g.leads),taxa_resposta:taxa(g.respondidos,g.leads)})).sort((a,b)=>b.leads-a.leads)};
    });
    const triagem = await executar('Entradas em triagem',existe(caps,'triagem','empresa_id','origem','status','created_at'),async()=>{
      const p:unknown[]=[empresaId];let w=`t.empresa_id=$1`;
      if(loja){if(!existe(caps,'triagem','vendedor_id'))return [];
        p.push(loja);w+=` AND t.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id=$1 AND UPPER(COALESCE(loja,''))=$${p.length})`;}
      w+=dateRange('t.created_at',inicio,fim,p);
      return (await query(`SELECT COALESCE(NULLIF(t.origem,''),'Não identificada') AS origem,
        COUNT(*)::int AS recebidos,COUNT(*) FILTER (WHERE t.status='aguardando')::int AS aguardando
        FROM public.triagem t WHERE ${w} GROUP BY 1 ORDER BY recebidos DESC`,p)).rows;
    });
    const integracoes = await executar('Leads por conector oficial',
      existe(caps,'manu_integracoes','id','empresa_id','plataforma','nome') &&
      existe(caps,'manu_integracao_eventos','id','integracao_id','empresa_id','triagem_id','recebido_em'),
      async()=>{
        if(loja){alertas.push('Os eventos de integração atuais não registram loja; relatório de integrações por loja indisponível.');return null;}
        const p:unknown[]=[empresaId];const filtro=dateRange('ev.recebido_em',inicio,fim,p);
        return (await query(`SELECT i.plataforma,i.nome,COUNT(ev.id)::int AS eventos_recebidos,
           COUNT(DISTINCT ev.triagem_id) FILTER (WHERE ev.triagem_id IS NOT NULL)::int AS leads_triagem_unicos
          FROM public.manu_integracoes i
          LEFT JOIN public.manu_integracao_eventos ev ON ev.integracao_id=i.id
           AND ev.empresa_id=$1 ${filtro}
          WHERE i.empresa_id=$1 GROUP BY i.id,i.plataforma,i.nome
          ORDER BY leads_triagem_unicos DESC,i.nome`,p)).rows;
      });
    const bancos = await executar('Aprovação bancária',leadOk&&existe(caps,'ficha_bancos','ficha_id','banco','status','id')&&existe(caps,'fichas_credito','id','lead_id','created_at'),async()=>{
      const p:unknown[]=[];let w=dateRange('f.created_at',inicio,fim,p);
      w+=vendasScope(p);
      const sql=`WITH ultimos AS (
          SELECT DISTINCT ON (fb.ficha_id,LOWER(TRIM(COALESCE(fb.banco,''))))
          fb.ficha_id,COALESCE(NULLIF(TRIM(fb.banco),''),'Não identificado') AS banco,LOWER(TRIM(COALESCE(fb.status,''))) AS status
          FROM public.ficha_bancos fb
          JOIN public.fichas_credito f ON f.id=fb.ficha_id
          JOIN public.leads l ON l.id=f.lead_id ${withVendedores}
          WHERE 1=1 ${w}
          ORDER BY fb.ficha_id,LOWER(TRIM(COALESCE(fb.banco,''))),fb.id DESC
        ) SELECT banco,COUNT(*)::int AS propostas,
           COUNT(*) FILTER (WHERE status LIKE 'aprov%' OR status LIKE 'liberad%')::int AS aprovadas,
           COUNT(*) FILTER (WHERE status LIKE 'negad%' OR status LIKE 'reprov%' OR status LIKE 'recusad%' OR status LIKE 'não aprov%' OR status LIKE 'nao aprov%')::int AS negadas,
           COUNT(*) FILTER (WHERE NOT(status LIKE 'aprov%' OR status LIKE 'liberad%' OR status LIKE 'negad%' OR status LIKE 'reprov%' OR status LIKE 'recusad%' OR status LIKE 'não aprov%' OR status LIKE 'nao aprov%'))::int AS pendentes
        FROM ultimos GROUP BY banco ORDER BY aprovadas DESC,propostas DESC`;
      return (await query(sql,p)).rows.map((b:any)=>({...b,propostas:n(b.propostas),aprovadas:n(b.aprovadas),negadas:n(b.negadas),pendentes:n(b.pendentes),
        taxa_aprovacao:taxa(n(b.aprovadas),n(b.aprovadas)+n(b.negadas))}));
    });
    const caixa = await executar('Fluxo de caixa confirmado',existe(caps,'manu_movimentos_caixa','empresa_id','loja','status','tipo','valor','data_movimento'),async()=>{
      const p:unknown[]=[empresaId];let w=`empresa_id=$1 AND status='confirmado'`;
      if(loja){p.push(loja);w+=` AND UPPER(COALESCE(loja,''))=$${p.length}`;}
      w+=dateRange('data_movimento',inicio,fim,p);
      const total=await queryOne<any>(`SELECT COALESCE(SUM(valor) FILTER (WHERE tipo='entrada'),0)::numeric AS entradas,
        COALESCE(SUM(valor) FILTER (WHERE tipo='saida'),0)::numeric AS saidas,
        COUNT(*)::int AS lancamentos,
        COALESCE(SUM(valor) FILTER(WHERE tipo='saida' AND origem_tipo='oficina'),0)::numeric AS oficina
        FROM public.manu_movimentos_caixa WHERE ${w}`,p);
      const porCategoria=(await query(`SELECT tipo,categoria,COALESCE(SUM(valor),0)::numeric AS total,COUNT(*)::int AS qtd
        FROM public.manu_movimentos_caixa WHERE ${w} GROUP BY tipo,categoria ORDER BY total DESC`,p)).rows;
      return {entradas:n(total?.entradas),saidas:n(total?.saidas),saldo:n(total?.entradas)-n(total?.saidas),
        oficina:n(total?.oficina),saldo_operacional:n(total?.entradas)-n(total?.oficina),
        lancamentos:n(total?.lancamentos),por_categoria:porCategoria};
    });
    // Documentos fiscais e de faturamento sao indicadores proprios, nunca presumem pagamento.
    const faturamento = await executar('Faturamentos documentados',
      existe(caps,'faturamentos','id','empresa_id','loja','status','created_at','entrada_total'),async()=>{
      const p:unknown[]=[empresaId];let w=`f.empresa_id=$1 AND LOWER(COALESCE(f.status,'')) NOT IN ('cancelado','excluido','excluído')`;
      if(loja){p.push(loja);w+=` AND UPPER(COALESCE(f.loja,''))=$${p.length}`;}
      w+=dateRange('f.created_at',inicio,fim,p);
      const r=await queryOne<any>(`SELECT COUNT(DISTINCT f.id)::int AS documentos,
        COALESCE(SUM(COALESCE(f.entrada_total,0)),0)::numeric AS entradas_documentadas
        FROM public.faturamentos f WHERE ${w}`,p);
      return {documentos:n(r?.documentos),entradas_documentadas:n(r?.entradas_documentadas)};
    });
    // Mesma venda pode ter varias notas: usar apenas a ultima fatura vinculada ao lead vendido.
    // Bruto DOCUMENTADO = entrada + financiamento; pago somente quando confirmado no caixa.
    const vendasMonetarias=await executar('Bruto de vendas documentadas',
      existe(caps,'faturamentos','id','empresa_id','lead_id','ficha_id','entrada_total','loja') &&
      existe(caps,'fichas_credito','id','lead_id','valor_financiado','valor_liberado') &&
      existe(caps,'leads','id','empresa_id','venda_concluida','data_venda'),async()=>{
      const p:unknown[]=[empresaId];let w=`f.empresa_id=$1 AND l.empresa_id=$1
        AND (l.venda_concluida IS TRUE OR l.data_venda IS NOT NULL)
        AND LOWER(COALESCE(f.status,'')) NOT IN ('cancelado','excluido','excluído')`;
      if(loja){p.push(loja);w+=` AND UPPER(COALESCE(f.loja,''))=$${p.length}`;}
      w+=dateRange('COALESCE(l.data_venda,l.data_lead)',inicio,fim,p);
      const r=await queryOne<any>(`WITH docs AS (
        SELECT DISTINCT ON (l.id) l.id AS lead_id,
          GREATEST(COALESCE(f.entrada_total,0),0) AS entrada,
          GREATEST(COALESCE(NULLIF(fc.valor_liberado,0),NULLIF(fc.valor_financiado,0),0),0) AS financiado
        FROM public.faturamentos f LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
        JOIN public.leads l ON l.id=COALESCE(f.lead_id,fc.lead_id) AND l.empresa_id=f.empresa_id
        WHERE ${w} ORDER BY l.id,f.id DESC)
        SELECT COUNT(*)::int AS vendas_com_documento,
         COALESCE(SUM(entrada),0)::numeric AS entradas,
         COALESCE(SUM(financiado),0)::numeric AS financiamentos,
         COALESCE(SUM(entrada+financiado),0)::numeric AS bruto FROM docs`,p);
      return {vendas_com_documento:n(r?.vendas_com_documento),entradas:n(r?.entradas),
       financiamentos:n(r?.financiamentos),bruto:n(r?.bruto)};
    });
    const vendasCrmPeriodo=await executar('Vendas do CRM por data da venda',
      leadOk&&existe(caps,'leads','data_venda'),async()=>{
      const p:unknown[]=[empresaId];let w=`l.empresa_id=$1 AND (l.venda_concluida IS TRUE OR l.data_venda IS NOT NULL)`;
      if(loja){p.push(loja);w+=` AND UPPER(COALESCE(v.loja,''))=$${p.length}`;}
      w+=dateRange('COALESCE(l.data_venda,l.data_lead)',inicio,fim,p);
      const x=await queryOne<any>(`SELECT COUNT(DISTINCT l.id)::int AS total
        FROM public.leads l LEFT JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=l.empresa_id
        WHERE ${w}`,p);
      return {total:n(x?.total)};
    });
    // Custos de oficina sao previstos ate que usuario marque explicitamente "Pago".
    // A trigger de banco transfere SOMENTE gastos pagos para manu_movimentos_caixa.
    const oficinaFinanceiro=await executar('Custos de oficina',
      existe(caps,'oficina_carros','empresa_id','loja','valor_final','custo_pago','updated_at') &&
        existe(caps,'manu_movimentos_caixa','empresa_id','origem_tipo','tipo','status','valor','data_movimento'),async()=>{
      const p:unknown[]=[empresaId];let w=`o.empresa_id=$1`;
      if(loja){p.push(loja);w+=` AND UPPER(COALESCE(o.loja,''))=$${p.length}`;}
      w+=dateRange('o.updated_at',inicio,fim,p);
      const x=await queryOne<any>(`WITH custos AS (
         SELECT o.custo_pago,
           CASE
             WHEN regexp_replace(COALESCE(o.valor_final::text,''),'[^0-9,.]','','g') ~ '^[0-9]{1,3}(\\.[0-9]{3})+,[0-9]{1,2}$'
                OR regexp_replace(COALESCE(o.valor_final::text,''),'[^0-9,.]','','g') ~ '^[0-9]+,[0-9]{1,2}$'
               THEN replace(replace(regexp_replace(o.valor_final::text,'[^0-9,.]','','g'),'.',''),',','.')::numeric
             WHEN regexp_replace(COALESCE(o.valor_final::text,''),'[^0-9,.]','','g') ~ '^[0-9]+(\\.[0-9]{1,2})?$'
               THEN regexp_replace(o.valor_final::text,'[^0-9,.]','','g')::numeric
             ELSE NULL END AS custo
         FROM public.oficina_carros o WHERE ${w}
       ) SELECT COUNT(*) FILTER(WHERE custo IS NOT NULL)::int AS registros,
         COALESCE(SUM(custo),0)::numeric AS custos_cadastrados
       FROM custos`,p);
      // Pagamento e filtrado pela data financeira, nao pela ultima edicao do veiculo.
      const pc:unknown[]=[empresaId];let wc=`empresa_id=$1 AND origem_tipo='oficina' AND tipo='saida' AND status='confirmado'`;
      if(loja){pc.push(loja);wc+=` AND UPPER(loja)=$${pc.length}`;}
      wc+=dateRange('data_movimento',inicio,fim,pc);
      const pago=await queryOne<any>(`SELECT COALESCE(SUM(valor),0)::numeric AS total
        FROM public.manu_movimentos_caixa WHERE ${wc}`,pc);
      return {registros:n(x?.registros),custos_cadastrados:n(x?.custos_cadastrados),custos_pagos:n(pago?.total)};
    });
    const vendasCarroceria = await executar('Vendas identificadas por carroceria',leadOk && existe(caps,'leads','placa_carro','data_venda') && existe(caps,'estoque_carros','placa','carroceria','empresa_id'),async()=>{
      const p:unknown[]=[empresaId];let lojaFiltro='';if(loja){p.push(loja);lojaFiltro=` AND UPPER(COALESCE(v.loja,''))=$${p.length}`;}
      const r=await query(`SELECT to_char(l.data_venda::date,'YYYY-MM') AS mes,
        COALESCE(NULLIF(LOWER(TRIM(ec.carroceria)),''),'não identificado') AS carroceria,
        COUNT(*)::int AS vendas FROM public.leads l
        JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=$1
        LEFT JOIN LATERAL (SELECT e.carroceria FROM public.estoque_carros e WHERE e.empresa_id=$1
          AND REGEXP_REPLACE(UPPER(COALESCE(e.placa,'')),'[^A-Z0-9]','','g') =
              REGEXP_REPLACE(UPPER(COALESCE(l.placa_carro,'')),'[^A-Z0-9]','','g')
          AND LENGTH(REGEXP_REPLACE(COALESCE(l.placa_carro,''),'[^A-Za-z0-9]','','g'))>=6
          ORDER BY e.id DESC LIMIT 1) ec ON TRUE
        WHERE (l.empresa_id=$1 OR (l.empresa_id IS NULL AND v.empresa_id=$1))
        ${lojaFiltro} AND l.data_venda IS NOT NULL
        AND l.data_venda::date >= (date_trunc('month',NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '6 months')::date
        AND l.data_venda::date < date_trunc('month',NOW() AT TIME ZONE 'America/Sao_Paulo')::date
        GROUP BY mes,carroceria ORDER BY mes,carroceria`,p);
      const rows=r.rows.map((x:any)=>({mes:String(x.mes),carroceria:String(x.carroceria),vendas:n(x.vendas)}));
      const identificadas=rows.filter(r=>r.carroceria!=='não identificado').reduce((a,r)=>a+r.vendas,0);
      const total=rows.reduce((a,r)=>a+r.vendas,0);
      return {historico:rows,cobertura:taxa(identificadas,total),total_vendas_datadas:total,
        projecao:projetarCorpos(rows,new Date()),metodo:'Média ponderada de seis meses completos (40%) e três meses completos (60%); exige pelo menos 5 vendas em 3 meses distintos por carroceria.'};
    });
    const estoque = await executar('Estoque por carroceria',existe(caps,'estoque_carros','carroceria','empresa_id'),async()=>{
      const p:unknown[]=[empresaId];let w='empresa_id=$1';
      if(loja && existe(caps,'estoque_carros','loja')){p.push(loja);w+=` AND UPPER(COALESCE(loja,''))=$${p.length}`;}
      else if(loja){alertas.push('Estoque por loja indisponível: coluna loja não existe.');return [];}
      return (await query(`SELECT COALESCE(NULLIF(LOWER(TRIM(carroceria)),''),'Não informada') AS carroceria,
        COUNT(*)::int AS quantidade FROM public.estoque_carros WHERE ${w}
        GROUP BY 1 ORDER BY quantidade DESC`,p)).rows;
    });
    const porLoja = await executar('Desempenho por loja',leadOk,async()=>{
      const p:unknown[]=[];let w=filtroLead(p);
      return (await query(`SELECT COALESCE(NULLIF(v.loja,''),'Sem loja') AS loja,
        COUNT(*)::int AS leads,COUNT(*) FILTER (WHERE l.respondeu IS TRUE)::int AS respondidos,
        COUNT(*) FILTER (WHERE l.venda_concluida IS TRUE)::int AS vendidos
        FROM public.leads l ${withVendedores} WHERE 1=1 ${w}
        GROUP BY v.loja ORDER BY leads DESC`,p)).rows.map((x:any)=>({...x,conversao:taxa(n(x.vendidos),n(x.leads))}));
    });
    const historico=await executar('Evolução mensal',leadOk,async()=>{
      const p:unknown[]=[empresaId];let scope=`(l.empresa_id=$1 OR (l.empresa_id IS NULL AND v.empresa_id=$1))`;
      if(loja){p.push(loja);scope+=` AND UPPER(COALESCE(v.loja,''))=$${p.length}`;}
      return (await query(`SELECT to_char(l.data_lead::date,'YYYY-MM') AS mes,
        COUNT(*)::int AS leads,
        COUNT(*) FILTER (WHERE l.venda_concluida IS TRUE)::int AS vendidos
        FROM public.leads l ${withVendedores}
        WHERE ${scope} AND l.data_lead::date >= (date_trunc('month',NOW() AT TIME ZONE 'America/Sao_Paulo')-INTERVAL '5 months')::date
        GROUP BY 1 ORDER BY mes`,p)).rows;
    });
    const recebimentoMes=await executar('Caixa mensal',disponibilidade['Fluxo de caixa confirmado']===true,async()=>{
      const p:unknown[]=[empresaId];let w=`empresa_id=$1 AND status='confirmado'`;
      if(loja){p.push(loja);w+=` AND UPPER(COALESCE(loja,''))=$${p.length}`;}
      return (await query(`SELECT to_char(data_movimento,'YYYY-MM') AS mes,
       COALESCE(SUM(valor) FILTER (WHERE tipo='entrada'),0) AS entradas,
       COALESCE(SUM(valor) FILTER (WHERE tipo='saida'),0) AS saidas
       FROM public.manu_movimentos_caixa WHERE ${w} AND data_movimento >= (date_trunc('month',NOW() AT TIME ZONE 'America/Sao_Paulo') -INTERVAL '5 months')::date
       GROUP BY 1 ORDER BY mes`,p)).rows;
    });
    return NextResponse.json({
      empresa:{id:empresaId,nome:empresa.nome},loja:loja||'geral',periodo:{inicio,fim,etiqueta},
      atualizado_em:new Date().toISOString(),
      funil, vendedores, funcionarios, transferencias_disponiveis:disponibilidade['Transferências por atraso'],
      origens,triagem_por_origem:triagem,integracoes,bancos,
      caixa:leituraFinanceira?caixa:null,estoque,vendas_por_carroceria:vendasCarroceria,
      faturamento:leituraFinanceira?faturamento:null,
      oficina_financeiro:leituraFinanceira?oficinaFinanceiro:null,
      vendas_monetarias:leituraFinanceira?vendasMonetarias:null,
      vendas_crm_periodo:vendasCrmPeriodo,
      por_loja:porLoja,historico_mensal:historico,caixa_mensal:leituraFinanceira?recebimentoMes:null,
      disponibilidade,alertas,
      definicoes:{
        entradas:'Somente movimentos marcados confirmado, com data de liquidação. Não inclui financiamento apenas aprovado.',
        saidas:'Somente pagamentos confirmados no razão de caixa. Valor do carro na oficina não é despesa paga.',
        leads:'Leads atualmente registrados e vinculados à empresa, filtrados pela data de entrada.',
        qualidade:'Completude cadastral objetiva: nome, telefone/e-mail, veículo de interesse e mensagem (25 pontos cada). Não é probabilidade de compra.',
        bancos:'Última resposta registrada por ficha e banco; taxa de aprovação sobre decisões aprovadas + negadas, pendentes separadas.',
        projecao:'Estimativa estatística com amostra mínima, não promessa de vendas. Só usa vendas com data e carroceria vinculada por placa.',
      },
    },{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    console.error('[metricas] falha geral',error instanceof Error?error.message:'erro');
    return NextResponse.json({error:'Falha ao consultar métricas. Verifique as migrations e a conexão do banco.'},{status:500});
  }
}
