'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api';
import { Loader2, Car, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Role } from '@/lib/roles';
import { toast } from 'sonner';

const ETAPAS = [
  { key: 'gravame', label: 'Gravame' },
  { key: 'reconheceu_firma', label: 'Reconheceu firma' },
  { key: 'documento_pronto', label: 'Documento pronto' },
];

export default function DocumentalPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = Role.editarDocumental(user);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['documental'],
    queryFn: async () => (await api.get('/documental')).data,
  });

  async function toggle(fichaId: number, processoId: number | null, field: string, value: boolean) {
    if (!canEdit) return;
    try {
      await api.post(`/documental/toggle`, { ficha_id: fichaId, processo_id: processoId, field, value });
      qc.invalidateQueries({ queryKey: ['documental'] });
      toast.success('Progresso atualizado');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">Documental</h1>
        <p className="mt-1 text-sm text-muted-foreground">Progresso de transferencia dos veiculos vendidos.</p>
      </header>

      {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}

      <div className="grid gap-4">
        {items.map((f: any) => {
          const proc = f.processo?.[0] || {};
          const concluido = proc.documento_pronto;
          return (
            <Card key={f.id} className={concluido ? 'border-emerald-600/40' : ''}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Car className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-semibold">{f.lead?.nome_lead}</div>
                      <div className="text-xs text-muted-foreground">Vendedor: <span className="capitalize">{f.vendedor?.nome}</span>  CPF: {f.lead?.cpf || '-'}</div>
                    </div>
                  </div>
                  {concluido && <Badge className="bg-emerald-600 gap-1"><CheckCircle2 className="h-3 w-3" />Concluido</Badge>}
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground md:grid-cols-4">
                  <div>Veiculo: <span className="text-foreground">{f.lead?.carro_selecionado}</span></div>
                  <div>Ano: <span className="text-foreground">{f.lead?.ano_carro}</span></div>
                  <div>Placa: <span className="text-foreground">{f.lead?.placa_carro}</span></div>
                  <div>Compra: <span className="text-foreground">{f.data_compra ? new Date(f.data_compra).toLocaleDateString('pt-BR') : '-'}</span></div>
                </div>

                <div className="flex flex-wrap items-center gap-6 pt-2">
                  {ETAPAS.map((e) => (
                    <div key={e.key} className="flex items-center gap-2">
                      <Checkbox
                        checked={!!proc[e.key]}
                        disabled={!canEdit}
                        onCheckedChange={(v) => toggle(f.id, proc.id || null, e.key, !!v)}
                      />
                      <span className="text-sm">{e.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!isLoading && items.length === 0 && (
        <div className="text-center text-muted-foreground py-10">Nenhum veiculo vendido para transferir.</div>
      )}
    </div>
  );
}
