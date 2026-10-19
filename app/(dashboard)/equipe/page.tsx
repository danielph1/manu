'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

export default function EquipePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['equipe'],
    queryFn: async () => (await api.get('/equipe')).data,
    refetchInterval: 60_000,
  });
  const lista = Array.isArray(data) ? data : [];
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-3xl font-bold">Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Ranking do mês. + leads que pegou hoje · − que deixou passar hoje (zera à meia-noite).
          O mês fica no card.
        </p>
      </header>
      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {error && <p className="text-rose-400">Não foi possível carregar a equipe.</p>}
      {!isLoading && lista.length === 0 && <p className="text-muted-foreground">Nenhum vendedor ativo.</p>}
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
                  <span className="truncate">{i + 1}. {v.nome}</span>
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
                Mês: Leads {v.leads} · Resp. {v.responderam} · Fichas {v.fichas} · Aprov. {v.aprovados} · Vendas {v.vendas}
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
