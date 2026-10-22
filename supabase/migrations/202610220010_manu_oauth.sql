
-- Rode no SQL Editor do Supabase (pode repetir sem problema)
CREATE TABLE IF NOT EXISTS public.manu_conexoes_oauth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id integer NOT NULL REFERENCES public.empresas(id),
  provedor varchar(40) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','conectado','erro','revogado')),
  label text,
  external_id text,
  access_token_enc text,
  refresh_token_enc text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  integracao_id uuid,
  criado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- unique para ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS uq_manu_oauth_empresa_prov_ext
  ON public.manu_conexoes_oauth (empresa_id, provedor, COALESCE(external_id, ''));

-- se a unique constraint nomeada não existir no INSERT, use este índice
DO $$ BEGIN
  ALTER TABLE public.manu_conexoes_oauth
    DROP CONSTRAINT IF EXISTS manu_conexoes_oauth_empresa_id_provedor_external_id_key;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_manu_oauth_empresa ON public.manu_conexoes_oauth(empresa_id, provedor, status);

-- integracoes (se ainda não)
CREATE TABLE IF NOT EXISTS public.manu_integracoes (
  id uuid PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES public.empresas(id),
  nome text NOT NULL,
  plataforma varchar(40) NOT NULL,
  token_hash text NOT NULL,
  mapeamento jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  criado_por integer,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_evento_em timestamptz
);

CREATE TABLE IF NOT EXISTS public.manu_integracao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid REFERENCES public.manu_integracoes(id) ON DELETE CASCADE,
  empresa_id integer,
  chave_externa text,
  nome text,
  telefone text,
  email text,
  interesse text,
  payload jsonb,
  status text,
  triagem_id integer,
  erro text,
  recebido_em timestamptz DEFAULT now()
);
