'use client';
import {useState,type FormEvent} from 'react';
import {api} from '@/lib/api';
import {toast} from 'sonner';
import {LockKeyhole} from 'lucide-react';
export function AlterarSenha(){
 const [atual,setAtual]=useState(''),[nova,setNova]=useState(''),[confirma,setConfirma]=useState(''),[busy,setBusy]=useState(false);
 async function alterar(e:FormEvent){e.preventDefault();if(nova!==confirma){toast.error('Confirmação não confere.');return;}
  if(nova.length<12){toast.error('A nova senha precisa ter pelo menos 12 caracteres.');return;}
  setBusy(true);try{await api.post('/conta/senha',{atual,nova});setAtual('');setNova('');setConfirma('');toast.success('Senha alterada. Entre novamente para verificar o acesso.');}
  catch(e:any){toast.error(e?.response?.data?.error||'Não foi possível alterar a senha.');}finally{setBusy(false);}}
 return <form onSubmit={alterar} className="space-y-3 rounded-xl border border-border bg-card p-4">
  <h2 className="flex items-center gap-2 text-base font-semibold"><LockKeyhole size={18}/>Alterar minha senha</h2>
  <p className="text-xs text-muted-foreground">Para redefinir sem conhecer a senha atual, use “Esqueci minha senha” na tela de login. Exige e-mail cadastrado.</p>
  <label className="block text-sm">Senha atual<input type="password" autoComplete="current-password" required value={atual} onChange={e=>setAtual(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"/></label>
  <label className="block text-sm">Nova senha (mínimo 12 caracteres)<input type="password" autoComplete="new-password" required minLength={12} value={nova} onChange={e=>setNova(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"/></label>
  <label className="block text-sm">Confirmar nova senha<input type="password" autoComplete="new-password" required minLength={12} value={confirma} onChange={e=>setConfirma(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"/></label>
  <button disabled={busy} type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?'Salvando…':'Alterar senha'}</button>
 </form>;
}
