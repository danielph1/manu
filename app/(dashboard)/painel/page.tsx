'use client';
// Painel de Leads - integrado com API real
import { CarLoader } from '@/components/car-loader';
import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Search, Phone, UserCircle2, CheckCircle2, XCircle, Loader2, Edit, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { leadsService } from '@/lib/services';
import type { Lead, LeadFiltros } from '@/types';
import { LeadEditDialog } from '@/components/lead-edit-dialog';
import { useFavoritos } from '@/contexts/favoritos-context';

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'responderam', label: 'Responderam' },
  { value: 'nao_responderam', label: 'Nao responderam' },
  { value: 'fichas', label: 'Fichas' },
  { value: 'aprovados', label: 'Aprovados' },
  { value: 'vendidos', label: 'Vendidos' },
] as const;

export default function PainelPage() {
  const { user } = useAuth();
  const [filtro, setFiltro] = useState<LeadFiltros['filtro']>('todos');
  const [periodo, setPeriodo] = useState<LeadFiltros['periodo']>('mes');
  const [busca, setBusca] = useState('');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [loja, setLoja] = useState('');
  const [vendedorId, setVendedorId] = useState('');

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', filtro, periodo, loja, vendedorId],
    queryFn: () => leadsService.list({ filtro, periodo, loja: loja || undefined, vendedor_id: vendedorId || undefined }),
  });

  const { data: stats } = useQuery({
    queryKey: ['stats', periodo],
    queryFn: () => leadsService.stats({ periodo }),
  });

  const daLista = {
    total: leads.length,
    resp: leads.filter((l) => l.respondeu).length,
    fichas: leads.filter((l) => l.gerou_ficha).length,
    aprov: leads.filter((l) => (l as any).aprovado).length,
    vend: leads.filter((l) => l.venda_concluida).length,
  };
  const usarLista = filtro === 'todos';
  const totalLeads = (stats?.total_leads ?? stats?.total ?? 0) || (usarLista ? daLista.total : 0);
  const totalResp = (stats?.total_responderam ?? stats?.responderam ?? 0) || (usarLista ? daLista.resp : 0);
  const totalFichas = (stats?.total_fichas ?? stats?.fichas ?? 0) || (usarLista ? daLista.fichas : 0);
  const totalAprov = (stats?.total_aprovados ?? stats?.aprovados ?? 0) || (usarLista ? daLista.aprov : 0);
  const totalVend = (stats?.total_vendidos ?? stats?.vendidos ?? 0) || (usarLista ? daLista.vend : 0);

  const filteredLeads = useMemo(() => {
    if (!busca) return leads;
    const q = busca.toLowerCase();
    return leads.filter((l) =>
      l.nome_lead?.toLowerCase().includes(q) ||
      l.telefone?.toLowerCase().includes(q) ||
      l.cpf?.toLowerCase().includes(q) ||
      (l as any).observacao?.toLowerCase?.().includes(q),
    );
  }, [leads, busca]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">Painel de Controle</h1>
        <Link href="/novo-lead">
          <Button className="mt-4" size="lg">
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar lead
          </Button>
        </Link>
      </header>

      <section className="space-y-4">
        <div>
          <Label className="text-base">Filtro</Label>
          <RadioGroup
            className="mt-2 flex flex-wrap gap-5"
            value={filtro} onValueChange={(v) => setFiltro(v as any)}
          >
            {FILTROS.map((f) => (
              <div key={f.value} className="flex items-center gap-2">
                <RadioGroupItem value={f.value} id={`f-${f.value}`} />
                <Label htmlFor={`f-${f.value}`} className="cursor-pointer font-normal">{f.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {(user?.tipo === 'admin' || user?.tipo === 'gerente' || user?.tipo === 'marketing') && (
          <div className="flex flex-wrap gap-3">
            {(user?.tipo === 'admin' || user?.tipo === 'marketing') && (
              <div>
                <Label className="text-sm">Loja</Label>
                <select className="mt-1 block rounded border border-border bg-background px-2 py-1 text-sm" value={loja} onChange={(e) => setLoja(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="381">381</option>
                  <option value="764">764</option>
                  <option value="NINA">NINA</option>
                </select>
              </div>
            )}
            <div>
              <Label className="text-sm">Vendedor</Label>
              <VendedorSelect loja={user?.tipo === 'gerente' ? user.loja : loja} value={vendedorId} onChange={setVendedorId} />
            </div>
          </div>
        )}
        <div className="max-w-xs">
          <Label className="text-sm">Periodo</Label>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as any)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as datas</SelectItem>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mes</SelectItem>
              <SelectItem value="mes_passado">Mes passado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-6 md:grid-cols-5">
        <StatCard label="Total de leads" value={totalLeads} />
        <StatCard label="Responderam" value={totalResp} />
        <StatCard label="Fichas geradas" value={totalFichas} />
        <StatCard label="Aprovados" value={totalAprov} />
        <StatCard label="Vendidos" value={totalVend} />
      </section>

      <section className="space-y-3">
        <Label>Buscar lead</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Nome, CPF, telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Leads cadastrados</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLoading ? 'Carregando...' : `Exibindo ${filteredLeads.length} de ${leads.length} leads.`}
        </p>
        {isLoading && <CarLoader compact />}
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={() => setSelected(lead)} />
          ))}
        </div>
      </section>

      <LeadEditDialog lead={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const fav = useFavoritos();
  const marcado = fav.tem(Number(lead.id));
  return (
    <Card className="cursor-pointer transition hover:border-primary/60 hover:shadow-lg" onClick={onClick}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-lg font-semibold min-w-0">
            <UserCircle2 className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate">{lead.nome_lead}</span>
          </div>
          <button
            type="button"
            aria-label="Favoritar"
            onClick={(e) => { e.stopPropagation(); fav.toggle(Number(lead.id)); }}
            className="shrink-0 rounded-full p-1"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" style={{ fill: marcado ? 'rgb(220,72,127)' : 'rgb(167,167,167)', transform: marcado ? 'scale(1.15)' : 'scale(1)', transition: 'all 200ms' }}>
              <path d="M12 21.35l-1.45-1.32c-5.15-4.67-8.55-7.75-8.55-11.53 0-3.08 2.42-5.5 5.5-5.5 1.74 0 3.41.81 4.5 2.09 1.09-1.28 2.76-2.09 4.5-2.09 3.08 0 5.5 2.42 5.5 5.5 0 3.78-3.4 6.86-8.55 11.54l-1.45 1.31z"/>
            </svg>
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {lead.venda_concluida && <Badge className="bg-emerald-600 hover:bg-emerald-600">VENDA CONCLUIDA</Badge>}
          {(lead as any).em_loja && <Badge variant="outline" className="gap-1"><Store className="h-3 w-3" />Na loja</Badge>}
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>Vendedor: <span className="text-foreground capitalize">{lead.vendedor_nome ?? '-'}</span></div>
          {lead.produto_interesse && <div>Interesse: <span className="text-foreground">{lead.produto_interesse}</span></div>}
          {lead.telefone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.telefone}</div>}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <StatusChip label="Respondeu" ok={!!lead.respondeu} />
          <StatusChip label="Ficha" ok={!!lead.gerou_ficha} />
          <StatusChip label="Aprovado" ok={!!(lead as any).aprovado} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
      <Icon className="h-3 w-3" />{label}
    </div>
  );
}

function VendedorSelect({ loja, value, onChange }: { loja?: string; value: string; onChange: (v: string) => void }) {
  const { data } = useQuery({
    queryKey: ['vendedores-filtro', loja],
    queryFn: async () => (await api.get('/equipe')).data,
  });
  const lista = (Array.isArray(data) ? data : data?.vendedores || data?.equipe || []).filter((v: any) => !loja || String(v.loja || '').toUpperCase() === String(loja).toUpperCase());
  return (
    <select className="mt-1 block rounded border border-border bg-background px-2 py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Todos</option>
      {lista.map((v: any) => <option key={v.id} value={v.id}>{v.nome}</option>)}
    </select>
  );
}
