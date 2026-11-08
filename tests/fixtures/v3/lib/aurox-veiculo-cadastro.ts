/** Normalização e validação do cadastro de veículos. Não incorpora regras específicas de cada portal. */
export const CAMPOS_OPCIONAIS = [
  'tipo_veiculo','condicao','ano_modelo','versao','combustivel','cambio','portas',
  'km','carroceria','chassi','renavam','numero_motor','consignado','observacoes',
] as const;
export function prepararVeiculo(raw: Record<string,unknown>) {
  const marca=String(raw.marca||'').trim().slice(0,90);
  const modelo=String(raw.modelo||'').trim().slice(0,120);
  const placa=String(raw.placa||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
  const ano=Number(raw.ano);const preco=Number(raw.preco);
  const agora=new Date().getFullYear();
  if(!marca||!modelo||marca.length<2||modelo.length<2)throw new Error('Marca e modelo são obrigatórios.');
  if(!Number.isInteger(ano)||ano<1900||ano>agora+2)throw new Error('Ano de fabricação inválido.');
  if(!Number.isFinite(preco)||preco<=0||preco>1000000000)throw new Error('Informe um preço de venda válido, maior que zero.');
  if(placa && !/^[A-Z0-9]{7}$/.test(placa))throw new Error('A placa informada é inválida. Deixe vazia caso ainda não tenha esse dado.');
  const detalhes:Record<string,unknown>={};
  for(const campo of CAMPOS_OPCIONAIS){const v=raw[campo];
    if(v==null||String(v).trim()==='')continue;
    if(campo==='ano_modelo'||campo==='km'){
      const n=Number(v);if(!Number.isInteger(n)||n<0||(campo==='ano_modelo'&&(n<ano||n>ano+3)))throw new Error(`${campo} inválido.`);
      detalhes[campo]=n;
    }else detalhes[campo]=String(v).slice(0,campo==='observacoes'?2000:160);
  }
  if(detalhes.condicao&&!['novo','usado','seminovo'].includes(String(detalhes.condicao)))throw new Error('Condição do veículo inválida.');
  if(detalhes.tipo_veiculo&&!['carro','moto','caminhao','utilitario'].includes(String(detalhes.tipo_veiculo)))throw new Error('Tipo de veículo inválido.');
  const caracs=Array.isArray(raw.caracteristicas)?raw.caracteristicas:[];
  detalhes.caracteristicas=[...new Set(caracs.filter((x):x is string=>typeof x==='string').map(s=>s.trim().slice(0,70)).filter(Boolean))].slice(0,60);
  return { marca,modelo,placa:placa||null,ano,preco,cor:String(raw.cor||'').trim().slice(0,60),detalhes };
}
