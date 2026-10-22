'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Copy, RefreshCcw, AlertTriangle, Link2, ChevronDown, ChevronUp,
  Facebook, MessageCircle, Store, Shield,
} from 'lucide-react';
import { MetaEmbeddedSignup } from '@/components/meta-embedded-signup';

interface Empresa { id: number; nome: string }
interface Integracao {
  id: string; empresa_id: number; empresa_nome: string; nome: string;
  plataforma: string; ativo: boolean; mapeamento: Record<string, string>;
  criado_em: string; ultimo_evento_em: string | null; eventos: number;
}
interface OauthConn {
  id: string; empresa_id: number; empresa_nome: string; provedor: string;
  status: string; label: string; external_id: string; criado_em: string;
}

const PLATAFORMAS_AVANCADAS = [
  { id: 'olx', label: 'OLX', map: { nome: 'name', telefone: 'phone', email: 'email', interesse: 'adsInfo.subject', mensagem: 'message', id_externo: 'externalId' } },
  { id: 'webmotors', label: 'Webmotors', map: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'veiculo', mensagem: 'mensagem', id_externo: 'id' } },
  { id: 'icarros', label: 'iCarros', map: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'modelo', mensagem: 'observacao', id_externo: 'leadId' } },
  { id: 'mercadolivre', label: 'Mercado Livre', map: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'titulo', mensagem: 'texto', id_externo: 'id' } },
  { id: 'napista', label: 'Na Pista', map: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'veiculo', mensagem: 'mensagem', id_externo: 'id' } },
  { id: 'chavesnamao', label: 'Chaves na Mão', map: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'veiculo', mensagem: 'mensagem', id_externo: 'id' } },
  { id: 'facebook', label: 'Facebook (webhook manual)', map: { nome: 'name', telefone: 'phone', email: 'email', interesse: 'interest', mensagem: 'message', id_externo: 'id' } },
  { id: 'instagram', label: 'Instagram (webhook manual)', map: { nome: 'name', telefone: 'phone', email: 'email', interesse: 'interest', mensagem: 'message', id_externo: 'id' } },
  { id: 'whatsapp', label: 'WhatsApp (webhook manual)', map: { nome: 'senderName', telefone: 'phone', email: 'email', interesse: 'interest', mensagem: 'text.message', id_externo: 'messageId' } },
];

const fields = [
  ['nome', 'Nome'], ['telefone', 'Telefone'], ['email', 'E-mail'],
  ['interesse', 'Veículo / interesse'], ['mensagem', 'Mensagem'], ['id_externo', 'ID externo'],
] as const;

