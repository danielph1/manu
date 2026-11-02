-- MANU - 2026-11-02: multiempresa + feed. Faça backup antes.
BEGIN;
-- Substitui restrição antiga que permitia apenas códigos fixos de loja.
-- O valor real continua controlado pela loja criada e pelas APIs do servidor.
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_loja_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_loja_check
  CHECK (loja IS NULL OR length(trim(loja::text)) BETWEEN 1 AND 80);
ALTER TABLE public.oficina_carros ADD COLUMN IF NOT EXISTS empresa_id integer;
ALTER TABLE public.oficina_carros ADD COLUMN IF NOT EXISTS loja text;
CREATE INDEX IF NOT EXISTS idx_oficina_empresa ON public.oficina_carros(empresa_id);
CREATE TABLE IF NOT EXISTS public.feed_posts (
 id bigserial PRIMARY KEY, autor_id bigint NOT NULL, texto text, midia_url text, midia_tipo text,
 views int DEFAULT 0, likes int DEFAULT 0, created_at timestamptz DEFAULT now(), ativo boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.feed_likes (
 post_id bigint NOT NULL,usuario_id bigint NOT NULL,created_at timestamptz DEFAULT now(),
 PRIMARY KEY(post_id,usuario_id)
);
CREATE TABLE IF NOT EXISTS public.feed_comentarios (
 id bigserial PRIMARY KEY,post_id bigint NOT NULL,autor_id bigint NOT NULL,texto text NOT NULL,created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.feed_views (
 post_id bigint NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
 usuario_id bigint NOT NULL,
 visto_em timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(post_id,usuario_id)
);
CREATE TABLE IF NOT EXISTS public.feed_upload_tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 usuario_id bigint NOT NULL,
 path text NOT NULL UNIQUE,
 tipo text NOT NULL CHECK(tipo IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
 criado_em timestamptz NOT NULL DEFAULT now(),
 usado_em timestamptz
);
ALTER TABLE public.feed_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_upload_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_views,public.feed_upload_tickets FROM anon,authenticated;
-- Contagem verdadeira começa com eventos únicos após a migration.
UPDATE public.feed_posts p SET views=(SELECT count(*) FROM public.feed_views v WHERE v.post_id=p.id);
CREATE TABLE IF NOT EXISTS public.manu_suporte_chamados (
 id bigserial PRIMARY KEY, usuario_id bigint NOT NULL,
 empresa_id integer, assunto varchar(120) NOT NULL,
 mensagem text NOT NULL, status text NOT NULL DEFAULT 'aberto',
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manu_suporte_usuario ON public.manu_suporte_chamados(usuario_id,criado_em DESC);
ALTER TABLE public.manu_suporte_chamados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manu_suporte_chamados FROM anon,authenticated;
COMMIT;
