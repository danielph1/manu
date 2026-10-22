'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';

export default function OlxPage() {
  const { user, isLoading } = useAuth();
  const isSuper = String(user?.tipo || '').toLowerCase() === 'superadmin';
  const [jsonTxt, setJsonTxt] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: items = [], refetch } = useQuery({
    queryKey: ['olx-anuncios'],
    queryFn: async () => (await api.get('/olx/anuncios')).data,
    enabled: isSuper,
  });

  if (isLoading) return <div className="p-6">Carregando…</div>;
  if (!isSuper) return <div className="p-6">Somente superadmin.</div>;

  async function enviarJson() {
    setBusy(true);
    try {
      const parsed = JSON.parse(jsonTxt);
      const items = Array.isArray(parsed) ? parsed : parsed.data || parsed.items;
      if (!Array.isArray(items)) throw new Error('JSON precisa de array data/items');
      let empresa_id: number | null = null;
      try {
        empresa_id = Number(localStorage.getItem('mkt_empresa_id') || '') || null;
      } catch {
        /* ok */
      }
      const r = await api.post('/olx/anuncios', { items, empresa_id, query: 'manual-json' });
      toast.success(`${r.data.inseridos} inseridos na fila`);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || e?.response?.data?.error || 'JSON inválido');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-28">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold">OLX → fila</h1>
          <p className="text-sm text-muted-foreground">
            Worker Deno/Browserless posta em <code>POST /api/olx/anuncios</code> com secret, ou cole o JSON aqui.
          </p>
        </div>
        <Link href="/marketplace" className="text-sm underline">
          ← Hub
        </Link>
      </div>

      <div className="rounded-xl border border-amber-500/30 p-4 text-sm space-y-2">
        <p>
          O repo{' '}
          <a
            className="underline"
            href="https://github.com/serverlxss/Deno-Supabase-Puppeteer-Browserless-OLX-Scraping"
            target="_blank"
            rel="noreferrer"
          >
            Deno-Supabase-Puppeteer…
          </a>{' '}
          devolve: <strong>name, address, year, km, price, picture, url</strong> —{' '}
          <strong>sem telefone</strong>.
        </p>
        <p className="text-xs text-muted-foreground">
          Env no worker: <code>MARKETPLACE_SCRAPER_SECRET</code> (mesmo do Vercel). Endpoint Browserless à parte.
        </p>
      </div>

      <div className="space-y-2 rounded-2xl border bg-card p-5">
        <label className="text-sm font-medium">Colar JSON do scraper (teste)</label>
        <textarea
          className="min-h-[140px] w-full rounded-md border bg-background p-2 font-mono text-xs"
          value={jsonTxt}
          onChange={(e) => setJsonTxt(e.target.value)}
          placeholder='{"data":[{"name":"Onix 2020","price":"R$ 55.000","url":"https://olx.com.br/..."}]}'
        />
        <button
          type="button"
          disabled={busy}
          onClick={enviarJson}
          className="w-full rounded-lg bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Enviando…' : 'Enviar para a fila (não cria lead)'}
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Últimos OLX na fila ({(items as any[]).length})</h2>
        {(items as any[]).slice(0, 20).map((a) => (
          <div key={a.id} className="rounded-xl border p-3 text-sm">
            <div className="font-medium">{a.titulo}</div>
            <div className="text-xs text-muted-foreground">
              {a.preco} · {a.localizacao} · {a.status}
            </div>
          </div>
        ))}
      </div>

      <Link href="/marketplace/bomba" className="block text-center text-sm text-amber-500 underline">
        Ir para a bomba →
      </Link>
    </div>
  );
}
