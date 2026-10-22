
ALTER TABLE public.marketplace_anuncios
  ADD COLUMN IF NOT EXISTS origem text DEFAULT 'facebook';
ALTER TABLE public.marketplace_buscas
  ADD COLUMN IF NOT EXISTS origem text DEFAULT 'facebook';
CREATE INDEX IF NOT EXISTS idx_mkt_anuncios_origem ON public.marketplace_anuncios(origem, status);
