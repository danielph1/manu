'use client';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '@/contexts/auth-context';
import {api} from '@/lib/api';
import {Clock3,History,RefreshCw} from 'lucide-react';

type Evento={id:number;usuario_id:number;usuario_nome:string;tipo_usuario:string;empresa_nome:string|null;empresa_id:number|null;
 evento?:string;caminho?:string;recurso?:string;recurso_id?:number;acao?:string;resumo?:string;campos?:string[];detalhes?:Record<string,unknown>;ocorreu_em:string};
export default function Historico(){
 const {user}=useAuth();const role=String(user?.tipo||'').toLowerCase(),superadmin=role==='superadmin';
 const permitido=['superadmin','admin','gerente','marketing'].includes(role);
 const [tipo,setTipo]=useState<'acessos'|'alteracoes'>('acessos'),[empresa,setEmpresa]=useState(''),[dias,setDias]=useState('30'),[pagina,setPagina]=useState(1);
 const empresas=useQuery({queryKey:['historico-empresas'],enabled:superadmin,queryFn:async()=> (await api.get('/integracoes/empresas')).data as Array<{id:number;nome:string}>});
 const eventos=useQuery({queryKey:['historico',user?.id,user?.empresa_id,tipo,empresa,dias,pagina],enabled:permitido,
  queryFn:async()=> (await api.get('/auditoria',{params:{tipo,dias,pagina,empresa_id:superadmin?empresa:undefined}})).data as {eventos:Evento[];pagina:number;limite:number}});
 if(!permitido)return <p className="p-6 text-sm text-muted-foreground">Acesso restrito à gerência, marketing e administração.</p>;
 return <main className="mx-auto max-w-7xl space-y-5 pb-28">
  <header><p className="text-xs font-semibold uppercase tracking-widest text-primary">Segurança e transparência</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold"><History/>Histórico</h1>
  <p className="mt-2 text-sm text-muted-foreground">Acessos ao Aurox e alterações auditadas. Inclui superadmin. Dados separados por empresa; detalhes sensíveis são ocultados.</p></header>
  <section className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
    <div className="flex rounded-xl bg-muted p-1"><button onClick={()=>{setTipo('acessos');setPagina(1)}} className={`rounded-lg px-4 py-2 text-sm ${tipo==='acessos'?'bg-background shadow':''}`}><Clock3 size={15} className="mr-2 inline"/>Acessos</button>
    <button onClick={()=>{setTipo('alteracoes');setPagina(1)}} className={`rounded-lg px-4 py-2 text-sm ${tipo==='alteracoes'?'bg-background shadow':''}`}>Alterações</button></div>
    {superadmin&&<label className="min-w-[195px] text-xs">Empresa<select className="mt-1 block w-full rounded-lg border bg-background p-2 text-sm" value={empresa} onChange={e=>{setEmpresa(e.target.value);setPagina(1)}}>
      <option value="">Todas, inclusive ações globais</option>{(empresas.data||[]).map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>}
    <label className="text-xs">Período<select className="mt-1 block rounded-lg border bg-background p-2 text-sm" value={dias} onChange={e=>{setDias(e.target.value);setPagina(1)}}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">365 dias</option></select></label>
    <button onClick={()=>eventos.refetch()} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw size={16}/>Atualizar</button>
  </section>
  {eventos.isLoading&&<p className="text-sm text-muted-foreground">Buscando registros…</p>}
  {eventos.error&&<p className="text-sm text-red-500">Não foi possível carregar o histórico. Verifique a migration.</p>}
  <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b bg-muted/40"><tr>
   <th className="p-3">Data e hora</th><th className="p-3">Usuário / cargo</th><th className="p-3">Empresa</th><th className="p-3">Acontecimento</th></tr></thead><tbody>
   {(eventos.data?.eventos||[]).map(e=><tr key={e.id} className="border-b last:border-0"><td className="whitespace-nowrap p-3 text-xs">{new Date(e.ocorreu_em).toLocaleString('pt-BR')}</td>
    <td className="p-3"><div className="font-medium">{e.usuario_nome}</div><div className="text-xs text-muted-foreground">{e.tipo_usuario}</div></td>
    <td className="p-3">{e.empresa_nome||'Acesso da plataforma'}</td>
    <td className="p-3">{tipo==='acessos'? <><span className="font-medium">{e.evento==='login'?'Entrou na conta':'Acessou página'}</span>{e.caminho&&<div className="text-xs text-muted-foreground">{e.caminho}</div>}</>
     :<><span className="font-medium">{e.resumo||e.acao}</span><div className="text-xs text-muted-foreground">{e.recurso}{e.recurso_id?` #${e.recurso_id}`:''} · {e.campos?.join(', ')||'Ação registrada'}</div>
     {e.detalhes&&Object.keys(e.detalhes).length>0&&<div className="mt-1 text-xs">{Object.entries(e.detalhes).map(([k,v])=><div key={k}>{k}: {JSON.stringify(v)}</div>)}</div>}</>}</td></tr>)}
   {!eventos.isLoading&&!eventos.data?.eventos?.length&&<tr><td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">Nenhum registro neste período.</td></tr>}
   </tbody></table></div>
  <div className="flex items-center justify-end gap-3"><button className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40" disabled={pagina<=1} onClick={()=>setPagina(p=>Math.max(1,p-1))}>Anterior</button><span className="text-sm">Página {pagina}</span><button className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40" disabled={(eventos.data?.eventos?.length||0)<50} onClick={()=>setPagina(p=>p+1)}>Próxima</button></div>
 </main>;
}
