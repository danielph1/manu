-- APLICAR ANTES DO DEPLOY: rate limiter persistente em todas as instâncias Vercel.
CREATE TABLE IF NOT EXISTS public.aurox_auth_tentativas (
  chave text PRIMARY KEY CHECK (length(chave) = 64),
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  inicio_janela timestamptz NOT NULL DEFAULT now(),
  bloqueado_ate timestamptz
);
CREATE INDEX IF NOT EXISTS aurox_auth_tentativas_inicio_idx ON public.aurox_auth_tentativas(inicio_janela);
REVOKE ALL ON TABLE public.aurox_auth_tentativas FROM PUBLIC, anon, authenticated;
ALTER TABLE public.aurox_auth_tentativas ENABLE ROW LEVEL SECURITY;
-- Operações ocorrerão exclusivamente no backend, com DATABASE_URL privilegiada.
-- Manutenção mensal: DELETE FROM public.aurox_auth_tentativas WHERE inicio_janela < now() - interval '30 days';