export default function IntegracoesPage() {
  const { user, isLoading } = useAuth();
  const tipo = String(user?.tipo || '').toLowerCase();
  const autorizado = ['admin', 'marketing', 'superadmin'].includes(tipo);
  const isSuper = tipo === 'superadmin';

  const [lista, setLista] = useState<Integracao[]>([]);
  const [oauth, setOauth] = useState<OauthConn[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresa, setEmpresa] = useState('');
  const [avancado, setAvancado] = useState(false);
  const [plataforma, setPlataforma] = useState('olx');
  const [nome, setNome] = useState('OLX');
  const [mapeamento, setMapeamento] = useState(PLATAFORMAS_AVANCADAS[0].map);
  const [webhook, setWebhook] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [qr, setQr] = useState<{ id: string; base64: string | null; instance: string } | null>(null);
  const [busyCard, setBusyCard] = useState('');

  const carregar = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      api.get('/integracoes'),
      api.get('/integracoes/empresas'),
      api.get('/integracoes/oauth').catch(() => ({ data: [] })),
    ]);
    setLista(Array.isArray(a.data) ? a.data : []);
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
      toast.success(`Facebook conectado: ${p.get('page') || 'página'}`);
      window.history.replaceState({}, '', '/integracoes');
      carregar();
    }
    if (p.get('oauth_error')) {
      toast.error(`OAuth: ${p.get('oauth_error')}`);
      window.history.replaceState({}, '', '/integracoes');
    }
  }, [carregar]);

  async function conectarMeta() {
    if (!empresa && !isSuper) return toast.error('Sem empresa');
    setBusyCard('meta');
    try {
      const r = await api.post('/integracoes/oauth/meta/start', {
        empresa_id: Number(empresa) || undefined,
      });
      if (r.data.auth_url) {
        window.location.href = r.data.auth_url;
        return;
      }
      toast.error(r.data.message || 'Não foi possível iniciar');
    } catch (e: any) {
      const d = e?.response?.data;
      toast.error(d?.message || d?.error || 'Meta OAuth indisponível');
      if (d?.missing) toast.message('Faltando: ' + d.missing.join(', '));
    } finally {
      setBusyCard('');
    }
  }

  async function conectarWhatsAppQr() {
    setBusyCard('wa');
    try {
      const r = await api.post('/integracoes/oauth/whatsapp/qr', {
        empresa_id: Number(empresa) || undefined,
      });
      if (r.data.provider === 'meta_cloud' || r.data.status === 'conectado') {
        toast.success(r.data.message || 'WhatsApp conectado');
        if (r.data.webhook_url) {
          setWebhook(r.data.webhook_url);
          toast.message(`Verify Token: ${r.data.verify_token || 'aurox-meta-verify'}`);
        }
        await carregar();
        return;
      }
      setQr({
        id: r.data.id,
        base64: r.data.qrcode_base64,
        instance: r.data.instance || r.data.phone_number_id || '',
      });
      toast.message(r.data.message || 'QR gerado');
      // poll status
      const id = r.data.id;
      const t = window.setInterval(async () => {
        try {
          const s = await api.get(`/integracoes/oauth/whatsapp/qr?id=${id}`);
          if (s.data.status === 'conectado') {
            toast.success('WhatsApp conectado!');
            window.clearInterval(t);
            setQr(null);
            carregar();
          }
        } catch { /* ok */ }
      }, 4000);
      window.setTimeout(() => window.clearInterval(t), 120000);
    } catch (e: any) {
      const d = e?.response?.data;
      const msg = d?.message || d?.error || 'Falha WhatsApp';
      toast.error(msg);
      if (d?.seen) {
        toast.message(
          `Servidor vê TOKEN=${d.seen.WHATSAPP_TOKEN ? 'sim' : 'não'} PHONE_ID=${d.seen.WHATSAPP_PHONE_NUMBER_ID ? 'sim' : 'não'} (${d.code_version || '?'})`,
        );
      }
    } finally {
      setBusyCard('');
    }
  }

  async function verDiagnosticoMeta() {
    try {
      const r = await api.get('/integracoes/oauth/meta/diagnostico');
      const o = r.data.oauth_facebook_pages;
      const e = r.data.embedded_signup;
      alert(
        `Meta OAuth\n` +
          `pronto: ${o.pronto}\n` +
          `APP_ID: ${o.META_APP_ID_or_equiv}\n` +
          `SECRET: ${o.META_APP_SECRET}\n` +
          `URL: ${o.app_url}\n` +
          `redirect: ${o.redirect_uri_esperado || '-'}\n` +
          `${o.dica}\n\n` +
          `Embedded Signup\n` +
          `pronto: ${e.pronto}\n` +
          `PUBLIC_APP_ID: ${e.NEXT_PUBLIC_META_APP_ID}\n` +
          `CONFIG_ID: ${e.NEXT_PUBLIC_META_CONFIG_ID}\n` +
          `${e.dica}`,
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Diagnóstico Meta falhou — deploy v133?');
    }
  }

  async function verDiagnostico() {
    try {
      const r = await api.get('/integracoes/oauth/whatsapp/diagnostico');
      toast.message(r.data.dica || JSON.stringify(r.data.mode));
      console.log('whatsapp diagnostico', r.data);
      alert(
        `Versão código: ${r.data.code_version}\nModo: ${r.data.mode}\n` +
          `TOKEN: ${r.data.vercel.WHATSAPP_TOKEN}\nPHONE_ID: ${r.data.vercel.WHATSAPP_PHONE_NUMBER_ID}\n` +
          `VERIFY: ${r.data.vercel.WHATSAPP_VERIFY_TOKEN}\n` +
          r.data.dica,
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Diagnóstico falhou');
    }
  }


  function escolherPlat(id: string) {
    const p = PLATAFORMAS_AVANCADAS.find((x) => x.id === id)!;
    setPlataforma(p.id);
    setNome(p.label);
    setMapeamento({ ...p.map });
  }

  async function criarAvancado(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api.post('/integracoes', {
        empresa_id: Number(empresa),
        nome,
        plataforma,
        mapeamento,
      });
      setWebhook(r.data.webhook_url || '');
      toast.success('URL gerada — use só se a plataforma exigir webhook manual');
      await carregar();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro');
    } finally {
      setSalvando(false);
    }
  }

  if (isLoading) return <div className="p-6">Carregando…</div>;
  if (!autorizado) return <div className="p-6 text-muted-foreground">Apenas admin, marketing ou superadmin.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-28">
      <div>
        <h1 className="text-2xl font-bold">Conectar canais</h1>
        <p className="text-sm text-muted-foreground">
          Um clique. Sem copiar URL, sem JSON. Lead e mensagens ficam só na <strong>sua empresa</strong>.
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

      <div className="grid gap-3">
        <button
          type="button"
          disabled={!!busyCard}
          onClick={conectarMeta}
          className="flex items-center gap-4 rounded-2xl border bg-card p-5 text-left hover:border-blue-500/50 transition disabled:opacity-60"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Facebook className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-lg">Conectar Facebook / Instagram</div>
            <p className="text-sm text-muted-foreground">
              Abre o login oficial da Meta · você escolhe a Página da loja · Aurox guarda só o token da Página
            </p>
          </div>
          {busyCard === 'meta' && <span className="text-xs">…</span>}
        </button>

        <p className="text-xs text-muted-foreground">
          Se der erro: confira se o <strong>último zip</strong> foi ao Vercel e se houve <strong>Redeploy</strong> depois das env.
          <button type="button" className="ml-2 underline" onClick={verDiagnostico}>Diagnosticar WhatsApp</button>
          <button type="button" className="ml-2 underline" onClick={verDiagnosticoMeta}>Diagnosticar Meta OAuth</button>
        </p>
        <MetaEmbeddedSignup
          empresaId={empresa}
          onConnected={() => carregar()}
        />

        <details className="rounded-xl border bg-card/50 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            Outras formas (Cloud token manual / QR Evolution)
          </summary>
          <div className="mt-3 space-y-2">
            <button
              type="button"
              disabled={!!busyCard}
              onClick={conectarWhatsAppQr}
              className="flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left hover:border-emerald-500/50 transition disabled:opacity-60"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/80 text-white">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">WhatsApp via token no servidor</div>
                <p className="text-xs text-muted-foreground">
                  Usa WHATSAPP_TOKEN + PHONE_NUMBER_ID do Vercel (teste) ou Evolution QR
                </p>
              </div>
              {busyCard === 'wa' && <span className="text-xs">…</span>}
            </button>
          </div>
        </details>

        <div className="flex items-center gap-4 rounded-2xl border border-dashed bg-card/50 p-5 opacity-90">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-600/80 text-white">
            <Store className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-lg">Mercado Livre / OLX Pro</div>
            <p className="text-sm text-muted-foreground">
              OAuth do parceiro em breve. Enquanto isso use a opção avançada (webhook) se o painel deles pedir URL.
            </p>
          </div>
        </div>
      </div>

      {qr && (
        <div className="rounded-2xl border border-emerald-500/40 bg-card p-5 space-y-3 text-center">
          <p className="font-medium">Escaneie com o WhatsApp da loja</p>
          {qr.base64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr.base64.startsWith('data:') ? qr.base64 : `data:image/png;base64,${qr.base64}`}
              alt="QR WhatsApp"
              className="mx-auto max-w-[240px] rounded-lg bg-white p-2"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Aguardando QR… atualize ou tente de novo.</p>
          )}
          <p className="text-xs text-muted-foreground">Instância isolada: {qr.instance}</p>
        </div>
      )}

      <div className="rounded-xl border p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Shield className="h-4 w-4 text-emerald-500" /> Segurança
        </div>
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
          <li>Token/sessão fica ligado ao <code>empresa_id</code> — outra loja não enxerga.</li>
          <li>Facebook: usa Page Access Token da Página, não o perfil pessoal como token operacional.</li>
          <li>WhatsApp QR: instância <code>aurox_&#123;empresa&#125;_…</code> só daquela empresa.</li>
          <li>API nunca devolve access_token para o navegador na listagem.</li>
        </ul>
      </div>

      {oauth.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm">Conexões rápidas</h2>
          {oauth.map((o) => (
            <div key={o.id} className="flex justify-between rounded-xl border px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{o.label || o.provedor}</div>
                <div className="text-xs text-muted-foreground">{o.provedor} · {o.empresa_nome}</div>
              </div>
              <span className={`text-xs self-center ${o.status === 'conectado' ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                {o.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Avançado */}
      <button
        type="button"
        onClick={() => setAvancado((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium"
      >
        Integração via Webhook / API (avançado)
        {avancado ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {avancado && (
        <form onSubmit={criarAvancado} className="space-y-3 rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted-foreground">
            Para ERP, AutoCerto-like, ou quando o portal exige URL. Verify Meta: <code>aurox-meta-verify</code>
          </p>
          <label className="block text-sm">
            Plataforma
            <select
              className="mt-1 w-full rounded-md border bg-background p-2"
              value={plataforma}
              onChange={(e) => escolherPlat(e.target.value)}
            >
              {PLATAFORMAS_AVANCADAS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Nome
            <input className="mt-1 w-full rounded-md border bg-background p-2" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </label>
          <div className="space-y-1 rounded-lg border p-3">
            {fields.map(([k, label]) => (
              <label key={k} className="grid grid-cols-2 gap-2 text-xs items-center">
                <span>{label}</span>
                <input
                  className="rounded border bg-background p-1 font-mono"
                  value={mapeamento[k] || ''}
                  onChange={(e) => setMapeamento((m) => ({ ...m, [k]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <button type="submit" disabled={salvando} className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground">
            {salvando ? '…' : 'Gerar URL de webhook'}
          </button>
          {webhook && (
            <div className="rounded-lg border border-emerald-500/30 p-3 text-xs break-all space-y-2">
              <code>{webhook}</code>
              <button type="button" className="flex items-center gap-1 underline" onClick={() => navigator.clipboard.writeText(webhook)}>
                <Copy className="h-3 w-3" /> Copiar
              </button>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Webhooks ativos</span>
              <button type="button" onClick={() => carregar()} className="p-1 border rounded"><RefreshCcw className="h-3.5 w-3.5" /></button>
            </div>
            {lista.map((i) => (
              <div key={i.id} className="rounded-lg border p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="font-medium">{i.nome}</span>
                  <span>{i.ativo ? 'ativa' : 'pausada'}</span>
                </div>
                <div className="text-muted-foreground">{i.plataforma} · {i.empresa_nome}</div>
                <button
                  type="button"
                  className="text-red-500"
                  onClick={async () => {
                    const senha = window.prompt('Senha para excluir:');
                    if (!senha) return;
                    try {
                      await api.delete(`/integracoes/${i.id}`, { data: { senha } });
                      toast.success('Excluída');
                      carregar();
                    } catch (e: any) {
                      toast.error(e?.response?.data?.error || 'Erro');
                    }
                  }}
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
