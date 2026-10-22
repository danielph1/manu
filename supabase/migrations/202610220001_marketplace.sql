-- MANU Marketplace (Facebook) — fila de anúncios ANTES de virar lead
-- Somente superadmin usa no painel. Executar após backup.

CREATE TABLE IF NOT EXISTS public.marketplace_buscas (
  id bigserial PRIMARY KEY,
  empresa_id integer REFERENCES public.empresas(id),
  query text NOT NULL,
  cidade text NOT NULL DEFAULT 'rio',
  max_preco integer,
  status varchar(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','rodando','concluida','erro')),
  criado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  erro text,
  total_encontrado integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.marketplace_anuncios (
  id bigserial PRIMARY KEY,
  busca_id bigint REFERENCES public.marketplace_buscas(id) ON DELETE CASCADE,
  empresa_id integer REFERENCES public.empresas(id),
  titulo text,
  preco text,
  localizacao text,
  url text,
  imagem_url text,
  fb_id text,
  query_origem text,
  status varchar(20) NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo','selecionado','descartado','distribuido')),
  lead_id integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_anuncios_url_uq UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS idx_mkt_anuncios_status ON public.marketplace_anuncios(status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_anuncios_empresa ON public.marketplace_anuncios(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_mkt_buscas_status ON public.marketplace_buscas(status, criado_em DESC);

COMMENT ON TABLE public.marketplace_anuncios IS
  'Anúncios capturados do Marketplace. NÃO são leads até distribuição manual pelo superadmin.';
