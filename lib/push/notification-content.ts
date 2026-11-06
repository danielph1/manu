/** Conteúdo seguro para notificações push na tela bloqueada.
 * Nunca colocar nome/telefone/CPF ou mensagem de cliente aqui.
 * A tela autenticada do MANU mantém os detalhes completos.
 */
export type PushCategory = 'leads'|'estoque'|'oficina'|'conquistas'|'tarefas'|'metas'|
  'fichas'|'faturamento'|'vendas'|'chat'|'geral';

export function pushCategory(value: unknown): PushCategory {
  const t=String(value||'').trim().toLowerCase();
  if(/lead|triagem|distribu|transfer/.test(t))return 'leads';
  if(/chat|mensagem|whatsapp/.test(t))return 'chat';
  if(/tarefa/.test(t))return 'tarefas';
  if(/meta|goal/.test(t))return 'metas';
  if(/ficha|cr[eé]dito/.test(t))return 'fichas';
  if(/fatura|financeir|comprovante/.test(t))return 'faturamento';
  if(/venda/.test(t))return 'vendas';
  if(/estoque|ve[ií]culo/.test(t))return 'estoque';
  if(/oficina|servi[cç]o/.test(t))return 'oficina';
  if(/conquista|pr[eê]mio|ranking/.test(t))return 'conquistas';
  return 'geral';
}

const CONTENT: Record<PushCategory,{title:string;body:string;url:string}> = {
  leads:{title:'Aurox · Lead',body:'Há uma atualização de lead ou triagem.',url:'/painel'},
  estoque:{title:'Aurox · Estoque',body:'Há uma atualização no estoque.',url:'/estoque'},
  oficina:{title:'Aurox · Oficina',body:'Há uma atualização na oficina.',url:'/oficina'},
  conquistas:{title:'Aurox · Conquista',body:'Você tem uma atualização de conquista.',url:'/ranking'},
  tarefas:{title:'Aurox · Nova tarefa',body:'Uma tarefa foi atribuída ou atualizada.',url:'/tarefas'},
  metas:{title:'Aurox · Nova meta',body:'Uma meta foi atribuída ou atualizada.',url:'/metas'},
  fichas:{title:'Aurox · Ficha de crédito',body:'Há uma atualização em uma ficha.',url:'/fichas'},
  faturamento:{title:'Aurox · Faturamento',body:'Há uma atualização de faturamento.',url:'/faturamento'},
  vendas:{title:'Aurox · Venda',body:'Há uma atualização de venda.',url:'/painel'},
  chat:{title:'Aurox · Mensagem',body:'Há uma nova mensagem ou atualização de conversa.',url:'/chat'},
  geral:{title:'Aurox · Aviso',body:'Você tem um novo aviso no sistema.',url:'/painel'},
};
export function pushContent(value: unknown): {category:PushCategory;title:string;body:string;url:string} {
  const category=pushCategory(value);
  return {category,...CONTENT[category]};
}
