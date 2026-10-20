'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { CarLoader } from '@/components/car-loader';

const ETAPAS = [
  { key: 'gravame', label: 'Gravame' },
  { key: 'reconheceu_firma', label: 'Reconheceu firma' },
  { key: 'documento_pronto', label: 'Documento pronto' },
] as const;

export default function ProcessosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = ['admin', 'superadmin', 'gerente', 'documentista', 'documento'].includes(
    String(user?.tipo || '').toLowerCase(),
  );

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['processos'],
    queryFn: async () => (await api.get('/processos')).data,
  });

  async function toggle(id: number, field: string, value: boolean) {
    if (!canEdit) return;
    try {
      await api.patch('/processos', { id, [field]: value });
      qc.invalidateQueries({ queryKey: ['processos'] });
      toast.success('Atualizado');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
    }
  }

  async function setStatus(id: number, status: string) {
    if (!canEdit) return;
    try {
      await api.patch('/processos', { id, status });
      qc.invalidateQueries({ queryKey: ['processos'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro');
    }
  }

  const lista = Array.isArray(data) ? data : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <h1 className="text-3xl font-bold">Transferências</h1>
      <p className="text-sm text-muted-foreground">
        Processos de transferência de veículos vendidos (gravame, firma, documento).
      </p>
      {isLoading && <CarLoader compact />}
      {error && <p className="text-rose-400">Erro ao carregar.</p>}

      {lista.map((p: any) => {
        const veiculo = [p.marca, p.modelo].filter(Boolean).join(' ') || '—';
        return (
          <Card key={p.id}>
            <CardContent className="space-y-2 py-4 text-sm">
              <div className="font-semibold">
                {p.nome_lead || `Ficha ${p.ficha_id}`}
                {p.placa ? ` · ${p.placa}` : ''}
              </div>
              <div className="text-xs text-muted-foreground">
                {veiculo}
                {p.vendedor_nome ? ` · Vendedor: ${p.vendedor_nome}` : ''}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <select
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                  value={p.status || 'em_andamento'}
                  disabled={!canEdit}
                  onChange={(e) => setStatus(p.id, e.target.value)}
                >
                  <option value="nao_iniciado">não iniciado</option>
                  <option value="em_andamento">em andamento</option>
                  <option value="concluido">concluído</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-4 pt-1">
                {ETAPAS.map((e) => (
                  <label key={e.key} className="flex items-center gap-2">
                    <Checkbox
                      checked={!!p[e.key]}
                      disabled={!canEdit}
                      onCheckedChange={(v) => toggle(p.id, e.key, !!v)}
                    />
                    <span>{e.label}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!isLoading && lista.length === 0 && (
        <p className="text-muted-foreground">Nenhum processo.</p>
      )}
    </div>
  );
}
