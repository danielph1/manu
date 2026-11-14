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
  Info, Heart, ListPlus, Trash2, Calendar, X, Plus, Pin, FolderHeart,
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
  const [leadParaFollowUp, setLeadParaFollowUp] = useState<Lead | null>(null);
  const [motivoFollowUp, setMotivoFollowUp] = useState('');
  const [enviandoFollowUp, setEnviandoFollowUp] = useState(false);
  const [agendarLead, setAgendarLead] = useState<Lead | null>(null);
  const [agendarValor, setAgendarValor] = useState('');
  const [pickListaLead, setPickListaLead] = useState<Lead | null>(null);
  const [pins, setPins] = useState<number[]>([]);
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [busyAcao, setBusyAcao] = useState(false);
  const [listaEmMassa, setListaEmMassa] = useState(false);
  const [agendarEmMassa, setAgendarEmMassa] = useState(false);
  const [dataEmMassa, setDataEmMassa] = useState('');
  const podeAcoes = ['admin','gerente','marketing','superadmin'].includes(user?.tipo || '');
  const toggleSelecionado = (id:number) => setSelecionados(prev => prev.includes(id) ? prev.filter(x=>x!==id) : prev.length>=100 ? (toast.error('Selecione até 100 leads por ação.'),prev) : [...prev,id]);
  async function acaoMassa(acao: 'excluir'|'marcar_respondido'|'marcar_pendente'|'favoritar'|'agendar', data?: string) {
    if (!selecionados.length || !podeAcoes) return;
    if (acao==='excluir' && !confirm(`Apagar ${selecionados.length} leads? Esta ação é irreversível.`))return;
    setBusyAcao(true);
    try {await api.post('/leads/acoes',{acao,ids:selecionados,data_hora_visita:data});toast.success(`${selecionados.length} leads atualizados`);
      setSelecionados([]);setModoSelecao(false);setAgendarEmMassa(false);setListaEmMassa(false);if(acao==='favoritar')window.dispatchEvent(new Event('manu:favoritos-atualizados'));await qc.invalidateQueries({queryKey:['leads']});await qc.invalidateQueries({queryKey:['stats']});}
    catch(e:any){toast.error(e?.response?.data?.error||'Falha na ação em massa');}finally{setBusyAcao(false);}
  }


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

  // Empresas e lojas vêm da API autenticada. Não há nomes fixos (ex.: NINA) no frontend.
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const {data: vendedoresEscopo=[]} = useQuery<any[]>({
    queryKey:['painel-vendedores-escopo',user?.id],
    queryFn:async () => { const {data}=await api.get('/vendedores'); return Array.isArray(data)?data:[]; },
    enabled:Boolean(user?.id),
  });
  const empresaAtiva = user?.tipo === 'superadmin' ? Number(empresaFiltro||0) : Number(user?.empresa_id||0);
  const empresasEscopo = useMemo(() => Array.from(new Map(vendedoresEscopo.filter(v=>Number(v.empresa_id)>0)
    .map(v=>[String(v.empresa_id),{id:String(v.empresa_id),nome:String(v.empresa_nome||`Empresa ${v.empresa_id}`)}] as const)).values()), [vendedoresEscopo]);
  const lojasEscopo = useMemo(() => Array.from(new Set(vendedoresEscopo
    .filter(v=>Number(v.empresa_id)===empresaAtiva).map(v=>String(v.loja||'').trim()).filter(Boolean))).sort(), [vendedoresEscopo,empresaAtiva]);
  const podeCarregarLeads = Boolean(user?.id && empresaAtiva);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', filtro, periodo, loja, vendedorId, empresaAtiva],
    queryFn: async () => {
      const { data } = await api.get<Lead[]>('/leads', {
        params: {
          filtro, periodo,
          empresa_id: empresaAtiva || undefined,
          loja: loja || undefined,
          vendedor_id: vendedorId || undefined,
          painel: '1',
        },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: podeCarregarLeads,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const {data:stats} = useQuery({
    queryKey:['stats',periodo,loja,vendedorId,empresaAtiva],
    queryFn:async () => (await api.get('/leads/stats', {params:{periodo,loja:loja||undefined,
      vendedor_id:vendedorId||undefined,empresa_id:empresaAtiva}})).data,
    enabled:podeCarregarLeads,
    refetchInterval:10000,
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

  function criarLista(adicionarSelecionadosAgora = false) {
    const nome = prompt('Nome da nova lista:');
    if (!nome?.trim()) return;
    const id = `l_${Date.now()}`;
    persistListas([...listas, { id, nome: nome.trim(), leadIds: adicionarSelecionadosAgora ? [...selecionados] : [] }]);
    setListaAtiva(id);
    if (adicionarSelecionadosAgora) { setListaEmMassa(false); setSelecionados([]); setModoSelecao(false); toast.success('Lista criada com os leads selecionados.'); }
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

  function adicionarSelecionadosLista(listaId: string) {
    if (!selecionados.length) return;
    const updated = listas.map(L => L.id !== listaId ? L : {
      ...L, leadIds: [...new Set([...L.leadIds, ...selecionados])],
    });
    persistListas(updated);
    toast.success(`${selecionados.length} lead(s) adicionados à lista.`);
    setListaEmMassa(false); setSelecionados([]); setModoSelecao(false);
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

  async function confirmarEnvioFollowUp() {
    if (!leadParaFollowUp || enviandoFollowUp) return;
    // O superadmin deve enviar a empresa da carteira do vendedor.
    // Nunca usar um valor arbitrario que possa mover um lead de outra empresa.
    const empresaDoLead = Number((leadParaFollowUp as any).empresa_do_vendedor || 0);
    if (user?.tipo === 'superadmin' && (!Number.isSafeInteger(empresaDoLead) || empresaDoLead <= 0)) {
      toast.error('Não foi possível identificar a empresa desse lead.');
      return;
    }
    setEnviandoFollowUp(true);
    try {
      await api.patch('/follow-up', {
        lead_id: Number(leadParaFollowUp.id),
        acao: 'mover',
        motivo: motivoFollowUp.trim().slice(0, 400),
        empresa_id: user?.tipo === 'superadmin' ? empresaDoLead : undefined,
      });
      setLeadParaFollowUp(null);
      setMotivoFollowUp('');
      toast.success('Lead enviado para Follow Up. Não foi excluído.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['leads'] }),
        qc.invalidateQueries({ queryKey: ['stats'] }),
        qc.invalidateQueries({ queryKey: ['followup-leads'] }),
      ]);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Não foi possível enviar ao Follow Up.');
    } finally {
      setEnviandoFollowUp(false);
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
    <div className={`aurox-workspace ${selecionados.length ? 'pb-48' : ''}`}>
      <header className="aurox-page-heading">
        <div>
          <p className="aurox-eyebrow">Central comercial <span aria-hidden="true">/</span> Atendimento</p>
          <h1>{t('page.painel.title')}</h1>
          <p className="aurox-page-description">Acompanhe cada contato, identifique prioridades e realize as próximas ações sem perder o contexto.</p>
        </div>
        <Link href="/novo-lead"><Button className="aurox-add-lead" size="lg"><PlusCircle className="mr-2 h-4 w-4" />{t('page.painel.add_lead')}</Button></Link>
      </header>

      <section className="aurox-kpis" aria-label="Indicadores — clique para filtrar leads">
        {([
          {key:'todos', title:'Todos os leads', number:totalLeads, context:'Visão geral'},
          {key:'responderam', title:'Respondidos', number:totalResp, context:'Contatos atendidos'},
          {key:'nao_responderam', title:'Aguardando', number:Math.max(0,totalLeads-totalResp), context:'Precisam de resposta'},
          {key:'fichas', title:'Fichas', number:totalFichas, context:'Crédito em análise'},
          {key:'aprovados', title:'Aprovados', number:totalAprov, context:'Crédito aprovado'},
          {key:'vendidos', title:'Vendas', number:totalVend, context:'Negócios concluídos'},
        ] as const).map((k) => (
          <button key={k.key} type="button" className="aurox-kpi" aria-pressed={filtro===k.key}
            onClick={() => setFiltro(k.key)} title={`Filtrar: ${k.title}`}>
            <span className="aurox-kpi-label">{k.title}</span>
            <span className="aurox-kpi-value">{Number(k.number).toLocaleString('pt-BR')}</span>
            <span className="aurox-kpi-context">{k.context}</span>
            <span className="aurox-kpi-track" aria-hidden="true"><span className="aurox-kpi-progress block"
              style={{width:`${Math.min(100,Math.round(Number(k.number)/Math.max(1,Number(totalLeads))*100))}%`}} /></span>
          </button>
        ))}
      </section>

      <section className="aurox-filter-board" aria-label="Filtros de leads">
        <div className="aurox-filter-head">
          <h2>Encontre o lead certo</h2>
          <button type="button" onClick={() => {setBusca('');setCarroceria('todas');setLoja('');setVendedorId('');setPeriodo('mes');setFiltro('todos');setListaAtiva('todos');}}>Limpar filtros</button>
        </div>
        <div className={`aurox-filter-fields ${user?.tipo === 'superadmin' ? 'has-company' : ''}`}>
          <div>
            <label htmlFor="aurox-busca" className="aurox-field-label">Buscar lead</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="aurox-busca" className="pl-9" placeholder="Nome, CPF, telefone ou veículo" value={busca} onChange={(e)=>setBusca(e.target.value)}/>
            </div>
          </div>
          {user?.tipo === 'superadmin' && <div>
            <label htmlFor="aurox-empresa" className="aurox-field-label">Empresa</label>
            <select id="aurox-empresa" className="aurox-control" value={empresaFiltro} onChange={e=>{setEmpresaFiltro(e.target.value);setLoja('');setVendedorId('');}}>
              <option value="">Escolha uma empresa</option>
              {empresasEscopo.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>}
          <div>
            <label htmlFor="aurox-periodo" className="aurox-field-label">Período</label>
            <select id="aurox-periodo" className="aurox-control" value={periodo} onChange={e=>setPeriodo(e.target.value as LeadFiltros['periodo'])}>
              <option value="hoje">Hoje</option><option value="semana">Esta semana</option><option value="mes">Este mês</option><option value="todas">Todo o período</option>
            </select>
          </div>
          <div>
            <label htmlFor="aurox-carroceria" className="aurox-field-label">Carroceria</label>
            <select id="aurox-carroceria" className="aurox-control" value={carroceria} onChange={e=>setCarroceria(e.target.value)}>
              <option value="todas">Todas</option><option value="hatch">Hatch</option><option value="sedan">Sedan</option><option value="suv">SUV</option><option value="pickup">Picape</option>
            </select>
          </div>
          {['admin','marketing','superadmin'].includes(user?.tipo || '') && <div>
            <label htmlFor="aurox-loja" className="aurox-field-label">Loja / Pátio</label>
            <select id="aurox-loja" className="aurox-control" value={loja} onChange={e=>{setLoja(e.target.value);setVendedorId('');}} disabled={!empresaAtiva}>
              <option value="">Todas as lojas</option>
              {lojasEscopo.map(x=><option key={x} value={x}>{x}</option>)}
            </select>
          </div>}
          {['admin','gerente','marketing','superadmin'].includes(user?.tipo || '') && <div>
            <span className="aurox-field-label">Vendedor</span>
            <VendedorSelect empresaId={empresaAtiva} loja={user?.tipo === 'gerente' ? user.loja || undefined : loja}
              value={vendedorId} onChange={setVendedorId}/>
          </div>}
        </div>
        {user?.tipo === 'superadmin' && !empresaAtiva &&
          <p className="mt-3 text-xs text-muted-foreground">Selecione uma empresa para consultar os dados separadamente.</p>}
      </section>

      {/* chips de listas — abaixo da busca, acima dos cards */}
      <div className="aurox-list-tabs">
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
          onClick={()=>criarLista()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
          title="Nova lista"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

<section className="aurox-list-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="aurox-list-title">Leads cadastrados</h2>
        {podeAcoes && <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={()=>{setModoSelecao(!modoSelecao);setSelecionados([]);}}>{modoSelecao?'Cancelar seleção':'Selecionar / Ações'}</Button>
          {modoSelecao && <Button variant="outline" size="sm" onClick={()=>setSelecionados(selecionados.length===Math.min(filteredLeads.length,100)?[]:filteredLeads.slice(0,100).map(l=>Number(l.id)))}>{selecionados.length===Math.min(filteredLeads.length,100)?'Desmarcar':'Selecionar todos'}</Button>}
        </div>}
        </div>
        {modoSelecao && selecionados.length>0 && <div aria-live="polite" className="fixed bottom-[78px] left-1/2 z-[55] w-[min(1080px,calc(100vw-20px))] -translate-x-1/2 rounded-2xl border border-primary/30 bg-card/95 p-3 shadow-[0_15px_60px_rgba(0,0,0,.55)] backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-semibold">{selecionados.length} lead(s) selecionado(s)</span>
            <button type="button" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted" onClick={()=>{setSelecionados([]);setModoSelecao(false)}}>Concluir <X className="inline h-3.5 w-3.5"/></button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Button size="sm" className="h-auto min-h-11 whitespace-normal px-1 py-2 text-[11px] sm:text-xs" disabled={busyAcao} onClick={()=>acaoMassa('marcar_respondido')}>Atendido</Button>
            <Button size="sm" variant="outline" className="h-auto min-h-11 whitespace-normal px-1 py-2 text-[11px] sm:text-xs" disabled={busyAcao} onClick={()=>acaoMassa('marcar_pendente')}>Não atendido</Button>
            <Button size="sm" variant="destructive" className="h-auto min-h-11 whitespace-normal px-1 py-2 text-[11px] sm:text-xs" disabled={busyAcao} onClick={()=>acaoMassa('excluir')}><Trash2 className="mr-1 h-3.5 w-3.5"/>Excluir</Button>
            <Button size="sm" variant="outline" className="h-auto min-h-11 whitespace-normal px-1 py-2 text-[11px] sm:text-xs" disabled={busyAcao} onClick={()=>setListaEmMassa(true)}><ListPlus className="mr-1 h-3.5 w-3.5"/>Adicionar à lista</Button>
            <Button size="sm" variant="outline" className="h-auto min-h-11 whitespace-normal px-1 py-2 text-[11px] sm:text-xs" disabled={busyAcao} onClick={()=>setAgendarEmMassa(true)}><Calendar className="mr-1 h-3.5 w-3.5"/>Agendar</Button>
            <Button size="sm" variant="outline" className="h-auto min-h-11 whitespace-normal px-1 py-2 text-[11px] sm:text-xs" disabled={busyAcao} onClick={()=>acaoMassa('favoritar')}><Heart className="mr-1 h-3.5 w-3.5"/>Favoritar</Button>
          </div>
        </div>}
        <p className="aurox-list-subtitle">Exibindo {filteredLeads.length} de {leads.length} leads da empresa selecionada.</p>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <CarLoader />
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="aurox-empty mt-4" role="status">
            <Search className="h-8 w-8" aria-hidden="true" />
            <strong>{empresaAtiva ? 'Nenhum lead encontrado' : 'Selecione uma empresa'}</strong>
            <p>{empresaAtiva ? 'Tente outro período ou limpe os filtros para visualizar mais oportunidades.' : 'Os dados de cada empresa aparecem somente após a seleção.'}</p>
            {empresaAtiva && <Button variant="outline" onClick={()=>{setBusca('');setCarroceria('todas');setLoja('');setVendedorId('');setPeriodo('mes');setFiltro('todos');setListaAtiva('todos');}}>Limpar filtros</Button>}
          </div>
        ) : (
          <div className="aurox-lead-grid mt-4">
            {filteredLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                pinned={pins.includes(Number(lead.id))}
                onOpen={() => modoSelecao ? toggleSelecionado(Number(lead.id)) : setSelected(lead)}
                onMenu={() => setMenuLead(lead)}
                selectionMode={modoSelecao}
                isSelected={selecionados.includes(Number(lead.id))}
                onSelect={() => { setModoSelecao(true); toggleSelecionado(Number(lead.id)); }}
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
            {['vendedor', 'gerente', 'admin', 'superadmin'].includes(String(user?.tipo || '').toLowerCase()) && (
              <ActionRow
                icon={<FolderHeart className="h-5 w-5" />}
                label="Enviar ao Follow Up"
                onClick={() => {
                  setLeadParaFollowUp(menuLead);
                  setMotivoFollowUp('');
                  setMenuLead(null);
                }}
              />
            )}
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
            {podeAcoes && <ActionRow icon={<ListPlus className="h-5 w-5" />} label="Selecionar para ações em massa" onClick={()=>{setModoSelecao(true);setSelecionados(prev=>prev.includes(Number(menuLead.id))?prev:[...prev,Number(menuLead.id)]);setMenuLead(null);}} />}
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

      {leadParaFollowUp && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => { if (!enviandoFollowUp) setLeadParaFollowUp(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="followup-titulo"
            className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 id="followup-titulo" className="text-lg font-semibold">Enviar ao Follow Up</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {leadParaFollowUp.nome_lead} sairá da lista principal e ficará na carteira do Follow Up.
                O histórico será preservado. Isso não autoriza envios de campanhas.
              </p>
            </div>
            <label htmlFor="motivo-followup" className="block space-y-2 text-sm">
              <span>Motivo (opcional)</span>
              <textarea id="motivo-followup" rows={3} maxLength={400}
                className="w-full resize-y rounded-lg border bg-background p-3 text-sm"
                placeholder="Ex.: cliente pediu retorno posterior; vendedor optou por não atender agora"
                value={motivoFollowUp} onChange={e => setMotivoFollowUp(e.target.value)} />
              <span className="block text-xs text-muted-foreground">O motivo ficará registrado no lead; não será enviado ao cliente.</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={enviandoFollowUp} onClick={() => setLeadParaFollowUp(null)}>Cancelar</Button>
              <Button disabled={enviandoFollowUp} onClick={() => void confirmarEnvioFollowUp()}>
                {enviandoFollowUp ? 'Enviando…' : 'Confirmar envio'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {listaEmMassa && <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-3" onClick={()=>setListaEmMassa(false)}>
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={e=>e.stopPropagation()}>
          <h3 className="text-lg font-semibold">Adicionar {selecionados.length} leads à lista</h3>
          {!listas.length && <p className="text-sm text-muted-foreground">Crie uma lista antes de adicionar os leads.</p>}
          <div className="max-h-72 space-y-1 overflow-y-auto">{listas.map(L=><button key={L.id} type="button" className="block w-full rounded-lg border border-border p-3 text-left text-sm hover:bg-muted" onClick={()=>adicionarSelecionadosLista(L.id)}>{L.nome}</button>)}</div>
          <Button variant="outline" className="w-full" onClick={()=>criarLista(true)}>+ Criar lista</Button>
          <Button variant="ghost" className="w-full" onClick={()=>setListaEmMassa(false)}>Cancelar</Button>
        </div>
      </div>}
      {agendarEmMassa && <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-3" onClick={()=>setAgendarEmMassa(false)}>
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={e=>e.stopPropagation()}>
          <h3 className="text-lg font-semibold">Agendar {selecionados.length} leads</h3>
          <p className="text-sm text-muted-foreground">A mesma data e horário será aplicada aos leads selecionados.</p>
          <Input aria-label="Data e horário" type="datetime-local" value={dataEmMassa} onChange={e=>setDataEmMassa(e.target.value)}/>
          <div className="flex gap-2"><Button className="flex-1" disabled={!dataEmMassa||busyAcao} onClick={()=>acaoMassa('agendar',dataEmMassa)}>Confirmar</Button><Button variant="outline" onClick={()=>setAgendarEmMassa(false)}>Cancelar</Button></div>
        </div>
      </div>}
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
  selectionMode,
  isSelected,
  onSelect,
}: {
  lead: Lead;
  selectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  pinned?: boolean;
  onOpen: () => void;
  onMenu: () => void;
  onPin?: (id: number) => void;
}) {
  const fav = useFavoritos();
  const marcado = fav.tem(Number(lead.id));
  const [dx, setDx] = useState(0);
  const [locked, setLocked] = useState<'left' | 'right' | null>(null);
  const holdTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const longPressed=useRef(false);
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
    longPressed.current=false;
    if(holdTimer.current) clearTimeout(holdTimer.current);
    if(!selectionMode && onSelect) holdTimer.current=setTimeout(()=>{longPressed.current=true;onSelect();},650);
    if (locked) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    moved.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if(holdTimer.current && startX.current!=null && (Math.abs(e.touches[0].clientX-startX.current)>10 || Math.abs(e.touches[0].clientY-(startY.current||0))>10)){clearTimeout(holdTimer.current);holdTimer.current=null;}
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
    if(holdTimer.current){clearTimeout(holdTimer.current);holdTimer.current=null;}
    if(longPressed.current){moved.current=true;startX.current=null;startY.current=null;return;}
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
    <div className="relative overflow-hidden rounded-2xl">
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
        className={`aurox-lead-card relative cursor-pointer transition-all duration-200 hover:border-primary/60 hover:shadow-lg ${isSelected ? 'border-primary bg-primary/[.07] shadow-[0_0_0_1px_hsl(var(--primary)/.25)]' : 'bg-card'}`}
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
          if (!moved.current && !longPressed.current) onOpen();
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          if(holdTimer.current)clearTimeout(holdTimer.current);
          if (!locked) {
            setDx(0);
            dxRef.current = 0;
          }
          startX.current = null;
        }}
      >
        <CardContent className="aurox-lead-card-content space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {selectionMode && <input type="checkbox" checked={!!isSelected} readOnly aria-label="Selecionar lead" className="h-5 w-5 shrink-0 rounded accent-primary pointer-events-none" />}
              <span className="aurox-avatar" aria-hidden="true">{String(lead.nome_lead||'?').trim().split(/\s+/).slice(0,2).map(n=>n[0]||'').join('').toUpperCase()}</span>
              <div className="min-w-0"><span className="aurox-lead-name block truncate">{lead.nome_lead}</span>
                <span className="text-[11px] text-muted-foreground">Lead #{lead.id}</span></div>
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

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="aurox-status" data-state={lead.respondeu ? 'respondido' : 'pendente'}>
              {lead.respondeu ? 'Respondido' : 'Aguardando resposta'}
            </span>
            {lead.venda_concluida && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">VENDA CONCLUIDA</Badge>
            )}
            {(lead as any).em_loja && (
              <Badge variant="outline" className="gap-1">
                <Store className="h-3 w-3" />
                Na loja
              </Badge>
            )}
            {lead.gerou_ficha && (() => {
              const status = String((lead as any).status_ficha || 'pendente').toLowerCase();
              if (status.startsWith('aprov')) return <Badge className="bg-blue-600 hover:bg-blue-600">Aprovado</Badge>;
              if (status.startsWith('neg') || status.startsWith('recus') || status.startsWith('reprov'))
                return <Badge className="bg-rose-600 hover:bg-rose-600">Recusado</Badge>;
              return <Badge variant="outline" className="border-amber-500/40 text-amber-400">Ficha pendente</Badge>;
            })()}
          </div>

          <div className="aurox-lead-info space-y-1 text-sm text-muted-foreground">
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
  empresaId, loja, value, onChange,
}: {
  empresaId: number;
  loja?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data=[] } = useQuery<any[]>({
    queryKey:['vendedores-filtro-empresa',empresaId],
    queryFn:async () => { const {data}=await api.get('/vendedores'); return Array.isArray(data)?data:[]; },
    enabled:empresaId>0,
  });
  const lista = data.filter((v: any) => Number(v.empresa_id) === empresaId &&
    (!loja || String(v.loja || '').toUpperCase() === String(loja).toUpperCase()));
  return (
    <select
      className="aurox-control"
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
