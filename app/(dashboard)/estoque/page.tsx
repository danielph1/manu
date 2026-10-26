'use client';
import { nomeVeiculo } from '@/lib/nome-veiculo';
import { CarLoader } from '@/components/car-loader';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Car,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Upload,
  ImageIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { CARROCERIAS, matchCarroceria } from '@/lib/carroceria';
import { compressGallery } from '@/lib/compress-image';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/i18n-context';

type Ordem = 'preco_asc' | 'preco_desc' | 'chegada_desc' | 'chegada_asc' | 'marca';

function limpo(v: any) {
  const s = String(v ?? '').trim();
  if (!s || s.toLowerCase() === 'nan' || s === 'null' || s === 'undefined') return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return '—';
  return s;
}

function tituloVeiculo(c: any) {
  const marca = limpo(c.marca);
  const carro = limpo(c.carro);
  const modelo = limpo(c.modelo);
  const parts: string[] = [];
  if (marca !== '—') parts.push(marca);
  if (carro !== '—' && carro.toUpperCase() !== marca.toUpperCase()) parts.push(carro);
  if (
    modelo !== '—' &&
    modelo.toUpperCase() !== carro.toUpperCase() &&
    modelo.toUpperCase() !== marca.toUpperCase()
  ) {
    parts.push(modelo);
  }
  return parts.length ? parts.join(' ') : '—';
}

function podeEditarFotos(tipo?: string) {
  const t = String(tipo || '').toLowerCase();
  return ['admin', 'gerente', 'marketing', 'superadmin'].includes(t);
}

