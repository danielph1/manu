'use client';
import { CarLoader } from '@/components/car-loader';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
import { Loader2, TrendingUp, DollarSign, CheckCircle2, FileText, Users, AlertCircle } from 'lucide-react';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899'];

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
  const funil = [
    { stage: 'Leads', value: data.funil.leads || 0, fill: COLORS[0] },
    { stage: 'Responderam', value: data.funil.responderam || 0, fill: COLORS[1] },
    { stage: 'Fichas', value: data.funil.fichas || 0, fill: COLORS[2] },
    { stage: 'Aprovados', value: data.funil.aprovados || 0, fill: COLORS[3] },
    { stage: 'Vendidos', value: data.funil.vendidos || 0, fill: COLORS[4] },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">Metricas financeiras</h1>
        <p className="mt-1 text-sm text-muted-foreground">Visao gerencial  somente admin e gerente</p>
      </header>

      <section className="grid gap-4 md:grid-cols-6">
        <KPI icon={Users} label="Fichas" value={data.funil.fichas} />
        <KPI icon={CheckCircle2} label="Aprovados" value={data.funil.aprovados} />
        <KPI icon={AlertCircle} label="Negadas" value={bancos.reduce((s: number, b: any) => s + b.negadas, 0)} />
        
        <KPI icon={TrendingUp} label="Compras" value={data.funil.vendidos} />
        <KPI icon={DollarSign} label="Clientes c/ boleto" value={fin.clientes_com_boleto} />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 font-semibold">Afunilamento de conversao</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funil} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" stroke="#888" />
                <YAxis dataKey="stage" type="category" stroke="#888" width={100} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funil.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 font-semibold">Aprovacao por banco</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bancos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="banco" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} />
                <Legend />
                <Bar dataKey="aprovadas" fill="#22c55e" />
                <Bar dataKey="negadas" fill="#ef4444" />
                
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
    </div>
  );
}

function KPI({ icon: Icon, label, value }: any) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </CardContent></Card>
  );
}
function Money({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">R$ {Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
  );
}
