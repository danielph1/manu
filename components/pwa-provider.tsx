'use client';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { pushDisponivel, registrarInscricaoPush } from '@/lib/push/client';
/** Só renova inscrições já autorizadas. Nunca abre prompt sem o clique do usuário. */
export function PWAProvider(){
  const {user,isLoading}=useAuth();
  useEffect(()=>{
    if(!('serviceWorker' in navigator))return;
    navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});
  },[]);
  useEffect(()=>{
    if(isLoading||!user?.id||!pushDisponivel()||Notification.permission!=='granted')return;
    // Atualiza vínculo do endpoint com o usuário ativo neste navegador.
    void registrarInscricaoPush(false).catch(()=>{});
  },[isLoading,user?.id]);
  return null;
}
