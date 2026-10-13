'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function MinhaContaPage() {
  const [dados, setDados] = useState<any>({});
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.get('/conta').then((r) => {
      setDados(r.data || {});
      setTelefone(r.data?.telefone || '');
      setEmail(r.data?.email || '');
    }).catch(() => {});
  }, []);

  async function salvar() {
    setSalvando(true);
    try {
      await api.patch('/conta', { telefone, email });
      toast.success('Salvo');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
    } finally { setSalvando(false); }
  }

  async function foto(f?: File) {
    if (!f) return;
    const fd = new FormData();
    fd.append('foto', f);
    try {
      const { data } = await api.post('/conta', fd);
      setDados((d: any) => ({ ...d, foto_url: data.foto_url }));
      toast.success('Foto atualizada');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro na foto');
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-bold">Minha conta</h1>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-bold text-primary-foreground">
          {dados.foto_url ? <img src={dados.foto_url} alt="" className="h-full w-full object-cover" /> : String(dados.login || '?').charAt(0).toUpperCase()}
        </div>
        <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm">
          Alterar foto
          <input type="file" accept="image/*" className="hidden" onChange={(e) => foto(e.target.files?.[0])} />
        </label>
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div><Label>Login</Label><Input value={dados.login || ''} disabled /></div>
        <div><Label>Perfil</Label><Input value={dados.tipo || ''} disabled className="capitalize" /></div>
        <div><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(21) 99999-9999" /></div>
        <div><Label>E-mail</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" /></div>
        <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
      </div>
    </div>
  );
}
