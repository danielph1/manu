'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

export default function OficinaPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const podeEditar = ['admin', 'gerente', 'guariba', 'mecanico'].includes(user?.tipo || '');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState({
    marca: '', modelo: '', ano_modelo: '', placa: '', cor: '', valor_carro: '',
  });

  const { data: carros = [], isLoading } = useQuery({
    queryKey: ['oficina', busca],
    queryFn: async () =>
      (await api.get('/oficina', { params: { busca: busca || undefined } })).data,
  });

  async function cadastrar() {
    try {
      await api.post('/oficina', {
        ...form,
        valor_carro: form.valor_carro ? Number(form.valor_carro) : null,
      });
      toast.success('Carro cadastrado na oficina');
      setForm({ marca: '', modelo: '', ano_modelo: '', placa: '', cor: '', valor_carro: '' });
      qc.invalidateQueries({ queryKey: ['oficina'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao cadastrar');
    }
  }

  async function salvar(id: number, patch: Record<string, unknown>) {
    try {
      await api.patch('/oficina', { id, ...patch });
      toast.success('Salvo');
      qc.invalidateQueries({ queryKey: ['oficina'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Oficina</h1>
        <p className="text-sm text-muted-foreground">
          Pronto há mais de 4 dias sai automaticamente. Placa nova entra no estoque.
        </p>
      </header>

      <Input
        placeholder="Buscar marca, modelo, placa..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {podeEditar && (
        <Card>
          <CardContent className="py-4 grid gap-3 md:grid-cols-3">
            <div>
              <Label>Marca*</Label>
              <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
            </div>
            <div>
              <Label>Modelo*</Label>
              <Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
            </div>
            <div>
              <Label>Ano/modelo*</Label>
              <Input value={form.ano_modelo} onChange={(e) => setForm({ ...form, ano_modelo: e.target.value })} />
            </div>
            <div>
              <Label>Placa*</Label>
              <Input value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} />
            </div>
            <div>
              <Label>Cor</Label>
              <Input value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} />
            </div>
            <div>
              <Label>Valor do carro (R$)</Label>
              <Input
                type="number"
                value={form.valor_carro}
                onChange={(e) => setForm({ ...form, valor_carro: e.target.value })}
              />
            </div>
            <Button className="md:col-span-3" onClick={cadastrar}>
              Cadastrar na oficina
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      )}

      <div className="space-y-3">
        {(carros as any[]).map((c) => (
          <Card key={c.id}>
            <CardContent className="py-4 space-y-2">
              <div className="font-semibold">
                {c.pronto ? '✅' : '🔧'} {c.marca} {c.modelo} ({c.ano_modelo}) · {c.placa}
                {c.observacao?.includes('RECAL') && (
                  <span className="ml-2 text-xs text-amber-400">RECAL</span>
                )}
              </div>
              {podeEditar ? (
                <div className="grid gap-2 md:grid-cols-2 text-sm">
                  <div>
                    <Label>Onde está</Label>
                    <Input
                      placeholder="Pátio, oficina, rua..."
                      defaultValue={c.onde_esta || ''}
                      onBlur={(e) =>
                        e.target.value !== (c.onde_esta || '') &&
                        salvar(c.id, { onde_esta: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Valor final (R$)</Label>
                    <Input
                      placeholder="0,00"
                      defaultValue={c.valor_final || ''}
                      onBlur={(e) =>
                        e.target.value !== (c.valor_final || '') &&
                        salvar(c.id, { valor_final: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Mecânica</Label>
                    <Input
                      placeholder="Situação da mecânica"
                      defaultValue={c.mecanica || ''}
                      onBlur={(e) =>
                        e.target.value !== (c.mecanica || '') &&
                        salvar(c.id, { mecanica: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Lataria</Label>
                    <Input
                      placeholder="Situação da lataria"
                      defaultValue={c.lataria || ''}
                      onBlur={(e) =>
                        e.target.value !== (c.lataria || '') &&
                        salvar(c.id, { lataria: e.target.value })
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Observação</Label>
                    <Input
                      placeholder="Observação"
                      defaultValue={c.observacao || ''}
                      onBlur={(e) =>
                        e.target.value !== (c.observacao || '') &&
                        salvar(c.id, { observacao: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!c.pronto}
                      onCheckedChange={(v) => salvar(c.id, { pronto: v })}
                    />
                    <span>Pronto</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Onde: {c.onde_esta || '—'} · Pronto: {c.pronto ? 'sim' : 'não'}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
