'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, LockKeyhole, Eye, EyeOff, ArrowRight, ShieldCheck, CarFront, UsersRound, ChartNoAxesCombined } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const {login,isAuthenticated}=useAuth();
  const router=useRouter();
  const [loading,setLoading]=useState(false);
  const [mostrar,setMostrar]=useState(false);
  const [form,setForm]=useState({login:'',senha:''});
  useEffect(()=>{if(isAuthenticated)router.replace('/painel');},[isAuthenticated,router]);
  async function entrar(e:FormEvent){
    e.preventDefault();
    if(!form.login.trim()||!form.senha){toast.error('Informe seu login e senha.');return;}
    setLoading(true);
    try{await login({login:form.login.trim(),senha:form.senha});router.replace('/painel');}
    catch(err:any){toast.error(err?.response?.data?.error||'Não foi possível acessar. Confira seus dados.');}
    finally{setLoading(false);}
  }
  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#090b11] text-slate-100 selection:bg-violet-400/25">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_10%,rgba(114,75,150,.13),transparent_44%)]" />
      <div className="relative mx-auto grid min-h-[100svh] w-full max-w-[1320px] grid-cols-1 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,.98fr)]">
        <section className="relative flex flex-col border-b border-white/10 px-5 pt-5 pb-5 sm:px-8 sm:pt-8 lg:min-h-[100svh] lg:border-b-0 lg:border-r lg:px-[clamp(30px,5vw,72px)] lg:py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[.045] p-1.5">
              <img src="/aurox-logo.png" alt="Símbolo Aurox" className="h-full w-full object-contain" />
            </div>
            <div className="leading-tight"><p className="text-[19px] font-semibold tracking-[-.035em]">Aurox</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.21em] text-slate-500">Gestão automotiva</p></div>
          </div>
          <div className="mt-7 hidden max-w-[525px] lg:my-auto lg:block">
            <p className="text-xs font-medium uppercase tracking-[.24em] text-[#b79ad4]">Uma operação mais clara</p>
            <h1 className="mt-6 text-[clamp(42px,4vw,65px)] font-semibold leading-[1.07] tracking-[-.058em]">Tudo acontece<br/>em um só lugar<span className="text-[#b99bd9]">.</span></h1>
            <p className="mt-7 max-w-[430px] text-[16px] leading-[1.8] text-slate-400">Do primeiro contato à entrega do veículo. Acompanhe a equipe, os atendimentos e os resultados com uma visão completa.</p>
            <div className="mt-11 grid max-w-[440px] grid-cols-3 gap-4 border-t border-white/10 pt-6">
              {[{icon:UsersRound,t:'Atendimento'},{icon:CarFront,t:'Estoque'},{icon:ChartNoAxesCombined,t:'Resultados'}].map(({icon:Icon,t})=><div key={t} className="flex flex-col gap-3 text-sm text-slate-300"><Icon className="h-5 w-5 text-[#b99bd9]" strokeWidth={1.7}/>{t}</div>)}
            </div>
          </div>
          <p className="mt-auto hidden text-xs text-slate-600 lg:block">© {new Date().getFullYear()} Aurox · Plataforma de gestão</p>
        </section>
        <section className="flex min-w-0 flex-col justify-center px-5 pb-8 pt-8 sm:px-8 sm:py-12 lg:px-[clamp(30px,5vw,84px)]">
          <div className="mx-auto w-full max-w-[424px]">
            <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl border border-violet-300/15 bg-[#201a2b] text-[#c2a4e2] lg:mb-9"><LockKeyhole className="h-5 w-5" strokeWidth={1.8}/></div>
            <h2 className="text-[clamp(26px,3vw,35px)] font-semibold tracking-[-.045em] leading-tight">Bem-vindo de volta.</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-400">Entre para continuar de onde parou.</p>
            <form onSubmit={entrar} className="mt-8 space-y-5">
              <div><label htmlFor="login" className="mb-2 block text-sm font-medium text-slate-200">Seu login</label><input id="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={form.login} onChange={e=>setForm({...form,login:e.target.value})} placeholder="Digite seu usuário" className="h-[50px] w-full rounded-xl border border-white/15 bg-[#11151e] px-4 text-[15px] text-white outline-none transition placeholder:text-slate-500 focus:border-[#a688cb] focus:ring-2 focus:ring-violet-400/10"/></div>
              <div><label htmlFor="senha" className="mb-2 block text-sm font-medium text-slate-200">Sua senha</label><div className="relative"><input id="senha" type={mostrar?'text':'password'} autoComplete="current-password" required value={form.senha} onChange={e=>setForm({...form,senha:e.target.value})} placeholder="Digite sua senha" className="h-[50px] w-full rounded-xl border border-white/15 bg-[#11151e] px-4 pr-12 text-[15px] text-white outline-none transition placeholder:text-slate-500 focus:border-[#a688cb] focus:ring-2 focus:ring-violet-400/10"/><button type="button" className="absolute inset-y-0 right-3 flex items-center px-1 text-slate-400 transition hover:text-white" aria-label={mostrar?'Ocultar senha':'Mostrar senha'} onClick={()=>setMostrar(!mostrar)}>{mostrar?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></div>
              <button type="submit" disabled={loading} className="flex h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#b79ad9] text-[14px] font-semibold text-[#1b1426] transition hover:bg-[#cdb4ea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:opacity-60">{loading?<Loader2 className="h-4 w-4 animate-spin"/>:<>Acessar Aurox <ArrowRight size={17}/></>}</button>
            </form>
            <p className="mt-7 flex items-center justify-center gap-2 text-center text-xs text-slate-500"><ShieldCheck size={15} className="text-[#ab92ca]"/>Acesso exclusivo para usuários autorizados.</p>
            <nav aria-label="Informações da plataforma" className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border-t border-white/10 pt-6 text-xs text-slate-400 sm:mt-14"><Link href="/termos" className="hover:text-violet-200">Termos de uso</Link><Link href="/privacidade" className="hover:text-violet-200">Privacidade</Link><Link href="/ajuda" className="hover:text-violet-200">Ajuda e suporte</Link></nav>
          </div>
        </section>
      </div>
    </main>
  );
}
