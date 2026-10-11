'use client';
// Novo lead - formulario completo com todos os campos da ficha quando marca "gerar ficha"
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

export default function NovoLeadPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [gerarFicha, setGerarFicha] = useState(false);
  const [form, setForm] = useState<any>({
    nome_lead: '', telefone: '', cpf: '', produto_interesse: '', observacao: '',
    data_lead: new Date().toISOString().slice(0, 10),
    vendedor_id: user?.vendedor_id || '',
    em_loja: false, venda_concluida: false,
    nome_completo: '', data_nascimento: '', habilitado: false,
    carro_selecionado: '', ano_carro: '', placa_carro: '', valor_carro: '', valor_entrada: '',
    nome_pai: '', nome_mae: '', rg: '', data_expedicao: '', orgao_expeditor: '',
    email: '', endereco: '', bairro: '', cidade: '', estado: '', cep: '',
    empresa: '', cnpj: '', endereco_empresa: '', cep_empresa: '', salario: '', banco_correntista: '',
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores'],
    queryFn: async () => (await api.get('/vendedores')).data,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/leads', { ...form, gerou_ficha: gerarFicha });
      toast.success('Lead criado!');
      router.push('/painel');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro ao criar lead');
    } finally { setLoading(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">Novo Lead</h1>
      </header>
      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox checked={gerarFicha} onCheckedChange={(v) => setGerarFicha(!!v)} />
                <Label className="cursor-pointer">Gerar ficha de credito</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={form.em_loja} onCheckedChange={(v) => setForm({ ...form, em_loja: !!v })} />
                <Label className="cursor-pointer">Cliente esta na loja</Label>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <F label="Nome do lead*" value={form.nome_lead} onChange={(v) => setForm({ ...form, nome_lead: v })} required />
              <F label="Data que o lead chegou*" type="date" value={form.data_lead} onChange={(v) => setForm({ ...form, data_lead: v })} required />
              <F label="Telefone*" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} required />
              <div className="space-y-1.5">
                <Label className="text-sm">Vendedor responsavel*</Label>
                <Select value={String(form.vendedor_id || '')} onValueChange={(v) => setForm({ ...form, vendedor_id: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {vendedores.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <F label="Produto de interesse" value={form.produto_interesse} onChange={(v) => setForm({ ...form, produto_interesse: v })} />
              <F label="CPF" value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} />
            </div>

            {gerarFicha && (
              <>
                <Separator />
                <div className="text-sm font-medium">Dados da ficha</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <F label="Nome completo" value={form.nome_completo} onChange={(v) => setForm({ ...form, nome_completo: v })} />
                  <F label="Data de nascimento" type="date" value={form.data_nascimento} onChange={(v) => setForm({ ...form, data_nascimento: v })} />
                  <div className="flex items-center gap-6">
                    <Label>Habilitado?</Label>
                    <RadioGroup className="flex gap-4" value={form.habilitado ? 'sim' : 'nao'} onValueChange={(v) => setForm({ ...form, habilitado: v === 'sim' })}>
                      <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="h-nao" /><Label htmlFor="h-nao">Nao</Label></div>
                      <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="h-sim" /><Label htmlFor="h-sim">Sim</Label></div>
                    </RadioGroup>
                  </div>
                  <F label="Valor de entrada" type="number" value={form.valor_entrada} onChange={(v) => setForm({ ...form, valor_entrada: v })} />
                </div>

                <div className="text-sm font-medium pt-2">Veiculo</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <F label="Carro selecionado" value={form.carro_selecionado} onChange={(v) => setForm({ ...form, carro_selecionado: v })} />
                  <F label="Ano do carro" value={form.ano_carro} onChange={(v) => setForm({ ...form, ano_carro: v })} />
                  <F label="Placa" value={form.placa_carro} onChange={(v) => setForm({ ...form, placa_carro: v })} />
                  <F label="Valor do carro" type="number" value={form.valor_carro} onChange={(v) => setForm({ ...form, valor_carro: v })} />
                </div>

                <div className="text-sm font-medium pt-2">Dados pessoais</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <F label="Nome do pai" value={form.nome_pai} onChange={(v) => setForm({ ...form, nome_pai: v })} />
                  <F label="Nome da mae" value={form.nome_mae} onChange={(v) => setForm({ ...form, nome_mae: v })} />
                  <F label="RG" value={form.rg} onChange={(v) => setForm({ ...form, rg: v })} />
                  <F label="Data de expedicao" type="date" value={form.data_expedicao} onChange={(v) => setForm({ ...form, data_expedicao: v })} />
                  <F label="Orgao expedidor" value={form.orgao_expeditor} onChange={(v) => setForm({ ...form, orgao_expeditor: v })} />
                  <F label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                  <F label="Endereco" value={form.endereco} onChange={(v) => setForm({ ...form, endereco: v })} />
                  <F label="Bairro" value={form.bairro} onChange={(v) => setForm({ ...form, bairro: v })} />
                  <F label="Cidade" value={form.cidade} onChange={(v) => setForm({ ...form, cidade: v })} />
                  <F label="Estado" value={form.estado} onChange={(v) => setForm({ ...form, estado: v })} />
                  <F label="CEP" value={form.cep} onChange={(v) => setForm({ ...form, cep: v })} />
                </div>

                <div className="text-sm font-medium pt-2">Dados profissionais (opcional)</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <F label="Empresa" value={form.empresa} onChange={(v) => setForm({ ...form, empresa: v })} />
                  <F label="CNPJ" value={form.cnpj} onChange={(v) => setForm({ ...form, cnpj: v })} />
                  <F label="Endereco empresa" value={form.endereco_empresa} onChange={(v) => setForm({ ...form, endereco_empresa: v })} />
                  <F label="CEP empresa" value={form.cep_empresa} onChange={(v) => setForm({ ...form, cep_empresa: v })} />
                  <F label="Salario" type="number" value={form.salario} onChange={(v) => setForm({ ...form, salario: v })} />
                  <F label="Banco correntista" value={form.banco_correntista} onChange={(v) => setForm({ ...form, banco_correntista: v })} />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Observacoes gerais</Label>
              <Textarea rows={3} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {gerarFicha ? 'Gerar ficha e salvar lead' : 'Salvar lead'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function F({ label, value, onChange, type = 'text', required }: any) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}
