'use client';
import { CarLoader } from '@/components/car-loader';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Store, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { FichaEditDialog } from '@/components/ficha-edit-dialog';
import { useAuth } from '@/contexts/auth-context';
import { chanceAprovacao } from '@/lib/credito-chance';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BANCOS_REF = ['Itau', 'BV', 'Creditas', 'Bradesco', 'Pan', 'Safra', 'Santander', 'Volkswagen'];

/** Melhor chance entre os bancos da lista (cálculo local, sem lag no servidor). */
function melhorChance(f: any) {
  const score = f.score == null || f.score === '' ? null : Number(f.score);
  if (score == null || Number.isNaN(score)) {
    return { nivel: 'sem_score' as const, label: 'sem score', banco: null as string | null, p: null as number | null };
  }
  let best: ReturnType<typeof chanceAprovacao> & { banco: string } | null = null;
  for (const banco of BANCOS_REF) {
    const c = chanceAprovacao({
      score,
      banco,
      valorEntrada: Number(f.valor_entrada_calc ?? f.valor_entrada) || null,
      valorCarro: Number(f.valor_veiculo_calc ?? f.valor_veiculo) || null,
    });
    if (!c.ok || c.p == null) continue;
    if (!best || (c.p > (best.p || 0))) best = { ...c, banco };
  }
  if (!best) return { nivel: 'sem_score' as const, label: 'sem score', banco: null, p: null };
  return { nivel: best.nivel, label: best.label, banco: best.banco, p: best.p };
}

const statusColor: Record<string, string> = {
  aprovada: 'bg-green-400',
  reprovada: 'bg-rose-600',
  negada: 'bg-rose-600',
  pendente: 'bg-gray-900',
  enviada: 'bg-blue-600',
};

export default function FichasPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<number | null>(null);
  const [periodo, setPeriodo] = useState('todas');
  const [status, setStatus] = useState('todos');
  const [busca, setBusca] = useState('');

  const { data: fichas = [], isLoading, error } = useQuery({
    queryKey: ['fichas', periodo, busca],
    queryFn: async () => (await api.get('/fichas', { params: { periodo, busca } })).data,
  });

  const todas = Array.isArray(fichas) ? fichas : [];
  const st = (f: any) => String(f.status_geral || 'pendente').toLowerCase();
  const nAprov = todas.filter((f) => st(f).startsWith('aprov')).length;
  const nNeg = todas.filter((f) => ['negada', 'reprovada', 'negado', 'recusada'].includes(st(f))).length;
  const nPend = todas.filter((f) => !st(f).startsWith('aprov') && !['negada', 'reprovada', 'negado', 'recusada'].includes(st(f))).length;
  const lista = todas.filter((f) => {
    if (status === 'aprovadas') return st(f).startsWith('aprov');
    if (status === 'negadas') return ['negada', 'reprovada', 'negado', 'recusada'].includes(st(f));
    if (status === 'pendentes') return !st(f).startsWith('aprov') && !['negada', 'reprovada', 'negado', 'recusada'].includes(st(f));
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Fichas de Credito</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin, gerente e elfenAI veem todas. Cliente na loja fica no topo.
          </p>
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, CPF, placa, vendedor..." className="mr-2 rounded border border-border bg-card px-3 py-1.5 text-sm" />
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todo período</SelectItem>
            <SelectItem value="mes">Este mês</SelectItem>
            <SelectItem value="mes_passado">Mês passado</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button onClick={() => setStatus('todos')} className={`rounded-lg border p-3 text-left ${status === 'todos' ? 'border-primary' : 'border-border'}`}>
          <div className="text-xs text-muted-foreground">Fichas</div><div className="text-2xl font-bold">{todas.length}</div>
        </button>
        <button onClick={() => setStatus('pendentes')} className={`rounded-lg border p-3 text-left ${status === 'pendentes' ? 'border-primary' : 'border-border'}`}>
          <div className="text-xs text-muted-foreground">Pendentes</div><div className="text-2xl font-bold">{nPend}</div>
        </button>
        <button onClick={() => setStatus('aprovadas')} className={`rounded-lg border p-3 text-left ${status === 'aprovadas' ? 'border-primary' : 'border-border'}`}>
          <div className="text-xs text-muted-foreground">Aprovadas</div><div className="text-2xl font-bold text-emerald-400">{nAprov}</div>
        </button>
        <button onClick={() => setStatus('negadas')} className={`rounded-lg border p-3 text-left ${status === 'negadas' ? 'border-primary' : 'border-border'}`}>
          <div className="text-xs text-muted-foreground">Recusadas</div><div className="text-2xl font-bold text-rose-400">{nNeg}</div>
        </button>
      </div>

      {isLoading && <CarLoader compact />}
      {error && <p className="text-rose-400">Erro ao carregar fichas.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {lista.map((f: any) => {
          const mc = melhorChance(f);
          const chanceCls =
            mc.nivel === 'alto'
              ? 'bg-sky-500/15 text-sky-400 border-sky-500/40'
              : mc.nivel === 'medio'
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                : mc.nivel === 'baixo'
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/40'
                  : 'bg-muted text-muted-foreground border-border';
          return (
          <Card
            key={f.id}
            className={`cursor-pointer transition hover:border-primary/60 hover:shadow-lg ${f.comprou ? 'opacity-70' : ''}`}
            onClick={() => setSelected(f.id)}
          >
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-lg font-semibold min-w-0">
                  <FileText className="h-5 w-5 shrink-0 text-primary" />
                  <span className="truncate">{f.lead_nome || `Lead #${f.lead_id}`}</span>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {f.em_loja && !f.comprou && <Badge variant="outline" className="gap-1 border-amber-500 text-amber-400"><Store className="h-3 w-3" />Na loja</Badge>}
                  {f.comprou && <Badge className="bg-emerald-600 gap-1"><CheckCircle2 className="h-3 w-3" />Concluido</Badge>}
                  <Badge variant="outline" className={`text-[10px] ${chanceCls}`}>
                    {mc.nivel === 'sem_score'
                      ? 'sem score'
                      : `${mc.label}${mc.p != null ? ` ${Math.round(mc.p * 100)}%` : ''}${mc.banco ? ` · ${mc.banco}` : ''}`}
                  </Badge>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {f.vendedor_nome || '—'} · {f.status_geral || 'pendente'}
              </div>
              <span className={`inline-block h-2 w-2 rounded-full ${statusColor[String(f.status_geral || '').toLowerCase()] || 'bg-gray-500'}`} />
            </CardContent>
          </Card>
          );
        })}
      </div>
      {!isLoading && lista.length === 0 && <p className="text-muted-foreground">Nenhuma ficha encontrada.</p>}
      <FichaEditDialog fichaId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
