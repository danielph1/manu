'use client';
import { CarLoader } from '@/components/car-loader';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api';
import { Car, CheckCircle2 } from 'lucide-react';
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
  const canEdit = Role.editarDocumental(user) || user?.tipo === 'superadmin';

  const { data: items = [], isLoading, error } = useQuery({
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

  const lista = Array.isArray(items) ? items : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">Documental</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Progresso de transferência dos veículos vendidos.
        </p>
      </header>

      {isLoading && <CarLoader compact />}
      {error && (
        <p className="text-sm text-rose-400">Erro ao carregar documental.</p>
      )}

      <div className="grid gap-4">
        {lista.map((f: any) => {
          const lead = f.lead || {};
          const vend = f.vendedor || {};
          const proc = (f.processo && f.processo[0]) || {
            id: f.processo_id,
            gravame: f.gravame,
            reconheceu_firma: f.reconheceu_firma,
            documento_pronto: f.documento_pronto,
          };
          const nome = lead.nome_lead || f.nome_lead || f.nome_completo || '—';
          const cpf = lead.cpf || f.cpf || '—';
          const veiculo =
            lead.carro_selecionado ||
            f.carro_selecionado ||
            [f.marca_carro, f.modelo].filter(Boolean).join(' ') ||
            '—';
          const ano = lead.ano_carro || f.ano_carro || '—';
          const placa = lead.placa_carro || f.placa_carro || f.fat_placa || '—';
          const vendedorNome = vend.nome || f.vendedor_nome || '—';
          const concluido = !!proc.documento_pronto;

          return (
            <Card key={f.id} className={concluido ? 'border-emerald-600/40' : ''}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Car className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-semibold">{nome}</div>
                      <div className="text-xs text-muted-foreground">
                        Vendedor: <span className="capitalize">{vendedorNome}</span>
                        {' · '}CPF: {cpf}
                      </div>
                    </div>
                  </div>
                  {concluido && (
                    <Badge className="gap-1 bg-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Concluído
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground md:grid-cols-4">
                  <div>
                    Veículo: <span className="text-foreground">{veiculo}</span>
                  </div>
                  <div>
                    Ano: <span className="text-foreground">{ano}</span>
                  </div>
                  <div>
                    Placa: <span className="text-foreground">{placa}</span>
                  </div>
                  <div>
                    Compra:{' '}
                    <span className="text-foreground">
                      {f.data_compra ? new Date(f.data_compra).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 pt-2">
                  {ETAPAS.map((e) => (
                    <div key={e.key} className="flex items-center gap-2">
                      <Checkbox
                        checked={!!(proc as any)[e.key]}
                        disabled={!canEdit}
                        onCheckedChange={(v) =>
                          toggle(f.id, proc.id || f.processo_id || null, e.key, !!v)
                        }
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

      {!isLoading && lista.length === 0 && (
        <div className="py-10 text-center text-muted-foreground">
          Nenhum veículo vendido para transferir.
        </div>
      )}
    </div>
  );
}
