'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function MarketplaceHub() {
  const { user, isLoading } = useAuth();
  const isSuper = String(user?.tipo || '').toLowerCase() === 'superadmin';
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [empresaId, setEmpresaId] = useState('');

  useEffect(() => {
    if (!isSuper) return;
    api
      .get('/integracoes/empresas')
      .then((r) => {
        setEmpresas(Array.isArray(r.data) ? r.data : []);
        if (r.data?.[0]?.id) setEmpresaId(String(r.data[0].id));
      })
      .catch(() => {});
  }, [isSuper]);

  useEffect(() => {
    if (empresaId) {
      try {
        localStorage.setItem('mkt_empresa_id', empresaId);
      } catch {
        /* ok */
      }
    }
  }, [empresaId]);

  if (isLoading) return <div className="p-6">Carregando…</div>;
  if (!isSuper) return <div className="p-6 text-muted-foreground">Somente superadmin.</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-28">
      <div>
        <h1 className="text-2xl font-bold">Marketplace</h1>
        <p className="text-sm text-muted-foreground">
          Captura Facebook → revisão → distribuição nuclear para vendedores da empresa.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">1 · Empresa alvo</h2>
        <p className="text-xs text-muted-foreground">
          A bomba só distribui entre vendedores desta empresa (sorteio aleatório).
        </p>
        <select
          className="w-full rounded-md border bg-background p-2"
          value={empresaId}
          onChange={(e) => setEmpresaId(e.target.value)}
        >
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Secret do worker: env <code>MARKETPLACE_SCRAPER_SECRET</code> no Vercel. Webhooks OLX etc. ficam em
          Integrações.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/marketplace/busca" className="rounded-2xl border bg-card p-5 hover:border-primary/50">
          <div className="font-semibold">2 · Personalizar busca</div>
          <p className="mt-1 text-sm text-muted-foreground">País BR/US, cidade, termos de troca</p>
        </Link>
        <Link
          href="/marketplace/bomba"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 hover:border-amber-500/70"
        >
          <div className="font-semibold text-amber-600 dark:text-amber-400">3 · Bomba-relógio</div>
          <p className="mt-1 text-sm text-muted-foreground">Prévia → DISTRIBUIR → desfazer se precisar</p>
        </Link>
      </div>

      <Link href="/marketplace/resultados" className="block text-sm text-primary underline">
        Ver / marcar anúncios →
      </Link>
    </div>
  );
}
