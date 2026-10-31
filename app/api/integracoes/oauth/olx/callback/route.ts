import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { query, queryOne } from '@/lib/db';
import { gerarToken, hashToken, urlWebhook } from '@/lib/integracoes/helpers';
import { encryptOlxToken } from '@/lib/integracoes/olx-crypto';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const resultPage='/integracoes';
function redirect(req:NextRequest, name:string, value:string) {
  const url=new URL(resultPage,req.url);
  url.searchParams.set(name,value);
  return NextResponse.redirect(url,{status:303});
}

/** Callback publico chamado apenas pelo redirecionamento OAuth da OLX. */
export async function GET(req:NextRequest) {
  const state=req.nextUrl.searchParams.get('state') || '';
  const code=req.nextUrl.searchParams.get('code') || '';
  const parts=/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,100})$/.exec(state);
  if (!parts) return redirect(req,'oauth_error','Autorizacao OLX sem estado valido');
  const [,pendingId,nonce]=parts;
  const nonceHash=createHash('sha256').update(nonce).digest('hex');
  const pending=await queryOne<{id:string;empresa_id:number;criado_por:number|null;meta:{state_hash?:string};status:string}>(`
    SELECT id,empresa_id,criado_por,meta,status FROM public.manu_conexoes_oauth
    WHERE id=$1 AND provedor='olx' AND status='pendente'
      AND criado_em>now()-interval '10 minutes'`,[pendingId]);
  if (!pending || pending.meta?.state_hash!==nonceHash) {
    return redirect(req,'oauth_error','Autorizacao OLX expirada ou ja utilizada');
  }
  // Consumo atomico do state (impede reutilizacao do codigo / callback concorrente).
  const consumed=await query(`UPDATE public.manu_conexoes_oauth
    SET status='erro',atualizado_em=now() WHERE id=$1 AND status='pendente' RETURNING id`,[pendingId]);
  if (!consumed.rowCount) return redirect(req,'oauth_error','Autorizacao OLX ja processada');
  if (req.nextUrl.searchParams.has('error')) {
    return redirect(req,'oauth_error','A autorizacao foi cancelada na OLX');
  }
  if (!code || code.length>2048) return redirect(req,'oauth_error','OLX nao retornou codigo de autorizacao');

  const clientId=process.env.OLX_CLIENT_ID?.trim()||'';
  const clientSecret=process.env.OLX_CLIENT_SECRET?.trim()||'';
  const redirectUri=process.env.OLX_REDIRECT_URI?.trim()||'';
  if (!clientId || !clientSecret || !redirectUri) return redirect(req,'oauth_error','Credenciais OLX nao configuradas no servidor');
  try {
    const res=await fetch('https://auth.olx.com.br/oauth/token', {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
      body:new URLSearchParams({
        grant_type:'authorization_code',code,client_id:clientId,
        client_secret:clientSecret,redirect_uri:redirectUri,
      }),signal:AbortSignal.timeout(15000),cache:'no-store',
    });
    const tokens=await res.json().catch(()=>({}));
    if (!res.ok || typeof tokens.access_token!=='string' || !tokens.access_token) {
      console.error('[olx callback] erro ao trocar codigo',res.status);
      return redirect(req,'oauth_error','OLX recusou a autorizacao. Confira homologacao e URI de retorno');
    }
    const token=encryptOlxToken(tokens.access_token);
    const refresh=typeof tokens.refresh_token==='string' ? encryptOlxToken(tokens.refresh_token):null;
    const integrationId=randomUUID();
    const webhookToken=gerarToken();
    const webhook=urlWebhook(integrationId,webhookToken);
    const leadConfig=await fetch('https://apps.olx.com.br/autoservice/v1/lead', {
      method:'POST',headers:{
        'Authorization':`Bearer ${tokens.access_token}`,
        'Content-Type':'application/json','Accept':'application/json',
      },body:JSON.stringify({url:webhook}),signal:AbortSignal.timeout(15000),cache:'no-store',
    });
    const leadResponse=await leadConfig.json().catch(()=>({}));
    if (!leadConfig.ok) {
      console.error('[olx callback] registro de webhook recusado',leadConfig.status);
      await query(`UPDATE public.manu_conexoes_oauth SET
        access_token_enc=$2,refresh_token_enc=$3,
        meta=$4::jsonb,atualizado_em=now() WHERE id=$1`, [pendingId,token,refresh,
          JSON.stringify({config_error:`HTTP ${leadConfig.status}`,webhook_registered:false})]);
      return redirect(req,'oauth_error','Login autorizado, mas OLX nao habilitou recebimento de leads. Verifique plano e scope autoservice');
    }
    const mapping={nome:'name',telefone:'phone',email:'email',interesse:'adsInfo.subject',mensagem:'message',id_externo:'externalId'};
    await query(`INSERT INTO public.manu_integracoes
      (id,empresa_id,nome,plataforma,ativo,token_hash,mapeamento,criado_por)
      VALUES($1,$2,$3,'olx',TRUE,$4,$5::jsonb,$6)`,[
        integrationId,pending.empresa_id,`OLX OAuth ${pendingId.slice(0,8)}`,
        hashToken(webhookToken),JSON.stringify(mapping),pending.criado_por,
      ]);
    // Uma nova autorizacao substitui a conexao OLX anterior da mesma empresa.
    await query(`UPDATE public.manu_integracoes SET ativo=FALSE
      WHERE plataforma='olx' AND empresa_id=$1 AND id<>$2`,[pending.empresa_id,integrationId]);
    await query(`UPDATE public.manu_conexoes_oauth SET status='revogado'
      WHERE provedor='olx' AND empresa_id=$1 AND id<>$2 AND status='conectado'`,[pending.empresa_id,pendingId]);
    await query(`UPDATE public.manu_conexoes_oauth SET status='conectado',
      label='OLX — conta autorizada',access_token_enc=$2,refresh_token_enc=$3,
      integracao_id=$4,meta=$5::jsonb,atualizado_em=now() WHERE id=$1`,[
      pendingId,token,refresh,integrationId,
      JSON.stringify({oauth_provider:'olx',webhook_registered:true,lead_config_id:leadResponse.id||null,scope:'autoservice autoupload basic_user_info',expires_in:tokens.expires_in||null}),
    ]);
    return redirect(req,'oauth','ok');
  } catch(e) {
    console.error('[olx callback] falha na integracao',e instanceof Error?e.name:'erro');
    return redirect(req,'oauth_error','Nao foi possivel concluir conexao OLX. Confira logs e autorizacoes');
  }
}
