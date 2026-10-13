'use client';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProtectedRoute } from '@/components/protected-route';
import { SidebarNav } from '@/components/sidebar-nav';
import { Menu, X } from 'lucide-react';
import { AvisosFlutuante } from '@/components/avisos-flutuante';
import { BottomNav } from '@/components/bottom-nav';
import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname() || '';
  const router = useRouter();
  const voltar = ['/minha-conta','/favoritos','/temas','/sobre','/privacidade'].some((p) => path.startsWith(p));
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen w-full bg-background">
        <button
          className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card"
          onClick={() => voltar ? router.push('/configuracoes') : setOpen((o) => !o)}
          aria-label={voltar ? 'Voltar' : 'Menu'}
        >
          {voltar ? <ArrowLeft className="h-5 w-5" /> : open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        {open && <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setOpen(false)} />}
        <div className={`fixed inset-y-0 left-0 z-40 w-72 transition-transform ${open ? 'translate-x-0' : '-translate-x-full'}`}>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
        <main className="flex-1 overflow-x-hidden px-4 py-16 pb-24 md:px-8">{children}</main>
        <BottomNav />
        <AvisosFlutuante />
      </div>
    </ProtectedRoute>
  );
}
