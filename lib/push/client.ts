import { api } from '@/lib/api';
function uint8Key(value:string){
  const base64=value.replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64+'='.repeat((4-base64.length%4)%4));
  const key=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)key[i]=raw.charCodeAt(i);
  return key;
}
export function pushDisponivel(){
  return typeof window!=='undefined' && window.isSecureContext && 'serviceWorker' in navigator
    && 'PushManager' in window && 'Notification' in window;
}
export function estaNoInicioIOS(){
  if(typeof window==='undefined')return true;
  const ios=/iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  return !ios || Boolean((navigator as Navigator & {standalone?:boolean}).standalone) ||
    window.matchMedia('(display-mode: standalone)').matches;
}
export async function registrarInscricaoPush(pedirPermissao=false){
  if(!pushDisponivel())throw new Error('Este navegador não oferece notificações push neste contexto. Use HTTPS.');
  if(!estaNoInicioIOS())throw new Error('No iPhone, adicione o Aurox à Tela de Início e abra pelo ícone para ativar os avisos.');
  if(!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)throw new Error('VAPID público ainda não configurado na Vercel.');
  // A permissão só é solicitada a partir do clique explícito do usuário.
  const perm=pedirPermissao&&Notification.permission==='default'
    ? await Notification.requestPermission():Notification.permission;
  if(perm!=='granted')throw new Error(perm==='denied'?'Notificações bloqueadas nas configurações do navegador.':'Permissão de notificações ainda não concedida.');
  const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
  const old=await reg.pushManager.getSubscription();
  const sub=old||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:uint8Key(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)});
  await api.post('/push/subscribe',sub.toJSON());
  return true;
}
export async function desativarInscricaoPush(){
  const reg=await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.getSubscription();
  if(!sub)return;
  await api.delete('/push/subscribe',{data:{endpoint:sub.endpoint}});
  await sub.unsubscribe();
}
