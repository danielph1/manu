-- Índices auxiliares para o painel de desempenho Aurox; sem alteração de dados.
-- OPCIONAL, mas recomendado para empresas com muitos leads. Execute depois do backup.
-- Não execute caso as tabelas de fichas/triagem ainda não tenham sido criadas.
CREATE INDEX IF NOT EXISTS aurox_desempenho_leads_empresa_data
  ON public.leads(empresa_id,data_lead,vendedor_id);
CREATE INDEX IF NOT EXISTS aurox_desempenho_fichas_lead
  ON public.fichas_credito(lead_id);
CREATE INDEX IF NOT EXISTS aurox_desempenho_triagem_empresa_lead
  ON public.triagem(empresa_id,lead_id,id);
CREATE INDEX IF NOT EXISTS aurox_desempenho_transferencias_empresa_lead
  ON public.manu_atendimento_transferencias(empresa_id,lead_id);
