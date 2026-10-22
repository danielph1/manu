
ALTER TABLE public.marketplace_anuncios
  ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE TABLE IF NOT EXISTS public.marketplace_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id integer REFERENCES public.empresas(id),
  criado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  total_anuncios integer NOT NULL DEFAULT 0,
  total_leads integer NOT NULL DEFAULT 0,
  desfeito boolean NOT NULL DEFAULT false,
  desfeito_em timestamptz,
  desfeito_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  observacao text
);
CREATE INDEX IF NOT EXISTS idx_mkt_anuncios_batch ON public.marketplace_anuncios(batch_id);

ALTER TABLE public.marketplace_buscas
  ADD COLUMN IF NOT EXISTS pais text DEFAULT 'BR';
