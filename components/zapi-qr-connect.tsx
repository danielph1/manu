"use client";

import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { QrCode } from 'lucide-react';

export function ZapiQrConnect({
  empresaId,
  onConnected,
}: {
  empresaId: number | string;
  onConnected?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [instance, setInstance] = useState('');
  const [token, setToken] = useState('');
  const [clientToken, setClientToken] = useState('');

  async function pedirQr() {
    if (!empresaId) {
      toast.error('Selecione a empresa');
      return;
    }
    setLoading(true);
    setQr(null);
    try {
      const r = await api.post('/integracoes/oauth/whatsapp/zapi-qr', {
        empresa_id: Number(empresaId),
        instance_id: instance || undefined,
        token: token || undefined,
        client_token: clientToken || undefined,
      });
      if (r.data.connected) {
        toast.success(r.data.message || 'WhatsApp conectado');
        onConnected?.();
        setOpen(false);
        return;
      }
      if (r.data.qrcode_base64) {
        setQr(r.data.qrcode_base64);
        toast.message('Escaneie o QR com o WhatsApp Business da loja');
      } else {
        toast.error(r.data.message || 'Sem QR');
      }
    } catch (e: any) {
      const d = e?.response?.data;
      toast.error(d?.message || d?.error || 'Falha Z-API (trial/token?)');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-card p-5 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 text-left"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-700 text-white">
          <QrCode className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-lg">WhatsApp via QR (Z-API)</div>
          <p className="text-sm text-muted-foreground">
            Escaneia QR da instância. Precisa de plano ativo na Z-API (trial expirado não gera QR).
          </p>
        </div>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Deixe em branco para usar ZAPI_* do Vercel. Ou cole Instance ID + Token da conta paga.
          </p>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            placeholder="Instance ID"
            value={instance}
            onChange={(e) => setInstance(e.target.value)}
          />
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            placeholder="Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            placeholder="Client-Token (se a conta exigir)"
            value={clientToken}
            onChange={(e) => setClientToken(e.target.value)}
          />
          <button
            type="button"
            disabled={loading}
            onClick={pedirQr}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? 'Pedindo QR…' : 'Gerar / atualizar QR'}
          </button>
          {qr && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR WhatsApp" className="h-56 w-56 rounded-lg bg-white p-2" />
              <p className="text-xs text-muted-foreground text-center">
                WhatsApp → Aparelhos conectados → Conectar um aparelho
              </p>
              <button type="button" className="text-xs text-cyan-400 underline" onClick={pedirQr}>
                Já escaneei — verificar status
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
