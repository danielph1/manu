import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { queryOne } from '@/lib/db';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Autorizacao da conta da concessionaria na propria OLX. */
export async function POST(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({error:'Sem permissao'}, {status:403});
  const data = await req.json().catch(()=>({}));
  const empresaId = escopoEmpresa(actor, data.empresa_id ?? actor.empresa_id);
  if (!empresaId) return NextResponse.json({error:'Selecione uma empresa'}, {status:400});
  const empresa = await queryOne('SELECT id FROM public.empresas WHERE id=$1 AND ativo=TRUE',[empresaId]);
  if (!empresa) return NextResponse.json({error:'Empresa inexistente'}, {status:404});
  const clientId=process.env.OLX_CLIENT_ID?.trim();
  const secret=process.env.OLX_CLIENT_SECRET?.trim();
  const redirectUri=process.env.OLX_REDIRECT_URI?.trim();
  if (!clientId || !secret || !redirectUri || !redirectUri.startsWith('https://')) {
    return NextResponse.json({
      error:'olx_nao_homologada',
      message:'Para conectar via login oficial, cadastre o MANU como integrador na OLX e configure OLX_CLIENT_ID, OLX_CLIENT_SECRET e OLX_REDIRECT_URI (HTTPS) no servidor.',
    },{status:503});
  }
  const nonce=randomBytes(32).toString('base64url');
  const nonceHash=createHash('sha256').update(nonce).digest('hex');
  const row=await queryOne<{id:string}>(`
    INSERT INTO public.manu_conexoes_oauth
      (empresa_id,provedor,status,label,external_id,meta,criado_por)
    VALUES($1,'olx','pendente','OLX — aguardando autorizacao',$2,$3::jsonb,$4)
    RETURNING id`,[empresaId,`tentativa:${randomBytes(12).toString('hex')}`,JSON.stringify({state_hash:nonceHash}),actor.id]);
  if (!row) return NextResponse.json({error:'Nao foi possivel criar tentativa de conexao'}, {status:500});
  const url=new URL('https://auth.olx.com.br/oauth');
  url.searchParams.set('response_type','code');
  url.searchParams.set('client_id',clientId);
  url.searchParams.set('redirect_uri',redirectUri);
  url.searchParams.set('scope','basic_user_info autoupload autoservice');
  url.searchParams.set('state',`${row.id}.${nonce}`);
  return NextResponse.json({auth_url:url.toString()},{headers:{'Cache-Control':'no-store'}});
}
