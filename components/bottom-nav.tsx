'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { LayoutDashboard, Car, FileText, PlusCircle, CheckSquare, MessageSquare, Heart } from 'lucide-react';

export function BottomNav() {
  const path = usePathname() || '';
  const { user } = useAuth();
  const inicial = String(user?.login || '?').charAt(0).toUpperCase();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const Item = ({ href, Icon }: { href: string; Icon: any }) => (
    <Link href={href} style={{ display: 'flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, flex: '0 0 auto', background: path.startsWith(href) ? 'hsl(var(--primary))' : 'transparent', color: path.startsWith(href) ? 'hsl(var(--primary-foreground))' : 'inherit' }}>
      <Icon size={20} />
    </Link>
  );

  return createPortal(
    <>
      <nav style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 4, maxWidth: '96vw', overflowX: 'auto', borderRadius: 999, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', padding: '8px 10px', boxShadow: '0 8px 30px rgba(0,0,0,.35)' }}>
        <Item href="/painel" Icon={LayoutDashboard} />
        <Item href="/estoque" Icon={Car} />
        <Item href="/fichas" Icon={FileText} />
        {path.startsWith('/painel') && <Item href="/novo-lead" Icon={PlusCircle} />}
        <Item href="/tarefas" Icon={CheckSquare} />
        <Item href="/chat" Icon={MessageSquare} />
        <Item href="/favoritos" Icon={Heart} />
        <Link href="/configuracoes" style={{ display: 'flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <span style={{ width: 32, height: 32, borderRadius: 999, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{inicial}</span>
        </Link>
      </nav>
    </>,
    document.body,
  );
}
