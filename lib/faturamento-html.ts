/** Espelho de impressão A4 do modelo de Autorização de Faturamento fornecido pela Manu.
 * A identidade e as cláusulas são sempre carregadas da configuração da empresa emissora.
 */
function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] || c));
}
function v(d: any, k: string) { return esc(d?.[k]); }
function money(d:any,k:string) {
  const val = d?.[k];
  return val == null || val === '' ? '' : Number(val).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function paragraphs(text:unknown) {
  const value=String(text??'').replace(/\\n/g,'\n').replace(/\r/g,'');
  return value.split(/\n+/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('');
}
export function htmlAutorizacao(d: any, e: any) {
  const nome=String(e?.nome_fantasia||e?.empresa_nome||'').trim();
  const manu=/^manu autom[oó]veis$/i.test(nome);
  const logo=e?.logo_url && /^https:\/\/\S+$/i.test(e.logo_url)
    ? `<img class="logo-img" src="${esc(e.logo_url)}" alt="${esc(nome)}">`
    : manu ? `<div class="brand-manu"><i aria-hidden="true">▰▰</i><span><strong>manu</strong><small>automóveis</small></span></div>`
           : `<div class="brand-generica">${esc(nome)}</div>`;
  const trocaModelo=[d?.troca_marca, d?.troca_modelo].filter(Boolean).join(' / ') || d?.troca_marca_modelo || '';
  const endereco=[e?.endereco,e?.bairro && e?.cep ? `${e.bairro} - ${e.cep}` : e?.bairro || e?.cep]
    .filter(Boolean).map(esc).join('<br>');
  const emissor=[esc([nome,e?.razao_social].filter(Boolean).join(' - ')),endereco,
    e?.cnpj ? `CNPJ: ${esc(e.cnpj)}`:'', e?.telefone?`TELEFONE: ${esc(e.telefone)}`:''].filter(Boolean).join('<br>');
  const obs=String(e?.texto_observacoes||'').replace(/\\n/g,'\n').split('\n').filter(Boolean);
  const contrato=String(e?.texto_contrato||'').replace(/\\n/g,'\n');
  const dt= d?.data_assinatura ? new Date(String(d.data_assinatura).slice(0,10)+'T12:00:00') : null;
  const date=dt&&!Number.isNaN(dt.getTime())?dt.toLocaleDateString('pt-BR'):'____ / ____ / ________';
  const tro=(esq:string,esqv:string,dir:string,dirv:string)=>`<tr class="entrada"><td class="cell-half"><b>${esq}</b> ${esqv}</td><td class="cell-half"><b>${dir}</b> ${dirv}</td></tr>`;
  const responsavel=esc(d?.vendedor_nome||'');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorização de Faturamento — ${esc(nome)}</title>
<style>
@page{size:A4 portrait;margin:6mm}
*{box-sizing:border-box}body{margin:0;background:#e8e8e8;color:#101010;font-family:Arial,Helvetica,sans-serif;font-size:8.1px}
.paper{width:198mm;min-height:282mm;margin:12px auto;background:#fff;border:1px solid #444;padding:0;box-shadow:0 4px 25px #0002}
table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #444;vertical-align:middle;padding:3px 3px;overflow-wrap:anywhere}
.mast{height:23mm;display:flex;align-items:center;gap:8px;padding:3mm 3mm 1.5mm}
.mast-logo{width:29%;display:flex;align-items:center;min-width:0}
.logo-img{display:block;max-width:100%;max-height:19mm;object-fit:contain}
.brand-manu{display:flex;align-items:center;gap:5px;font-weight:900;color:#1b1b1b;letter-spacing:-1px;line-height:.72}
.brand-manu i{font-size:29px;transform:skew(-12deg);letter-spacing:-8px;margin-right:5px;font-style:normal}
.brand-manu strong{font-size:25px;letter-spacing:-2px;line-height:1;display:block}
.brand-manu small{font-size:14px;letter-spacing:-.5px;display:block}
.brand-generica{font-size:18px;font-weight:800;line-height:1.03;text-transform:uppercase;overflow-wrap:anywhere}
.mast-title{width:29%;font-size:11px;font-weight:800;text-align:center;white-space:nowrap;text-decoration:underline}
.mast-company{flex:1;text-align:right;font-size:7.5px;line-height:1.18;font-weight:600}
.row-data td{height:8.3mm}.row-data-sm td{height:7mm}.vehicle-head td{text-align:center;font-size:8px;height:5.2mm;font-weight:700}.vehicle-val td{height:5.2mm;text-align:center}
.section th{font-weight:800;height:5.6mm;text-align:center;font-size:9px}.col-title th{text-align:center;height:5mm;text-decoration:underline}.entrada td{height:8.1mm}
.fin-title th{font-weight:800;text-align:center;height:5.3mm}.fin-fields td{height:7mm}
.obs-title th{text-align:center;height:5.6mm;font-size:9px}.obs-row td{min-height:5mm;height:5.3mm;font-weight:600}.blank-row td{height:5.3mm}.discount td{height:5.8mm;font-weight:700}
.legal{padding:3px 4px 0;font-size:9.6px;line-height:1.2;text-align:justify}.legal p{margin:0 0 3px}.ack{margin-top:4mm!important;font-size:8.8px;text-align:justify}
.date{padding:4mm 3px 0;font-size:8px}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:10mm;padding:0 4mm 3mm}.sign{text-align:center;font-size:8px;font-weight:800}.sign:before{content:'';display:block;border-top:1px solid #111;margin-bottom:3px}.sign small{font-size:6.7px;font-weight:400;display:block}
@media screen and (max-width:800px){body{overflow-x:auto}.paper{margin:8px;width:198mm;box-shadow:0 2px 10px #0002}}
@media print{body{background:white}.paper{margin:0;width:100%;min-height:0;border:1px solid #444;box-shadow:none} .no-print{display:none!important}thead{display:table-header-group}}
</style></head><body><main class="paper">
<div class="mast"><div class="mast-logo">${logo}</div><div class="mast-title">AUTORIZAÇÃO DE FATURAMENTO</div><div class="mast-company">${emissor}</div></div>
<table><colgroup><col span="12"></colgroup>
<tr class="row-data"><td colspan="7"><b>NOME:</b> ${v(d,'nome')}</td><td colspan="5"><b>CPF/CNPJ:</b> ${v(d,'cpf_cnpj')}</td></tr>
<tr class="row-data"><td colspan="8"><b>ENDEREÇO:</b> ${v(d,'endereco')}</td><td colspan="4"><b>BAIRRO:</b> ${v(d,'bairro')}</td></tr>
<tr class="row-data-sm"><td colspan="3"><b>CIDADE:</b> ${v(d,'cidade')}</td><td colspan="2"><b>CEP:</b> ${v(d,'cep')}</td><td colspan="4"><b>EMAIL:</b> ${v(d,'email')}</td><td colspan="3"><b>TELEFONE:</b> ${v(d,'telefone')}</td></tr>
</table>
<table><tr class="vehicle-head"><td>MARCA</td><td>MODELO</td><td>ANO/MODELO</td><td>PLACA</td><td>COR</td><td>KILOMETRAGEM</td></tr>
<tr class="vehicle-val"><td>${v(d,'marca')}</td><td>${v(d,'modelo')}</td><td>${v(d,'ano_modelo')}</td><td>${v(d,'placa')}</td><td>${v(d,'cor')}</td><td>${v(d,'kilometragem')}</td></tr></table>
<table><tr class="section"><th colspan="2">I. NEGOCIAÇÃO</th></tr><tr class="col-title"><th>ENTRADA</th><th>EM CASO DE VEÍCULO NA TROCA</th></tr>
${tro('DINHEIRO R$',money(d,'entrada_dinheiro'),'MARCA/MODELO',esc(trocaModelo))}
${tro('CARTÃO DE DÉBITO R$',money(d,'entrada_debito'),'ANO/MODELO',v(d,'troca_ano_modelo'))}
${tro('CARTÃO DE CRÉDITO R$',money(d,'entrada_credito'),'PLACA',v(d,'troca_placa'))}
${tro('TRANSFERÊNCIA/PIX/DEPÓSITO R$',money(d,'entrada_transferencia'),'COR',v(d,'troca_cor'))}
${tro('BOLETO R$',money(d,'entrada_boleto'),'KM',v(d,'troca_km'))}
<tr class="entrada"><td><b>TOTAL DA ENTRADA R$</b> ${money(d,'entrada_total')}</td><td></td></tr>
<tr class="fin-title"><th colspan="2">FINANCIAMENTO</th></tr></table>
<table class="fin"><tr class="fin-fields"><td style="width:34%"><b>BANCO:</b> ${v(d,'fin_banco')}</td><td style="width:32%"><b>QUANT. DE PARCELAS:</b> ${v(d,'fin_parcelas')}</td><td><b>VALOR DA PARCELA R$ :</b> ${money(d,'fin_valor_parcela')}</td></tr></table>
<table><tr class="obs-title"><th>II. OUTRAS OBSERVAÇÕES</th></tr>
${obs.map(o=>`<tr class="obs-row"><td>${esc(o)}</td></tr>`).join('')}
${!obs.length?'<tr class="blank-row"><td> </td></tr>':''}
${Array.from({length:3},()=>'<tr class="blank-row"><td> </td></tr>').join('')}
${d?.observacoes ? `<tr class="obs-row"><td>${v(d,'observacoes')}</td></tr>`:''}
<tr class="discount"><td>FOI CEDIDO UM DESCONTO NO VALOR DE R$ ${Number(d?.desconto_valor||0)>0?money(d,'desconto_valor'):'__________________'}</td></tr></table>
<div class="legal">${paragraphs(contrato)}
<p class="ack">NESTE ATO TOMO CIÊNCIA DO TEOR DO REFERIDO TERMO, QUE ME FOI LIDO E EXPLICADO DE FORMA CLARA E OBJETIVA, CONCORDANDO COM TUDO, E AINDA DECLARO QUE ME FOI ENTREGUE UMA CÓPIA DO REFERIDO TERMO.</p></div>
<div class="date">${esc(e?.local_assinatura || e?.cidade || '')}, ${date}</div>
<div class="signatures"><div class="sign">VENDEDOR<small>${responsavel}</small></div><div class="sign">GERENTE<small>${v(d,'gerente_nome')}</small></div><div class="sign">CLIENTE</div></div>
</main></body></html>`;
}
