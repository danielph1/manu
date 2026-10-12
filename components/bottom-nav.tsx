'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { LayoutDashboard, Car, FileText, Bell, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function BottomNav() {
  const path = usePathname();
  const { user } = useAuth();
  const inicial = String(user?.login || '?').charAt(0).toUpperCase();
  const [avisos, setAvisos] = useState(false);
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ['avisos'],
    queryFn: async () => (await api.get('/notificacoes')).data,
    refetchInterval: 15000,
  });
  const lista = (Array.isArray(data) ? data : []).filter((n: any) => {
    const t = String(n.tipo || '').toLowerCase();
    return !['chat', 'mensagem', 'estoque', 'oficina'].some((i) => t.includes(i));
  }).slice(0, 15);

  const item = (href: string, Icon: any, label: string) => {
    const ativo = path?.startsWith(href);
    return (
      <Link href={href} className={`flex flex-col items-center text-[10px] ${ativo ? 'text-primary' : 'text-muted-foreground'}`}>
        <Icon className="h-5 w-5" />
        {label}
      </Link>
    );
  };

  return (
    <>
      {avisos && (
        <div className="fixed bottom-16 left-3 right-3 z-40 max-h-72 overflow-y-auto rounded-2xl border border-border bg-card p-3 shadow-xl md:hidden">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium">Últimos avisos</span>
            <button className="text-xs underline" onClick={async () => { await api.post('/notificacoes'); qc.invalidateQueries({ queryKey: ['avisos'] }); }}>lido</button>
          </div>
          {lista.length === 0 && <p className="text-xs text-muted-foreground">Nenhum aviso.</p>}
          {lista.map((n: any) => (
            <div key={n.id} className="border-t border-border py-1.5 text-xs">
              <b>{n.titulo}</b> — {String(n.mensagem || '').slice(0, 70)}
            </div>
          ))}
        </div>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-card px-1 py-2 md:hidden">
        {item('/painel', LayoutDashboard, 'Leads')}
        {item('/estoque', Car, 'Estoque')}
        {item('/fichas', FileText, 'Fichas')}
        <button onClick={() => setAvisos((o) => !o)} className="flex flex-col items-center text-[10px] text-muted-foreground">
          <Bell className="h-5 w-5" />
          Avisos
        </button>
        {item('/chat', MessageSquare, 'Chat')}
        <Link href="/configuracoes" className="flex flex-col items-center">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{inicial}</span>
        </Link>
      </nav>
    </>
  );
}
