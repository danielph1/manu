'use client';
import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useAuth} from '@/contexts/auth-context';
import {toast} from 'sonner';
import {Trash2,CheckSquare,Square,Plus} from 'lucide-react';
const GRUPOS=[{id:'vendedores',label:'Todos os vendedores'},{id:'guaribas',label:'Todos os guaribas'},{id:'mecanicos',label:'Todos os mecânicos'},{id:'documentistas',label:'Todos os documentistas'}];
export default function TarefasPage(){
 const {user}=useAuth();const qc=useQueryClient();
 const pode=['admin','gerente','marketing','superadmin'].includes(user?.tipo||'');
 const [titulo,setTitulo]=useState('');const[dest,setDest]=useState('');const[selecionados,setSelecionados]=useState<number[]>([]);
 const [selecionando,setSelecionando]=useState(false);const [busy,setBusy]=useState(false);
 const {data:tarefas=[],isLoading,error}=useQuery({queryKey:['tarefas'],queryFn:async()=>(await api.get('/tarefas')).data,refetchInterval:15000});
 const {data:equipe=[]}=useQuery({queryKey:['equipe-users'],queryFn:async()=>(await api.get('/usuarios')).data,enabled:pode});
 const rows=Array.isArray(tarefas)?tarefas:[];
 function toggle(id:number){setSelecionados(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);}
 async function criar(){if(!titulo.trim()||!dest)return toast.error('Informe título e destinatário');setBusy(true);
  try{await api.post('/tarefas',{titulo:titulo.trim(),...(dest.startsWith('grupo:')?{destinatario_tipo:dest.slice(6)}:{destinatario_id:Number(dest)})});
   setTitulo('');toast.success('Tarefa criada');await qc.invalidateQueries({queryKey:['tarefas']});
  }catch(e:any){toast.error(e?.response?.data?.error||'Falha ao criar tarefa');}finally{setBusy(false);}}
 async function excluir(ids:number[]){if(!ids.length||!pode)return;
  if(!confirm(`Excluir ${ids.length} tarefa(s) permanentemente?`))return;setBusy(true);
  try{await api.delete('/tarefas',{data:{ids}});setSelecionados([]);setSelecionando(false);toast.success('Tarefa(s) excluída(s)');await qc.invalidateQueries({queryKey:['tarefas']});}
  catch(e:any){toast.error(e?.response?.data?.error||'Erro ao excluir');}finally{setBusy(false);}}
 return <div className="mx-auto max-w-4xl space-y-4 pb-28">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-3xl font-bold">Tarefas</h1><p className="text-xs text-muted-foreground">Ações disponíveis conforme sua empresa e loja</p></div>
   {pode&&<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setSelecionando(!selecionando);setSelecionados([]);}}>{selecionando?'Cancelar seleção':'Selecionar tarefas'}</Button>
   {selecionando&&<Button variant="outline" onClick={()=>setSelecionados(selecionados.length===rows.length?[]:rows.map((t:any)=>Number(t.id)))}>{selecionados.length===rows.length?'Desmarcar todas':'Selecionar todas'}</Button>}
   {selecionados.length>0&&<Button variant="destructive" disabled={busy} onClick={()=>excluir(selecionados)}><Trash2 className="mr-2 h-4 w-4"/>Excluir ({selecionados.length})</Button>}</div>}
  </div>
  {pode&&<div className="rounded-xl border border-border bg-card p-4 flex gap-2 flex-wrap"><Input placeholder="Título da tarefa" value={titulo} onChange={e=>setTitulo(e.target.value)} className="min-w-[190px] flex-1" maxLength={180}/>
   <select aria-label="Destinatário" className="rounded border border-border bg-background px-3" value={dest} onChange={e=>setDest(e.target.value)}><option value="">Quem recebe?</option>
   {GRUPOS.map(g=><option key={g.id} value={'grupo:'+g.id}>{g.label}</option>)}
   {(Array.isArray(equipe)?equipe:[]).map((v:any)=><option key={v.id} value={String(v.id)}>{v.nome} · {v.tipo}</option>)}</select>
   <Button disabled={busy||!titulo.trim()||!dest} onClick={criar}><Plus className="mr-1 h-4 w-4"/>Criar</Button></div>}
  {isLoading&&<p>Carregando...</p>}{!!error&&<p className="text-rose-400">Não foi possível carregar tarefas. Confira o banco.</p>}
  {rows.map((t:any)=><div key={t.id} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
   {pode&&selecionando&&<button type="button" className="mt-1" onClick={()=>toggle(Number(t.id))} aria-label={'Selecionar '+t.titulo}>{selecionados.includes(Number(t.id))?<CheckSquare className="text-primary"/>:<Square/>}</button>}
   <div className="min-w-0 flex-1"><div className="font-semibold break-words">{t.titulo}</div><p className="text-sm text-muted-foreground">{t.descricao||''} {t.descricao?'· ':''}Para: {t.destinatario_nome||t.destinatario_id} · {t.resposta==null?'Pendente':String(t.resposta)}</p></div>
   {pode&&!selecionando&&<Button size="sm" variant="outline" title="Apagar tarefa" disabled={busy} onClick={()=>excluir([Number(t.id)])}><Trash2 className="h-4 w-4 text-rose-400"/></Button>}
  </div>)}
  {!isLoading&&!rows.length&&<p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada.</p>}
 </div>;
}
