/** Permissões de gerenciamento de identidades; aliases legados não ocultam a ação de desativação. */
export const NIVEIS: Record<string,number>={
  superadmin:1, admin:2, gerente:3, marketing:3,
  vendedor:4, mecanico:4, guariba:4, documentista:4, documento:4,
  elfenai:4, elfen_ai:4, 'elfenaí':4,
};
export const CARGOS_CADASTRAVEIS=['admin','gerente','marketing','documentista','vendedor','mecanico','guariba'] as const;
export function podeGerenciarUsuarios(tipo:string){return ['superadmin','admin','marketing'].includes(String(tipo||'').toLowerCase());}
export function podeCriarCargo(criador:string,destino:string){
  const c=String(criador||'').toLowerCase(),d=String(destino||'').toLowerCase();
  return podeGerenciarUsuarios(c)&&CARGOS_CADASTRAVEIS.includes(d as typeof CARGOS_CADASTRAVEIS[number])&&
    (NIVEIS[c]??99)<(NIVEIS[d]??0);
}
/** Superadmin gerencia qualquer outra conta, incluindo papéis antigos. Nunca desativar a própria conta. */
export function podeAdministrarConta(criador:string,destino:string){
  const c=String(criador||'').toLowerCase(),d=String(destino||'').toLowerCase();
  if(!podeGerenciarUsuarios(c))return false;
  if(c==='superadmin')return true;
  return (NIVEIS[c]??99)<(NIVEIS[d]??0);
}
