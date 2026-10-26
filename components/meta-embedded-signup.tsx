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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawAppId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '';
  const appId = String(rawAppId)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^["']|["']$/g, '');
  const configId = String(
    process.env.NEXT_PUBLIC_META_CONFIG_ID || process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID || '',
  ).trim();

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
        /* ignore */
      }
    };
    window.addEventListener('message', onMessage);

    if (window.FB) {
      try {
        window.FB.init({ appId, cookie: true, xfbml: false, version: 'v21.0' });
      } catch {
        /* already inited */
      }
      setSdkReady(true);
    } else {
      window.fbAsyncInit = function () {
        window.FB.init({
          appId,
          cookie: true,
          xfbml: false,
          version: 'v21.0',
        });
        setSdkReady(true);
      };
      if (!document.getElementById('facebook-jssdk')) {
        const s = document.createElement('script');
        s.id = 'facebook-jssdk';
        s.async = true;
        s.src = 'https://connect.facebook.net/pt_BR/sdk.js';
        s.onerror = () => toast.error('Falha ao carregar SDK Facebook');
        document.body.appendChild(s);
      }
    }

    return () => {
      window.removeEventListener('message', onMessage);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [appId]);

  const stopLoading = useCallback(() => {
    setLoading(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const launch = useCallback(() => {
    if (!empresaId) {
      toast.error('Selecione a empresa antes');
      return;
    }
    if (!appId || !/^\d{6,20}$/.test(appId)) {
      toast.error('Falta NEXT_PUBLIC_META_APP_ID no Vercel + Redeploy');
      return;
    }
    if (!configId) {
      toast.error(
        'Falta NEXT_PUBLIC_META_CONFIG_ID (Embedded Signup no painel Meta → WhatsApp → Configuration ID)',
      );
      return;
    }
    if (!window.FB || typeof window.FB.login !== 'function') {
      toast.error('SDK Facebook ainda não pronto — aguarde 2s e tente de novo');
      return;
    }

    setLoading(true);
    timeoutRef.current = setTimeout(() => {
      stopLoading();
      toast.message('Meta demorou. Permita popups neste site e tente outra vez.');
    }, 90000);

    // IMPORTANTE: callback NÃO pode ser async — SDK Meta exige function síncrona
    window.FB.login(
      function (response: any) {
        void (async () => {
          try {
            if (!response || response.status === 'unknown') {
              stopLoading();
              toast.message('Login cancelado ou popup bloqueado');
              return;
            }
            if (!response.authResponse) {
              stopLoading();
              toast.message('Sem permissão WhatsApp Business');
              return;
            }
            const code = response.authResponse.code || response.authResponse.accessToken;
            if (!code) {
              stopLoading();
              toast.error('Meta não devolveu code — confira Embedded Signup');
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
            stopLoading();
          }
        })();
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
  }, [appId, configId, empresaId, onConnected, stopLoading]);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={launch}
      className="flex w-full items-center gap-4 rounded-2xl border border-emerald-500/40 bg-card p-5 text-left hover:border-emerald-500 transition disabled:opacity-60"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white">
        <MessageCircle className="h-7 w-7" />
      </div>
      <div className="flex-1">
        <div className="font-semibold text-lg">Conectar WhatsApp da loja</div>
        <p className="text-sm text-muted-foreground">
          Embedded Signup Meta · conta Business da concessionária · leads nesta empresa
        </p>
        {!appId || !configId ? (
          <p className="mt-1 text-xs text-amber-500">
            Falta NEXT_PUBLIC_META_APP_ID ou NEXT_PUBLIC_META_CONFIG_ID no Vercel
          </p>
        ) : !sdkReady ? (
          <p className="mt-1 text-xs text-muted-foreground">Carregando SDK…</p>
        ) : loading ? (
          <p className="mt-1 text-xs text-emerald-400">Aguardando Meta…</p>
        ) : null}
      </div>
    </button>
  );
}
