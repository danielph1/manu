'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { leadsService } from '@/lib/services';
import { useAuth } from '@/contexts/auth-context';
import { Role } from '@/lib/roles';
import type { Lead } from '@/types';
import { Loader2, Trash2 } from 'lucide-react';

export function LeadEditDialog({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (lead) setForm({ ...lead }); }, [lead]);
  if (!lead) return null;

  const canEdit = Role.editarLead(user, lead.vendedor_id);
  const canDelete = Role.isGerente(user);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setLoading(true);
    try {
      await leadsService.update(lead!.id, form);
      toast.success('Lead atualizado');
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
    } finally { setLoading(false); }
  }

  async function del() {
    if (!confirm(`Excluir lead "${lead!.nome_lead}"?`)) return;
    try {
      await leadsService.remove(lead!.id);
      toast.success('Lead excluido');
      qc.invalidateQueries({ queryKey: ['leads'] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao excluir');
    }
  }

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lead.nome_lead}
            {lead.venda_concluida && <Badge className="bg-emerald-600">VENDIDO</Badge>}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={save} className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nome completo" value={form.nome_completo || form.nome_lead} onChange={(v) => setForm({ ...form, nome_completo: v, nome_lead: v })} disabled={!canEdit} />
            <Field label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} disabled={!canEdit} />
            <Field label="CPF" value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} disabled={!canEdit} />
            <Field label="Data do lead" type="date" value={form.data_lead} onChange={(v) => setForm({ ...form, data_lead: v })} disabled={!canEdit} />
            <Field label="Marca" value={form.marca_carro} onChange={(v) => setForm({ ...form, marca_carro: v })} disabled={!canEdit} />
            <Field label="Modelo" value={form.carro_selecionado} onChange={(v) => setForm({ ...form, carro_selecionado: v })} disabled={!canEdit} />
            <Field label="Ano/modelo" value={form.ano_carro} onChange={(v) => setForm({ ...form, ano_carro: v })} disabled={!canEdit} />
            <Field label="Placa" value={form.placa_carro} onChange={(v) => setForm({ ...form, placa_carro: v })} disabled={!canEdit} />
            <Field label="Valor do veículo" value={form.valor_carro} onChange={(v) => setForm({ ...form, valor_carro: v })} disabled={!canEdit} />
          </div>

          <div className="flex flex-wrap gap-5">
            <CheckField label="Respondeu" checked={!!form.respondeu} onChange={(v) => setForm({ ...form, respondeu: v })} disabled={!canEdit} />
            <CheckField label="Gerar ficha de credito" checked={!!form.gerou_ficha} onChange={(v) => setForm({ ...form, gerou_ficha: v })} disabled={!canEdit} />
            <CheckField label="Cliente na loja" checked={!!form.em_loja} onChange={(v) => setForm({ ...form, em_loja: v, cliente_na_loja: v })} disabled={!canEdit} />
            <CheckField label="Venda concluida" checked={!!form.venda_concluida} onChange={(v) => setForm({ ...form, venda_concluida: v })} disabled={!canEdit} />
          </div>

          {(form.gerou_ficha || form.em_loja) && (
            <p className="text-xs text-amber-400">Vai para o elfenAI analisar o crédito.</p>
          )}

          {form.gerou_ficha && (
            <>
              <Separator />
              <div className="text-sm font-medium text-muted-foreground">Dados da ficha</div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Data de nascimento" type="date" value={form.data_nascimento} onChange={(v) => setForm({ ...form, data_nascimento: v })} disabled={!canEdit} />
                <CheckField label="Habilitado" checked={!!form.habilitado} onChange={(v) => setForm({ ...form, habilitado: v })} disabled={!canEdit} />
                <Field label="Cor" value={form.cor_carro} onChange={(v) => setForm({ ...form, cor_carro: v })} disabled={!canEdit} />
                <Field label="Valor de entrada" value={form.valor_entrada} onChange={(v) => setForm({ ...form, valor_entrada: v })} disabled={!canEdit} />
                <Field
                  label="Score de crédito"
                  value={form.score ?? ''}
                  onChange={(v) => setForm({ ...form, score: v })}
                  disabled={!canEdit}
                  placeholder="0–1000 (opcional)"
                />
              </div>
            </>
          )}

          {form.em_loja && (
            <>
              <Separator />
              <div className="text-sm font-medium text-muted-foreground">Cliente na loja — dados completos</div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="RG" value={form.rg} onChange={(v) => setForm({ ...form, rg: v })} disabled={!canEdit} />
                <Field label="Órgão expedidor" value={form.orgao_expeditor} onChange={(v) => setForm({ ...form, orgao_expeditor: v })} disabled={!canEdit} />
                <Field label="Nome do pai" value={form.nome_pai} onChange={(v) => setForm({ ...form, nome_pai: v })} disabled={!canEdit} />
                <Field label="Nome da mãe" value={form.nome_mae} onChange={(v) => setForm({ ...form, nome_mae: v })} disabled={!canEdit} />
                <Field label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} disabled={!canEdit} />
                <Field label="Endereço" value={form.endereco} onChange={(v) => setForm({ ...form, endereco: v })} disabled={!canEdit} />
                <Field label="Bairro" value={form.bairro} onChange={(v) => setForm({ ...form, bairro: v })} disabled={!canEdit} />
                <Field label="Cidade" value={form.cidade} onChange={(v) => setForm({ ...form, cidade: v })} disabled={!canEdit} />
                <Field label="Estado" value={form.estado} onChange={(v) => setForm({ ...form, estado: v })} disabled={!canEdit} />
                <Field label="CEP" value={form.cep} onChange={(v) => setForm({ ...form, cep: v })} disabled={!canEdit} />
                <Field label="Empresa" value={form.empresa} onChange={(v) => setForm({ ...form, empresa: v })} disabled={!canEdit} />
                <Field label="CNPJ" value={form.cnpj} onChange={(v) => setForm({ ...form, cnpj: v })} disabled={!canEdit} />
                <Field label="Salário" value={form.salario} onChange={(v) => setForm({ ...form, salario: v })} disabled={!canEdit} />
                <Field label="Banco correntista" value={form.banco_correntista} onChange={(v) => setForm({ ...form, banco_correntista: v })} disabled={!canEdit} />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea rows={2} value={form.observacao ?? ''} onChange={(e) => setForm({ ...form, observacao: e.target.value })} disabled={!canEdit} />
          </div>

          <div className="space-y-2 rounded border border-border p-3">
            <Label>Comentário interno (segura o lead)</Label>
            <p className="text-xs text-muted-foreground">
              Se preencher, o sistema não transfere o lead automaticamente. Não vai para o cliente.
            </p>
            <Textarea
              rows={2}
              value={form.comentario_interno ?? ''}
              onChange={(e) => setForm({ ...form, comentario_interno: e.target.value })}
              disabled={!canEdit}
              placeholder="Ex: cliente disse que volta amanhã"
            />
          </div>

          <DialogFooter className="gap-2">
            {canDelete && (
              <Button type="button" variant="outline" onClick={del}>
                <Trash2 className="mr-2 h-4 w-4" />Excluir
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!canEdit || loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, type = 'text', disabled }: any) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

function CheckField({ label, checked, onChange, disabled }: any) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} disabled={disabled} />
      <Label className="cursor-pointer font-normal">{label}</Label>
    </div>
  );
}
