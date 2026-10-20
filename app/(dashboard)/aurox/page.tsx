'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { Building2, Plus, Power, PowerOff, X, Trash2 } from 'lucide-react';

type LojaField = { codigo: string; nome: string };

export default function AuroxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSuper = String(user?.tipo || '').toLowerCase().trim() === 'superadmin';

  const { data: empresas = [], isLoading, error } = useQuery({
    queryKey: ['aurox-empresas'],
    queryFn: async () => (await api.get('/aurox/empresas')).data,
    enabled: isSuper,
  });

  const [form, setForm] = useState({
    nome: '',
    slug: '',
    admin_nome: '',
    admin_login: '',
    admin_senha: '',
  });
  const [lojas, setLojas] = useState<LojaField[]>([{ codigo: '001', nome: '' }]);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  // confirmação de senha (desativar empresa)
  const [confirm, setConfirm] = useState<{ id: number; nome: string; ativo: boolean } | null>(null);
  const [senhaConfirm, setSenhaConfirm] = useState('');
  const [confirming, setConfirming] = useState(false);

  // nova loja no detalhe
  const [novaLoja, setNovaLoja] = useState({ codigo: '', nome: '', plano: 'black' });
  const [addLojaBusy, setAddLojaBusy] = useState(false);

  const { data: detalhe } = useQuery({
    queryKey: ['aurox-empresa', selected],
    queryFn: async () => (await api.get(`/aurox/empresas/${selected}`)).data,
    enabled: !!selected && isSuper,
  });

  if (!isSuper) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-6">
        <h1 className="text-2xl font-bold">Aurox</h1>
        <p className="text-sm text-muted-foreground">
          Área exclusiva da plataforma (tipo <code>superadmin</code>).
        </p>
      </div>
    );
  }

  async function criarEmpresa() {
    if (!form.nome || !form.admin_login || !form.admin_senha) {
      toast.error('Nome da empresa, login e senha do admin são obrigatórios');
      return;
    }
    const lojasValidas = lojas
      .map((l) => ({ codigo: l.codigo.trim(), nome: (l.nome || l.codigo).trim() }))
      .filter((l) => l.codigo);
    if (!lojasValidas.length) {
      toast.error('Informe ao menos uma loja');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/aurox/empresas', {
        nome: form.nome,
        slug: form.slug || undefined,
        lojas: lojasValidas,
        admin: {
          nome: form.admin_nome || form.admin_login,
          login: form.admin_login,
          senha: form.admin_senha,
        },
      });
      toast.success(`Empresa criada: ${data.empresa?.nome}`);
      setForm({ nome: '', slug: '', admin_nome: '', admin_login: '', admin_senha: '' });
      setLojas([{ codigo: '001', nome: '' }]);
      qc.invalidateQueries({ queryKey: ['aurox-empresas'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao criar');
    } finally {
      setSaving(false);
    }
  }

  async function confirmarToggle() {
    if (!confirm) return;
    if (!senhaConfirm) {
      toast.error('Digite sua senha');
      return;
    }
    setConfirming(true);
    try {
      await api.post('/aurox/confirm-senha', { senha: senhaConfirm });
      await api.patch(`/aurox/empresas/${confirm.id}`, { ativo: !confirm.ativo });
      toast.success(
        confirm.ativo
          ? 'Contrato desativado — usuários sem acesso (dados preservados)'
          : 'Contrato reativado',
      );
      setConfirm(null);
      setSenhaConfirm('');
      qc.invalidateQueries({ queryKey: ['aurox-empresas'] });
      if (selected === confirm.id) qc.invalidateQueries({ queryKey: ['aurox-empresa', confirm.id] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Senha incorreta ou erro');
    } finally {
      setConfirming(false);
    }
  }

  async function addLojaNaEmpresa() {
    if (!selected || !novaLoja.codigo.trim()) {
      toast.error('Código da loja obrigatório');
      return;
    }
    setAddLojaBusy(true);
    try {
      await api.post(`/aurox/empresas/${selected}`, {
        acao: 'loja',
        codigo: novaLoja.codigo.trim(),
        nome: novaLoja.nome.trim() || novaLoja.codigo.trim(),
        plano: novaLoja.plano || 'black',
      });
      toast.success('Loja adicionada');
      setNovaLoja({ codigo: '', nome: '', plano: 'black' });
      qc.invalidateQueries({ queryKey: ['aurox-empresa', selected] });
      qc.invalidateQueries({ queryKey: ['aurox-empresas'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao adicionar loja');
    } finally {
      setAddLojaBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-24">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Building2 className="h-8 w-8 text-primary" /> Aurox — Empresas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contratos B2B · planos por loja: Vanguard · Command · Black · desativar corta acesso e preserva dados
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">Nova empresa</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Nome da empresa *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Jazz Automóveis"
              />
            </div>
            <div>
              <Label>Slug (opcional)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="jazz-automoveis"
              />
            </div>
            <div>
              <Label>Nome do admin</Label>
              <Input
                value={form.admin_nome}
                onChange={(e) => setForm({ ...form, admin_nome: e.target.value })}
              />
            </div>
            <div>
              <Label>Login do admin *</Label>
              <Input
                value={form.admin_login}
                onChange={(e) => setForm({ ...form, admin_login: e.target.value })}
                placeholder="admin.jazz"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Senha do admin *</Label>
              <Input
                type="password"
                value={form.admin_senha}
                onChange={(e) => setForm({ ...form, admin_senha: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lojas (pode ter várias)</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLojas([...lojas, { codigo: '', nome: '' }])}
              >
                <Plus className="mr-1 h-3 w-3" /> Adicionar loja
              </Button>
            </div>
            {lojas.map((l, idx) => (
              <div key={idx} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[120px] flex-1">
                  <Label className="text-xs">Código *</Label>
                  <Input
                    value={l.codigo}
                    onChange={(e) => {
                      const next = [...lojas];
                      next[idx] = { ...next[idx], codigo: e.target.value };
                      setLojas(next);
                    }}
                    placeholder="381"
                  />
                </div>
                <div className="min-w-[140px] flex-[2]">
                  <Label className="text-xs">Nome da loja</Label>
                  <Input
                    value={l.nome}
                    onChange={(e) => {
                      const next = [...lojas];
                      next[idx] = { ...next[idx], nome: e.target.value };
                      setLojas(next);
                    }}
                    placeholder="Unidade Barra"
                  />
                </div>
                {lojas.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setLojas(lojas.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4 text-rose-400" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button onClick={criarEmpresa} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            {saving ? 'Criando…' : 'Criar empresa + lojas + admin'}
          </Button>
        </CardContent>
      </Card>

      {isLoading && <CarLoader compact />}
      {error && <p className="text-rose-400">Erro ao listar empresas.</p>}

      <div className="grid gap-3">
        {(empresas as any[]).map((e) => (
          <Card
            key={e.id}
            className={`cursor-pointer transition hover:border-primary/50 ${selected === e.id ? 'border-primary' : ''}`}
            onClick={() => setSelected(selected === e.id ? null : e.id)}
          >
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-semibold">{e.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {e.slug} · {e.qtd_lojas ?? 0} loja(s) · {e.qtd_usuarios ?? 0} usuário(s)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={e.ativo ? 'default' : 'destructive'}>
                  {e.ativo ? 'ativo' : 'cancelado'}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  title={e.ativo ? 'Desativar contrato' : 'Reativar'}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setConfirm({ id: e.id, nome: e.nome, ativo: !!e.ativo });
                    setSenhaConfirm('');
                  }}
                >
                  {e.ativo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selected && detalhe && (
        <Card className="relative border-primary/40">
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-2 top-2"
            onClick={() => setSelected(null)}
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
          <CardContent className="space-y-4 p-5 pt-10">
            <h3 className="font-semibold">{detalhe.nome} — detalhe</h3>

            <div>
              <div className="mb-2 text-xs text-muted-foreground">Lojas e planos</div>
              <ul className="mb-3 space-y-2 text-sm">
                {(detalhe.lojas || []).map((l: any) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5"
                  >
                    <div>
                      <code className="rounded bg-muted px-1">{l.codigo}</code>{' '}
                      {l.nome || ''}
                      {!l.ativo && <span className="text-rose-400"> (inativa)</span>}
                    </div>
                    <select
                      className="rounded border border-border bg-background px-2 py-1 text-xs"
                      value={String(l.plano || 'black').toLowerCase()}
                      onChange={async (e) => {
                        try {
                          await api.post(`/aurox/empresas/${selected}`, {
                            acao: 'plano_loja',
                            loja_id: l.id,
                            plano: e.target.value,
                          });
                          toast.success(`Plano da loja ${l.codigo}: ${e.target.value}`);
                          qc.invalidateQueries({ queryKey: ['aurox-empresa', selected] });
                        } catch (err: any) {
                          toast.error(err?.response?.data?.error || 'Erro ao mudar plano');
                        }
                      }}
                    >
                      <option value="vanguard">Vanguard</option>
                      <option value="command">Command</option>
                      <option value="black">Black</option>
                    </select>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
                <div className="min-w-[100px] flex-1">
                  <Label className="text-xs">Nova loja — código</Label>
                  <Input
                    value={novaLoja.codigo}
                    onChange={(e) => setNovaLoja({ ...novaLoja, codigo: e.target.value })}
                    placeholder="NITER"
                  />
                </div>
                <div className="min-w-[120px] flex-[2]">
                  <Label className="text-xs">Nome</Label>
                  <Input
                    value={novaLoja.nome}
                    onChange={(e) => setNovaLoja({ ...novaLoja, nome: e.target.value })}
                    placeholder="Unidade Niterói"
                  />
                </div>
                <div>
                  <Label className="text-xs">Plano</Label>
                  <select
                    className="block rounded border border-border bg-background px-2 py-2 text-sm"
                    value={novaLoja.plano}
                    onChange={(e) => setNovaLoja({ ...novaLoja, plano: e.target.value })}
                  >
                    <option value="vanguard">Vanguard</option>
                    <option value="command">Command</option>
                    <option value="black">Black</option>
                  </select>
                </div>
                <Button size="sm" onClick={addLojaNaEmpresa} disabled={addLojaBusy}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">Usuários</div>
              <ul className="max-h-48 overflow-y-auto text-sm">
                {(detalhe.usuarios || []).map((x: any) => (
                  <li key={x.id}>
                    {x.nome} · <code>{x.login}</code> · {x.tipo} · {x.status || (x.ativo ? 'ativo' : 'off')}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal confirmação senha */}
      {confirm && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">
              {confirm.ativo ? 'Desativar contrato?' : 'Reativar contrato?'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Empresa: <strong>{confirm.nome}</strong>
              {confirm.ativo
                ? '. Todos os usuários perderão o acesso. Os dados permanecem salvos.'
                : '. Os usuários voltarão a poder entrar.'}
            </p>
            <div className="mt-4">
              <Label>Confirme com sua senha</Label>
              <Input
                type="password"
                value={senhaConfirm}
                onChange={(e) => setSenhaConfirm(e.target.value)}
                placeholder="Sua senha de superadmin"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && confirmarToggle()}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm(null)}>
                Cancelar
              </Button>
              <Button
                variant={confirm.ativo ? 'destructive' : 'default'}
                disabled={confirming}
                onClick={confirmarToggle}
              >
                {confirming ? '…' : confirm.ativo ? 'Desativar' : 'Reativar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
