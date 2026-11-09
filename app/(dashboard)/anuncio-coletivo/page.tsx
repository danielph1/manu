'use client';
import {useEffect,useMemo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {createClient} from '@supabase/supabase-js';
import {toast} from 'sonner';
import {Megaphone,Users,Image as ImageIcon,Video,Send,PauseCircle,RefreshCw,ShieldCheck,CalendarDays,Info,UploadCloud} from 'lucide-react';
import {api} from '@/lib/api';
import {useAuth} from '@/contexts/auth-context';

type ContatoConsentimento={id:number;nome_lead:string;produto_interesse:string|null;telefone_final:string;finalidades:string[]};
type Campanha={id:number;titulo:string;finalidade:string;estado:string;criado_em:string;total:number;aceitos:number;confirmados_manual:number;pendentes:number;processando:number;incertos:number;falhas:number;cancelados:number;media_mime:string|null;segmento:{segmento?:string;termo?:string}};
type Preview={elegiveis:number;excede_limite:boolean};
const PURPOSES=[['promocoes','Promoções e ofertas'],['novidades','Novidades da empresa'],['retorno_comercial','Retomada comercial'],['pesquisa_satisfacao','Pesquisa de satisfação']];
const SEGMENTS=[['todos','Toda a base autorizada'],['interesse','Interesse no veículo'],['entrada','Possuem entrada (qualquer valor acima de zero)'],['interesse_ou_entrada','Interesse OU entrada'],['interesse_e_entrada','Interesse E entrada']];
const input='mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary';
const button='inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';
export default function AnuncioColetivo(){
 const {user}=useAuth();const qc=useQueryClient();const role=String(user?.tipo||'').toLowerCase();
 const allowed=['marketing','gerente','admin','superadmin'].includes(role),global=role==='superadmin';
 const [empresa,setEmpresa]=useState('');
 const [finalidade,setFinalidade]=useState('promocoes'),[segmento,setSegmento]=useState('todos'),[interesse,setInteresse]=useState('');
 const [titulo,setTitulo]=useState('Feirão de ofertas'),[mensagem,setMensagem]=useState('Olá, {{nome}}! Temos novidades especiais para você. Gostaria de conhecer as oportunidades da nossa loja?');
 const [iniciarEm,setIniciarEm]=useState(''),[arquivo,setArquivo]=useState<File|null>(null),[previewUrl,setPreviewUrl]=useState('');
 const [confirmado,setConfirmado]=useState(false),[busy,setBusy]=useState(false);
 const [modoTeste,setModoTeste]=useState(false),[testeId,setTesteId]=useState('');
 const [buscaContato,setBuscaContato]=useState(''),[contato,setContato]=useState<ContatoConsentimento|null>(null);
 const [finsConsent,setFinsConsent]=useState<string[]>([]),[canalConsent,setCanalConsent]=useState('presencial');
 const [dataConsent,setDataConsent]=useState(''),[notaConsent,setNotaConsent]=useState(''),[declarouConsent,setDeclarouConsent]=useState(false);
 const empresas=useQuery({queryKey:['coletivo-empresas'],enabled:global,queryFn:async()=>((await api.get('/integracoes/empresas')).data||[]) as {id:number;nome:string}[]});
 useEffect(()=>{if(global&&empresas.data?.length)setEmpresa(x=>x||String(empresas.data![0].id));},[global,empresas.data]);
 useEffect(()=>{if(!arquivo){setPreviewUrl('');return;}const url=URL.createObjectURL(arquivo);setPreviewUrl(url);return()=>URL.revokeObjectURL(url);},[arquivo]);
 const ready=allowed&&(!global||!!empresa);const params=global?{empresa_id:empresa}:{};
 const encontrados=useQuery({queryKey:['coletivo-busca',empresa,user?.empresa_id,buscaContato],enabled:ready&&buscaContato.trim().length>=3,
  queryFn:async()=>((await api.get('/anuncio-coletivo/consentimentos',{params:{...params,busca:buscaContato}})).data?.leads||[]) as ContatoConsentimento[],staleTime:15000});
 const needsInterest=segmento.includes('interesse');
 const canPreview=ready&&(!needsInterest||interesse.trim().length>=2);
 const preview=useQuery({queryKey:['coletivo-preview',empresa,user?.empresa_id,finalidade,segmento,interesse],enabled:canPreview,
  queryFn:async()=>((await api.get('/anuncio-coletivo',{params:{...params,modo:'preview',finalidade,segmento,interesse}})).data) as Preview,staleTime:20000});
 const list=useQuery({queryKey:['coletivo-lista',empresa,user?.empresa_id],enabled:ready,
  queryFn:async()=>((await api.get('/anuncio-coletivo',{params})).data?.campanhas||[]) as Campanha[],refetchInterval:30000});
 const limpar=()=>{setConfirmado(false);setArquivo(null);setModoTeste(false);setTesteId('');};
 const onFile=(f:File|null)=>{
  if(!f){setArquivo(null);return;}
  const limites:Record<string,number>={'image/jpeg':4_000_000,'image/png':4_000_000,'video/mp4':8_000_000};
  if(!limites[f.type]||f.size<100||f.size>limites[f.type]){toast.error('Use JPG/PNG até 4 MB ou MP4 até 8 MB. Vídeo em H.264/AAC.');return;}
  setArquivo(f);
 };
 const abrirConsent=(c:ContatoConsentimento)=>{setContato(c);setFinsConsent([...(c.finalidades||[])]);setCanalConsent('presencial');
  const d=new Date();setDataConsent(new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16));
  setNotaConsent('');setDeclarouConsent(false);};
 async function salvarConsent(){
  if(!contato||busy)return;
  if(!window.confirm(`Registrar as finalidades selecionadas e revogar as desmarcadas para ${contato.nome_lead}?`))return;
  setBusy(true);
  try{await api.patch('/anuncio-coletivo/consentimentos',{...params,lead_id:contato.id,finalidades:finsConsent,
     canal:canalConsent,consentido_em:new Date(dataConsent).toISOString(),evidencia:notaConsent,declarou:declarouConsent});
   toast.success('Autorizações atualizadas e auditadas.');setContato(null);
   await Promise.all([qc.invalidateQueries({queryKey:['coletivo-busca']}),qc.invalidateQueries({queryKey:['coletivo-preview']})]);
  }catch(e:any){toast.error(e?.response?.data?.error||e?.message||'Erro ao registrar autorização.');}
  finally{setBusy(false);}
 }
 async function criar(){
  if(!ready||!confirmado||busy)return;
  if(modoTeste&&!testeId){toast.error('Selecione um contato próprio e autorizado para teste na seção de permissões.');return;}
  if(!window.confirm(modoTeste?'Enviar campanha de TESTE somente para o contato escolhido?':`Agendar a campanha para ${preview.data?.elegiveis||0} clientes autorizados desta empresa?`))return;
  setBusy(true);
  try{
   let mediaId:number|undefined;
   if(arquivo){
    const ticket=(await api.post('/anuncio-coletivo/upload-ticket',{...params,mime:arquivo.type,size:arquivo.size})).data as {id:number;path:string;token:string};
    const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if(!base||!key)throw new Error('Variáveis públicas do Supabase ausentes.');
    const sp=createClient(base,key,{auth:{persistSession:false}});
    const uploaded=await sp.storage.from('manu_arquivos').uploadToSignedUrl(ticket.path,ticket.token,arquivo,{contentType:arquivo.type});
    if(uploaded.error)throw new Error('Falha ao salvar mídia: '+uploaded.error.message);
    mediaId=ticket.id;
   }
   const body={...params,finalidade,segmento,interesse,titulo,mensagem,media_id:mediaId,
     teste_id:modoTeste?Number(testeId):undefined,
     iniciar_em:iniciarEm?new Date(iniciarEm).toISOString():undefined,confirmado:true};
   const response=(await api.post('/anuncio-coletivo',body)).data;
   toast.success(modoTeste?'Envio de teste para 1 contato agendado na fila.':`Campanha agendada para ${response.agendados} contatos autorizados. A fila é gradual.`);
   await Promise.all([qc.invalidateQueries({queryKey:['coletivo-lista']}),qc.invalidateQueries({queryKey:['coletivo-preview']})]);
   limpar();
  }catch(e:any){toast.error(e?.response?.data?.error||e?.message||'Não foi possível agendar a campanha.');}
  finally{setBusy(false);}
 }
 async function pausar(c:Campanha){
  if(!window.confirm(`Cancelar os ${c.pendentes} envios pendentes de “${c.titulo}”? Os já aceitos não serão apagados.`))return;
  try{await api.patch('/anuncio-coletivo',{...params,id:c.id,acao:'pausar'});toast.success('Envios pendentes cancelados.');await list.refetch();}
  catch(e:any){toast.error(e?.response?.data?.error||'Não foi possível pausar.');}
 }
 const textoPreview=useMemo(()=>mensagem.replace(/{{\s*nome\s*}}/gi,'Cliente').replace(/{{\s*veiculo\s*}}/gi,'seu veículo').replace(/{{\s*vendedor\s*}}/gi,'equipe').replace(/{{\s*loja\s*}}/gi,'nossa loja'),[mensagem]);
 if(!allowed)return <main className="mx-auto max-w-4xl p-8">Esta área é exclusiva de marketing, gerentes, administradores e superadmin.</main>;
 return <main className="mx-auto max-w-7xl space-y-6 pb-32">
  <header className="flex flex-wrap items-start justify-between gap-3"><div>
   <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><Megaphone size={15}/>Marketing e relacionamento</p>
   <h1 className="mt-2 text-3xl font-semibold">Anúncio coletivo</h1>
   <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Campanhas segmentadas por empresa, com fotos, vídeos e personalização. Envie somente aos clientes que autorizaram a finalidade.</p>
  </div><button className={button} onClick={()=>{void preview.refetch();void list.refetch();}} disabled={!ready}><RefreshCw size={16}/>Atualizar</button></header>
  {global&&<label className="block max-w-sm text-sm font-medium">Empresa<select className={input} value={empresa} onChange={e=>{setEmpresa(e.target.value);limpar();}}><option value="">Selecione a empresa</option>{(empresas.data||[]).map(c=><option value={c.id} key={c.id}>{c.nome}</option>)}</select></label>}
  <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
   <div className="space-y-5">
    <section className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-2"><Users size={18} className="text-primary"/><h2 className="text-lg font-semibold">1. Público-alvo</h2></div>
      <p className="mt-1 text-xs text-muted-foreground">Inclui todas as lojas da mesma empresa. Não mistura empresas nem exige que o lead esteja no Follow Up.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
       <label className="text-sm">Finalidade autorizada<select className={input} value={finalidade} onChange={e=>{setFinalidade(e.target.value);setConfirmado(false);}}>{PURPOSES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
       <label className="text-sm">Segmentação<select className={input} value={segmento} onChange={e=>{setSegmento(e.target.value);setConfirmado(false);}}>{SEGMENTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      {needsInterest&&<label className="mt-4 block text-sm">Veículo de interesse (marca ou modelo)<input className={input} value={interesse} maxLength={80} placeholder="Ex.: Onix, HB20, SUV" onChange={e=>{setInteresse(e.target.value);setConfirmado(false);}}/></label>}
      <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
       <div className="flex items-end justify-between gap-2"><div><p className="text-xs text-muted-foreground">Público elegível (telefone único e consentimento ativo)</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{preview.isLoading?'…':preview.data?.elegiveis??0}</p></div><ShieldCheck size={22} className="text-primary"/></div>
       {preview.data?.excede_limite&&<p className="mt-2 text-xs text-amber-600">Mais de 500 contatos. Refine o segmento; cada campanha aceita no máximo 500 destinos.</p>}
       {preview.isError&&<p className="mt-2 text-xs text-red-500">Não foi possível consultar o público. Confira a migration.</p>}
      </div>
    </section>
    <section className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-2"><ImageIcon size={18} className="text-primary"/><h2 className="text-lg font-semibold">2. Criativo e mensagem</h2></div>
     <label className="mt-4 block text-sm">Nome da campanha<input className={input} maxLength={100} value={titulo} onChange={e=>setTitulo(e.target.value)}/></label>
     <label className="mt-4 block text-sm">Texto personalizado<textarea className={`${input} min-h-32`} maxLength={550} value={mensagem} onChange={e=>setMensagem(e.target.value)}/><span className="text-xs text-muted-foreground">Variáveis: {'{{nome}}'}, {'{{veiculo}}'}, {'{{vendedor}}'}, {'{{loja}}'}</span></label>
     <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 text-sm hover:bg-muted/30"><UploadCloud size={23} className="text-primary"/><span className="flex-1"><strong>Adicionar foto ou vídeo</strong><span className="block text-xs text-muted-foreground">JPG/PNG até 4 MB ou vídeo MP4 até 8 MB; envio como mídia do WhatsApp, não documento</span></span><input type="file" className="sr-only" accept="image/jpeg,image/png,video/mp4" onChange={e=>onFile(e.target.files?.[0]||null)}/></label>
     {arquivo&&<div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2">{arquivo.type.startsWith('video')?<Video size={14}/>:<ImageIcon size={14}/>} {arquivo.name} ({(arquivo.size/1048576).toFixed(1)} MB)</span><button className="text-red-500" onClick={()=>setArquivo(null)}>Remover</button></div>}
    </section>
   </div>
   <div className="space-y-5">
    <section className="rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">3. Prévia da mensagem</h2><p className="mt-1 text-xs text-muted-foreground">Assim aparecerá a legenda junto da imagem/vídeo no WhatsApp.</p>
     <div className="mt-4 overflow-hidden rounded-xl border bg-background">{previewUrl&&arquivo?.type.startsWith('image/')&&<img src={previewUrl} className="max-h-72 w-full object-contain" alt="Prévia da campanha"/>}
      {previewUrl&&arquivo?.type.startsWith('video/')&&<video src={previewUrl} controls className="max-h-72 w-full"/>}
      {!previewUrl&&<div className="flex h-28 items-center justify-center gap-2 text-xs text-muted-foreground"><ImageIcon size={20}/>Sem mídia: envio somente de texto</div>}
      <p className="whitespace-pre-wrap p-4 text-sm">{textoPreview}</p></div>
    </section>
    <section className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-2"><CalendarDays size={18} className="text-primary"/><h2 className="text-lg font-semibold">4. Programação e confirmação</h2></div>
     <label className="mt-4 block text-sm">Início do agendamento (opcional)<input className={input} type="datetime-local" value={iniciarEm} onChange={e=>setIniciarEm(e.target.value)}/><span className="text-xs text-muted-foreground">Deixe vazio para entrar na fila agora.</span></label>
     <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs"><Info size={15} className="mr-2 inline"/>O canal QR permanece limitado a 30 envios por empresa a cada 24h, com intervalo mínimo de 2 minutos. Uma campanha grande pode levar dias; o envio oficial em alta escala exige integração Meta e templates aprovados.</div>
     <label className="mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs"><input type="checkbox" className="mt-0.5" checked={modoTeste}
       onChange={e=>{setModoTeste(e.target.checked);setConfirmado(false);}}/>
       <span><strong>Modo teste — 1 contato.</strong> {testeId?`Lead #${testeId} selecionado para teste.`:'Busque abaixo um contato próprio autorizado e clique “Usar no teste”.'} O teste utiliza a mesma fila, cadência e limites.</span></label>
     <label className="mt-4 flex gap-2 text-xs"><input type="checkbox" checked={confirmado} onChange={e=>setConfirmado(e.target.checked)} className="mt-0.5"/><span>Confirmo que revisei o público, a finalidade, a mídia e a mensagem, e que cada destinatário autorizou essa categoria de comunicação. Respeitarei qualquer pedido de cancelamento.</span></label>
     <button type="button" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={criar} disabled={!ready||busy||!confirmado||!preview.data?.elegiveis||(!modoTeste&&preview.data?.excede_limite)||(modoTeste&&!testeId)||preview.isFetching}>
      <Send size={16}/>{busy?'Preparando campanha…':modoTeste?'Agendar teste (1 contato)':`Agendar ${preview.data?.elegiveis||0} contato(s)`}</button>
    </section>
   </div>
  </section>
  <section className="rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">Gerenciar autorizações de clientes</h2>
   <p className="mt-1 text-xs text-muted-foreground">Para incluir alguém que ainda não está no Follow Up, localize o lead da empresa e registre as finalidades que o cliente realmente autorizou. Não é necessário transferir o lead.</p>
   <label className="mt-4 block max-w-xl text-sm">Buscar lead pelo nome, telefone ou veículo<input className={input} value={buscaContato} onChange={e=>setBuscaContato(e.target.value)} placeholder="Digite ao menos 3 caracteres" maxLength={80}/></label>
   <div className="mt-4 divide-y">{(encontrados.data||[]).map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
    <div><strong>{c.nome_lead}</strong><p className="text-xs text-muted-foreground">Telefone final •••• {c.telefone_final||'não informado'} · {c.produto_interesse||'Sem interesse informado'}</p>
     <p className="mt-1 text-xs text-primary">{c.finalidades?.length?c.finalidades.map(f=>PURPOSES.find(x=>x[0]===f)?.[1]||f).join(', '):'Sem autorização registrada'}</p></div>
    <button className={button} onClick={()=>abrirConsent(c)}><ShieldCheck size={15}/>Gerenciar permissões</button></div>)}
    {encontrados.isLoading&&<p className="py-4 text-xs text-muted-foreground">Consultando contatos…</p>}
    {encontrados.isError&&<p className="py-4 text-xs text-red-500">Falha na consulta de leads.</p>}</div>
  </section>
  {contato&&<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-3" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setContato(null);}}>
   <div role="dialog" aria-modal="true" aria-label="Autorizações de campanha" className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl border bg-card p-5 shadow-2xl">
    <h2 className="text-lg font-semibold">Autorizações — {contato.nome_lead}</h2><p className="text-xs text-muted-foreground">Marque uma, várias ou todas as finalidades realmente autorizadas. Desmarcar uma autorização existente registra sua revogação e cancela envios pendentes dessa finalidade.</p>
    <label className="flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold"><input type="checkbox" checked={finsConsent.length===PURPOSES.length}
      onChange={e=>setFinsConsent(e.target.checked?PURPOSES.map(x=>x[0]):[])}/>Todas as finalidades atuais</label>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{PURPOSES.map(([f,l])=><label key={f} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={finsConsent.includes(f)}
      onChange={e=>setFinsConsent(v=>e.target.checked?[...new Set([...v,f])]:v.filter(x=>x!==f))}/>{l}</label>)}</div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Origem da autorização<select className={input} value={canalConsent} onChange={e=>setCanalConsent(e.target.value)}>
     {['presencial','whatsapp','ligacao','formulario','email','outro'].map(v=><option value={v} key={v}>{v}</option>)}</select></label>
     <label className="text-sm">Data e hora<input className={input} type="datetime-local" value={dataConsent} max={dataConsent} onChange={e=>setDataConsent(e.target.value)}/></label></div>
    <label className="block text-sm">Observação / evidência (opcional)<textarea className={`${input} min-h-20`} maxLength={700} value={notaConsent} onChange={e=>setNotaConsent(e.target.value)} placeholder="Ex.: cliente autorizou verbalmente as ofertas da loja"/></label>
    <label className="flex gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={declarouConsent} onChange={e=>setDeclarouConsent(e.target.checked)}/>
     <span>Declaro sob minha responsabilidade que o cliente autorizou as novas finalidades marcadas. O registro ficará no histórico e não constitui prova independente.</span></label>
    <div className="flex justify-end gap-2"><button className={button} onClick={()=>setContato(null)}>Cancelar</button>
     <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={busy||(!declarouConsent&&finsConsent.some(f=>!contato.finalidades.includes(f)))} onClick={salvarConsent}>Salvar permissões</button></div>
   </div>
  </div>}
  <section className="rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">Campanhas coletivas e resultados</h2><p className="mt-1 text-xs text-muted-foreground">Aceito pelo WhatsApp não significa lido. Resultados incertos não são reenviados automaticamente.</p>
   <div className="mt-4 divide-y">{(list.data||[]).map(c=><article key={c.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><strong>{c.titulo}</strong><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{c.estado==='ativa'&&c.pendentes+c.processando===0?'Concluída':c.estado}</span></div>
     <p className="mt-1 text-xs text-muted-foreground">{new Date(c.criado_em).toLocaleString('pt-BR')} · {c.media_mime?.startsWith('video')?'Vídeo':c.media_mime?.startsWith('image')?'Foto':'Texto'}</p>
     <p className="mt-2 text-xs">{c.total} destinos · <span className="text-emerald-500">{c.aceitos} aceitos</span> · {c.pendentes} pendentes · {c.processando} em envio · {c.incertos} incertos · {c.falhas} falhas</p>
    </div>
    {c.estado==='ativa'&&c.pendentes>0&&<button className={button} onClick={()=>pausar(c)}><PauseCircle size={16}/>Pausar pendentes</button>}
   </article>)}{list.isLoading&&<p className="py-5 text-sm text-muted-foreground">Carregando…</p>}{!list.isLoading&&!list.data?.length&&<p className="py-5 text-sm text-muted-foreground">Ainda não há campanhas coletivas nesta empresa.</p>}</div>
  </section>
 </main>;
}
