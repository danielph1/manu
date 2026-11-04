-- Aurox-WhatsApp v10: imagem/audio privados; metadados por empresa.
-- Execute apos 202611040002_aurox_whatsapp.sql. Faça backup antes.
BEGIN;
ALTER TABLE public.aurox_wa_mensagens
 ADD COLUMN IF NOT EXISTS media_path text,
 ADD COLUMN IF NOT EXISTS media_mime text,
 ADD COLUMN IF NOT EXISTS media_size bigint;

-- Somente imagem/audio de WhatsApp. Armazenamento privado; links temporarios autenticados.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('aurox-wa-media','aurox-wa-media',false,8388608,
 ARRAY['image/jpeg','image/png','image/webp','audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/webm']::text[])
ON CONFLICT (id) DO UPDATE SET
 public=false,
 file_size_limit=8388608,
 allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE INDEX IF NOT EXISTS aurox_wa_mensagens_media_contato_idx
 ON public.aurox_wa_mensagens (contato_id, recebida_em DESC)
 WHERE media_path IS NOT NULL;
COMMIT;
