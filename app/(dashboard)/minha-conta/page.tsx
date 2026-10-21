'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { compressAvatar } from '@/lib/compress-image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/i18n-context';
import { Lang, LANG_LABELS } from '@/lib/i18n';

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
  const { t, setLang } = useI18n();
  const [dados, setDados] = useState<any>({});
  const [login, setLogin] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [editLogin, setEditLogin] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [idioma, setIdioma] = useState('pt');

  useEffect(() => {
    api.get('/conta').then((r) => {
      setDados(r.data || {});
      setLogin(r.data?.login || '');
      setNome(r.data?.nome || '');
      setTelefone(r.data?.telefone || '');
      setEmail(r.data?.email || '');
      setIdioma(r.data?.idioma || 'pt');
    }).catch(() => {});
  }, []);

  async function salvar() {
    setSalvando(true);
    try {
      await api.patch('/conta', { telefone, email, nome, idioma });
      try {
        await api.patch('/preferencias', { idioma });
      await setLang(idioma as Lang);
      } catch { /* ok */ }
      toast.success('Salvo');
      setEditLogin(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
    } finally { setSalvando(false); }
  }

  function quadrado(file: File): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const lado = Math.min(img.width, img.height);
        const x = (img.width - lado) / 2;
        const y = (img.height - lado) / 2;
        const c = document.createElement('canvas');
        c.width = 256; c.height = 256;
        c.getContext('2d')!.drawImage(img, x, y, lado, lado, 0, 0, 256, 256);
        c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.85);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function foto(f?: File) {
    if (!f) return;
    const compressed = await compressAvatar(f);
    const fd = new FormData();
    fd.append('foto', compressed);
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
      <h1 className="text-2xl font-bold">{t('account.title')}</h1>
      <div className="flex items-center gap-4">
        <label className="cursor-pointer">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {dados.foto_url ? <img src={dados.foto_url} alt="" className="h-full w-full object-cover" /> : String(dados.login || '?').charAt(0).toUpperCase()}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => foto(e.target.files?.[0])} />
        </label>
        <span className="text-sm text-muted-foreground">{t('account.photo_hint')}</span>
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <Label>{t('account.name')}</Label>
          <div className="flex gap-2">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!editLogin} />
            <Button type="button" variant="outline" onClick={() => setEditLogin((v) => !v)}>{editLogin ? t('common.cancel') : t('common.edit')}</Button>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Login: {login}</div>
        </div>
        <div><Label>{t('account.profile')}</Label><Input value={dados.tipo || ''} disabled className="capitalize" /></div>
        <div><Label>{t('account.phone')}</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={!editLogin} /></div>
        <div><Label>{t('account.email')}</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editLogin} /></div>
        <div>
          <Label>{t('account.language')}</Label>
          <select
            className="mt-1 flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={idioma}
            onChange={(e) => setIdioma(e.target.value)}
          >
            <option value="pt">Português</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="de">Deutsch (Alemão)</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('account.language_hint')}
          </p>
        </div>
        <Button onClick={salvar} disabled={salvando}>{salvando ? t('common.saving') : t('common.save')}</Button>
      </div>
    </div>
  );
}
