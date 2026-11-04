-- MANU/Aurox: razão de caixa por empresa. NÃO preenche os valores a partir de propostas ou de faturamentos.
-- Backup do banco antes de aplicar. Idempotente (reexecutável).
BEGIN;
CREATE TABLE IF NOT EXISTS public.manu_movimentos_caixa (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES public.empresas(id),
  loja varchar(40) NOT NULL,
  tipo varchar(8) NOT NULL CHECK (tipo IN ('entrada','saida')),
  status varchar(12) NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado','previsto','cancelado')),
  categoria varchar(80) NOT NULL,
  descricao text NOT NULL DEFAULT '',
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  data_movimento date NOT NULL,
  origem_tipo varchar(60),
  origem_id text,
  comprovante_url text,
  criado_por integer REFERENCES public.usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manu_caixa_empresa_data ON public.manu_movimentos_caixa(empresa_id, data_movimento DESC);
CREATE INDEX IF NOT EXISTS manu_caixa_empresa_loja_data ON public.manu_movimentos_caixa(empresa_id, loja, data_movimento DESC);
-- Somente o backend autenticado com verificações de empresa acessa esse razão.
ALTER TABLE public.manu_movimentos_caixa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manu_movimentos_caixa FROM anon, authenticated;
COMMENT ON TABLE public.manu_movimentos_caixa IS 'Fluxo de caixa efetivo: lançar apenas valores liquidados. Propostas e financiamento aprovado não são recebimento.';
COMMIT;
