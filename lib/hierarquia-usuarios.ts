/** Nível menor significa mais privilégio. Somente os cargos 1, 2 e marketing podem gerenciar contas. */
export const NIVEIS: Record<string, number> = {
  superadmin: 1, admin: 2, gerente: 3, marketing: 3,
  vendedor: 4, mecanico: 4, guariba: 4,
};
export const CARGOS_CADASTRAVEIS = ['admin','gerente','marketing','vendedor','mecanico','guariba'] as const;
export function podeGerenciarUsuarios(tipo: string) {
  return ['superadmin','admin','marketing'].includes(String(tipo||'').toLowerCase());
}
export function podeCriarCargo(criador: string, destino: string): boolean {
  const c=String(criador||'').toLowerCase(), d=String(destino||'').toLowerCase();
  return podeGerenciarUsuarios(c) && CARGOS_CADASTRAVEIS.includes(d as typeof CARGOS_CADASTRAVEIS[number]) && NIVEIS[d]>NIVEIS[c];
}
