'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Loader2, Download, Printer, Plus } from 'lucide-react';
import { toast } from 'sonner';

const CAMPOS = [
  'nome','cpf_cnpj','endereco','bairro','cidade','cep','email','telefone',
  'marca','modelo','ano_modelo','placa','cor','kilometragem',
  'entrada_dinheiro','entrada_debito','entrada_credito','entrada_transferencia','entrada_boleto','entrada_total',
  'fin_banco','fin_parcelas','fin_valor_parcela',
  'troca_marca_modelo','troca_ano_modelo','troca_placa','troca_cor','troca_km',
  'observacoes','vendedor_nome',
] as const;

export default function FaturamentoPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['faturamento', q],
    queryFn: async () => (await api.get('/faturamento', { params: { busca: q || undefined } })).data,
  });

  async function abrir(id: number) {
    try {
      const r = await api.get(`/faturamento/${id}`);
      setAberto(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Não foi possível abrir');
    }
  }

  async function baixar(id: number, placa: string) {
    try {
      const r = await api.get(`/faturamento/${id}/html`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `faturamento-${placa || id}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao baixar');
    }
  }

  async function imprimir(id: number) {
    try {
      const r = await api.get(`/faturamento/${id}/html`, { responseType: 'text' });
      const w = window.open('', '_blank');
      if (!w) { toast.error('Bloqueou a janela'); return; }
      w.document.write(r.data);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 300);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao imprimir');
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form?.nome || !form?.placa) { toast.error('Nome e placa são obrigatórios'); return; }
    setSalvando(true);
    try {
      await api.post('/faturamento', form);
      toast.success('Faturamento salvo');
      setForm(null);
      qc.invalidateQueries({ queryKey: ['faturamento'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
    } finally { setSalvando(false); }
  }

  function set(k: string, v: string) { setForm((f: any) => ({ ...f, [k]: v })); }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Faturamento</h1>
          <p className="text-sm text-muted-foreground mt-1">Pesquisa por placa, nome, CPF ou vendedor.</p>
        </div>
        <Button onClick={() => setForm({})}><Plus className="mr-1 h-4 w-4" /> Novo</Button>
      </header>

      <div className="flex gap-2">
        <Input placeholder="Placa, nome, CPF, vendedor..." value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setQ(busca.trim())} />
        <Button onClick={() => setQ(busca.trim())}><Search className="h-4 w-4 mr-1" /> Buscar</Button>
      </div>

      {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}

      <div className="space-y-3">
        {(Array.isArray(rows) ? rows : []).map((f: any) => (
          <Card key={f.id} className="cursor-pointer hover:border-primary/50" onClick={() => abrir(f.id)}>
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{f.nome} · {f.placa}</div>
                <div className="text-sm text-muted-foreground">
                  {f.vendedor_nome || '—'} · entrada R$ {Number(f.entrada_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  {' · '}{f.status || '—'}
                  {f.created_at && <> · {new Date(f.created_at).toLocaleDateString('pt-BR')}</>}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{f.marca} {f.modelo} {f.ano_modelo}</div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && (!Array.isArray(rows) || rows.length === 0) && (
          <p className="text-center text-muted-foreground py-8">Nenhum faturamento encontrado.</p>
        )}
      </div>

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Faturamento · {aberto?.placa}</DialogTitle></DialogHeader>
          {aberto && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><b>Nome</b><br/>{aberto.nome}</div>
                <div><b>CPF</b><br/>{aberto.cpf_cnpj}</div>
                <div><b>Placa</b><br/>{aberto.placa}</div>
                <div><b>Veículo</b><br/>{aberto.marca} {aberto.modelo} {aberto.ano_modelo}</div>
                <div><b>Entrada</b><br/>R$ {Number(aberto.entrada_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div><b>Banco</b><br/>{aberto.fin_banco || '—'}</div>
                <div><b>Parcelas</b><br/>{aberto.fin_parcelas || '—'} x R$ {Number(aberto.fin_valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div><b>Vendedor</b><br/>{aberto.vendedor_nome || '—'}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Anexar comprovante</Label>
                <input type="file" accept="image/*,.pdf" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = async () => {
                    const data = String(reader.result || '');
                    const b64 = data.includes(',') ? data.split(',')[1] : data;
                    try {
                      await api.post(`/faturamento/${aberto.id}/anexos`, { nome: f.name, mime: f.type, arquivo_b64: b64 });
                      toast.success('Anexo salvo. Sai junto no HTML.');
                    } catch (err: any) { toast.error(err?.response?.data?.error || 'Erro no anexo'); }
                  };
                  reader.readAsDataURL(f);
                }} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => baixar(aberto.id, aberto.placa)}><Download className="mr-1 h-4 w-4" /> Baixar HTML</Button>
                <Button variant="outline" onClick={() => imprimir(aberto.id)}><Printer className="mr-1 h-4 w-4" /> Imprimir</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Novo faturamento</DialogTitle></DialogHeader>
          {form && (
            <form onSubmit={salvar} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {['nome','cpf_cnpj','telefone','email','endereco','bairro','cidade','cep','marca','modelo','ano_modelo','placa','cor','kilometragem','vendedor_nome'].map((k) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs capitalize">{k.replace(/_/g, ' ')}</Label>
                    <Input value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
                  </div>
                ))}
              </div>
              <div className="text-sm font-medium text-muted-foreground">Entrada</div>
              <div className="grid gap-3 md:grid-cols-3">
                {['entrada_dinheiro','entrada_debito','entrada_credito','entrada_transferencia','entrada_boleto','entrada_total'].map((k) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs">{k.replace('entrada_', '')}</Label>
                    <Input type="number" value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
                  </div>
                ))}
              </div>
              <div className="text-sm font-medium text-muted-foreground">Financiamento (sem valor financiado)</div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1"><Label className="text-xs">Banco</Label><Input value={form.fin_banco ?? ''} onChange={(e) => set('fin_banco', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Parcelas</Label><Input value={form.fin_parcelas ?? ''} onChange={(e) => set('fin_parcelas', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Valor da parcela</Label><Input type="number" value={form.fin_valor_parcela ?? ''} onChange={(e) => set('fin_valor_parcela', e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Observações</Label><Textarea value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></div>
              <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
