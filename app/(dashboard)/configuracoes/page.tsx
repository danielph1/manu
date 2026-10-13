'use client';
import { TEMAS, useTema } from '@/contexts/theme-context';
import { Check } from 'lucide-react';
import { useFavoritos } from '@/contexts/favoritos-context';
import { useQuery } from '@tanstack/react-query';
import { leadsService } from '@/lib/services';
import Link from 'next/link';

export default function ConfiguracoesPage() {
  const { tema, setTema } = useTema();
  const fav = useFavoritos();
  const { data: leads = [] } = useQuery({ queryKey: ['leads-fav'], queryFn: () => leadsService.list({ periodo: 'todas', filtro: 'todos' }) });
  const favoritos = (leads as any[]).filter((l) => fav.ids.includes(Number(l.id)));
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Escolha o tema. Fica salvo neste aparelho.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMAS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTema(t.id)}
            className={`rounded-xl border p-4 text-left transition ${tema === t.id ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.nome}</span>
              {tema === t.id && <Check className="h-4 w-4 text-primary" />}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
          </button>
        ))}
      </div>
      <div>
        <h2 className="text-xl font-semibold">Favoritos</h2>
        <p className="text-sm text-muted-foreground">Leads que você marcou com o coração. Fica salvo neste aparelho.</p>
        <div className="mt-3 space-y-2">
          {favoritos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum favorito ainda.</p>}
          {favoritos.map((l: any) => (
            <Link key={l.id} href="/painel" className="block rounded-lg border border-border bg-card px-3 py-2 text-sm">
              {l.nome_lead} · {l.telefone || 'sem telefone'}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
