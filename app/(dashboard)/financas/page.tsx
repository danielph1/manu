'use client';
import {useEffect,useMemo,useState,type FormEvent,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/contexts/auth-context';
import {api} from '@/lib/api';
import {toast} from 'sonner';
import {ArrowDownRight,ArrowUpRight,BadgeCheck,CalendarClock,Check,Clock3,
  CreditCard,FileText,Landmark,Plus,RefreshCcw,Shield,Trash2,Wallet,PenLine} from 'lucide-react';

type Agenda={id:number;empresa_id:number;loja:string;tipo:'entrada'|'saida';categoria:string;descricao:string;
 forma:string;lead_id:number|null;cliente?:string;valor:number|null;inicio:string;frequencia:'mensal'|'unica';
 repeticoes:number|null;origem:'aurox'|'manual';ativo:boolean};
type Parcela={id:number;agendamento_id:number;empresa_id:number;numero:number;vencimento:string;
 valor:number|null;status:string;pago_em:string|null;descricao:string;tipo:string;forma:string;
 categoria:string;origem:string;loja:string;cliente:string};
type Venda={lead_id:number;cliente:string;faturamento_id:number;loja:string;placa:string;
 entrada:number;financiamento:number;bruto_documentado:number};
type Data={caixa:{entradas:number;saidas:number;oficina:number;outras_saidas:number;
 saldo_caixa:number;saldo_operacional:number;lancamentos_confirmados:number};
 bruto_documentado:number;vendas:Venda[];agenda:Agenda[];parcelas:Parcela[];
 clientes_boleto:Array<{id:number;nome:string;faturamento_id:number|null}>;
 movimentos_recebidos:Array<{id:number;origem_tipo:string;origem_id:string;valor:number;data_movimento:string}>;
 movimentos:Array<{id:number;loja:string;tipo:string;status:string;categoria:string;descricao:string;valor:number;
 data_movimento:string;origem_tipo:string|null;origem_id:string|null}>;nota:string};
const real=(v:number|null|undefined)=>v==null?'A definir':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
const localDay=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const dateStr=(d:unknown)=>String(d||'').slice(0,10);
const showDate=(d:unknown)=>d?dateStr(d).split('-').reverse().join('/'):'—';
const input='w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';
const btn='inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40';
const primary='inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50';
const blank=()=>({tipo:'saida',categoria:'Contas gerais',descricao:'',forma:'boleto',loja:'',lead_id:'',valor:'',
 inicio:localDay(),frequencia:'unica',repeticoes:''});
export default function FinancasPage(){
 const {user}=useAuth();const qc=useQueryClient();
 const role=String(user?.tipo||'').toLowerCase();const access=role==='admin'||role==='superadmin';
 const superadmin=role==='superadmin';
 const [empresa,setEmpresa]=useState(''),[aba,setAba]=useState<'visao'|'agenda'|'vendas'>('visao');
 const [form,setForm]=useState(blank);const [editando,setEditando]=useState<number|null>(null);
 const [criando,setCriando]=useState(false),[enviando,setEnviando]=useState(false),[preco,setPreco]=useState('');
 const [lojaCobranca,setLojaCobranca]=useState('');
 const es=useQuery({queryKey:['financas-empresas'],enabled:access,
  queryFn:async()=>((await api.get('/faturamento/empresas')).data||[]) as Array<{id:number;nome:string;lojas:Array<{codigo:string;nome:string}>}>});
 useEffect(()=>{if(superadmin&&es.data?.length)setEmpresa(e=>es.data!.some(x=>String(x.id)===e)?e:String(es.data![0].id));},[superadmin,es.data]);
 const empresaId=superadmin?Number(empresa):Number(user?.empresa_id||0);
 const empresaAtual=es.data?.find(e=>e.id===empresaId);
 const lojas=empresaAtual?.lojas||[];
 useEffect(()=>{if(lojas.length){setForm(f=>({...f,loja:lojas.some(l=>l.codigo===f.loja)?f.loja:lojas[0].codigo}));setLojaCobranca(lojas[0].codigo);}},[empresaId,es.data]);
 const dados=useQuery<Data>({queryKey:['financas',empresaId],enabled:access&&empresaId>0,
  queryFn:async()=> (await api.get('/financas',{params:{empresa_id:superadmin?empresaId:undefined}})).data,
  refetchInterval:60000});
 const d=dados.data;
 const aAurox=d?.agenda.find(a=>a.origem==='aurox');
 const parcelas=d?.parcelas||[];
 const hoje=localDay();
 const vencidas=parcelas.filter(p=>p.status==='pendente'&&dateStr(p.vencimento)<hoje);
 const próximas=parcelas.filter(p=>p.status==='pendente'&&dateStr(p.vencimento)>=hoje);
 const vendaMap=useMemo(()=>new Map<string,Data['movimentos_recebidos'][number]>((d?.movimentos_recebidos||[]).map(m=>[`${m.origem_tipo}:${m.origem_id}`,m] as const)),[d?.movimentos_recebidos]);
 const recebidas=Number(d?.caixa.entradas||0);
 async function refresh(){await qc.invalidateQueries({queryKey:['financas',empresaId]});}
 const payload=(extra?:any)=>({...extra,empresa_id:superadmin?empresaId:undefined});
 async function salvar(e:FormEvent){e.preventDefault();if(!access||!empresaId||enviando)return;
  if(form.tipo==='entrada'&&form.forma==='boleto'&&!form.lead_id){toast.error('Selecione um cliente com boleto cadastrado');return;}
  setEnviando(true);
  try{
   const body=payload({...form,valor:Number(form.valor),lead_id:form.lead_id?Number(form.lead_id):null,
    repeticoes:form.repeticoes?Number(form.repeticoes):null});
   if(editando)await api.patch(`/financas/agendamentos/${editando}`,body);
   else await api.post('/financas',body);
   toast.success(editando?'Agendamento atualizado':'Conta registrada');setCriando(false);setEditando(null);setForm({...blank(),loja:form.loja});await refresh();
  }catch(err:any){toast.error(err?.response?.data?.error||'Falha ao salvar conta');}finally{setEnviando(false);}
 }
 function editar(a:Agenda){if(a.origem==='aurox')return;setEditando(a.id);setCriando(true);setAba('agenda');
  setForm({tipo:a.tipo,categoria:a.categoria,descricao:a.descricao,forma:a.forma,loja:a.loja,
   lead_id:a.lead_id?String(a.lead_id):'',valor:String(a.valor||''),inicio:dateStr(a.inicio),
   frequencia:a.frequencia,repeticoes:a.repeticoes==null?'':String(a.repeticoes)});
  window.scrollTo({top:0,behavior:'smooth'});
 }
 async function remover(a:Agenda){if(a.origem==='aurox')return;
  if(!confirm(`Cancelar contas futuras de “${a.descricao}”? Valores já pagos continuam no histórico.`))return;
  try{await api.delete(`/financas/agendamentos/${a.id}`,{params:payload()});toast.success('Contas futuras canceladas');await refresh();}
  catch(e:any){toast.error(e?.response?.data?.error||'Erro ao cancelar');}
 }
 async function baixar(p:Parcela,acao:'baixar'|'reabrir'|'cancelar'){
  if(p.origem==='aurox'&&!superadmin)return;
  if(acao==='baixar'&&p.valor==null){toast.error('Valor da mensalidade não configurado');return;}
  let valor=p.valor,pago_em=localDay();
  if(acao==='baixar'){
    if(p.origem==='manual'){
      const dado=prompt('Quanto foi realmente pago/recebido (R$)?',String(p.valor||''));if(dado===null)return;
      valor=Number(dado.replace(',','.'));if(!Number.isFinite(valor)||valor<=0){toast.error('Valor inválido');return;}
    }
    const dia=prompt('Data de quitação (AAAA-MM-DD)',localDay());if(!dia)return;pago_em=dia;
  }else if(!confirm(`${acao==='cancelar'?'Cancelar':'Reabrir'} esta parcela?`))return;
  try{await api.post(`/financas/parcelas/${p.id}`,payload({acao,pago_em,...(p.origem==='manual'&&acao==='baixar'?{valor}:{} )}));toast.success('Parcela atualizada');await refresh();}
  catch(e:any){toast.error(e?.response?.data?.error||'Falha na baixa');}
 }
 async function receberVenda(v:Venda,componente:'entrada'|'financiamento'){
  const antigo=vendaMap.get(`faturamento_${componente}:lead:${v.lead_id}`);
  const base=componente==='entrada'?v.entrada:v.financiamento;
  const valor=prompt(`Valor de ${componente} EFETIVAMENTE recebido de ${v.cliente} (R$):`,String(antigo?.valor||base||''));
  if(valor==null)return;
  const dia=prompt('Data em que o dinheiro foi recebido (AAAA-MM-DD):',localDay());if(!dia)return;
  try{await api.post('/financas/venda',payload({faturamento_id:v.faturamento_id,componente,valor:Number(valor.replace(',','.')),data_movimento:dia}));
   toast.success('Recebimento conciliado, sem duplicar');await refresh();}
  catch(e:any){toast.error(e?.response?.data?.error||'Não foi possível confirmar recebimento');}
 }
 async function editarMovimento(m:{id:number;valor:number;data_movimento:string;descricao?:string;categoria?:string;origem_tipo?:string|null}){
  const valor=prompt('Valor efetivamente pago/recebido (R$):',String(m.valor));if(valor===null)return;
  const dia=prompt('Data da quitação (AAAA-MM-DD):',dateStr(m.data_movimento));if(dia===null)return;
  const descricao=m.origem_tipo?undefined:prompt('Descrição:',String(m.descricao||''));if(descricao===null)return;
  const categoria=m.origem_tipo?undefined:prompt('Categoria:',String(m.categoria||''));if(categoria===null)return;
  try{await api.patch(`/financas/movimentos/${m.id}`,payload({valor:Number(valor.replace(',','.')),data_movimento:dia,
     ...(descricao!==undefined?{descricao}:{}),...(categoria!==undefined?{categoria}:{})}));
   toast.success('Movimento corrigido');await refresh();}
  catch(e:any){toast.error(e?.response?.data?.error||'Falha ao corrigir movimento');}
 }
 async function excluirMovimento(m:{id:number}){
  if(!confirm('Estornar este recebimento? Ele sairá do saldo, mas permanecerá no histórico de auditoria.'))return;
  try{await api.delete(`/financas/movimentos/${m.id}`,{params:payload()});toast.success('Recebimento estornado');await refresh();}
  catch(e:any){toast.error(e?.response?.data?.error||'Falha ao estornar');}
 }
 async function configurarAurox(){if(!superadmin||!aAurox||aAurox.valor!==null)return;
  if(!confirm(`Definir a mensalidade da empresa em ${real(Number(preco))}? Essa operação é única e irreversível nesta interface.`))return;
  try{await api.post('/financas/aurox',payload({valor:Number(preco.replace(',','.')),loja:lojaCobranca}));
   toast.success('Valor contratual registrado');setPreco('');await refresh();}
  catch(e:any){toast.error(e?.response?.data?.error||'Erro ao configurar mensalidade');}
 }
 if(!access)return <div className="mx-auto max-w-2xl p-8"><Shield className="mb-3 text-destructive"/>
  <h1 className="text-xl font-semibold">Finanças restritas</h1><p className="mt-2 text-sm text-muted-foreground">Somente administradores e superadmin podem consultar esta área.</p></div>;
 const parcelCount=(d?.parcelas||[]).length;
 return <main className="mx-auto max-w-7xl space-y-6 pb-32">
  <header className="flex flex-wrap items-end justify-between gap-3">
   <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">AUROX / Administração financeira</p>
    <h1 className="mt-2 text-3xl font-bold tracking-tight">Finanças</h1>
    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Vendas, entradas, gastos pagos, boletos e vencimentos — todo o histórico da empresa, sem misturar concessionárias.</p></div>
   <div className="flex flex-wrap gap-2"><button className={btn} onClick={()=>void refresh()}><RefreshCcw size={16}/> Atualizar</button>
    <button className={primary} onClick={()=>{setEditando(null);setForm({...blank(),loja:lojas[0]?.codigo||''});setCriando(v=>!v);setAba('agenda')}}><Plus size={16}/> Nova conta</button></div>
  </header>
  {superadmin&&<label className="block max-w-sm text-xs font-medium text-muted-foreground">Empresa<select className={`${input} mt-1`} value={empresa} onChange={e=>setEmpresa(e.target.value)}>
    {(es.data||[]).map(e=><option value={e.id} key={e.id}>{e.nome}</option>)}</select></label>}
  {dados.isError&&<p role="alert" className="rounded-xl border border-red-500/30 p-4 text-sm text-red-400">{(dados.error as any)?.response?.data?.error||'Não foi possível carregar Finanças. Confira a migration SQL.'}</p>}
  {dados.isLoading&&<p className="text-sm text-muted-foreground">Consultando a empresa…</p>}
  {d&&<>
   <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
    <Kpi title="Bruto de vendas documentado" value={real(d.bruto_documentado)} sub="Financiamento + entrada, sem duplicar venda" icon={<FileText size={17}/>}/>
    <Kpi title="Entradas recebidas" value={real(recebidas)} sub="Somente baixas confirmadas" icon={<ArrowDownRight size={17}/>}/>
    <Kpi title="Gasto pago na oficina" value={real(d.caixa.oficina)} sub="Saída efetiva, não orçamento" icon={<ArrowUpRight size={17}/>}/>
    <Kpi title="Saldo operacional" value={real(d.caixa.saldo_operacional)} sub="Recebido menos oficina paga" icon={<Wallet size={17}/>}/>
   </div>
   <section className="grid gap-3 md:grid-cols-3">
    <div className="rounded-2xl border border-border bg-card p-4"><span className="text-xs text-muted-foreground">Outras despesas pagas</span><p className="mt-2 text-2xl font-bold">{real(d.caixa.outras_saidas)}</p><p className="mt-1 text-xs text-muted-foreground">Inclui contas gerais e mensalidade Aurox quitada</p></div>
    <div className="rounded-2xl border border-border bg-card p-4"><span className="text-xs text-muted-foreground">Saldo total de caixa</span><p className="mt-2 text-2xl font-bold">{real(d.caixa.saldo_caixa)}</p><p className="mt-1 text-xs text-muted-foreground">Todas as entradas pagas menos todas as saídas</p></div>
    <div className="rounded-2xl border border-border bg-card p-4"><span className="text-xs text-muted-foreground">Movimentos confirmados</span><p className="mt-2 text-2xl font-bold">{d.caixa.lancamentos_confirmados}</p><p className="mt-1 text-xs text-muted-foreground">Quantidade de pagamentos e recebimentos efetivamente baixados</p></div>
   </section>
   <div className="flex gap-1 overflow-x-auto rounded-2xl border bg-card p-1.5">
    {([['visao','Visão geral'],['agenda','Contas e boletos'],['vendas','Vendas recebidas']] as const).map(([key,name])=><button key={key} className={`min-w-max rounded-xl px-4 py-2.5 text-sm font-medium ${aba===key?'bg-primary text-primary-foreground':'text-muted-foreground hover:bg-muted'}`} onClick={()=>setAba(key)}>{name}</button>)}
   </div>
   {aba==='visao'&&<div className="grid gap-4 lg:grid-cols-2">
    <Bloco title="Próximos vencimentos" sub={`${próximas.length} contas pendentes nos próximos 12 meses`}>
     {próximas.slice(0,8).map(p=><ParcelRow key={p.id} p={p} admin={superadmin} onAction={baixar}/>)}
     {!próximas.length&&<Empty>Sem contas futuras pendentes.</Empty>}
    </Bloco>
    <Bloco title="Atrasadas" sub={`${vencidas.length} contas aguardam baixa`}>
     {vencidas.slice(0,8).map(p=><ParcelRow key={p.id} p={p} admin={superadmin} onAction={baixar}/>)}
     {!vencidas.length&&<Empty>Sem contas vencidas.</Empty>}
    </Bloco>
    <div className="lg:col-span-2"><Bloco title="Mensalidade Aurox" sub="Gerada a cada mês a partir do início do contrato. Não pode ser removida ou alterada pelo cliente.">
     {aAurox?<div className="grid gap-3 md:grid-cols-3">
      <div><p className="text-xs text-muted-foreground">Início do contrato</p><strong>{showDate(aAurox.inicio)}</strong></div>
      <div><p className="text-xs text-muted-foreground">Mensalidade</p><strong>{real(aAurox.valor)}</strong></div>
      <div><p className="text-xs text-muted-foreground">Próximo vencimento</p><strong>{showDate(próximas.find(p=>p.origem==='aurox')?.vencimento||'')}</strong></div>
     </div>:<p className="text-sm text-muted-foreground">Contrato ainda não carregado.</p>}
     {superadmin&&aAurox?.valor==null&&<div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border p-3">
      <label className="text-xs">Definir valor contratual (uma única vez)<input type="number" min="0.01" step="0.01" value={preco} className={`${input} mt-1 w-40`} onChange={e=>setPreco(e.target.value)}/></label>
      <label className="text-xs">Loja<select className={`${input} mt-1`} value={lojaCobranca} onChange={e=>setLojaCobranca(e.target.value)}>{lojas.map(l=><option value={l.codigo} key={l.codigo}>{l.nome}</option>)}</select></label>
      <button disabled={!preco||!lojaCobranca} className={primary} onClick={()=>void configurarAurox()}>Registrar contrato</button></div>}
    </Bloco></div>
    <div className="lg:col-span-2"><Bloco title="Últimos movimentos do caixa" sub="Pagamentos e recebimentos registrados, inclusive ajustes manuais antigos. Cada valor pode ser rastreado pela origem.">
     {(d.movimentos||[]).slice(0,30).map(m=><div key={m.id} className="flex flex-wrap items-center gap-3 border-b py-2.5 last:border-0">
      <div className="min-w-48 flex-1"><p className="text-sm font-semibold">{m.descricao||m.categoria}</p>
       <p className="text-xs text-muted-foreground">{m.tipo==='entrada'?'Recebimento':'Pagamento'} · {m.categoria} · {m.loja} · {showDate(m.data_movimento)}</p></div>
      <strong className="text-sm">{real(m.valor)}</strong><span className={`text-xs ${m.status==='confirmado'?'text-emerald-500':'text-muted-foreground'}`}>{m.status}</span>
      {(!m.origem_tipo||['faturamento_entrada','faturamento_financiamento'].includes(m.origem_tipo))&&<div className="flex gap-1">
       <button className={btn} onClick={()=>void editarMovimento(m)}><PenLine size={14}/></button>
       {m.status!=='cancelado'&&<button className={btn} onClick={()=>void excluirMovimento(m)}><Trash2 size={14}/></button>}</div>}
      {m.origem_tipo==='oficina'&&<span className="text-xs text-muted-foreground">Editar na Oficina</span>}
      {m.origem_tipo==='financas_parcela'&&<span className="text-xs text-muted-foreground">Editar em Parcelas</span>}
     </div>)}
     {!d.movimentos?.length&&<Empty>Sem movimentos de caixa registrados.</Empty>}
    </Bloco></div>
   </div>}
   {aba==='agenda'&&<section className="space-y-4">
    {criando&&<form onSubmit={salvar} className="rounded-2xl border border-primary/30 bg-card p-4 md:p-6">
     <h2 className="mb-4 text-lg font-semibold">{editando?'Editar compromisso':'Novo compromisso financeiro'}</h2>
     <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field name="Fluxo"><select className={input} value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))}><option value="saida">Conta a pagar</option><option value="entrada">Recebimento</option></select></Field>
      <Field name="Categoria"><input required className={input} maxLength={80} value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))}/></Field>
      <Field name="Descrição"><input required className={input} maxLength={500} value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} placeholder="Ex.: aluguel, boleto do cliente..."/></Field>
      <Field name="Valor da parcela (R$)"><input required type="number" min="0.01" step="0.01" className={input} value={form.valor} onChange={e=>setForm(f=>({...f,valor:e.target.value}))}/></Field>
      <Field name="Vencimento inicial"><input required type="date" className={input} value={form.inicio} onChange={e=>setForm(f=>({...f,inicio:e.target.value}))}/></Field>
      <Field name="Forma de pagamento"><select className={input} value={form.forma} onChange={e=>setForm(f=>({...f,forma:e.target.value}))}><option value="boleto">Boleto</option><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option><option value="transferencia">Transferência</option><option value="outro">Outro</option></select></Field>
      <Field name="Loja"><select required className={input} value={form.loja} onChange={e=>setForm(f=>({...f,loja:e.target.value}))}><option value="">Selecione</option>{lojas.map(l=><option key={l.codigo} value={l.codigo}>{l.nome||l.codigo}</option>)}</select></Field>
      <Field name="Repetição"><select className={input} value={form.frequencia} onChange={e=>setForm(f=>({...f,frequencia:e.target.value as 'unica'|'mensal',repeticoes:''}))}><option value="unica">Uma vez</option><option value="mensal">Todo mês</option></select></Field>
      {form.frequencia==='mensal'&&<Field name="Quantas vezes? (vazio: até cancelar)"><input className={input} min="1" max="240" type="number" placeholder="Até remover" value={form.repeticoes} onChange={e=>setForm(f=>({...f,repeticoes:e.target.value}))}/></Field>}
      {form.tipo==='entrada'&&form.forma==='boleto'&&<Field name="Cliente com boleto cadastrado"><select required className={input} value={form.lead_id} onChange={e=>setForm(f=>({...f,lead_id:e.target.value}))}><option value="">Selecione cliente</option>{d.clientes_boleto.map(l=><option value={l.id} key={l.id}>{l.nome} · {l.faturamento_id?`Faturamento #${l.faturamento_id}`:'Ficha de crédito'}</option>)}</select></Field>}
     </div>
     <p className="mt-4 text-xs text-muted-foreground">Agendar não significa pagar. Só após clicar em “Dar baixa” o valor entra no caixa. O boleto é registrado como vencimento, não é emitido automaticamente pelo banco.</p>
     <div className="mt-4 flex justify-end gap-2"><button type="button" className={btn} onClick={()=>{setCriando(false);setEditando(null)}}>Cancelar</button><button disabled={enviando} className={primary} type="submit">{enviando?'Salvando…':editando?'Salvar alterações':'Criar compromisso'}</button></div>
    </form>}
    <Bloco title="Compromissos da empresa" sub={`${d.agenda.length} agendamentos ativos · ${parcelCount} parcelas carregadas`}>
     {d.agenda.map(a=><div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-border/70 py-3 last:border-0">
       <div className="min-w-[220px] flex-1"><div className="flex items-center gap-2"><strong className="text-sm">{a.descricao}</strong>{a.origem==='aurox'&&<Shield size={15} className="text-primary"/>}</div>
        <p className="mt-1 text-xs text-muted-foreground">{a.tipo==='entrada'?'A receber':'A pagar'} · {a.forma} · {a.frequencia==='mensal'?'Mensal':'Único'} · {a.cliente||a.loja}</p></div>
       <span className="text-sm font-semibold">{real(a.valor)}</span>
       {a.origem==='manual'&&<div className="flex gap-1"><button title="Editar" className={btn} onClick={()=>editar(a)}><PenLine size={15}/></button><button title="Cancelar próximas parcelas" className={btn} onClick={()=>void remover(a)}><Trash2 size={15}/></button></div>}
      </div>)}
     {!d.agenda.length&&<Empty>Sem compromissos cadastrados.</Empty>}
    </Bloco>
    <Bloco title="Parcelas e vencimentos" sub="Confirme os pagamentos conforme ocorrerem; reabra se precisar corrigir.">
     {parcelas.map(p=><ParcelRow key={p.id} p={p} admin={superadmin} onAction={baixar}/>)}
     {!parcelas.length&&<Empty>Sem parcelas disponíveis.</Empty>}
    </Bloco>
   </section>}
   {aba==='vendas'&&<section className="space-y-4"><Bloco title="Reconciliação de vendas" sub="Somente faturamentos vinculados a leads vendidos, um documento por lead. Valores registrados não comprovam recebimento.">
    {d.vendas.map(v=>{
     const ec=vendaMap.get(`faturamento_entrada:lead:${v.lead_id}`);
     const fc=vendaMap.get(`faturamento_financiamento:lead:${v.lead_id}`);
     return <div key={v.lead_id} className="flex flex-wrap gap-4 border-b py-4 last:border-0">
       <div className="min-w-48 flex-1"><strong className="text-sm">{v.cliente}</strong><p className="text-xs text-muted-foreground">{v.placa} · Venda #{v.lead_id} · Faturamento #{v.faturamento_id}</p>
       <p className="mt-1 text-sm font-semibold">Bruto: {real(v.bruto_documentado)}</p></div>
       <div className="min-w-48 flex-1"><p className="text-xs text-muted-foreground">Entrada documentada: {real(v.entrada)}</p>
        <p className="mt-1 text-xs">{ec?<span className="text-emerald-500">Recebida: {real(ec.valor)}</span>:<span className="text-amber-500">Sem baixa</span>}</p>
        <button className={`${btn} mt-1`} onClick={()=>void receberVenda(v,'entrada')}>{ec?'Corrigir entrada':'Confirmar entrada'}</button></div>
       <div className="min-w-48 flex-1"><p className="text-xs text-muted-foreground">Financiamento documentado: {real(v.financiamento)}</p>
        <p className="mt-1 text-xs">{fc?<span className="text-emerald-500">Recebido: {real(fc.valor)}</span>:<span className="text-amber-500">Sem baixa</span>}</p>
        <button disabled={!v.financiamento} className={`${btn} mt-1`} onClick={()=>void receberVenda(v,'financiamento')}>{fc?'Corrigir financiamento':'Confirmar financiamento'}</button></div>
      </div>})}
    {!d.vendas.length&&<Empty>Não foram encontrados faturamentos ligados às vendas do CRM. Confira os vínculos lead/ficha e o diagnóstico SQL.</Empty>}
   </Bloco>
   <Bloco title="Valores confirmados" sub="Somente estes recebimentos geram movimento de entrada no caixa.">
    {(d.movimentos_recebidos||[]).map((m,i)=><div key={m.id||i} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"><span>{m.origem_tipo==='faturamento_entrada'?'Entrada':'Financiamento'} · {m.origem_id} · {showDate(m.data_movimento)}</span><strong>{real(Number(m.valor))}</strong><div className="flex gap-1"><button className={btn} onClick={()=>void editarMovimento(m)}><PenLine size={14}/>Editar</button><button className={btn} onClick={()=>void excluirMovimento(m)}><Trash2 size={14}/>Estornar</button></div></div>)}
    {!d.movimentos_recebidos?.length&&<Empty>Nenhum recebimento de venda confirmado.</Empty>}
   </Bloco></section>}
  </>}
 </main>;
}
function Field({name,children}:{name:string;children:ReactNode}){return <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>{name}</span>{children}</label>}
function Kpi({title,value,sub,icon}:{title:string;value:string;sub:string;icon:ReactNode}){return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex justify-between text-xs text-muted-foreground"><span>{title}</span>{icon}</div><p className="mt-3 text-2xl font-bold tracking-tight tabular-nums">{value}</p><p className="mt-2 text-[11px] text-muted-foreground">{sub}</p></div>}
function Bloco({title,sub,children}:{title:string;sub:string;children:ReactNode}){return <section className="rounded-2xl border border-border bg-card p-4 sm:p-5"><header className="mb-3"><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{sub}</p></header>{children}</section>}
function Empty({children}:{children:ReactNode}){return <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{children}</p>}
function ParcelRow({p,admin,onAction}:{p:Parcela;admin:boolean;onAction:(p:Parcela,acao:'baixar'|'reabrir'|'cancelar')=>Promise<void>}){
 const bloqueado=p.origem==='aurox'&&!admin;
 return <div className="flex flex-wrap items-center gap-3 border-b border-border/70 py-3 last:border-0">
  <div className="min-w-40 flex-1"><p className="flex items-center gap-2 text-sm font-semibold">{p.origem==='aurox'&&<Shield size={14} className="text-primary"/>}{p.descricao}</p>
   <p className="mt-1 text-xs text-muted-foreground">{p.tipo==='entrada'?'A receber':'A pagar'} · {p.cliente||p.loja} · Parcela {p.numero}</p></div>
  <span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock size={14}/>{showDate(p.vencimento)}</span>
  <strong className="min-w-24 text-right text-sm">{real(p.valor)}</strong>
  <span className={`text-xs ${p.status==='pago'?'text-emerald-500':p.status==='cancelado'?'text-muted-foreground':'text-amber-500'}`}>{p.status==='pago'?'Pago':p.status==='cancelado'?'Cancelado':'Pendente'}</span>
  {!bloqueado&&(p.status==='pendente'?<button className={btn} onClick={()=>void onAction(p,'baixar')}><Check size={14}/>Dar baixa</button>
   :p.origem==='manual'?<><button className={btn} onClick={()=>void onAction(p,'baixar')}>Corrigir baixa</button><button className={btn} onClick={()=>void onAction(p,'reabrir')}>Reabrir</button></>:null)}
 </div>;
}
