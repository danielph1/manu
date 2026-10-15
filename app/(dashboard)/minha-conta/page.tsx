'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

function comprimir(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = 512;
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function MinhaContaPage() {
  const [dados, setDados] = useState<any>({});
  const [login, setLogin] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [editLogin, setEditLogin] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.get('/conta').then((r) => {
      setDados(r.data || {});
      setLogin(r.data?.login || '');
      setNome(r.data?.nome || '');
      setTelefone(r.data?.telefone || '');
      setEmail(r.data?.email || '');
    }).catch(() => {});
  }, []);

  async function salvar() {
    setSalvando(true);
    try {
      await api.patch('/conta', { telefone, email, nome });
      toast.success('Salvo');
      setEditLogin(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
    } finally { setSalvando(false); }
  }

  async function foto(f?: File) {
    if (!f) return;
    const blob = await comprimir(f);
    const fd = new FormData();
    fd.append('foto', new File([blob], 'perfil.jpg', { type: 'image/jpeg' }));
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
        <label className="cursor-pointer">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {dados.foto_url ? <img src={dados.foto_url} alt="" className="h-full w-full object-cover" /> : String(dados.login || '?').charAt(0).toUpperCase()}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => foto(e.target.files?.[0])} />
        </label>
        <span className="text-sm text-muted-foreground">Toque na foto para trocar</span>
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <Label>Login</Label>
          <div className="flex gap-+2">
            <Input value={login} onChange={(e) => setLogin(e.target.value)} disabled={!editLogin} />
            <Button type="button" variant="outline" onClick={() => setEditLogin((v) => !v)}>{editLogin ? 'Cancelar' : 'Alterar'}</Button>
          </div>
        </div>
        <div><Label>Perfil</Label><Input value={dados.tipo || ''} disabled className="capitalize" /></div>
        <div><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(21) 99999-9999" /></div>
        <div><Label>E-mail</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editLogin} /></div>
        <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
      </div>
    </div>
  );
}
