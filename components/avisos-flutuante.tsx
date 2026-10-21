\'use client\';
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
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });

  const lista = (Array.isArray(data) ? data : []).filter((n: any) => {
    const t = String(n.tipo || '').toLowerCase();
    return !IGNORAR.some((i) => t.includes(i));
  });
  const ultimas = lista.slice(0, 5);
  const novos = lista.filter((n: any) => !n.lida).length;

  // ao mudar de página, fecha o painel
  useEffect(() => {
    setAberto(false);
  }, [path]);

  // clique fora
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

  // esconde no chat aberto e em rotas de formulário/overlay
  if (path.startsWith('/chat')) return null;

  // se não tem nada novo e painel fechado, some o botão (não polui)
  // ainda dá pra ver avisos antigos? só quando há novos — menos persistente
  if (!aberto && novos === 0) return null;

  return (
    <div ref={boxRef} className="fixed bottom-24 right-4 z-40">
      {aberto && (
        <div className="mb-3 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-3 shadow-xl">
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
          {ultimas.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum aviso recente.</p>
          )}
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {ultimas.map((n: any) => (
              <li
                key={n.id}
                className={`rounded-lg border border-border px-2.5 py-2 text-xs ${n.lida ? 'opacity-60' : 'bg-primary/5'}`}
              >
                <div className="font-medium">{n.titulo || n.tipo || 'Aviso'}</div>
                {n.corpo || n.mensagem ? (
                  <div className="mt-0.5 text-muted-foreground">{n.corpo || n.mensagem}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-sky-500 text-white shadow-lg"
        aria-label="Avisos"
      >
        <Bell className="h-5 w-5" />
        {novos > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold">
            {novos > 9 ? '9+' : novos}
          </span>
        )}
      </button>
    </div>
  );
}
