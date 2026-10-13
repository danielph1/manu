'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';

type Ctx = { ids: number[]; toggle: (id: number) => void; tem: (id: number) => boolean };
const C = createContext<Ctx>({ ids: [], toggle: () => {}, tem: () => false });

export function FavoritosProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    if (!user) return;
    api.get('/favoritos').then((r) => setIds(Array.isArray(r.data) ? r.data.map(Number) : [])).catch(() => {});
  }, [user?.id]);

  async function toggle(id: number) {
    const tinha = ids.includes(id);
    setIds((prev) => (tinha ? prev.filter((x) => x !== id) : [...prev, id]));
    try {
      await api.post('/favoritos', { lead_id: id });
    } catch {
      setIds((prev) => (tinha ? [...prev, id] : prev.filter((x) => x !== id)));
    }
  }
  return <C.Provider value={{ ids, toggle, tem: (id) => ids.includes(id) }}>{children}</C.Provider>;
}
export function useFavoritos() { return useContext(C); }
