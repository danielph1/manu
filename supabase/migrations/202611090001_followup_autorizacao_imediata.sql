-- AUROX V7: consentimento imediato por declaracao, finalidades separadas por empresa.
-- Requer 202611080001_followup_recovery.sql e 202611080004_followup_e_perfil.sql.
-- A declaracao do responsavel e auditada, mas nao constitui prova independente da autorizacao.
BEGIN;
ALTER TABLE public.aurox_followup_permissoes
  DROP CONSTRAINT IF EXISTS aurox_followup_permissoes_finalidade_check;
ALTER TABLE public.aurox_followup_permissoes
  ADD CONSTRAINT aurox_followup_permissoes_finalidade_check
  CHECK (finalidade IN ('promocoes','novidades','retorno_comercial','pesquisa_satisfacao'));
ALTER TABLE public.aurox_followup_permissoes
  DROP CONSTRAINT IF EXISTS aurox_followup_permissoes_canal_check;
ALTER TABLE public.aurox_followup_permissoes
  ADD CONSTRAINT aurox_followup_permissoes_canal_check
  CHECK (canal IN ('whatsapp','presencial','ligacao','formulario','email','outro'));
ALTER TABLE public.aurox_followup_campanhas
  ADD COLUMN IF NOT EXISTS finalidade text NOT NULL DEFAULT 'promocoes';
ALTER TABLE public.aurox_followup_campanhas
  DROP CONSTRAINT IF EXISTS aurox_followup_campanhas_finalidade_check;
ALTER TABLE public.aurox_followup_campanhas
  ADD CONSTRAINT aurox_followup_campanhas_finalidade_check
  CHECK (finalidade IN ('promocoes','novidades','retorno_comercial','pesquisa_satisfacao'));
-- Consentimentos sem data de expiracao arbitraria: continuam validos ate revogacao ou outra causa aplicavel.
-- O canal em que a autorizacao foi captada NAO e o canal utilizado para enviar.
COMMENT ON COLUMN public.aurox_followup_permissoes.canal IS
  'Canal onde o consentimento foi obtido: presencial, WhatsApp, telefone, formulario etc.';
COMMENT ON COLUMN public.aurox_followup_campanhas.finalidade IS
  'Finalidade declarada da campanha, obrigatoriamente correspondente a permissao ativa do lead.';
COMMIT;
