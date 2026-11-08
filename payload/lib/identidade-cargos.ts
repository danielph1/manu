/** Campos exigidos para cadastrar cargos com acesso administrativo ou documental. */
export const CARGOS_IDENTIDADE=new Set(['gerente','admin','marketing','documentista']);
export function cpfValido(valor:unknown):boolean{
 const cpf=String(valor||'').replace(/\D/g,'');
 if(cpf.length!==11||/(\d)\1{10}/.test(cpf))return false;
 for(const n of [9,10]){
  let soma=0;for(let i=0;i<n;i++)soma+=Number(cpf[i])*(n+1-i);
  const digito=(soma*10)%11===10?0:(soma*10)%11;
  if(Number(cpf[n])!==digito)return false;
 }
 return true;
}
export function nascimentoValido(valor:unknown):boolean{
 const s=String(valor||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(`${s}T00:00:00.000Z`);
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s&&s>='1900-01-01'&&d.getTime()<Date.now();
}
export function nomeCompletoValido(valor:unknown):boolean{
 return String(valor||'').trim().split(/\s+/).filter(x=>x.length>=2).length>=2;
}
