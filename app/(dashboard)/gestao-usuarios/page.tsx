'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useAuth} from '@/contexts/auth-context';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {toast} from 'sonner';
import {UserPlus,ShieldCheck,Users,RefreshCcw,Eye,EyeOff} from 'lucide-react';
import {podeCriarCargo,podeGerenciarUsuarios} from '@/lib/hierarquia-usuarios';

type Empresa={id:number;nome:string};type Loja={codigo:string;nome:string};
type Usuario={id:number;nome:string;login:string;tipo:string;loja:string;ativo:boolean;empresa_id:number};
const TODOS=[['admin','Administrador'],['gerente','Gerente'],['marketing','Marketing'],['vendedor','Vendedor'],['mecanico','Mecânico'],['guariba','Guariba']];

export default function GestaoUsuarios(){
 const {user,isLoading}=useAuth();const tipo=String(user?.tipo||'').toLowerCase();const isSuper=tipo==='superadmin';
 const [empresas,setEmpresas]=useState<Empresa[]>([]);const [empresa,setEmpresa]=useState('');
 const [lojas,setLojas]=useState<Loja[]>([]);const [usuarios,setUsuarios]=useState<Usuario[]>([]);const [loading,setLoading]=useState(false);
 const [nome,setNome]=useState('');const [login,setLogin]=useState('');const [senha,setSenha]=useState('');
 const [cargo,setCargo]=useState('vendedor');const [loja,setLoja]=useState('');const [verSenha,setVerSenha]=useState(false);
 const [saving,setSaving]=useState(false);
 const opcoes=useMemo(()=>TODOS.filter(([k])=>podeCriarCargo(tipo,k)),[tipo]);
 const carregar=useCallback(async()=>{setLoading(true);try{
  const r=await api.get('/gestao-usuarios',{params:empresa?{empresa_id:Number(empresa)}:{}});
  const e=Array.isArray(r.data.empresas)?r.data.empresas:[];
  setEmpresas(e);setEmpresa(old=>old||String(r.data.empresa_id||e[0]?.id||''));
  setLojas(r.data.lojas||[]);setUsuarios(r.data.usuarios||[]);
  setLoja(old=>(r.data.lojas||[]).some((l:Loja)=>l.codigo===old)?old:String(r.data.lojas?.[0]?.codigo||''));
 }catch(e:any){toast.error(e?.response?.data?.error||'Falha ao carregar usuários');}finally{setLoading(false)}},[empresa]);
 useEffect(()=>{if(!isLoading&&podeGerenciarUsuarios(tipo))void carregar();},[carregar,isLoading,tipo]);
 useEffect(()=>{if(!opcoes.find(([k])=>k===cargo))setCargo(opcoes[0]?.[0]||'vendedor');},[opcoes,cargo]);
 async function cadastrar(e:React.FormEvent){e.preventDefault();setSaving(true);try{
  await api.post('/gestao-usuarios',{nome,login,senha,tipo:cargo,loja,empresa_id:Number(empresa)});
  toast.success('Usuário cadastrado');setNome('');setLogin('');setSenha('');await carregar();
 }catch(err:any){toast.error(err?.response?.data?.error||'Não foi possível cadastrar');}finally{setSaving(false);}}
 async function alterar(u:Usuario){if(!confirm(`${u.ativo?'Desativar':'Reativar'} ${u.nome}?`))return;
  try{await api.patch('/gestao-usuarios',{id:u.id,ativo:!u.ativo});toast.success('Acesso atualizado');await carregar();}
  catch(e:any){toast.error(e?.response?.data?.error||'Não foi possível alterar acesso');}}
 if(isLoading)return <p>Carregando...</p>;
 if(!podeGerenciarUsuarios(tipo))return <p className="p-6 text-muted-foreground">Acesso restrito a marketing, admin e superadmin.</p>;
 return <div className="mx-auto max-w-5xl space-y-6 pb-24">
  <header><h1 className="flex items-center gap-2 text-3xl font-bold"><Users className="text-primary"/>Usuários e vendedores</h1>
   <p className="text-sm text-muted-foreground">Cadastre por empresa e loja. Você só pode criar cargos abaixo do seu nível hierárquico.</p></header>
  <div className="rounded-xl border bg-card p-5 space-y-4">
   <h2 className="flex items-center gap-2 font-semibold"><UserPlus size={18}/> Novo usuário</h2>
   <form onSubmit={cadastrar} className="grid gap-4 sm:grid-cols-2">
    {isSuper?<label className="text-sm">Empresa<select className="mt-1 w-full rounded-md border bg-background p-2" value={empresa} onChange={e=>{setEmpresa(e.target.value);setLoja('')}}>
     <option value="">Selecione a empresa</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
    </select></label>:<div className="text-sm">Empresa <div className="mt-1 rounded-md border bg-muted p-2">{empresas[0]?.nome||'Não vinculada'}</div></div>}
    <label className="text-sm">Loja<select className="mt-1 w-full rounded-md border bg-background p-2" value={loja} onChange={e=>setLoja(e.target.value)} required>
     <option value="">Selecione a loja</option>{lojas.map(l=><option key={l.codigo} value={l.codigo}>{l.nome||l.codigo} ({l.codigo})</option>)}
    </select></label>
    <label className="text-sm">Nome completo<Input className="mt-1" value={nome} onChange={e=>setNome(e.target.value)} required minLength={2} maxLength={140}/></label>
    <label className="text-sm">Login<Input className="mt-1" value={login} onChange={e=>setLogin(e.target.value)} required minLength={3} maxLength={80} autoComplete="off"/></label>
    <label className="text-sm">Cargo<select className="mt-1 w-full rounded-md border bg-background p-2" value={cargo} onChange={e=>setCargo(e.target.value)}>
     {opcoes.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label className="text-sm">Senha inicial<div className="mt-1 flex gap-2"><Input type={verSenha?'text':'password'} value={senha} onChange={e=>setSenha(e.target.value)} required minLength={8} maxLength={150} autoComplete="new-password"/><Button type="button" variant="outline" title="Mostrar senha" onClick={()=>setVerSenha(v=>!v)}>{verSenha?<EyeOff size={16}/>:<Eye size={16}/>}</Button></div></label>
    <div className="sm:col-span-2 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">A senha é armazenada em hash. Vendedores são vinculados automaticamente ao cadastro de leads.</span><Button disabled={saving||!empresa||!loja} type="submit"><ShieldCheck className="mr-2 h-4 w-4"/>{saving?'Salvando...':'Cadastrar'}</Button></div>
   </form>
  </div>
  <div className="rounded-xl border bg-card p-5 space-y-3">
   <div className="flex items-center justify-between"><h2 className="font-semibold">Contas desta empresa</h2><Button variant="outline" size="sm" onClick={()=>carregar()}><RefreshCcw size={16}/></Button></div>
   {loading&&<p className="text-sm text-muted-foreground">Atualizando...</p>}
   {!usuarios.length&&<p className="text-sm text-muted-foreground">Nenhum usuário nesta empresa.</p>}
   <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Nome / login</th><th className="p-2">Cargo</th><th className="p-2">Loja</th><th className="p-2">Status / ação</th></tr></thead><tbody>{usuarios.map(u=><tr key={u.id} className="border-b border-border/40"><td className="p-2"><b>{u.nome}</b><div className="text-xs text-muted-foreground">{u.login}</div></td><td className="p-2">{u.tipo}</td><td className="p-2">{u.loja||'—'}</td><td className="p-2"><span className={u.ativo?'text-emerald-500':'text-amber-500'}>{u.ativo?'Ativo':'Inativo'}</span>{podeCriarCargo(tipo,u.tipo)&&<Button className="ml-2" size="sm" variant="outline" onClick={()=>alterar(u)}>{u.ativo?'Desativar':'Reativar'}</Button>}</td></tr>)}</tbody></table></div>
  </div>
 </div>;
}
