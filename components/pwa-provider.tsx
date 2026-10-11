'use client';
// Registra service worker + pede permissao de notificacao
import { useEffect } from 'react';

export function PWAProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    // Pede permissao de notificacao suavemente
    if ('Notification' in window && Notification.permission === 'default') {
      // deferido para nao atrapalhar primeiro paint
      setTimeout(() => Notification.requestPermission().catch(() => {}), 3000);
    }
  }, []);
  return null;
}
