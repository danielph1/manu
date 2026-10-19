'use client';
import { CarLoader } from '@/components/car-loader';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Users,
  AlertCircle,
  Percent,
  Car,
} from 'lucide-react';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899'];

function pct(v: number) {
  return `${(Number(v || 0) * 100).toFixed(1)}%`;
}
function money(v: number) {
  return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MetricasPage() {
  const [periodo, setPeriodo] = useState('mes');
  const { data, isLoading, error } = useQuery({
    queryKey: ['metricas', periodo],
    queryFn: async () => (await api.get('/metricas', { params: { periodo } })).data,
  });

  if (isLoading) return <CarLoader compact />;
  if (error) return <p className="text-rose-400">Não foi possível carregar as métricas.</p>;
  if (!data?.funil) return <p className="text-muted-foreground">Sem dados de métricas.</p>;

  const bancos = Array.isArray(data.por_banco) ? data.por_banco : [];
  const fin = data.financeiro || {};
  const taxas = data.taxas || {};
  const hist = Array.isArray(data.historico_mensal) ? data.historico_mensal : [];
  const proj = data.projecao || {};
  const mix = Array.isArray(proj.mix_carroceria) ? proj.mix_carroceria : [];
  const carroceria = Array.isArray(data.por_carroceria) ? data.por_carroceria : [];

  const funil = [
    { stage: 'Leads', value: data.funil.leads || 0, fill: COLORS[0] },
    { stage: 'Responderam', value: data.funil.responderam || 0, fill: COLORS[1] },
    { stage: 'Fichas', value: data.funil.fichas || 0, fill: COLORS[2] },
    { stage: 'Aprovados', value: data.funil.aprovados || 0, fill: COLORS[3] },
    { stage: 'Vendidos', value: data.funil.vendidos || 0, fill: COLORS[4] },
  ];

  const serie = [
    ...hist.map((h: any) => ({
      mes: h.mes,
      leads: h.leads,
      vendidos: h.vendidos,
      valor: h.valor_bruto,
      tipo: 'real',
    })),
    proj.mes_1 && {
      mes: proj.mes_1.mes,
      leads: proj.mes_1.leads,
      vendidos: proj.mes_1.vendidos,
      valor: proj.mes_1.valor_bruto,
      tipo: 'proj',
    },
    proj.mes_2 && {
      mes: proj.mes_2.mes,
      leads: proj.mes_2.leads,
      vendidos: proj.mes_2.vendidos,
      valor: proj.mes_2.valor_bruto,
      tipo: 'proj',
    },
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Métricas financeiras</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visão gerencial · conversão, crédito e projeção
          </p>
        </div>
        <select
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
        >
          <option value="mes">Este mês</option>
          <option value="mes_passado">Mês passado</option>
          <option value="tudo">Todo período</option>
        </select>
      </header>

      <section className="grid gap-4 md:grid-cols-6">
        <KPI icon={Users} label="Fichas" value={data.funil.fichas} />
        <KPI icon={CheckCircle2} label="Aprovados" value={data.funil.aprovados} />
        <KPI
          icon={AlertCircle}
          label="Negadas"
          value={bancos.reduce((s: number, b: any) => s + Number(b.negadas || 0), 0)}
        />
        <KPI icon={TrendingUp} label="Compras" value={data.funil.vendidos} />
        <KPI icon={DollarSign} label="Clientes c/ boleto" value={fin.clientes_com_boleto} />
        <KPI icon={Percent} label="Conv. venda" value={pct(taxas.conversao_venda)} />
      </section>

      {/* Taxas bancárias / CRM */}
      <section className="grid gap-3 md:grid-cols-5">
        <Rate label="Taxa de resposta" value={taxas.resposta} />
        <Rate label="Taxa de ficha" value={taxas.ficha} />
        <Rate label="Liberação de crédito" value={taxas.taxa_liberacao_credito} />
        <Rate label="Aprovado → venda" value={taxas.conversao_aprovado_venda} />
        <Rate label="Inadimplência (proxy boleto)" value={taxas.taxa_inadimplencia_proxy} />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 font-semibold">Afunilamento de conversão</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funil} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" stroke="#888" />
                <YAxis dataKey="stage" type="category" stroke="#888" width={100} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funil.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 font-semibold">Aprovação por banco</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bancos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="banco" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} />
                <Legend />
                <Bar dataKey="aprovadas" fill="#22c55e" name="Aprovadas" />
                <Bar dataKey="negadas" fill="#ef4444" name="Negadas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        <Money label="Valor bruto" value={fin.valor_bruto} />
        <Money label="Valor liberado" value={fin.valor_liberado} />
        <Money label="Entrada paga" value={fin.entrada_paga} />
        <Money label="Total em boletos" value={fin.total_boletos} />
        <Money label="Valor pendente" value={fin.valor_pendente} />
      </section>

      {/* Projeção */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Projeção de demanda e vendas</h2>
          <p className="text-xs text-muted-foreground">
            Modelo: regressão linear múltipla defasada · {proj.formula || 'Y_t = β0 + β1·leads(t-1) + β2·leads(t) + β3·vendas(t-1)'}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ProjCard title={`Próximo mês (${proj.mes_1?.mes || '—'})`} p={proj.mes_1} />
          <ProjCard title={`Em 2 meses (${proj.mes_2?.mes || '—'})`} p={proj.mes_2} />
        </div>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 font-semibold">Histórico + projeção (leads e vendas)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} />
                <Legend />
                <Line type="monotone" dataKey="leads" stroke="#06b6d4" name="Leads" strokeWidth={2} />
                <Line type="monotone" dataKey="vendidos" stroke="#22c55e" name="Vendidos" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Ticket médio usado na projeção financeira: {money(taxas.ticket_medio || 0)}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Carroceria */}
      {(carroceria.length > 0 || mix.length > 0) && (
        <section className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <Car className="h-4 w-4" /> Mix estoque por carroceria
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={carroceria}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="carroceria" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} />
                  <Bar dataKey="qtd" fill="#8b5cf6" name="Qtd" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 font-semibold">Projeção de vendas por carroceria</h3>
              <div className="space-y-2 text-sm">
                {mix.length === 0 && (
                  <p className="text-muted-foreground">Sem dados de carroceria no estoque.</p>
                )}
                {mix.map((m: any) => (
                  <div key={m.carroceria} className="flex items-center justify-between border-b border-border/50 py-2">
                    <span className="capitalize">{m.carroceria}</span>
                    <span className="text-muted-foreground">
                      {m.pct}% · M+1: <b className="text-foreground">{m.vendidos_mes1}</b> · M+2:{' '}
                      <b className="text-foreground">{m.vendidos_mes2}</b>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value }: any) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
function Money({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{money(value)}</div>
    </div>
  );
}
function Rate({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-lg font-semibold">{pct(value)}</div>
      </CardContent>
    </Card>
  );
}
function ProjCard({ title, p }: { title: string; p: any }) {
  if (!p) return null;
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <h3 className="font-semibold">{title}</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-muted-foreground">Leads</div>
            <div className="text-xl font-bold">{p.leads}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Vendidos</div>
            <div className="text-xl font-bold text-emerald-400">{p.vendidos}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Fichas</div>
            <div className="font-semibold">{p.fichas}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Aprovados</div>
            <div className="font-semibold">{p.aprovados}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Valor bruto estimado</div>
            <div className="text-lg font-bold">{money(p.valor_bruto)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
