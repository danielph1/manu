'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {api} from '@/lib/api';
import {toast} from 'sonner';
import {CheckCircle2,LockKeyhole,ShieldCheck} from 'lucide-react';
type Info={email:string;cpf_cadastrado:boolean;cpf_mascarado:string|null;completo:boolean};
export function CompletarCadastro(){
 const [info,setInfo]=useState<Info|null>(null),[cpf,setCpf]=useState(''),[email,setEmail]=useState(''),[salvando,setSalvando]=useState(false);
 async function reload(){try{const {data}=await api.get('/conta/completar');setInfo(data);setEmail(data.email||'');}catch{toast.error('Não foi possível carregar os dados complementares.');}}
 useEffect(()=>{void reload();},[]);
 async function salvar(e:FormEvent){e.preventDefault();setSalvando(true);try{
  const body:Record<string,string>={email:email.trim().toLowerCase()};
  if(cpf.trim())body.cpf=cpf.replace(/\D/g,'');
  await api.patch('/conta/completar',body);toast.success('Dados atualizados com segurança.');setCpf('');await reload();
 }catch(err:any){toast.error(err?.response?.data?.error||'Falha ao completar cadastro.');}finally{setSalvando(false);}}
 return <section className="rounded-xl border bg-card p-4 sm:p-5"><div className="flex items-center gap-2"><ShieldCheck className="text-primary" size={20}/><h2 className="font-semibold">Completar cadastro e recuperação</h2>{info?.completo&&<CheckCircle2 className="ml-auto text-emerald-500" size={19}/>}</div>
  <p className="mt-2 text-sm text-muted-foreground">Esta área é pessoal e fica disponível somente para a conta autenticada. Informe seu CPF e e-mail <strong>após</strong> o cadastro inicial, sem necessidade de um gestor criar a conta novamente.</p>
  <form onSubmit={salvar} className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm">CPF {info?.cpf_cadastrado?'(já cadastrado)':'*'}<input className="mt-1 w-full rounded-lg border bg-background p-2.5" inputMode="numeric" maxLength={11} minLength={11} placeholder={info?.cpf_cadastrado?info.cpf_mascarado||'CPF cadastrado':'Somente 11 números'} required={!info?.cpf_cadastrado} value={cpf} onChange={e=>setCpf(e.target.value.replace(/\D/g,'').slice(0,11))}/><span className="mt-1 block text-xs text-muted-foreground">{info?.cpf_cadastrado?'O número completo não é exibido. Informe outro apenas se precisar corrigir.':'CPF válido é necessário para completar o perfil.'}</span></label>
   <label className="text-sm">E-mail para recuperação *<input className="mt-1 w-full rounded-lg border bg-background p-2.5" type="email" required maxLength={200} placeholder="seuemail@dominio.com" value={email} onChange={e=>setEmail(e.target.value)}/><span className="mt-1 block text-xs text-muted-foreground">Confira se você controla este endereço. O cadastro do e-mail, por si só, não verifica sua titularidade.</span></label>
   <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3"><p className="max-w-lg text-xs text-muted-foreground"><LockKeyhole className="mr-1 inline h-4 w-4"/>Os dados são usados para identificação da conta e recuperação de acesso. Não devem aparecer no histórico geral, exportações públicas ou campanhas.</p><button disabled={salvando} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{salvando?'Salvando…':'Salvar dados'}</button></div>
  </form></section>;
}
