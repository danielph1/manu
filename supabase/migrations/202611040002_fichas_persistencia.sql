-- MANU/Aurox: persistência de fichas bancárias e estados iniciais corretos.
-- Execute após backup, no SQL Editor do Supabase. Seguro para repetir.
BEGIN;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS status_geral text DEFAULT 'pendente';
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS observacao_elfenai text;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS etapa_obs text;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS fin_parcelas integer;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS fin_valor_parcela numeric;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS pendente_documentacao boolean DEFAULT false;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS contrato_em_analise boolean DEFAULT false;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS pendente_assinatura boolean DEFAULT false;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS contrato_pago boolean DEFAULT false;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS contrato_recusado boolean DEFAULT false;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS entrada_paga numeric;
ALTER TABLE public.fichas_credito ADD COLUMN IF NOT EXISTS valor_pendente numeric;
ALTER TABLE public.ficha_bancos ADD COLUMN IF NOT EXISTS client_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_manu_ficha_banco_client_key
  ON public.ficha_bancos(ficha_id, client_key) WHERE client_key IS NOT NULL;
ALTER TABLE public.fichas_credito ALTER COLUMN status_geral SET DEFAULT 'pendente';
UPDATE public.fichas_credito SET status_geral='pendente'
  WHERE status_geral IS NULL OR BTRIM(status_geral)='';
-- Não reclassifica fichas explicitamente aprovadas/negadas nem altera históricos.
-- Em novos leads, FALSE não deve significar recusa antes da análise.
ALTER TABLE public.leads ALTER COLUMN aprovado DROP DEFAULT;
ALTER TABLE public.leads ALTER COLUMN aprovado DROP NOT NULL;
-- Colunas recebidas do formulário do vendedor. Não alterar valores existentes.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS marca_carro text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cor_carro text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bairro_empresa text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cidade_empresa text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estado_empresa text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tempo_carreira text;
-- Erro relatado ao gerar faturamento: coluna ausente nas instalações antigas.
ALTER TABLE public.faturamentos ADD COLUMN IF NOT EXISTS gerente_nome text;
COMMIT;
