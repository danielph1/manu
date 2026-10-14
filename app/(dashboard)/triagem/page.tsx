'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';

export default function TriagemPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ['triagem'],
    queryFn: async () => (await api.get('/triagem')).data,
    refetchInterval: 5000,
    enabled: user?.tipo === 'admin',
  });
  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores'],
    queryFn: async () => (await api.get('/equipe')).data,
  });

  if (user?.tipo !== 'admin') return <p className="text-muted-foreground">Somente admin.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Triagem</h1>
      <p className="text-sm text-muted-foreground">
        Leads novos. Se ninguém atribuir em 1 minuto, vai para um vendedor.
      </p>
      {(Array.isArray(data) ? data : []).length === 0 && <p className="text-muted-foreground">Nenhum lead na fila.</p>}
      {(Array.isArray(data) ? data : []).map((t: any) => (
        <Item key={t.id} t={t} vendedores={vendedores} onOk={() => qc.invalidateQueries({ queryKey: ['triagem'] })} />
      ))}
    </div>
  );
}

function Item({ t, vendedores, onOk }: { t: any; vendedores: any; onOk: () => void }) {
  const [vendedor, setVendedor] = useState('');
  const [loja, setLoja] = useState('');
  const lista = Array.isArray(vendedores) ? vendedores : vendedores?.vendedores || [];

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
      {t.mensagem && <div className="text-muted-foreground">{t.mensagem}</div>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Select value={vendedor} onValueChange={setVendedor}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            {lista.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={loja} onValueChange={setLoja}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Loja" /></SelectTrigger>
          <SelectContent>
            {['381', '764', 'NINA'].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={atribuir}>Atribuir</Button>
      </div>
    </div>
  );
}
