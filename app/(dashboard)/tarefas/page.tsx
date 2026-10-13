use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

const GRUPOS = [
  { id: 'grupo:vendedores', label: 'Todos os vendedores' },
  { id: 'grupo:guaribas', label: 'Todos os guaribas' },
  { id: 'grupo:mecanicos', label: 'Todos os mecânicos' },
  { id: 'grupo:documentistas', label: 'Todos os documentistas' },
];

export default function TarefasPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pode = ['admin', 'gerente', 'marketing'].includes(user?.tipo || '');
  const [titulo, setTitulo] = useState('');
  const [dest, setDest] = useState('');

  const { data: tarefas = [] } = useQuery({
    queryKey: ['tarefas'],
    queryFn: async () => (await api.get('/tarefas')).data,
  });
  const { data: equipe = [] } = useQuery({
    queryKey: ['equipe-users'],
    queryFn: async () => (await api.get('/usuarios')).data,
    enabled: pode,
  });

  async function criar() {
    try {
      const body: any = { titulo };
      if (dest.startsWith('grupo:')) body.destinatario_tipo = dest.slice(6);
      else body.destinatario_id = Number(dest);
      await api.post('/tarefas', body);
      setTitulo('');
      toast.success('Tarefa criada');
      qc.invalidateQueries({ queryKey: ['tarefas'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold">Tarefas</h1>
      {pode && (
        <Card><CardContent className="py-4 flex gap-2 flex-wrap">
          <Input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="max-w-sm" />
          <select className="bg-background border rounded px-2" value={dest} onChange={(e) => setDest(e.target.value)}>
            <option value="">Quem recebe</option>
            {GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            {(equipe as any[]).map((v) => <option key={v.id} value={v.id}>{v.nome} · {v.tipo}</option>)}
          </select>
          <Button onClick={criar}>Criar</Button>
        </CardContent></Card>
      )}
      {(Array.isArray(tarefas) ? tarefas : []).map((t: any) => (
        <Card key={t.id}><CardContent className="py-3">
          <div className="font-semibold">{t.titulo}</div>
          <div className="text-sm text-muted-foreground">{t.descricao || ''} · para {t.destinatario_nome || t.destinatario_id} · {t.resposta == null ? 'pendente' : String(t.resposta)}</div>
        </CardContent></Card>
      ))}
    </div>
  );
}
