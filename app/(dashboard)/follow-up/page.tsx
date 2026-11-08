'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';import {useAuth} from '@/contexts/auth-context';import {toast} from 'sonner';
import {ArchiveRestore,CheckSquare,MessageCircle,RefreshCw,Send,ShieldAlert} from 'lucide-react';
type Lead={id:number;nome_lead:string;telefone:string|null;produto_interesse:string|null;followup_status:string|null;
 followup_motivo:string|null;followup_optin:boolean;followup_optin_origem:string|null;followup_optout_em:string|null;vendedor_id:number;vendedor_nome:string;loja:string|null;status_ficha:string|null};
type Camp={id:number;titulo:string;formato:string;estado:string;total:number;enviados:number;pendentes:number;falhas:number;criado_em:string};
export default function FollowUp(){
 const {user}=useAuth(),qc=useQueryClient();const role=String(user?.tipo||'').toLowerCase();const manager=['admin','gerente','superadmin'].includes(role),superAdmin=role==='superadmin';
 const access=manager||role==='vendedor';const [empresa,setEmpresa]=useState(''),[chosen,setChosen]=useState<number[]>([]);
 const [title,setTitle]=useState('Retomada de atendimento'),[text,setText]=useState('Olá, {{nome}}! Posso ajudar você a encontrar o veículo ideal?');
 const [format,setFormat]=useState<'mensagem'|'lista_texto'|'enquete_texto'>('mensagem'),[choices,setChoices]=useState('Tenho interesse\nQuero outras opções');
 const [all,setAll]=useState(false),[confirmado,setConfirmado]=useState(false),[busy,setBusy]=useState(false);
 const empresas=useQuery({queryKey:['followup-empresas'],enabled:superAdmin,
  queryFn:async()=> (await api.get('/integracoes/empresas')).data as {id:number;nome:string}[]});
 useEffect(()=>{if(superAdmin&&Array.isArray(empresas.data)&&empresas.data.length)setEmpresa(v=>v||String(empresas.data![0].id));},[empresas.data,superAdmin]);
 const ready=access&&(!superAdmin||!!empresa),params=superAdmin?{empresa_id:empresa}:{};
 const list=useQuery({queryKey:['followup-leads',empresa,user?.empresa_id],enabled:ready,
  queryFn:async()=> (await api.get('/follow-up',{params})).data as {leads:Lead[];pode_enviar:boolean},refetchInterval:20000});
 const campaigns=useQuery({queryKey:['followup-campanhas',empresa,user?.empresa_id],enabled:ready&&manager,
  queryFn:async()=> (await api.get('/follow-up/campanhas',{params})).data as Camp[],refetchInterval:30000});
 const leads=list.data?.leads||[],eligible=leads.filter(l=>l.followup_optin&&!l.followup_optout_em);
 const chosenSet=useMemo(()=>new Set(chosen),[chosen]);
 useEffect(()=>{setChosen([]);setAll(false);setConfirmado(false);},[empresa]);
 async function update(id:number,acao:'mover'|'recusar'|'restaurar'|'consentimento',extra:Record<string,unknown>={}){
  try{await api.patch('/follow-up',{empresa_id:superAdmin?Number(empresa):undefined,lead_id:id,acao,...extra});
   toast.success('Atualizado');await qc.invalidateQueries({queryKey:['followup-leads']});await qc.invalidateQueries({queryKey:['leads']});await qc.invalidateQueries({queryKey:['stats']});}
  catch(e:any){toast.error(e?.response?.data?.error||'Ação não concluída');}}
 async function optin(l:Lead){
  if(l.followup_optin){if(window.confirm(`Registrar que ${l.nome_lead} pediu para não receber novas mensagens?`))await update(l.id,'consentimento',{aceito:false});return;}
  const fonte=prompt('Informe onde e quando o cliente consentiu em receber mensagens desta empresa no WhatsApp (comprovável):');
  if(fonte&&fonte.trim().length>=8){if(window.confirm('Confirma que possui o consentimento explícito do cliente para receber esta comunicação?'))await update(l.id,'consentimento',{aceito:true,origem:fonte});}
 }
 async function createCampaign(){
  if(busy||!manager)return;
  if(!confirmado||(!all&&!chosen.length)){toast.error('Selecione contatos e confirme a revisão do envio.');return;}
  if(!window.confirm('Confirma o agendamento para os contatos elegíveis, com consentimento comprovado?'))return;
  setBusy(true);try{
   const {data}=await api.post('/follow-up/campanhas',{
    empresa_id:superAdmin?Number(empresa):undefined,titulo:title,formato:format,mensagem:text,
    opcoes:format==='mensagem'?[]:choices.split('\n').map(x=>x.trim()).filter(Boolean),todos:all,ids:chosen,confirmado:true});
   toast.success(`${data.agendados} contato(s) agendado(s) com intervalo e limite de segurança.`);setChosen([]);setAll(false);setConfirmado(false);
   await qc.invalidateQueries({queryKey:['followup-campanhas']});
  }catch(e:any){toast.error(e?.response?.data?.error||'Falha ao agendar');}finally{setBusy(false);}
 }
 async function pause(c:Camp){if(!window.confirm('Pausar campanha e cancelar envios pendentes?'))return;
  try{await api.patch('/follow-up/campanhas',{id:c.id,acao:'pausar',empresa_id:superAdmin?Number(empresa):undefined});toast.success('Campanha pausada');await campaigns.refetch();}
  catch(e:any){toast.error(e?.response?.data?.error||'Falha ao pausar');}}
 if(!access)return <main className="mx-auto max-w-4xl p-6">Acesso restrito a vendedores, gerentes e administradores.</main>;
 return <main className="mx-auto max-w-7xl space-y-6 pb-32">
  <header className="space-y-2"><div className="flex items-start justify-between gap-2"><div>
   <p className="text-xs uppercase tracking-widest text-primary">Gestão de oportunidades</p><h1 className="text-3xl font-semibold">Follow Up</h1>
   <p className="mt-2 text-sm text-muted-foreground">Clientes recusados ou enviados pelas ações do Painel. Envie pelo botão do cartão ou pela seleção múltipla.</p>
  </div><button onClick={()=>list.refetch()} className="rounded-lg border p-2" aria-label="Atualizar"><RefreshCw size={18}/></button></div>
   {superAdmin&&<label className="block max-w-xs text-sm">Empresa<select className="mt-1 w-full rounded-lg border bg-card p-2" value={empresa} onChange={e=>setEmpresa(e.target.value)}>
    <option value="">Selecione</option>{(empresas.data||[]).map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
   </select></label>}
  </header>
  <section className="rounded-2xl border bg-card p-4 sm:p-5 space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Contatos em acompanhamento ({leads.length})</h2>
    {manager&&<span className="text-xs text-muted-foreground">Com consentimento: {eligible.length} · Selecionados: {chosen.length}</span>}</div>
   {list.isLoading&&<p className="text-sm text-muted-foreground">Carregando contatos…</p>}
   {list.error&&<p className="text-sm text-red-500">Não foi possível carregar. Verifique a migration e o acesso à empresa.</p>}
   {!list.isLoading&&!leads.length&&<p className="text-sm text-muted-foreground">Nenhum lead em Follow Up nesta empresa.</p>}
   <div className="space-y-2">{leads.map(l=><div key={l.id} className="flex flex-wrap items-start gap-3 rounded-xl border p-3">
    {manager&&<input type="checkbox" aria-label={`Selecionar ${l.nome_lead}`} checked={chosenSet.has(l.id)} onChange={e=>setChosen(old=>e.target.checked?[...new Set([...old,l.id])]:old.filter(id=>id!==l.id))} className="mt-1 h-4 w-4 accent-violet-500"/>}
    <div className="min-w-[200px] flex-1"><div className="font-medium">{l.nome_lead}</div>
     <p className="text-xs text-muted-foreground">{l.vendedor_nome} · Loja {l.loja||'—'} · {l.produto_interesse||'Sem veículo informado'}</p>
     <p className="mt-1 text-xs text-muted-foreground">{l.followup_status==='recusado'||/^(negad|recus|reprov)/i.test(l.status_ficha||'')?'Crédito recusado / reprovado':'Retirado da fila principal'}{l.followup_motivo?` · ${l.followup_motivo}`:''}</p>
     <p className="mt-1 text-xs">{l.followup_optin&&!l.followup_optout_em?'Autorização para campanha registrada':'Sem autorização para mensagens em campanha (o lead continua no Follow Up)'}</p>
    </div><div className="flex flex-wrap gap-2">
     <Link className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted" href={`/chat?lead=${l.id}`}><MessageCircle size={14} className="mr-1 inline"/>Conversar</Link>
     <button className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted" onClick={()=>update(l.id,'restaurar')}><ArchiveRestore size={14} className="mr-1 inline"/>Restaurar</button>
     <button className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs hover:bg-amber-500/10" onClick={()=>update(l.id,'recusar',{motivo:'Recusado pelo responsável'})}>Marcar recusado</button>
     {manager&&<button title="Consentimento comprovado para campanhas; NÃO é necessário para armazenar o lead no Follow Up" className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted" onClick={()=>optin(l)}>{l.followup_optin?'Revogar autorização':'Registrar autorização para campanha'}</button>}
    </div>
   </div>)}</div>
  </section>
  {manager&&<section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
   <div className="flex gap-2"><ShieldAlert size={20} className="text-amber-500"/><div><h2 className="font-semibold">Comunicação de Follow Up</h2><p className="text-xs text-muted-foreground">“Registrar autorização para campanha” (opt-in) significa que o cliente concordou expressamente em receber contato promocional. É separado de mover um lead para esta aba. Nunca marque sem prova do consentimento.</p>
    <p className="text-xs text-muted-foreground">Somente contatos com consentimento registrado, sem desistência, até 30 agendamentos/24h por empresa, 2 minutos entre disparos e sem repetição para o mesmo lead por 7 dias, apenas com mensagem recebida nas últimas 24 horas. Lista e enquete são apresentadas como texto, não interações nativas.</p></div></div>
   <div className="flex flex-wrap gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={e=>{setAll(e.target.checked);setChosen([])}}/>Selecionar todos os elegíveis (limite 100)</label>
    {!all&&<button onClick={()=>setChosen(eligible.map(x=>x.id).slice(0,100))} className="rounded-lg border px-3 py-1.5 text-sm">Selecionar aptos</button>}</div>
   <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Nome da campanha<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border bg-background p-2"/></label>
    <label className="text-sm">Formato<select value={format} onChange={e=>setFormat(e.target.value as typeof format)} className="mt-1 w-full rounded-lg border bg-background p-2">
      <option value="mensagem">Mensagem rápida personalizada</option><option value="lista_texto">Lista de opções (texto)</option><option value="enquete_texto">Enquete (texto)</option>
    </select></label></div>
   <label className="block text-sm">Mensagem<textarea rows={3} maxLength={550} value={text} onChange={e=>setText(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3"/>
    <span className="text-xs text-muted-foreground">Variáveis: {'{{nome}}'}, {'{{veiculo}}'}, {'{{vendedor}}'}, {'{{loja}}'}.</span></label>
   {format!=='mensagem'&&<label className="block text-sm">Opções (uma por linha, 2–8)<textarea rows={4} value={choices} onChange={e=>setChoices(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3"/></label>}
   <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs font-semibold">Prévia de texto</p><p className="mt-2 whitespace-pre-wrap text-sm">{text.replace(/{{nome}}/gi,'Cliente').replace(/{{veiculo}}/gi,'veículo').replace(/{{vendedor}}/gi,'Vendedor').replace(/{{loja}}/gi,'Loja')}{format!=='mensagem'&&`\n\n${choices.split('\n').filter(Boolean).map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nResponda com o número da opção desejada.`}</p></div>
   <label className="flex gap-2 text-xs"><input type="checkbox" checked={confirmado} onChange={e=>setConfirmado(e.target.checked)}/>Confirmo que revisarei os destinatários, que eles consentiram com comunicações desta empresa e que o conteúdo não é spam.</label>
   <button disabled={busy||!ready||!confirmado||(!all&&!chosen.length)} onClick={createCampaign} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"><Send size={17}/>{busy?'Agendando…':`Agendar ${all?'todos os elegíveis':`${chosen.length} selecionados`}`}</button>
   <p className="text-xs text-muted-foreground">Mensagens dependem do worker online, aprovação do usuário e políticas do WhatsApp. Um intervalo não garante imunidade a restrições.</p>
  </section>}
  {manager&&<section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5"><h2 className="flex items-center gap-2 font-semibold"><CheckSquare size={18}/>Campanhas recentes</h2>
   {(campaigns.data||[]).map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-2 text-sm last:border-none"><div><strong>{c.titulo}</strong><p className="text-xs text-muted-foreground">{c.estado} · {c.enviados} aceitas pelo provedor · {c.pendentes} pendentes · {c.falhas} falhas</p></div>
    {c.estado==='ativa'&&<button onClick={()=>pause(c)} className="rounded-lg border px-3 py-1 text-xs">Pausar</button>}</div>)}
   {!campaigns.data?.length&&<p className="text-xs text-muted-foreground">Nenhuma campanha cadastrada.</p>}
  </section>}
 </main>;
}
