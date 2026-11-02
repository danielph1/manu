-- Processamento de vídeos fora da Vercel: fila persistente e isolada do navegador.
-- Execute DEPOIS de 202611020001_manu_melhorias.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.manu_media_jobs (
 id bigserial PRIMARY KEY,
 post_id bigint NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
 usuario_id bigint NOT NULL,
 source_path text NOT NULL,
 output_path text,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','working','done','skipped','failed')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz,
 finished_at timestamptz,
 original_bytes bigint,
 processed_bytes bigint,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(post_id)
);
CREATE INDEX IF NOT EXISTS idx_manu_media_jobs_queue ON public.manu_media_jobs(status,available_at,id);
ALTER TABLE public.manu_media_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manu_media_jobs FROM anon,authenticated;
COMMIT;
