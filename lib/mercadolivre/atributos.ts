/** Metadados oficiais por categoria. Não presumir que todos os veículos exigem os mesmos campos. */
export const CATEGORIAS_VEICULOS = [
  { id:'MLB1744', nome:'Carros e caminhonetes' },
  { id:'MLB1763', nome:'Motos e scooters' },
  { id:'MLB5839', nome:'Caminhões' },
  { id:'MLB7370', nome:'Motorhomes' },
  { id:'MLB47400', nome:'Ônibus' },
  { id:'MLB1785', nome:'Náutica' },
] as const;
export type MLValor = { id?:string; name:string };
export type MLAtributo = {
  id: string; name: string; required: boolean; conditional: boolean;
  value_type: string; values: MLValor[];
};
const categoriaValida = new Set<string>(CATEGORIAS_VEICULOS.map(c=>c.id));
export const isCategoriaVeiculo = (id:string) => categoriaValida.has(id);
export function categoriaVeiculo(carroceria:unknown):string {
  const s=String(carroceria||'').toLowerCase();
  if (/moto|scooter|motocicleta/.test(s)) return 'MLB1763';
  if (/caminh[aã]o/.test(s))return 'MLB5839';
  if (/motorhome/.test(s))return 'MLB7370';
  if (/[oô]nibus/.test(s))return 'MLB47400';
  if (/barco|n[aá]utic/.test(s))return 'MLB1785';
  return 'MLB1744';
}
export async function buscarAtributosML(token:string, categoria:string):Promise<MLAtributo[]> {
  if(!isCategoriaVeiculo(categoria))throw new Error('Categoria de veículo não permitida.');
  const r = await fetch(`https://api.mercadolibre.com/categories/${categoria}/attributes`, {
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(16000),
  });
  if(!r.ok)throw new Error(`Mercado Livre não disponibilizou os atributos (HTTP ${r.status}).`);
  const data = await r.json();
  if(!Array.isArray(data))throw new Error('Resposta de atributos inválida.');
  return data.filter((a:any)=>a&&typeof a.id==='string' && (a.tags?.required===true || a.tags?.conditional_required===true || ['TRIM','KILOMETERS','FUEL_TYPE','DOORS'].includes(a.id)))
    .map((a:any)=>({
      id:String(a.id),name:String(a.name||a.id),required:a.tags?.required===true,
      conditional:a.tags?.conditional_required===true,value_type:String(a.value_type||'string'),
      values:Array.isArray(a.values)?a.values.filter((x:any)=>x&&x.id&&x.name).slice(0,150).map((x:any)=>({id:String(x.id),name:String(x.name)})):[],
    }));
}
