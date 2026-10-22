'use client';
import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';

export default function MarketplaceBombaPage() {
  const { user, isLoading } = useAuth();
  const isSuper = String(user?.tipo || '').toLowerCase() === 'superadmin';
  const qc = useQueryClient();
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [confirmTxt, setConfirmTxt] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [ultimoLote, setUltimoLote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ['mkt-bomba'],
    queryFn: async () => (await api.get('/marketplace/anuncios?status=todos')).data,
    enabled: isSuper,
    refetchInterval: 10000,
  });

  const elegiveis = useMemo(
    () => (items as any[]).filter((a) => a.status === 'novo' || a.status === 'selecionado'),
    [items],
  );
  const idsSel = useMemo(
    () => Object.entries(sel).filter(([, v]) => v).map(([k]) => Number(k)),
    [sel],
  );
  const idsAlvo = idsSel.length ? idsSel : elegiveis.map((a) => a.id);

  if (isLoading) return <div className="p-6">Carregando…</div>;
  if (!isSuper) return <div className="p-6">Somente superadmin.</div>;

  async function fazerPreview() {
    setBusy(true);
    setPreview(null);
    try {
      let empresa_id: number | null = null;
      try {
        empresa_id = Number(localStorage.getItem('mkt_empresa_id') || '') || null;
      } catch {
        /* ok */
      }
      const r = await api.post('/marketplace/preview-distribuir', {
        ids: idsAlvo,
        modo: 'ids',
        empresa_id,
      });
      setPreview(r.data);
      if (!r.data.ok) toast.error(r.data.aviso || 'Prévia bloqueada');
      else toast.message('Prévia OK — ainda não distribuiu');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro na prévia');
    } finally {
      setBusy(false);
    }
  }

  async function nuclear() {
    if (confirmTxt !== 'DISTRIBUIR') {
      toast.error('Digite exatamente DISTRIBUIR');
      return;
    }
    if (!preview?.ok || !preview.ids?.length) {
      toast.error('Rode a prévia primeiro');
      return;
    }
    if (preview.vendedores < 1) {
      toast.error('Sem vendedores — abortado');
      return;
    }
    setBusy(true);
    try {
      const r = await api.post('/marketplace/distribuir', {
        ids: preview.ids,
        empresa_id: preview.empresa_id,
        confirmacao: 'DISTRIBUIR',
      });
      if (!r.data.ok) {
        toast.error(r.data.error || 'Falhou — nada commitado');
        return;
      }
      setUltimoLote(r.data.batch_id);
      toast.success(`${r.data.distribuido} lead(s). Lote ${r.data.batch_id}`);
      setConfirmTxt('');
      setPreview(null);
      setSel({});
      qc.invalidateQueries({ queryKey: ['mkt-bomba'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro — rollback se falhou na transação');
    } finally {
      setBusy(false);
    }
  }

  async function desfazer() {
    if (!ultimoLote) return toast.error('Sem lote nesta sessão');
    if (!confirm('Desfazer lote? Apaga leads criados e devolve anúncios.')) return;
    setBusy(true);
    try {
      const r = await api.post('/marketplace/desfazer', {
        batch_id: ultimoLote,
        confirmacao: 'DESFAZER',
      });
      toast.success(`Desfeito: ${r.data.leads_apagados} leads`);
      setUltimoLote(null);
      qc.invalidateQueries({ queryKey: ['mkt-bomba'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao desfazer');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-28">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-amber-600 dark:text-amber-400">Bomba-relógio</h1>
          <p className="text-sm text-muted-foreground">
            1) Prévia → 2) digite DISTRIBUIR → 3) dispara. Dá para desfazer o lote.
          </p>
        </div>
        <Link href="/marketplace" className="text-sm underline">
          ← Hub
        </Link>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm space-y-2">
        <p>
          <strong>Garantias:</strong> exige a palavra <code>DISTRIBUIR</code>; roda em{' '}
          <strong>transação</strong> (erro = rollback, zero lead daquele clique); grava{' '}
          <code>batch_id</code> para <strong>desfazer</strong>.
        </p>
        <p className="text-xs text-muted-foreground">
          Sem prévia OK ou sem vendedores, o botão não executa de verdade.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !idsAlvo.length}
          onClick={fazerPreview}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
        >
          1 · Prévia ({idsSel.length ? idsSel.length : elegiveis.length} anúncios)
        </button>
        <button
          type="button"
          onClick={() => {
            const n: Record<number, boolean> = {};
            elegiveis.forEach((a) => (n[a.id] = true));
            setSel(n);
          }}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Selecionar todos elegíveis
        </button>
      </div>

      {preview && (
        <div
          className={`rounded-xl border p-4 text-sm ${preview.ok ? 'border-emerald-500/40' : 'border-destructive/40'}`}
        >
          <p className="font-medium">{preview.frase || preview.aviso}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Anúncios: {preview.anuncios} · Vendedores: {preview.vendedores} · Empresa:{' '}
            {preview.empresa_nome || preview.empresa_id || '—'}
          </p>
          {preview.vendedores_lista?.length > 0 && (
            <p className="text-xs mt-2 text-muted-foreground">
              Pool: {preview.vendedores_lista.map((v: any) => v.nome).join(', ')}
              {preview.vendedores > 50 ? '…' : ''}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-2xl border border-red-500/30 bg-card p-5">
        <label className="block text-sm font-semibold">
          Digite exatamente <code>DISTRIBUIR</code>
          <input
            className="mt-1 w-full rounded-md border bg-background p-2 font-mono"
            value={confirmTxt}
            onChange={(e) => setConfirmTxt(e.target.value)}
            placeholder="DISTRIBUIR"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          disabled={busy || confirmTxt !== 'DISTRIBUIR' || !preview?.ok}
          onClick={nuclear}
          className="w-full rounded-lg bg-red-600 py-3 font-bold text-white disabled:opacity-40"
        >
          {busy ? 'Executando…' : 'DISPARAR — criar leads agora'}
        </button>
        {ultimoLote && (
          <button type="button" disabled={busy} onClick={desfazer} className="w-full rounded-lg border py-2 text-sm">
            Desfazer último lote ({ultimoLote.slice(0, 8)}…)
          </button>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Anúncios elegíveis</h2>
        {elegiveis.length === 0 && (
          <p className="text-sm text-muted-foreground">Nada na fila. Rode busca + worker antes.</p>
        )}
        {elegiveis.map((a) => (
          <label key={a.id} className="flex gap-3 rounded-xl border p-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!sel[a.id]}
              onChange={(e) => setSel((s) => ({ ...s, [a.id]: e.target.checked }))}
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{a.titulo || '—'}</div>
              <div className="text-xs text-muted-foreground">
                {a.preco} · {a.localizacao} · {a.status}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
