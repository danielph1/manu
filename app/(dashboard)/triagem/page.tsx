'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';

export default function TriagemPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ['triagem'],
    queryFn: async () => (await api.get('/triagem')).data,
    refetchInterval: 3000,
    enabled: (['admin','superadmin','marketing','gerente'].includes(String(user?.tipo || ''))),
  });
  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores'],
    queryFn: async () => (await api.get('/equipe')).data,
  });

  if (!['admin','superadmin','marketing','gerente'].includes(String(user?.tipo || ''))) return <p className="text-muted-foreground">Acesso restrito.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Triagem</h1>
      <p className="text-sm text-muted-foreground">
        Leads novos. Mensagens do Aurox-WhatsApp ficam até 10 minutos na fila antes da atribuição automática; outros canais seguem o prazo de 1 minuto.
      </p>
      {(Array.isArray(data) ? data : []).length === 0 && <p className="text-muted-foreground">Nenhum lead na fila.</p>}
      {(Array.isArray(data) ? data : []).map((t: any) => (
        <Item key={t.id} t={t} vendedores={vendedores} onOk={() => qc.invalidateQueries({ queryKey: ['triagem'] })} />
      ))}
    </div>
  );
}

function MidiaWhatsApp({ id }: { id: number }) {
  const [url,setUrl]=useState('');
  const [mime,setMime]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try {
        const r=await api.get(`/triagem/media/${id}`);
        if(active){setUrl(String(r.data.url||''));setMime(String(r.data.mime||''));setError('');}
      }catch {if(active){setError('Não foi possível carregar a mídia');setUrl('');}}
    };
    void load();
    const refresh=setInterval(()=>void load(),90_000);
    return ()=>{active=false;clearInterval(refresh);};
  },[id]);
  if(error)return <p className="text-xs text-amber-500">{error}</p>;
  if(!url)return <p className="text-xs text-muted-foreground">Carregando foto/áudio…</p>;
  if(mime.startsWith('image/'))return <img src={url} alt="Foto enviada pelo contato do WhatsApp" loading="lazy"
    className="max-h-72 w-auto max-w-full rounded-lg border object-contain"/>;
  if(mime.startsWith('audio/'))return <audio controls preload="none" src={url}
    aria-label="Áudio enviado pelo contato do WhatsApp" className="w-full max-w-md"/>;
  return null;
}

function Item({ t, vendedores, onOk }: { t: any; vendedores: any; onOk: () => void }) {
  const [vendedor, setVendedor] = useState('');
  const [loja, setLoja] = useState('');
  const todos = Array.isArray(vendedores) ? vendedores : vendedores?.vendedores || [];
  const lista = loja ? todos.filter((v: any) => String(v.loja || '').toUpperCase() === loja.toUpperCase()) : todos;

  async function atribuir() {
    await api.post('/triagem', { id: t.id, vendedor_id: vendedor || undefined, loja: loja || undefined });
    onOk();
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{t.nome}</span>
        <span className="rounded bg-primary/15 px-2 text-xs uppercase">{t.origem}</span>
      </div>
      <div className="text-muted-foreground">{t.telefone || 'sem telefone'} · {t.email || 'sem e-mail'}</div>
      <div>Interesse: {t.interesse || '—'}</div>
      {t.mensagem && <div className="whitespace-pre-wrap break-words text-muted-foreground">{t.mensagem}</div>}
      {t.media_id && <MidiaWhatsApp id={Number(t.media_id)}/>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Select value={vendedor} onValueChange={setVendedor}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            {lista.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={loja} onValueChange={(v) => { setLoja(v === 'todos' ? '' : v); setVendedor(''); }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Loja" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {['381', '764', 'NINA'].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={atribuir}>Atribuir</Button>
      </div>
    </div>
  );
}
