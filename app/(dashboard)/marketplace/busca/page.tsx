'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';

const PAISES = [
  { value: 'BR', label: 'Brasil (BR)' },
  { value: 'US', label: 'Estados Unidos (US)' },
];
const CIDADES_BR = [
  { value: 'rio', label: 'Rio de Janeiro (rio)' },
  { value: 'sao-paulo', label: 'São Paulo (sao-paulo)' },
  { value: 'belo-horizonte', label: 'Belo Horizonte' },
  { value: 'curitiba', label: 'Curitiba' },
  { value: 'porto-alegre', label: 'Porto Alegre' },
  { value: 'brasilia', label: 'Brasília' },
];
const QUERIES = ['aceito troca', 'aberto a troca', 'troca carro', 'aceito veículo na troca', 'carro aceito troca'];

export default function MarketplaceBuscaPage() {
  const { user, isLoading } = useAuth();
  const isSuper = String(user?.tipo || '').toLowerCase() === 'superadmin';
  const qc = useQueryClient();
  const [pais, setPais] = useState('BR');
  const [cidade, setCidade] = useState('rio');
  const [query, setQuery] = useState('aceito troca');
  const [maxPreco, setMaxPreco] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: buscas = [] } = useQuery({
    queryKey: ['mkt-buscas'],
    queryFn: async () => (await api.get('/marketplace')).data,
    enabled: isSuper,
    refetchInterval: 8000,
  });

  if (isLoading) return <div className="p-6">Carregando…</div>;
  if (!isSuper) return <div className="p-6">Somente superadmin.</div>;

  async function gerar() {
    setBusy(true);
    try {
      let empresa_id: number | null = null;
      try {
        empresa_id = Number(localStorage.getItem('mkt_empresa_id') || '') || null;
      } catch {
        /* ok */
      }
      const r = await api.post('/marketplace', {
        query,
        cidade,
        pais,
        max_preco: maxPreco ? Number(maxPreco) : null,
        empresa_id,
      });
      toast.success(`Busca #${r.data.id} na fila. Ainda NÃO é lead.`);
      qc.invalidateQueries({ queryKey: ['mkt-buscas'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-28">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Busca Marketplace</h1>
          <p className="text-sm text-muted-foreground">Confirma → worker guarda anúncios. Lead só na bomba.</p>
        </div>
        <Link href="/marketplace" className="text-sm underline">
          ← Hub
        </Link>
      </div>

      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <label className="block text-sm font-medium">
          País
          <select
            className="mt-1 w-full rounded-md border bg-background p-2"
            value={pais}
            onChange={(e) => {
              setPais(e.target.value);
              if (e.target.value === 'BR') setCidade('rio');
            }}
          >
            {PAISES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            No Facebook a URL usa o <strong>slug da cidade</strong> (ex. <code>rio</code>), não “Brasil”. País
            organiza a busca e o worker.
          </span>
        </label>

        <label className="block text-sm font-medium">
          Cidade (slug URL)
          {pais === 'BR' ? (
            <select
              className="mt-1 w-full rounded-md border bg-background p-2"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            >
              {CIDADES_BR.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="mt-1 w-full rounded-md border bg-background p-2"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="nyc"
            />
          )}
        </label>

        <label className="block text-sm font-medium">
          Termo
          <input
            className="mt-1 w-full rounded-md border bg-background p-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            list="q"
          />
          <datalist id="q">
            {QUERIES.map((q) => (
              <option key={q} value={q} />
            ))}
          </datalist>
        </label>

        <label className="block text-sm font-medium">
          Preço máx. (opcional)
          <input
            className="mt-1 w-full rounded-md border bg-background p-2"
            value={maxPreco}
            onChange={(e) => setMaxPreco(e.target.value)}
            inputMode="numeric"
          />
        </label>

        <div className="rounded-lg bg-muted/50 p-3 text-xs break-all">
          URL típica: facebook.com/marketplace/{cidade}/search?query=
          {encodeURIComponent(query || '…')}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={gerar}
          className="w-full rounded-lg bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Enfileirando…' : 'Confirmar busca (só guarda — não vira lead)'}
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Fila recente</h2>
        {(buscas as any[]).map((b) => (
          <div key={b.id} className="rounded-xl border p-3 text-sm">
            <div className="flex justify-between">
              <span>
                #{b.id} · {b.query}
              </span>
              <span className="text-xs text-muted-foreground">{b.status}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {(b.pais || 'BR') + ' / ' + b.cidade} · {b.total_encontrado || 0} itens
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
