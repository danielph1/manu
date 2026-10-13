'use client';
import { useQuery } from '@tanstack/react-query';
import { leadsService } from '@/lib/services';
import { useFavoritos } from '@/contexts/favoritos-context';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

export default function FavoritosPage() {
  const fav = useFavoritos();
  const { data: leads = [] } = useQuery({
    queryKey: ['leads-fav'],
    queryFn: () => leadsService.list({ periodo: 'todas', filtro: 'todos' }),
  });
  const lista = (leads as any[]).filter((l) => fav.ids.includes(Number(l.id)));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold">Favoritos</h1>
      <p className="text-sm text-muted-foreground">Leads que você marcou com o coração.</p>
      {lista.length === 0 && <p className="text-muted-foreground">Nenhum favorito ainda.</p>}
      <div className="grid gap-3">
        {lista.map((l: any) => (
          <Link key={l.id} href="/painel">
            <Card><CardContent className="p-4">
              <div className="font-medium">{l.nome_lead}</div>
              <div className="text-sm text-muted-foreground">{l.telefone || 'sem telefone'} · {l.vendedor_nome || ''}</div>
            </CardContent></Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
