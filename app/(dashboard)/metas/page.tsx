'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

export default function MetasPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pode = ['admin', 'gerente'].includes(user?.tipo || '');
  const [titulo, setTitulo] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [alvo, setAlvo] = useState('tipo:vendedor');

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['metas'],
    queryFn: async () => (await api.get('/metas')).data,
  });
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => (await api.get('/usuarios')).data,
    enabled: pode,
  });

  async function criar() {
    try {
      const body: any = { titulo, valor_objetivo: objetivo || null };
      if (alvo.startsWith('tipo:')) body.destinatario_tipo = alvo.slice(5);
      else if (alvo.startsWith('loja:')) body.destinatario_loja = alvo.slice(5);
      else body.destinatario_id = Number(alvo);
      await api.post('/metas', body);
      setTitulo('');
      toast.success('Meta criada');
      qc.invalidateQueries({ queryKey: ['metas'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao criar meta');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold">Metas</h1>
      {pode && (
        <Card><CardContent className="py-4 flex gap-2 flex-wrap">
          <Input placeholder="Título da meta" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="max-w-xs" />
          <Input placeholder="Objetivo" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} className="w-28" />
          <select className="bg-background border rounded px-2" value={alvo} onChange={(e) => setAlvo(e.target.value)}>
            <option value="tipo:vendedor">Grupo: vendedores</option>
            <option value="tipo:guariba">Grupo: guaribas</option>
            <option value="tipo:mecanico">Grupo: mecânicos</option>
            <option value="tipo:documentista">Grupo: documentistas</option>
            <option value="loja:381">Loja 381</option>
            <option value="loja:764">Loja 764</option>
            {(usuarios as any[]).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <Button onClick={criar}>Criar meta</Button>
        </CardContent></Card>
      )}
      {isLoading && <p>Carregando…</p>}
      {error && <p className="text-rose-400">Não foi possível ler as metas.</p>}
      {(Array.isArray(data) ? data : []).map((m: any) => (
        <Card key={m.id}><CardContent className="py-3 flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">{m.titulo}</div>
            <div className="text-sm text-muted-foreground">
              objetivo {m.valor_objetivo ?? '—'} · {m.destinatario_nome || m.destinatario_tipo || m.destinatario_loja || 'todos'}
              {m.concluida ? ' · concluída' : ''}
            </div>
          </div>
          {pode && (
            <Button variant="outline" size="sm" onClick={async () => {
              await api.patch('/metas', { id: m.id, concluida: !m.concluida });
              qc.invalidateQueries({ queryKey: ['metas'] });
            }}>{m.concluida ? 'Reabrir' : 'Concluir'}</Button>
          )}
        </CardContent></Card>
      ))}
    </div>
  );
}
