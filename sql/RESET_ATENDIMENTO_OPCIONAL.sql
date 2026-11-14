-- EXECUTAR APENAS UMA VEZ, SE QUISER RESETAR TODOS OS CONTATOS ANTIGOS.
-- Nao ha marcador de leitura compartilhado no banco antigo, portanto nao e possivel
-- saber quais mensagens historicas estao realmente nao lidas. Este reset assume
-- que a equipe revisou as mensagens existentes e considera todas como lidas AGORA.
-- Contatos novos apos a migration de atendimento nao sao afetados pela migracao.
-- Antes: pare temporariamente o recebimento de mensagens (janela de manutencao),
-- faca backup e confirme a contagem com SELECT dos leads afetados.
BEGIN;
CREATE TABLE IF NOT EXISTS public.manu_reset_atendimento_backup_20261114 (
  lead_id bigint PRIMARY KEY, empresa_id integer NOT NULL, respondeu_anterior boolean,
  salvo_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.manu_reset_atendimento_backup_20261114 (lead_id,empresa_id,respondeu_anterior)
SELECT id,empresa_id,respondeu FROM public.leads WHERE empresa_id IS NOT NULL
ON CONFLICT (lead_id) DO NOTHING;
-- Base inicial da caixa de entrada: mensagens atuais marcadas como lidas,
-- sem atribuir contato externo ou prova de envio.
INSERT INTO public.manu_lead_atendimento_estado
  (lead_id,empresa_id,ultimo_cliente_id,ultimo_lido_id)
SELECT l.id,l.empresa_id,
 COALESCE((SELECT MAX(m.id) FROM public.chat_geral_mensagens m WHERE m.lead_id=l.id
   AND m.remetente_id IS NULL AND m.mensagem NOT ILIKE 'Transferido de %'),0),
 COALESCE((SELECT MAX(m.id) FROM public.chat_geral_mensagens m WHERE m.lead_id=l.id
   AND m.remetente_id IS NULL AND m.mensagem NOT ILIKE 'Transferido de %'),0)
FROM public.leads l WHERE l.empresa_id IS NOT NULL
ON CONFLICT (lead_id) DO UPDATE SET
  ultimo_cliente_id=GREATEST(manu_lead_atendimento_estado.ultimo_cliente_id,EXCLUDED.ultimo_cliente_id),
  ultimo_lido_id=GREATEST(manu_lead_atendimento_estado.ultimo_lido_id,EXCLUDED.ultimo_lido_id);
-- Reset temporario: nenhum lead tem mensagem nao lida na linha de base.
UPDATE public.leads SET respondeu=TRUE WHERE empresa_id IS NOT NULL;
COMMIT;
-- Para ver valores originais: SELECT * FROM public.manu_reset_atendimento_backup_20261114;
