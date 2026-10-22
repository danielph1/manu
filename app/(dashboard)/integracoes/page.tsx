'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Link2, Plus, RefreshCcw, Copy, ShieldCheck, Zap, AlertTriangle } from 'lucide-react';

interface Empresa { id: number; nome: string }
interface Integracao {
  id: string; empresa_id: number; empresa_nome: string; nome: string;
  plataforma: string; ativo: boolean; mapeamento: Record<string,string>;
  criado_em: string; ultimo_evento_em: string | null; eventos: number;
}
interface Evento {
  id:string; recebido_em:string; status:string; nome:string; telefone:string;
  email:string; interesse:string; triagem_id:number|null; erro:string|null;
}
const fields = [
  ['nome','Nome'], ['telefone','Telefone'], ['email','E-mail'],
  ['interesse','Veículo / interesse'], ['mensagem','Mensagem'], ['id_externo','Identificador externo'],
] as const;
const defaults: Record<string, Record<string,string>> = {
  olx: {nome:'name',telefone:'phone',email:'email',interesse:'adsInfo.subject',mensagem:'message',id_externo:'externalId'},
  napista: {nome:'nome',telefone:'telefone',email:'email',interesse:'veiculo',mensagem:'mensagem',id_externo:'id'},
};

export default function IntegracoesPage() {
  const {user,isLoading} = useAuth();
  const tipo = String(user?.tipo || '').toLowerCase();
  const autorizado = ['admin','marketing','superadmin'].includes(tipo);
  const [lista,setLista] = useState<Integracao[]>([]);
  const [empresas,setEmpresas] = useState<Empresa[]>([]);
  const [empresa,setEmpresa] = useState('');
  const [nome,setNome] = useState('OLX');
  const [plataforma,setPlataforma] = useState('olx');
  const [novoCodigo,setNovoCodigo] = useState('');
  const [mapeamento,setMapeamento] = useState<Record<string,string>>(defaults.olx);
  const [webhook,setWebhook] = useState('');
  const [selecionado,setSelecionado] = useState('');
  const [eventos,setEventos] = useState<Evento[]>([]);
  const [editando,setEditando] = useState('');
  const [mapaEditado,setMapaEditado] = useState<Record<string,string>>({});
  const [salvando,setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const [a,b] = await Promise.all([api.get('/integracoes'),api.get('/integracoes/empresas')]);
    setLista(Array.isArray(a.data) ? a.data : []);
    setEmpresas(Array.isArray(b.data) ? b.data : []);
    setEmpresa((current) => current || String(b.data?.[0]?.id ?? ''));
  },[]);
  const carregarEventos = useCallback(async (id:string) => {
    if (!id) return;
    const r=await api.get(`/integracoes/${id}/eventos`);
    setEventos(Array.isArray(r.data) ? r.data : []);
  },[]);
  useEffect(() => {
    if (!autorizado || isLoading) return;
    carregar().catch(() => toast.error('Erro ao carregar integrações. A migração foi executada?'));
    const timer=window.setInterval(() => {
      carregar().catch(() => {});
      if (selecionado) carregarEventos(selecionado).catch(() => {});
    },10000);
    return () => window.clearInterval(timer);
  },[autorizado,isLoading,carregar,carregarEventos,selecionado]);

  if (isLoading) return <div className="p-8">Carregando...</div>;
  if (!autorizado) return <div className="mx-auto max-w-3xl rounded-xl border p-6">Apenas admin, marketing ou superadmin podem abrir esta página.</div>;

  function escolherPlataforma(valor:string) {
    setPlataforma(valor);
    setMapeamento(defaults[valor] || {nome:'name',telefone:'phone',email:'email',interesse:'vehicle',mensagem:'message',id_externo:'id'});
    setNome(valor === 'olx' ? 'OLX' : valor === 'napista' ? 'NaPista' : 'Nova plataforma');
  }
  async function criar(e:FormEvent) {
    e.preventDefault();
    const codigo=(plataforma==='nova' ? novoCodigo : plataforma).trim().toLowerCase();
    setSalvando(true);
    try {
      const r=await api.post('/integracoes',{empresa_id:Number(empresa),nome,plataforma:codigo,mapeamento});
      setWebhook(r.data.webhook_url);
      toast.success('Integração criada. Copie agora a URL gerada.');
      await carregar();
    } catch(err:any) {toast.error(err.response?.data?.error || 'Erro ao criar');}
    finally {setSalvando(false);}
  }
  async function alternar(i:Integracao) {
    try { await api.patch(`/integracoes/${i.id}`,{ativo:!i.ativo});await carregar();toast.success('Situação atualizada');}
    catch(err:any) {toast.error(err.response?.data?.error || 'Erro ao atualizar');}
  }
  async function salvarMapeamento(i:Integracao) {
    setSalvando(true);
    try {
      await api.patch(`/integracoes/${i.id}`,{mapeamento:mapaEditado});
      setEditando('');
      toast.success('Mapeamento salvo');
      await carregar();
    } catch(err:any) {toast.error(err.response?.data?.error || 'Erro ao salvar mapeamento');}
    finally {setSalvando(false);}
  }
  async function rotacionar(i:Integracao) {
    if (!window.confirm(`Trocar o segredo de ${i.nome}? A URL anterior deixará de funcionar até você atualizar o portal.`)) return;
    try {
      const r=await api.post(`/integracoes/${i.id}/rotacionar`);
      setWebhook(r.data.webhook_url);
      toast.success('Novo endereço gerado. Atualize no portal de anúncios.');
    } catch(err:any) {toast.error(err.response?.data?.error || 'Erro ao trocar segredo');}
  }
  async function copiar() {
    try {await navigator.clipboard.writeText(webhook);toast.success('URL copiada');}
    catch {toast.error('Copie manualmente a URL');}
  }
  return <div className="mx-auto max-w-6xl space-y-7 pb-28">
    <div className="flex items-center gap-3">
      <div className="rounded-xl bg-primary/10 p-3"><Link2 className="h-6 w-6 text-primary"/></div>
      <div><h1 className="text-2xl font-bold">Central de Integrações</h1>
        <p className="text-sm text-muted-foreground">OLX, NaPista e novas plataformas por webhooks JSON.</p></div>
    </div>
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4"/> Atenção</div>
      Configure a migração SQL e publique a Edge Function no Supabase antes de criar conexões. NaPista depende de confirmação de integração direta junto ao fornecedor. A URL contém uma chave secreta: não divulgue.
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={criar} className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 font-semibold"><Plus className="h-5 w-5"/> Adicionar plataforma</div>
        <label className="block space-y-1 text-sm">Empresa
          <select required value={empresa} onChange={e=>setEmpresa(e.target.value)} className="w-full rounded-md border bg-background p-2">
            {empresas.map(e=><option value={e.id} key={e.id}>{e.nome}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm">Canal
          <select value={plataforma} onChange={e=>escolherPlataforma(e.target.value)} className="w-full rounded-md border bg-background p-2">
            <option value="olx">OLX</option><option value="napista">NaPista</option>
            <option value="nova">+ Plataforma personalizada</option>
          </select>
        </label>
        {plataforma==='nova' && <label className="block space-y-1 text-sm">Identificador técnico (letras minúsculas, números e hífen)
          <input required placeholder="mobiauto" value={novoCodigo} onChange={e=>setNovoCodigo(e.target.value)} className="w-full rounded-md border bg-background p-2"/>
        </label>}
        <label className="block space-y-1 text-sm">Nome da conexão (por anunciante ou loja)
          <input required minLength={2} maxLength={100} value={nome} onChange={e=>setNome(e.target.value)} className="w-full rounded-md border bg-background p-2"/>
        </label>
        <div className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-semibold">Mapeamento JSON</p>
          <p className="text-xs text-muted-foreground">Caminhos dos dados no JSON de entrada. Exemplo: lead.customer.name. Não insira códigos JS.</p>
          {fields.map(([key,label])=><label key={key} className="grid grid-cols-2 items-center gap-2 text-xs">
            <span>{label}</span>
            <input placeholder={key} value={mapeamento[key]||''} onChange={e=>setMapeamento(m=>{
              const next={...m};if(e.target.value.trim())next[key]=e.target.value.trim();else delete next[key];return next;
            })} className="min-w-0 rounded-md border bg-background p-2"/>
          </label>)}
        </div>
        <button disabled={salvando || !empresa} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Zap className="h-4 w-4"/>{salvando?'Criando...':'Criar conexão e gerar URL'}
        </button>
      </form>
      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Conexões existentes</h2>
        {lista.length===0&&<p className="text-sm text-muted-foreground">Nenhuma conexão cadastrada.</p>}
        {lista.map(i=><div key={i.id} className="space-y-3 rounded-xl border p-3 text-sm">
          <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{i.nome}</div>
            <div className="text-xs text-muted-foreground">{i.plataforma.toUpperCase()} · {i.empresa_nome} · {i.eventos} eventos</div></div>
            <span className={`rounded-full px-2 py-1 text-xs ${i.ativo?'bg-emerald-500/10 text-emerald-600':'bg-muted text-muted-foreground'}`}>
              {i.ativo?'Ativa':'Pausada'}</span>
          </div>
          <div className="text-xs text-muted-foreground">Último webhook: {i.ultimo_evento_em?new Date(i.ultimo_evento_em).toLocaleString('pt-BR'):'nunca'}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={()=>alternar(i)} className="rounded-md border px-3 py-2 text-xs">{i.ativo?'Pausar':'Ativar'}</button>
            <button type="button" onClick={()=>rotacionar(i)} className="flex items-center gap-1 rounded-md border px-3 py-2 text-xs"><RefreshCcw className="h-3 w-3"/>Nova URL</button>
            <button type="button" onClick={()=>{setEditando(editando===i.id?'':i.id);setMapaEditado(i.mapeamento||{});}} className="rounded-md border px-3 py-2 text-xs">Editar campos</button>
            <button type="button" onClick={()=>{setSelecionado(i.id);carregarEventos(i.id).catch(()=>toast.error('Erro ao carregar eventos'));}} className="rounded-md border px-3 py-2 text-xs">Ver eventos</button>
          </div>
          {editando===i.id&&<div className="space-y-2 rounded-lg bg-muted/40 p-3">
            <p className="text-xs font-semibold">Campos desta conexão</p>
            {fields.map(([key,label])=><label key={key} className="grid grid-cols-2 items-center gap-2 text-xs">
              <span>{label}</span><input value={mapaEditado[key]||''} onChange={e=>setMapaEditado(m=>{
                const copy={...m};if(e.target.value.trim())copy[key]=e.target.value.trim();else delete copy[key];return copy;
              })} className="min-w-0 rounded-md border bg-background p-2"/>
            </label>)}
            <button type="button" disabled={salvando} onClick={()=>salvarMapeamento(i)} className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground">Salvar mapeamento</button>
          </div>}
        </div>)}
      </section>
    </div>
    {webhook&&<div className="space-y-2 rounded-xl border-2 border-primary/40 p-4">
      <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5"/> URL secreta gerada</div>
      <p className="text-sm">Copie agora. Ela não será exibida novamente após atualizar a página. Gerar uma nova URL invalida a anterior.</p>
      <div className="break-all rounded-lg bg-muted p-3 font-mono text-xs select-all">{webhook}</div>
      <button onClick={copiar} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Copy className="h-4 w-4"/>Copiar URL</button>
    </div>}
    {selecionado&&<section className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Últimos eventos</h2><button onClick={()=>carregarEventos(selecionado)} className="text-sm underline">Atualizar</button></div>
      {eventos.length===0?<p className="text-sm text-muted-foreground">Nenhum lead recebido nesta conexão.</p>:<div className="space-y-2">
        {eventos.map(ev=><div key={ev.id} className="rounded-lg border p-3 text-sm">
          <div className="flex justify-between gap-2"><strong>{ev.nome||'Contato'}</strong><span className="text-xs text-muted-foreground">{new Date(ev.recebido_em).toLocaleString('pt-BR')}</span></div>
          <div className="text-muted-foreground">{ev.telefone||ev.email||'Sem contato'} · {ev.interesse||'Sem interesse'}</div>
          <div className="text-xs">{ev.status} · Triagem #{ev.triagem_id??'pendente'}</div>
        </div>)}
      </div>}
    </section>}
  </div>;
}
