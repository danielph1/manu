-- AUROX V5: cadastro único para estoque/anúncios e rastreio de liberações.
-- Aplicar em homologação primeiro. NÃO publica anúncios externos.
BEGIN;
ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS aurox_detalhes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS carroceria text;
ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS km integer;
ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS status_estoque text DEFAULT 'ativo';
ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS anunciado boolean DEFAULT false;
ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS anunciado_em timestamptz;
-- A tabela deve existir a partir da migration de Transferências. Não convertemos processos antigos de outra empresa.
CREATE TABLE IF NOT EXISTS public.processos_transferencia (
 id bigserial PRIMARY KEY, empresa_id integer, faturamento_id bigint,
 ficha_id bigint, lead_id bigint, placa text, nome_lead text,
 marca text, modelo text, ano text, cor text, status text DEFAULT 'em_andamento',
 gravame boolean DEFAULT false, reconheceu_firma boolean DEFAULT false,
 documento_pronto boolean DEFAULT false, observacao text,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.processos_transferencia ADD COLUMN IF NOT EXISTS empresa_id integer;
ALTER TABLE public.processos_transferencia ADD COLUMN IF NOT EXISTS faturamento_id bigint;
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS liberado boolean DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS aurox_transferencia_faturamento_empresa_uniq
  ON public.processos_transferencia(empresa_id,faturamento_id) WHERE faturamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS aurox_estoque_empresa_status_idx ON public.estoque_carros(empresa_id,status_estoque,id DESC);
COMMIT;
