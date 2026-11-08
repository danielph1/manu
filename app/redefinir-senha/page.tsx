'use client';
import {useState,type FormEvent} from 'react';import Link from 'next/link';import {useSearchParams} from 'next/navigation';import {Suspense} from 'react';
function Formulario(){
 const token=useSearchParams().get('token')||'';const [senha,setSenha]=useState(''),[conf,setConf]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();if(senha!==conf){setMsg('As senhas não coincidem');return;}setBusy(true);
  try{const r=await fetch('/api/auth/redefinir-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,senha}),cache:'no-store'});
   const data=await r.json();setMsg(data.mensagem||data.error||'Não foi possível redefinir');if(r.ok){setSenha('');setConf('');}}
  catch{setMsg('Falha de conexão');}finally{setBusy(false);}}
 return <main className="flex min-h-screen items-center justify-center bg-[#090b11] p-4 text-white"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-white/[.04] p-7">
  <h1 className="text-2xl font-semibold">Criar nova senha</h1><p className="text-sm text-slate-400">Use no mínimo 12 caracteres.</p>
  <input type="password" autoComplete="new-password" required minLength={12} value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Nova senha" className="w-full rounded-lg border border-white/20 bg-black/30 p-3"/>
  <input type="password" autoComplete="new-password" required minLength={12} value={conf} onChange={e=>setConf(e.target.value)} placeholder="Confirmar senha" className="w-full rounded-lg border border-white/20 bg-black/30 p-3"/>
  <button disabled={busy||!token} className="w-full rounded-lg bg-violet-300 p-3 font-semibold text-black disabled:opacity-50">{busy?'Salvando…':'Redefinir senha'}</button>
  {msg&&<p role="status" className="text-sm text-violet-200">{msg}</p>}
  <Link className="block text-sm underline" href="/login">Voltar ao login</Link>
 </form></main>;
}
export default function Page(){return <Suspense fallback={<p>Carregando…</p>}><Formulario/></Suspense>;}
