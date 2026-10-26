
-- Anúncios multi-plataforma
ALTER TABLE public.estoque_carros
  ADD COLUMN IF NOT EXISTS anunciado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS anunciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS anuncios_meta jsonb DEFAULT '{}'::jsonb;

-- anuncios_meta exemplo:
-- { "mercadolivre": {"id":"MLA123","url":"...","status":"active"}, "olx": {...} }

CREATE TABLE IF NOT EXISTS public.anuncios_log (
  id bigserial PRIMARY KEY,
  empresa_id integer,
  estoque_id integer,
  placa text,
  plataforma text NOT NULL,
  external_id text,
  status text DEFAULT 'publicado',
  payload jsonb DEFAULT '{}'::jsonb,
  erro text,
  criado_por integer,
  criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anuncios_log_emp ON public.anuncios_log(empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_anunciado ON public.estoque_carros(anunciado) WHERE anunciado = true;
