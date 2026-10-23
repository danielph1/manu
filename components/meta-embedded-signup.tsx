'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

type SessionInfo = {
  phone_number_id?: string;
  waba_id?: string;
  business_id?: string;
};

/**
 * Meta WhatsApp Embedded Signup — 1 clique.
 * Env públicas: NEXT_PUBLIC_META_APP_ID, NEXT_PUBLIC_META_CONFIG_ID (Embedded Signup config)
 * Env servidor: META_APP_SECRET
 */
export function MetaEmbeddedSignup({
  empresaId,
  onConnected,
}: {
  empresaId: number | string;
  onConnected?: () => void;
}) {
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionRef = useRef<SessionInfo>({});
  const rawAppId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '';
  const appId = String(rawAppId).replace(/[\u200B-\u200D\uFEFF]/g, '').trim().replace(/^["']|["']$/g, '');
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID || process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID || '';

  useEffect(() => {
    if (!appId || !/^\d{6,20}$/.test(appId)) return;

    const onMessage = (event: MessageEvent) => {
      if (typeof event.origin !== 'string' || !event.origin.includes('facebook.com')) return;
      try {
        const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (raw?.type === 'WA_EMBEDDED_SIGNUP') {
          const d = raw.data || raw;
          sessionRef.current = {
            phone_number_id: d.phone_number_id || d.phoneNumberId,
            waba_id: d.waba_id || d.wabaId,
            business_id: d.business_id || d.businessId,
          };
        }
      } catch {
        /* ignore non-json */
      }
    };
    window.addEventListener('message', onMessage);

    if (window.FB) {
      setSdkReady(true);
    } else {
      window.fbAsyncInit = function () {
        window.FB.init({
          appId,
          cookie: true,
          xfbml: true,
          version: 'v21.0',
        });
        setSdkReady(true);
      };
      if (!document.getElementById('facebook-jssdk')) {
        const s = document.createElement('script');
        s.id = 'facebook-jssdk';
        s.async = true;
        s.src = 'https://connect.facebook.net/pt_BR/sdk.js';
        document.body.appendChild(s);
      }
    }

    return () => window.removeEventListener('message', onMessage);
  }, [appId]);

  const launch = useCallback(() => {
    if (!appId || !/^\d{6,20}$/.test(appId)) {
      toast.error(
        'NEXT_PUBLIC_META_APP_ID inválido. Use só o ID numérico de Configurações → Básico do app Meta (sem aspas). Depois Redeploy.',
      );
      return;
    }
    if (!configId) {
      toast.error('Falta NEXT_PUBLIC_META_CONFIG_ID (Configuration ID do Embedded Signup).');
      return;
    }
    if (!window.FB) {
      toast.error('SDK Facebook ainda carregando — aguarde 2s e tente de novo.');
      return;
    }
    if (!empresaId) {
      toast.error('Selecione a empresa');
      return;
    }

    setLoading(true);
    sessionRef.current = {};

    window.FB.login(
      async (response: any) => {
        try {
          if (!response?.authResponse) {
            toast.message('Login cancelado ou sem permissão');
            return;
          }
          const code = response.authResponse.code || response.authResponse.accessToken;
          if (!code) {
            toast.error('Meta não devolveu code — confira response_type=code no app');
            return;
          }

          const r = await api.post('/integracoes/oauth/whatsapp/embedded', {
            empresa_id: Number(empresaId),
            code,
            phone_number_id: sessionRef.current.phone_number_id,
            waba_id: sessionRef.current.waba_id,
            business_id: sessionRef.current.business_id,
          });

          toast.success(r.data.message || 'WhatsApp da loja conectado');
          onConnected?.();
        } catch (e: any) {
          const d = e?.response?.data;
          toast.error(d?.message || d?.error || 'Falha no Embedded Signup');
        } finally {
          setLoading(false);
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '3',
        },
      },
    );
  }, [appId, configId, empresaId, onConnected]);

  const disabled = loading || !sdkReady;

  return (
    <button
      type="button"
      disabled={disabled && !!appId}
      onClick={launch}
      className="flex w-full items-center gap-4 rounded-2xl border border-emerald-500/40 bg-card p-5 text-left hover:border-emerald-500 transition disabled:opacity-60"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white">
        <MessageCircle className="h-7 w-7" />
      </div>
      <div className="flex-1">
        <div className="font-semibold text-lg">Conectar WhatsApp da loja</div>
        <p className="text-sm text-muted-foreground">
          Cadastro oficial Meta (Embedded Signup) · 1 clique · a concessionária autoriza sozinha · sem QR e sem colar token
        </p>
        {!appId || !configId ? (
          <p className="mt-1 text-xs text-amber-500">
            Servidor: falta NEXT_PUBLIC_META_APP_ID ou NEXT_PUBLIC_META_CONFIG_ID
          </p>
        ) : !sdkReady ? (
          <p className="mt-1 text-xs text-muted-foreground">Carregando SDK Facebook…</p>
        ) : null}
      </div>
      {loading && <span className="text-xs">…</span>}
    </button>
  );
}
