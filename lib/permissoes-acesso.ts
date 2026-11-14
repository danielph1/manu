/** Matriz unica de acesso entre menu, telas e APIs. Nao substitui isolamento de empresa/lead. */
export const CARGOS_LEADS = ['superadmin','admin','gerente','marketing','vendedor'] as const;
export const CARGOS_CONVERSAS = ['superadmin','admin','gerente','marketing','vendedor'] as const;
export const CARGOS_FICHAS = ['superadmin','admin','gerente','marketing','vendedor','elfenai','elfen_ai','elfenaí'] as const;
export const CARGOS_FATURAMENTO = ['superadmin','admin','gerente','marketing','vendedor','documentista','documento'] as const;
export const CARGOS_TRANSFERENCIAS = ['superadmin','admin','gerente','vendedor','documentista','documento'] as const;

export type AreaRestrita = 'leads' | 'conversas' | 'fichas' | 'faturamento' | 'transferencias';
const grupos: Record<AreaRestrita, readonly string[]> = {
  leads: CARGOS_LEADS, conversas: CARGOS_CONVERSAS, fichas: CARGOS_FICHAS,
  faturamento: CARGOS_FATURAMENTO, transferencias: CARGOS_TRANSFERENCIAS,
};
export function permiteArea(papel: unknown, area: AreaRestrita): boolean {
  return grupos[area].includes(String(papel || '').trim().toLowerCase());
}
function comecaEm(caminho: string, prefixo: string): boolean {
  return caminho === prefixo || caminho.startsWith(prefixo + '/');
}
export function areaDaRota(caminho: string): AreaRestrita | null {
  // O prefixo de API vem antes das paginas: nao existe redirecionamento por substring.
  if (comecaEm(caminho, '/api/chat') || comecaEm(caminho, '/chat')) return 'conversas';
  if (comecaEm(caminho, '/api/fichas') || comecaEm(caminho, '/fichas')) return 'fichas';
  if (comecaEm(caminho, '/api/faturamento') || comecaEm(caminho, '/faturamento')) return 'faturamento';
  if (comecaEm(caminho, '/api/processos') || comecaEm(caminho, '/processos')) return 'transferencias';
  if (comecaEm(caminho, '/api/leads') || comecaEm(caminho, '/painel') || comecaEm(caminho, '/novo-lead')) return 'leads';
  return null;
}
export function permiteRota(papel: unknown, caminho: string): boolean {
  const area = areaDaRota(caminho);
  return area === null || permiteArea(papel, area);
}
