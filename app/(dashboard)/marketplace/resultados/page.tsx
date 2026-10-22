'use client';
import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';

export default function MarketplaceResultadosPage() {
  const { user, isLoading } = useAuth();
  const isSuper = String(user?.tipo || '').toLowerCase() === 'superadmin';
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState('novo');
  const [sel, setSel] = useState<Record<number, boolean>>({});

  const { data: items = [], isFetching } = useQuery({
    queryKey: ['mkt-anuncios', filtro],
    queryFn: async () => (await api.get(`/marketplace/anuncios?status=${filtro}`)).data,
    enabled: isSuper,
    refetchInterval: 10000,
  });

  const idsSel = useMemo(
    () => Object.entries(sel).filter(([, v]) => v).map(([k]) => Number(k)),
    [sel],
  );

  if (isLoading) return <div className="p-6">Carregando…</div>;
  if (!isSuper) return <div className="p-6 text-muted-foreground">Somente superadmin.</div>;

  async function marcar(status: string) {
    if (!idsSel.length) return toast.error('Selecione anúncios');
    try {
      await api.patch('/marketplace/anuncios/status', { ids: idsSel, status });
      setSel({});
      qc.invalidateQueries({ queryKey: ['mkt-anuncios'] });
      toast.success('Atualizado');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro');
    }
  }

  async function distribuir() {
    if (!idsSel.length) return toast.error('Selecione anúncios');
    if (!confirm(`Distribuir ${idsSel.length} anúncio(s) como lead(s) aleatório(s)?`)) return;
    try {
      const r = await api.post('/marketplace/distribuir', { ids: idsSel });
      toast.success(`${r.data.distribuido} lead(s) criados`);
      setSel({});
      qc.invalidateQueries({ queryKey: ['mkt-anuncios'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao distribuir');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Marketplace · Resultados</h1>
          <p className="text-sm text-muted-foreground">Revise, selecione e só então distribua como lead.</p>
        </div>
        <Link href="/marketplace" className="rounded-lg border px-3 py-2 text-sm">
          ← Buscas
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {['novo', 'selecionado', 'descartado', 'distribuido', 'todos'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFiltro(s)}
            className={`rounded-full border px-3 py-1 text-sm ${filtro === s ? 'border-primary bg-primary/15 text-primary' : ''}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => marcar('selecionado')} className="rounded-md border px-3 py-2 text-sm">
          Marcar selecionado
        </button>
        <button type="button" onClick={() => marcar('descartado')} className="rounded-md border px-3 py-2 text-sm">
          Descartar
        </button>
        <button
          type="button"
          onClick={distribuir}
          className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          Distribuir como lead (aleatório)
        </button>
        {isFetching && <span className="text-xs text-muted-foreground self-center">atualizando…</span>}
      </div>

      <div className="space-y-2">
        {(items as any[]).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum anúncio neste filtro.</p>
        )}
        {(items as any[]).map((a) => (
          <label key={a.id} className="flex gap-3 rounded-xl border p-3 text-sm cursor-pointer hover:border-primary/40">
            <input
              type="checkbox"
              className="mt-1"
              checked={!!sel[a.id]}
              disabled={a.status === 'distribuido'}
              onChange={(e) => setSel((s) => ({ ...s, [a.id]: e.target.checked }))}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap justify-between gap-2">
                <strong className="truncate">{a.titulo || 'Sem título'}</strong>
                <span className="text-xs text-muted-foreground">{a.status}</span>
              </div>
              <div className="text-muted-foreground">
                {a.preco || '—'} · {a.localizacao || '—'}
              </div>
              {a.url && (
                <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline break-all">
                  {a.url}
                </a>
              )}
            </div>
            {a.imagem_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.imagem_url} alt="" className="h-16 w-16 rounded object-cover" />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
