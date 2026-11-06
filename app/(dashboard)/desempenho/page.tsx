'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { Activity, AlertTriangle, ArrowLeft, BarChart3, RefreshCw, Users } from 'lucide-react';

type Funil={resposta:number|null;ficha:number|null;aprovacao:number|null;venda:number|null;venda_maduros:number|null};
type Stats={leads:number;respondidos:number;fichas:number;aprovados:number;vendas:number;maduros:number;vendas_maduros:number;completude_total:number;transferidos:number};
type Seller=Stats&{id:number;nome:string;loja:string|null;taxa_resposta:number|null;taxa_ficha:number|null;
 taxa_aprovacao:number|null;taxa_venda:number|null;taxa_venda_maduros:number|null;qualidade_cadastral:number|null;
 esperado_mesma_origem:number|null;diferenca_esperada_pp:number|null;cobertura_comparacao:number|null;
 sinal:string;confianca:string;por_origem:Array<{origem:string}&Stats>};
type Origin=Stats&{origem:string;vendedores_com_amostra:number;taxa_venda:number|null;taxa_venda_maduros:number|null;taxa_ficha:number|null;
 taxa_aprovacao:number|null;qualidade_cadastral:number|null;sinal:string};
type Report={empresa:{id:number;nome:string};loja:string|null;periodo:{etiqueta:string;inicio:string|null;fim:string|null};
 total:Stats;funil:Funil;vendedores:Seller[];origens:Origin[];diagnosticos:string[];avisos:string[];
 metodologia:{atribuicao:string;origem:string;denominadores:string;maturacao:string;completude:string;inferencia:string};atualizado_em:string};
