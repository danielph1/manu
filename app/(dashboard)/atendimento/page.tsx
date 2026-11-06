'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Activity, AlertCircle, ArrowRightLeft, Clock3, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Lead {
  id: number; nome: string; telefone?: string; email?: string;
  veiculo?: string; mensagem?: string; vendedor_id?: number;
  vendedor?: string; loja?: string; origem?: string; minutos_aguardando: number;
}
interface Seller {
  id: number; nome: string; loja?: string;
  recebidos_hoje: number; pendentes_atrasados: number; atendidos_registrados: number; perdidos_hoje: number;
}
interface Snapshot {
  empresa_id: number; limite_minutos: number; total_pendentes: number | null;
  total_fila: number | null; total_sem_resposta: number | null; total_atrasados: number | null;
  paginacao: { pagina_leads: number; pagina_triagem: number; por_pagina: number };
  fila: Lead[]; sem_resposta: Lead[]; vendedores: Seller[]; atualizado_em: string; incompleto?: boolean; avisos?: string[];
}
interface Empresa { id: number; nome: string }
const permitted = new Set(['superadmin', 'admin', 'gerente', 'marketing']);
type Filtro = 'todos' | 'triagem' | 'sem_resposta' | 'atrasados';
const nomesFiltro: Record<Exclude<Filtro,'todos'>,string> = {
  triagem: 'Aguardando triagem',
  sem_resposta: 'Com vendedor, sem resposta',
  atrasados: 'Sem resposta há mais de 10 minutos',
};
const mins = (n: number) => n < 60 ? `${n} min` : `${Math.floor(n / 60)}h ${n % 60}min`;

