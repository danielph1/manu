'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Megaphone, Search, X } from 'lucide-react';

type Car = {
  id: number;
  marca?: string;
  modelo?: string;
  carro?: string;
  placa?: string;
  ano?: string;
  cor?: string;
  preco?: number | string;
  anunciado?: boolean;
  anuncios_meta?: Record<string, any>;
};

const PLATS = [
  { id: 'mercadolivre', label: 'Mercado Livre' },
  { id: 'olx', label: 'OLX' },
  { id: 'webmotors', label: 'Webmotors' },
  { id: 'napista', label: 'Na Pista' },
  { id: 'icarros', label: 'iCarros' },
  { id: 'chavesnamao', label: 'Chaves na Mão' },
  { id: 'facebook', label: 'Facebook' },
];

export default function AnunciosPage() {
  const { user, isLoading } = useAuth();
  const tipo = String(user?.tipo || '').toLowerCase();
  const ok = ['admin', 'marketing', 'superadmin', 'gerente'].includes(tipo);

  const [lista, setLista] = useState<Car[]>([]);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('todos');
  const [ordem, setOrdem] = useState('recentes');
  const [loading, setLoading] = useState(false);

  const [sel, setSel] = useState<Car | null>(null);
  const [plats, setPlats] = useState<string[]>(['mercadolivre']);
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState('');
  const [titulo, setTitulo] = useState('');
  const [publishing, setPublishing] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/anuncios', {
        params: { busca, status, ordem },
      });
      setLista(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [busca, status, ordem]);

  useEffect(() => {
    if (!isLoading && ok) carregar();
  }, [isLoading, ok, carregar]);

  function abrir(c: Car) {
    setSel(c);
    setPreco(c.preco != null ? String(c.preco) : '');
    setTitulo([c.marca, c.modelo || c.carro, c.ano].filter(Boolean).join(' '));
    setDescricao('');
    setPlats(['mercadolivre']);
  }

  async function publicar() {
    if (!sel) return;
    if (!plats.length) return toast.error('Escolha pelo menos uma plataforma');
    setPublishing(true);
    try {
      const r = await api.post('/anuncios/publicar', {
        estoque_id: sel.id,
        plataformas: plats,
        descricao,
        preco: preco || undefined,
        titulo: titulo || undefined,
      });
      toast.success(r.data.message || 'Publicado');
      if (r.data.avisos?.length) toast.message(r.data.avisos.join(' | '));
      setSel(null);
      await carregar();
    } catch (e: any) {
      const d = e?.response?.data;
      toast.error(d?.message || d?.error || 'Falha ao anunciar');
    } finally {
      setPublishing(false);
    }
  }

  if (isLoading) return <div className="p-6">Carregando…</div>;
  if (!ok) return <div className="p-6 text-muted-foreground">Acesso: marketing, gerente, admin.</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-28">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Anúncios</h1>
          <p className="text-sm text-muted-foreground">
            Publique veículos do estoque nas plataformas conectadas. Marketing chama isso de{' '}
            <strong>anúncio / publicação de estoque</strong>.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm"
            placeholder="Marca, modelo, placa, ano, cor…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && carregar()}
          />
        </div>
        <select
          className="rounded-md border bg-background px-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="todos">Todos</option>
          <option value="anunciado">Anunciados</option>
          <option value="nao_anunciado">Não anunciados</option>
        </select>
        <select
          className="rounded-md border bg-background px-2 text-sm"
          value={ordem}
          onChange={(e) => setOrdem(e.target.value)}
        >
          <option value="recentes">Mais recentes</option>
          <option value="preco_asc">Menor preço</option>
          <option value="preco_desc">Maior preço</option>
          <option value="marca">Marca</option>
        </select>
        <button type="button" onClick={carregar} className="rounded-md border px-3 text-sm">
          Filtrar
        </button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!loading && lista.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum veículo com esses filtros.</p>
      )}

      <div className="grid gap-2">
        {lista.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold truncate">
                  {[c.marca, c.modelo || c.carro].filter(Boolean).join(' ') || 'Sem nome'}
                </span>
                {c.anunciado ? (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">
                    Anunciado
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    Não anunciado
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {[c.ano, c.cor, c.placa, c.preco != null ? `R$ ${c.preco}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => abrir(c)}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Anunciar
            </button>
          </div>
        ))}
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-background p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Anunciar veículo</h2>
              <button type="button" onClick={() => setSel(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {[sel.marca, sel.modelo || sel.carro, sel.placa].filter(Boolean).join(' · ')}
            </p>

            <label className="block text-sm">
              Título
              <input
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Preço (obrigatório)
              <input
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="block text-sm">
              Descrição (opcional)
              <textarea
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm min-h-[100px]"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Se vazio, montamos com dados do estoque"
              />
            </label>

            <div className="text-sm font-medium">Plataformas (mín. 1)</div>
            <div className="flex flex-wrap gap-2">
              {PLATS.map((p) => {
                const on = plats.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setPlats((prev) =>
                        on ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs ${
                      on ? 'border-primary bg-primary/20 text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={publishing || !plats.length}
              onClick={publicar}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {publishing ? 'Publicando…' : 'Publicar agora'}
            </button>
            <p className="text-[11px] text-muted-foreground">
              Mercado Livre publica de fato se o canal estiver conectado. Outras plataformas entram na fila se o
              token da loja existir (API de cada portal em expansão).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
