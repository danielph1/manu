'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { LayoutDashboard, Car, FileText, Bell, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function BottomNav() {
  const path = usePathname() || '';
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

  const Item = ({ href, Icon, label }: { href: string; Icon: any; label: string }) => {
    const ativo = path.startsWith(href);
    return (
      <Link href={href} title={label} className={`flex h-10 w-10 items-center justify-center rounded-full ${ativo ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:bg-muted'}`}>
        <Icon className="h-5 w-5" />
      </Link>
    );
  };

  return (
    <>
      {avisos && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[min(92vw,380px)] -translate-x-1/2 max-h-72 overflow-y-auto rounded-2xl border border-border bg-card p-3 shadow-2xl">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium">Últimos avisos</span>
            <button className="text-xs underline" onClick={async () => { await api.post('/notificacoes'); qc.invalidateQueries({ queryKey: ['avisos'] }); setAvisos(false); }}>lido</button>
          </div>
          {lista.length === 0 && <p className="text-xs text-muted-foreground">Nenhum aviso.</p>}
          {lista.map((n: any) => (
            <div key={n.id} className="border-t border-border py-1.5 text-xs">
              <b>{n.titulo}</b> — {String(n.mensagem || '').slice(0, 70)}
            </div>
          ))}
        </div>
      )}
      <nav className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/95 px-3 py-2 shadow-2xl backdrop-blur">
        <Item href="/painel" Icon={LayoutDashboard} label="Leads" />
        <Item href="/estoque" Icon={Car} label="Estoque" />
        <Item href="/fichas" Icon={FileText} label="Fichas" />
        <button onClick={() => setAvisos((o) => !o)} title="Avisos" className={`flex h-10 w-10 items-center justify-center rounded-full ${avisos ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:bg-muted'}`}>
          <Bell className="h-5 w-5" />
        </button>
        <Item href="/chat" Icon={MessageSquare} label="Chat" />
        <Link href="/configuracoes" title="Eu" className="flex h-10 w-10 items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{inicial}</span>
        </Link>
      </nav>
    </>
  );
}