export default function AtendimentoPage() {
  const { user, isLoading } = useAuth();
  const role = String(user?.tipo || '').toLowerCase();
  const authorized = permitted.has(role);
  const [empresaId, setEmpresaId] = useState('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferring, setTransferring] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Record<number,string>>({});
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [paginaLeads, setPaginaLeads] = useState(1);
  const [paginaTriagem, setPaginaTriagem] = useState(1);
  const requisicaoAtual = useRef(0);
  const listaLeadsRef = useRef<HTMLElement>(null);
  const listaTriagemRef = useRef<HTMLElement>(null);

  function aplicarFiltro(novo: Exclude<Filtro,'todos'>) {
    const proximo: Filtro = filtro === novo ? 'todos' : novo;
    setFiltro(proximo);
    setPaginaLeads(1);
    setPaginaTriagem(1);
    // A área filtrada será carregada novamente; o título permanece visível.
  }

  useEffect(() => {
    if(filtro === 'todos') return;
    const alvo = filtro === 'triagem' ? listaTriagemRef : listaLeadsRef;
    alvo.current?.scrollIntoView({behavior:'smooth',block:'start'});
  },[filtro]);

  useEffect(() => {
    if (!isLoading && authorized && role === 'superadmin') {
      api.get('/integracoes/empresas')
        .then(r => { const items = Array.isArray(r.data) ? r.data : []; setEmpresas(items);
          setEmpresaId(prev => prev || String(items[0]?.id ?? '')); })
        .catch(() => toast.error('Falha ao listar empresas'));
    } else if (user?.empresa_id) setEmpresaId(String(user.empresa_id));
  }, [isLoading, authorized, role, user?.empresa_id]);

  const reload = useCallback(async () => {
    if (!authorized || !empresaId) return;
    const requisicao = ++requisicaoAtual.current;
    setBusy(true);
    try {
      const res = await api.get('/atendimento', {
        params: {
          empresa_id: Number(empresaId), filtro,
          pagina_leads: paginaLeads, pagina_triagem: paginaTriagem,
        },
      });
      if (requisicao === requisicaoAtual.current) setSnapshot(res.data);
    } catch (e: any) {
      if (requisicao === requisicaoAtual.current) {
        setSnapshot(null);
        toast.error(e?.response?.data?.error || 'Falha ao carregar o atendimento');
      }
    } finally { if (requisicao === requisicaoAtual.current) setBusy(false); }
  }, [authorized, empresaId, filtro, paginaLeads, paginaTriagem]);

  useEffect(() => {
    reload();
    const tick = setInterval(reload, 15000);
    return () => clearInterval(tick);
  }, [reload]);

  const transferir = async (lead: Lead, modo: 'loja' | 'empresa' = 'loja') => {
    setTransferring(lead.id);
    try {
      const vendedor_id = chosen[lead.id] ? Number(chosen[lead.id]) : undefined;
      await api.post(`/leads/${lead.id}/passar`, {
        vendedor_id, modo: role === 'gerente' ? 'loja' : modo, motivo: 'supervisao_atendimento',
      });
      toast.success('Lead transferido com sucesso');
      await reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Transferencia nao concluida');
    } finally { setTransferring(null); }
  };

  if (isLoading) return <p className="p-6">Carregando...</p>;
  if (!authorized) return <p className="p-6 text-muted-foreground">Acesso restrito a marketing, gerente, admin e superadmin.</p>;

  const sellers = snapshot?.vendedores || [];
  const mostrarLeads = filtro === 'todos' || filtro === 'sem_resposta' || filtro === 'atrasados';
  const mostrarTriagem = filtro === 'todos' || filtro === 'triagem';
  const totalListaLeads = filtro === 'atrasados' ? snapshot?.total_atrasados : snapshot?.total_sem_resposta;
  const paginaCarregada = !!snapshot && snapshot.filtro === filtro &&
    snapshot.paginacao.pagina_leads === paginaLeads && snapshot.paginacao.pagina_triagem === paginaTriagem;
  const leadsNaPagina = paginaCarregada ? snapshot!.sem_resposta : [];
  const triagemNaPagina = paginaCarregada ? snapshot!.fila : [];
  return <main className="mx-auto max-w-7xl space-y-6 pb-20">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">Gestao de atendimento</h1>
        <p className="text-sm text-muted-foreground">Todos os vendedores da empresa · atualizado a cada 15 segundos</p>
      </div>
      <div className="flex items-center gap-2">
        {role === 'superadmin' && <select aria-label="Empresa" className="rounded-md border bg-background px-3 py-2 text-sm" value={empresaId} onChange={e => { setEmpresaId(e.target.value); setFiltro('todos'); setPaginaLeads(1); setPaginaTriagem(1); setSnapshot(null); }}>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>}
        <Button variant="outline" onClick={reload} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
      </div>
    </header>

    {!snapshot && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
      Indicadores indisponiveis. Nao interprete os valores como zero antes de conectar ao banco.
    </div>}
    {!!snapshot?.avisos?.length && <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm space-y-1">
      <strong>O painel esta parcialmente atualizado:</strong>
      {snapshot.avisos.map((aviso,idx) => <p key={idx}>{aviso}</p>)}
    </div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Filtros rápidos do atendimento">
      <Summary icon={<Activity className="h-5 w-5" />} title="Aguardando triagem"
        value={snapshot?.total_fila ?? null} active={filtro==='triagem'} disabled={!snapshot}
        controls="atendimento-lista-triagem" onClick={()=>aplicarFiltro('triagem')} />
      <Summary icon={<Clock3 className="h-5 w-5" />} title="Com vendedor, sem resposta"
        value={snapshot?.total_sem_resposta ?? null} active={filtro==='sem_resposta'} disabled={!snapshot}
        controls="atendimento-lista-leads" onClick={()=>aplicarFiltro('sem_resposta')} />
      <Summary icon={<AlertCircle className="h-5 w-5" />} title="Sem resposta +10 min"
        value={snapshot?.total_atrasados ?? null} active={filtro==='atrasados'} disabled={!snapshot}
        controls="atendimento-lista-leads" onClick={()=>aplicarFiltro('atrasados')} />
    </div>

    {filtro !== 'todos' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3" role="status">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Exibindo: {nomesFiltro[filtro]}</span>
        <span className="text-muted-foreground">· {filtro==='triagem' ? snapshot?.total_fila ?? '—' : filtro==='atrasados' ? snapshot?.total_atrasados ?? '—' : snapshot?.total_sem_resposta ?? '—'} lead(s)</span>
      </div>
      <Button variant="outline" size="sm" onClick={()=>{setFiltro('todos');setPaginaLeads(1);setPaginaTriagem(1);}}>Limpar filtro</Button>
    </div>}

    {mostrarLeads && <section id="atendimento-lista-leads" ref={listaLeadsRef} className="space-y-3 scroll-mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{filtro==='atrasados' ? 'Leads sem resposta há mais de 10 minutos' : 'Leads aguardando atendimento'}</h2>
        <span className="text-sm text-muted-foreground">{totalListaLeads ?? '—'} no total</span>
      </div>
      {!paginaCarregada && <p className="rounded-lg border p-5 text-muted-foreground">Carregando leads deste filtro…</p>}
      {paginaCarregada && !leadsNaPagina.length && <p className="rounded-lg border p-5 text-muted-foreground">Nenhum lead encontrado nesta situação.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {leadsNaPagina.map(l => {
          const eligible = sellers.filter(v => v.id !== l.vendedor_id && String(v.loja || '').toUpperCase() === String(l.loja || '').toUpperCase());
          const late = l.minutos_aguardando >= (snapshot?.limite_minutos ?? 10);
          return <article key={l.id} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong>{l.nome || `Lead #${l.id}`}</strong><div className="text-sm text-muted-foreground">{l.veiculo || 'Veiculo nao informado'}</div></div>
              <span className={`rounded px-2 py-1 text-xs font-medium ${late ? 'bg-destructive/15 text-destructive' : 'bg-muted'}`}>Ha {mins(l.minutos_aguardando)}</span>
            </div>
            <div className="text-sm">Com <b>{l.vendedor}</b> · Loja {l.loja || '—'}</div>
            <div className="text-xs text-muted-foreground break-all">{[l.telefone, l.email].filter(Boolean).join(' · ') || 'Sem telefone/e-mail'}</div>
            {l.mensagem && <p className="line-clamp-2 text-sm text-muted-foreground">{l.mensagem}</p>}
            <div className="flex flex-wrap gap-2">
              <select aria-label={`Novo vendedor para ${l.nome}`} className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm"
                value={chosen[l.id] || ''} onChange={e => setChosen(p => ({ ...p, [l.id]: e.target.value }))}>
                <option value="">Aleatorio na loja</option>
                {eligible.map(v => <option key={v.id} value={v.id}>{v.nome} · {v.loja}</option>)}
              </select>
              <Button variant="outline" disabled={transferring === l.id} onClick={() => transferir(l)}><ArrowRightLeft className="mr-1 h-4 w-4" />Transferir</Button>
              {role !== 'gerente' && !chosen[l.id] && <Button variant="secondary" disabled={transferring === l.id} onClick={() => transferir(l, 'empresa')}>Aleatorio empresa</Button>}
            </div>
          </article>;
        })}
      </div>
      <Paginacao atual={paginaLeads} porPagina={snapshot?.paginacao.por_pagina ?? 40}
        total={totalListaLeads ?? null} aoMudar={setPaginaLeads} />
    </section>}

    {mostrarTriagem && <section id="atendimento-lista-triagem" ref={listaTriagemRef} className="space-y-3 scroll-mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Novos leads na triagem</h2>
        <span className="text-sm text-muted-foreground">{snapshot?.total_fila ?? '—'} no total</span>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm"><thead className="border-b bg-muted/50"><tr>
          <th className="p-3">Contato</th><th className="p-3">Origem</th><th className="p-3">Veiculo</th><th className="p-3">Espera</th><th className="p-3">Acao</th>
        </tr></thead><tbody>{triagemNaPagina.map(l => <tr key={l.id} className="border-b last:border-0">
          <td className="p-3"><div className="font-medium">{l.nome}</div><div className="text-xs text-muted-foreground">{l.telefone || l.email || 'Sem contato'}</div></td>
          <td className="p-3">{l.origem || '—'}</td><td className="p-3">{l.veiculo || '—'}</td>
          <td className="p-3">{mins(l.minutos_aguardando)}</td><td className="p-3"><a className="text-primary underline" href="/triagem">Distribuir</a></td>
        </tr>)}</tbody></table>
        {!paginaCarregada && <p className="p-4 text-muted-foreground">Carregando triagem…</p>}
        {paginaCarregada && !triagemNaPagina.length && <p className="p-4 text-muted-foreground">Fila vazia.</p>}
      </div>
      <Paginacao atual={paginaTriagem} porPagina={snapshot?.paginacao.por_pagina ?? 40}
        total={snapshot?.total_fila ?? null} aoMudar={setPaginaTriagem} />
    </section>}

    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Users className="h-5 w-5" />Vendedores de todas as lojas da empresa</h2>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm"><thead className="border-b bg-muted/50"><tr>
          <th className="p-3">Vendedor</th><th className="p-3">Loja</th><th className="p-3">Leads atuais recebidos hoje</th>
          <th className="p-3">Pendentes +10 min</th><th className="p-3">Passados por atraso hoje</th><th className="p-3">Atendidos registrados</th>
        </tr></thead><tbody>{sellers.map(v => <tr key={v.id} className="border-b last:border-0">
          <td className="p-3 font-medium">{v.nome}</td><td className="p-3">{v.loja || '—'}</td>
          <td className="p-3">{v.recebidos_hoje}</td><td className="p-3">{v.pendentes_atrasados}</td><td className="p-3">{v.perdidos_hoje}</td><td className="p-3">{v.atendidos_registrados}</td>
        </tr>)}</tbody></table>
      </div>
      <p className="text-xs text-muted-foreground">“Pendente +10 min” significa que o lead segue sem resposta registrada no MANU; nao prova falta de contato fora do sistema. Contagem de recebidos considera apenas a atribuicao atual. Para auditoria historica de distribuicao, use o registro de eventos.</p>
    </section>
  </main>;
}
function Summary({ icon, title, value, active, disabled, controls, onClick }: {
  icon: ReactNode; title: string; value: number | null; active: boolean;
  disabled: boolean; controls: string; onClick: () => void;
}) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
    aria-controls={active ? controls : undefined} aria-label={`Filtrar: ${title}`}
    className={`group flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
      disabled:cursor-not-allowed disabled:opacity-60
      ${active ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : 'hover:border-primary/60 hover:bg-primary/5'}`}>
    <div className="rounded-lg bg-primary/10 p-3 text-primary">{icon}</div>
    <div className="min-w-0 flex-1"><p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold tabular-nums">{value === null ? '—' : value.toLocaleString('pt-BR')}</p>
    </div>
    <span aria-hidden="true" className="text-lg text-primary/70 group-hover:text-primary">{active?'✓':'›'}</span>
  </button>;
}
function Paginacao({atual,porPagina,total,aoMudar}: {
  atual:number;porPagina:number;total:number|null;aoMudar:(pagina:number)=>void;
}){
  if(total === null || total <= porPagina) return null;
  const paginas = Math.max(1,Math.ceil(total/porPagina));
  return <nav aria-label="Páginas de leads" className="flex flex-wrap items-center justify-center gap-3 py-3">
    <Button variant="outline" size="sm" disabled={atual <= 1} onClick={()=>aoMudar(Math.max(1,atual-1))}>Anterior</Button>
    <span className="text-sm text-muted-foreground" aria-live="polite">Página {atual} de {paginas} · {total.toLocaleString('pt-BR')} leads</span>
    <Button variant="outline" size="sm" disabled={atual >= paginas} onClick={()=>aoMudar(Math.min(paginas,atual+1))}>Próxima</Button>
  </nav>;
}
