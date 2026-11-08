-- AUROX V3: campos opcionais separados para cadastro completo de veículos.
-- Antes de rodar em produção, aplique em homologação e faça backup.
BEGIN;
-- Placa pode permanecer desconhecida no cadastro preliminar; duplicidade verificada apenas se informada.
ALTER TABLE public.estoque_carros ALTER COLUMN placa DROP NOT NULL;
ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS aurox_detalhes jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.estoque_carros.aurox_detalhes IS 'Dados complementares opcionais do veículo; integração com portais deve validar cada campo antes de publicar.';
COMMIT;
