'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const COR: Record<string, string> = {
  bronze: 'text-amber-700',
  prata: 'text-zinc-300',
  ouro: 'text-yellow-400',
  platina: 'text-slate-200',
};

export default function RankingPage() {
  const { data = [] } = useQuery({
    queryKey: ['ranking'],
    queryFn: async () => (await api.get('/ranking')).data,
  });
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-2xl font-bold">Ranking</h1>
      <p className="text-sm text-muted-foreground">Por vendas. Bronze, prata, ouro, platina.</p>
      {(Array.isArray(data) ? data : []).map((v: any, i: number) => (
        <div key={v.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <div>
            <span className="text-muted-foreground">{i + 1}.</span> {v.nome}
            <span className="ml-2 text-xs text-muted-foreground">{v.loja || ''}</span>
          </div>
          <div className="text-right">
            <div className={`text-xs uppercase ${COR[v.rank] || ''}`}>{v.rank}</div>
            <div className="text-sm">{v.vendas} vendas</div>
          </div>
        </div>
      ))}
    </div>
  );
}
