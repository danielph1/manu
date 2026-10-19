'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Car, LayoutDashboard, MessageSquare, Target, FileText,
  CheckSquare, ArrowRightLeft, PlusCircle, LogOut, UserCircle2,
  FileSearch, BarChart3, Users, Wrench, Receipt, Settings, Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Role } from '@/lib/roles';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const items: Array<{ href: string; label: string; icon: any; show: boolean }> = [
    { href: '/triagem', label: 'Triagem', icon: Inbox, show: Role.isAdmin(user) },
    { href: '/painel', label: 'Painel de Leads', icon: LayoutDashboard, show: Role.verLeads(user) },
    { href: '/documental', label: 'Documental', icon: FileSearch, show: Role.verDocumental(user) },
    { href: '/metricas', label: 'Metricas', icon: BarChart3, show: Role.verMetricas(user) },
    { href: '/equipe', label: 'Equipe', icon: Users, show: Role.isGerente(user) },
    { href: '/ranking', label: 'Ranking', icon: Target, show: !!user },
    { href: '/metas', label: 'Metas', icon: Target, show: Role.verLeads(user) },
    { href: '/processos', label: 'Transferencias', icon: ArrowRightLeft, show: Role.verDocumental(user) },
    { href: '/oficina', label: 'Oficina', icon: Wrench, show: !!user },
    { href: '/faturamento', label: 'Faturamento', icon: Receipt, show: !!user },
    { href: '/configuracoes', label: 'Configurações', icon: Settings, show: !!user },
  ];

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-border bg-card px-4 py-6 sticky top-0 overflow-y-auto">
      <div className="mt-10 flex items-center gap-3 px-2">
        <a href="/minha-conta" className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {(user as any)?.foto_url ? <img src={(user as any).foto_url} alt="" className="h-full w-full object-cover" /> : String(user?.nome || user?.login || '?').charAt(0).toUpperCase()}
            <span className="rank-dot absolute -right-0.5 -top-0.5 z-10 h-3.5 w-3.5 rounded-full border-2 border-card" style={{ background: (user as any)?.rank_cor || '#cd7f32' }} />
        </a>
        <div>
          <div className="text-xs text-muted-foreground">Logado como</div>
          <a href="/minha-conta" className="text-lg font-semibold capitalize leading-tight">{user?.nome || user?.login || '-'}</a>
        </div>
      </div>
      <div className="mt-2 px-2">
        <div className="mt-1 text-xs text-muted-foreground">
          Perfil: <span className="uppercase">{user?.tipo ?? '-'}</span>
          {user?.loja && <span className="ml-2 rounded bg-muted px-1.5 py-0.5">Loja {user.loja}</span>}
        </div>
      </div>
      <Button variant="outline" className="mt-4" onClick={logout}>
        <LogOut className="mr-2 h-4 w-4" /> Sair
      </Button>

      <Separator className="my-5" />
      <div className="px-2 text-sm font-medium text-muted-foreground">Navegacao</div>

      <nav className="mt-3 flex flex-col gap-1.5">
        {items.filter((i) => i.show).map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}>
              <Button
                variant={active ? 'default' : 'ghost'}
                className={cn(
                  'w-full justify-start',
                  active && 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 pt-6 text-center">
        <img
          src="/aurox-logo.png"
          alt=""
          className="mx-auto h-10 w-10 object-contain opacity-25 pointer-events-none select-none"
          aria-hidden
        />
        <div className="text-xs text-muted-foreground">Aurox Technology</div>
      </div>
    </aside>
  );
}

function Avisos() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ['avisos'],
    queryFn: async () => (await api.get('/notificacoes')).data,
    refetchInterval: 15000,
  });
  const lista = Array.isArray(data) ? data : [];
  const novos = lista.filter((n: any) => !n.lida);
  if (!novos.length) return null;
  return (
    <div className="mt-4 rounded border border-border p-2 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">Avisos ({novos.length})</span>
        <button
          className="text-muted-foreground underline"
          onClick={async () => {
            await api.post('/notificacoes');
            qc.invalidateQueries({ queryKey: ['avisos'] });
          }}
        >lido</button>
      </div>
      {novos.slice(0, 5).map((n: any) => (
        <div key={n.id} className="py-0.5">
          <span className="font-medium">{n.titulo}</span> — {String(n.mensagem || '').slice(0, 60)}
        </div>
      ))}
    </div>
  );
}
