'use client';
import Link from 'next/link';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid,Legend,LineChart,Line,
} from 'recharts';
import { Activity,ArrowDownRight,ArrowUpRight,BadgeCheck,BarChart3,CalendarDays,
  CircleAlert,FileText,Landmark,Loader2,Plus,RefreshCw,ShieldAlert,Users,Wallet,Wrench } from 'lucide-react';

const brl=(v:unknown)=>v===null||v===undefined?'Indisponível':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
const pct=(v:unknown)=>v===null||v===undefined?'—':`${(Number(v)*100).toFixed(1)}%`;
const quantidade=(v:unknown)=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR');
const CORES=['#b489f4','#67b6e9','#67c89a','#e7ac63','#dd839e','#8b92c9'];
const caixaGrafico=(lista:any[])=>lista.map(x=>({mes:x.mes,entradas:Number(x.entradas),saidas:Number(x.saidas)}));

function Tile({titulo,valor,descricao,icon:Icon}: {titulo:string;valor:string;descricao?:string;icon:any}) {
  return <Card className="min-w-0 border-border/80 bg-card/90"><CardContent className="p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{titulo}</span><Icon size={17} className="text-violet-400"/></div>
    <p className="mt-2 break-words text-xl font-semibold tracking-tight sm:text-2xl">{valor}</p>
    {descricao&&<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{descricao}</p>}
  </CardContent></Card>;
}
function Bloco({titulo,subtitulo,children}: {titulo:string;subtitulo?:string;children:React.ReactNode}) {
  return <Card className="min-w-0 border-border/80"><CardContent className="p-4 sm:p-5">
    <h2 className="text-base font-semibold sm:text-lg">{titulo}</h2>
    {subtitulo&&<p className="mt-1 mb-4 text-xs leading-relaxed text-muted-foreground">{subtitulo}</p>}
    <div className="mt-4">{children}</div>
  </CardContent></Card>;
}
function Vazio({msg='Fonte indisponível ou dados insuficientes para este recorte.'}: {msg?:string}) {
  return <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">{msg}</p>;
}
function GridTabela({colunas,linhas}: {colunas:string[];linhas:(string|number|React.ReactNode)[][]}) {
  return <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs sm:text-sm">
    <thead><tr className="border-b text-muted-foreground">{colunas.map(x=><th key={x} className="whitespace-nowrap px-3 py-3 font-medium">{x}</th>)}</tr></thead>
    <tbody>{linhas.map((r,i)=><tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/30">{r.map((v,j)=><td key={j} className="px-3 py-3">{v}</td>)}</tr>)}</tbody>
  </table></div>;
}

export default function MetricasPage() {
  const {user}=useAuth();
  const qc=useQueryClient();
  const superadmin=String(user?.tipo||'')==='superadmin';
  const podeLancar=['admin','superadmin'].includes(String(user?.tipo||''));
  const financialView=podeLancar;
  const [empresa,setEmpresa]=useState('');
  const [loja,setLoja]=useState('geral');
  const [periodo,setPeriodo]=useState('mes');
  const [lojas,setLojas]=useState<string[]>([]);
  const [novo,setNovo]=useState(false);
  const [salvando,setSalvando]=useState(false);
  const [f,setF]=useState({loja:'',tipo:'entrada',status:'confirmado',categoria:'',descricao:'',valor:'',data_movimento:new Date().toISOString().slice(0,10)});
  const empresas=useQuery({queryKey:['metricas-empresas'],enabled:superadmin,
    queryFn:async()=>(await api.get('/integracoes/empresas')).data});
  useEffect(()=>{if(superadmin&&Array.isArray(empresas.data)&&empresas.data.length>0){
    setEmpresa(x=>x||String(empresas.data[0].id));
  }},[superadmin,empresas.data]);
  useEffect(()=>{setLoja('geral');setLojas([]);setF(x=>({...x,loja:''}));},[empresa]);
  const pronto=!superadmin||Boolean(empresa);
  const lojasCadastro=useQuery({queryKey:['metricas-lojas',empresa],enabled:pronto,
    queryFn:async()=>(await api.get('/metricas/lojas',{params:{empresa_id:superadmin?empresa:undefined}})).data});
  useEffect(()=>{if(Array.isArray(lojasCadastro.data)){
    setLojas(x=>[...new Set([...x,...lojasCadastro.data.map((v:any)=>String(v.codigo))])].sort());
  }},[lojasCadastro.data]);
  const r=useQuery({queryKey:['metricas-v2',empresa,loja,periodo],enabled:pronto,
    queryFn:async()=> (await api.get('/metricas',{params:{empresa_id:superadmin?empresa:undefined,loja,periodo}})).data,
    refetchInterval:60000,staleTime:15000});
  const movimento=useQuery({queryKey:['metricas-lancamentos',empresa,loja],enabled:pronto&&podeLancar,
    queryFn:async()=>(await api.get('/metricas/lancamentos',{params:{empresa_id:superadmin?empresa:undefined,loja}})).data,
    staleTime:30000});
  const d=r.data;
  useEffect(()=>{if(!d)return;const candidates=[...(d.vendedores||[]).map((v:any)=>String(v.loja||'')),
    ...(d.por_loja||[]).map((v:any)=>String(v.loja||''))].filter((x:string)=>x&&x!=='Sem loja');
    setLojas(old=>[...new Set([...old,...candidates])].sort());},[d]);
  const banco=Array.isArray(d?.bancos)?d.bancos:[];
  const func=Array.isArray(d?.vendedores)?d.vendedores:[];
  const equipe=Array.isArray(d?.funcionarios)?d.funcionarios:[];
  const fonte=Array.isArray(d?.origens?.por_origem)?d.origens.por_origem:[];
  const integracoes=Array.isArray(d?.integracoes)?d.integracoes:[];
  const proj=Array.isArray(d?.vendas_por_carroceria?.projecao)?d.vendas_por_carroceria.projecao:[];
  const range=String(d?.periodo?.etiqueta||'');
  const melhorBanco=[...banco].filter((b:any)=>b.aprovadas+b.negadas>=5).sort((a:any,b:any)=>Number(b.taxa_aprovacao)-Number(a.taxa_aprovacao))[0];
  const hoje=new Date().toISOString().slice(0,10);
  const lancamentoLoja=f.loja||((!superadmin&&user?.loja)?String(user.loja):'');
  const boxCarroceria=Array.isArray(d?.estoque)?d.estoque:[];
  const chartBar = useMemo(()=>caixaGrafico(d?.caixa_mensal||[]),[d?.caixa_mensal]);
  async function registrar(e:React.FormEvent){e.preventDefault();if(!podeLancar)return;
    setSalvando(true);try{await api.post('/metricas/lancamentos',{
      ...f,valor:Number(f.valor),empresa_id:superadmin?Number(empresa):undefined,loja:lancamentoLoja,
    });toast.success('Lançamento registrado');setNovo(false);setF(x=>({...x,valor:'',descricao:'',categoria:'',data_movimento:hoje}));
    await qc.invalidateQueries({queryKey:['metricas-v2']});await qc.invalidateQueries({queryKey:['metricas-lancamentos']});}
    catch(err:any){toast.error(err?.response?.data?.error||'Falha ao registrar lançamento');}finally{setSalvando(false);}
  }
  if(!['admin','marketing','gerente','superadmin'].includes(String(user?.tipo||'')))
    return <div className="p-6 text-sm text-muted-foreground">Você não tem permissão para consultar métricas.</div>;
  return <div className="mx-auto max-w-7xl space-y-7 pb-28">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-violet-400"><Activity size={16}/> Inteligência comercial</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Métricas e resultados</h1>
        <p className="mt-2 text-sm text-muted-foreground">{d?.empresa?.nome||'Escolha a empresa'} · {range||'Indicadores por empresa e loja'} · Dados operacionais, não estimativas disfarçadas.</p>
      </div>
      <Link href="/desempenho" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">Desempenho por vendedor e origem</Link>
      <button className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={()=>r.refetch()}><RefreshCw size={16}/> Atualizar</button>
    </header>
    <div className="grid gap-3 sm:grid-cols-3">
      {superadmin&&<label className="space-y-1 text-xs text-muted-foreground">Empresa
        <select className="mt-1 w-full rounded-lg border bg-card p-2.5 text-sm text-foreground" value={empresa} onChange={e=>setEmpresa(e.target.value)}>
          {(empresas.data||[]).map((x:any)=><option key={x.id} value={x.id}>{x.nome}</option>)}
        </select></label>}
      {(superadmin||String(user?.tipo)==='admin')&&<label className="space-y-1 text-xs text-muted-foreground">Loja
        <select className="mt-1 w-full rounded-lg border bg-card p-2.5 text-sm text-foreground" value={loja} onChange={e=>setLoja(e.target.value)}>
          <option value="geral">Todas as lojas da empresa</option>{lojas.map(x=><option key={x} value={x}>{x}</option>)}
        </select></label>}
      <label className="space-y-1 text-xs text-muted-foreground">Período
        <select className="mt-1 w-full rounded-lg border bg-card p-2.5 text-sm text-foreground" value={periodo} onChange={e=>setPeriodo(e.target.value)}>
          <option value="mes">Este mês</option><option value="mes_passado">Mês passado</option><option value="tudo">Todo o histórico</option>
        </select></label>
    </div>
    {r.isLoading&&<div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={17}/> Carregando relatórios...</div>}
    {r.isError&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><ShieldAlert className="mr-2 inline" size={16}/> {(r.error as any)?.response?.data?.error||'Erro ao carregar. Confira a conexão e as migrations.'}</div>}
    {d&&<>
      {d.alertas?.length>0&&<details className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-amber-300"><CircleAlert className="mr-2 inline" size={17}/> {d.alertas.length} verificações pendentes de dados</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{d.alertas.map((a:string,i:number)=><li key={i}>{a}</li>)}</ul>
      </details>}
      {financialView&&<><section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Caixa efetivo</h2><p className="text-xs text-muted-foreground">Somente entradas e pagamentos confirmados, registrados no razão de caixa.</p></div>
        {podeLancar&&<Link href="/financas" className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"><Wallet size={16}/> Abrir Finanças</Link>}
      </div>
      {novo&&podeLancar&&<form onSubmit={registrar} className="grid gap-3 rounded-xl border border-violet-500/30 bg-card p-4 sm:grid-cols-3">
        <label className="text-xs">Loja<select required value={f.loja} onChange={e=>setF({...f,loja:e.target.value})} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"><option value="">Selecione</option>{lojas.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label className="text-xs">Tipo<select value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value})} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"><option value="entrada">Entrada recebida</option><option value="saida">Saída paga</option></select></label>
        <label className="text-xs">Situação<select value={f.status} onChange={e=>setF({...f,status:e.target.value})} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"><option value="confirmado">Confirmado / liquidado</option><option value="previsto">Previsto (não conta no caixa)</option><option value="cancelado">Cancelado (não conta no caixa)</option></select></label>
        <label className="text-xs">Valor (R$)<input required type="number" min="0.01" step="0.01" value={f.valor} onChange={e=>setF({...f,valor:e.target.value})} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"/></label>
        <label className="text-xs">Data de liquidação<input required type="date" value={f.data_movimento} onChange={e=>setF({...f,data_movimento:e.target.value})} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"/></label>
        <label className="text-xs">Categoria<input required maxLength={80} value={f.categoria} onChange={e=>setF({...f,categoria:e.target.value})} placeholder="Venda, oficina, aluguel..." className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"/></label>
        <label className="text-xs sm:col-span-2">Descrição<input value={f.descricao} onChange={e=>setF({...f,descricao:e.target.value})} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"/></label>
        <button disabled={salvando} className="self-end rounded-lg bg-violet-600 p-2.5 text-sm font-semibold text-white disabled:opacity-50">{salvando?'Salvando...':'Salvar movimento'}</button>
        <p className="text-xs text-muted-foreground sm:col-span-3">Registre um movimento somente após verificar o comprovante. Não registre a mesma liquidação duas vezes.</p>
      </form>}
      {d.caixa?.lancamentos===0&&<p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">Nenhum movimento de caixa confirmado foi registrado neste recorte. R$ 0,00 não comprova que não houve transações reais; o histórico financeiro precisa ser conciliado.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile titulo="Total documental identificado" valor={brl(d.vendas_monetarias?.bruto)} descricao="Entrada + financiamento liberado informado dos leads com venda; faturas sem venda e financiamentos desconhecidos não são somados." icon={FileText}/>
        <Tile titulo="Saídas líquidas da oficina" valor={brl(d.caixa?.oficina)} descricao="Gastos efetivamente pagos na oficina" icon={ArrowUpRight}/>
        <Tile titulo="Saldo operacional recebido" valor={brl(d.caixa?.saldo_operacional)} descricao="Entradas recebidas confirmadas menos gastos pagos de oficina" icon={Wallet}/>
        <Tile titulo="Entradas confirmadas" valor={brl(d.caixa?.entradas)} descricao="Dinheiro realmente baixado no caixa; {d.caixa?.lancamentos||0} movimentos confirmados" icon={ArrowDownRight}/>
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><Bloco titulo="Entradas e saídas por mês" subtitulo="Gráfico de liquidações registradas. Meses sem lançamentos não representam caixa histórico reconstruído.">
        {chartBar.length?<ResponsiveContainer width="100%" height={260}><BarChart data={chartBar}><CartesianGrid strokeDasharray="3 3" opacity={0.15}/><XAxis dataKey="mes" fontSize={11}/><YAxis fontSize={10}/><Tooltip formatter={(v:any)=>brl(v)}/><Legend/><Bar dataKey="entradas" name="Entradas" fill="#67c89a" radius={[4,4,0,0]}/><Bar dataKey="saidas" name="Saídas" fill="#dd839e" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>:<Vazio msg="Sem lançamentos confirmados nos últimos meses."/>}
      </Bloco><Bloco titulo="Por categoria" subtitulo="Detalhamento de despesas e recebimentos confirmados.">
        {d.caixa?.por_categoria?.length?<GridTabela colunas={['Tipo','Categoria','Total','Movimentos']} linhas={d.caixa.por_categoria.map((x:any)=>[x.tipo,x.categoria,brl(x.total),x.qtd])}/>:<Vazio msg="Ainda não há categorias financeiras liquidadas."/>}
      </Bloco></div>
      <Bloco titulo="Últimos movimentos registrados" subtitulo="Até 100 lançamentos do razão, com categoria, descrição e data. Valores previstos não integram o caixa confirmado.">
        {Array.isArray(movimento.data)&&movimento.data.length?<GridTabela colunas={['Data','Loja','Tipo','Situação','Categoria','Descrição','Valor']} linhas={movimento.data.map((x:any)=>[String(x.data_movimento).slice(0,10),x.loja,x.tipo,x.status,x.categoria,x.descricao||'—',brl(x.valor)])}/>:<Vazio msg="Sem lançamentos financeiros nesta empresa/loja."/>}
      </Bloco></section>
      <section className="space-y-3">
        <div><h2 className="text-xl font-semibold">Resultados documentados</h2>
          <p className="text-xs text-muted-foreground">Faturamentos emitidos e despesas registradas na oficina. Documento emitido nao comprova recebimento; so pagamentos marcados como pagos entram no caixa.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile titulo="Faturamentos emitidos" valor={quantidade(d.faturamento?.documentos)} descricao="Documentos nao cancelados no periodo" icon={FileText}/>
          <Tile titulo="Entradas documentadas" valor={brl(d.faturamento?.entradas_documentadas)} descricao="Valor registrado no faturamento, nao necessariamente recebido" icon={Landmark}/>
          <Tile titulo="Custos da oficina" valor={brl(d.oficina_financeiro?.custos_cadastrados)} descricao="Orcamentos/custos registrados; podem estar pendentes" icon={Wrench}/>
          <Tile titulo="Despesas de oficina pagas" valor={brl(d.oficina_financeiro?.custos_pagos)} descricao="Contabilizadas na saida do caixa sem duplicar" icon={Wallet}/>
        </div>
        <p className="text-xs text-muted-foreground">Vendas no CRM pela data de venda: <strong>{quantidade(d.vendas_crm_periodo?.total)}</strong>. Faturamentos nao sao somados automaticamente como vendas adicionais do mesmo lead.</p>
      </section></>}
      <section className="space-y-3"><h2 className="text-xl font-semibold">Funil comercial</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[['Leads',d.funil?.leads,Users],['Respondidos',d.funil?.responderam,BadgeCheck],['Fichas',d.funil?.fichas,BarChart3],['Aprovados',d.funil?.aprovados,Landmark],['Vendidos',d.funil?.vendidos,Activity]].map(([t,v,Icon]:any)=><Tile key={t} titulo={t} valor={quantidade(v)} icon={Icon}/>)}
      </div><div className="grid gap-4 lg:grid-cols-2"><Bloco titulo="Evolução de leads e vendas" subtitulo="Vendas marcadas no CRM, por mês de chegada do lead; não equivalem a recebimentos financeiros.">
        {d.historico_mensal?.length?<ResponsiveContainer height={260} width="100%"><LineChart data={d.historico_mensal}><CartesianGrid strokeDasharray="3 3" opacity={0.15}/><XAxis dataKey="mes" fontSize={11}/><YAxis fontSize={11}/><Tooltip/><Legend/><Line dataKey="leads" name="Leads" stroke={CORES[0]} strokeWidth={2}/><Line dataKey="vendidos" name="Vendas" stroke={CORES[2]} strokeWidth={2}/></LineChart></ResponsiveContainer>:<Vazio/>}
      </Bloco><Bloco titulo="Conversão" subtitulo="Proporções calculadas apenas sobre o recorte selecionado.">
        <div className="space-y-3">{[['Resposta',d.funil?.responderam,d.funil?.leads],['Fichas',d.funil?.fichas,d.funil?.leads],['Vendas',d.funil?.vendidos,d.funil?.leads]].map(([label,a,b]:any)=><div key={label}>
          <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span>{b?`${(a/b*100).toFixed(1)}%`:'—'}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{width:`${b?Math.min(100,a/b*100):0}%`}}/></div></div>)}</div>
      </Bloco></div></section>
      <div className="grid gap-4 lg:grid-cols-2"><Bloco titulo="Origem e qualidade de leads" subtitulo="Fonte do lead, respostas e vendas. Completude mede dados preenchidos, não interesse psicológico.">
        {fonte.length?<><ResponsiveContainer width="100%" height={230}><BarChart data={fonte.slice(0,8)} layout="vertical"><CartesianGrid strokeDasharray="3 3" opacity={0.15}/><XAxis type="number" fontSize={10}/><YAxis dataKey="origem" type="category" width={100} fontSize={11}/><Tooltip/><Bar dataKey="leads" fill={CORES[0]} name="Leads" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>
          <GridTabela colunas={['Origem','Leads','Atendidos','Vendas','Conversão','Dados completos']} linhas={fonte.map((x:any)=>[x.origem,x.leads,x.respondidos,x.vendidos,pct(x.conversao),`${x.completude_media}%`])}/></>:<Vazio/>}
        {d.origens?.avaliacao_limitada&&<p className="mt-2 text-xs text-amber-400">Análise limitada a 50 mil registros. Reduza o período para obter cobertura integral.</p>}
      </Bloco><Bloco titulo="Entradas nas integrações" subtitulo="Triagem recebida por origem, incluindo o que ainda não foi distribuído.">
        {d.triagem_por_origem?.length?<GridTabela colunas={['Integração / origem','Recebidos','Na triagem']} linhas={d.triagem_por_origem.map((x:any)=>[x.origem,x.recebidos,x.aguardando])}/>:<Vazio/>}
        <p className="mt-4 text-xs text-muted-foreground">Um lead atribuído pode existir também na triagem; esses totais não devem ser somados indiscriminadamente.</p>
        {integracoes.length>0&&<><h3 className="mb-2 mt-5 text-sm font-semibold">Webhooks por integração configurada</h3>
          <GridTabela colunas={['Canal','Integração','Eventos','Triagens únicas']} linhas={integracoes.map((x:any)=>[x.plataforma,x.nome,x.eventos_recebidos,x.leads_triagem_unicos])}/>
          <p className="mt-2 text-xs text-muted-foreground">Contagem deduplicada por ID de triagem. Eventos sem triagem não são contabilizados como leads efetivos.</p></>}

      </Bloco></div>
      <Bloco titulo="Equipe completa da empresa" subtitulo="Todos os cargos ativos. Para mecânica, oficina e gestão, só apresentamos indicadores quando existem registros operacionais auditáveis.">
        {equipe.length?<GridTabela colunas={['Funcionário','Cargo','Loja','Leads','Respondidos','Vendas','Conversão','Cobertura']} linhas={equipe.map((x:any)=>[x.nome,x.cargo,x.loja,quantidade(x.leads_atuais),quantidade(x.respondidos),quantidade(x.vendas),pct(x.conversao),x.observacao])}/>:<Vazio/>}
      </Bloco>
      <Bloco titulo="Desempenho por vendedor" subtitulo="Carteira atual. Vendedores sem leads aparecem com zero. Transferências por atraso são eventos separados, quando a auditoria está disponível.">
        {func.length?<GridTabela colunas={['Vendedor','Loja','Leads atuais','Respondidos','Fichas','Aprovados','Vendas','Conversão','Pendente +10 min','Passados por atraso']} linhas={func.map((x:any)=>[x.nome,x.loja||'—',x.leads_atuais,x.respondidos,x.fichas,x.aprovados,x.vendidos,pct(x.conversao),x.atrasados,d.transferencias_disponiveis?x.passados_atraso:'—'])}/>:<Vazio/>}
        <p className="mt-3 text-xs text-muted-foreground">Mecânicos e demais funcionários precisam de registros próprios de tarefas concluídas e horas trabalhadas para uma avaliação operacional justa.</p>
      </Bloco>
      <Bloco titulo="Aprovação por banco" subtitulo="Cada banco conta uma única decisão final por ficha. Pendentes não entram no denominador da taxa de aprovação.">
        {melhorBanco&&<p className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">Melhor taxa com pelo menos 5 decisões: <strong>{melhorBanco.banco}</strong> — {pct(melhorBanco.taxa_aprovacao)}.</p>}
        {banco.length?<><ResponsiveContainer width="100%" height={245}><BarChart data={banco.slice(0,10)}><CartesianGrid strokeDasharray="3 3" opacity={0.15}/><XAxis dataKey="banco" fontSize={10}/><YAxis fontSize={10}/><Tooltip/><Legend/><Bar dataKey="aprovadas" name="Aprovadas" fill="#67c89a"/><Bar dataKey="negadas" name="Negadas" fill="#dd839e"/></BarChart></ResponsiveContainer>
          <GridTabela colunas={['Banco','Propostas','Aprovadas','Negadas','Pendentes','Taxa decisões']} linhas={banco.map((b:any)=>[b.banco,b.propostas,b.aprovadas,b.negadas,b.pendentes,pct(b.taxa_aprovacao)])}/></>:<Vazio/>}
      </Bloco>
      <div className="grid gap-4 lg:grid-cols-2"><Bloco titulo="Estoque por carroceria" subtitulo="Composição do estoque desta empresa; não representa volume de vendas.">
        {boxCarroceria.length?<ResponsiveContainer width="100%" height={260}><BarChart data={boxCarroceria}><CartesianGrid strokeDasharray="3 3" opacity={0.15}/><XAxis dataKey="carroceria" fontSize={10}/><YAxis fontSize={11}/><Tooltip/><Bar dataKey="quantidade" name="Veículos" fill={CORES[0]}/></BarChart></ResponsiveContainer>:<Vazio/>}
      </Bloco><Bloco titulo="Projeção de venda por carroceria" subtitulo="Usa seis meses fechados de vendas identificadas pela placa. Não utiliza a proporção de estoque como previsão.">
        {proj.length?<GridTabela colunas={['Carroceria','Vendas em 6 meses','Últimos 3 meses','Próximo mês (estimativa)']} linhas={proj.map((x:any)=>[x.carroceria,x.vendas_seis_meses,x.vendas_ultimos_tres_meses,x.estimativa_mes_seguinte===null?'Dados insuficientes':x.estimativa_mes_seguinte])}/>:<Vazio msg="Sem histórico suficiente de vendas datadas com carroceria identificada."/>}
        <p className="mt-3 text-xs text-muted-foreground">Cobertura das vendas datadas: {pct(d.vendas_por_carroceria?.cobertura)}. Previsões só aparecem com pelo menos 5 vendas distribuídas por 3 meses distintos.</p>
      </Bloco></div>
      <details className="rounded-xl border p-4 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">Definições e limites dos indicadores</summary>
        {Object.entries(d.definicoes||{}).map(([k,v])=><p className="mt-2" key={k}><strong className="capitalize">{k}:</strong> {String(v)}</p>)}
        <p className="mt-2">Atualizado em {new Date(d.atualizado_em).toLocaleString('pt-BR')}.</p>
      </details>
    </>}
  </div>;
}
