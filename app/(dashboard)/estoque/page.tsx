'use client';
import { CarLoader } from '@/components/car-loader';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Car, Search, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

type Ordem = 'preco_asc' | 'preco_desc' | 'chegada_desc' | 'chegada_asc' | 'marca';

function limpo(v: any) {
  const s = String(v ?? '').trim();
  if (!s || s.toLowerCase() === 'nan' || s === 'null') return '—';
  return s;
}

export default function EstoquePage() {
  const [q, setQ] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('preco_asc');
  const { data: carros = [], isLoading } = useQuery({
    queryKey: ['estoque', q],
    queryFn: async () => (await api.get('/estoque', { params: { busca: q || undefined } })).data,
  });

  const lista = useMemo(() => {
    const arr = [...(carros as any[])];
    const preco = (c: any) => Number(c.preco ?? c.valor ?? 0) || 0;
    const data = (c: any) => new Date(c.created_at || c.data_entrada || 0).getTime() || Number(c.id) || 0;
    arr.sort((a, b) => {
      if (ordem === 'preco_asc') return preco(a) - preco(b);
      if (ordem === 'preco_desc') return preco(b) - preco(a);
      if (ordem === 'chegada_desc') return data(b) - data(a);
      if (ordem === 'chegada_asc') return data(a) - data(b);
      return String(a.marca || '').localeCompare(String(b.marca || ''), 'pt-BR');
    });
    return arr;
  }, [carros, ordem]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">Estoque</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pesquise e ordene do jeito que precisar.</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por modelo, placa, cor..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select
          className="rounded-md border border-border bg-background px-3 text-sm"
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
        >
          <option value="preco_asc">Ordenar: menor preço</option>
          <option value="preco_desc">Ordenar: maior preço</option>
          <option value="chegada_desc">Ordenar: mais recente</option>
          <option value="chegada_asc">Ordenar: mais antigo</option>
          <option value="marca">Ordenar: marca A–Z</option>
        </select>
      </div>

      {isLoading && <CarLoader compact />}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <Card key={c.id} className="transition hover:border-primary/50">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Car className="h-5 w-5 text-primary" />
                  <span>{c.marca} {c.modelo || c.carro}</span>
                </div>
                {c.loja && <Badge variant="secondary">{String(c.loja).replace('.0','')}</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-1 text-sm text-muted-foreground">
                <div>Ano: <span className="text-foreground">{c.ano || c.ano_modelo || '—'}</span></div>
                <div>Cor: <span className="text-foreground">{c.cor || '—'}</span></div>
                <div>KM: <span className="text-foreground">{c.km != null ? Number(c.km).toLocaleString('pt-BR') : '—'}</span></div>
                <div>Placa: <span className="text-foreground font-mono">{c.placa || '—'}</span></div>
                <div className="col-span-2">Pátio: <span className="text-foreground">{limpo(c.patio || c.onde_esta || c.local)}</span></div>
              </div>
              <div className="text-2xl font-bold text-primary">
                R$ {c.preco != null ? Number(c.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!isLoading && lista.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum veículo encontrado.</p>}
    </div>
  );
}
