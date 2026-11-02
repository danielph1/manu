import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { empresaPermitida, obterEmissor } from '@/lib/faturamento-empresa';

export const runtime = 'nodejs';
const campos = ['nome_fantasia','razao_social','cnpj','endereco','bairro','cidade','cep','telefone','logo_url','texto_observacoes','texto_contrato','local_assinatura'] as const;

function idEscolhido(req: NextRequest, u: {tipo: string; empresa_id?: number|null}) {
  const requested = Number(req.nextUrl.searchParams.get('empresa_id') || 0);
  return u.tipo === 'superadmin' ? requested : Number(u.empresa_id || 0);
}
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({error:'não autenticado'}, {status:401});
  const id = idEscolhido(req,u);
  if (!empresaPermitida(u,id)) return NextResponse.json({error:'Selecione uma empresa autorizada'}, {status:403});
  try {
    const emissor = await obterEmissor(id);
    return NextResponse.json(emissor || {error:'Empresa não encontrada'}, {status: emissor ? 200 : 404});
  } catch { return NextResponse.json({error:'Execute a migration de faturamento por empresa'}, {status:503}); }
}
export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({error:'não autenticado'}, {status:401});
  if (!['superadmin','admin'].includes(u.tipo)) return NextResponse.json({error:'Somente admin ou superadmin pode alterar o emissor'}, {status:403});
  const b = await req.json().catch(()=>null);
  const id = u.tipo === 'superadmin' ? Number(b?.empresa_id) : Number(u.empresa_id);
  if (!empresaPermitida(u,id)) return NextResponse.json({error:'Empresa não autorizada'}, {status:403});
  const empresa = await queryOne(`SELECT id FROM public.empresas WHERE id=$1`,[id]);
  if (!empresa) return NextResponse.json({error:'Empresa não encontrada'}, {status:404});
  const payload = campos.map(k=>String(b?.[k] ?? '').trim().slice(0,k.startsWith('texto_')?15000:500));
  const url = payload[8];
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) return NextResponse.json({error:'Logo deve ser uma URL HTTPS'}, {status:400});
  try {
    await query(`INSERT INTO public.manu_faturamento_config (empresa_id,${campos.join(',')})
      VALUES ($1,${campos.map((_,i)=>`$${i+2}`).join(',')})
      ON CONFLICT (empresa_id) DO UPDATE SET
      ${campos.map(k=>`${k}=EXCLUDED.${k}`).join(',')},atualizado_em=now()`, [id,...payload]);
    return NextResponse.json({ok:true});
  } catch { return NextResponse.json({error:'Não foi possível salvar. Verifique a migration.'}, {status:500}); }
}