function FotoViewer({
  fotos,
  idx,
  onIdx,
  canEdit,
  onDelete,
}: {
  fotos: { id: number; url: string }[];
  idx: number;
  onIdx: (n: number) => void;
  canEdit: boolean;
  onDelete: (id: number) => void;
}) {
  const { t } = useI18n();
  if (!fotos.length) {
    return (
      <div className="overflow-hidden rounded-xl bg-muted aspect-video">
        <img src="/veiculo-preparacao.webp" alt="Veículo em preparação" className="h-full w-full object-cover" />
      </div>
    );
  }
  const f = fotos[idx];
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-black/40">
        <img
          key={f.id}
          src={f.url}
          alt={`Foto ${idx + 1}`}
          className="mx-auto max-h-[360px] w-full object-contain"
          loading="lazy"
          decoding="async"
        />
        {fotos.length > 1 && (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white"
              onClick={() => onIdx((idx - 1 + fotos.length) % fotos.length)}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white"
              onClick={() => onIdx((idx + 1) % fotos.length)}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        {canEdit && (
          <button
            type="button"
            className="absolute right-2 top-2 rounded-full bg-red-600/90 p-2 text-white"
            title="Excluir foto"
            onClick={() => onDelete(f.id)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>
          {idx + 1} / {fotos.length}
        </span>
        <div className="flex gap-1">
          {fotos.map((x, i) => (
            <button
              key={x.id}
              type="button"
              aria-label={`Foto ${i + 1}`}
              className={`h-2 w-2 rounded-full ${i === idx ? 'bg-primary' : 'bg-muted-foreground/40'}`}
              onClick={() => onIdx(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EstoquePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('preco_asc');
  const [carroceria, setCarroceria] = useState('todas');
  const [sel, setSel] = useState<any | null>(null);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [uploading, setUploading] = useState(false);

  const canEdit = podeEditarFotos(user?.tipo as string | undefined);

  const { data: carrosRaw = [], isLoading } = useQuery({
    queryKey: ['estoque', q],
    queryFn: async () => {
      try {
        const r = await api.get('/estoque', { params: { busca: q || undefined } });
        return Array.isArray(r.data) ? r.data : [];
      } catch {
        return [];
      }
    },
  });
  const carros = Array.isArray(carrosRaw) ? carrosRaw : [];

  const { data: fotosRaw = [], isFetching: loadingFotos } = useQuery({
    queryKey: ['estoque-fotos', sel?.id],
    enabled: !!sel?.id,
    queryFn: async () => {
      try {
        const r = await api.get('/estoque/fotos', { params: { carro_id: sel.id } });
        return Array.isArray(r.data) ? r.data : [];
      } catch {
        return [];
      }
    },
  });
  const fotos = Array.isArray(fotosRaw) ? fotosRaw : [];

  const lista = useMemo(() => {
    let arr = [...(carros as any[])].filter((c) => matchCarroceria(c, carroceria));
    const preco = (c: any) => Number(c.preco ?? c.valor ?? 0) || 0;
    const data = (c: any) =>
      new Date(c.created_at || c.data_entrada || 0).getTime() || Number(c.id) || 0;
    arr.sort((a, b) => {
      if (ordem === 'preco_asc') return preco(a) - preco(b);
      if (ordem === 'preco_desc') return preco(b) - preco(a);
      if (ordem === 'chegada_desc') return data(b) - data(a);
      if (ordem === 'chegada_asc') return data(a) - data(b);
      return tituloVeiculo(a).localeCompare(tituloVeiculo(b), 'pt-BR');
    });
    return arr;
  }, [carros, ordem, carroceria]);

  async function uploadFotos(files: FileList | null) {
    if (!files?.length || !sel?.id) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name}: só imagens`);
          continue;
        }
        const compressed = await compressGallery(file);
        const fd = new FormData();
        fd.append('carro_id', String(sel.id));
        fd.append('foto', compressed);
        await api.post('/estoque/fotos', fd);
      }
      toast.success('Foto(s) enviada(s)');
      await qc.invalidateQueries({ queryKey: ['estoque-fotos', sel.id] });
      setFotoIdx(0);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro no upload');
    } finally {
      setUploading(false);
    }
  }

  async function deleteFoto(id: number) {
    if (!confirm('Excluir esta foto?')) return;
    try {
      await api.delete('/estoque/fotos', { params: { id } });
      toast.success('Foto removida');
      await qc.invalidateQueries({ queryKey: ['estoque-fotos', sel?.id] });
      setFotoIdx(0);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao excluir');
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">{t('page.estoque.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('page.estoque.sub')}
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('page.estoque.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="rounded-md border border-border bg-background px-3 text-sm"
          value={carroceria}
          onChange={(e) => setCarroceria(e.target.value)}
        >
          <option value="todas">Carroceria: todas</option>
          {CARROCERIAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-border bg-background px-3 text-sm"
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
        >
          <option value="preco_asc">Ordenar: menor preço</option>
          <option value="preco_desc">Ordenar: maior preço</option>
          <option value="chegada_desc">Ordenar: mais recente</option>
          <option value="chegada_asc">Ordenar: mais antigo</option>
          <option value="marca">Ordenar: marca A–Z</option>
        </select>
      </div>

      {isLoading && <CarLoader compact />}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <Card
            key={c.id}
            className="cursor-pointer transition hover:border-primary/50"
            onClick={() => {
              setSel(c);
              setFotoIdx(0);
            }}
          >
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Car className="h-5 w-5 text-primary" />
                  <span>{tituloVeiculo(c)}</span>
                </div>
                {c.loja && (
                  <Badge variant="secondary">{String(c.loja).replace('.0', '')}</Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1 text-sm text-muted-foreground">
                <div>
                  {t('common.year')}: <span className="text-foreground">{c.ano || c.ano_modelo || '—'}</span>
                </div>
                <div>
                  {t('common.color')}: <span className="text-foreground">{c.cor || '—'}</span>
                </div>
                <div>
                  {t('common.km')}:{' '}
                  <span className="text-foreground">
                    {c.km != null ? Number(c.km).toLocaleString('pt-BR') : '—'}
                  </span>
                </div>
                <div>
                  {t('common.plate')}: <span className="text-foreground font-mono">{c.placa || '—'}</span>
                </div>
                <div className="col-span-2">
                  {t('common.yard')}:{' '}
                  <span className="text-foreground">
                    {limpo(c.patio || c.onde_esta || c.local)}
                  </span>
                </div>
              </div>
              <div className="text-2xl font-bold text-primary">
                R${' '}
                {c.preco != null
                  ? Number(c.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                  : '—'}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!isLoading && lista.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">{t('page.estoque.empty')}</p>
      )}

      {sel && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setSel(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-background p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{tituloVeiculo(sel)}</h2>
                <p className="text-sm text-muted-foreground font-mono">{sel.placa || '—'}</p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 hover:bg-muted"
                onClick={() => setSel(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingFotos ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                Carregando fotos…
              </div>
            ) : (
              <FotoViewer
                fotos={fotos}
                idx={Math.min(fotoIdx, Math.max(0, fotos.length - 1))}
                onIdx={setFotoIdx}
                canEdit={canEdit}
                onDelete={deleteFoto}
              />
            )}

            {canEdit && (
              <div className="mt-3">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm hover:bg-muted/40">
                  <Upload className="h-4 w-4" />
                  {uploading ? t('common.loading') : t('page.estoque.add_photos')}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      void uploadFotos(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                <p className="mt-1 text-center text-[11px] text-muted-foreground">
                  {t('page.estoque.compress_hint')}
                </p>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div>
                {t('common.year')}: <strong>{sel.ano || sel.ano_modelo || '—'}</strong>
              </div>
              <div>
                {t('common.color')}: <strong>{sel.cor || '—'}</strong>
              </div>
              <div>
                {t('common.km')}:{' '}
                <strong>
                  {sel.km != null ? Number(sel.km).toLocaleString('pt-BR') : '—'}
                </strong>
              </div>
              <div>
                Combustível: <strong>{sel.combustivel || '—'}</strong>
              </div>
              <div className="col-span-2">
                {t('common.yard')}: <strong>{limpo(sel.patio || sel.onde_esta || sel.local)}</strong>
              </div>
              <div className="col-span-2 text-lg font-bold text-primary">
                R${' '}
                {sel.preco != null
                  ? Number(sel.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                  : '—'}
              </div>
            </div>

            <Button variant="outline" className="mt-4 w-full" onClick={() => setSel(null)}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
