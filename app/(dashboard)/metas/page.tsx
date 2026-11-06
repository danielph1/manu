'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/i18n-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckSquare, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Meta = { id:number; titulo:string; valor_objetivo:number|null; destinatario_nome?:string|null;
  destinatario_tipo?:string|null; destinatario_loja?:string|null; concluida?:boolean };
type Empresa = {id:number;nome:string};
type Loja = {codigo:string;nome:string};
type Usuario = {id:number;nome:string;tipo:string};

export default function MetasPage() {
  const {user} = useAuth();
  const {t} = useI18n();
  const qc = useQueryClient();
  const pode = ['admin','gerente','superadmin'].includes(String(user?.tipo||''));
  const superadmin = String(user?.tipo||'')==='superadmin';
  const [empresa,setEmpresa] = useState('');
  const [titulo,setTitulo] = useState('');
  const [objetivo,setObjetivo] = useState('');
  const [alvo,setAlvo] = useState('tipo:vendedor');
  const [selecionando,setSelecionando] = useState(false);
  const [selecionados,setSelecionados] = useState<number[]>([]);
  const [busy,setBusy] = useState(false);

  const {data=[],isLoading,error} = useQuery<Meta[]>({queryKey:['metas'],queryFn:async()=>(await api.get('/metas')).data,
    refetchInterval:30000,refetchOnWindowFocus:true});
  const metas = Array.isArray(data) ? data : [];
  const {data:empresas=[]} = useQuery<Empresa[]>({queryKey:['metas-empresas'],
    queryFn:async()=>(await api.get('/integracoes/empresas')).data,enabled:pode&&superadmin});
  const {data:usuarios=[]} = useQuery<Usuario[]>({queryKey:['metas-usuarios',empresa,superadmin],
    queryFn:async()=> superadmin
      ? (await api.get('/gestao-usuarios',{params:{empresa_id:Number(empresa)}})).data?.usuarios||[]
      : (await api.get('/usuarios')).data,
    enabled:pode&&(!superadmin||!!empresa)});
  const {data:lojas=[]} = useQuery<Loja[]>({queryKey:['metas-lojas',empresa,superadmin],
    queryFn:async()=>(await api.get('/lojas-opcoes',superadmin?{params:{empresa_id:Number(empresa)}}:{})).data,
    enabled:pode&&(!superadmin||!!empresa)});

  function toggle(id:number){setSelecionados(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);}
  async function criar() {
    if(!titulo.trim()||!alvo||superadmin&&!empresa)return toast.error(t('metas.fill'));
    setBusy(true);
    try {
      const body: Record<string,unknown> = {titulo:titulo.trim(),valor_objetivo:objetivo||null};
      if(superadmin)body.empresa_id=Number(empresa);
      if(alvo.startsWith('tipo:'))body.destinatario_tipo=alvo.slice(5);
      else if(alvo.startsWith('loja:'))body.destinatario_loja=alvo.slice(5);
      else body.destinatario_id=Number(alvo);
      await api.post('/metas',body);setTitulo('');setObjetivo('');
      toast.success(t('metas.created'));await qc.invalidateQueries({queryKey:['metas']});
    }catch(e:any){toast.error(e?.response?.data?.error||t('metas.create_error'));}finally{setBusy(false);}
  }
  async function alterar(ids:number[],concluida:boolean){
    if(!ids.length)return;setBusy(true);
    try{await api.patch('/metas',{ids,concluida});setSelecionados([]);setSelecionando(false);
      toast.success(t('metas.updated'));await qc.invalidateQueries({queryKey:['metas']});}
    catch(e:any){toast.error(e?.response?.data?.error||t('metas.update_error'));}finally{setBusy(false);}
  }
  async function excluir(ids:number[]){
    if(!ids.length||!confirm(`${t('metas.confirm_delete')} (${ids.length})`))return;
    setBusy(true);
    try{await api.delete('/metas',{data:{ids}});setSelecionados([]);setSelecionando(false);
      toast.success(t('metas.deleted'));await qc.invalidateQueries({queryKey:['metas']});}
    catch(e:any){toast.error(e?.response?.data?.error||t('metas.delete_error'));}finally{setBusy(false);}
  }
  const todos=metas.length>0 && selecionados.length===metas.length;
  return <div className="mx-auto max-w-4xl space-y-4 pb-28">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-3xl font-bold">{t('page.metas.title')}</h1>
      {pode&&<div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={()=>{setSelecionando(v=>!v);setSelecionados([]);}}>{selecionando?t('common.cancel_selection'):t('metas.select')}</Button>
        {selecionando&&<Button variant="outline" onClick={()=>setSelecionados(todos?[]:metas.map(m=>m.id))}>{todos?t('common.deselect_all'):t('common.select_all')}</Button>}
        {selecionados.length>0&&<>
          <Button variant="outline" disabled={busy} onClick={()=>alterar(selecionados,true)}>{t('metas.complete_selected')} ({selecionados.length})</Button>
          <Button variant="outline" disabled={busy} onClick={()=>alterar(selecionados,false)}>{t('metas.reopen_selected')}</Button>
          <Button variant="destructive" disabled={busy} onClick={()=>excluir(selecionados)}><Trash2 className="mr-1 h-4 w-4"/>{t('common.delete')} ({selecionados.length})</Button>
        </>}
      </div>}
    </div>
    {pode&&<Card><CardContent className="flex flex-wrap gap-2 py-4">
      {superadmin&&<select aria-label={t('metas.company')} className="min-w-[160px] rounded border bg-background px-2" value={empresa}
        onChange={e=>{setEmpresa(e.target.value);setAlvo('tipo:vendedor');}}>
        <option value="">{t('metas.select_company')}</option>
        {empresas.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
      </select>}
      <Input placeholder={t('metas.title_placeholder')} maxLength={180} value={titulo} onChange={e=>setTitulo(e.target.value)} className="min-w-[180px] flex-1"/>
      <Input placeholder={t('metas.objective')} inputMode="decimal" value={objetivo} onChange={e=>setObjetivo(e.target.value)} className="w-28"/>
      <select aria-label={t('metas.recipient')} className="min-w-[170px] rounded border bg-background px-2" value={alvo} onChange={e=>setAlvo(e.target.value)}>
        <option value="tipo:vendedor">{t('metas.sellers')}</option>
        <option value="tipo:guariba">{t('metas.guards')}</option>
        <option value="tipo:mecanico">{t('metas.mechanics')}</option>
        <option value="tipo:documentista">{t('metas.documental')}</option>
        {lojas.map(l=><option key={l.codigo} value={'loja:'+l.codigo}>{t('metas.store')} {l.nome||l.codigo}</option>)}
        {usuarios.map(v=><option key={v.id} value={String(v.id)}>{v.nome} · {v.tipo}</option>)}
      </select>
      <Button disabled={busy||!titulo.trim()||(superadmin&&!empresa)} onClick={criar}>{t('metas.create')}</Button>
    </CardContent></Card>}
    {isLoading&&<p>{t('common.loading')}</p>}
    {!!error&&<p className="text-rose-400">{t('metas.load_error')}</p>}
    {metas.map(m=><Card key={m.id}><CardContent className="flex items-center gap-3 py-3">
      {pode&&selecionando&&<button type="button" aria-label={`${t('metas.select')} ${m.titulo}`} onClick={()=>toggle(m.id)}>
        {selecionados.includes(m.id)?<CheckSquare className="text-primary"/>:<Square/>}
      </button>}
      <div className="min-w-0 flex-1"><div className="break-words font-semibold">{m.titulo}</div>
        <p className="text-sm text-muted-foreground">{t('metas.objective')} {m.valor_objetivo??'—'} · {m.destinatario_nome||m.destinatario_tipo||m.destinatario_loja||t('metas.all')}
          {m.concluida?` · ${t('metas.completed')}`:''}</p></div>
      {pode&&!selecionando&&<div className="flex flex-wrap gap-1">
        <Button disabled={busy} size="sm" variant="outline" onClick={()=>alterar([m.id],!m.concluida)}>{m.concluida?t('metas.reopen'):t('metas.complete')}</Button>
        <Button disabled={busy} size="sm" variant="outline" onClick={()=>excluir([m.id])}>{t('common.delete')}</Button>
      </div>}
    </CardContent></Card>)}
    {!isLoading&&!metas.length&&<p className="text-sm text-muted-foreground">{t('metas.empty')}</p>}
  </div>;
}
