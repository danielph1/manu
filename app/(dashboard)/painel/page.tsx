'use client';
// Painel de Leads — swipe estilo WhatsApp, listas pessoais, fixar/agendar
import { CarLoader } from '@/components/car-loader';
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
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
import {
  PlusCircle, Search, Phone, MessageSquare, UserCircle2, Loader2, Store,
  Info, Heart, ListPlus, Trash2, Calendar, X, Plus, Pin,
} from 'lucide-react';
import { api } from '@/lib/api';
import { leadsService } from '@/lib/services';
import type { Lead, LeadFiltros } from '@/types';
import { LeadEditDialog } from '@/components/lead-edit-dialog';
import { useFavoritos } from '@/contexts/favoritos-context';
import { toast } from 'sonner';

/* ───────── listas pessoais (por usuário, localStorage) ───────── */
type Lista = { id: string; nome: string; leadIds: number[]; sistema?: boolean };

function listasKey(uid: number | string) {
  return `manu.listas.${uid}`;
}
function loadListas(uid: number | string): Lista[] {
  try {
    const raw = JSON.parse(localStorage.getItem(listasKey(uid)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function saveListas(uid: number | string, listas: Lista[]) {
  localStorage.setItem(listasKey(uid), JSON.stringify(listas));
}

const AGENDADOS_ID = '__agendados__';

export default function PainelPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const uid = user?.id ?? 0;

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
  const [listaAtiva, setListaAtiva] = useState<string>('todos');
  const [listas, setListas] = useState<Lista[]>([]);
  const [menuLead, setMenuLead] = useState<Lead | null>(null); // menu de ações (swipe/⋯)
  const [agendarLead, setAgendarLead] = useState<Lead | null>(null);
  const [agendarValor, setAgendarValor] = useState('');
  const [pickListaLead, setPickListaLead] = useState<Lead | null>(null);
  const [pins, setPins] = useState<number[]>([]);


  useEffect(() => {
    if (!uid) return;
    setListas(loadListas(uid));
    try {
      const raw = JSON.parse(localStorage.getItem('manu.lead.pins') || '[]');
      setPins(Array.isArray(raw) ? raw.map(Number).filter(Boolean).slice(0, 3) : []);
    } catch { setPins([]); }
  }, [uid]);

  const togglePin = (id: number) => {
    setPins((prev) => {
      let next: number[];
      if (prev.includes(id)) next = prev.filter((x) => x !== id);
      else if (prev.length >= 3) next = [...prev.slice(1), id];
      else next = [...prev, id];
      localStorage.setItem('manu.lead.pins', JSON.stringify(next));
      return next;
    });
  };


  const persistListas = useCallback(
    (next: Lista[]) => {
      setListas(next);
      if (uid) saveListas(uid, next);
    },
    [uid],
  );

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', filtro, periodo, loja, vendedorId],
    queryFn: () =>
      leadsService.list({
        filtro,
        periodo,
        loja: loja || undefined,
        vendedor_id: vendedorId || undefined,
      }),
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
    let arr = [...leads];
    if (busca) {
      const q = busca.toLowerCase();
      arr = arr.filter(
        (l) =>
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

    // filtro por lista
    if (listaAtiva === AGENDADOS_ID) {
      arr = arr.filter((l) => !!(l as any).data_hora_visita || !!(l as any).data_agendamento);
      // mais próximo primeiro
      arr.sort((a, b) => {
        const da = new Date((a as any).data_hora_visita || (a as any).data_agendamento || 0).getTime();
        const db = new Date((b as any).data_hora_visita || (b as any).data_agendamento || 0).getTime();
        return da - db;
      });
    } else if (listaAtiva !== 'todos') {
      const L = listas.find((x) => x.id === listaAtiva);
      const ids = new Set(L?.leadIds || []);
      arr = arr.filter((l) => ids.has(Number(l.id)));
    }

    // fixados no topo
    if (pins.length) {
      const pinSet = new Set(pins);
      const pinned = arr.filter((l) => pinSet.has(Number(l.id)));
      const rest = arr.filter((l) => !pinSet.has(Number(l.id)));
      pinned.sort((a, b) => pins.indexOf(Number(a.id)) - pins.indexOf(Number(b.id)));
      arr = [...pinned, ...rest];
    }
    return arr;
  }, [leads, busca, carroceria, listaAtiva, listas, pins]);

  function criarLista() {
    const nome = prompt('Nome da nova lista:');
    if (!nome?.trim()) return;
    const id = `l_${Date.now()}`;
    persistListas([...listas, { id, nome: nome.trim(), leadIds: [] }]);
    setListaAtiva(id);
  }

  function removerLista(id: string) {
    if (id === 'todos' || id === AGENDADOS_ID) return;
    const L = listas.find((x) => x.id === id);
    if (!L) return;
    if (!confirm(`Remover a lista "${L.nome}"? Os leads não são apagados — só a lista.`)) return;
    persistListas(listas.filter((x) => x.id !== id));
    if (listaAtiva === id) setListaAtiva('todos');
  }


  function addLeadNaLista(leadId: number, listaId: string) {
    persistListas(
      listas.map((L) =>
        L.id === listaId
          ? { ...L, leadIds: L.leadIds.includes(leadId) ? L.leadIds : [...L.leadIds, leadId] }
          : L,
      ),
    );
    toast.success('Lead adicionado à lista');
    setPickListaLead(null);
    setMenuLead(null);
  }

  async function handleDeleteLead(id: number) {
    if (!confirm('Apagar este lead? Esta ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/leads/${id}`);
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead apagado');
      setMenuLead(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Falha ao apagar');
    }
  }

  async function salvarAgendamento() {
    if (!agendarLead || !agendarValor) return;
    try {
      await leadsService.update(agendarLead.id, { data_hora_visita: agendarValor });
      toast.success('Agendamento salvo');
      qc.invalidateQueries({ queryKey: ['leads'] });
      setAgendarLead(null);
      setMenuLead(null);
      setListaAtiva(AGENDADOS_ID);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao agendar');
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
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
            value={filtro}
            onValueChange={(v) => setFiltro(v as any)}
          >
            {FILTROS.map((f) => (
              <div key={f.value} className="flex items-center gap-2">
                <RadioGroupItem value={f.value} id={`f-${f.value}`} />
                <Label htmlFor={`f-${f.value}`} className="cursor-pointer font-normal">
                  {f.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {(user?.tipo === 'admin' ||
          user?.tipo === 'gerente' ||
          user?.tipo === 'marketing' ||
          user?.tipo === 'superadmin') && (
          <div className="flex flex-wrap gap-3">
            {(user?.tipo === 'admin' || user?.tipo === 'marketing' || user?.tipo === 'superadmin') && (
              <div>
                <Label className="text-sm">Loja</Label>
                <select
                  className="mt-1 block rounded border border-border bg-background px-2 py-1 text-sm"
                  value={loja}
                  onChange={(e) => setLoja(e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="381">381</option>
                  <option value="764">764</option>
                  <option value="NINA">NINA</option>
                </select>
              </div>
            )}
            <div>
              <Label className="text-sm">Vendedor</Label>
              <VendedorSelect
                loja={user?.tipo === 'gerente' ? user.loja || undefined : loja}
                value={vendedorId}
                onChange={setVendedorId}
              />
            </div>
          </div>
        )}

        <div className="max-w-xs">
          <Label className="text-sm">{t('page.painel.period')}</Label>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mês</SelectItem>
              <SelectItem value="todas">Todo período</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* métricas */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Leads', totalLeads],
            ['Responderam', totalResp],
            ['Fichas', totalFichas],
            ['Aprovados', totalAprov],
            ['Vendidos', totalVend],
          ].map(([lab, val]) => (
            <Card key={String(lab)}>
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold">{val as any}</div>
                <div className="text-xs text-muted-foreground">{lab}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Label className="text-sm">Buscar lead</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Nome, CPF, telefone..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-sm">Carroceria</Label>
            <select
              className="mt-1 block rounded border border-border bg-background px-2 py-1 text-sm"
              value={carroceria}
              onChange={(e) => setCarroceria(e.target.value)}
            >
              <option value="todas">todas</option>
              <option value="hatch">hatch</option>
              <option value="sedan">sedan</option>
              <option value="suv">suv</option>
              <option value="pickup">pickup</option>
            </select>
          </div>
        </div>
      </section>

      
      {/* chips de listas — abaixo da busca, acima dos cards */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <Chip active={listaAtiva === 'todos'} onClick={() => setListaAtiva('todos')}>
          Todos
        </Chip>
        <Chip active={listaAtiva === AGENDADOS_ID} onClick={() => setListaAtiva(AGENDADOS_ID)}>
          <Calendar className="mr-1 h-3.5 w-3.5" /> Agendados
        </Chip>
        {listas.map((L) => (
          <Chip
            key={L.id}
            active={listaAtiva === L.id}
            onClick={() => setListaAtiva(L.id)}
            onRemove={() => removerLista(L.id)}
          >
            {L.nome}
          </Chip>
        ))}
        <button
          type="button"
          onClick={criarLista}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
          title="Nova lista"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

<section>
        <h2 className="text-xl font-semibold">Leads cadastrados</h2>
        <p className="text-sm text-muted-foreground">
          Exibindo {filteredLeads.length} de {leads.length} leads.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <CarLoader />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                pinned={pins.includes(Number(lead.id))}
                onOpen={() => setSelected(lead)}
                onMenu={() => setMenuLead(lead)}
                onPin={togglePin}
              />
            ))}
          </div>
        )}
      </section>

      <LeadEditDialog lead={selected} onClose={() => setSelected(null)} />

      {/* menu de ações — estilo WhatsApp (abre no swipe ESQ no mobile ou no ⋯) */}
      {menuLead && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setMenuLead(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl border border-border bg-card p-2 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 px-3 py-2 text-sm font-medium text-muted-foreground truncate">
              {menuLead.nome_lead}
            </div>
            <ActionRow
              icon={<Info className="h-5 w-5" />}
              label="Informações"
              onClick={() => {
                setSelected(menuLead);
                setMenuLead(null);
              }}
            />
            <ActionRow
              icon={<Heart className="h-5 w-5" />}
              label="Adicionar aos favoritos"
              onClick={() => {
                fav.toggle(Number(menuLead.id));
                toast.success('Favoritos atualizado');
                setMenuLead(null);
              }}
            />
            <ActionRow
              icon={<ListPlus className="h-5 w-5" />}
              label="Adicionar à lista"
              onClick={() => {
                setPickListaLead(menuLead);
                setMenuLead(null);
              }}
            />
            <ActionRow
              icon={<Pin className="h-5 w-5" />}
              label={pins.includes(Number(menuLead.id)) ? 'Desafixar' : 'Fixar (máx. 3)'}
              onClick={() => {
                togglePin(Number(menuLead.id));
                setMenuLead(null);
              }}
            />
            <ActionRow
              icon={<Calendar className="h-5 w-5" />}
              label="Agendar"
              onClick={() => {
                setAgendarLead(menuLead);
                setAgendarValor(
                  String((menuLead as any).data_hora_visita || '').slice(0, 16) || '',
                );
                setMenuLead(null);
              }}
            />
            <ActionRow
              icon={<Trash2 className="h-5 w-5 text-rose-500" />}
              label="Deletar lead"
              danger
              onClick={() => handleDeleteLead(Number(menuLead.id))}
            />
            <button
              type="button"
              className="mt-1 w-full rounded-xl py-3 text-sm text-muted-foreground hover:bg-muted"
              onClick={() => setMenuLead(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* escolher lista */}
      {pickListaLead && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setPickListaLead(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl border border-border bg-card p-3 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-sm font-semibold">Escolher lista</div>
            <button
              type="button"
              className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted"
              onClick={() => {
                criarLista();
              }}
            >
              <Plus className="h-4 w-4" /> Nova lista
            </button>
            {listas.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Nenhuma lista ainda.</p>
            )}
            {listas.map((L) => (
              <button
                key={L.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted"
                onClick={() => addLeadNaLista(Number(pickListaLead.id), L.id)}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                {L.nome}
              </button>
            ))}
            <button
              type="button"
              className="mt-2 w-full rounded-xl py-2 text-sm text-muted-foreground"
              onClick={() => setPickListaLead(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* agendar */}
      {agendarLead && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setAgendarLead(null)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-t-2xl border border-border bg-card p-4 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-semibold">Agendar — {agendarLead.nome_lead}</div>
            <Input
              type="datetime-local"
              value={agendarValor}
              onChange={(e) => setAgendarValor(e.target.value)}
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={salvarAgendamento} disabled={!agendarValor}>
                Salvar
              </Button>
              <Button variant="outline" onClick={() => setAgendarLead(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  onRemove,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? 'border-primary bg-primary/15 text-primary'
          : 'border-border bg-card text-muted-foreground hover:border-primary/50'
      }`}
    >
      <button type="button" onClick={onClick} className="flex items-center">
        {children}
      </button>
      {onRemove && (
        <button
          type="button"
          title="Remover lista"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full p-0.5 opacity-70 hover:bg-rose-500/20 hover:text-rose-400 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted ${
        danger ? 'text-rose-500' : ''
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** Card com swipe só no touch; no desktop usa botão ⋯ */

function extractMarketplaceLink(obs?: string | null, extra?: string | null): string | null {
  const text = `${obs || ''}\n${extra || ''}`;
  const m = text.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s]+/i);
  if (m) return m[0].replace(/[),.;]+$/, '');
  const m2 = text.match(/link:\s*(https?:\/\/\S+)/i);
  if (m2) return m2[1].replace(/[),.;]+$/, '');
  return null;
}

function LeadCard({
  lead,
  pinned,
  onOpen,
  onMenu,
  onPin,
}: {
  lead: Lead;
  pinned?: boolean;
  onOpen: () => void;
  onMenu: () => void;
  onPin?: (id: number) => void;
}) {
  const fav = useFavoritos();
  const marcado = fav.tem(Number(lead.id));
  const [dx, setDx] = useState(0);
  const [locked, setLocked] = useState<'left' | 'right' | null>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);
  const dxRef = useRef(0);

  useEffect(() => {
    if (!locked) return;
    const close = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-swipe-action]')) return;
      setLocked(null);
      setDx(0);
      dxRef.current = 0;
    };
    const tmr = window.setTimeout(() => {
      window.addEventListener('click', close);
      window.addEventListener('touchstart', close, { passive: true });
    }, 80);
    return () => {
      window.clearTimeout(tmr);
      window.removeEventListener('click', close);
      window.removeEventListener('touchstart', close);
    };
  }, [locked]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (locked) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    moved.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (locked || startX.current == null || startY.current == null) return;
    const x = e.touches[0].clientX - startX.current;
    const y = Math.abs(e.touches[0].clientY - startY.current);
    if (y > 28 && Math.abs(x) < 16) {
      startX.current = null;
      return;
    }
    if (Math.abs(x) > 12) moved.current = true;
    const clamped = Math.max(-100, Math.min(100, x));
    dxRef.current = clamped;
    setDx(clamped);
  };
  const onTouchEnd = () => {
    if (locked) {
      startX.current = null;
      return;
    }
    const x = dxRef.current;
    if (moved.current && x <= -56) {
      // esquerda → Ações
      setLocked('left');
      setDx(-88);
      dxRef.current = -88;
    } else if (moved.current && x >= 56) {
      // direita → Fixar
      setLocked('right');
      setDx(88);
      dxRef.current = 88;
    } else {
      setDx(0);
      dxRef.current = 0;
      setLocked(null);
    }
    startX.current = null;
    startY.current = null;
  };

  const agendado = !!(lead as any).data_hora_visita || !!(lead as any).data_agendamento;
  const fbLink = extractMarketplaceLink((lead as any).observacao, (lead as any).produto_interesse);

  const showPin = locked === 'right' || dx > 12;
  const showAct = locked === 'left' || dx < -12;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* direita do dedo = Fixar (faixa à esquerda) */}
      <div
        className="absolute inset-y-0 left-0 flex w-[88px] items-stretch"
        style={{ opacity: showPin ? 1 : 0 }}
      >
        <button
          type="button"
          data-swipe-action
          className="flex w-full flex-col items-center justify-center gap-1 bg-amber-600 text-[11px] font-medium text-white"
          onClick={(e) => {
            e.stopPropagation();
            onPin?.(Number(lead.id));
            setLocked(null);
            setDx(0);
            dxRef.current = 0;
          }}
        >
          <Pin className="h-5 w-5" />
          {pinned ? 'Desafixar' : 'Fixar'}
        </button>
      </div>

      {/* esquerda do dedo = Ações (faixa à direita) */}
      <div
        className="absolute inset-y-0 right-0 flex w-[88px] items-stretch"
        style={{ opacity: showAct ? 1 : 0 }}
      >
        <button
          type="button"
          data-swipe-action
          className="flex w-full flex-col items-center justify-center gap-1 bg-sky-600 text-[11px] font-medium text-white"
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
            setLocked(null);
            setDx(0);
            dxRef.current = 0;
          }}
        >
          <Info className="h-5 w-5" />
          Ações
        </button>
      </div>

      <Card
        className="relative cursor-pointer bg-card transition hover:border-primary/60 hover:shadow-lg"
        style={{
          transform: `translateX(${dx}px)`,
          transition: startX.current != null ? 'none' : 'transform 180ms ease',
        }}
        onClick={() => {
          if (locked) {
            setLocked(null);
            setDx(0);
            dxRef.current = 0;
            return;
          }
          if (!moved.current) onOpen();
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          if (!locked) {
            setDx(0);
            dxRef.current = 0;
          }
          startX.current = null;
        }}
      >
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-lg font-semibold">
              <UserCircle2 className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate">{lead.nome_lead}</span>
              {pinned && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                  FIXO
                </span>
              )}
              {agendado && (
                <span title="Agendado">
                  <Calendar className="h-4 w-4 shrink-0 text-amber-400" />
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {fbLink && (
                <a
                  href={fbLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-8 items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 text-[10px] font-medium text-blue-600 dark:text-blue-400"
                  aria-label="Abrir no Facebook"
                  title="Abrir anúncio / mensagem no Facebook"
                >
                  FB
                </a>
              )}
              <a
                href={`/chat?lead=${lead.id}`}
                onClick={(e) => e.stopPropagation()}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border"
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
                className="rounded-full p-1"
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
              <button
                type="button"
                aria-label="Mais ações"
                onClick={(e) => {
                  e.stopPropagation();
                  onMenu();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
              >
                ⋯
              </button>
            </div>
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
              <span className="capitalize text-foreground">{lead.vendedor_nome ?? '-'}</span>
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
                  href={`https://wa.me/55${String(lead.telefone).replace(/\D/g, '')}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {lead.telefone}
                </a>
              </div>
            )}
            {agendado && (
              <div className="text-amber-400">
                Agendado:{' '}
                {new Date(
                  (lead as any).data_hora_visita || (lead as any).data_agendamento,
                ).toLocaleString('pt-BR')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function VendedorSelect({
  loja,
  value,
  onChange,
}: {
  loja?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ['vendedores-filtro', loja],
    queryFn: async () => (await api.get('/equipe')).data,
  });
  const lista = (Array.isArray(data) ? data : data?.vendedores || data?.equipe || []).filter(
    (v: any) => !loja || String(v.loja || '').toUpperCase() === String(loja).toUpperCase(),
  );
  return (
    <select
      className="mt-1 block rounded border border-border bg-background px-2 py-1 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Todos</option>
      {lista.map((v: any) => (
        <option key={v.id} value={v.id}>
          {v.nome}
        </option>
      ))}
    </select>
  );
}
