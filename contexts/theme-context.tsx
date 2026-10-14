'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export const TEMAS = [
  { id: 'escuro', nome: 'Escuro', desc: 'O padrão atual' },
  { id: 'preto', nome: 'Preto', desc: 'Quase tudo preto, minimalista' },
  { id: 'claro', nome: 'Claro Manu', desc: 'Fundo claro com azul' },
  { id: 'azul', nome: 'Azul escuro', desc: 'Fundo azul marinho' },
  { id: 'rosa', nome: 'Rosa', desc: 'Escuro com rosa' },
  { id: 'verde', nome: 'Verde', desc: 'Escuro com verde' },
  { id: 'ambar', nome: 'Âmbar', desc: '3 vendas no mês' },
  { id: 'vinho', nome: 'Vinho', desc: '4 vendas no mês' },
  { id: 'grafite', nome: 'Grafite', desc: 'Cinza chumbo, sóbrio' },
] as const;

export type TemaId = (typeof TEMAS)[number]['id'];
const KEY = 'manu.tema';

const Ctx = createContext<{ tema: TemaId; setTema: (t: TemaId) => void }>({
  tema: 'escuro',
  setTema: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<TemaId>('escuro');

  useEffect(() => {
    const salvo = (window.localStorage.getItem(KEY) || 'escuro') as TemaId;
    aplicar(salvo);
    setTemaState(salvo);
  }, []);

  function aplicar(t: TemaId) {
    const el = document.documentElement;
    el.dataset.theme = t;
    el.classList.toggle('dark', t !== 'claro');
  }

  function setTema(t: TemaId) {
    window.localStorage.setItem(KEY, t);
    aplicar(t);
    setTemaState(t);
  }

  return <Ctx.Provider value={{ tema, setTema }}>{children}</Ctx.Provider>;
}

export function useTema() {
  return useContext(Ctx);
}
