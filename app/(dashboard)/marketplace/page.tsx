'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import Link from 'next/link';
import { toast } from 'sonner';

export default function MarketplaceHub() {
  const { user, isLoading } = useAuth();
  const isSuper = String(user?.tipo || '').toLowerCase() === 'superadmin';
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function importCsv(file: File, origem: string) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('origem', origem);
      if (empresaId) fd.append('empresa_id', empresaId);
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('manu_token') || sessionStorage.getItem('manu_token') : null;
      // usa fetch direto por multipart
      const base = process.env.NEXT_PUBLIC_APP_URL || '';
      const res = await fetch('/api/marketplace/import-csv', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'falha import');
      toast.success(`${data.inseridos} anúncios na fila (${data.duplicados} duplicados)`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao importar CSV');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-28">
      <div>
        <h1 className="text-2xl font-bold">Oportunidades</h1>
        <p className="text-sm text-muted-foreground">
          Facebook / OLX → fila → revisão → bomba (leads). Scrap NÃO cria lead sozinho.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">1 · Empresa alvo</h2>
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
      </section>

      <section className="space-y-3 rounded-2xl border border-emerald-500/30 bg-card p-5">
        <h2 className="font-semibold">Importar CSV (Facebook ou OLX)</h2>
        <p className="text-xs text-muted-foreground">
          Use o arquivo que você já coletou (<code>oportunidades_facebook_rj.csv</code>). Enche a bomba na hora —
          sem worker. Colunas: titulo, preco, aceita_troca, descricao_resumida, url_anuncio.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importCsv(f, 'facebook');
          }}
          className="block w-full text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Por que a fila estava 0? As buscas só abrem um <strong>pedido</strong>. Quem enche anúncios é o worker ou
          este CSV. Sem um dos dois, a bomba fica vazia.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/marketplace/busca" className="rounded-2xl border bg-card p-5 hover:border-primary/50">
          <div className="font-semibold">Busca Facebook (fila worker)</div>
          <p className="mt-1 text-sm text-muted-foreground">Opcional se você já importa CSV</p>
        </Link>
        <Link href="/marketplace/olx" className="rounded-2xl border bg-card p-5 hover:border-primary/50">
          <div className="font-semibold">OLX</div>
          <p className="mt-1 text-sm text-muted-foreground">Worker Deno/Browserless → mesma bomba</p>
        </Link>
        <Link
          href="/marketplace/bomba"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 sm:col-span-2 hover:border-amber-500/70"
        >
          <div className="font-semibold text-amber-600 dark:text-amber-400">Bomba-relógio</div>
          <p className="mt-1 text-sm text-muted-foreground">Prévia → DISTRIBUIR → desfazer</p>
        </Link>
      </div>

      <div className="rounded-xl border p-4 text-xs text-muted-foreground space-y-2">
        <p>
          <strong>Integrações</strong> (menu lateral) = quando a plataforma <em>envia</em> lead pra você (webhook).
          Não é scraper.
        </p>
        <p>
          <strong>OLX scraper</strong> do GitHub lista anúncio (nome do carro, preço, km, link).{' '}
          <strong>Não traz telefone</strong> na listagem — telefone exige abrir o anúncio e “mostrar telefone”.
        </p>
      </div>
    </div>
  );
}
