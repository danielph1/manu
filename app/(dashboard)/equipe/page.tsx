use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

export default function EquipePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['equipe'],
    queryFn: async () => (await api.get('/equipe')).data,
  });
  const lista = Array.isArray(data) ? data : [];
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-3xl font-bold">Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Ranking do mês. Lead 1 · respondeu 0,5 · ficha 0,5 · aprovado 1 · venda 2. Zera no dia 1.
        </p>
      </header>
      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {error && <p className="text-rose-400">Não foi possível carregar a equipe.</p>}
      {!isLoading && lista.length === 0 && <p className="text-muted-foreground">Nenhum vendedor ativo.</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {lista.map((v: any, i: number) => (
          <Card key={v.id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{i + 1}. {v.nome}</div>
                <div className="text-lg font-bold text-primary">{Number(v.pontos || 0).toFixed(1)} pts</div>
              </div>
              <div className="text-sm text-muted-foreground">Loja {String(v.loja || '—').replace('.0', '')}</div>
              <div className="mt-2 text-sm">
                Leads {v.leads} · Resp. {v.responderam} · Fichas {v.fichas} · Aprov. {v.aprovados} · Vendas {v.vendas}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
