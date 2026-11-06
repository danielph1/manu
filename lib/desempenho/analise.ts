/**
 * Inteligência comercial v1. Sem PII, sem rankings punitivos.
 * "Qualidade cadastral" NÃO é intenção de compra; conversão não prova causalidade.
 */
export type Linha = {
  vendedor_id: number; vendedor: string; loja: string | null; origem: string;
  leads: number; respondidos: number; fichas: number; aprovados: number; vendas: number;
  maduros: number; vendas_maduros: number; respondidos_maduros: number; fichas_maduros: number;
  completude_total: number; transferidos: number;
};
export type Agregado = Omit<Linha,'vendedor_id'|'vendedor'|'loja'|'origem'>;
export type Vendedor = { id:number; nome:string; loja:string|null };
export type ResultadoVendedor = Vendedor & Agregado & {
  taxa_resposta: number|null; taxa_ficha:number|null; taxa_aprovacao:number|null;
  taxa_venda:number|null; taxa_venda_maduros:number|null; qualidade_cadastral:number|null;
  esperado_mesma_origem:number|null; diferenca_esperada_pp:number|null;
  cobertura_comparacao:number|null; sinal:string; confianca:'limitada'|'comparavel';
  por_origem: Array<{origem:string}&Agregado>;
};
export type ResultadoOrigem = {origem:string}&Agregado&{
  vendedores_com_amostra:number; taxa_venda:number|null; taxa_venda_maduros:number|null;
  taxa_ficha:number|null; taxa_aprovacao:number|null; qualidade_cadastral:number|null;
  sinal:string;
};
const ZERO: Agregado = {leads:0,respondidos:0,fichas:0,aprovados:0,vendas:0,
  maduros:0,vendas_maduros:0,respondidos_maduros:0,fichas_maduros:0,
  completude_total:0,transferidos:0};
