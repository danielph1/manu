'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { ProtectedRoute } from '@/components/protected-route';
import { SidebarNav } from '@/components/sidebar-nav';
import { AvisosFlutuante } from '@/components/avisos-flutuante';
import { BottomNav } from '@/components/bottom-nav';
import { useRealtimeCore } from '@/hooks/use-realtime';
import type { ReactNode } from 'react';

function RealtimeBootstrap() {
  useRealtimeCore();
  return null;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname() || '';
  const [noChat, setNoChat] = useState(false);
  useEffect(() => {
    setNoChat(path.startsWith('/chat') && new URLSearchParams(window.location.search).get('lead') !== null);
  }, [path]);
  const router = useRouter();
  const voltar = noChat || ['/minha-conta', '/favoritos', '/temas', '/sobre', '/privacidade'].some((p) => path.startsWith(p));

  // swipe da borda esquerda → abre sidebar (mobile)
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      // só pega gesto iniciado na borda (~24px)
      if (t.clientX <= 24) {
        startX.current = t.clientX;
        startY.current = t.clientY;
      } else {
        startX.current = null;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (startX.current == null || startY.current == null) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX.current;
      const dy = Math.abs(t.clientY - startY.current);
      if (dx > 56 && dy < 40) {
        setOpen(true);
        startX.current = null;
      }
    };
    const onEnd = () => {
      startX.current = null;
      startY.current = null;
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, []);

  return (
    <ProtectedRoute>
      <RealtimeBootstrap />
      <div className="flex min-h-screen w-full bg-background">
        <button
          className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card"
          onClick={() => (voltar ? router.push(noChat ? '/chat' : '/configuracoes') : setOpen((o) => !o))}
          aria-label={voltar ? 'Voltar' : 'Menu'}
        >
          {voltar ? <ArrowLeft className="h-5 w-5" /> : open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        {open && <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setOpen(false)} />}
        <div className={`fixed inset-y-0 left-0 z-40 w-72 transition-transform ${open ? 'translate-x-0' : '-translate-x-full'}`}>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
        <main className="min-h-screen w-full flex-1 px-3 pb-28 pt-16 sm:px-6">{children}</main>
        <AvisosFlutuante />
        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}
