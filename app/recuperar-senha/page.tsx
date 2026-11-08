'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
export default function RecuperarSenha(){
 const [login,setLogin]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMsg('');
  try{const r=await fetch('/api/auth/esqueci-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login}),cache:'no-store'});
   const data=await r.json();setMsg(data.mensagem||data.error||'Não foi possível enviar.');}
  catch{setMsg('Erro de conexão. Solicite ajuda ao administrador.');}finally{setBusy(false);}}
 return <main className="flex min-h-screen items-center justify-center bg-[#090b11] p-4 text-white"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-white/[.04] p-7">
  <img src="/aurox-logo.png" alt="Aurox" className="h-12 w-12 object-contain"/><h1 className="text-2xl font-semibold">Recuperar senha</h1>
  <p className="text-sm text-slate-400">Informe seu login. Se houver e-mail cadastrado, enviaremos um link válido por 20 minutos.</p>
  <label className="block space-y-2 text-sm">Login<input required minLength={3} value={login} onChange={e=>setLogin(e.target.value)} className="w-full rounded-lg border border-white/20 bg-black/30 p-3"/></label>
  <button disabled={busy} className="w-full rounded-lg bg-violet-300 p-3 font-semibold text-black disabled:opacity-50">{busy?'Enviando…':'Solicitar recuperação'}</button>
  {msg&&<p role="status" className="text-sm text-violet-200">{msg}</p>}
  <Link className="block text-sm underline" href="/login">Voltar ao login</Link>
 </form></main>;
}
