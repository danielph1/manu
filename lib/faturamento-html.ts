function v(d: any, k: string, pad = '') {
  const val = d?.[k];
  if (val == null || val === '' || String(val).toLowerCase() === 'nan') return pad;
  return String(val);
}
function money(d: any, k: string) {
  const n = Number(d?.[k] || 0);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function htmlAutorizacao(d: any) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Autorização de Faturamento</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #222; padding: 3px 5px; vertical-align: top; }
  .nob td { border: none; }
  .titulo { text-align: center; font-size: 15px; font-weight: bold; letter-spacing: 0.5px; }
  .secao { background: #eee; font-weight: bold; text-align: center; }
  .logo { font-size: 18px; font-weight: bold; }
  .logo span { color: #c00; }
  .assin { border: none; text-align: center; padding-top: 28px; }
  .mini { font-size: 8px; line-height: 1.25; }
  @media print { .no-print { display: none !important; } }
</style></head><body>
<table class="nob" style="margin-bottom:6px"><tr>
  <td style="width:28%"><div class="logo"><span>manu</span> automóveis</div><div>MANU AUTOMÓVEIS - RLINE AUTOMÓVEIS LTDA</div></td>
  <td class="titulo">AUTORIZAÇÃO DE FATURAMENTO</td>
  <td style="width:30%; font-size:9px; text-align:right">
    EST. INTENDENTE MAGALHÃES, 381<br/>OSWALDO CRUZ - 21310-790<br/>
    CNPJ: 59.548.124/0001-59<br/>TELEFONE (21) 3283-7207
  </td>
</tr></table>
<table>
  <tr><td colspan="4"><b>NOME:</b> ${v(d,'nome')}</td><td colspan="2"><b>CPF/CNPJ:</b> ${v(d,'cpf_cnpj')}</td></tr>
  <tr><td colspan="4"><b>ENDEREÇO:</b> ${v(d,'endereco')}</td><td colspan="2"><b>BAIRRO:</b> ${v(d,'bairro')}</td></tr>
  <tr>
    <td colspan="2"><b>CIDADE:</b> ${v(d,'cidade')}</td>
    <td><b>CEP:</b> ${v(d,'cep')}</td>
    <td><b>EMAIL:</b> ${v(d,'email')}</td>
    <td colspan="2"><b>TELEFONE:</b> ${v(d,'telefone')}</td>
  </tr>
  <tr>
    <td><b>MARCA</b><br/>${v(d,'marca')}</td>
    <td><b>MODELO</b><br/>${v(d,'modelo')}</td>
    <td><b>ANO/MODELO</b><br/>${v(d,'ano_modelo')}</td>
    <td><b>PLACA</b><br/>${v(d,'placa')}</td>
    <td><b>COR</b><br/>${v(d,'cor')}</td>
    <td><b>KILOMETRAGEM</b><br/>${v(d,'kilometragem')}</td>
  </tr>
</table>
<table style="margin-top:6px">
  <tr><td class="secao" colspan="2">I. NEGOCIAÇÃO</td></tr>
  <tr>
    <td style="width:50%">
      <b>ENTRADA</b><br/>
      DINHEIRO R$ ${money(d,'entrada_dinheiro')}<br/>
      CARTÃO DE DÉBITO R$ ${money(d,'entrada_debito')}<br/>
      CARTÃO DE CRÉDITO R$ ${money(d,'entrada_credito')}<br/>
      TRANSFERÊNCIA/PIX/DEPÓSITO R$ ${money(d,'entrada_transferencia')}<br/>
      BOLETO R$ ${money(d,'entrada_boleto')}<br/>
      <b>TOTAL DA ENTRADA R$ ${money(d,'entrada_total')}</b>
    </td>
    <td style="width:50%">
      <b>EM CASO DE VEÍCULO NA TROCA</b><br/>
      MARCA/MODELO: ${v(d,'troca_marca_modelo')}<br/>
      ANO/MODELO: ${v(d,'troca_ano_modelo')}<br/>
      PLACA: ${v(d,'troca_placa')}<br/>
      COR: ${v(d,'troca_cor')}<br/>
      KM: ${v(d,'troca_km')}
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <b>FINANCIAMENTO</b><br/>
      BANCO: ${v(d,'fin_banco')} &nbsp;&nbsp;
      QUANT. DE PARCELAS: ${v(d,'fin_parcelas')} &nbsp;&nbsp;
      VALOR DA PARCELA R$: ${money(d,'fin_valor_parcela')}
    </td>
  </tr>
</table>
<table style="margin-top:6px">
  <tr><td class="secao">II. OUTRAS OBSERVAÇÕES</td></tr>
  <tr><td>
    IPVA 2026 POR CONTA DO: ${d.ipva_conta_loja ? 'LOJA' : 'CLIENTE'}<br/>
    TRANSFERÊNCIA POR CONTA D${d.transferencia_conta_loja ? 'A LOJA' : 'O CLIENTE'}<br/>
    GARANTIA DE MOTOR E CAIXA DE MARCHA POR 90 DIAS OU 3 MIL KM RODADOS (KM A PARTIR DA SAÍDA DA LOJA)<br/>
    FOI CEDIDO UM DESCONTO NO VALOR DE R$ ${money(d,'desconto_valor')}<br/>
    ${v(d,'observacoes')}
  </td></tr>
</table>
<p class="mini">
  Pelo presente instrumento e na melhor forma de direito a empresa declara, sob penas da lei, que foram realizadas todas as manutenções e revisões necessárias informadas no check list no veículo acima descrito.<br/>
  A empresa RLINE AUTOMÓVEIS LTDA informa ao comprador que se obriga contratualmente apenas com a GARANTIA DO MOTOR E DA CAIXA DE MARCHA do veículo adquirido, se desonerando dos demais itens, com a devida ciência do adquirente.<br/>
  A empresa informa ao comprador que o mesmo tem por lei um prazo decadencial de 90 (noventa) dias ou 3.000 KM o que ocorrer primeiro, para reclamar de vícios (defeitos) aparentes, na forma do artigo 26, inciso II, do código de defesa do consumidor.<br/>
  CIÊNCIA DO ADQUIRENTE — Na oportunidade, o comprador declara, sob as penas da lei, que está de acordo com o perfeito estado do veículo adquirido, tendo sido testado todos os itens mencionados no CHECK LIST na presença do mesmo, nada tendo a reclamar. Cabe ressaltar ainda que as peças que sofrem desgastes naturais em função do uso, deverão ser substituídas periodicamente de acordo com as especificações do fabricante (embreagem, pastilhas de freio, vela de ignição, correias, amortecedores, suspensão, etc). Tais custos serão suportados pelo comprador.
</p>
<p class="mini">NESTE ATO TOMO CIÊNCIA DO TEOR DO REFERIDO TERMO, QUE ME FOI LIDO E EXPLICADO DE FORMA CLARA E OBJETIVA, CONCORDANDO COM TUDO, E AINDA DECLARO QUE ME FOI ENTREGUE UMA CÓPIA DO REFERIDO TERMO.</p>
<p>Rio de Janeiro, ______ / ______ / __________</p>
<table class="nob"><tr>
  <td class="assin">_________________________<br/>VENDEDOR<br/><b>${v(d,'vendedor_nome')}</b></td>
  <td class="assin">_________________________<br/>GERENTE</td>
  <td class="assin">_________________________<br/>CLIENTE</td>
</tr></table>
</body></html>`;
}
