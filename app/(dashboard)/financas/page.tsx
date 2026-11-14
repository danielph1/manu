'use client';
import {useEffect,useMemo,useState,type FormEvent,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/contexts/auth-context';
import {api} from '@/lib/api';
import {toast} from 'sonner';
import {CalendarDays,CheckCircle2,Clock3,FileText,Landmark,PenLine,Plus,RefreshCcw,
  Shield,Trash2,Wallet,ArrowDownRight,ArrowUpRight,AlertCircle} from 'lucide-react';

type Agenda={id:number;empresa_id:number;loja:string;tipo:'entrada'|'saida';categoria:string;descricao:string;
 forma:string;lead_id:number|null;cliente?:string;valor:number|null;inicio:string;frequencia:'mensal'|'unica';
 repeticoes:number|null;origem:'aurox'|'manual';ativo:boolean};
type Parcela={id:number;agendamento_id:number;empresa_id:number;numero:number;vencimento:string;
 valor:number|null;desconto:number;recebido:number;status:string;pago_em:string|null;descricao:string;tipo:string;
 forma:string;categoria:string;origem:string;loja:string;cliente:string};
type Venda={lead_id:number;cliente:string;faturamento_id:number;loja:string;placa:string;created_at:string;
 entrada:number;boleto:number;financiamento:number|null;bruto_documentado:number;
 desconto_entrada:number;desconto_boleto:number;desconto_financiamento:number;
 fin_parcelas:number|string|null;fin_valor_parcela:number|string|null};
type PagamentoVenda={id:number;empresa_id:number;lead_id:number;faturamento_id:number;componente:string;
 valor:number;pago_em:string;observacao:string;estornado_em:string|null};
type PagamentoParcela={id:number;parcela_id:number;valor:number;pago_em:string;observacao:string;estornado_em:string|null};
type Movimento={id:number;loja:string;tipo:string;status:string;categoria:string;descricao:string;
 valor:number;data_movimento:string;origem_tipo:string|null;origem_id:string|null};
type Data={caixa:{entradas:number;saidas:number;oficina:number;outras_saidas:number;
 saldo_caixa:number;saldo_operacional:number;lancamentos_confirmados:number};
 bruto_documentado:number;financiamento_ausente:number;desde:string|null;ate:string|null;
 vendas:Venda[];agenda:Agenda[];parcelas:Parcela[];
 documentos_nao_conciliados:Array<{id:number;nome:string;placa:string;entrada_total:number;
  entrada_boleto:number;fin_parcelas:number|null;fin_valor_parcela:number|null;motivo:string;status:string}>;
 clientes_boleto:Array<{id:number;nome:string;faturamento_id:number|null}>;
 pagamentos_venda:PagamentoVenda[];pagamentos_parcela:PagamentoParcela[];
 movimentos_recebidos:Array<{id:number;origem_tipo:string;origem_id:string;valor:number;data_movimento:string}>;
 movimentos:Movimento[];nota:string};
type FinanceSource={tipo:'parcela';parcela:Parcela}|{tipo:'venda';venda:Venda;componente:'entrada'|'boleto'|'financiamento'};
type Draft={fonte:FinanceSource;valor:string;desconto:string;data:string;observacao:string};
const reais=(v:number|null|undefined)=>v==null?'Não informado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
const diaAtual=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const dataApenas=(v:unknown)=>String(v||'').slice(0,10);
const mostrarData=(v:unknown)=>v?dataApenas(v).split('-').reverse().join('/'):'—';
const input='w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';
const btn='inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40';
const principal='inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50';
const formularioVazio=()=>({tipo:'saida',categoria:'Contas gerais',descricao:'',forma:'boleto',loja:'',lead_id:'',valor:'',
 inicio:diaAtual(),frequencia:'unica',repeticoes:''});
function moneyNumber(s:string){const valor=Number(String(s).replace(',','.'));return Number.isFinite(valor)?valor:NaN;}
function firstDay(){return `${diaAtual().slice(0,7)}-01`;}
function minusDays(n:number){const d=new Date();d.setDate(d.getDate()-n);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
const nomesComponente:{[key:string]:string}={entrada:'Entrada sem boleto',boleto:'Boleto da entrada',financiamento:'Financiamento liberado'};
function Caixa({nome,valor,descricao,icone}:{nome:string;valor:string;descricao:string;icone:ReactNode}){
 return <div className="rounded-2xl border border-border bg-card p-4"><div className="flex justify-between gap-2 text-xs text-muted-foreground"><span>{nome}</span>{icone}</div>
  <p className="mt-2 text-2xl font-semibold tabular-nums">{valor}</p><p className="mt-2 text-xs text-muted-foreground">{descricao}</p></div>;
}
function Bloco({titulo,descricao,children}:{titulo:string;descricao:string;children:ReactNode}){
 return <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
  <header className="mb-4"><h2 className="text-base font-semibold">{titulo}</h2><p className="mt-1 text-xs text-muted-foreground">{descricao}</p></header>{children}</section>;
}
function Campo({label,children}:{label:string;children:ReactNode}){
 return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span>{children}</label>;
}
function Vazio({children}:{children:ReactNode}){return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{children}</p>;}

export default function FinancasPage(){
 const {user}=useAuth(),qc=useQueryClient(),cargo=String(user?.tipo||'').toLowerCase();
 const acesso=cargo==='admin'||cargo==='superadmin',superadmin=cargo==='superadmin';
 const [empresa,setEmpresa]=useState(''),[aba,setAba]=useState<'resumo'|'contas'|'vendas'>('resumo');
 const [intervalo,setIntervalo]=useState('todos'),[desde,setDesde]=useState(''),[ate,setAte]=useState('');
 const [form,setForm]=useState(formularioVazio),[editando,setEditando]=useState<number|null>(null);
 const [criando,setCriando]=useState(false),[salvando,setSalvando]=useState(false);
 const [draft,setDraft]=useState<Draft|null>(null),[sourceFin,setSourceFin]=useState<{venda:Venda;valor:string;fonte:string}|null>(null);
 const [preco,setPreco]=useState(''),[lojaAurox,setLojaAurox]=useState('');
 const [maisMensalidades,setMaisMensalidades]=useState(false);
 const es=useQuery({queryKey:['financas-empresas'],enabled:acesso,queryFn:async()=>
  ((await api.get('/faturamento/empresas')).data||[]) as Array<{id:number;nome:string;lojas:Array<{codigo:string;nome:string}>}>});
 useEffect(()=>{if(superadmin&&es.data?.length)setEmpresa(e=>es.data!.some(x=>String(x.id)===e)?e:String(es.data![0].id));},[superadmin,es.data]);
 const empresaId=superadmin?Number(empresa):Number(user?.empresa_id||0);
 const lojas=es.data?.find(x=>x.id===empresaId)?.lojas||[];
 useEffect(()=>{if(lojas.length){setForm(f=>({...f,loja:lojas.some(l=>l.codigo===f.loja)?f.loja:lojas[0].codigo}));setLojaAurox(lojas[0].codigo);}},[empresaId,es.data]);
 function mudarIntervalo(v:string){setIntervalo(v);if(v==='todos'){setDesde('');setAte('');}
  if(v==='mes'){setDesde(firstDay());setAte(diaAtual());}
  if(v==='90'){setDesde(minusDays(89));setAte(diaAtual());}}
 const dados=useQuery<Data>({queryKey:['financas-v2',empresaId,desde,ate],enabled:acesso&&empresaId>0,
  queryFn:async()=> (await api.get('/financas',{params:{empresa_id:superadmin?empresaId:undefined,
   desde:desde||undefined,ate:ate||undefined}})).data,refetchInterval:60000});
 const d=dados.data;const hoje=diaAtual();
 const parcelas=d?.parcelas||[],manuais=parcelas.filter(x=>x.origem!=='aurox');
 const abertas=manuais.filter(p=>p.status!=='pago'&&p.status!=='cancelado'&&dataApenas(p.vencimento)>=hoje);
 const atrasadas=manuais.filter(p=>p.status!=='pago'&&p.status!=='cancelado'&&dataApenas(p.vencimento)<hoje);
 const mensalidades=parcelas.filter(p=>p.origem==='aurox').sort((a,b)=>a.vencimento.localeCompare(b.vencimento));
 const proximaAurox=mensalidades.find(p=>p.status!=='pago'&&dataApenas(p.vencimento)>=hoje)||mensalidades.find(p=>p.status!=='pago');
 const contratoAurox=d?.agenda.find(a=>a.origem==='aurox');
 const pagamentosPorParcela=useMemo(()=>{const map=new Map<number,PagamentoParcela[]>();for(const p of d?.pagamentos_parcela||[]){
  map.set(p.parcela_id,[...(map.get(p.parcela_id)||[]),p]);}return map;},[d?.pagamentos_parcela]);
 const pagosPorVenda=useMemo(()=>{const map=new Map<string,PagamentoVenda[]>();for(const p of d?.pagamentos_venda||[]){
  const k=`${p.lead_id}:${p.componente}`;map.set(k,[...(map.get(k)||[]),p]);}return map;},[d?.pagamentos_venda]);
 function legadoRecebido(v:Venda,c:string){return (d?.movimentos_recebidos||[]).filter(p=>p.origem_tipo===`faturamento_${c}`&&p.origem_id===`lead:${v.lead_id}`).reduce((s,p)=>s+Number(p.valor),0);}
 function recebidoVenda(v:Venda,c:string){return (pagosPorVenda.get(`${v.lead_id}:${c}`)||[]).filter(p=>!p.estornado_em)
   .reduce((s,p)=>s+Number(p.valor),0)+legadoRecebido(v,c);}
 async function atualizar(){await qc.invalidateQueries({queryKey:['financas-v2',empresaId]});}
 const enviar=(extras?:Record<string,unknown>)=>({...extras,empresa_id:superadmin?empresaId:undefined});
 async function salvarConta(e:FormEvent){e.preventDefault();if(salvando)return;
  setSalvando(true);try{const b=enviar({...form,valor:moneyNumber(form.valor),lead_id:form.lead_id?Number(form.lead_id):null,
   repeticoes:form.repeticoes?Number(form.repeticoes):null});
   if(editando)await api.patch(`/financas/agendamentos/${editando}`,b);else await api.post('/financas',b);
   toast.success(editando?'Agendamento atualizado':'Compromisso criado');setEditando(null);setCriando(false);
   setForm({...formularioVazio(),loja:form.loja});await atualizar();
  }catch(e:any){toast.error(e?.response?.data?.error||'Erro ao salvar compromisso');}finally{setSalvando(false);}}
 function editarConta(a:Agenda){if(a.origem==='aurox')return;setAba('contas');setCriando(true);setEditando(a.id);
  setForm({tipo:a.tipo,categoria:a.categoria,descricao:a.descricao,forma:a.forma,loja:a.loja,
   lead_id:a.lead_id?String(a.lead_id):'',valor:String(a.valor||''),inicio:dataApenas(a.inicio),
   frequencia:a.frequencia,repeticoes:a.repeticoes==null?'':String(a.repeticoes)});}
 async function cancelarConta(a:Agenda){if(a.origem==='aurox'||!confirm(`Cancelar as parcelas futuras de ${a.descricao}? Valores pagos serão preservados.`))return;
  try{await api.delete(`/financas/agendamentos/${a.id}`,{params:enviar()});toast.success('Parcelas futuras canceladas');await atualizar();}
  catch(e:any){toast.error(e?.response?.data?.error||'Falha ao cancelar');}}
 function abrirParcela(p:Parcela){const saldo=Math.max(0,Number(p.valor||0)-Number(p.desconto||0)-Number(p.recebido||0));
  if(p.valor==null||saldo<=0)return toast.error('Sem saldo pendente nesta parcela');
  setDraft({fonte:{tipo:'parcela',parcela:p},valor:saldo.toFixed(2),desconto:String(p.desconto||0),data:diaAtual(),observacao:''});}
 function abrirVenda(v:Venda,componente:'entrada'|'boleto'|'financiamento'){
  const documentado=Number(v[componente]||0),desconto=Number(v[`desconto_${componente}`]||0);
  if(!documentado){toast.error('Primeiro informe o valor documental do financiamento ou boleto');return;}
  const saldo=Math.max(0,documentado-desconto-recebidoVenda(v,componente));
  if(!saldo)return toast.message('Este componente está quitado');
  setDraft({fonte:{tipo:'venda',venda:v,componente},valor:saldo.toFixed(2),desconto:String(desconto),data:diaAtual(),observacao:''});}
 async function confirmarPagamento(e:FormEvent){e.preventDefault();if(!draft)return;
  const valor=moneyNumber(draft.valor),desconto=moneyNumber(draft.desconto);
  if(!(valor>0)||!(desconto>=0)||!draft.data)return toast.error('Informe valor, desconto e data válidos');
  if(desconto>0&&!draft.observacao.trim())return toast.error('Explique o acordo que motivou o desconto');
  setSalvando(true);try{
   if(draft.fonte.tipo==='parcela')await api.post(`/financas/parcelas/${draft.fonte.parcela.id}`,
     enviar({acao:'receber',valor,...(draft.fonte.parcela.origem==='aurox'?{}:{desconto}),pago_em:draft.data,observacao:draft.observacao}));
   else await api.post('/financas/venda',enviar({acao:'receber',valor,desconto,
     faturamento_id:draft.fonte.venda.faturamento_id,componente:draft.fonte.componente,
     data_movimento:draft.data,observacao:draft.observacao}));
   toast.success('Recebimento real registrado na data informada');setDraft(null);await atualizar();
  }catch(e:any){toast.error(e?.response?.data?.error||'Falha ao confirmar recebimento');}finally{setSalvando(false);}}
 async function estornarParcela(parcela:Parcela,pagamento:PagamentoParcela){if(!confirm('Estornar esta baixa? O valor sairá do caixa, com histórico preservado.'))return;
  try{await api.post(`/financas/parcelas/${parcela.id}`,enviar({acao:'estornar_pagamento',pagamento_id:pagamento.id}));
   toast.success('Baixa estornada');await atualizar();}catch(e:any){toast.error(e?.response?.data?.error||'Erro ao estornar');}}
 async function estornarVenda(v:Venda,componente:string,pagamento:PagamentoVenda){if(!confirm('Estornar o valor recebido nesta data?'))return;
  try{await api.post('/financas/venda',enviar({acao:'estornar',faturamento_id:v.faturamento_id,
   componente,pagamento_id:pagamento.id}));toast.success('Recebimento estornado');await atualizar();}
  catch(e:any){toast.error(e?.response?.data?.error||'Erro ao estornar');}}
 async function mudarVencimento(parcela:Parcela){if(parcela.origem==='aurox')return;
  const vencimento=prompt('Novo vencimento (AAAA-MM-DD):',dataApenas(parcela.vencimento));if(!vencimento)return;
  try{await api.post(`/financas/parcelas/${parcela.id}`,enviar({acao:'vencimento',vencimento}));toast.success('Vencimento atualizado');await atualizar();}
  catch(e:any){toast.error(e?.response?.data?.error||'Data inválida');}}
 async function estornarMovimento(m:Movimento){if(m.origem_tipo&&!m.origem_tipo.startsWith('faturamento_'))return;
  if(!confirm('Estornar movimento legado? O histórico permanece no banco.'))return;
  try{await api.delete(`/financas/movimentos/${m.id}`,{params:enviar()});toast.success('Estornado');await atualizar();}
  catch(e:any){toast.error(e?.response?.data?.error||'Falha ao estornar');}}
 async function documentarFinanciamento(e:FormEvent){e.preventDefault();if(!sourceFin)return;
  const valor=moneyNumber(sourceFin.valor);if(!(valor>0)||sourceFin.fonte.trim().length<5)return toast.error('Informe valor liberado e fonte do documento');
  setSalvando(true);try{await api.post('/financas/venda',enviar({acao:'valor_financiado',faturamento_id:sourceFin.venda.faturamento_id,
   componente:'financiamento',valor,observacao:sourceFin.fonte}));toast.success('Valor liberado documentado');
   setSourceFin(null);await atualizar();}catch(e:any){toast.error(e?.response?.data?.error||'Erro ao documentar financiamento');}finally{setSalvando(false);}}
 async function definirAurox(){if(!superadmin||!contratoAurox||contratoAurox.valor!==null)return;
  if(!confirm(`Definir mensalidade contratual de ${reais(moneyNumber(preco))}? Essa configuração não pode ser repetida.`))return;
  try{await api.post('/financas/aurox',enviar({valor:moneyNumber(preco),loja:lojaAurox}));toast.success('Contrato registrado');await atualizar();}
  catch(e:any){toast.error(e?.response?.data?.error||'Falha ao registrar contrato');}}
 if(!acesso)return <div className="p-8"><Shield className="mb-3 text-destructive"/><h1>Finanças restritas</h1>
  <p className="text-sm text-muted-foreground">Somente admin e superadmin podem consultar esta área.</p></div>;
 const saldos=Number(d?.caixa?.entradas||0),caixa=d?.caixa;
 return <main className="mx-auto max-w-7xl space-y-6 pb-32">
  <header className="flex flex-wrap items-end justify-between gap-4">
   <div><p className="text-xs font-medium uppercase tracking-[.16em] text-primary">AUROX / Finanças</p>
    <h1 className="mt-2 text-3xl font-semibold">Controle financeiro</h1>
    <p className="mt-2 text-sm text-muted-foreground">Vendas documentadas, baixas reais, saldos negociados e vencimentos.</p></div>
   <div className="flex gap-2"><button className={btn} onClick={()=>void atualizar()}><RefreshCcw size={16}/>Atualizar</button>
    <button className={principal} onClick={()=>{setCriando(true);setEditando(null);setAba('contas');setForm({...formularioVazio(),loja:lojas[0]?.codigo||''});}}>
     <Plus size={16}/>Nova conta</button></div>
  </header>
  {superadmin&&<Campo label="Empresa"><select className={`${input} max-w-sm`} value={empresa} onChange={e=>setEmpresa(e.target.value)}>
    {(es.data||[]).map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>}
  <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
   <Campo label="Período dos indicadores"><select className={input} value={intervalo} onChange={e=>mudarIntervalo(e.target.value)}>
    <option value="todos">Todo o histórico</option><option value="mes">Este mês</option><option value="90">Últimos 90 dias</option>
    <option value="personalizado">Personalizado</option></select></Campo>
   <Campo label="De"><input type="date" className={input} value={desde} onChange={e=>{setDesde(e.target.value);setIntervalo('personalizado');}}/></Campo>
   <Campo label="Até"><input type="date" className={input} value={ate} onChange={e=>{setAte(e.target.value);setIntervalo('personalizado');}}/></Campo>
   <p className="sm:col-span-3 text-xs text-muted-foreground"><CalendarDays size={13} className="mr-1 inline"/>
    Os recebimentos e o saldo são filtrados pela data da baixa; vendas pelo dia da venda; contas pelo vencimento.</p>
  </div>
  {dados.isError&&<p role="alert" className="rounded-xl border border-rose-500/30 p-4 text-sm text-rose-400">{(dados.error as any)?.response?.data?.error||'Erro ao consultar Finanças. Confira a migration.'}</p>}
  {dados.isLoading&&<p className="text-sm text-muted-foreground">Consultando o financeiro…</p>}
  {d&&<>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Caixa nome="Total documentado identificável" valor={reais(d.bruto_documentado)} descricao={`${d.financiamento_ausente||0} vendas com financiamento não informado; não significa recebido.`} icone={<FileText size={17}/>}/>
    <Caixa nome="Entradas recebidas" valor={reais(saldos)} descricao="Soma apenas de pagamentos confirmados nas datas escolhidas." icone={<ArrowDownRight size={17}/>}/>
    <Caixa nome="Gasto pago na oficina" valor={reais(caixa?.oficina)} descricao="Custos da oficina efetivamente pagos." icone={<ArrowUpRight size={17}/>}/>
    <Caixa nome="Saldo operacional" valor={reais(caixa?.saldo_operacional)} descricao="Entradas recebidas menos gastos pagos na oficina." icone={<Wallet size={17}/>}/>
   </div>
   <div className="grid gap-3 sm:grid-cols-3">
    <Caixa nome="Outras despesas pagas" valor={reais(caixa?.outras_saidas)} descricao="Inclui contas gerais e Aurox quitadas." icone={<Landmark size={16}/>}/>
    <Caixa nome="Saldo total de caixa" valor={reais(caixa?.saldo_caixa)} descricao="Todas as entradas confirmadas menos todas as despesas pagas." icone={<Wallet size={16}/>}/>
    <Caixa nome="Baixas realizadas" valor={String(caixa?.lancamentos_confirmados||0)} descricao="Quantidade de movimentos de caixa efetivados." icone={<CheckCircle2 size={16}/>}/>
   </div>
   <div className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">
    {([['resumo','Visão geral'],['contas','Contas e boletos'],['vendas','Conciliação de vendas']] as const).map(([id,label])=><button
      key={id} className={`min-w-max rounded-lg px-4 py-2 text-sm ${aba===id?'bg-primary text-primary-foreground':'hover:bg-muted'}`} onClick={()=>setAba(id)}>{label}</button>)}
   </div>
   {aba==='resumo'&&<div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-2">
     <Bloco titulo="Próximas contas a pagar e receber" descricao="Somente compromissos manuais; a assinatura Aurox é mostrada separadamente.">
      {abertas.slice(0,6).map(p=><LinhaParcela key={p.id} p={p} pagamentos={pagamentosPorParcela.get(p.id)||[]} onReceber={abrirParcela}
        onEstornar={estornarParcela} onVencimento={mudarVencimento} superadmin={superadmin}/>)}
      {!abertas.length&&<Vazio>Nenhuma conta futura cadastrada.</Vazio>}
     </Bloco>
     <Bloco titulo="Contas vencidas" descricao="Saldos ainda não quitados. Pagamentos parciais ficam destacados.">
      {atrasadas.slice(0,6).map(p=><LinhaParcela key={p.id} p={p} pagamentos={pagamentosPorParcela.get(p.id)||[]} onReceber={abrirParcela}
        onEstornar={estornarParcela} onVencimento={mudarVencimento} superadmin={superadmin}/>)}
      {!atrasadas.length&&<Vazio>Nenhuma pendência vencida.</Vazio>}
     </Bloco>
    </div>
    <Bloco titulo="Assinatura Aurox" descricao="Contrato mensal protegido. As próximas competências são previsões, não doze cobranças atrasadas.">
     {contratoAurox?<div className="flex flex-wrap items-center gap-6">
      <p className="text-sm">Início do contrato: <strong>{mostrarData(contratoAurox.inicio)}</strong></p>
      <p className="text-sm">Mensalidade: <strong>{reais(contratoAurox.valor)}</strong></p>
      <p className="text-sm">Próximo vencimento: <strong>{mostrarData(proximaAurox?.vencimento)}</strong></p>
      <span className="rounded-lg border px-2 py-1 text-xs">{contratoAurox.valor==null?'A definir pela plataforma':'Agendamento mensal ativo'}</span>
     </div>:<Vazio>Contrato ainda não encontrado.</Vazio>}
     {superadmin&&contratoAurox?.valor==null&&<div className="mt-4 flex flex-wrap items-end gap-2">
       <Campo label="Valor mensal do contrato"><input type="number" min="0.01" step="0.01" className={input} value={preco} onChange={e=>setPreco(e.target.value)}/></Campo>
       <Campo label="Loja"><select className={input} value={lojaAurox} onChange={e=>setLojaAurox(e.target.value)}>{lojas.map(x=><option key={x.codigo} value={x.codigo}>{x.nome}</option>)}</select></Campo>
       <button className={principal} onClick={()=>void definirAurox()} disabled={!preco}>Definir uma vez</button></div>}
     <details className="mt-3 text-sm"><summary className="cursor-pointer text-primary">Consultar previsão e histórico das mensalidades</summary>
      <div className="mt-2 space-y-2">{mensalidades.map(p=><div className="flex justify-between gap-3 border-b py-1.5" key={p.id}>
       <span>{mostrarData(p.vencimento)} · Competência {p.numero}</span><span>{reais(p.valor)} · {p.status==='pago'?'Quitada':p.valor==null?'Prevista sem valor':'Pendente'}</span>
       {p.valor!=null&&p.status!=='pago'&&superadmin&&<button className={btn} onClick={()=>abrirParcela(p)}>Registrar pagamento</button>}</div>)}</div>
     </details>
    </Bloco>
    <Bloco titulo="Últimos movimentos" descricao="Pagamentos datados conforme o filtro; estornos permanecem identificáveis.">
     {(d.movimentos||[]).slice(0,45).map(m=><div key={m.id} className="flex flex-wrap items-center gap-3 border-b py-2.5 last:border-0">
      <div className="min-w-40 flex-1"><p className="text-sm font-medium">{m.descricao||m.categoria}</p>
       <p className="text-xs text-muted-foreground">{m.categoria} · Loja {m.loja} · {mostrarData(m.data_movimento)}</p></div>
      <strong className="text-sm">{m.tipo==='saida'?'−':'+'}{reais(m.valor)}</strong>
      <span className={`text-xs ${m.status==='confirmado'?'text-emerald-500':'text-muted-foreground'}`}>{m.status}</span>
      {(!m.origem_tipo||m.origem_tipo.startsWith('faturamento_'))&&m.status==='confirmado'&&<button className={btn} onClick={()=>void estornarMovimento(m)}>Estornar</button>}
     </div>)}
     {!d.movimentos.length&&<Vazio>Sem movimentos no período. Recebimento documental não é baixa de caixa.</Vazio>}
    </Bloco>
   </div>}
   {aba==='contas'&&<div className="space-y-4">
    {criando&&<form onSubmit={salvarConta} className="space-y-4 rounded-2xl border border-primary/30 bg-card p-5">
     <h2 className="font-semibold">{editando?'Editar compromisso':'Novo recebimento ou despesa'}</h2>
     <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Campo label="Fluxo"><select className={input} value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))}>
       <option value="saida">Conta a pagar</option><option value="entrada">Recebimento</option></select></Campo>
      <Campo label="Categoria"><input required className={input} value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))}/></Campo>
      <Campo label="Descrição"><input required className={input} value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))}/></Campo>
      <Campo label="Valor original por parcela"><input required type="number" min="0.01" step="0.01" className={input} value={form.valor} onChange={e=>setForm(f=>({...f,valor:e.target.value}))}/></Campo>
      <Campo label="Primeiro vencimento"><input required type="date" className={input} value={form.inicio} onChange={e=>setForm(f=>({...f,inicio:e.target.value}))}/></Campo>
      <Campo label="Forma"><select className={input} value={form.forma} onChange={e=>setForm(f=>({...f,forma:e.target.value}))}>
       {['boleto','pix','dinheiro','cartao','transferencia','outro'].map(x=><option key={x} value={x}>{x}</option>)}</select></Campo>
      <Campo label="Loja"><select required className={input} value={form.loja} onChange={e=>setForm(f=>({...f,loja:e.target.value}))}>
       {lojas.map(x=><option key={x.codigo} value={x.codigo}>{x.nome} ({x.codigo})</option>)}</select></Campo>
      <Campo label="Frequência"><select className={input} value={form.frequencia} onChange={e=>setForm(f=>({...f,frequencia:e.target.value,repeticoes:''}))}>
       <option value="unica">Uma vez</option><option value="mensal">Mensal</option></select></Campo>
      {form.frequencia==='mensal'&&<Campo label="Quantidade (vazio = até remover)"><input className={input} type="number" min="1" max="240" placeholder="Até cancelar" value={form.repeticoes} onChange={e=>setForm(f=>({...f,repeticoes:e.target.value}))}/></Campo>}
      {form.tipo==='entrada'&&form.forma==='boleto'&&<Campo label="Cliente que possui boleto"><select required className={input} value={form.lead_id} onChange={e=>setForm(f=>({...f,lead_id:e.target.value}))}>
       <option value="">Selecione</option>{d.clientes_boleto.map(l=><option value={l.id} key={l.id}>{l.nome} · {l.faturamento_id?`Fatura #${l.faturamento_id}`:'Ficha de crédito'}</option>)}</select></Campo>}
     </div>
     <div className="flex gap-2 justify-end"><button type="button" className={btn} onClick={()=>setCriando(false)}>Cancelar</button>
      <button type="submit" disabled={salvando} className={principal}>{salvando?'Salvando…':'Salvar compromisso'}</button></div>
    </form>}
    <Bloco titulo="Compromissos" descricao="Pode editar ou encerrar o futuro; pagamentos realizados permanecem auditáveis.">
     {d.agenda.map(a=><div key={a.id} className="flex flex-wrap items-center gap-3 border-b py-3 last:border-0">
      <div className="min-w-40 flex-1"><strong className="text-sm">{a.descricao}</strong>
       <p className="text-xs text-muted-foreground">{a.tipo==='entrada'?'A receber':'A pagar'} · {a.forma} · {a.cliente||a.loja} · {a.frequencia==='mensal'?'mensal':'único'}</p></div>
      <strong>{reais(a.valor)}</strong>{a.origem==='manual'?<div className="flex gap-2">
       <button className={btn} onClick={()=>editarConta(a)}><PenLine size={14}/>Editar</button>
       <button className={btn} onClick={()=>void cancelarConta(a)}><Trash2 size={14}/>Encerrar</button></div>:
       <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Shield size={13}/>Contrato protegido</span>}</div>)}
    </Bloco>
    <Bloco titulo="Parcelas e histórico de pagamentos" descricao="Valor original não muda com baixa parcial. O desconto fica registrado separadamente.">
     {manuais.map(p=><LinhaParcela key={p.id} p={p} pagamentos={pagamentosPorParcela.get(p.id)||[]} onReceber={abrirParcela}
      onEstornar={estornarParcela} onVencimento={mudarVencimento} superadmin={superadmin}/>)}
     {!manuais.length&&<Vazio>Sem parcelas manuais para este período.</Vazio>}
     {mensalidades.length>0&&<details className="mt-5"><summary className="cursor-pointer text-sm text-primary">Ver mensalidade Aurox e previsões ({mensalidades.length})</summary>
      {mensalidades.map(p=><div key={p.id} className="flex justify-between border-b py-2 text-xs"><span>{mostrarData(p.vencimento)}</span><span>{reais(p.valor)}</span><span>{p.valor==null?'Previsão':p.status}</span></div>)}</details>}
    </Bloco>
   </div>}
   {aba==='vendas'&&<div className="space-y-4">
    <Bloco titulo="Reconciliação de vendas" descricao="Somente faturas com lead marcado como vendido; um faturamento por lead. Entrada, boleto e financiamento são componentes distintos.">
     {d.vendas.map(v=><div key={v.lead_id} className="border-b py-5 last:border-0">
      <div className="mb-3 flex flex-wrap justify-between gap-2"><div><strong>{v.cliente||`Lead #${v.lead_id}`}</strong>
       <p className="text-xs text-muted-foreground">{v.placa||'Sem placa'} · Venda #{v.lead_id} · Faturamento #{v.faturamento_id} · {mostrarData(v.created_at)}</p></div>
       <span className="text-sm font-semibold">Documentado identificável: {reais(v.bruto_documentado)}</span></div>
      <div className="grid gap-3 md:grid-cols-3">{(['entrada','boleto','financiamento'] as const).map(c=>{
       const valor=v[c],desconto=Number(v[`desconto_${c}`]||0),recebido=recebidoVenda(v,c);
       const saldo=valor==null?null:Math.max(0,Number(valor)-desconto-recebido);
       const pagamentos=pagosPorVenda.get(`${v.lead_id}:${c}`)||[];
       return <div key={c} className="rounded-xl border border-border bg-background/40 p-3">
        <p className="text-xs font-medium text-muted-foreground">{nomesComponente[c]}</p>
        <p className="mt-2 text-lg font-semibold">{reais(valor)}</p>
        <p className="mt-1 text-xs">Recebido: <strong className="text-emerald-500">{reais(recebido)}</strong></p>
        <p className="mt-1 text-xs">Desconto: {reais(desconto)} · Saldo: <strong>{reais(saldo)}</strong></p>
        {c==='financiamento'&&<div className="mt-2 text-xs text-muted-foreground">
         {v.fin_parcelas!=null&&v.fin_valor_parcela!=null?`Parcelamento no faturamento: ${v.fin_parcelas} × ${reais(Number(v.fin_valor_parcela))} (não é valor liberado).`: 'Sem informação de valor liberado pelo banco.'}
         {Number(v.fin_parcelas)>360&&<p className="text-amber-500">Quantidade de parcelas atípica: confira no faturamento.</p>}
        </div>}
        <div className="mt-3 flex flex-wrap gap-2">
         {saldo!=null&&saldo>0&&<button className={btn} onClick={()=>abrirVenda(v,c)}>Registrar recebimento</button>}
         {c==='financiamento'&&<button className={btn} onClick={()=>setSourceFin({venda:v,valor:valor==null?'':String(valor),fonte:''})}>
          Informar valor liberado</button>}</div>
        {pagamentos.length>0&&<details className="mt-3 text-xs"><summary className="cursor-pointer text-primary">Histórico ({pagamentos.length})</summary>
         {pagamentos.map(p=><div key={p.id} className="mt-2 flex flex-wrap justify-between gap-2 border-b pb-2">
          <span>{mostrarData(p.pago_em)} · {reais(p.valor)}{p.estornado_em?' · estornado':''}</span>
          {!p.estornado_em&&<button className="underline" onClick={()=>void estornarVenda(v,c,p)}>Estornar</button>}</div>)}</details>}
       </div>;})}</div></div>)}
     {!d.vendas.length&&<Vazio>Não foram encontradas faturas vinculadas a vendas registradas no CRM neste período.</Vazio>}
    </Bloco>
    <Bloco titulo={`Documentos de faturamento não conciliados (${d.documentos_nao_conciliados.length})`}
     descricao="Faturas sem lead/venda ou documentos adicionais da mesma venda. Exibidos sem somar em duplicidade.">
     {d.documentos_nao_conciliados.map(f=><div key={f.id} className="flex flex-wrap justify-between gap-2 border-b py-3 text-sm">
      <div><strong>Faturamento #{f.id} · {f.nome}</strong><p className="text-xs text-muted-foreground">{f.placa} · {f.motivo==='sem_lead'?'Sem lead vinculado':f.motivo==='duplicado'?'Outro documento do mesmo lead (não somado novamente)':'Lead ainda sem venda confirmada'} · {f.status}</p></div>
      <span>Entrada total: {reais(Number(f.entrada_total||0))} · Boleto: {reais(Number(f.entrada_boleto||0))}</span></div>)}
     {!d.documentos_nao_conciliados.length&&<Vazio>Todos os documentos deste período estão conciliados com vendas.</Vazio>}
    </Bloco>
    <Bloco titulo="Baixas legadas" descricao="Recebimentos confirmados antes da atualização. São contabilizados no saldo e não devem ser lançados novamente.">
     {d.movimentos_recebidos.map(p=><div key={p.id} className="flex justify-between gap-2 border-b py-2 text-xs">
      <span>{p.origem_id} · {p.origem_tipo==='faturamento_entrada'?'Entrada':'Financiamento'}</span><span>{mostrarData(p.data_movimento)} · {reais(Number(p.valor))}</span></div>)}
     {!d.movimentos_recebidos.length&&<Vazio>Sem baixas legadas.</Vazio>}
    </Bloco>
   </div>}
  </>}
  {draft&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label="Registrar pagamento">
   <form onSubmit={confirmarPagamento} className="w-full max-w-lg space-y-4 rounded-2xl border bg-card p-5 shadow-2xl">
    <h2 className="text-lg font-semibold">Registrar pagamento ou recebimento</h2>
    <p className="text-sm text-muted-foreground">{draft.fonte.tipo==='parcela'?draft.fonte.parcela.descricao:
      `${draft.fonte.venda.cliente} · ${nomesComponente[draft.fonte.componente]}`}</p>
    <div className="grid grid-cols-2 gap-3">
     <Campo label="Valor efetivamente pago (R$)"><input autoFocus required type="number" min="0.01" step="0.01" className={input} value={draft.valor}
      onChange={e=>setDraft(x=>x?{...x,valor:e.target.value}:x)}/></Campo>
     <Campo label="Desconto total do acordo (R$)"><input required type="number" min="0" step="0.01" className={input} value={draft.desconto}
      onChange={e=>setDraft(x=>x?{...x,desconto:e.target.value}:x)}/></Campo>
     <Campo label="Data real do pagamento"><input required type="date" className={input} value={draft.data}
      onChange={e=>setDraft(x=>x?{...x,data:e.target.value}:x)}/></Campo>
     <Campo label="Observação / motivo do desconto"><input className={input} value={draft.observacao}
      onChange={e=>setDraft(x=>x?{...x,observacao:e.target.value}:x)} placeholder="Ex.: acordo por R$ 450"/></Campo>
    </div>
    <p className="rounded-xl border p-3 text-xs text-muted-foreground">Uma dívida de R$ 500 pode receber R$ 200 hoje, mantendo R$ 300 pendentes;
      ou ser quitada por R$ 450 com R$ 50 de desconto documentado. O caixa registra somente os R$ 200 ou R$ 450 recebidos.</p>
    <div className="flex justify-end gap-2"><button type="button" className={btn} onClick={()=>setDraft(null)}>Cancelar</button>
     <button className={principal} type="submit" disabled={salvando}>{salvando?'Registrando…':'Confirmar valor e data'}</button></div>
   </form></div>}
  {sourceFin&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label="Valor liberado do financiamento">
   <form onSubmit={documentarFinanciamento} className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-5 shadow-2xl">
    <h2 className="text-lg font-semibold">Documentar financiamento liberado</h2>
    <p className="text-sm text-muted-foreground">{sourceFin.venda.cliente} · Faturamento #{sourceFin.venda.faturamento_id}.
     Quantidade de parcelas × prestação não é o valor liberado pelo banco.</p>
    <Campo label="Valor liberado pelo banco (R$)"><input autoFocus required type="number" step="0.01" min="0.01" className={input}
     value={sourceFin.valor} onChange={e=>setSourceFin(x=>x?{...x,valor:e.target.value}:x)}/></Campo>
    <Campo label="Fonte da confirmação (banco/contrato)"><input required className={input} value={sourceFin.fonte} onChange={e=>setSourceFin(x=>x?{...x,fonte:e.target.value}:x)}
     placeholder="Ex.: comprovante de liberação BV"/></Campo>
    <div className="flex justify-end gap-2"><button type="button" className={btn} onClick={()=>setSourceFin(null)}>Cancelar</button>
     <button type="submit" className={principal} disabled={salvando}>Salvar valor documental</button></div>
   </form></div>}
 </main>;
}
function LinhaParcela({p,pagamentos,onReceber,onEstornar,onVencimento,superadmin}:{p:Parcela;pagamentos:PagamentoParcela[];
 onReceber:(p:Parcela)=>void;onEstornar:(p:Parcela,pagamento:PagamentoParcela)=>Promise<void>;
 onVencimento:(p:Parcela)=>Promise<void>;superadmin:boolean}){
 const receb=Number(p.recebido||0),saldo=p.valor==null?null:Math.max(0,Number(p.valor)-Number(p.desconto||0)-receb);
 const bloqueada=p.origem==='aurox'&&!superadmin;
 return <div className="border-b py-3 last:border-0">
  <div className="flex flex-wrap items-center gap-3"><div className="min-w-40 flex-1"><strong className="text-sm">{p.descricao}</strong>
   <p className="text-xs text-muted-foreground">{p.cliente||`Loja ${p.loja}`} · Parcela {p.numero} · {p.tipo==='entrada'?'A receber':'A pagar'}</p></div>
   <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 size={13}/>{mostrarData(p.vencimento)}</span>
   <div className="text-right text-sm"><strong>{reais(p.valor)}</strong><p className="text-xs">{p.status==='pago'?'Quitada':p.status==='parcial'?'Recebimento parcial':p.status==='negociado'?'Negociada':p.valor==null?'Prevista':p.status}</p></div>
   {!bloqueada&&saldo!=null&&saldo>0&&p.status!=='cancelado'&&<button className={btn} onClick={()=>onReceber(p)}>Dar baixa</button>}
   {p.origem!=='aurox'&&<button className={btn} title="Alterar vencimento" onClick={()=>void onVencimento(p)}><CalendarDays size={15}/></button>}
  </div>
  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>Recebido: {reais(receb)}</span>
   <span>Desconto: {reais(Number(p.desconto||0))}</span><span>Saldo: {reais(saldo)}</span></div>
  {pagamentos.length>0&&<details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">Ver {pagamentos.length} baixa(s) com datas</summary>
   {pagamentos.map(pg=><div className="mt-2 flex justify-between gap-3" key={pg.id}><span>{mostrarData(pg.pago_em)} · {reais(Number(pg.valor))}
    {pg.estornado_em?' · Estornado':''}</span>{!pg.estornado_em&&!bloqueada&&p.origem!=='aurox'&&
    <button className="underline" onClick={()=>void onEstornar(p,pg)}>Estornar</button>}</div>)}</details>}
 </div>;
}
