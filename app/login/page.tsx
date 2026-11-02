'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, LockKeyhole, Eye, EyeOff, ArrowRight, ShieldCheck, Layers, BarChart3, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const [form, setForm] = useState({ login: '', senha: '' });
  useEffect(() => { if (isAuthenticated) router.replace('/painel'); }, [isAuthenticated, router]);
  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!form.login.trim() || !form.senha) { toast.error('Informe login e senha.'); return; }
    setLoading(true);
    try { await login({ login: form.login.trim(), senha: form.senha }); router.replace('/painel'); }
    catch (err: any) { toast.error(err?.response?.data?.error || 'Não foi possível entrar. Confira seus dados.'); }
    finally { setLoading(false); }
  }
  return (
    <main className="min-h-screen bg-[#090c13] text-[#eef0f6] selection:bg-violet-400/30">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <div className="relative flex w-full flex-col overflow-hidden border-b border-white/10 bg-[#10141e] px-6 pb-10 pt-8 sm:px-12 lg:min-h-screen lg:w-[54%] lg:justify-between lg:border-b-0 lg:border-r lg:px-16 lg:pb-14 lg:pt-12">
          <div className="pointer-events-none absolute -right-40 top-40 h-[30rem] w-[30rem] rounded-full bg-violet-700/10 blur-[100px]" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/5">
              <img src="/aurox-logo.png" alt="Logo Aurox" className="h-10 w-10 object-contain" />
            </div>
            <div><div className="text-xl font-semibold tracking-[.02em]">Aurox</div><div className="text-[11px] uppercase tracking-[.22em] text-slate-400">Plataforma de gestão</div></div>
          </div>
          <div className="relative mt-14 max-w-[570px] lg:my-auto">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-200"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> Inteligência para sua operação</span>
            <h1 className="mt-7 text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.7rem]">Sua operação, <span className="text-[#ba9be8]">sob controle.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg">Acompanhe oportunidades, organize sua equipe e conecte cada etapa da jornada de venda em um só lugar.</p>
            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {[
                {title:'Leads',detail:'Do contato ao atendimento',Icon:MessageSquare},
                {title:'Estoque',detail:'Veículos em um só painel',Icon:Layers},
                {title:'Resultados',detail:'Visibilidade da operação',Icon:BarChart3}
              ].map(({title,detail,Icon}) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><Icon className="h-5 w-5 text-violet-300"/><div className="mt-4 text-sm font-semibold">{title}</div><div className="mt-1 text-xs leading-relaxed text-slate-400">{detail}</div></div>
              ))}
            </div>
          </div>
          <div className="relative mt-12 text-xs text-slate-500">© {new Date().getFullYear()} Aurox Technology. Todos os direitos reservados.</div>
        </div>
        <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
          <div className="mx-auto w-full max-w-[420px]">
            <div className="mb-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.05]"><LockKeyhole className="h-5 w-5 text-violet-200" /></div>
            <h2 className="text-3xl font-semibold tracking-tight">Acesse sua conta</h2>
            <p className="mt-3 text-sm text-slate-400">Entre com as credenciais fornecidas pela sua empresa.</p>
            <form onSubmit={entrar} className="mt-9 space-y-5">
              <div><label htmlFor="login" className="mb-2 block text-sm font-medium">Login</label><input id="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={form.login} onChange={e=>setForm({...form,login:e.target.value})} placeholder="Seu usuário" className="h-12 w-full rounded-xl border border-white/15 bg-white/[.04] px-4 text-[15px] text-white placeholder:text-slate-500 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15" /></div>
              <div><label htmlFor="senha" className="mb-2 block text-sm font-medium">Senha</label><div className="relative"><input id="senha" type={mostrar?'text':'password'} autoComplete="current-password" required value={form.senha} onChange={e=>setForm({...form,senha:e.target.value})} placeholder="Sua senha" className="h-12 w-full rounded-xl border border-white/15 bg-white/[.04] px-4 pr-12 text-[15px] text-white placeholder:text-slate-500 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15" /><button type="button" aria-label={mostrar?'Ocultar senha':'Mostrar senha'} onClick={()=>setMostrar(!mostrar)} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white">{mostrar?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></div>
              <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ab8bd9] font-semibold text-[#170f26] transition hover:bg-[#c2a8ea] disabled:cursor-wait disabled:opacity-60">{loading?<Loader2 className="h-4 w-4 animate-spin"/>:<>Entrar no Aurox <ArrowRight size={18}/></>}</button>
            </form>
            <div className="mt-7 flex items-center justify-center gap-2 text-center text-xs text-slate-400"><ShieldCheck size={15} className="text-violet-300"/>Acesso restrito aos usuários autorizados.</div>
            <div className="mt-14 flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-white/10 pt-6 text-xs text-slate-400"><Link href="/termos" className="hover:text-violet-200">Termos de Uso</Link><Link href="/privacidade" className="hover:text-violet-200">Privacidade</Link><Link href="/ajuda" className="hover:text-violet-200">Ajuda / suporte</Link></div>
          </div>
        </div>
      </div>
    </main>
  );
}
