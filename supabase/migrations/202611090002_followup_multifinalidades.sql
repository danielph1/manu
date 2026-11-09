-- AUROX Follow Up: autorizações independentes por (empresa, lead, finalidade).
-- REQUER 202611080001, 202611080002 e 202611080004.
-- Incorpora as constraints/coluna de 202611090001 se essa ainda não foi aplicada.
-- Faça backup e teste em homologação antes de executar em produção.
-- Não apaga autorizações existentes ou histórico revogado.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.aurox_followup_permissoes') IS NULL THEN
   RAISE EXCEPTION 'Falta migration anterior: public.aurox_followup_permissoes';
 END IF;
 IF to_regclass('public.aurox_followup_campanhas') IS NULL THEN
   RAISE EXCEPTION 'Falta migration anterior: public.aurox_followup_campanhas';
 END IF;
 IF to_regclass('public.aurox_auditoria_alteracoes') IS NULL THEN
   RAISE EXCEPTION 'Falta migration de auditoria: public.aurox_auditoria_alteracoes';
 END IF;
END $$;
-- Libera a finalidade de pesquisa de satisfação mesmo se a V7 ainda não foi aplicada.
ALTER TABLE public.aurox_followup_permissoes DROP CONSTRAINT IF EXISTS aurox_followup_permissoes_finalidade_check;
ALTER TABLE public.aurox_followup_permissoes ADD CONSTRAINT aurox_followup_permissoes_finalidade_check
 CHECK (finalidade IN ('promocoes','novidades','retorno_comercial','pesquisa_satisfacao'));
ALTER TABLE public.aurox_followup_permissoes DROP CONSTRAINT IF EXISTS aurox_followup_permissoes_canal_check;
ALTER TABLE public.aurox_followup_permissoes ADD CONSTRAINT aurox_followup_permissoes_canal_check
 CHECK (canal IN ('whatsapp','presencial','ligacao','formulario','email','outro'));
ALTER TABLE public.aurox_followup_campanhas ADD COLUMN IF NOT EXISTS finalidade text NOT NULL DEFAULT 'promocoes';
ALTER TABLE public.aurox_followup_campanhas DROP CONSTRAINT IF EXISTS aurox_followup_campanhas_finalidade_check;
ALTER TABLE public.aurox_followup_campanhas ADD CONSTRAINT aurox_followup_campanhas_finalidade_check
 CHECK (finalidade IN ('promocoes','novidades','retorno_comercial','pesquisa_satisfacao'));
-- Antes: uma única autorização por lead. Agora: uma autorização ativa POR FINALIDADE.
DROP INDEX IF EXISTS public.aurox_fu_permissao_ativa_unica;
CREATE UNIQUE INDEX aurox_fu_permissao_ativa_unica
 ON public.aurox_followup_permissoes(empresa_id,lead_id,finalidade)
 WHERE revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS aurox_fu_permissoes_lead_ativas
 ON public.aurox_followup_permissoes(empresa_id,lead_id,finalidade)
 WHERE revogado_em IS NULL;
COMMENT ON INDEX public.aurox_fu_permissao_ativa_unica IS
 'Permite múltiplas finalidades autorizadas por lead, impedindo duplicidade de uma mesma finalidade ativa.';
COMMIT;
