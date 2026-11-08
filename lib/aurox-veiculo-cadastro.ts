/** Validação de cadastro interno — não equivale à aprovação da publicação em portais. */
export const CAMPOS_OPCIONAIS = [
 'tipo_veiculo','condicao','ano_modelo','versao','combustivel','cambio','portas','km',
 'carroceria','chassi','renavam','numero_motor','consignado','observacoes',
 'preco_classificados','usar_preco_site','usar_observacao_classificados','observacao_classificados',
 'nao_exibir_km','cor',
] as const;
export function prepararVeiculo(raw: Record<string,unknown>) {
 const marca=String(raw.marca||'').trim().slice(0,90);
 const modelo=String(raw.modelo||'').trim().slice(0,120);
 const placa=String(raw.placa||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
 const ano=Number(raw.ano);const preco=Number(raw.preco);
 const agora=new Date().getFullYear();
 if(marca.length<2||modelo.length<2)throw new Error('Marca e modelo são obrigatórios.');
 if(!Number.isInteger(ano)||ano<1900||ano>agora+2)throw new Error('Ano de fabricação inválido.');
 if(!Number.isFinite(preco)||preco<=0||preco>1000000000)throw new Error('Informe um preço de venda válido, maior que zero.');
 if(placa&&!/^[A-Z0-9]{7}$/.test(placa))throw new Error('Placa inválida. Deixe-a vazia se ainda não tiver essa informação.');
 const detalhes:Record<string,unknown>={};
 for(const campo of CAMPOS_OPCIONAIS){const valor=raw[campo];if(valor==null||String(valor).trim()==='')continue;
  if(campo==='ano_modelo'||campo==='km'){
   const n=Number(valor);if(!Number.isSafeInteger(n)||n<0||(campo==='ano_modelo'&&(n<ano||n>ano+3)))throw new Error(`${campo} inválido.`);detalhes[campo]=n;
  }else if(campo==='preco_classificados'){
   const n=Number(String(valor).replace(',','.'));if(!Number.isFinite(n)||n<=0||n>1000000000)throw new Error('Preço para classificados inválido.');detalhes[campo]=n;
  }else if(['usar_preco_site','usar_observacao_classificados','nao_exibir_km'].includes(campo)){
   if(typeof valor!=='boolean')throw new Error(`${campo} deve ser uma opção verdadeira ou falsa.`);detalhes[campo]=valor;
  }else detalhes[campo]=String(valor).trim().slice(0,campo.includes('observa')?3000:160);
 }
 if(detalhes.condicao&&!['novo','usado','seminovo'].includes(String(detalhes.condicao)))throw new Error('Condição inválida.');
 if(detalhes.tipo_veiculo&&!['carro','moto','caminhao','utilitario'].includes(String(detalhes.tipo_veiculo)))throw new Error('Tipo inválido.');
 const features=Array.isArray(raw.caracteristicas)?raw.caracteristicas:[];
 const options=Array.isArray(raw.opcionais)?raw.opcionais:[];
 const safe=(arr:unknown[])=>[...new Set(arr.filter((v):v is string=>typeof v==='string').map(v=>v.trim().slice(0,70)).filter(Boolean))].slice(0,100);
 detalhes.caracteristicas=safe(features);detalhes.opcionais=safe(options);
 const portais=raw.portais_detalhes;
 if(portais&&typeof portais==='object'&&!Array.isArray(portais)){
  const allowed=['olx','facebook','webmotors','icarros','mercadolivre','napista'];
  const mapped:Record<string,{preco:number|null;observacao:string}>={};
  for(const [portal,val] of Object.entries(portais)){
   if(!allowed.includes(portal)||!val||typeof val!=='object'||Array.isArray(val))continue;
   const p=val as Record<string,unknown>;let n:number|null=null;
   if(p.preco!=null&&String(p.preco).trim()!==''){
    n=Number(String(p.preco).replace(',','.'));if(!Number.isFinite(n)||n<=0||n>1000000000)throw new Error('Preço específico de portal inválido.');
   }
   mapped[portal]={preco:n,observacao:String(p.observacao||'').trim().slice(0,3000)};
  }
  detalhes.portais_detalhes=mapped;
 }
 // Campos de vídeo não pertencem a este cadastro nem são persistidos.
 return {marca,modelo,placa:placa||null,ano,preco,cor:String(raw.cor||'').trim().slice(0,60),detalhes};
}
