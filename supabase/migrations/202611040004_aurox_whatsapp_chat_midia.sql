-- v12: Referências aos arquivos já existentes no Storage do Aurox-WhatsApp.
-- Faça backup do banco; não altera vendas, fichas ou conteúdo binário de mensagens.
BEGIN;
ALTER TABLE public.chat_geral_mensagens
  ADD COLUMN IF NOT EXISTS aurox_wa_mensagem_id bigint
    REFERENCES public.aurox_wa_mensagens(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_geral_aurox_msg_uq
  ON public.chat_geral_mensagens (aurox_wa_mensagem_id);

-- Recuperação conservadora das fotos/áudios recebidos ANTES desta atualização.
-- Só vincula pares correspondentes (mesma empresa/lead/texto e proximidade de data)
-- que sejam únicos de ambos os lados. Se houver dúvida, não altera a mensagem.
WITH possiveis AS (
  SELECT ch.id AS chat_id, wa.id AS wa_id,
    COUNT(*) OVER(PARTITION BY ch.id) AS cont_chat,
    COUNT(*) OVER(PARTITION BY wa.id) AS cont_wa
  FROM public.chat_geral_mensagens ch
  JOIN public.aurox_wa_contatos c
    ON (c.lead_id=ch.lead_id OR EXISTS (
       SELECT 1 FROM public.triagem t WHERE t.id=c.triagem_id AND t.empresa_id=c.empresa_id AND t.lead_id=ch.lead_id))
  JOIN public.aurox_wa_mensagens wa
    ON wa.contato_id=c.id AND wa.empresa_id=c.empresa_id
  JOIN public.leads l ON l.id=ch.lead_id
  LEFT JOIN public.vendedores v ON v.id=l.vendedor_id
  WHERE ch.aurox_wa_mensagem_id IS NULL AND ch.remetente_id IS NULL
    AND wa.direcao='recebida' AND wa.media_path IS NOT NULL
    AND c.empresa_id=COALESCE(l.empresa_id,v.empresa_id)
    AND btrim(regexp_replace(ch.mensagem,'^(\[(cliente|Aurox-WhatsApp)\]\s*)+','','gi'))=btrim(wa.corpo)
    AND abs(extract(epoch from (ch.created_at-wa.recebida_em))) < 86400
), unicos AS (
  SELECT chat_id,wa_id FROM possiveis WHERE cont_chat=1 AND cont_wa=1
)
UPDATE public.chat_geral_mensagens ch SET aurox_wa_mensagem_id=u.wa_id
FROM unicos u WHERE ch.id=u.chat_id AND ch.aurox_wa_mensagem_id IS NULL;
COMMIT;

-- Diagnóstico opcional (somente leitura):
SELECT COUNT(*) AS mensagens_aurox_vinculadas
FROM public.chat_geral_mensagens WHERE aurox_wa_mensagem_id IS NOT NULL;
