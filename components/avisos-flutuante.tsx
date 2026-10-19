'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Bell, X } from 'lucide-react';

const IGNORAR = ['chat', 'mensagem', 'estoque', 'oficina'];

export function AvisosFlutuante() {
  const path = usePathname() || '';
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const { data = [] } = useQuery({
    queryKey: ['avisos'],
    queryFn: async () => (await api.get('/notificacoes')).data,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const lista = (Array.isArray(data) ? data : []).filter((n: any) => {
    const t = String(n.tipo || '').toLowerCase();
    return !IGNORAR.some((i) => t.includes(i));
  });
  const ultimas = lista.slice(0, 5);
  const novos = lista.filter((n: any) => !n.lida).length;

  // fecha ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    function onDown(e: MouseEvent | TouchEvent) {
      const el = boxRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [aberto]);

  // fecha com Escape
  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto]);

  async function marcarLido() {
    try {
      await api.post('/notificacoes');
      await qc.invalidateQueries({ queryKey: ['avisos'] });
    } catch { /* ok */ }
    setAberto(false);
  }

  if (path.startsWith('/chat')) return null;

  return (
    <div ref={boxRef} className="fixed bottom-24 right-4 z-[10000]">
      {aberto && (
        <div className="mb-3 w-80 rounded-2xl border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Avisos</span>
            <div className="flex items-center gap-2">
              {novos > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={marcarLido}
                >
                  marcar lido
                </button>
              )}
              <button type="button" onClick={() => setAberto(false)} className="text-muted-foreground" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {ultimas.length === 0 && <p className="text-xs text-muted-foreground">Nenhum aviso.</p>}
          {ultimas.map((n: any) => (
            <div key={n.id} className={`border-t border-border py-2 text-xs ${n.lida ? 'opacity-60' : ''}`}>
              <div className="font-medium">{n.titulo}</div>
              <div className="text-muted-foreground">{String(n.mensagem || '').slice(0, 80)}</div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto((o) => !o)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label="Avisos"
      >
        {aberto ? <X className="h-6 w-6" /> : <Bell className="h-6 w-6" />}
        {!aberto && novos > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] text-white">
            {novos > 9 ? '9+' : novos}
          </span>
        )}
      </button>
    </div>
  );
}
