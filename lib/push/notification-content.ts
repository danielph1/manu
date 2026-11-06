/**
 * Exibição dos avisos Push na tela bloqueada.
 * Não usar texto livre de mensagens/tarefas/leads: podem conter dados pessoais.
 * O tipo e o título de origem são usados apenas para classificar o aviso.
 */
export type PushCategory = 'leads' | 'estoque' | 'oficina' | 'conquistas' | 'tarefas' |
  'metas' | 'fichas' | 'faturamento' | 'vendas' | 'chat' | 'geral';

export interface PushContent {
  category: PushCategory;
  title: string;
  body: string;
  url: string;
}

const CONTENT: Record<PushCategory, Omit<PushContent, 'category'>> = {
  leads: { title: 'Aurox · Leads', body: 'Origem: Leads. Há um novo atendimento ou atualização.', url: '/painel' },
  estoque: { title: 'Aurox · Estoque', body: 'Origem: Estoque. Um veículo ou anúncio foi atualizado.', url: '/estoque' },
  oficina: { title: 'Aurox · Oficina', body: 'Origem: Oficina. Há uma atualização de serviço.', url: '/oficina' },
  conquistas: { title: 'Aurox · Conquistas', body: 'Origem: Conquistas. Há uma atualização para você.', url: '/ranking' },
  tarefas: { title: 'Aurox · Tarefas', body: 'Origem: Tarefas. Uma tarefa foi criada ou atualizada.', url: '/tarefas' },
  metas: { title: 'Aurox · Metas', body: 'Origem: Metas. Uma meta foi atribuída ou atualizada.', url: '/metas' },
  fichas: { title: 'Aurox · Fichas de crédito', body: 'Origem: Fichas. Há uma atualização de ficha.', url: '/fichas' },
  faturamento: { title: 'Aurox · Faturamento', body: 'Origem: Faturamento. Há uma atualização de documento.', url: '/faturamento' },
  vendas: { title: 'Aurox · Vendas', body: 'Origem: Vendas. Uma venda foi atualizada.', url: '/painel' },
  chat: { title: 'Aurox · Chat / WhatsApp', body: 'Origem: Chat. Há uma nova mensagem ou atualização.', url: '/chat' },
  geral: { title: 'Aurox · Avisos', body: 'Origem: Sistema. Há uma nova atualização.', url: '/painel' },
};

export function describeAuroxPush(tipo: unknown, titulo: unknown): PushContent {
  const t = String(tipo || '').trim().toLowerCase();
  const title = String(titulo || '').trim().toLowerCase();
  let category: PushCategory = 'geral';
  if (/lead|triagem|distribui|transfer[eê]ncia/.test(t)) category = 'leads';
  else if (/chat|mensagem|whatsapp/.test(t)) category = 'chat';
  else if (/tarefa/.test(t)) category = 'tarefas';
  else if (/meta|goal/.test(t)) category = 'metas';
  else if (/ficha|cr[eé]dito/.test(t)) category = 'fichas';
  else if (/fatur|financeiro|comprovante/.test(t)) category = 'faturamento';
  else if (/venda/.test(t)) category = 'vendas';
  else if (/estoque|an[uú]ncio|ve[ií]culo/.test(t)) category = 'estoque';
  else if (/oficina|mec[aâ]nic|servi[cç]o/.test(t)) category = 'oficina';
  else if (/conquista|pr[eê]mio|ranking/.test(t)) category = 'conquistas';
  else if (/teste/.test(t)) return { category: 'geral', title: 'Aurox · Teste Push', body: 'Origem: Teste de notificações. O aviso foi recebido.', url: '/configuracoes/notificacoes' };

  // Diferencia a triagem do lead, sem exibir conteúdo pessoal do título original.
  if (category === 'leads' && /triagem/.test(t + ' ' + title)) {
    return { category, title: 'Aurox · Triagem', body: 'Origem: Triagem. Há um contato aguardando atendimento.', url: '/triagem' };
  }
  return { category, ...CONTENT[category] };
}
