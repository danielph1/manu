-- AUROX: estado de campanhas e reconciliação manual auditável.
-- Requer migrations de Follow Up e Auditoria já aplicadas.
-- Execute primeiro em homologação, com backup. Não reclassifica falhas antigas automaticamente.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.aurox_followup_envios') IS NULL
    OR to_regclass('public.aurox_followup_campanhas') IS NULL
    OR to_regclass('public.aurox_auditoria_alteracoes') IS NULL THEN
  RAISE EXCEPTION 'Migrations anteriores de Follow Up e Auditoria ausentes';
 END IF;
END $$;

ALTER TABLE public.aurox_followup_envios
 ADD COLUMN IF NOT EXISTS confirmado_manual_em timestamptz,
 ADD COLUMN IF NOT EXISTS confirmado_manual_por integer REFERENCES public.usuarios(id),
 ADD COLUMN IF NOT EXISTS confirmacao_observacao text;

ALTER TABLE public.aurox_followup_envios
 DROP CONSTRAINT IF EXISTS aurox_followup_envios_estado_check;
ALTER TABLE public.aurox_followup_envios
 ADD CONSTRAINT aurox_followup_envios_estado_check
 CHECK (estado IN ('pendente','processando','enviado','ignorado','erro','cancelado','incerto','confirmado_manual'));

-- Campanhas que já terminaram deixam de aparecer como ativas.
-- Falhas antigas NÃO são promovidas automaticamente a sucesso.
UPDATE public.aurox_followup_campanhas c SET estado='concluida'
 WHERE c.estado='ativa'
   AND EXISTS (SELECT 1 FROM public.aurox_followup_envios e
                WHERE e.campanha_id=c.id AND e.empresa_id=c.empresa_id)
   AND NOT EXISTS (SELECT 1 FROM public.aurox_followup_envios e
                   WHERE e.campanha_id=c.id AND e.empresa_id=c.empresa_id
                     AND e.estado IN ('pendente','processando'));
COMMENT ON COLUMN public.aurox_followup_envios.confirmado_manual_em IS
 'Confirmação MANUAL declarada por gestor; não equivale à confirmação técnica de entrega pelo WhatsApp.';
COMMIT;
