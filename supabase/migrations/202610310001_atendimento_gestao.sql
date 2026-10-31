-- MANU: auditoria de transferencias de leads por empresa.
-- Execute com backup previo no Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS public.manu_atendimento_transferencias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES public.empresas(id),
  lead_id bigint NOT NULL,
  de_vendedor_id integer,
  para_vendedor_id integer NOT NULL,
  por_usuario_id integer,
  motivo text NOT NULL DEFAULT 'manual',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manu_atendimento_transferencias_empresa
  ON public.manu_atendimento_transferencias (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_manu_atendimento_transferencias_vendedor
  ON public.manu_atendimento_transferencias (de_vendedor_id, criado_em DESC);
ALTER TABLE public.manu_atendimento_transferencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manu_atendimento_transferencias FROM anon, authenticated;
-- A tabela e acessada somente pelo backend autenticado, usando conexao privada ao Postgres.
