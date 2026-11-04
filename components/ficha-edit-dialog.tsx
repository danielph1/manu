'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { compressGallery } from '@/lib/compress-image';
import { Role } from '@/lib/roles';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { chanceAprovacao } from '@/lib/credito-chance';

const BANCOS = ['Itau', 'BV', 'Creditas', 'Bradesco', 'Pan', 'Safra', 'Santander', 'Volkswagen'];
const STATUS_BANCOS = [
  { v: 'pendente', l: 'Pendente' },
  { v: 'aprovado', l: 'Aprovado' },
  { v: 'negado', l: 'Negado' },
];
const STATUS = [
  { v: 'pendente', l: 'Pendente' },
  { v: 'aprovada', l: 'Aprovada' },
  { v: 'negada', l: 'Negada' },
];

function novoIdentificadorBanco() {
  return `b_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function FichaEditDialog({ fichaId, onClose }: { fichaId: number | null; onClose: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [data, setData] = useState<any>(null);
  const [bancos, setBancos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [erro, setErro] = useState<string | null>(null);
  const [hidratado, setHidratado] = useState<number | null>(null);
  const [estadoSalvar, setEstadoSalvar] = useState<'pronto' | 'pendente' | 'salvando' | 'salvo' | 'erro'>('pronto');
  const ignorarPrimeiroEfeito = useRef(false);
  const timerSalvar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cadeiaSalvar = useRef<Promise<unknown>>(Promise.resolve());
  const versaoRascunho = useRef(0);
  const alterado = useRef(false);
  const houveEdicao = useRef(false);
  const fichaAbertaRef = useRef(fichaId);
  fichaAbertaRef.current = fichaId;

  function payloadDaFicha(d: any, bs: any[], notificarVendedor: boolean) {
    return {
      status_geral: d.status_geral || 'pendente',
      banco_contratado: d.banco_contratado || null,
      valor_liberado: d.valor_liberado === '' ? null : d.valor_liberado,
      valor_veiculo: d.valor_veiculo === '' ? null : d.valor_veiculo,
      entrada_total: d.entrada_total === '' ? null : d.entrada_total,
      entrada_paga: d.entrada_paga === '' ? null : d.entrada_paga,
      valor_pendente: d.valor_pendente === '' ? null : d.valor_pendente,
      fin_parcelas: d.fin_parcelas === '' ? null : d.fin_parcelas,
      fin_valor_parcela: d.fin_valor_parcela === '' ? null : d.fin_valor_parcela,
      observacao_elfenai: d.observacao_elfenai || '',
      etapa_obs: d.etapa_obs || '',
      gerou_boleto: !!d.gerou_boleto,
      boleto_valor: d.boleto_valor === '' ? null : d.boleto_valor,
      boleto_meses: d.boleto_meses === '' ? null : d.boleto_meses,
      boleto_total: d.boleto_total === '' ? null : d.boleto_total,
      pendente_documentacao: !!d.pendente_documentacao,
      contrato_em_analise: !!d.contrato_em_analise,
      pendente_assinatura: !!d.pendente_assinatura,
      contrato_pago: !!d.contrato_pago,
      contrato_recusado: !!d.contrato_recusado,
      bancos: bs,
      notificar_vendedor: notificarVendedor,
    };
  }

  function persistirRascunho(d: any, bs: any[], notificarVendedor = false) {
    const id = fichaId;
    if (!id || !d) return Promise.reject(new Error('Ficha não carregada'));
    if (timerSalvar.current) clearTimeout(timerSalvar.current);
    const versao = versaoRascunho.current;
    const dados = payloadDaFicha(d, bs, notificarVendedor);
    setEstadoSalvar('salvando');
    // Envia alterações em ordem. Nunca permite que uma resposta mais antiga sobrescreva a nova.
    const proximo = cadeiaSalvar.current.catch(() => undefined)
      .then(() => api.put(`/fichas/${id}`, dados));
    cadeiaSalvar.current = proximo.then(() => {
      if (fichaAbertaRef.current === id && versao === versaoRascunho.current) {
        alterado.current = false;
        setEstadoSalvar('salvo');
      }
    }, () => {
      if (fichaAbertaRef.current === id) setEstadoSalvar('erro');
    });
    return proximo;
  }


  useEffect(() => {
    if (timerSalvar.current) clearTimeout(timerSalvar.current);
    if (!fichaId) {
      setData(null); setBancos([]); setErro(null); setHidratado(null);
      setEstadoSalvar('pronto'); alterado.current = false; houveEdicao.current = false; return;
    }
    let ativo = true;
    setData(null); setBancos([]); setErro(null); setHidratado(null);
    setEstadoSalvar('pronto'); alterado.current = false; houveEdicao.current = false;
    api.get(`/fichas/${fichaId}`).then((r) => {
      if (!ativo) return;
      ignorarPrimeiroEfeito.current = true;
      setData({ ...r.data, status_geral: r.data.status_geral || 'pendente' });
      setBancos(r.data.bancos || []);
      setHidratado(fichaId);
    }).catch((e: any) => {
      if (ativo) setErro(e?.response?.data?.error || 'Não foi possível abrir a ficha');
    });
    return () => { ativo = false; if (timerSalvar.current) clearTimeout(timerSalvar.current); };
  }, [fichaId]);

  useEffect(() => {
    if (!fichaId || hidratado !== fichaId || !data || !Role.editarFichaBanco(user)) return;
    if (ignorarPrimeiroEfeito.current) { ignorarPrimeiroEfeito.current = false; return; }
    alterado.current = true;
    houveEdicao.current = true;
    versaoRascunho.current += 1;
    setEstadoSalvar('pendente');
    if (timerSalvar.current) clearTimeout(timerSalvar.current);
    timerSalvar.current = setTimeout(() => {
      persistirRascunho(data, bancos).catch(() => {});
    }, 1200);
    return () => { if (timerSalvar.current) clearTimeout(timerSalvar.current); };
  }, [fichaId, hidratado, data, bancos, user?.tipo]);

  async function fecharSalvando() {
    if (loading) return;
    if (Role.editarFichaBanco(user) && data && fichaId && houveEdicao.current) {
      try {
        setLoading(true);
        await persistirRascunho(data, bancos, houveEdicao.current);
        await cadeiaSalvar.current;
      } catch (e: any) {
        toast.error(e?.response?.data?.error || 'Não foi possível salvar. A ficha continuará aberta.');
        setLoading(false);
        return;
      } finally { setLoading(false); }
    }
    onClose();
  }

  if (!fichaId) return null;
  if (erro) return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <div className="space-y-3 p-4 text-center">
          <p className="text-rose-400">{erro}</p>
          <Button onClick={() => void fecharSalvando()}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
  if (!data) return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent><div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div></DialogContent>
    </Dialog>
  );

  const canEdit = Role.editarFichaBanco(user);
  const vendedorReadOnly = user?.tipo === 'vendedor';
  const lead = data.lead || {};

  async function save(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await persistirRascunho(data, bancos, true);
      toast.success('Ficha, bancos e etapas salvos. Vendedor notificado.');
      qc.invalidateQueries({ queryKey: ['fichas'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['metricas'] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar. Seus dados continuam na tela.');
    } finally { setLoading(false); }
  }

  async function gerarVenda() {
    setLoading(true);
    try {
      // Primeiro persiste todos os campos, bancos e etapas, depois gera o faturamento.
      await persistirRascunho(data, bancos, true);
      const fat = await api.post('/faturamento', {
        // A empresa nunca é escolhida por adivinhação: vem do vendedor da ficha,
        // e o backend confirma se a loja pertence à empresa.
        empresa_id: data.empresa_id || lead.empresa_id || user?.empresa_id,
        loja: data.loja || user?.loja,
        lead_id: data.lead_id || lead.id,
        ficha_id: fichaId,
        nome: lead.nome_completo || lead.nome_lead,
        cpf_cnpj: lead.cpf,
        endereco: lead.endereco,
        bairro: lead.bairro,
        cidade: lead.cidade,
        cep: lead.cep,
        email: lead.email,
        telefone: lead.telefone,
        marca: lead.marca_carro,
        modelo: lead.carro_selecionado,
        ano_modelo: lead.ano_carro,
        placa: lead.placa_carro,
        cor: lead.cor_carro,
        entrada_total: Number(data.entrada_total) || Number(lead.valor_entrada) || 0,
        fin_banco: data.banco_contratado,
        fin_parcelas: data.fin_parcelas || data.boleto_meses,
        fin_valor_parcela: Number(data.fin_valor_parcela) || 0,
        vendedor_nome: data.vendedor_nome || lead.vendedor_nome,
        status: 'preenchido',
        observacoes: data.gerou_boleto ? `boleto de ${data.boleto_total || 0}. ${data.boleto_meses || ''}x de ${data.boleto_valor || 0}` : '',
      });
      toast.success('Venda gerada. Faturamento pré-preenchido.');
      onClose();
      router.push('/faturamento');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao gerar venda');
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={!!fichaId} onOpenChange={(o) => !o && void fecharSalvando()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha de crédito #{fichaId} — {lead.nome_lead}</DialogTitle>
          {canEdit && <p role="status" aria-live="polite" className={`text-xs ${estadoSalvar === 'erro' ? 'text-rose-400' : 'text-muted-foreground'}`}>
            {estadoSalvar === 'salvando' ? 'Salvando alterações…' : estadoSalvar === 'pendente' ? 'Alterações pendentes de sincronização…' : estadoSalvar === 'salvo' ? 'Todas as alterações foram salvas automaticamente.' : estadoSalvar === 'erro' ? 'Falha ao salvar automaticamente. Confira a conexão antes de fechar.' : 'Alterações serão salvas automaticamente.'}
          </p>}
        </DialogHeader>

        <form onSubmit={save} className="space-y-5">
          {/* Dados do vendedor (sempre read-only aqui) */}
          <div>
            <div className="mb-2 text-sm font-medium text-muted-foreground">Dados preenchidos pelo vendedor</div>
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              <ReadOnly label="Nome completo" value={lead.nome_completo || lead.nome_lead} />
              <ReadOnly label="CPF" value={lead.cpf} />
              <ReadOnly label="Telefone" value={lead.telefone} />
              <ReadOnly label="Nascimento" value={lead.data_nascimento} />
              <ReadOnly label="Habilitado" value={lead.habilitado ? 'Sim' : 'Não'} />
              <ReadOnly label="RG" value={lead.rg} />
              <ReadOnly label="Órgão" value={lead.orgao_expeditor} />
              <ReadOnly label="Nome do pai" value={lead.nome_pai} />
              <ReadOnly label="Nome da mãe" value={lead.nome_mae} />
              <ReadOnly label="E-mail" value={lead.email} />
              <ReadOnly label="Endereço" value={lead.endereco} />
              <ReadOnly label="Bairro" value={lead.bairro} />
              <ReadOnly label="Cidade" value={lead.cidade} />
              <ReadOnly label="Estado" value={lead.estado} />
              <ReadOnly label="CEP" value={lead.cep} />
              <ReadOnly label="Empresa" value={lead.empresa} />
              <ReadOnly label="CNPJ" value={lead.cnpj} />
              <ReadOnly label="Endereço empresa" value={lead.endereco_empresa} />
              <ReadOnly label="Salário" value={lead.salario && `R$ ${Number(lead.salario).toLocaleString('pt-BR')}`} />
              <ReadOnly label="Tempo de carreira" value={lead.tempo_carreira} />
              <ReadOnly label="Banco corrente" value={lead.banco_correntista} />
              <ReadOnly label="Veículo" value={[lead.marca_carro, lead.carro_selecionado].filter(Boolean).join(' ')} />
              <ReadOnly label="Ano" value={lead.ano_carro} />
              <ReadOnly label="Placa" value={lead.placa_carro} />
              <ReadOnly label="Valor do carro" value={lead.valor_carro && `R$ ${Number(lead.valor_carro).toLocaleString('pt-BR')}`} />
              <ReadOnly label="Valor entrada" value={lead.valor_entrada && `R$ ${Number(lead.valor_entrada).toLocaleString('pt-BR')}`} />
            </div>
          </div>

          <Separator />

          {vendedorReadOnly ? (
            <div>
              <div className="mb-2 text-sm font-medium text-muted-foreground">Resposta do ElfenAI (read-only)</div>
              <div className="grid gap-3 md:grid-cols-3 text-sm">
                <ReadOnly label="Banco contratado" value={data.banco_contratado} />
                <ReadOnly label="Status" value={data.status_geral} />
                {data.bancos?.map((b: any) => (
                  <ReadOnly key={b.id} label={`Parcela ${b.banco}`} value={b.parcela_48 ? `48x R$ ${Number(b.parcela_48).toLocaleString('pt-BR')}` : (b.parcela_60 ? `60x R$ ${Number(b.parcela_60).toLocaleString('pt-BR')}` : '-')} />
                ))}
                {data.gerou_boleto && <>
                  <ReadOnly label="Boleto valor" value={`R$ ${Number(data.boleto_valor || 0).toLocaleString('pt-BR')}`} />
                  <ReadOnly label="Boleto meses" value={data.boleto_meses} />
                </>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {data.pendente_documentacao && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-400">Pendente documentação</span>}
                {data.contrato_em_analise && <span className="rounded-full bg-sky-500/15 px-2 py-1 text-sky-400">Contrato em análise</span>}
                {data.contrato_recusado && <span className="rounded-full bg-rose-500/15 px-2 py-1 text-rose-400">Recusado pelo banco</span>}
                {data.pendente_assinatura && <span className="rounded-full bg-violet-500/15 px-2 py-1 text-violet-400">Pendente assinatura</span>}
                {data.contrato_pago && <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-400">Contrato pago</span>}
              </div>
              {data.observacao_elfenai && <div className="mt-3 rounded-lg border border-primary/30 p-3">
                <p className="text-sm font-semibold">Orientação do setor bancário</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{data.observacao_elfenai}</p>
              </div>}
              {data.etapa_obs && <div className="mt-2 rounded-lg border p-3">
                <p className="text-sm font-semibold">Próximos passos / documentos</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{data.etapa_obs}</p>
              </div>}
              {data.bancos?.filter((b: any) => !!b.observacao).map((b: any) => (
                <div key={b.id || b.client_key} className="mt-2 rounded-md border p-3 text-sm">
                  <strong>{b.banco} ({b.status || 'pendente'}):</strong> {b.observacao}
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Editavel por ElfenAI/Gerente */}
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-muted-foreground">Bancos  o ElfenAI preenche aqui</div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      Score:{' '}
                      <b className="text-foreground">
                        {data?.score ?? lead?.score ?? 'sem score'}
                      </b>
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setBancos([...bancos, { client_key: novoIdentificadorBanco(), banco: '', status: 'pendente' }])}>
                      <Plus className="mr-1 h-3 w-3" />Adicionar banco
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {bancos.map((b, i) => {
                    const scoreRaw = data?.score ?? data?.lead?.score ?? lead?.score;
                    const scoreNum = scoreRaw === '' || scoreRaw == null ? null : Number(scoreRaw);
                    const chance = chanceAprovacao({
                      score: scoreNum,
                      banco: b.banco,
                      valorEntrada: Number(data?.entrada_total ?? data?.valor_entrada ?? lead?.valor_entrada) || null,
                      valorCarro: Number(data?.valor_veiculo ?? data?.valor_carro ?? lead?.valor_carro) || null,
                    });
                    const chanceCls =
                      chance.nivel === 'alto'
                        ? 'bg-sky-500/15 text-sky-400'
                        : chance.nivel === 'medio'
                          ? 'bg-amber-500/15 text-amber-400'
                          : chance.nivel === 'baixo'
                            ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-muted text-muted-foreground';
                    return (
                    <div key={i} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-6">
                      <div className="md:col-span-2">
                        <Label className="text-xs">Banco</Label>
                        <Select value={b.banco || ''} onValueChange={(v) => setBancos(bancos.map((x, j) => j === i ? { ...x, banco: v } : x))}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{BANCOS.map((bb) => <SelectItem key={bb} value={bb}>{bb}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Status</Label>
                        <Select value={b.status || 'pendente'} onValueChange={(v) => setBancos(bancos.map((x, j) => j === i ? { ...x, status: v } : x))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUS_BANCOS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Valor liberado</Label><Input type="number" value={b.valor_financiado ?? ''} onChange={(e) => setBancos(bancos.map((x, j) => j === i ? { ...x, valor_financiado: e.target.value } : x))} /></div>
                      <div><Label className="text-xs">Parcela 48x</Label><Input type="number" value={b.parcela_48 ?? ''} onChange={(e) => setBancos(bancos.map((x, j) => j === i ? { ...x, parcela_48: e.target.value } : x))} /></div>
                      <div><Label className="text-xs">Parcela 60x</Label><Input type="number" value={b.parcela_60 ?? ''} onChange={(e) => setBancos(bancos.map((x, j) => j === i ? { ...x, parcela_60: e.target.value } : x))} /></div>
                      <div className="md:col-span-5"><Label className="text-xs">Observacao</Label><Input value={b.observacao ?? ''} onChange={(e) => setBancos(bancos.map((x, j) => j === i ? { ...x, observacao: e.target.value } : x))} /></div>
                      <div className="flex flex-col items-center justify-center gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setBancos(bancos.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${chanceCls}`} title={chance.detalhe || ''}>
                          {chance.sem_score
                            ? 'sem score'
                            : `chance: ${chance.label}${chance.p != null ? ` (${Math.round(chance.p * 100)}%)` : ''}`}
                        </span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label className="text-xs">Observação / resposta ao vendedor</Label>
                  <Textarea rows={3} value={data.observacao_elfenai || ''} onChange={(e) => setData({ ...data, observacao_elfenai: e.target.value })}
                    placeholder="Ex.: Banco aprovou 48 parcelas. Solicitar comprovante de renda." />
                </div>
                <div><Label className="text-xs">Orientações sobre documentos e próximas etapas</Label>
                  <Textarea rows={3} value={data.etapa_obs || ''} onChange={(e) => setData({ ...data, etapa_obs: e.target.value })}
                    placeholder="Ex.: Aguardar assinatura e enviar documentos à financeira." />
                </div>
              </div>
              <Separator />
              <div>
                <div className="mb-2 text-sm font-medium text-muted-foreground">Resumo contratado</div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div><Label className="text-xs">Banco contratado</Label>
                    <Select value={data.banco_contratado || ''} onValueChange={(v) => setData({ ...data, banco_contratado: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{BANCOS.map((bb) => <SelectItem key={bb} value={bb}>{bb}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Status geral</Label>
                    <Select value={data.status_geral || 'pendente'} onValueChange={(v) => setData({ ...data, status_geral: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Valor liberado</Label><Input type="number" value={data.valor_liberado ?? ''} onChange={(e) => setData({ ...data, valor_liberado: e.target.value })} /></div>
                  <div><Label className="text-xs">Valor veiculo</Label><Input type="number" value={data.valor_veiculo ?? ''} onChange={(e) => setData({ ...data, valor_veiculo: e.target.value })} /></div>
                  <div><Label className="text-xs">Entrada total</Label><Input type="number" value={data.entrada_total ?? ''} onChange={(e) => setData({ ...data, entrada_total: e.target.value })} /></div>
                  <div><Label className="text-xs">Entrada paga</Label><Input type="number" value={data.entrada_paga ?? ''} onChange={(e) => setData({ ...data, entrada_paga: e.target.value })} /></div>
                </div>
                <div className="mt-3 flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={!!data.gerou_boleto} onCheckedChange={(v) => setData({ ...data, gerou_boleto: !!v })} />
                    <Label>Gerou boleto</Label>
                  </div>
                  {data.gerou_boleto && (<>
                    <div><Label className="text-xs">Valor</Label><Input className="w-32" type="number" value={data.boleto_valor ?? ''} onChange={(e) => setData({ ...data, boleto_valor: e.target.value })} /></div>
                    <div><Label className="text-xs">Meses</Label><Input className="w-24" type="number" value={data.boleto_meses ?? ''} onChange={(e) => setData({ ...data, boleto_meses: e.target.value })} /></div>
                    <div><Label className="text-xs">Total</Label><Input className="w-32" type="number" value={data.boleto_total ?? ''} onChange={(e) => setData({ ...data, boleto_total: e.target.value })} /></div>
                  </>)}
                </div>
              </div>

              {/* Etapas pós-aprovação — ElfenAI acompanha o banco */}
              <Separator />
              <div className="space-y-3 rounded border border-border p-3">
                <div className="text-sm font-medium">Etapas do banco (após aprovado)</div>
                <p className="text-xs text-muted-foreground">
                  Ligar/desligar conforme o banco avança. Pendente documentação avisa o vendedor.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                    <Checkbox
                      checked={!!data.pendente_documentacao}
                      onCheckedChange={(v) => setData({ ...data, pendente_documentacao: !!v })}
                    />
                    <span className="text-sm">Pendente documentação</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                    <Checkbox
                      checked={!!data.contrato_em_analise}
                      onCheckedChange={(v) => setData({ ...data, contrato_em_analise: !!v, contrato_recusado: v ? data.contrato_recusado : false })}
                    />
                    <span className="text-sm">Contrato em análise</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                    <Checkbox
                      checked={!!data.pendente_assinatura}
                      onCheckedChange={(v) => setData({ ...data, pendente_assinatura: !!v })}
                    />
                    <span className="text-sm">Pendente assinatura</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                    <Checkbox
                      checked={!!data.contrato_pago}
                      onCheckedChange={(v) => setData({ ...data, contrato_pago: !!v, contrato_recusado: v ? false : data.contrato_recusado, status_geral: v ? 'aprovada' : data.status_geral })}
                    />
                    <span className="text-sm">Contrato pago</span>
                  </label>
                </div>
                {!!data.contrato_em_analise && (
                  <label className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2">
                    <Checkbox
                      checked={!!data.contrato_recusado}
                      onCheckedChange={(v) => setData({ ...data, contrato_recusado: !!v, contrato_pago: v ? false : data.contrato_pago, status_geral: v ? 'negada' : 'pendente' })}
                    />
                    <span className="text-sm text-rose-400">Recusado pelo banco (na análise)</span>
                  </label>
                )}
              </div>
            </>
          )}

          {canEdit && (
            <div className="space-y-2 rounded border border-border p-3">
              <div className="text-sm font-medium">Como foi a venda (vai para o faturamento)</div>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <Label className="text-xs">Banco escolhido</Label>
                  <Select value={data.banco_contratado || ''} onValueChange={(v) => setData({ ...data, banco_contratado: v })}>
                    <SelectTrigger><SelectValue placeholder="Opcional — à vista não precisa" /></SelectTrigger>
                    <SelectContent>
                      {bancos.filter((b: any) => String(b.status || '').toLowerCase().startsWith('aprov')).map((b: any) => (
                        <SelectItem key={b.banco} value={b.banco}>{b.banco}</SelectItem>
                      ))}
                      {bancos.filter((b: any) => String(b.status || '').toLowerCase().startsWith('aprov')).length === 0 && (
                        <SelectItem value="__none" disabled>Nenhum banco aprovado</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Entrada</Label><Input type="number" value={data.entrada_total ?? ''} onChange={(e) => setData({ ...data, entrada_total: e.target.value })} /></div>
                <div><Label className="text-xs">Parcelas</Label><Input type="number" value={data.fin_parcelas ?? data.boleto_meses ?? ''} onChange={(e) => setData({ ...data, fin_parcelas: e.target.value })} /></div>
                <div><Label className="text-xs">Valor da parcela</Label><Input type="number" value={data.fin_valor_parcela ?? ''} onChange={(e) => setData({ ...data, fin_valor_parcela: e.target.value })} /></div>
                <div><Label className="text-xs">Valor financiado (só elfenAI)</Label><Input type="number" value={data.valor_liberado ?? ''} onChange={(e) => setData({ ...data, valor_liberado: e.target.value })} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Os outros bancos ficam na ficha. Aqui só escolhe qual foi o contratado.</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium">Anexos</div>
<input type="file" accept="image/*,.pdf,.doc,.docx" onChange={async (e) => {
              let f = e.target.files?.[0];
              if (!f) return;
              try {
                if (f.type.startsWith('image/')) {
                  f = await compressGallery(f);
                }
              } catch { /* segue original */ }
              const reader = new FileReader();
              reader.onload = async () => {
                const data = String(reader.result || '');
                const b64 = data.includes(',') ? data.split(',')[1] : data;
                try {
                  await api.post(`/fichas/${fichaId}/anexos`, { nome: f.name, mime: f.type || 'application/octet-stream', arquivo_b64: b64 });
                  toast.success('Anexo salvo. elfenAI avisado.');
                } catch (err: any) { toast.error(err?.response?.data?.error || 'Erro no anexo'); }
              };
              reader.readAsDataURL(f);
            }} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => void fecharSalvando()}>Fechar</Button>
            {canEdit && (
              <Button type="button" variant="outline" disabled={loading} onClick={gerarVenda}>Gerou venda</Button>
            )}
            {canEdit && (
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar e devolver ao vendedor
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReadOnly({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value || <span className="text-muted-foreground/60">-</span>}</div>
    </div>
  );
}
