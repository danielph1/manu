'use client';
// Painel de Leads - integrado com API real
import { CarLoader } from '@/components/car-loader';
import { useMemo, useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/i18n-context';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Search, Phone, MessageSquare, UserCircle2, CheckCircle2, XCircle, Loader2, Edit, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { leadsService } from '@/lib/services';
import type { Lead, LeadFiltros } from '@/types';
import { LeadEditDialog } from '@/components/lead-edit-dialog';
import { useFavoritos } from '@/contexts/favoritos-context';

// labels via t() no componente

export default function PainelPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const FILTROS = [
    { value: 'todos', label: t('page.painel.all') },
    { value: 'responderam', label: t('page.painel.replied') },
    { value: 'nao_responderam', label: t('page.painel.not_replied') },
    { value: 'fichas', label: t('page.painel.sheets') },
    { value: 'aprovados', label: t('page.painel.approved') },
    { value: 'vendidos', label: t('page.painel.sold') },
  ] as const;

  const [filtro, setFiltro] = useState<LeadFiltros['filtro']>('todos');
  const [periodo, setPeriodo] = useState<LeadFiltros['periodo']>('mes');
  const [busca, setBusca] = useState('');
  const [carroceria, setCarroceria] = useState('todas');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [loja, setLoja] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [pins, setPins] = useState<number[]>([]);
  useEffect(() => { setPins(loadPins()); }, []);
  const togglePin = (id: number) => {
    setPins((prev) => {
      let next: number[];
      if (prev.includes(id)) next = prev.filter((x) => x !== id);
      else if (prev.length >= 3) {
        // max 3 — remove o mais antigo e adiciona
        next = [...prev.slice(1), id];
      } else next = [...prev, id];
      savePins(next);
      return next;
    });
  };
  const handleDeleteLead = async (id: number) => {
    if (!confirm('Apagar este lead? Esta ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/leads/${id}`);
      qc.invalidateQueries({ queryKey: ['leads'] });
      setPins((prev) => {
        const next = prev.filter((x) => x !== id);
        savePins(next);
        return next;
      });
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Falha ao apagar lead');
    }
  };


  const qc = useQueryClient();
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', filtro, periodo, loja, vendedorId],
    queryFn: () => leadsService.list({ filtro, periodo, loja: loja || undefined, vendedor_id: vendedorId || undefined }),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const { data: stats } = useQuery({
    queryKey: ['stats', periodo],
    queryFn: () => leadsService.stats({ periodo }),
    refetchInterval: 10000,
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
    let arr = leads;
    if (busca) {
      const q = busca.toLowerCase();
      arr = arr.filter((l) =>
        l.nome_lead?.toLowerCase().includes(q) ||
        l.telefone?.toLowerCase().includes(q) ||
        l.cpf?.toLowerCase().includes(q) ||
        (l as any).observacao?.toLowerCase?.().includes(q) ||
        (l as any).produto_interesse?.toLowerCase?.().includes(q) ||
        (l as any).carroceria?.toLowerCase?.().includes(q),
      );
    }
    if (carroceria && carroceria !== 'todas') {
      const f = carroceria.toLowerCase();
      arr = arr.filter((l) => {
        const blob = `${(l as any).carroceria || ''} ${(l as any).produto_interesse || ''} ${(l as any).marca_carro || ''} ${(l as any).modelo || ''}`.toLowerCase();
        return blob.includes(f);
      });
    }
    // fixados primeiro (máx 3)
    const pinSet = new Set(pins);
    const pinned = arr.filter((l) => pinSet.has(Number(l.id)));
    const rest = arr.filter((l) => !pinSet.has(Number(l.id)));
    // mantém ordem dos pins conforme gravado
    pinned.sort((a, b) => pins.indexOf(Number(a.id)) - pins.indexOf(Number(b.id)));
    return [...pinned, ...rest];
  }, [leads, busca, carroceria, pins]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">{t('page.painel.title')}</h1>
        <Link href="/novo-lead">
          <Button className="mt-4" size="lg">
            <PlusCircle className="mr-2 h-4 w-4" /> {t('page.painel.add_lead')}
          </Button>
        </Link>
      </header>

      <section className="space-y-4">
        <div>
          <Label className="text-base">{t('page.painel.filter')}</Label>
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
          <Label className="text-sm">{t('page.painel.period')}</Label>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as any)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as datas</SelectItem>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">{t('page.painel.this_month')}</SelectItem>
              <SelectItem value="mes_passado">{t('page.painel.last_month')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-6 md:grid-cols-5">
        <StatCard label={t('page.painel.total_leads')} value={totalLeads} />
        <StatCard label={t('page.painel.replied_n')} value={totalResp} />
        <StatCard label={t('page.painel.sheets_n')} value={totalFichas} />
        <StatCard label={t('page.painel.approved_n')} value={totalAprov} />
        <StatCard label={t('page.painel.sold_n')} value={totalVend} />
      </section>

      <section className="space-y-3">
        <Label>{t('page.painel.search_lead')}</Label>
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder={t('page.painel.search_ph')} value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <select
            className="rounded-md border border-border bg-background px-3 text-sm"
            value={carroceria}
            onChange={(e) => setCarroceria(e.target.value)}
          >
            <option value="todas">Carroceria: todas</option>
            <option value="hatch">hatch</option>
            <option value="sedan">sedan</option>
            <option value="suv">suv</option>
            <option value="pickup">pickup</option>
            <option value="utilitario">utilitario</option>
            <option value="van">van</option>
          </select>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">{t('page.painel.leads_list')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLoading ? 'Carregando...' : `Exibindo ${filteredLeads.length} de ${leads.length} leads.`}
        </p>
        {isLoading && <CarLoader compact />}
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={() => setSelected(lead)} pinned={pins.includes(Number(lead.id))} onPin={togglePin} onDelete={handleDeleteLead} />
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


const PINS_KEY = 'manu.lead.pins';
function loadPins(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PINS_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(Number).filter(Boolean).slice(0, 3) : [];
  } catch {
    return [];
  }
}
function savePins(ids: number[]) {
  localStorage.setItem(PINS_KEY, JSON.stringify(ids.slice(0, 3)));
}

function LeadCard({
  lead,
  onClick,
  pinned,
  onPin,
  onDelete,
}: {
  lead: Lead;
  onClick: () => void;
  pinned?: boolean;
  onPin?: (id: number) => void;
  onDelete?: (id: number) => void;
}) {
  const fav = useFavoritos();
  const marcado = fav.tem(Number(lead.id));
  const [dx, setDx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    moved.current = false;
    setSwiping(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null || startY.current == null) return;
    const x = e.touches[0].clientX - startX.current;
    const y = Math.abs(e.touches[0].clientY - startY.current);
    if (y > 30 && Math.abs(x) < 20) {
      // scroll vertical — cancela
      startX.current = null;
      setDx(0);
      setSwiping(false);
      return;
    }
    if (Math.abs(x) > 8) moved.current = true;
    // limita arrasto visual
    setDx(Math.max(-110, Math.min(110, x)));
  };
  const onTouchEnd = () => {
    if (moved.current) {
      if (dx > 70) onPin?.(Number(lead.id)); // direita → fixar
      if (dx < -70) onDelete?.(Number(lead.id)); // esquerda → apagar
    }
    setDx(0);
    setSwiping(false);
    startX.current = null;
    startY.current = null;
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* ações de fundo */}
      <div className="pointer-events-none absolute inset-0 flex">
        <div className="flex w-1/2 items-center justify-start bg-amber-600/90 pl-4 text-sm font-medium text-white">
          {pinned ? 'Desafixar' : 'Fixar'}
        </div>
        <div className="flex w-1/2 items-center justify-end bg-rose-600/90 pr-4 text-sm font-medium text-white">
          Apagar
        </div>
      </div>
      <Card
        className="relative cursor-pointer transition hover:border-primary/60 hover:shadow-lg"
        style={{
          transform: `translateX(${dx}px)`,
          transition: swiping ? 'none' : 'transform 180ms ease',
        }}
        onClick={() => {
          if (!moved.current) onClick();
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-lg font-semibold min-w-0">
              <UserCircle2 className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate">{lead.nome_lead}</span>
              {pinned && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                  FIXO
                </span>
              )}
            </div>
            <a
              href={`/chat?lead=${lead.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-foreground"
              aria-label="Chat"
            >
              <MessageSquare className="h-4 w-4" />
            </a>
            <button
              type="button"
              aria-label="Favoritar"
              onClick={(e) => {
                e.stopPropagation();
                fav.toggle(Number(lead.id));
              }}
              className="shrink-0 rounded-full p-1"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                style={{
                  fill: marcado ? 'rgb(220,72,127)' : 'rgb(167,167,167)',
                  transform: marcado ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 200ms',
                }}
              >
                <path d="M12 21.35l-1.45-1.32c-5.15-4.67-8.55-7.75-8.55-11.53 0-3.08 2.42-5.5 5.5-5.5 1.74 0 3.41.81 4.5 2.09 1.09-1.28 2.76-2.09 4.5-2.09 3.08 0 5.5 2.42 5.5 5.5 0 3.78-3.4 6.86-8.55 11.54l-1.45 1.31z" />
              </svg>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lead.venda_concluida && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">VENDA CONCLUIDA</Badge>
            )}
            {(lead as any).em_loja && (
              <Badge variant="outline" className="gap-1">
                <Store className="h-3 w-3" />
                Na loja
              </Badge>
            )}
            {(lead as any).aprovado === true && (
              <Badge className="bg-blue-600 hover:bg-blue-600">Aprovado</Badge>
            )}
            {(lead as any).aprovado === false && lead.gerou_ficha && (
              <Badge className="bg-rose-600 hover:bg-rose-600">Recusado</Badge>
            )}
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            <div>
              Vendedor:{' '}
              <span className="text-foreground capitalize">{lead.vendedor_nome ?? '-'}</span>
            </div>
            {lead.produto_interesse && (
              <div>
                Interesse: <span className="text-foreground">{lead.produto_interesse}</span>
              </div>
            )}
            {lead.telefone && (
              <div className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                <a
                  href={`https://wa.me/55${String(lead.telefone).replace(/\\D/g, '')}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {lead.telefone}
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
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
