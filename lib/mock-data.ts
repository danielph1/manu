// =============================================================
// MOCK DATA TEMPORARIO - USADO ENQUANTO A API NAO ESTA PRONTA
// TODO: REPLACE_WITH_API - remover este arquivo e usar lib/services
// =============================================================
import {
  ChatMensagem, EstoqueCarro, FichaCredito, Lead, Meta,
  PainelStats, ProcessoTransferencia, Tarefa, User, Vendedor,
} from '@/types';

export const MOCK_USER: User = {
  id: 1,
  login: 'andre',
  tipo: 'vendedor',
  vendedor_id: 1,
  ativo: true,
  loja: '381',
};

export const MOCK_VENDEDORES: Vendedor[] = [
  { id: 1, nome: 'andré', loja: '381', ativo: true },
  { id: 2, nome: 'armando', loja: '381', ativo: true },
  { id: 4, nome: 'josuel', loja: '381', ativo: true },
  { id: 5, nome: 'matheus', loja: '381', ativo: true },
  { id: 8, nome: 'alessandro', loja: '381', ativo: true },
  { id: 11, nome: 'fred', loja: '381', ativo: true },
];

export const MOCK_LEADS: Lead[] = [
  { id: 599, data_lead: '2026-09-16', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'siena', nome_lead: 'lohan santos', telefone: '(21)99550-1052', respondeu: true, gerou_ficha: true, aprovado: true, venda_concluida: true, status_id: 5 },
  { id: 598, data_lead: '2026-09-16', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'Argo', nome_lead: 'Arthur', telefone: '2198765432', respondeu: true, gerou_ficha: true, aprovado: true, venda_concluida: true },
  { id: 596, data_lead: '2026-09-16', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'siena', nome_lead: 'lu soares', telefone: '21977000001', respondeu: true, gerou_ficha: true, aprovado: true, venda_concluida: true },
  { id: 592, data_lead: '2026-09-16', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'Uno', nome_lead: 'Carine', telefone: '(21)97882-2122', respondeu: true, gerou_ficha: true, aprovado: false },
  { id: 591, data_lead: '2026-09-15', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'Kicks', nome_lead: 'Carlos', telefone: '(21)98988-8764', respondeu: false, gerou_ficha: false },
  { id: 589, data_lead: '2026-09-15', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'Siena', nome_lead: 'Deus no controle', telefone: '(21)97365-2222', respondeu: false },
  { id: 587, data_lead: '2026-09-14', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'Cruze', nome_lead: 'Matheus e Silva', telefone: '(21)97644-4687', respondeu: true, gerou_ficha: true },
  { id: 585, data_lead: '2026-09-14', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'Onix Plus', nome_lead: 'Jonathan Fabricio', telefone: '(21)96962-5421', respondeu: true, gerou_ficha: true },
  { id: 583, data_lead: '2026-09-13', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'Uno', nome_lead: 'Julio Cesar', telefone: '(21)96955-0339', respondeu: false },
  { id: 581, data_lead: '2026-09-13', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'Sportage', nome_lead: 'Eraldo Araujo', telefone: '(43)98433-2865', respondeu: false },
  { id: 579, data_lead: '2026-09-12', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'C4', nome_lead: 'Cristiana Marques', telefone: '(21)96617-0140', respondeu: false },
  { id: 577, data_lead: '2026-09-11', vendedor_id: 1, vendedor_nome: 'andré', produto_interesse: 'corola', nome_lead: 'Thiago', telefone: '(21)993621151', respondeu: false },
];

export const MOCK_PAINEL_STATS: PainelStats = {
  total_leads: 177,
  responderam: 44,
  fichas_geradas: 11,
  aprovados: 4,
  vendidos: 2,
};

export const MOCK_ESTOQUE: EstoqueCarro[] = [
  { id: 1, modelo: 'Argo Drive 1.0', marca: 'Fiat', ano: 2024, cor: 'Branco', placa: 'ABC1D23', km: 15000, preco: 72900, status: 'disponivel', loja: '381' },
  { id: 2, modelo: 'Onix Plus LT 1.0', marca: 'Chevrolet', ano: 2023, cor: 'Prata', placa: 'DEF2E34', km: 32000, preco: 85900, status: 'disponivel', loja: '381' },
  { id: 3, modelo: 'Kicks Advance CVT', marca: 'Nissan', ano: 2022, cor: 'Preto', placa: 'GHI3F45', km: 45000, preco: 92500, status: 'reservado', loja: '381' },
  { id: 4, modelo: 'Corolla GLi 2.0', marca: 'Toyota', ano: 2024, cor: 'Branco Perola', placa: 'JKL4G56', km: 10500, preco: 139900, status: 'disponivel', loja: '381' },
  { id: 5, modelo: 'Cruze LTZ Turbo', marca: 'Chevrolet', ano: 2023, cor: 'Cinza', placa: 'MNO5H67', km: 28000, preco: 118000, status: 'vendido', loja: '381' },
  { id: 6, modelo: 'C4 Cactus Shine', marca: 'Citroen', ano: 2022, cor: 'Vermelho', placa: 'PQR6I78', km: 52000, preco: 89900, status: 'disponivel', loja: '381' },
];

