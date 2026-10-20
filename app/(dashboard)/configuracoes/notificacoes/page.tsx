'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';

const LABELS: Record<string, string> = {
  leads: 'Leads',
  estoque: 'Estoque',
  oficina: 'Oficina',
  conquistas: 'Conquistas (desbloqueio de temas)',
  tarefas: 'Tarefas',
  fichas: 'Fichas de crédito',
  faturamento: 'Faturamento',
  vendas: 'Vendas (carros liberados)',
  chat: 'Chat',
};

export default function NotificacoesPrefsPage() {
  const [notif, setNotif] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/preferencias')
      .then((r) => setNotif(r.data?.notif || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle(key: string) {
    const next = { ...notif, [key]: !notif[key] };
    setNotif(next);
    setSaving(true);
    try {
      await api.patch('/preferencias', { notif: next });
      toast.success('Preferência salva');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
      setNotif(notif);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bell className="h-6 w-6" /> Notificações
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ative ou desative o que quer receber. Padrão: tudo ligado.
        </p>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {Object.keys(LABELS).map((key) => (
          <label
            key={key}
            className="flex cursor-pointer items-center justify-between border-b border-border px-4 py-3 last:border-0"
          >
            <span className="text-sm">{LABELS[key]}</span>
            <button
              type="button"
              disabled={saving}
              onClick={() => toggle(key)}
              className={`relative h-6 w-11 rounded-full transition ${
                notif[key] !== false ? 'bg-primary' : 'bg-muted'
              }`}
              aria-pressed={notif[key] !== false}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition ${
                  notif[key] !== false ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </label>
        ))}
      </div>
    </div>
  );
}
