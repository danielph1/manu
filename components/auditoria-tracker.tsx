'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {useAuth} from '@/contexts/auth-context';
import {api} from '@/lib/api';

/** Registro auxiliar de visita ao painel; login fica registrado diretamente no backend. */
export function AuditoriaTracker(){
 const path=usePathname();const {user}=useAuth();
 useEffect(()=>{
  if(!user?.id||!path)return;
  void api.post('/auditoria',{caminho:path}).catch(err=>{
    // Sem apagar eventos e sem colocar informacoes de clientes nos logs.
    console.warn('[Aurox Auditoria] falha ao registrar navegação:',err?.response?.status||'rede');
  });
 },[user?.id,path]);
 return null;
}
