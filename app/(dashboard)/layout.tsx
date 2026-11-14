'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Menu, X } from 'lucide-react';
import './workspace.css';
import { ProtectedRoute } from '@/components/protected-route';
import { SidebarNav } from '@/components/sidebar-nav';
import { AvisosFlutuante } from '@/components/avisos-flutuante';
import { BottomNav } from '@/components/bottom-nav';
import { useAuth } from '@/contexts/auth-context';
import { permiteRota } from '@/lib/permissoes-acesso';
import { useRealtimeCore } from '@/hooks/use-realtime';
import type { ReactNode } from 'react';

function RealtimeBootstrap() {
  useRealtimeCore();
  return null;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname() || '';
  const {user}=useAuth();
  const acessoPagina=permiteRota(user?.tipo,path);
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
      <div className="aurox-app-shell flex min-h-screen w-full bg-background">
        <button
          className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-sm lg:hidden"
          onClick={() => (voltar ? router.push(noChat ? '/chat' : '/configuracoes') : setOpen((o) => !o))}
          aria-label={voltar ? 'Voltar' : 'Menu'}
        >
          {voltar ? <ArrowLeft className="h-5 w-5" /> : open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
        <div className={`fixed inset-y-0 left-0 z-40 w-72 transition-transform ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
        <main className="aurox-shell-main min-h-screen min-w-0 w-full flex-1 px-3 pb-28 pt-16 sm:px-6 lg:ml-72 lg:px-7 lg:pt-6 xl:px-10">
          {!noChat && <div className="aurox-workspace-head hidden items-center justify-between gap-3 lg:flex">
            <div>
              <p className="aurox-breadcrumb">AUROX <span aria-hidden="true">/</span> Central de operações</p>
              <strong className="block mt-1">{({ '/painel': 'Painel de Leads', '/triagem': 'Triagem', '/follow-up': 'Follow Up', '/fichas': 'Fichas de Crédito', '/estoque': 'Estoque', '/oficina': 'Oficina', '/chat': 'Conversas', '/configuracoes': 'Configurações' } as Record<string,string>)[path] || 'Área de trabalho'}</strong>
            </div>
            <span className="text-xs text-muted-foreground">Gestão de atendimento e vendas</span>
          </div>}
          {acessoPagina ? children : <section className="mx-auto mt-8 max-w-lg rounded-xl border p-6" role="alert">
            <h1 className="text-xl font-semibold">Acesso restrito</h1>
            <p className="mt-2 text-sm text-muted-foreground">Seu cargo não permite acessar esta área.</p>
          </section>}
        </main>
        <AvisosFlutuante />
        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}
