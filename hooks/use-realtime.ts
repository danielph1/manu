'use client';
/**
 * Tempo real via Supabase Realtime.
 * Chat + leads + notificações: sempre.
 * Tarefas/metas: só quando chega notificação do tipo (não pesa).
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Inscreve nas tabelas críticas e invalida queries do React Query */
export function useRealtimeCore() {
  const qc = useQueryClient();

  useEffect(() => {
    const sb = getClient();
    if (!sb) return;

    const channels: RealtimeChannel[] = [];

    const sub = (name: string, table: string, keys: string[], onEvent?: (payload: any) => void) => {
      const ch = sb
        .channel(name)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => {
            for (const k of keys) qc.invalidateQueries({ queryKey: [k] });
            onEvent?.(payload);
          },
        )
        .subscribe();
      channels.push(ch);
    };

    // prioritário
    sub('rt-chat', 'chat_geral_mensagens', ['chat', 'conversas']);
    sub('rt-leads', 'leads', ['leads', 'stats', 'conversas']);
    sub('rt-triagem', 'triagem', ['triagem', 'leads']);
    sub('rt-notif', 'notificacoes', ['avisos', 'notificacoes'], (payload) => {
      // app aberto mas em segundo plano / tela apagada: mostra notificação local
      try {
        if (typeof document !== 'undefined' && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          const row = (payload as any)?.new || {};
          const title = row.titulo || 'Manu Automóveis';
          const body = row.mensagem || '';
          new Notification(title, { body, icon: '/icon-192.png' });
        }
      } catch { /* ok */ }
    });

    // leve: só invalida listas se alguém mexer (pouco frequente)
    sub('rt-tarefas', 'tarefas', ['tarefas']);
    sub('rt-metas', 'metas', ['metas']);

    return () => {
      for (const ch of channels) {
        try {
          sb.removeChannel(ch);
        } catch { /* ok */ }
      }
    };
  }, [qc]);
}

/** Polling de backup só no chat (caso Realtime falhe) */
export const CHAT_POLL_MS = 4_000;
export const LEADS_POLL_MS = 5_000;
/** Tarefas/metas: quase não polam — confiam no Realtime + foco da janela */
export const SLOW_POLL_MS = 120_000;
