'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Megaphone, Search, X, Car } from 'lucide-react';
import { nomeVeiculo } from '@/lib/nome-veiculo';

type LocalidadeML = { id: string; name: string };

type Carro = {
  id: number;
  marca?: string;
  modelo?: string;
  carro?: string;
  placa?: string;
  ano?: string;
  cor?: string;
  preco?: number | string;
  km?: string | number;
  patio?: string;
  carroceria?: string;
  anunciado?: boolean;
  anuncios_meta?: Record<string, any>;
  capa_url?: string | null;
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

const CARROCERIAS = ['todas', 'hatch', 'sedan', 'suv', 'pickup', 'utilitario', 'moto', 'van', 'outro'];

function nomeCarro(c: Carro) {
  return nomeVeiculo(c);
}

function money(v: any) {
  const n = Number(v);
  if (!n && n !== 0) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AnunciosPage() {
  const { user, isLoading } = useAuth();
  const tipo = String(user?.tipo || '').toLowerCase();
  const ok = ['admin', 'marketing', 'superadmin', 'gerente'].includes(tipo);

  const [lista, setLista] = useState<Carro[]>([]);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('todos');
  const [ordem, setOrdem] = useState('recentes');
  const [carroceria, setCarroceria] = useState('todas');
  const [loading, setLoading] = useState(false);

  const [sel, setSel] = useState<Carro | null>(null);
  const [edit, setEdit] = useState<Partial<Carro>>({});
  const [plats, setPlats] = useState<string[]>(['mercadolivre']);
  const [descricao, setDescricao] = useState('');
  // AUROX_ML_V13: dados específicos da publicação da loja.
  const [whatsappContato, setWhatsappContato] = useState('');
  const [estadoMlId, setEstadoMlId] = useState('');
  const [cidadeMlId, setCidadeMlId] = useState('');
  const [estadosMl, setEstadosMl] = useState<LocalidadeML[]>([]);
  const [cidadesMl, setCidadesMl] = useState<LocalidadeML[]>([]);
  const [carregandoEstadosMl, setCarregandoEstadosMl] = useState(false);
  const [carregandoCidadesMl, setCarregandoCidadesMl] = useState(false);
  const [erroLocalidadeMl, setErroLocalidadeMl] = useState('');
  const [recarregarMl, setRecarregarMl] = useState(0);
  const usarMl = plats.includes('mercadolivre');
  const [titulo, setTitulo] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fotos, setFotos] = useState<{ id: number; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  // A UI mostra somente nomes; a API do MANU resolve os IDs oficiais com o token da empresa.
  useEffect(() => {
    if (!sel?.id || !usarMl) return;
    let cancelled = false;
    setCarregandoEstadosMl(true);
    setErroLocalidadeMl('');
    setEstadosMl([]);
    api.get('/anuncios/mercadolivre/localidades', { params: { estoque_id: sel.id } })
      .then((res) => { if (!cancelled) setEstadosMl(res.data.itens || []); })
      .catch((err) => { if (!cancelled) setErroLocalidadeMl(err?.response?.data?.error || 'Falha ao carregar estados.'); })
      .finally(() => { if (!cancelled) setCarregandoEstadosMl(false); });
    return () => { cancelled = true; };
  }, [sel?.id, usarMl, recarregarMl]);

  useEffect(() => {
    if (!sel?.id || !estadoMlId || !usarMl) {
      setCidadesMl([]);
      return;
    }
    let cancelled = false;
    setCarregandoCidadesMl(true);
    setErroLocalidadeMl('');
    setCidadesMl([]);
    api.get('/anuncios/mercadolivre/localidades', {
      params: { estoque_id: sel.id, estado_id: estadoMlId },
    })
      .then((res) => { if (!cancelled) setCidadesMl(res.data.itens || []); })
      .catch((err) => { if (!cancelled) setErroLocalidadeMl(err?.response?.data?.error || 'Falha ao carregar cidades.'); })
      .finally(() => { if (!cancelled) setCarregandoCidadesMl(false); });
    return () => { cancelled = true; };
  }, [sel?.id, estadoMlId, usarMl, recarregarMl]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/anuncios', {
        params: { busca, status, ordem, carroceria },
      });
      setLista(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Falha ao carregar estoque');
    } finally {
      setLoading(false);
    }
  }, [busca, status, ordem, carroceria]);

  useEffect(() => {
    if (!isLoading && ok) carregar();
  }, [isLoading, ok, carregar]);

  async function loadFotos(carroId: number) {
    try {
      const r = await api.get('/estoque/fotos', { params: { carro_id: carroId } });
      setFotos(Array.isArray(r.data) ? r.data : []);
    } catch {
      setFotos([]);
    }
  }

  function abrir(c: Carro) {
    setSel(c);
    loadFotos(c.id);
    setEdit({
      marca: c.marca || '',
      modelo: c.modelo || c.carro || '',
      placa: c.placa || '',
      ano: c.ano != null ? String(c.ano) : '',
      cor: c.cor || '',
      preco: c.preco != null ? String(c.preco) : '',
      km: c.km != null ? String(c.km) : '',
      patio: c.patio || '',
      carroceria: c.carroceria || '',
    });
    setWhatsappContato('');
    setEstadoMlId('');
    setCidadeMlId('');
    setCidadesMl([]);
    setErroLocalidadeMl('');
    setTitulo(nomeCarro(c));
    setDescricao('');
    setPlats(['mercadolivre']);
  }

  async function salvarDados() {
    if (!sel) return;
    setSaving(true);
    try {
      const r = await api.patch('/anuncios', { id: sel.id, ...edit });
      toast.success('Dados atualizados no estoque');
      setSel({ ...sel, ...r.data });
      await carregar();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function publicar() {
    if (!sel) return;
    if (!plats.length) return toast.error('Escolha pelo menos uma plataforma');
    if (usarMl && (!estadoMlId || !cidadeMlId)) {
      return toast.error('Selecione o estado e a cidade da loja para anunciar no Mercado Livre.');
    }
    setPublishing(true);
    try {
      // salva edição antes de publicar (espelho estoque)
      await api.patch('/anuncios', { id: sel.id, ...edit });
      const r = await api.post('/anuncios/publicar', {
        estoque_id: sel.id,
        plataformas: plats,
        descricao,
        preco: edit.preco || undefined,
        titulo: titulo || undefined,
        telefone_whatsapp: whatsappContato,
        cidade_ml_id: cidadeMlId,
      });
      toast.success(r.data.message || 'Publicado');
      if (r.data.links?.length) {
        for (const L of r.data.links) {
          if (L.url) toast.success(`${L.plataforma}: no ar`, { description: L.url, duration: 8000 });
          else toast.success(`${L.plataforma}: id ${L.id}`);
        }
      }
      if (r.data.avisos?.length) toast.message(String(r.data.avisos.join(' | ')), { duration: 6000 });
      if (!r.data.ok && r.data.message) toast.error(r.data.message);
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
    <div className="mx-auto max-w-6xl space-y-4 pb-28">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Anúncios</h1>
          <p className="text-sm text-muted-foreground">
            Mesmo estoque do sistema. Clique no card para editar dados e publicar. Alterações refletem no estoque.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm"
            placeholder="Marca, modelo, placa, ano, cor, carroceria…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && carregar()}
          />
        </div>
        <select className="rounded-md border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="anunciado">Anunciados</option>
          <option value="nao_anunciado">Não anunciados</option>
        </select>
        <select className="rounded-md border bg-background px-2 text-sm" value={carroceria} onChange={(e) => setCarroceria(e.target.value)}>
          {CARROCERIAS.map((c) => (
            <option key={c} value={c}>{c === 'todas' ? 'Carroceria: todas' : c}</option>
          ))}
        </select>
        <select className="rounded-md border bg-background px-2 text-sm" value={ordem} onChange={(e) => setOrdem(e.target.value)}>
          <option value="recentes">Mais recentes</option>
          <option value="preco_asc">Menor preço</option>
          <option value="preco_desc">Maior preço</option>
          <option value="marca">Marca</option>
        </select>
        <button type="button" onClick={carregar} className="rounded-md border px-3 text-sm">Filtrar</button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!loading && lista.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum veículo ativo no estoque com esses filtros.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => abrir(c)}
            className="rounded-2xl border bg-card p-4 text-left hover:border-primary/50 transition"
          >
            <div className="mb-2 overflow-hidden rounded-xl bg-muted aspect-[16/10]">
              <img
                src={c.capa_url || "/veiculo-preparacao.webp"}
                alt=""
                className="h-full w-full object-cover opacity-90"
                loading="lazy"
              />
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Car className="h-4 w-4 shrink-0 text-primary" />
                <span className="font-semibold truncate">{nomeCarro(c)}</span>
              </div>
              {c.anuncios_meta && Object.values(c.anuncios_meta).some((x: any) => x?.permalink) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(c.anuncios_meta).map(([k, v]: any) =>
                    v?.permalink ? (
                      <a key={k} href={v.permalink} target="_blank" rel="noreferrer"
                        className="text-[10px] text-cyan-400 underline" onClick={(e) => e.stopPropagation()}>
                        Ver no {k}
                      </a>
                    ) : null,
                  )}
                </div>
              )}
              {c.anunciado ? (
                <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">
                  Anunciado
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  Não anunciado
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>Ano: {c.ano || '—'}</span>
              <span>Cor: {c.cor || '—'}</span>
              <span>Placa: {c.placa || '—'}</span>
              <span>Carroceria: {c.carroceria || '—'}</span>
              <span>Pátio: {c.patio || '—'}</span>
              <span>KM: {c.km || '—'}</span>
            </div>
            <div className="mt-3 text-lg font-bold text-primary">{money(c.preco)}</div>
          </button>
        ))}
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-background p-5 space-y-3 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Veículo · anunciar</h2>
              <button type="button" onClick={() => setSel(null)}><X className="h-5 w-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {([
                ['marca', 'Marca'],
                ['modelo', 'Modelo'],
                ['placa', 'Placa'],
                ['ano', 'Ano'],
                ['cor', 'Cor'],
                ['preco', 'Preço'],
                ['km', 'KM'],
                ['patio', 'Pátio'],
              ] as const).map(([k, lab]) => (
                <label key={k} className="block text-xs">
                  {lab}
                  <input
                    className="mt-0.5 w-full rounded-md border bg-background p-2 text-sm"
                    value={(edit as any)[k] ?? ''}
                    onChange={(e) => setEdit((x) => ({ ...x, [k]: e.target.value }))}
                  />
                </label>
              ))}
              <label className="block text-xs col-span-2">
                Carroceria
                <select
                  className="mt-0.5 w-full rounded-md border bg-background p-2 text-sm"
                  value={edit.carroceria || ''}
                  onChange={(e) => setEdit((x) => ({ ...x, carroceria: e.target.value }))}
                >
                  <option value="">—</option>
                  {CARROCERIAS.filter((c) => c !== 'todas').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={salvarDados}
              className="w-full rounded-lg border py-2 text-sm"
            >
              {saving ? 'Salvando…' : 'Salvar no estoque'}
            </button>

            <div className="text-sm font-medium">Fotos</div>
            <div className="flex flex-wrap gap-2">
              {fotos.map((f) => (
                <div key={f.id} className="relative h-16 w-20 overflow-hidden rounded-md border">
                  <img src={f.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-0 top-0 bg-black/70 px-1 text-[10px] text-white"
                    onClick={async () => {
                      try {
                        await api.delete('/estoque/fotos', { params: { id: f.id } });
                        await loadFotos(sel!.id);
                        await carregar();
                      } catch {
                        toast.error('Falha ao excluir');
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <label className="flex h-16 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-xs">
                {uploading ? '…' : '+ foto'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !sel) return;
                    setUploading(true);
                    try {
                      const fd = new FormData();
                      fd.append('carro_id', String(sel.id));
                      fd.append('foto', file);
                      await api.post('/estoque/fotos', fd);
                      await loadFotos(sel.id);
                      await carregar();
                      toast.success('Foto ok');
                    } catch {
                      toast.error('Upload falhou');
                    } finally {
                      setUploading(false);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
            </div>

            <hr className="border-border" />

            <label className="block text-sm">
              Título do anúncio
              <input className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </label>
            <label className="block text-sm">
              Descrição (opcional)
              <textarea
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm min-h-[80px]"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-border p-3">
              <label className="block text-xs">WhatsApp da loja (DDD + número)
                <input className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="Ex.: 21999999999" value={whatsappContato}
                  onChange={(e) => setWhatsappContato(e.target.value)} />
              </label>
              {usarMl && (
                <>
                  <label className="block text-xs">Estado da loja
                    <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                      value={estadoMlId} disabled={carregandoEstadosMl || !estadosMl.length}
                      onChange={(e) => {
                        setEstadoMlId(e.target.value);
                        setCidadeMlId('');
                        setCidadesMl([]);
                      }}>
                      <option value="">{carregandoEstadosMl ? 'Carregando estados…' : 'Selecione o estado'}</option>
                      {estadosMl.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs">Cidade da loja
                    <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                      value={cidadeMlId} disabled={!estadoMlId || carregandoCidadesMl || !cidadesMl.length}
                      onChange={(e) => setCidadeMlId(e.target.value)}>
                      <option value="">{carregandoCidadesMl ? 'Carregando cidades…' : 'Selecione a cidade'}</option>
                      {cidadesMl.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  {erroLocalidadeMl && (
                    <div className="sm:col-span-2 flex items-center justify-between gap-2 text-xs text-destructive" role="alert">
                      <span>{erroLocalidadeMl}</span>
                      <button type="button" className="shrink-0 rounded border px-2 py-1"
                        onClick={() => setRecarregarMl((v) => v + 1)}>Tentar novamente</button>
                    </div>
                  )}
                </>
              )}
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                {usarMl ? 'Aurox identifica o código oficial da cidade automaticamente. ' : ''}
                Veículos precisam de marca/modelo reais, foto do carro e pacote Prata (silver)
                na conta da concessionária.
              </p>
            </div>
            <div className="text-sm font-medium">Plataformas (mín. 1)</div>
            <div className="flex flex-wrap gap-2">
              {PLATS.map((p) => {
                const on = plats.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlats((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-primary bg-primary/20 text-primary' : 'text-muted-foreground'}`}
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
              {publishing ? 'Publicando…' : 'Publicar nas plataformas'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
