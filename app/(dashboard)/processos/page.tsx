'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

export default function ProcessosPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['processos'],
    queryFn: async () => (await api.get('/processos')).data,
  });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold">Transferências</h1>
      {isLoading && <p>Carregando…</p>}
      {(data as any[]).map((p) => (
        <Card key={p.id}><CardContent className="py-3 text-sm">
          <div className="font-semibold">{p.nome_lead || `Ficha ${p.ficha_id}`} · {p.placa || ''}</div>
          <div className="text-muted-foreground">Status {p.status || '—'} · {p.observacao || ''}</div>
        </CardContent></Card>
      ))}
      {!isLoading && (data as any[]).length === 0 && <p className="text-muted-foreground">Nenhum processo.</p>}
    </div>
  );
}