const qtd=(x:number|null|undefined)=>Number(x||0).toLocaleString('pt-BR');
const pct=(x:number|null|undefined)=>x==null?'—':`${(100*x).toFixed(1).replace('.',',')}%`;
function Card({title,value,subtitle}:{title:string;value:string;subtitle?:string}){
 return <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{title}</p>
  <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>{subtitle&&<p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}</div>;
}
function Rate({value}:{value:number|null}){
 return <div className="min-w-[96px] space-y-1"><span className="text-sm tabular-nums">{pct(value)}</span>
  <div className="h-1.5 w-full overflow-hidden rounded bg-muted"><div className="h-full rounded bg-primary" style={{width:`${Math.max(0,Math.min(100,(value||0)*100))}%`}}/></div></div>;
}
export default function DesempenhoPage(){
 const {user}=useAuth();const papel=String(user?.tipo||'').toLowerCase();
 const autorizado=['superadmin','admin','gerente','marketing'].includes(papel);
 const superadmin=papel==='superadmin';
 const [empresa,setEmpresa]=useState('');const [loja,setLoja]=useState('');
 const [periodo,setPeriodo]=useState('90dias');const [vendedor,setVendedor]=useState('todos');
 const empresas=useQuery({queryKey:['desempenho-empresas'],enabled:superadmin&&autorizado,
  queryFn:async()=>(await api.get('/integracoes/empresas')).data as Array<{id:number;nome:string}>});
 useEffect(()=>{if(superadmin&&empresas.data?.length)setEmpresa(old=>old||String(empresas.data![0].id));},[superadmin,empresas.data]);
 useEffect(()=>{setLoja('');setVendedor('todos');},[empresa]);
 const pronto=autorizado&&(!superadmin||!!empresa);
 const lojas=useQuery({queryKey:['desempenho-lojas',empresa],enabled:pronto,
  queryFn:async()=>(await api.get('/metricas/lojas',{params:{empresa_id:superadmin?empresa:undefined}})).data as Array<{codigo:string;nome:string}>});
 const r=useQuery({queryKey:['desempenho-v1',empresa,loja,periodo],enabled:pronto,
  queryFn:async()=>(await api.get('/desempenho',{params:{empresa_id:superadmin?empresa:undefined,loja:loja||undefined,periodo}})).data as Report,
  refetchInterval:60000,staleTime:20000});
 const d=r.data;
 const selected=useMemo(()=>d?.vendedores.find(v=>String(v.id)===vendedor)||null,[d,vendedor]);
 const rows=useMemo(()=>vendedor==='todos'?d?.vendedores||[]:selected?[selected]:[],[d,vendedor,selected]);
 if(!autorizado)return <p className="p-6 text-sm text-muted-foreground">Sem permissão para visualizar desempenho da equipe.</p>;
 return <div className="mx-auto max-w-7xl space-y-5 pb-28">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><Link className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline" href="/metricas"><ArrowLeft size={14}/> Métricas</Link>
    <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><BarChart3 className="text-primary"/>Desempenho comercial</h1>
    <p className="mt-2 text-sm text-muted-foreground">Funil por vendedor e por origem — comparação justa de carteiras, sem diagnóstico automático de culpa.</p></div>
   <button type="button" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={()=>r.refetch()}><RefreshCw size={16}/> Atualizar</button>
  </div>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   {superadmin&&<label className="text-xs text-muted-foreground">Empresa<select value={empresa} onChange={e=>setEmpresa(e.target.value)} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm text-foreground">
    <option value="">Selecione</option>{(empresas.data||[]).map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>}
   {papel!=='gerente'&&<label className="text-xs text-muted-foreground">Loja<select value={loja} onChange={e=>{setLoja(e.target.value);setVendedor('todos');}} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm text-foreground">
    <option value="">Todas as lojas</option>{(lojas.data||[]).map(x=><option key={x.codigo} value={x.codigo}>{x.nome?`${x.codigo} · ${x.nome}`:x.codigo}</option>)}</select></label>}
   <label className="text-xs text-muted-foreground">Período de entrada<select value={periodo} onChange={e=>setPeriodo(e.target.value)} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm text-foreground">
    <option value="90dias">Últimos 90 dias</option><option value="mes">Este mês</option><option value="mes_passado">Mês anterior</option><option value="tudo">Todo histórico</option>
   </select></label>
   <label className="text-xs text-muted-foreground">Vendedor<select value={vendedor} onChange={e=>setVendedor(e.target.value)} className="mt-1 block w-full rounded-md border bg-background p-2 text-sm text-foreground">
    <option value="todos">Equipe completa</option>{(d?.vendedores||[]).map(v=><option key={v.id} value={v.id}>{v.nome} · {v.loja||'sem loja'}</option>)}</select></label>
  </div>
  {r.isLoading&&<p className="rounded-xl border p-4 text-sm">Calculando funil e origem dos leads…</p>}
  {r.error&&<div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-500">{(r.error as any)?.response?.data?.error||'Falha ao calcular desempenho. Confira as migrations.'}</div>}
  {d&&<>
   <p className="text-xs text-muted-foreground">{d.empresa.nome} · {d.periodo.etiqueta} · Atualizado em {new Date(d.atualizado_em).toLocaleString('pt-BR')} · Resultados dos leads recebidos no período</p>
   <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    <Card title="Leads recebidos" value={qtd(d.total.leads)} subtitle="Atribuídos à carteira atual"/>
    <Card title="Responderam" value={qtd(d.total.respondidos)} subtitle={pct(d.funil.resposta)+' dos leads'}/>
    <Card title="Fichas geradas" value={qtd(d.total.fichas)} subtitle={pct(d.funil.ficha)+' dos leads'}/>
    <Card title="Aprovações" value={qtd(d.total.aprovados)} subtitle={pct(d.funil.aprovacao)+' por ficha'}/>
    <Card title="Vendas" value={qtd(d.total.vendas)} subtitle={pct(d.funil.venda)+' dos leads'}/>
   </section>
   <section className="rounded-2xl border bg-card p-4 space-y-3">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity size={19}/> Onde a conversão diminui?</h2>
    <div className="grid gap-2 sm:grid-cols-4">
     {[['Resposta',d.total.respondidos,d.funil.resposta],['Ficha',d.total.fichas,d.funil.ficha],['Aprovação',d.total.aprovados,d.funil.aprovacao],['Venda',d.total.vendas,d.funil.venda]].map(([title,n,rate])=><div key={String(title)} className="rounded-lg border p-3">
       <p className="text-xs text-muted-foreground">{String(title)}</p><p className="mt-1 text-xl font-bold">{qtd(n as number)}</p><Rate value={rate as number|null}/>
      </div>)}
    </div>
    <p className="text-xs text-muted-foreground">Resposta, ficha e venda são medidas sobre todos os leads; aprovação é medida sobre fichas. As etapas podem não ser estritamente sequenciais (por exemplo, venda à vista).</p>
   </section>
   <section className="rounded-2xl border bg-card p-4">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle size={19}/> Sinais para investigação</h2>
    <div className="mt-3 space-y-2">{d.diagnosticos.map((s,i)=><p key={i} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{s}</p>)}
      {d.avisos.map((s,i)=><p key={'w'+i} className="rounded-lg border border-amber-500/20 px-3 py-2 text-xs text-muted-foreground">{s}</p>)}</div>
   </section>
   <section className="rounded-2xl border bg-card p-4">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><Users size={19}/> Resultado individual</h2>
    <p className="mb-3 text-xs text-muted-foreground">Vendas por lead recebido, fichas, aprovações e comparação com outros vendedores que receberam leads das mesmas origens. Com amostra pequena, não há comparação conclusiva.</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs sm:text-sm">
      <thead className="border-b text-muted-foreground"><tr>{['Vendedor','Loja','Leads','Resposta','Fichas','Aprovações','Vendas','Leads 30d+','Venda 30d+','Referência mesma origem','Sinal'].map(x=><th key={x} className="px-2 py-3 font-medium">{x}</th>)}</tr></thead>
      <tbody>{rows.map(s=><tr key={s.id} className="border-b last:border-0"><td className="px-2 py-3 font-medium">{s.nome}</td><td className="px-2 py-3">{s.loja||'—'}</td>
       <td className="px-2 py-3 tabular-nums">{qtd(s.leads)}</td><td className="px-2 py-3"><Rate value={s.taxa_resposta}/></td>
       <td className="px-2 py-3">{qtd(s.fichas)} <span className="text-muted-foreground">({pct(s.taxa_ficha)})</span></td>
       <td className="px-2 py-3">{qtd(s.aprovados)} <span className="text-muted-foreground">({pct(s.taxa_aprovacao)})</span></td>
       <td className="px-2 py-3">{qtd(s.vendas)} <span className="text-muted-foreground">({pct(s.taxa_venda)})</span></td>
       <td className="px-2 py-3">{qtd(s.maduros)}</td><td className="px-2 py-3"><Rate value={s.taxa_venda_maduros}/></td>
       <td className="px-2 py-3">{s.confianca==='comparavel'&&s.diferenca_esperada_pp!=null?`${s.diferenca_esperada_pp>0?'+':''}${s.diferenca_esperada_pp} p.p.`:'Amostra insuficiente'}</td>
       <td className="px-2 py-3 max-w-[230px] text-xs text-muted-foreground">{s.sinal}</td>
      </tr>)}</tbody>
    </table>{!rows.length&&<p className="p-3 text-sm text-muted-foreground">Sem vendedores nesse recorte.</p>}</div>
   </section>
   {selected&&<section className="rounded-2xl border bg-card p-4"><h2 className="mb-2 text-lg font-semibold">De onde vieram os leads de {selected.nome}?</h2>
     <p className="mb-3 text-xs text-muted-foreground">Completude cadastral média: {selected.qualidade_cadastral??'—'}/100 · {selected.transferidos} lead(s) transferidos.</p>
     <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Origem</th><th className="p-2">Leads</th><th className="p-2">Responderam</th><th className="p-2">Fichas</th><th className="p-2">Aprovações</th><th className="p-2">Vendas</th></tr></thead>
     <tbody>{selected.por_origem.map(o=><tr key={o.origem} className="border-b last:border-0"><td className="p-2">{o.origem}</td><td className="p-2">{o.leads}</td><td className="p-2">{o.respondidos}</td><td className="p-2">{o.fichas}</td><td className="p-2">{o.aprovados}</td><td className="p-2">{o.vendas}</td></tr>)}</tbody></table></div></section>}
   <section className="rounded-2xl border bg-card p-4"><h2 className="text-lg font-semibold">Qualidade observada por origem</h2>
     <p className="my-2 text-xs text-muted-foreground">Completude mede se o cadastro tem informações mínimas, não o interesse real em comprar. Origens precisam de volume, maturação e vendedores distintos para comparação.</p>
     <div className="overflow-x-auto"><table className="w-full min-w-[930px] text-left text-sm"><thead><tr className="border-b text-muted-foreground">{['Origem','Leads','Completude','Fichas / lead','Aprovações / ficha','Vendas / lead','Vendas 30d+','Análise'].map(x=><th key={x} className="p-2 font-medium">{x}</th>)}</tr></thead>
     <tbody>{d.origens.map(o=><tr key={o.origem} className="border-b last:border-0"><td className="p-2 font-medium">{o.origem}</td><td className="p-2">{qtd(o.leads)}</td>
       <td className="p-2">{o.qualidade_cadastral??'—'}/100</td><td className="p-2">{pct(o.taxa_ficha)}</td><td className="p-2">{pct(o.taxa_aprovacao)}</td>
       <td className="p-2">{pct(o.taxa_venda)}</td><td className="p-2">{pct(o.taxa_venda_maduros)}</td><td className="p-2 text-xs">{o.sinal}</td></tr>)}</tbody></table></div>
   </section>
   <details className="rounded-2xl border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Metodologia, limites e interpretação</summary>
    <div className="mt-3 space-y-2 text-xs text-muted-foreground">{Object.values(d.metodologia).map((x,i)=><p key={i}>{x}</p>)}
     <p>Este painel não comprova causalidade nem deve ser usado isoladamente para avaliar remuneração ou aplicar punições.</p></div>
   </details>
  </>}
 </div>;
}
