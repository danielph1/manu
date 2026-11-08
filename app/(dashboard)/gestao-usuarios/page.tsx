'use client';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useAuth} from '@/contexts/auth-context';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {toast} from 'sonner';
import {UserPlus,ShieldCheck,Users,RefreshCcw,Eye,EyeOff,KeyRound,Mail,UserRoundX} from 'lucide-react';
import {podeCriarCargo,podeGerenciarUsuarios,podeAdministrarConta} from '@/lib/hierarquia-usuarios';
import {CARGOS_IDENTIDADE,cpfValido,nascimentoValido,nomeCompletoValido} from '@/lib/identidade-cargos';

type Empresa={id:number;nome:string};type Loja={codigo:string;nome:string};
type Usuario={id:number;nome:string;login:string;email:string|null;tipo:string;loja:string;ativo:boolean;empresa_id:number};
const TODOS:[string,string][]=[
 ['admin','Administrador'],['gerente','Gerente'],['marketing','Marketing'],['documentista','Documentista'],
 ['vendedor','Vendedor'],['mecanico','Mecânico'],['guariba','Guariba'],
];
const labelCls='block text-sm';const selectCls='mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm';
export default function GestaoUsuarios(){
 const {user,isLoading}=useAuth();const tipo=String(user?.tipo||'').toLowerCase();const isSuper=tipo==='superadmin';
 const [empresas,setEmpresas]=useState<Empresa[]>([]),[empresa,setEmpresa]=useState('');
 const [lojas,setLojas]=useState<Loja[]>([]),[usuarios,setUsuarios]=useState<Usuario[]>([]),[loading,setLoading]=useState(false);
 const [nome,setNome]=useState(''),[login,setLogin]=useState(''),[email,setEmail]=useState('');
 const [senha,setSenha]=useState(''),[cpf,setCpf]=useState(''),[nascimento,setNascimento]=useState('');
 const [cargo,setCargo]=useState('vendedor'),[loja,setLoja]=useState(''),[verSenha,setVerSenha]=useState(false);
 const [saving,setSaving]=useState(false),[acaoId,setAcaoId]=useState<number|null>(null);
 const opcoes=useMemo(()=>TODOS.filter(([k])=>podeCriarCargo(tipo,k)),[tipo]);
 const pedeIdentidade=CARGOS_IDENTIDADE.has(cargo);
 const carregar=useCallback(async()=>{
  setLoading(true);
  try{
   const r=await api.get('/gestao-usuarios',{params:empresa?{empresa_id:Number(empresa)}:{}});
   const es:Array<Empresa>=Array.isArray(r.data.empresas)?r.data.empresas:[];
   setEmpresas(es);setEmpresa(old=>old||String(r.data.empresa_id||es[0]?.id||''));
   setLojas(r.data.lojas||[]);setUsuarios(r.data.usuarios||[]);
   setLoja(old=>(r.data.lojas||[]).some((l:Loja)=>l.codigo===old)?old:String(r.data.lojas?.[0]?.codigo||''));
  }catch(err:any){toast.error(err?.response?.data?.error||'Falha ao consultar os usuários');}
  finally{setLoading(false);}
 },[empresa]);
 useEffect(()=>{if(!isLoading&&podeGerenciarUsuarios(tipo))void carregar();},[carregar,isLoading,tipo]);
 useEffect(()=>{if(!opcoes.some(([k])=>k===cargo))setCargo(opcoes[0]?.[0]||'vendedor');},[opcoes,cargo]);
 async function cadastrar(e:FormEvent){e.preventDefault();
  if(pedeIdentidade&&(!nomeCompletoValido(nome)||!cpfValido(cpf)||!nascimentoValido(nascimento))){
   toast.error('Informe nome completo, CPF válido e data de nascimento para esse cargo.');return;
  }
  setSaving(true);
  try{
   await api.post('/gestao-usuarios',{nome,login,email,cpf,data_nascimento:nascimento,senha,tipo:cargo,loja,empresa_id:Number(empresa)});
   toast.success('Usuário cadastrado.');setNome('');setLogin('');setEmail('');setSenha('');setCpf('');setNascimento('');await carregar();
  }catch(err:any){toast.error(err?.response?.data?.error||'Não foi possível cadastrar.');}
  finally{setSaving(false);}
 }
 async function alterar(u:Usuario){if(!confirm(`${u.ativo?'Desativar':'Reativar'} a conta de ${u.nome}?`))return;
  setAcaoId(u.id);try{await api.patch('/gestao-usuarios',{id:u.id,ativo:!u.ativo});toast.success('Acesso atualizado.');await carregar();}
  catch(err:any){toast.error(err?.response?.data?.error||'Não foi possível alterar a conta.');}
  finally{setAcaoId(null);}
 }
 async function editarEmail(u:Usuario){const valor=prompt(`E-mail de recuperação de ${u.nome}:`,u.email||'');if(valor===null)return;
  const novo=valor.trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(novo)){toast.error('Informe um e-mail válido.');return;}
  setAcaoId(u.id);try{await api.patch('/gestao-usuarios/email',{id:u.id,email:novo});toast.success('E-mail atualizado.');await carregar();}
  catch(err:any){toast.error(err?.response?.data?.error||'Falha ao atualizar o e-mail.');}finally{setAcaoId(null);}
 }
 async function recuperar(u:Usuario){if(!u.email){toast.error('Cadastre um e-mail antes de enviar a recuperação.');return;}
  if(!confirm(`Enviar instruções de redefinição para o e-mail cadastrado de ${u.nome}?`))return;
  setAcaoId(u.id);try{
   const {data}=await api.post('/auth/esqueci-senha',{login:u.login});
   toast.message(data?.mensagem||'Se a conta estiver apta, o e-mail de recuperação será enviado.');
  }catch(err:any){toast.error(err?.response?.data?.error||'Serviço de recuperação indisponível.');}
  finally{setAcaoId(null);}
 }
 if(isLoading)return <p>Carregando...</p>;
 if(!podeGerenciarUsuarios(tipo))return <div className="p-6 text-muted-foreground">Acesso restrito à administração.</div>;
 return <div className="mx-auto max-w-6xl space-y-6 pb-32">
  <header><h1 className="flex items-center gap-2 text-3xl font-bold"><Users className="text-primary"/>Usuários e cadastros</h1>
   <p className="mt-1 text-sm text-muted-foreground">Contas por empresa e loja. Documentista, gerente, marketing e administrador exigem dados de identificação.</p>
  </header>
  <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
   <h2 className="flex items-center gap-2 font-semibold"><UserPlus size={18}/>Novo usuário</h2>
   <form onSubmit={cadastrar} className="grid gap-4 sm:grid-cols-2">
    {isSuper?<label className={labelCls}>Empresa *<select required className={selectCls} value={empresa} onChange={e=>{setEmpresa(e.target.value);setLoja('');}}>
      <option value="">Selecione a empresa</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
    </select></label>:<div className={labelCls}>Empresa<div className="mt-1 rounded-lg border bg-muted px-3 py-2">{empresas[0]?.nome||'Não vinculada'}</div></div>}
    <label className={labelCls}>Loja *<select required className={selectCls} value={loja} onChange={e=>setLoja(e.target.value)}>
      <option value="">Selecione a loja</option>{lojas.map(l=><option key={l.codigo} value={l.codigo}>{l.nome||l.codigo} ({l.codigo})</option>)}
    </select></label>
    <label className={labelCls}>Nome completo *<Input className="mt-1" required minLength={2} maxLength={140} value={nome} onChange={e=>setNome(e.target.value)}/></label>
    <label className={labelCls}>Login *<Input className="mt-1" required minLength={3} maxLength={80} autoComplete="off" value={login} onChange={e=>setLogin(e.target.value)}/></label>
    <label className={labelCls}>Cargo *<select className={selectCls} value={cargo} onChange={e=>setCargo(e.target.value)}>
      {opcoes.map(([k,v])=><option key={k} value={k}>{v}</option>)}
    </select></label>
    <label className={labelCls}>E-mail para recuperação de senha *<Input required className="mt-1" type="email" maxLength={200} placeholder="nome@empresa.com.br" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    {pedeIdentidade&&<>
      <label className={labelCls}>CPF válido *<Input required inputMode="numeric" className="mt-1" minLength={11} maxLength={11} placeholder="Somente 11 números" value={cpf} onChange={e=>setCpf(e.target.value.replace(/\D/g,'').slice(0,11))}/></label>
      <label className={labelCls}>Data de nascimento *<Input required type="date" className="mt-1" value={nascimento} onChange={e=>setNascimento(e.target.value)}/></label>
      <div className="sm:col-span-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Os dados de identificação são obrigatórios apenas para administrador, gerente, marketing e documentista. CPF e nascimento não aparecem na listagem.</div>
    </>}
    <label className={labelCls}>Senha inicial *<div className="mt-1 flex gap-2"><Input required minLength={8} maxLength={150} autoComplete="new-password" type={verSenha?'text':'password'} value={senha} onChange={e=>setSenha(e.target.value)}/><Button type="button" variant="outline" title="Mostrar senha" onClick={()=>setVerSenha(x=>!x)}>{verSenha?<EyeOff size={16}/>:<Eye size={16}/>}</Button></div></label>
    <div className="flex items-end justify-end"><Button disabled={saving||!empresa||!loja} type="submit"><ShieldCheck className="mr-2 h-4 w-4"/>{saving?'Salvando…':'Cadastrar usuário'}</Button></div>
   </form>
  </section>
  <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-6">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Contas da empresa</h2><p className="text-xs text-muted-foreground">Desativar revoga o acesso nas verificações de sessão, sem excluir histórico ou leads.</p></div>
    <Button variant="outline" size="sm" onClick={()=>void carregar()}><RefreshCcw className="mr-2 h-4 w-4"/>Atualizar</Button></div>
   {loading&&<p className="text-sm text-muted-foreground">Atualizando...</p>}
   {!usuarios.length&&<p className="text-sm text-muted-foreground">Nenhum usuário cadastrado neste escopo.</p>}
   <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Usuário</th><th className="p-2">Cargo</th><th className="p-2">Loja</th><th className="p-2">Status</th><th className="p-2">Ações</th></tr></thead>
    <tbody>{usuarios.map(u=>{const autorizado=podeAdministrarConta(tipo,u.tipo)&&u.id!==user?.id;return <tr key={u.id} className="border-b border-border/50"><td className="p-2"><strong>{u.nome}</strong><p className="text-xs text-muted-foreground">{u.login}</p><p className="text-xs text-muted-foreground">{u.email||'Sem e-mail'}</p></td>
      <td className="p-2">{u.tipo}</td><td className="p-2">{u.loja||'—'}</td><td className="p-2"><span className={u.ativo?'text-emerald-500':'text-amber-500'}>{u.ativo?'Ativo':'Inativo'}</span></td>
      <td className="p-2"><div className="flex flex-wrap gap-1.5">{autorizado?<>
        <Button size="sm" variant="outline" disabled={acaoId===u.id} onClick={()=>void alterar(u)}>{u.ativo?'Desativar':'Reativar'}</Button>
        <Button size="sm" variant="outline" disabled={acaoId===u.id} onClick={()=>void editarEmail(u)} title="Cadastrar ou corrigir e-mail"><Mail size={15}/></Button>
        <Button size="sm" variant="outline" disabled={acaoId===u.id||!u.ativo||!u.email} onClick={()=>void recuperar(u)} title="Enviar link para redefinir senha"><KeyRound size={15}/><span className="ml-1">Senha</span></Button>
      </>:<span className="text-xs text-muted-foreground">{u.id===user?.id?'Sua conta':'Somente nível superior'}</span>}</div></td>
    </tr>;})}</tbody></table></div>
   <p className="text-xs text-muted-foreground">Para recuperar a própria conta, use <Link href="/recuperar-senha" className="underline">Esqueci minha senha</Link> na tela de login. O envio depende do serviço de e-mail estar configurado.</p>
  </section>
 </div>;
}
