'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useAuth} from '@/contexts/auth-context';
import {toast} from 'sonner';
import {ArrowLeft,ArchiveRestore,Ban,BellRing,CheckCircle2,ChevronRight,Clock3,Filter,History,MessageCircle,RefreshCw,Search,Send,ShieldCheck,ShieldX,Users,X} from 'lucide-react';

type Lead={id:number;nome_lead:string;telefone:string|null;produto_interesse:string|null;followup_status:string|null;followup_motivo:string|null;followup_em:string|null;followup_optin:boolean;followup_optin_origem:string|null;followup_optout_em:string|null;followup_consentimento_verificado:boolean;vendedor_id:number;vendedor_nome:string;loja:string|null;status_ficha:string|null};
type Camp={id:number;titulo:string;formato:string;estado:string;total:number;enviados:number;pendentes:number;falhas:number;criado_em:string};
type View='carteira'|'permissoes'|'campanhas'|'historico';
type Consent={canal:string;finalidade:string;data:string;evidencia:string};
const invalidCredit=(l:Lead)=>/^(negad|recus|reprov)/i.test(l.status_ficha||'');
const autorizado=(l:Lead)=>!!l.followup_optin&&!l.followup_optout_em&&!!l.followup_consentimento_verificado;
const localDate=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const input='mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';
const btn='rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50';
function Stat({name,value,detail,onClick,active}:{name:string;value:number;detail:string;onClick:()=>void;active?:boolean}){
 return <button type="button" onClick={onClick} className={`rounded-xl border p-4 text-left transition-colors hover:border-primary/60 ${active?'border-primary bg-primary/10':'bg-card'}`}>
  <p className="text-xs text-muted-foreground">{name}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></button>;
}
export default function FollowUp(){
 const {user}=useAuth(),qc=useQueryClient();const papel=String(user?.tipo||'').toLowerCase();
 const gestor=['gerente','admin','superadmin'].includes(papel),superadmin=papel==='superadmin';
 const acesso=gestor||papel==='vendedor';
 const [empresa,setEmpresa]=useState(''),[aba,setAba]=useState<View>('carteira'),[busca,setBusca]=useState(''),[filtro,setFiltro]=useState('todos');
 const [loja,setLoja]=useState(''),[responsavel,setResponsavel]=useState(''),[selecionados,setSelecionados]=useState<number[]>([]);
 const [consentLead,setConsentLead]=useState<Lead|null>(null),[consent,setConsent]=useState<Consent>({canal:'whatsapp',finalidade:'promocoes',data:localDate(),evidencia:''});
 const [busy,setBusy]=useState(false),[titulo,setTitulo]=useState('Retomada de atendimento'),[mensagem,setMensagem]=useState('Olá, {{nome}}! Posso ajudar você a encontrar o veículo ideal?');
 const [formato,setFormato]=useState<'mensagem'|'lista_texto'|'enquete_texto'>('mensagem'),[opcoes,setOpcoes]=useState('Tenho interesse\nQuero conhecer opções'),[revisado,setRevisado]=useState(false);
 const empresas=useQuery({queryKey:['followup-empresas'],enabled:superadmin,queryFn:async()=>((await api.get('/integracoes/empresas')).data||[]) as {id:number;nome:string}[]});
 useEffect(()=>{if(superadmin&&empresas.data?.length)setEmpresa(e=>e||String(empresas.data![0].id));},[superadmin,empresas.data]);
 const ready=acesso&&(!superadmin||!!empresa),params=superadmin?{empresa_id:empresa}:{};
 const lista=useQuery({queryKey:['followup-leads',empresa,user?.empresa_id],enabled:ready,queryFn:async()=>((await api.get('/follow-up',{params})).data||{leads:[]}) as {leads:Lead[];pode_enviar:boolean},refetchInterval:20000});
 const campanhas=useQuery({queryKey:['followup-campanhas',empresa,user?.empresa_id],enabled:ready&&gestor,queryFn:async()=>((await api.get('/follow-up/campanhas',{params})).data||[]) as Camp[],refetchInterval:30000});
 const leads=lista.data?.leads||[],aptos=leads.filter(autorizado),naoAutorizados=leads.filter(l=>!autorizado(l)),recusados=leads.filter(l=>l.followup_status==='recusado'||invalidCredit(l));
 const lojas=useMemo(()=>[...new Set(leads.map(l=>String(l.loja||'').toUpperCase()).filter(Boolean))].sort(),[leads]);
 const vendedores=useMemo(()=>[...new Map(leads.map(l=>[l.vendedor_id,{id:l.vendedor_id,nome:l.vendedor_nome}])).values()].sort((a,b)=>a.nome.localeCompare(b.nome)),[leads]);
 const filtrados=useMemo(()=>leads.filter(l=>{
  if(busca&&!`${l.nome_lead} ${l.produto_interesse||''} ${l.telefone||''}`.toLowerCase().includes(busca.toLowerCase()))return false;
  if(loja&&String(l.loja||'').toUpperCase()!==loja)return false;
  if(responsavel&&String(l.vendedor_id)!==responsavel)return false;
  if(filtro==='recusados'&&!(l.followup_status==='recusado'||invalidCredit(l)))return false;
  if(filtro==='autorizados'&&!autorizado(l))return false;
  if(filtro==='sem-permissao'&&autorizado(l))return false;
  if(filtro==='outros'&&(l.followup_status==='recusado'||invalidCredit(l)))return false;
  return true;
 }),[leads,busca,loja,responsavel,filtro]);
 const selectedSet=useMemo(()=>new Set(selecionados),[selecionados]);
 useEffect(()=>{setSelecionados([]);setLoja('');setResponsavel('');setFiltro('todos');setRevisado(false);},[empresa]);
 async function acao(l:Lead,operacao:'mover'|'recusar'|'restaurar'|'consentimento',extra:Record<string,unknown>={}){
  setBusy(true);try{
   await api.patch('/follow-up',{lead_id:l.id,acao:operacao,empresa_id:superadmin?Number(empresa):undefined,...extra});
   toast.success(operacao==='consentimento'?'Permissão atualizada no histórico.':'Situação do lead atualizada.');
   await Promise.all([qc.invalidateQueries({queryKey:['followup-leads']}),qc.invalidateQueries({queryKey:['leads']}),qc.invalidateQueries({queryKey:['stats']})]);
  }catch(e:any){toast.error(e?.response?.data?.error||'Não foi possível concluir a ação.');}finally{setBusy(false);}
 }
 async function salvarConsentimento(){
  if(!consentLead||!consent.evidencia.trim()||consent.evidencia.trim().length<15){toast.error('Descreva a evidência verificável (mínimo de 15 caracteres).');return;}
  if(!consent.data||new Date(consent.data).getTime()>Date.now()){toast.error('Informe uma data e hora válidas, que já ocorreram.');return;}
  if(!window.confirm('Confirma que o cliente autorizou expressamente esta finalidade e que a evidência informada é verdadeira?'))return;
  const l=consentLead;await acao(l,'consentimento',{aceito:true,canal:consent.canal,finalidade:consent.finalidade,consentido_em:new Date(consent.data).toISOString(),evidencia:consent.evidencia.trim(),origem:`${consent.canal}: ${consent.evidencia.trim()}`.slice(0,250)});
  setConsentLead(null);setConsent(v=>({...v,evidencia:'',data:localDate()}));
 }
 async function revogar(l:Lead){if(window.confirm('Registrar revogação da permissão de campanha? Envios pendentes para este lead serão cancelados.'))await acao(l,'consentimento',{aceito:false});}
 async function criarCampanha(){
  if(!gestor||!revisado||!selecionados.length){toast.error('Selecione contatos aptos e confirme a revisão.');return;}
  if(!window.confirm(`Agendar a campanha para os ${selecionados.length} contatos escolhidos? O servidor validará cada destinatário novamente.`))return;
  setBusy(true);try{
   const {data}=await api.post('/follow-up/campanhas',{empresa_id:superadmin?Number(empresa):undefined,titulo,formato,mensagem,opcoes:formato==='mensagem'?[]:opcoes.split('\n').map(v=>v.trim()).filter(Boolean),todos:false,ids:selecionados,confirmado:true});
   toast.success(`${Number(data?.agendados||0)} contatos agendados.`);setSelecionados([]);setRevisado(false);await qc.invalidateQueries({queryKey:['followup-campanhas']});
  }catch(e:any){toast.error(e?.response?.data?.error||'Falha ao agendar campanha.');}finally{setBusy(false);}
 }
 async function pausar(c:Camp){if(!window.confirm(`Pausar ${c.titulo} e cancelar envios ainda pendentes?`))return;
  try{await api.patch('/follow-up/campanhas',{id:c.id,acao:'pausar',empresa_id:superadmin?Number(empresa):undefined});await campanhas.refetch();toast.success('Campanha pausada.');}
  catch(e:any){toast.error(e?.response?.data?.error||'Não foi possível pausar.');}}
 const abrirPermissao=(l:Lead)=>{setConsentLead(l);setConsent({canal:'whatsapp',finalidade:'promocoes',data:localDate(),evidencia:''});};
 if(!acesso)return <main className="mx-auto max-w-4xl p-6">Acesso não autorizado.</main>;
 return <main className="mx-auto max-w-7xl space-y-5 pb-36">
  <header className="flex flex-wrap items-start justify-between gap-3"><div>
   <p className="text-xs font-medium uppercase tracking-wide text-primary">Gestão de oportunidades</p>
   <h1 className="mt-1 text-3xl font-semibold">Follow Up</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Leads recusados e oportunidades retiradas do painel. Acompanhe os contatos sem misturar comunicação promocional com atendimento.</p>
  </div><button type="button" className={btn} onClick={()=>lista.refetch()} aria-label="Atualizar leads"><RefreshCw className="h-4 w-4"/></button></header>
  {superadmin&&<div className="max-w-sm"><label className="text-sm font-medium">Empresa selecionada<select className={input} value={empresa} onChange={e=>setEmpresa(e.target.value)}><option value="">Selecione uma empresa</option>{(empresas.data||[]).map(e=><option value={e.id} key={e.id}>{e.nome}</option>)}</select></label></div>}
  <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
   <Stat name="Em acompanhamento" value={leads.length} detail="Todos os leads do Follow Up" active={filtro==='todos'} onClick={()=>{setAba('carteira');setFiltro('todos');}}/>
   <Stat name="Recusados" value={recusados.length} detail="Recusa de crédito ou do vendedor" active={filtro==='recusados'} onClick={()=>{setAba('carteira');setFiltro('recusados');}}/>
   <Stat name="Aptos por autorização" value={aptos.length} detail="Ainda sujeitos à elegibilidade da campanha" active={filtro==='autorizados'} onClick={()=>{setAba('permissoes');setFiltro('autorizados');}}/>
   <Stat name="Sem autorização" value={naoAutorizados.length} detail="Não incluir em campanhas" active={filtro==='sem-permissao'} onClick={()=>{setAba('permissoes');setFiltro('sem-permissao');}}/>
  </section>
  <nav aria-label="Seções do Follow Up" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5">
   {([['carteira','Carteira'],['permissoes','Permissões LGPD'],...(gestor?[['campanhas','Campanhas'],['historico','Histórico de envios']]:[])] as [View,string][]).map(([id,label])=><button type="button" key={id} onClick={()=>setAba(id)} className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm ${aba===id?'bg-primary font-semibold text-primary-foreground':'text-muted-foreground hover:bg-muted'}`}>{label}</button>)}
  </nav>
  {(aba==='carteira'||aba==='permissoes')&&<>
   <section className="rounded-xl border bg-card p-4"><div className="mb-3 flex items-center gap-2"><Filter size={16} className="text-muted-foreground"/><h2 className="text-sm font-semibold">Filtros da carteira</h2></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     <label className="text-xs text-muted-foreground">Buscar por nome, telefone ou veículo<input className={input} value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar lead…"/></label>
     <label className="text-xs text-muted-foreground">Situação<select className={input} value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="todos">Todas</option><option value="recusados">Recusados</option><option value="outros">Retirados do painel</option><option value="autorizados">Com autorização</option><option value="sem-permissao">Sem autorização</option></select></label>
     <label className="text-xs text-muted-foreground">Loja<select className={input} value={loja} onChange={e=>setLoja(e.target.value)}><option value="">Todas as lojas do escopo</option>{lojas.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
     {gestor&&<label className="text-xs text-muted-foreground">Vendedor<select className={input} value={responsavel} onChange={e=>setResponsavel(e.target.value)}><option value="">Todos os responsáveis</option>{vendedores.map(v=><option key={v.id} value={v.id}>{v.nome}</option>)}</select></label>}
    </div>
   </section>
   <section className="overflow-hidden rounded-xl border bg-card"><header className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">{aba==='permissoes'?'Permissões de comunicação':'Leads em acompanhamento'}</h2><p className="text-xs text-muted-foreground">{filtrados.length} registro(s) no filtro atual · Dados somente da empresa autorizada</p></div>{gestor&&aba==='permissoes'&&<span className="text-xs text-muted-foreground">A autorização não equivale à entrega garantida de mensagens.</span>}</header>
    {lista.isLoading&&<p className="p-6 text-sm">Carregando contatos…</p>}{lista.isError&&<p className="p-6 text-sm text-red-500">Falha ao carregar; confirme a conexão e a migration do Follow Up.</p>}
    {!lista.isLoading&&!filtrados.length&&<div className="p-8 text-center text-sm text-muted-foreground">Nenhum lead encontrado com esses filtros.</div>}
    <div className="divide-y">{filtrados.map(l=><article key={l.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0 flex-1">
     <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{l.nome_lead||`Lead #${l.id}`}</strong><span className={`rounded-full px-2 py-0.5 text-[11px] ${invalidCredit(l)||l.followup_status==='recusado'?'bg-amber-500/10 text-amber-600':'bg-muted text-muted-foreground'}`}>{invalidCredit(l)?'Crédito recusado':l.followup_status==='recusado'?'Recusado pelo responsável':'Em acompanhamento'}</span></div>
     <p className="mt-1 text-xs text-muted-foreground">{l.vendedor_nome} · Loja {l.loja||'—'} · {l.produto_interesse||'Veículo não informado'}{l.followup_em?` · ${new Date(l.followup_em).toLocaleDateString('pt-BR')}`:''}</p>
     {l.followup_motivo&&<p className="mt-1 text-xs text-muted-foreground">Motivo: {l.followup_motivo}</p>}
     <p className={`mt-2 flex items-center gap-1 text-xs ${autorizado(l)?'text-emerald-500':'text-muted-foreground'}`}>{autorizado(l)?<ShieldCheck size={13}/>:<ShieldX size={13}/>} {autorizado(l)?'Permissão registrada para campanha':'Sem permissão promocional registrada'}</p>
    </div><div className="flex shrink-0 flex-wrap gap-2"><Link className={btn} href={`/chat?lead=${l.id}`}><MessageCircle className="mr-1 inline h-3.5 w-3.5"/>Conversa</Link>
     {aba==='carteira'&&<><button type="button" disabled={busy} className={btn} onClick={()=>acao(l,'restaurar')}><ArchiveRestore className="mr-1 inline h-3.5 w-3.5"/>Restaurar</button><button type="button" disabled={busy} className={btn} onClick={()=>acao(l,'recusar',{motivo:'Recusado pelo responsável'})}>Recusar</button></>}
     {gestor&&(autorizado(l)?<button type="button" disabled={busy} className={btn} onClick={()=>revogar(l)}>Revogar permissão</button>:<button type="button" className={btn} onClick={()=>abrirPermissao(l)}>Registrar permissão</button>)}
     {gestor&&aba==='permissoes'&&autorizado(l)&&<label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"><input type="checkbox" checked={selectedSet.has(l.id)} onChange={e=>setSelecionados(prev=>e.target.checked?[...new Set([...prev,l.id])]:prev.filter(v=>v!==l.id))}/>Selecionar para campanha</label>}
    </div></article>)}</div>
   </section>
   {gestor&&aba==='permissoes'&&<div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 text-sm"><p className="flex-1">{selecionados.length} contato(s) selecionado(s). Os critérios adicionais serão validados pela API no agendamento.</p><button className={btn} onClick={()=>setSelecionados(aptos.slice(0,100).map(l=>l.id))}>Selecionar aptos (até 100)</button><button className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground" onClick={()=>setAba('campanhas')}>Preparar campanha <ChevronRight className="ml-1 inline h-4 w-4"/></button></div>}
  </>}
  {gestor&&aba==='campanhas'&&<div className="space-y-5"><section className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Criar campanha</h2><p className="mt-1 text-sm text-muted-foreground">Use apenas para comunicação promocional consentida. A fila valida autorização, atividade recente, limites e elegibilidade antes de enviar.</p>
   <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm">Nome da campanha<input className={input} maxLength={100} value={titulo} onChange={e=>setTitulo(e.target.value)}/></label><label className="text-sm">Tipo<select className={input} value={formato} onChange={e=>setFormato(e.target.value as typeof formato)}><option value="mensagem">Mensagem personalizada</option><option value="lista_texto">Lista por texto (não interativa)</option><option value="enquete_texto">Enquete por texto (não interativa)</option></select></label></div>
   <label className="mt-4 block text-sm">Mensagem<textarea className={`${input} min-h-28`} maxLength={550} value={mensagem} onChange={e=>setMensagem(e.target.value)}/><span className="text-xs text-muted-foreground">Campos: {'{{nome}}'}, {'{{veiculo}}'}, {'{{vendedor}}'}, {'{{loja}}'}</span></label>
   {formato!=='mensagem'&&<label className="mt-4 block text-sm">Opções — uma por linha (de 2 a 8)<textarea className={`${input} min-h-24`} value={opcoes} onChange={e=>setOpcoes(e.target.value)}/></label>}
   <div className="mt-4 rounded-lg border bg-muted/30 p-4"><p className="text-xs font-semibold">Prévia para o cliente</p><p className="mt-2 whitespace-pre-wrap text-sm">{mensagem.replace(/{{nome}}/gi,'Cliente').replace(/{{veiculo}}/gi,'veículo').replace(/{{vendedor}}/gi,'vendedor').replace(/{{loja}}/gi,'loja')}{formato!=='mensagem'?'\n\n'+opcoes.split('\n').filter(Boolean).map((v,i)=>`${i+1}. ${v}`).join('\n'):''}</p></div>
   <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><p className="text-sm font-medium">Destinatários: {selecionados.length}</p><p className="text-xs text-muted-foreground">Para selecionar, abra Permissões LGPD. Se nenhum contato estiver selecionado, nada será enviado.</p></div><button className={btn} onClick={()=>setAba('permissoes')}>Selecionar contatos</button></div>
   <label className="mt-4 flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={revisado} onChange={e=>setRevisado(e.target.checked)}/>Confirmo que revisei a mensagem, os destinatários e as evidências de autorização. Entendo que uma fila lenta não elimina o risco de restrições pelo WhatsApp.</label>
   <button disabled={busy||!revisado||!selecionados.length} onClick={criarCampanha} className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"><Send className="mr-2 inline h-4 w-4"/>Agendar {selecionados.length} contato(s)</button>
  </section></div>}
  {gestor&&(aba==='campanhas'||aba==='historico')&&<section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Campanhas e entregas</h2><p className="mt-1 text-xs text-muted-foreground">Estado da fila. “Aceito pelo provedor” não é confirmação de leitura pelo cliente.</p><div className="mt-4 divide-y">{(campanhas.data||[]).map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><strong>{c.titulo}</strong><p className="mt-1 text-xs text-muted-foreground">{c.estado} · {new Date(c.criado_em).toLocaleString('pt-BR')} · {c.enviados} aceitos · {c.pendentes} pendentes · {c.falhas} falhas</p></div>{c.estado==='ativa'&&<button className={btn} onClick={()=>pausar(c)}>Pausar pendentes</button>}</div>)}{!campanhas.data?.length&&<p className="py-4 text-sm text-muted-foreground">Nenhuma campanha nesta empresa.</p>}</div>{aba==='historico'&&<Link href="/historico" className="mt-3 inline-flex items-center gap-2 text-sm text-primary"><History size={15}/>Abrir histórico administrativo</Link>}</section>}
  {consentLead&&<div role="presentation" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-3" onMouseDown={e=>{if(e.target===e.currentTarget)setConsentLead(null);}}><div role="dialog" aria-modal="true" aria-label="Registrar permissão de campanha" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-card p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">Registrar permissão para campanha</h2><p className="mt-1 text-xs text-muted-foreground">Lead: {consentLead.nome_lead} · Empresa selecionada</p></div><button aria-label="Fechar" onClick={()=>setConsentLead(null)}><X size={19}/></button></div>
   <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">Informe <strong>como, quando e para qual finalidade</strong> o cliente autorizou mensagens promocionais. O registro fica salvo no histórico empresarial deste lead e <strong>não envia nenhuma mensagem</strong> automaticamente. Não marque uma autorização sem evidência verificável.</p>
   <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm">Canal da autorização<select className={input} value={consent.canal} onChange={e=>setConsent(v=>({...v,canal:e.target.value}))}><option value="whatsapp">WhatsApp</option><option value="presencial">Presencial</option><option value="ligacao">Ligação</option><option value="formulario">Formulário</option><option value="outro">Outro</option></select></label><label className="text-sm">Data e hora do consentimento<input className={input} type="datetime-local" required value={consent.data} max={localDate()} onChange={e=>setConsent(v=>({...v,data:e.target.value}))}/></label></div>
   <label className="mt-4 block text-sm">Finalidade autorizada<select className={input} value={consent.finalidade} onChange={e=>setConsent(v=>({...v,finalidade:e.target.value}))}><option value="promocoes">Promoções e ofertas de veículos</option><option value="novidades">Novidades e campanhas da loja</option><option value="retorno_comercial">Retomada comercial promocional</option></select></label>
   <label className="mt-4 block text-sm">Evidência verificável<textarea required maxLength={1000} className={`${input} min-h-28`} placeholder="Ex.: O cliente respondeu 'aceito receber ofertas' no chat da loja, em 08/11/2026 às 14:20. Referência da conversa: ..." value={consent.evidencia} onChange={e=>setConsent(v=>({...v,evidencia:e.target.value}))}/></label>
   <p className="mt-3 text-xs text-muted-foreground">Será salvo: canal, data/hora informada, finalidade, evidência e usuário que registrou, vinculados à empresa. Gestores autorizados poderão consultar; a permissão pode ser revogada a qualquer momento. Uma descrição isolada não substitui prova real do consentimento.</p>
   <div className="mt-5 flex justify-end gap-2"><button className={btn} onClick={()=>setConsentLead(null)}>Cancelar</button><button disabled={busy||consent.evidencia.trim().length<15} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={salvarConsentimento}>Salvar permissão</button></div>
  </div></div>}
 </main>;
}
