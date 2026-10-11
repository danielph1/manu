// =============================================================
// Tipos principais do sistema (Project Manu)
// Esses tipos refletem o schema do banco (Postgres via FastAPI)
// =============================================================

export type UserTipo = 'admin' | 'vendedor' | 'documento' | 'elfenai';

export interface User {
  id: number;
  login: string;
  tipo: UserTipo;
  vendedor_id?: number | null;
  ativo: boolean;
  loja?: string | null;
  created_at?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginPayload {
  login: string;
  senha: string;
}

export interface Vendedor {
  id: number;
  nome: string;
  loja?: string | null;
  ativo?: boolean;
}

export interface OrigemLead {
  id: number;
  nome: string;
}

export interface StatusLead {
  id: number;
  nome: string;
  cor?: string;
}

export interface Lead {
  id: number;
  data_lead: string;
  vendedor_id: number;
  vendedor_nome?: string;
  origem_id?: number | null;
  origem_nome?: string | null;
  produto_interesse?: string | null;
  nome_lead: string;
  telefone?: string | null;
  cpf?: string | null;
  nome_completo?: string | null;
  data_nascimento?: string | null;
  habilitado?: boolean | null;
  data_hora_visita?: string | null;
  data_venda?: string | null;
  venda_concluida?: boolean;
  observacao?: string | null;
  respondeu?: boolean;
  gerou_ficha?: boolean;
  aprovado?: boolean;
  status_id?: number | null;
}

export interface LeadFiltros {
  filtro?: 'todos' | 'responderam' | 'nao_responderam' | 'fichas' | 'aprovados' | 'vendidos';
  periodo?: 'hoje' | 'semana' | 'mes' | 'todas';
  busca?: string;
  vendedor_id?: number;
}

export interface EstoqueCarro {
  id: number;
  modelo: string;
  marca?: string;
  ano?: number;
  cor?: string;
  placa?: string;
  km?: number;
  preco?: number;
  status?: 'disponivel' | 'reservado' | 'vendido';
  loja?: string;
  observacao?: string;
  fotos?: string[];
}

export interface FichaCredito {
  id: number;
  lead_id: number;
  lead_nome?: string;
  banco?: string;
  status?: 'enviada' | 'aprovada' | 'reprovada' | 'pendente';
  valor_financiado?: number;
  entrada?: number;
  parcelas?: number;
  created_at?: string;
  anexos?: string[];
}

export interface Meta {
  id: number;
  vendedor_id: number;
  vendedor_nome?: string;
  mes: number;
  ano: number;
  meta_vendas: number;
  meta_fichas: number;
  realizado_vendas?: number;
  realizado_fichas?: number;
}

export interface Tarefa {
  id: number;
  titulo: string;
  descricao?: string;
  responsavel_id?: number;
  responsavel_nome?: string;
  prazo?: string;
  concluida?: boolean;
  prioridade?: 'baixa' | 'media' | 'alta';
  lead_id?: number | null;
}

export interface ProcessoTransferencia {
  id: number;
  lead_id?: number;
  lead_nome?: string;
  vendedor_origem_id?: number;
  vendedor_destino_id?: number;
  vendedor_origem?: string;
  vendedor_destino?: string;
  status?: 'pendente' | 'aprovado' | 'recusado';
  motivo?: string;
  created_at?: string;
}

export interface ChatMensagem {
  id: number;
  remetente_id: number;
  remetente_nome?: string;
  destinatario_id?: number;
  destinatario_nome?: string;
  conteudo: string;
  created_at: string;
  lida?: boolean;
  anexo_url?: string | null;
}

export interface PainelStats {
  total_leads: number;
  responderam: number;
  fichas_geradas: number;
  aprovados: number;
  vendidos: number;
}
