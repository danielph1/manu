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
import { Building2, Plus, Power, PowerOff } from 'lucide-react';

export default function AuroxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSuper = String(user?.tipo || '').toLowerCase() === 'superadmin';

  const { data: empresas = [], isLoading, error } = useQuery({
    queryKey: ['aurox-empresas'],
    queryFn: async () => (await api.get('/aurox/empresas')).data,
    enabled: isSuper,
  });

  const [form, setForm] = useState({
    nome: '',
    slug: '',
    loja1: '001',
    loja2: '',
    admin_nome: '',
    admin_login: '',
    admin_senha: '',
  });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

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
        <p className="text-xs text-muted-foreground">
          No SQL: <code>UPDATE public.usuarios SET tipo = &apos;superadmin&apos; WHERE LOWER(login) = &apos;daniel&apos;;</code>
          Depois saia e entre de novo.
        </p>
      </div>
    );
  }

  async function criarEmpresa() {
    if (!form.nome || !form.admin_login || !form.admin_senha) {
      toast.error('Nome da empresa, login e senha do admin são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const lojas = [{ codigo: form.loja1 || '001', nome: form.loja1 || '001' }];
      if (form.loja2.trim()) lojas.push({ codigo: form.loja2.trim(), nome: form.loja2.trim() });
      const { data } = await api.post('/aurox/empresas', {
        nome: form.nome,
        slug: form.slug || undefined,
        lojas,
        admin: {
          nome: form.admin_nome || form.admin_login,
          login: form.admin_login,
          senha: form.admin_senha,
        },
      });
      toast.success(`Empresa criada: ${data.empresa?.nome}`);
      setForm({
        nome: '',
        slug: '',
        loja1: '001',
        loja2: '',
        admin_nome: '',
        admin_login: '',
        admin_senha: '',
      });
      qc.invalidateQueries({ queryKey: ['aurox-empresas'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao criar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(id: number, ativo: boolean) {
    try {
      await api.patch(`/aurox/empresas/${id}`, { ativo: !ativo });
      toast.success(!ativo ? 'Contrato ativado' : 'Contrato desativado — usuários sem acesso');
      qc.invalidateQueries({ queryKey: ['aurox-empresas'] });
      if (selected === id) qc.invalidateQueries({ queryKey: ['aurox-empresa', id] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Building2 className="h-8 w-8 text-primary" /> Aurox — Empresas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contratos B2B · cada empresa isolada · desativar corta o acesso e preserva os dados
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
                placeholder="Ex: Auto Center Sul"
              />
            </div>
            <div>
              <Label>Slug (opcional)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="auto-center-sul"
              />
            </div>
            <div>
              <Label>Código loja 1 *</Label>
              <Input value={form.loja1} onChange={(e) => setForm({ ...form, loja1: e.target.value })} />
            </div>
            <div>
              <Label>Código loja 2 (opcional)</Label>
              <Input value={form.loja2} onChange={(e) => setForm({ ...form, loja2: e.target.value })} />
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
                placeholder="admin.empresa"
              />
            </div>
            <div>
              <Label>Senha do admin *</Label>
              <Input
                type="password"
                value={form.admin_senha}
                onChange={(e) => setForm({ ...form, admin_senha: e.target.value })}
              />
            </div>
          </div>
          <Button onClick={criarEmpresa} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            {saving ? 'Criando…' : 'Criar empresa + lojas + admin'}
          </Button>
        </CardContent>
      </Card>

      {isLoading && <CarLoader compact />}
      {error && <p className="text-rose-400">Erro ao listar empresas (confira se é superadmin).</p>}

      <div className="grid gap-3">
        {(empresas as any[]).map((e) => (
          <Card
            key={e.id}
            className={`cursor-pointer transition hover:border-primary/50 ${selected === e.id ? 'border-primary' : ''}`}
            onClick={() => setSelected(e.id)}
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
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleAtivo(e.id, !!e.ativo);
                  }}
                >
                  {e.ativo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {detalhe && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h3 className="font-semibold">{detalhe.nome} — detalhe</h3>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Lojas</div>
              <ul className="text-sm">
                {(detalhe.lojas || []).map((l: any) => (
                  <li key={l.id}>
                    <code>{l.codigo}</code> {l.nome || ''} {l.ativo ? '' : '(inativa)'}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Usuários</div>
              <ul className="text-sm">
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
    </div>
  );
}
