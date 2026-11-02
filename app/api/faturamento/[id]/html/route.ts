import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { obterEmissor, obterFaturamentoPermitido } from '@/lib/faturamento-empresa';
import { htmlAutorizacao } from '@/lib/faturamento-html';
import { ensureAnexos, listarAnexos } from '@/lib/anexos';
export const runtime='nodejs';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const u=await requireUser(req);
  if(!u)return NextResponse.json({error:'não autenticado'},{status:401});
  const {id}=await params;
  try {
    const row=await obterFaturamentoPermitido(Number(id),u);
    if(!row)return NextResponse.json({error:'Documento não encontrado nesta empresa'},{status:404});
    const emissor=await obterEmissor(Number(row.empresa_id));
    if(!emissor || !emissor.razao_social || !emissor.cnpj || !emissor.texto_contrato)
      return NextResponse.json({error:'O administrador precisa configurar razão social, CNPJ e cláusulas do faturamento desta empresa.'},{status:422});
    let anexosHtml='';
    try {
      await ensureAnexos('faturamento_anexos','faturamento_id');
      const anexos=await listarAnexos('faturamento_anexos','faturamento_id',Number(id));
      if(anexos.length){
        anexosHtml='<section style="break-before:page;padding:12px;font:14px Arial"><h2>Anexos / comprovantes</h2>';
        for(const a of anexos){
          const mime=String(a.mime||'');
          if(/^image\/(png|jpeg|webp)$/i.test(mime)){
            anexosHtml+=`<p><b>${esc(a.nome_arquivo)}</b></p><img src="data:${mime};base64,${a.arquivo_b64}" alt="Anexo" style="display:block;max-width:100%;max-height:245mm;object-fit:contain">`;
          } else if(mime==='application/pdf') {
            anexosHtml+=`<p>Documento PDF anexado: ${esc(a.nome_arquivo)} (disponível no registro do faturamento)</p>`;
          }
        }
        anexosHtml+='</section>';
      }
    }catch{/* tabela de anexos pode não estar habilitada */}
    const html=htmlAutorizacao(row,emissor).replace('</body>',anexosHtml+'</body>');
    return new NextResponse(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'"}});
  }catch{return NextResponse.json({error:'Não foi possível emitir o documento. Verifique as migrations.'},{status:500});}
}
