'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Lang, normalizeLang, t as translate } from '@/lib/i18n';

type I18nCtx = {
  lang: Lang;
  setLang: (l: Lang) => Promise<void>;
  t: (key: string) => string;
};

const Ctx = createContext<I18nCtx>({
  lang: 'pt',
  setLang: async () => {},
  t: (k) => k,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('pt');

  useEffect(() => {
    const cached = normalizeLang(typeof window !== 'undefined' ? localStorage.getItem('manu.lang') : 'pt');
    setLangState(cached);
    api
      .get('/preferencias')
      .then((r) => {
        const L = normalizeLang(r.data?.idioma);
        setLangState(L);
        localStorage.setItem('manu.lang', L);
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    localStorage.setItem('manu.lang', l);
    try {
      await api.patch('/preferencias', { idioma: l });
    } catch {
      /* offline ok */
    }
  }, []);

  const t = useCallback((key: string) => translate(lang, key), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
