'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { MessageCircle, QrCode, RefreshCw, Wifi, WifiOff, Power, Settings2, ShieldCheck } from 'lucide-react';

type Status = {
  exists?: boolean;
  enabled?: boolean;
  status: string;
  qr?: string | null;
  number?: string | null;
  worker_online?: boolean;
  greeting_enabled?: boolean;
  greeting?: string;
  last_message?: string | null;
  error?: string | null;
};
const statusText:Record<string,string> = {
  conectado:'Conectado',qr:'Aguardando leitura do QR Code',autenticando:'Autenticando',
  iniciando:'Iniciando WhatsApp Web',desconectado:'Desconectado',erro:'Falha na conexão',worker_offline:'Servidor do WhatsApp indisponível',
};

export function AuroxWhatsappConnect({ empresaId }: { empresaId: string }) {
  const [data,setData]=useState<Status|null>(null);
  const [busy,setBusy]=useState(false);
  const [open,setOpen]=useState(false);
  const [greeting,setGreeting]=useState('');
  const [greetingEnabled,setGreetingEnabled]=useState(false);
  const [configOpen,setConfigOpen]=useState(false);
  const [lastError,setLastError]=useState('');
  const currentCompany=useRef(empresaId);
  currentCompany.current=empresaId;

  const refresh=useCallback(async()=>{
    if(!empresaId) return;
    try {
      const r=await api.get('/integracoes/aurox-whatsapp',{params:{empresa_id:Number(empresaId)}});
      if(currentCompany.current===empresaId){setData(r.data);setLastError('');}
    } catch(e:any) {if(currentCompany.current===empresaId)setLastError(e?.response?.data?.error || 'Falha ao verificar conexão');}
  },[empresaId]);

  useEffect(()=>{
    setData(null);setLastError('');setOpen(false);setConfigOpen(false);
    if(!empresaId)return;
    let active=true;
    const load=async()=>{if(active)await refresh();};
    void load();
    const timer=setInterval(load,5000);
    return ()=>{active=false;clearInterval(timer);};
  },[empresaId,refresh]);
  useEffect(()=>{
    if(data && !configOpen){setGreeting(data.greeting||'');setGreetingEnabled(Boolean(data.greeting_enabled));}
  },[data,configOpen]);

  async function connect() {
    setBusy(true);setOpen(true);
    try {await api.post('/integracoes/aurox-whatsapp',{empresa_id:Number(empresaId)});
      toast.success('Preparando sessão do WhatsApp'); await refresh();}
    catch(e:any){toast.error(e?.response?.data?.error||'Não foi possível iniciar a sessão');}
    finally{setBusy(false);}
  }
  async function disconnect(){
    if(!confirm('Desconectar este WhatsApp? Novas mensagens deixarão de entrar na triagem desta empresa.'))return;
    setBusy(true);
    try {const r=await api.delete('/integracoes/aurox-whatsapp',{params:{empresa_id:Number(empresaId)}});
      toast.success(r.data.warning || 'WhatsApp desconectado'); await refresh();}
    catch(e:any){toast.error(e?.response?.data?.error||'Falha ao desconectar');}
    finally{setBusy(false);}
  }
  async function saveGreeting(){
    setBusy(true);
    try {await api.patch('/integracoes/aurox-whatsapp',{
      empresa_id:Number(empresaId),greeting_enabled:greetingEnabled,greeting,
    });toast.success('Configuração desta empresa salva');setConfigOpen(false);await refresh();}
    catch(e:any){toast.error(e?.response?.data?.error||'Falha ao salvar mensagem');}
    finally{setBusy(false);}
  }
  const ready=data?.status==='conectado';
  return <div className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-card">
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-500"><MessageCircle size={26}/></div>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-lg font-semibold">Aurox-WhatsApp</h3>
        <p className="text-sm text-muted-foreground">Conecte o WhatsApp da concessionária por QR Code. Novas conversas particulares entram na triagem desta empresa.</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={ready?'text-emerald-400':'text-amber-400'}>
            {ready?<Wifi size={12} className="mr-1 inline"/>:<WifiOff size={12} className="mr-1 inline"/>}
            {statusText[data?.status||'desconectado']||'Verificando...'}
          </span>
          {ready&&data?.number&&<span className="text-muted-foreground">+{data.number}</span>}
        </div>
      </div>
      <button type="button" disabled={busy||!empresaId}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        onClick={()=>{setOpen(!open);if(!open)void refresh();}}>
        <QrCode size={16}/>{open?'Recolher':'Gerenciar'}
      </button>
    </div>
    {open&&<div className="space-y-4 border-t px-4 py-4 sm:px-5">
      {!ready&&<div className="flex flex-col items-center gap-3 rounded-xl bg-muted/40 px-4 py-6 text-center">
        {data?.qr && data.status==='qr'
          ? <img alt="QR Code temporário para conectar o WhatsApp desta empresa" width={272} height={272}
              src={data.qr} className="w-full max-w-[272px] rounded-lg bg-white p-2"/>
          : <QrCode className="text-muted-foreground" size={48}/>}
        <p className="text-sm font-medium">{statusText[data?.status||'desconectado']||'Sessão não iniciada'}</p>
        <p className="max-w-sm text-xs text-muted-foreground">Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo, e escaneie este código. O QR precisa ser lido a partir de outra tela.</p>
        {data?.error&&<p className="text-xs text-red-400">{data.error}</p>}
        {lastError&&<p className="text-xs text-red-400">{lastError}</p>}
        <button disabled={busy} onClick={connect} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          {busy?'Iniciando…':data?.status==='worker_offline'?'Tentar reconectar':'Conectar WhatsApp'}
        </button>
      </div>}
      {ready&&<div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-3 text-sm">
        <ShieldCheck size={18} className="shrink-0 text-emerald-400"/><span>Conectado para esta empresa. Grupos e mensagens enviadas por você não geram leads. Mensagens de contatos existentes permanecem na mesma conversa.</span>
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={()=>void refresh()} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><RefreshCw size={14}/> Atualizar</button>
        {data?.exists&&<button onClick={()=>setConfigOpen(!configOpen)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><Settings2 size={14}/> Mensagens automáticas</button>}
        {data?.enabled&&<button disabled={busy} onClick={disconnect} className="inline-flex items-center gap-1 rounded-lg border border-red-600/30 px-3 py-2 text-sm text-red-400"><Power size={14}/> Desconectar</button>}
      </div>
      {configOpen&&<div className="space-y-3 rounded-xl border bg-background/40 p-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={greetingEnabled} onChange={e=>setGreetingEnabled(e.target.checked)}/> Enviar boas-vindas ao primeiro contato recebido</label>
        <label className="block space-y-1 text-xs">Mensagem da empresa
          <textarea value={greeting} maxLength={600} rows={3} onChange={e=>setGreeting(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"/>
        </label>
        <p className="text-xs text-muted-foreground">O envio automático vem desativado. Configure apenas mensagens adequadas para quem iniciou contato com a loja.</p>
        <button disabled={busy} onClick={saveGreeting} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Salvar mensagem</button>
      </div>}
      <p className="text-xs text-muted-foreground">Aurox-WhatsApp usa whatsapp-web.js (não oficial). É necessário manter o serviço de sessões ligado em servidor próprio. Não substitui a API oficial WhatsApp Business.</p>
    </div>}
  </div>;
}
