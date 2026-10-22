
-- Credenciais OAuth / sessão por empresa (nunca expostas a outra empresa)
CREATE TABLE IF NOT EXISTS public.manu_conexoes_oauth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id integer NOT NULL REFERENCES public.empresas(id),
  provedor varchar(40) NOT NULL, -- meta_facebook, meta_instagram, whatsapp_qr, whatsapp_cloud, mercadolivre, olx
  status varchar(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','conectado','erro','revogado')),
  label text,
  external_id text,          -- page_id, phone_number_id, etc.
  -- tokens só no servidor (service role / backend); não ir para o client
  access_token_enc text,
  refresh_token_enc text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  integracao_id uuid REFERENCES public.manu_integracoes(id) ON DELETE SET NULL,
  criado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, provedor, external_id)
);
CREATE INDEX IF NOT EXISTS idx_manu_oauth_empresa ON public.manu_conexoes_oauth(empresa_id, provedor, status);

ALTER TABLE public.manu_conexoes_oauth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manu_conexoes_oauth FROM anon, authenticated;
