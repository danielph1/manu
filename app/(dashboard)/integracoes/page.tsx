'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Copy, RefreshCcw, AlertTriangle, Link2 } from 'lucide-react';

interface Empresa { id: number; nome: string }
interface Integracao {
  id: string; empresa_id: number; empresa_nome: string; nome: string;
  plataforma: string; ativo: boolean; mapeamento: Record<string, string>;
  criado_em: string; ultimo_evento_em: string | null; eventos: number;
}
interface Evento {
  id: string; recebido_em: string; status: string; nome: string; telefone: string;
  email: string; interesse: string; triagem_id: number | null; erro: string | null;
}

/** Plataformas de anúncio / mensagens que EMPURRAM lead (webhook inbound) */
const PLATAFORMAS: {
  id: string;
  label: string;
  hint: string;
  map: Record<string, string>;
}[] = [
  {
    id: 'olx',
    label: 'OLX',
    hint: 'No painel OLX Profissional / parceiro, cole a URL de webhook da Aurox.',
    map: { nome: 'name', telefone: 'phone', email: 'email', interesse: 'adsInfo.subject', mensagem: 'message', id_externo: 'externalId' },
  },
  {
    id: 'webmotors',
    label: 'Webmotors',
    hint: 'Cadastre a URL de callback/webhook no painel Webmotors (ou integrador).',
    map: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'veiculo', mensagem: 'mensagem', id_externo: 'id' },
  },
  {
    id: 'icarros',
    label: 'iCarros',
    hint: 'URL de notificação de lead no painel iCarros / API parceiro.',
    map: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'modelo', mensagem: 'observacao', id_externo: 'leadId' },
  },
  {
    id: 'mercadolivre',
    label: 'Mercado Livre',
    hint: 'Notificações ML (topic leads/questions) apontando para esta URL.',
    map: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'titulo', mensagem: 'texto', id_externo: 'id' },
  },
  {
    id: 'napista',
    label: 'Na Pista',
    hint: 'Webhook Na Pista → cole a URL gerada aqui.',
    map: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'veiculo', mensagem: 'mensagem', id_externo: 'id' },
  },
  {
    id: 'chavesnamao',
    label: 'Chaves na Mão',
    hint: 'Callback de lead no painel Chaves na Mão.',
    map: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'veiculo', mensagem: 'mensagem', id_externo: 'id' },
  },
  {
    id: 'facebook',
    label: 'Facebook (Lead Ads / Página)',
    hint: 'Meta Webhooks: assine leadgen / messages e use esta URL + verify token.',
    map: { nome: 'full_name', telefone: 'phone_number', email: 'email', interesse: 'vehicle', mensagem: 'message', id_externo: 'leadgen_id' },
  },
  {
    id: 'marketplace',
    label: 'Facebook Marketplace',
    hint: 'Só via mensagens da Página/Meta webhook (não scrape). Mesma ideia do Facebook.',
    map: { nome: 'name', telefone: 'phone', email: 'email', interesse: 'item', mensagem: 'message', id_externo: 'id' },
  },
  {
    id: 'instagram',
    label: 'Instagram',
    hint: 'Meta Webhooks (instagram / messages) na mesma app da Página.',
    map: { nome: 'name', telefone: 'phone', email: 'email', interesse: 'interest', mensagem: 'message', id_externo: 'id' },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp (Z-API / similar)',
    hint: 'No Z-API: Webhook “Ao receber” = URL Aurox. Token fica no Z-API; aqui só a URL.',
    map: { nome: 'senderName', telefone: 'phone', email: 'email', interesse: 'interest', mensagem: 'text.message', id_externo: 'messageId' },
  },
];

const fields = [
  ['nome', 'Nome'],
  ['telefone', 'Telefone'],
  ['email', 'E-mail'],
  ['interesse', 'Veículo / interesse'],
  ['mensagem', 'Mensagem'],
  ['id_externo', 'Identificador externo'],
] as const;