export const MOCK_FICHAS: FichaCredito[] = [
  { id: 1, lead_id: 599, lead_nome: 'lohan santos', banco: 'Santander', status: 'aprovada', valor_financiado: 45000, entrada: 10000, parcelas: 48, created_at: '2026-09-16' },
  { id: 2, lead_id: 598, lead_nome: 'Arthur', banco: 'Itau', status: 'aprovada', valor_financiado: 38000, entrada: 8000, parcelas: 36, created_at: '2026-09-15' },
  { id: 3, lead_id: 596, lead_nome: 'lu soares', banco: 'Bradesco', status: 'enviada', valor_financiado: 42000, entrada: 7000, parcelas: 48, created_at: '2026-09-14' },
  { id: 4, lead_id: 592, lead_nome: 'Carine', banco: 'BV', status: 'pendente', valor_financiado: 35000, entrada: 5000, parcelas: 60, created_at: '2026-09-14' },
  { id: 5, lead_id: 587, lead_nome: 'Matheus e Silva', banco: 'Santander', status: 'reprovada', valor_financiado: 55000, entrada: 10000, parcelas: 48, created_at: '2026-09-13' },
];

export const MOCK_METAS: Meta[] = [
  { id: 1, vendedor_id: 1, vendedor_nome: 'andré', mes: 9, ano: 2026, meta_vendas: 10, meta_fichas: 25, realizado_vendas: 2, realizado_fichas: 11 },
  { id: 2, vendedor_id: 2, vendedor_nome: 'armando', mes: 9, ano: 2026, meta_vendas: 8, meta_fichas: 20, realizado_vendas: 5, realizado_fichas: 18 },
  { id: 3, vendedor_id: 5, vendedor_nome: 'matheus', mes: 9, ano: 2026, meta_vendas: 12, meta_fichas: 30, realizado_vendas: 7, realizado_fichas: 22 },
  { id: 4, vendedor_id: 8, vendedor_nome: 'alessandro', mes: 9, ano: 2026, meta_vendas: 10, meta_fichas: 25, realizado_vendas: 10, realizado_fichas: 28 },
];

export const MOCK_TAREFAS: Tarefa[] = [
  { id: 1, titulo: 'Ligar para lead Arthur', descricao: 'Confirmar visita de amanha', responsavel_id: 1, responsavel_nome: 'andré', prazo: '2026-09-17', concluida: false, prioridade: 'alta', lead_id: 598 },
  { id: 2, titulo: 'Enviar documentos ficha BV', descricao: 'Comprovante de renda', responsavel_id: 1, responsavel_nome: 'andré', prazo: '2026-09-18', concluida: false, prioridade: 'media', lead_id: 592 },
  { id: 3, titulo: 'Retornar lead Thiago', descricao: 'Lead frio - segunda tentativa', responsavel_id: 1, responsavel_nome: 'andré', prazo: '2026-09-16', concluida: true, prioridade: 'baixa' },
  { id: 4, titulo: 'Agendar entrega Corola', descricao: 'Cliente lu soares', responsavel_id: 1, responsavel_nome: 'andré', prazo: '2026-09-19', concluida: false, prioridade: 'alta' },
];

export const MOCK_PROCESSOS: ProcessoTransferencia[] = [
  { id: 1, lead_id: 583, lead_nome: 'Julio Cesar', vendedor_origem: 'andré', vendedor_destino: 'matheus', status: 'pendente', motivo: 'Lead inativo ha 7 dias', created_at: '2026-09-14' },
  { id: 2, lead_id: 579, lead_nome: 'Cristiana Marques', vendedor_origem: 'armando', vendedor_destino: 'andré', status: 'aprovado', motivo: 'Reatribuicao gerencial', created_at: '2026-09-13' },
];

export const MOCK_CHAT_MENSAGENS: ChatMensagem[] = [
  { id: 1, remetente_id: 6, remetente_nome: 'daniel (admin)', conteudo: 'Pessoal, meta do mes atualizada!', created_at: '2026-09-16T09:00:00', lida: true },
  { id: 2, remetente_id: 2, remetente_nome: 'armando', conteudo: 'Fechei mais uma venda do Onix!', created_at: '2026-09-16T10:15:00', lida: true },
  { id: 3, remetente_id: 1, remetente_nome: 'andré', conteudo: 'Parabens! Estou proximo da minha meta tambem.', created_at: '2026-09-16T10:17:00', lida: true },
  { id: 4, remetente_id: 5, remetente_nome: 'matheus', conteudo: 'Alguem tem contato do financiamento BV atualizado?', created_at: '2026-09-16T14:22:00', lida: false },
];
