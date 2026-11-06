-- Status persistente: mensagem salva no MANU NAO significa entregue ao WhatsApp.
-- Execute em homologação antes de publicar as mudanças nas rotas de chat.
BEGIN;
ALTER TABLE public.chat_geral_mensagens ADD COLUMN IF NOT EXISTS whatsapp_status text;
ALTER TABLE public.chat_geral_mensagens ADD COLUMN IF NOT EXISTS whatsapp_erro text;
COMMENT ON COLUMN public.chat_geral_mensagens.whatsapp_status IS 'null legado/desconhecido | interno | aceito | falhou';
COMMIT;
