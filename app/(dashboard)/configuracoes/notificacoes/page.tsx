'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Bell, BellOff, Smartphone } from 'lucide-react';
import { desativarInscricaoPush, estaNoInicioIOS, pushDisponivel, registrarInscricaoPush } from '@/lib/push/client';

const LABELS:Record<string,string>={
  leads:'Leads e triagem',estoque:'Estoque',oficina:'Oficina',
  conquistas:'Conquistas',tarefas:'Tarefas',fichas:'Fichas de crédito',
  faturamento:'Faturamento',vendas:'Vendas',chat:'Chat',
};
export default function NotificacoesPrefsPage(){
  const [notif,setNotif]=useState<Record<string,boolean>>({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [estado,setEstado]=useState('Verificando este dispositivo…');
  const [dispositivos,setDispositivos]=useState<number|null>(null);
  const [ativoAqui,setAtivoAqui]=useState(false);
  async function atualizar(){
    if(!pushDisponivel()){setEstado('Indisponível: é necessário HTTPS e navegador compatível.');return;}
    if(!estaNoInicioIOS()){setEstado('iPhone: adicione o Aurox à Tela de Início, abra pelo ícone e ative as notificações.');return;}
    const perm=Notification.permission;
    setEstado(perm==='granted'?'Permissão do navegador concedida':perm==='denied'?'Bloqueado no navegador':'Ainda não ativado');
    try{
      const reg=await navigator.serviceWorker.ready;
      setAtivoAqui(Boolean(await reg.pushManager.getSubscription()));
      const r=await api.get('/push/subscribe');setDispositivos(Number(r.data.total));
    }catch{setDispositivos(null);}
  }
  useEffect(()=>{
    api.get('/preferencias').then(r=>setNotif(r.data?.notif||{})).catch(()=>toast.error('Falha ao carregar preferências'))
      .finally(()=>setLoading(false));
    void atualizar();
  },[]);
  async function toggle(key:string){
    const prev=notif;const next={...prev,[key]:prev[key]===false};setNotif(next);setBusy(true);
    try{await api.patch('/preferencias',{notif:next});toast.success('Preferência salva');}
    catch(e:any){setNotif(prev);toast.error(e?.response?.data?.error||'Falha ao salvar');}
    finally{setBusy(false);}
  }
  async function ativar(){
    setBusy(true);
    try{await registrarInscricaoPush(true);toast.success('Notificações ativadas neste dispositivo.');await atualizar();}
    catch(e:any){toast.error(e?.response?.data?.error||e?.message||'Falha ao ativar notificações');await atualizar();}
    finally{setBusy(false);}
  }
  async function desativar(){
    setBusy(true);
    try{await desativarInscricaoPush();toast.success('Este dispositivo foi removido das notificações.');await atualizar();}
    catch(e:any){toast.error(e?.response?.data?.error||e?.message||'Falha ao desativar');}
    finally{setBusy(false);}
  }
  async function testar(){
    setBusy(true);
    try{
      const r=await api.post('/push/test');
      toast.success(`Teste enviado à fila. Processados: ${r.data?.despacho?.processados??0}.`);
    }catch(e:any){toast.error(e?.response?.data?.error||'Falha no teste');}
    finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-lg space-y-5 pb-24">
    <header><h1 className="flex items-center gap-2 text-2xl font-bold"><Bell className="h-6 w-6"/>Notificações</h1>
      <p className="mt-1 text-sm text-muted-foreground">Escolha os avisos do Aurox e ative-os em cada celular ou computador.</p></header>
    <section className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 font-semibold"><Smartphone className="h-5 w-5 text-primary"/>Notificações fora do site</div>
      <p className="text-sm text-muted-foreground" role="status">{estado}{ativoAqui?' · Inscrição ativa neste dispositivo':''}</p>
      {dispositivos!==null&&<p className="text-xs text-muted-foreground">Dispositivos inscritos para sua conta: {dispositivos}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={ativar} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          <Bell className="mr-1 inline h-4 w-4"/> Ativar neste dispositivo</button>
        <button type="button" disabled={busy||!ativoAqui} onClick={desativar} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
          <BellOff className="mr-1 inline h-4 w-4"/> Desativar</button>
        <button type="button" disabled={busy||!ativoAqui} onClick={testar} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Enviar teste</button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">Android e computadores: pode funcionar sem instalar o PWA, após permitir avisos. iPhone/iPad: adicione à Tela de Início e abra pelo ícone. O navegador e o sistema operacional podem silenciar avisos. A tela bloqueada não mostra nomes, telefones nem conteúdo de clientes.</p>
    </section>
    <section className="overflow-hidden rounded-xl border bg-card">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">Tipos de acontecimentos</h2>
      {loading&&<p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
      {Object.entries(LABELS).map(([key,label])=><div key={key} className="flex items-center justify-between gap-2 border-b px-4 py-3 last:border-0">
        <label htmlFor={`push-${key}`} className="text-sm">{label}</label>
        <button type="button" id={`push-${key}`} role="switch" aria-checked={notif[key]!==false} disabled={busy||loading}
          onClick={()=>toggle(key)} className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${notif[key]!==false?'bg-primary':'bg-muted'}`}>
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition ${notif[key]!==false?'translate-x-5':''}`}/>
        </button>
      </div>)}
    </section>
  </div>;
}
