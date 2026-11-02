'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Facebook, MessageCircle, Store, Shield, ChevronDown, ChevronUp, Copy, RefreshCcw,
} from 'lucide-react';
import { MetaEmbeddedSignup } from '@/components/meta-embedded-signup';
import { ZapiQrConnect } from '@/components/zapi-qr-connect';

interface Empresa { id: number; nome: string }
interface OauthConn {
  id: string; empresa_id: number; empresa_nome: string; provedor: string;
  status: string; label: string; external_id: string;
}

/** Canais B2B: a LOJA autoriza com login/chave dela — token fica só nessa empresa */
const CANAIS_CHAVE = [
  { id: 'napista', label: 'Na Pista', hint: 'Credencial do painel Na Pista da loja.' },
  { id: 'chavesnamao', label: 'Chaves na Mão', hint: 'Token do painel Chaves na Mão.' },
] as const;

export default function IntegracoesPage() {
  const { user, isLoading } = useAuth();
  const tipo = String(user?.tipo || '').toLowerCase();
  const autorizado = ['admin', 'marketing', 'superadmin'].includes(tipo);
  const isSuper = tipo === 'superadmin';

  const [oauth, setOauth] = useState<OauthConn[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresa, setEmpresa] = useState('');
  const [busy, setBusy] = useState('');
  const [canalAberto, setCanalAberto] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [webhookGerado, setWebhookGerado] = useState('');
  const [avancado, setAvancado] = useState(false);

  const carregar = useCallback(async () => {
    const [b, c] = await Promise.all([
      api.get('/integracoes/empresas'),
      api.get('/integracoes/oauth').catch(() => ({ data: [] })),
    ]);
    setEmpresas(Array.isArray(b.data) ? b.data : []);
    setEmpresa((x) => x || String(b.data?.[0]?.id ?? ''));
    setOauth(Array.isArray(c.data) ? c.data : []);
  }, []);

  useEffect(() => {
    if (!isLoading && autorizado) carregar().catch(() => toast.error('Falha ao carregar'));
  }, [isLoading, autorizado, carregar]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('oauth') === 'ok') {
      toast.success(`Conectado: ${p.get('page') || 'canal'}`);
      window.history.replaceState({}, '', '/integracoes');
      carregar();
    }
    if (p.get('oauth_error')) {
      toast.error(`OAuth: ${p.get('oauth_error')}`);
      window.history.replaceState({}, '', '/integracoes');
    }
  }, [carregar]);

  async function conectarMeta() {
    setBusy('meta');
    try {
      const r = await api.post('/integracoes/oauth/meta/start', {
        empresa_id: Number(empresa) || undefined,
      });
      if (r.data.auth_url) {
        window.location.href = r.data.auth_url;
        return;
      }
      toast.error(r.data.message || 'Meta indisponível');
    } catch (e: any) {
      const d = e?.response?.data;
      toast.error(d?.message || d?.error || 'Meta OAuth indisponível');
    } finally {
      setBusy('');
    }
  }

  async function conectarOlx() {
    if (!empresa) return toast.error('Selecione uma empresa');
    setBusy('olx');
    try {
      const r = await api.post('/integracoes/oauth/olx/start', { empresa_id: Number(empresa) });
      if (r.data?.auth_url) {
        window.location.assign(r.data.auth_url);
        return;
      }
      toast.error(r.data?.message || 'Login OLX indisponivel');
    } catch(e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Falha ao iniciar login OLX');
    } finally { setBusy(''); }
  }

  async function conectarML() {
    setBusy('ml');
    try {
      const r = await api.post('/integracoes/oauth/mercadolivre/start', {
        empresa_id: Number(empresa) || undefined,
      });
      if (r.data.auth_url) {
        window.location.href = r.data.auth_url;
        return;
      }
      toast.error(r.data.message || 'Mercado Livre indisponível');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Configure ML_APP_ID no servidor Aurox (uma vez)');
    } finally {
      setBusy('');
    }
  }

  async function salvarCredencial(provedor: string) {
    if (!empresa) return toast.error('Selecione a empresa');
    setBusy(provedor);
    try {
      const r = await api.post('/integracoes/oauth/credencial', {
        empresa_id: Number(empresa),
        provedor,
        api_key: apiKey,
        client_id: clientId,
        label: CANAIS_CHAVE.find((c) => c.id === provedor)?.label || provedor,
      });
      setWebhookGerado(r.data.webhook_url || '');
      toast.success(r.data.message || 'Conectado');
      setApiKey('');
      setClientId('');
      setCanalAberto('');
      await carregar();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Erro');
    } finally {
      setBusy('');
    }
  }

  
  async function desconectar(id: string, label: string) {
    if (!confirm(`Desconectar "${label}"? A loja poderá conectar outra conta depois.`)) return;
    try {
      await api.post('/integracoes/oauth/desconectar', { id });
      toast.success('Canal desconectado');
      await carregar();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Falha ao desconectar');
    }
  }

  function statusDe(provedor: string) {
    return oauth.find(
      (o) =>
        o.provedor === provedor ||
        (provedor === 'facebook' && o.provedor === 'meta_facebook') ||
        (provedor === 'whatsapp' && (o.provedor === 'whatsapp_cloud' || o.provedor === 'whatsapp_qr')),
    );
  }

  if (isLoading) return <div className="p-6">Carregando…</div>;
  if (!autorizado) return <div className="p-6 text-muted-foreground">Apenas admin, marketing ou superadmin.</div>;

  const metaHook = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/meta` : "/api/webhooks/meta";
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-28">
      <div>
        <h1 className="text-2xl font-bold">Conectar canais</h1>
        <p className="text-sm text-muted-foreground">
          Cada empresa conecta suas contas pelas modalidades oficiais de cada portal. Credenciais de integracao ficam no servidor e nunca no navegador.
        </p>
      </div>

      {(isSuper || empresas.length > 1) && (
        <label className="block text-sm">
          Empresa
          <select
            className="mt-1 w-full rounded-md border bg-background p-2"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
          >
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </label>
      )}

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm">Modelo (igual AutoCerto)</p>
          <p>1. Concessionária faz login no provedor quando houver OAuth; outros canais exigem ativacao de integrador.</p>
        <p>2. Aurox vincula ao <code>empresa_id</code> e gera webhook de entrada.</p>
        <p>3. Anúncio gera interesse → lead na triagem desta loja.</p>
      </div>

      <div className="grid gap-3">
        {/* Meta OAuth */}
        <button
          type="button"
          disabled={!!busy}
          onClick={conectarMeta}
          className="flex items-center gap-4 rounded-2xl border bg-card p-5 text-left hover:border-blue-500/50 transition"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Facebook className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-lg">Facebook / Instagram / Marketplace</div>
            <p className="text-sm text-muted-foreground">
              Login oficial Meta · Página + Instagram vinculado · leads/mensagens FB, IG e Marketplace nesta empresa
            </p>
            {statusDe('meta_facebook') && (
              <p className="text-xs mt-1 text-amber-500">Status: {statusDe('meta_facebook')!.status}</p>
            )}
          </div>
        </button>

        <ZapiQrConnect empresaId={empresa} onConnected={() => carregar()} />
          <MetaEmbeddedSignup empresaId={empresa} onConnected={() => carregar()} />

        {/* Mercado Livre OAuth */}
        <button
          type="button"
          disabled={!!busy}
          onClick={conectarML}
          className="flex items-center gap-4 rounded-2xl border bg-card p-5 text-left hover:border-yellow-500/50 transition"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-500 text-black">
            <Store className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-lg">Mercado Livre</div>
            <p className="text-sm text-muted-foreground">
              Login oficial ML · a loja autoriza a conta dela · token só desta empresa
            </p>
            {statusDe('mercadolivre') && (
              <p className="text-xs mt-1 text-emerald-500">Status: {statusDe('mercadolivre')!.status}</p>
            )}
          </div>
        </button>

        {/* OLX: OAuth real, a senha nunca passa pelo MANU. */}
        <button type="button" disabled={!!busy} onClick={conectarOlx}
          className="flex w-full items-center gap-4 rounded-2xl border bg-card p-5 text-left hover:border-primary/50 transition">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted font-bold">OL</div>
          <div className="flex-1">
            <div className="text-lg font-semibold">OLX</div>
            <p className="text-sm text-muted-foreground">Fazer login na OLX e autorizar leads e anuncios. Requer MANU homologado como integrador.</p>
            {statusDe('olx') && <p className="text-xs text-emerald-500">Status: {statusDe('olx')!.status}</p>}
          </div>
          <span className="text-sm text-primary">{busy==='olx'?'Conectando…':'Conectar conta'}</span>
        </button>

        {/* Webmotors e iCarros exigem autorizacao de parceiro. A loja entra no portal oficial;
            o MANU nao captura senhas e nao confunde login externo com integracao concluida. */}
        <div className="rounded-2xl border bg-card p-5 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="text-lg font-semibold">Webmotors</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">Acesse sua conta no Cockpit para autorizar o CRM integrador da loja.</p></div>
            <a href="https://www.cockpit.com.br/inventory/php/integracoes" target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">Entrar na Webmotors ↗</a>
          </div>
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">O MANU precisa estar homologado como CRM parceiro para receber os leads e publicar anúncios. A entrada no Cockpit não significa conexão concluída.</p>
          <a href="/ajuda" className="inline-flex text-xs font-medium text-primary underline">Solicitar ativação técnica no MANU</a>
        </div>
        <div className="rounded-2xl border bg-card p-5 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="text-lg font-semibold">iCarros</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">Entre na área de revendas e autorize o integrador quando essa opção estiver disponível para a loja.</p></div>
            <a href="https://portalrevenda.icarros.com.br" target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">Entrar no iCarros ↗</a>
          </div>
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">A autorização técnica e os conectores de anúncios/leads do MANU ainda dependem de credenciamento. Não é necessário inserir webhook manualmente nesta tela.</p>
          <a href="/ajuda" className="inline-flex text-xs font-medium text-primary underline">Solicitar ativação técnica no MANU</a>
        </div>

        {/* Parceiros com chave da loja */}
        {CANAIS_CHAVE.map((c) => {
          const st = statusDe(c.id);
          const aberto = canalAberto === c.id;
          return (
            <div key={c.id} className="rounded-2xl border bg-card overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-4 p-5 text-left"
                onClick={() => {
                  setCanalAberto(aberto ? '' : c.id);
                  setApiKey('');
                  setClientId('');
                }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-lg font-bold">
                  {c.label.slice(0, 2)}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-lg">{c.label}</div>
                  <p className="text-sm text-muted-foreground">
                    Integração técnica do parceiro · requer credencial e webhook homologados
                  </p>
                  {st && (
                    <p className={`text-xs mt-1 ${st.status === 'conectado' ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {st.status}
                    </p>
                  )}
                </div>
                {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {aberto && (
                <div className="border-t px-5 pb-5 space-y-3">
                  <p className="text-xs text-muted-foreground pt-3">{c.hint}</p>
                  <label className="block text-sm">
                    Chave / token da loja
                    <input
                      className="mt-1 w-full rounded-md border bg-background p-2 font-mono text-sm"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Cole o token que o painel deu para esta concessionária"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-sm">
                    Client ID / Partner ID (se houver)
                    <input
                      className="mt-1 w-full rounded-md border bg-background p-2 font-mono text-sm"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="Opcional"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!!busy || (!apiKey && !clientId)}
                    onClick={() => salvarCredencial(c.id)}
                    className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {busy === c.id ? 'Salvando…' : `Conectar ${c.label}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {webhookGerado && (
        <div className="rounded-xl border border-emerald-500/40 p-4 space-y-2 text-sm">
          <p className="font-medium">URL para colar no painel do parceiro (uma vez)</p>
          <code className="block break-all text-xs">{webhookGerado}</code>
          <button
            type="button"
            className="flex items-center gap-1 text-xs underline"
            onClick={() => navigator.clipboard.writeText(webhookGerado)}
          >
            <Copy className="h-3 w-3" /> Copiar
          </button>
        </div>
      )}

      <div className="rounded-xl border p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Shield className="h-4 w-4 text-emerald-500" /> Isolamento
        </div>
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
          <li>Cada login/chave fica no <code>empresa_id</code> da loja que conectou.</li>
          <li>Outra concessionária não vê nem usa esse token.</li>
          <li>Vercel só guarda o app Aurox (Meta/ML), não 30 mil tokens de cliente.</li>
        </ul>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Conexões desta visão</h2>
        <button type="button" onClick={() => carregar()} className="rounded-md border p-2">
          <RefreshCcw className="h-4 w-4" />
        </button>
      </div>
      {oauth.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conexão ainda.</p>}
      {oauth.map((o) => (
        <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
          <div className="min-w-0">
            <div className="font-medium truncate">{o.label || o.provedor}</div>
            <div className="text-xs text-muted-foreground">{o.provedor} · {o.empresa_nome}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={o.status === 'conectado' ? 'text-emerald-500 text-xs' : 'text-xs text-muted-foreground'}>
              {o.status}
            </span>
            <button
              type="button"
              className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
              onClick={() => desconectar(o.id, o.label || o.provedor)}
            >
              Desconectar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