const keys: Array<keyof Agregado> = Object.keys(ZERO) as Array<keyof Agregado>;
const soma = (a: Agregado, r: Agregado) => {for (const k of keys) a[k] += Number(r[k]||0);return a;};
const vazio = () => ({...ZERO});
const taxa = (a:number,b:number): number|null => b>0?a/b:null;
const pp = (a:number,b:number) => Math.round((a-b)*1000)/10;
const normalizarOrigem=(x:string)=>String(x||'Não identificada').trim().slice(0,100)||'Não identificada';
export function analisarDesempenho(linhas:Linha[],cadastro:Vendedor[]) {
  const total = vazio();
  const byOrigem = new Map<string,ResultadoOrigem>();
  const sellers = new Map<number,ResultadoVendedor>();
  for (const c of cadastro) sellers.set(c.id,{
    ...c,...vazio(),taxa_resposta:null,taxa_ficha:null,taxa_aprovacao:null,taxa_venda:null,
    taxa_venda_maduros:null,qualidade_cadastral:null,esperado_mesma_origem:null,
    diferenca_esperada_pp:null,cobertura_comparacao:null,sinal:'',confianca:'limitada',por_origem:[],
  });
  for (const r of linhas) {
    if (!sellers.has(r.vendedor_id)) sellers.set(r.vendedor_id,{
      id:r.vendedor_id,nome:r.vendedor,loja:r.loja,...vazio(),taxa_resposta:null,
      taxa_ficha:null,taxa_aprovacao:null,taxa_venda:null,taxa_venda_maduros:null,
      qualidade_cadastral:null,esperado_mesma_origem:null,diferenca_esperada_pp:null,
      cobertura_comparacao:null,sinal:'',confianca:'limitada',por_origem:[],
    });
    const seller=sellers.get(r.vendedor_id)!;
    soma(seller,r);seller.por_origem.push({origem:normalizarOrigem(r.origem),...Object.fromEntries(keys.map(k=>[k,Number(r[k]||0)]))} as {origem:string}&Agregado);
    const origem=normalizarOrigem(r.origem);
    if (!byOrigem.has(origem)) byOrigem.set(origem,{
      origem,...vazio(),vendedores_com_amostra:0,taxa_venda:null,taxa_venda_maduros:null,
      taxa_ficha:null,taxa_aprovacao:null,qualidade_cadastral:null,sinal:'',
    });
    const src=byOrigem.get(origem)!;
    soma(src,r);if(r.maduros>=10)src.vendedores_com_amostra++;
    soma(total,r);
  }
  const origemLista=[...byOrigem.values()];
  for (const src of origemLista) {
    src.taxa_venda=taxa(src.vendas,src.leads);
    src.taxa_venda_maduros=taxa(src.vendas_maduros,src.maduros);
    src.taxa_ficha=taxa(src.fichas,src.leads);
    src.taxa_aprovacao=taxa(src.aprovados,src.fichas);
    src.qualidade_cadastral=src.leads?Math.round(src.completude_total/src.leads):null;
    const paresN=total.maduros-src.maduros;
    const paresVendas=total.vendas_maduros-src.vendas_maduros;
    const taxaPares=taxa(paresVendas,paresN);
    const dispersao=taxaPares===null?0:Math.sqrt(src.maduros*taxaPares*(1-taxaPares));
    const z=dispersao>0?(src.vendas_maduros-src.maduros*(taxaPares||0))/dispersao:0;
    if(src.maduros<40||paresN<40||src.vendedores_com_amostra<3||taxaPares===null||src.taxa_venda_maduros===null)
      src.sinal='Amostra insuficiente para avaliar a origem';
    else if(src.taxa_venda_maduros<taxaPares*0.7 && taxaPares-src.taxa_venda_maduros>=0.04 && z < -1.96)
      src.sinal='Conversão inferior a outras origens — investigar canal, campanha e perfil';
    else src.sinal='Sem diferença consistente para indicar origem inferior';
  }
  const sellerList=[...sellers.values()];
  for (const s of sellerList) {
    s.taxa_resposta=taxa(s.respondidos,s.leads); s.taxa_ficha=taxa(s.fichas,s.leads);
    s.taxa_aprovacao=taxa(s.aprovados,s.fichas);s.taxa_venda=taxa(s.vendas,s.leads);
    s.taxa_venda_maduros=taxa(s.vendas_maduros,s.maduros);
    s.qualidade_cadastral=s.leads?Math.round(s.completude_total/s.leads):null;
    let cobertura=0,esperado=0,observado=0,variancia=0;
    for(const own of s.por_origem){
      const base=byOrigem.get(own.origem)!;
      const peerN=base.maduros-own.maduros;
      const peerSales=base.vendas_maduros-own.vendas_maduros;
      // Comparar somente com outros vendedores da MESMA origem, sem auto-referência.
      if(peerN<20 || own.maduros<1)continue;
      cobertura+=own.maduros;
      const p=peerSales/peerN;
      esperado+=own.maduros*p;
      variancia+=own.maduros*p*(1-p);
      observado+=own.vendas_maduros;
    }
    s.cobertura_comparacao=taxa(cobertura,s.maduros);
    s.esperado_mesma_origem=cobertura>0?Math.round(esperado*10)/10:null;
    s.diferenca_esperada_pp=cobertura>0?pp(observado/cobertura,esperado/cobertura):null;
    const suficiente=s.maduros>=30 && cobertura/s.maduros>=0.75 && esperado>=3;
    const z=variancia>0?(observado-esperado)/Math.sqrt(variancia):0;
    s.confianca=suficiente?'comparavel':'limitada';
    if(!suficiente) s.sinal='Sem amostra suficiente para comparar por origem';
    else if(z < -1.96 && observado/cobertura < esperado/cobertura-0.06 && observado < esperado*0.70)
      s.sinal='Conversão abaixo de pares da mesma origem — revisar atendimento e condições';
    else if(z > 1.96 && observado/cobertura > esperado/cobertura+0.06 && observado > esperado*1.30)
      s.sinal='Conversão acima de pares da mesma origem neste período';
    else s.sinal='Conversão próxima dos pares com origens semelhantes';
    if(s.transferidos>0) s.sinal+=' · carteira inclui leads transferidos';
    s.por_origem.sort((a,b)=>b.leads-a.leads);
  }
  sellerList.sort((a,b)=>b.leads-a.leads||a.nome.localeCompare(b.nome));
  origemLista.sort((a,b)=>b.leads-a.leads||a.origem.localeCompare(b.origem));
  const diagnosticos:string[]=[];
  if(total.leads===0)diagnosticos.push('Não há leads para o período e empresa selecionados.');
  else {
    const unknown=byOrigem.get('Não identificada')?.leads||0;
    if(unknown/total.leads>0.20)diagnosticos.push(`${Math.round(unknown/total.leads*100)}% dos leads não têm origem identificada. Corrija a captura da fonte antes de comparar campanhas.`);
    if(total.maduros<50)diagnosticos.push('Menos de 50 leads com 30 dias de maturação: a análise de vendas pode oscilar bastante.');
    if(total.transferidos>0)diagnosticos.push(`${total.transferidos} leads da carteira tiveram transferência registrada. O resultado é associado ao responsável atual; não representa mérito exclusivo dele.`);
    const low=origemLista.filter(x=>x.sinal.startsWith('Conversão inferior'));
    if(low.length)diagnosticos.push(`Investigar as origens: ${low.slice(0,3).map(x=>x.origem).join(', ')}. Menor conversão observada não comprova leads ruins.`);
    if(sellerList.some(x=>x.sinal.startsWith('Conversão abaixo')))diagnosticos.push('Há vendedor(es) abaixo da referência de origem. Audite tempo de resposta, tentativas e processo comercial antes de atribuir responsabilidade.');
    if(!low.length&&!sellerList.some(x=>x.sinal.startsWith('Conversão abaixo')))diagnosticos.push('Não há evidência estatística suficiente para apontar exclusivamente vendedores ou canais como causa do resultado.');
  }
  return {total,funil:{
    resposta:taxa(total.respondidos,total.leads),ficha:taxa(total.fichas,total.leads),
    aprovacao:taxa(total.aprovados,total.fichas),venda:taxa(total.vendas,total.leads),
    venda_maduros:taxa(total.vendas_maduros,total.maduros),
  },vendedores:sellerList,origens:origemLista,diagnosticos};
}
