'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';

export default function EquipePage() {
  const { user } = useAuth();
  const isGerente = String(user?.tipo || '').toLowerCase() === 'gerente';
  const [loja, setLoja] = useState<string>(isGerente ? String(user?.loja || '') : '');

  const { data, isLoading, error } = useQuery({
    queryKey: ['equipe', loja],
    queryFn: async () =>
      (await api.get('/equipe', { params: loja ? { loja } : {} })).data,
    refetchInterval: 60_000,
  });

  const lista = Array.isArray(data) ? data : [];
  const lojas = useMemo(() => {
    const s = new Set<string>();
    for (const v of lista) {
      const L = String(v.loja || '').replace('.0', '').trim();
      if (L) s.add(L);
    }
    // se filtrou e lista vazia, ainda mostra opções conhecidas
    if (!s.size && !loja) {
      ['381', '764', 'NINA'].forEach((x) => s.add(x));
    }
    return Array.from(s).sort();
  }, [lista, loja]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Equipe</h1>
          <p className="text-sm text-muted-foreground">
            Ranking do mês. + leads que pegou hoje · − que deixou passar hoje (zera à meia-noite).
            O mês fica no card.
          </p>
        </div>
        {!isGerente && (
          <div className="flex items-center gap-2 text-sm">
            <label className="text-muted-foreground">Loja</label>
            <select
              className="rounded-md border border-border bg-background px-3 py-2"
              value={loja}
              onChange={(e) => setLoja(e.target.value)}
            >
              <option value="">Todas</option>
              {lojas.map((L) => (
                <option key={L} value={L}>
                  {L}
                </option>
              ))}
              {loja && !lojas.includes(loja) && <option value={loja}>{loja}</option>}
            </select>
          </div>
        )}
      </header>
      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {error && <p className="text-rose-400">Não foi possível carregar a equipe.</p>}
      {!isLoading && lista.length === 0 && (
        <p className="text-muted-foreground">Nenhum vendedor ativo{loja ? ` na loja ${loja}` : ''}.</p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {lista.map((v: any, i: number) => (
          <Card key={v.id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 font-semibold">
                  {v.foto_url ? (
                    <img src={v.foto_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                      {String(v.nome || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate">
                    {i + 1}. {v.nome}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm font-bold">
                  <span className="text-emerald-400">+{Number(v.plus_hoje || 0)}</span>
                  <span className="text-rose-400">−{Number(v.minus_hoje || 0)}</span>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                <span>Loja {String(v.loja || '—').replace('.0', '')}</span>
                <span className="font-semibold text-primary">{Number(v.pontos || 0).toFixed(1)} pts</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Mês: Leads {v.leads} · Resp. {v.responderam} · Fichas {v.fichas} · Aprov. {v.aprovados} ·
                Vendas {v.vendas}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Transferências no mês:{' '}
                <span className="text-emerald-400">+{Number(v.plus_mes || 0)}</span>
                {' · '}
                <span className="text-rose-400">−{Number(v.minus_mes || 0)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
