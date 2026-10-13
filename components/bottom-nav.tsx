'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { LayoutDashboard, Car, FileText, Bell, MessageSquare } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function BottomNav() {
  const path = usePathname() || '';
  const { user } = useAuth();
  const inicial = String(user?.login || '?').charAt(0).toUpperCase();
  const [avisos, setAvisos] = useState(false);
  const [mounted, setMounted] = useState(false);
  const qc = useQueryClient();
  useEffect(() => setMounted(true), []);

  const { data = [] } = useQuery({
    queryKey: ['avisos'],
    queryFn: async () => (await api.get('/notificacoes')).data,
    refetchInterval: 15000,
  });
  const lista = (Array.isArray(data) ? data : []).filter((n: any) => {
    const t = String(n.tipo || '').toLowerCase();
    return !['chat', 'mensagem', 'estoque', 'oficina'].some((i) => t.includes(i));
  }).slice(0, 15);

  if (!mounted) return null;

  const Item = ({ href, Icon }: { href: string; Icon: any }) => (
    <Link href={href} style={{ display: 'flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: path.startsWith(href) ? 'hsl(var(--primary))' : 'transparent', color: path.startsWith(href) ? 'hsl(var(--primary-foreground))' : 'inherit' }}>
      <Icon size={20} />
    </Link>
  );

  return createPortal(
    <>
      {avisos && (
        <div style={{ position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', zIndex: 9998, width: 'min(92vw, 380px)', maxHeight: 280, overflowY: 'auto', borderRadius: 16, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
            <b>Últimos avisos</b>
            <button onClick={async () => { await api.post('/notificacoes'); qc.invalidateQueries({ queryKey: ['avisos'] }); setAvisos(false); }}>lido</button>
          </div>
          {lista.length === 0 && <p style={{ fontSize: 12, opacity: 0.7 }}>Nenhum aviso.</p>}
          {lista.map((n: any) => <div key={n.id} style={{ borderTop: '1px solid hsl(var(--border))', padding: '6px 0', fontSize: 12 }}><b>{n.titulo}</b> — {String(n.mensagem || '').slice(0, 70)}</div>)}
        </div>
      )}
      <nav style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 999, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', padding: '8px 12px', boxShadow: '0 8px 30px rgba(0,0,0,.35)' }}>
        <Item href="/painel" Icon={LayoutDashboard} />
        <Item href="/estoque" Icon={Car} />
        <Item href="/fichas" Icon={FileText} />
        <button onClick={() => setAvisos((o) => !o)} style={{ display: 'flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: avisos ? 'hsl(var(--primary))' : 'transparent', color: avisos ? 'hsl(var(--primary-foreground))' : 'inherit' }}>
          <Bell size={20} />
        </button>
        <Item href="/chat" Icon={MessageSquare} />
        <Link href="/configuracoes" style={{ display: 'flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 32, height: 32, borderRadius: 999, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{inicial}</span>
        </Link>
      </nav>
    </>,
    document.body,
  );
}
