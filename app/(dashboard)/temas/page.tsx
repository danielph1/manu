'use client';
import { TEMAS, useTema } from '@/contexts/theme-context';
import { Check, Lock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const REGRA: Record<string, string> = {
  azul: '1 venda no total',
  verde: '1 venda no total',
  rosa: '2 vendas no total',
  preto: '2 vendas no total',
  ambar: '3 vendas no mês',
  vinho: '4 vendas no mês',
};

export default function TemasPage() {
  const { tema, setTema } = useTema();
  const { data } = useQuery({
    queryKey: ['temas-liberados'],
    queryFn: async () => (await api.get('/temas')).data,
  });
  const liberados: string[] = data?.liberados || ['escuro', 'claro'];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Tema</h1>
      <p className="text-sm text-muted-foreground">
        Alguns se liberam com venda. {data ? `${data.total} no total, ${data.mes} neste mês.` : ''}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {TEMAS.map((t) => {
          const ok = liberados.includes(t.id);
          return (
            <button
              key={t.id}
              disabled={!ok}
              onClick={() => ok && setTema(t.id)}
              className={`rounded-xl border p-4 text-left ${tema === t.id ? 'border-primary bg-primary/10' : 'border-border bg-card'} ${!ok ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{t.nome}</span>
                {tema === t.id ? <Check className="h-4 w-4 text-primary" /> : !ok && <Lock className="h-4 w-4" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{ok ? t.desc : REGRA[t.id] || 'bloqueado'}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
