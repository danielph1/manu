'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
  empresa_id: number; limite_minutos: number; total_pendentes: number;
  fila: Lead[]; sem_resposta: Lead[]; vendedores: Seller[]; atualizado_em: string; incompleto?: boolean; avisos?: string[];
}
interface Empresa { id: number; nome: string }
const permitted = new Set(['superadmin', 'admin', 'gerente', 'marketing']);
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
    setBusy(true);
    try {
      const res = await api.get('/atendimento', { params: { empresa_id: Number(empresaId) } });
      setSnapshot(res.data);
    } catch (e: any) {
      setSnapshot(null);
      toast.error(e?.response?.data?.error || 'Falha ao carregar o atendimento');
    } finally { setBusy(false); }
  }, [authorized, empresaId]);

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
  const missed = sellers.reduce((acc, v) => acc + Number(v.pendentes_atrasados || 0), 0);
  return <main className="mx-auto max-w-7xl space-y-6 pb-20">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">Gestao de atendimento</h1>
        <p className="text-sm text-muted-foreground">Todos os vendedores da empresa · atualizado a cada 15 segundos</p>
      </div>
      <div className="flex items-center gap-2">
        {role === 'superadmin' && <select aria-label="Empresa" className="rounded-md border bg-background px-3 py-2 text-sm" value={empresaId} onChange={e => setEmpresaId(e.target.value)}>
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Summary icon={<Activity className="h-5 w-5" />} title="Aguardando triagem" value={snapshot?.fila.length ?? null} />
      <Summary icon={<Clock3 className="h-5 w-5" />} title="Com vendedor, sem resposta" value={snapshot?.sem_resposta.length ?? null} />
      <Summary icon={<AlertCircle className="h-5 w-5" />} title="Sem resposta +10 min" value={snapshot ? missed : null} />
    </div>

    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Leads aguardando atendimento</h2>
      {!snapshot?.sem_resposta.length && <p className="rounded-lg border p-5 text-muted-foreground">Nenhum lead pendente de resposta.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {snapshot?.sem_resposta.map(l => {
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
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Novos leads na triagem</h2>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm"><thead className="border-b bg-muted/50"><tr>
          <th className="p-3">Contato</th><th className="p-3">Origem</th><th className="p-3">Veiculo</th><th className="p-3">Espera</th><th className="p-3">Acao</th>
        </tr></thead><tbody>{snapshot?.fila.map(l => <tr key={l.id} className="border-b last:border-0">
          <td className="p-3"><div className="font-medium">{l.nome}</div><div className="text-xs text-muted-foreground">{l.telefone || l.email || 'Sem contato'}</div></td>
          <td className="p-3">{l.origem || '—'}</td><td className="p-3">{l.veiculo || '—'}</td>
          <td className="p-3">{mins(l.minutos_aguardando)}</td><td className="p-3"><a className="text-primary underline" href="/triagem">Distribuir</a></td>
        </tr>)}</tbody></table>
        {!snapshot?.fila.length && <p className="p-4 text-muted-foreground">Fila vazia.</p>}
      </div>
    </section>

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
function Summary({ icon, title, value }: { icon: ReactNode; title: string; value: number | null }) {
  return <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
    <div className="rounded-lg bg-primary/10 p-3 text-primary">{icon}</div>
    <div><p className="text-sm text-muted-foreground">{title}</p><p className="text-2xl font-bold">{value === null ? '—' : value}</p></div>
  </div>;
}