export default function IntegracoesPage() {
  const { user, isLoading } = useAuth();
  const tipo = String(user?.tipo || '').toLowerCase();
  const autorizado = ['admin', 'marketing', 'superadmin'].includes(tipo);
  const [lista, setLista] = useState<Integracao[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresa, setEmpresa] = useState('');
  const [plataforma, setPlataforma] = useState('olx');
  const [nome, setNome] = useState('OLX');
  const [mapeamento, setMapeamento] = useState<Record<string, string>>(PLATAFORMAS[0].map);
  const [webhook, setWebhook] = useState('');
  const [selecionado, setSelecionado] = useState('');
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [editando, setEditando] = useState('');
  const [mapaEditado, setMapaEditado] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [hint, setHint] = useState(PLATAFORMAS[0].hint);

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([api.get('/integracoes'), api.get('/integracoes/empresas')]);
    setLista(Array.isArray(a.data) ? a.data : []);
    setEmpresas(Array.isArray(b.data) ? b.data : []);
    setEmpresa((c) => c || String(b.data?.[0]?.id ?? ''));
  }, []);

  useEffect(() => {
    if (!isLoading && autorizado) carregar().catch(() => toast.error('Falha ao carregar integrações'));
  }, [isLoading, autorizado, carregar]);

  function escolherPlataforma(id: string) {
    const p = PLATAFORMAS.find((x) => x.id === id) || PLATAFORMAS[0];
    setPlataforma(p.id);
    setNome(p.label);
    setMapeamento({ ...p.map });
    setHint(p.hint);
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!empresa) return toast.error('Escolha a empresa');
    setSalvando(true);
    try {
      const r = await api.post('/integracoes', {
        empresa_id: Number(empresa),
        nome,
        plataforma,
        mapeamento,
      });
      setWebhook(r.data.webhook_url || '');
      toast.success('Conexão criada — copie a URL e cole no painel da plataforma');
      await carregar();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro ao criar');
    } finally {
      setSalvando(false);
    }
  }

  async function copiar(txt: string) {
    try {
      await navigator.clipboard.writeText(txt);
      toast.success('Copiado');
    } catch {
      toast.message(txt);
    }
  }

  async function verEventos(id: string) {
    setSelecionado(id);
    try {
      const r = await api.get(`/integracoes/${id}/eventos`);
      setEventos(Array.isArray(r.data) ? r.data : []);
    } catch {
      toast.error('Falha ao listar eventos');
    }
  }

  async function rotacionar(id: string) {
    if (!confirm('Gerar nova URL? A anterior deixa de funcionar.')) return;
    try {
      const r = await api.post(`/integracoes/${id}/rotacionar`);
      setWebhook(r.data.webhook_url || '');
      toast.success('Nova URL gerada — atualize no painel da plataforma');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro');
    }
  }

  async function toggleAtivo(i: Integracao) {
    try {
      await api.patch(`/integracoes/${i.id}`, { ativo: !i.ativo });
      await carregar();
    } catch {
      toast.error('Não foi possível alterar');
    }
  }

  async function salvarMapa(id: string) {
    try {
      await api.patch(`/integracoes/${id}`, { mapeamento: mapaEditado });
      setEditando('');
      toast.success('Mapeamento salvo');
      await carregar();
    } catch {
      toast.error('Erro ao salvar campos');
    }
  }

  if (isLoading) return <div className="p-6">Carregando…</div>;
  if (!autorizado) {
    return <div className="p-6 text-muted-foreground">Apenas admin, marketing ou superadmin.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-28">
      <div>
        <h1 className="text-2xl font-bold">Integrações de anúncios</h1>
        <p className="text-sm text-muted-foreground">
          A empresa cola a <strong>URL da Aurox</strong> no painel OLX, Webmotors, iCarros, etc. O lead chega na{' '}
          <strong>Triagem</strong> com nome e telefone — modelo AutoCerto, sem login no Vercel.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <p className="font-medium">Como funciona</p>
          <ol className="mt-1 list-decimal pl-4 text-muted-foreground space-y-1">
            <li>Crie a conexão abaixo (empresa + plataforma).</li>
            <li>Copie a <strong>URL de webhook</strong> gerada.</li>
            <li>No site da plataforma (OLX, Webmotors…), cole essa URL onde pede webhook/callback.</li>
            <li>Quando um cliente interessar no anúncio, a plataforma <em>envia</em> o lead → Aurox → Triagem.</li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            A Edge Function no Supabase recebe o POST (público). Nada de token da empresa no Vercel.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={criar} className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 font-semibold">
            <Plus className="h-5 w-5" /> Nova conexão
          </div>

          <label className="block text-sm">
            Empresa
            <select
              required
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background p-2"
            >
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            Plataforma
            <select
              value={plataforma}
              onChange={(e) => escolherPlataforma(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background p-2"
            >
              {PLATAFORMAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
          </label>

          <label className="block text-sm">
            Nome da conexão (ex.: loja 381 / anúncio X)
            <input
              className="mt-1 w-full rounded-md border bg-background p-2"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              minLength={2}
            />
          </label>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-sm font-medium">Mapeamento JSON (caminho no payload)</div>
            <p className="text-xs text-muted-foreground">
              Ajuste se a plataforma mandar nomes diferentes. Ex.: <code>lead.customer.phone</code>
            </p>
            {fields.map(([k, label]) => (
              <label key={k} className="grid grid-cols-2 gap-2 text-xs items-center">
                <span>{label}</span>
                <input
                  className="rounded border bg-background p-1.5 font-mono"
                  value={mapeamento[k] || ''}
                  onChange={(e) => setMapeamento((m) => ({ ...m, [k]: e.target.value }))}
                />
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {salvando ? 'Criando…' : 'Criar conexão e gerar URL'}
          </button>

          {webhook && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <Link2 className="h-4 w-4" /> URL para colar na plataforma
              </div>
              <code className="block break-all text-xs">{webhook}</code>
              <button type="button" onClick={() => copiar(webhook)} className="flex items-center gap-1 text-sm underline">
                <Copy className="h-3.5 w-3.5" /> Copiar URL
              </button>
              <p className="text-[11px] text-muted-foreground">
                Guarde agora: o segredo da URL não aparece de novo (só rotacionando).
              </p>
            </div>
          )}
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Conexões existentes</h2>
            <button type="button" onClick={() => carregar()} className="rounded-md border p-2" title="Atualizar">
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>
          {lista.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma conexão ainda.</p>
          )}
          {lista.map((i) => (
            <div key={i.id} className="rounded-xl border bg-card p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{i.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.plataforma.toUpperCase()} · {i.empresa_nome} · {i.eventos ?? 0} eventos
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Último webhook:{' '}
                    {i.ultimo_evento_em ? new Date(i.ultimo_evento_em).toLocaleString('pt-BR') : 'nunca'}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${i.ativo ? 'bg-emerald-500/20 text-emerald-600' : 'bg-muted text-muted-foreground'}`}
                >
                  {i.ativo ? 'Ativa' : 'Pausada'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => toggleAtivo(i)} className="rounded-md border px-2 py-1 text-xs">
                  {i.ativo ? 'Pausar' : 'Ativar'}
                </button>
                <button type="button" onClick={() => rotacionar(i.id)} className="rounded-md border px-2 py-1 text-xs">
                  Nova URL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditando(i.id);
                    setMapaEditado({ ...(i.mapeamento || {}) });
                  }}
                  className="rounded-md border px-2 py-1 text-xs"
                >
                  Editar campos
                </button>
                <button type="button" onClick={() => verEventos(i.id)} className="rounded-md border px-2 py-1 text-xs">
                  Ver eventos
                </button>
              </div>
              {editando === i.id && (
                <div className="space-y-2 border-t pt-2">
                  {fields.map(([k, label]) => (
                    <label key={k} className="grid grid-cols-2 gap-2 text-xs">
                      <span>{label}</span>
                      <input
                        className="rounded border bg-background p-1 font-mono"
                        value={mapaEditado[k] || ''}
                        onChange={(e) => setMapaEditado((m) => ({ ...m, [k]: e.target.value }))}
                      />
                    </label>
                  ))}
                  <button type="button" onClick={() => salvarMapa(i.id)} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">
                    Salvar mapeamento
                  </button>
                </div>
              )}
            </div>
          ))}

          {selecionado && (
            <div className="rounded-xl border p-4 space-y-2">
              <h3 className="font-medium text-sm">Eventos recentes</h3>
              {eventos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum evento ainda.</p>}
              {eventos.slice(0, 15).map((ev) => (
                <div key={ev.id} className="text-xs border-b border-border/50 py-1">
                  <div>
                    {ev.nome || '—'} · {ev.telefone || 'sem tel'} · {ev.status}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(ev.recebido_em).toLocaleString('pt-BR')}
                    {ev.triagem_id ? ` · triagem #${ev.triagem_id}` : ''}
                    {ev.erro ? ` · erro: ${ev.erro}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
