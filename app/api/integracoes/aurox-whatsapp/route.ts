import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { workerRequest } from '@/lib/aurox-whatsapp/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: object, status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const statusError = (e: unknown) => e instanceof Error ? e.message : 'Serviço de WhatsApp indisponível';
async function scope(req: NextRequest, body?: any) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return null;
  const empresaId = escopoEmpresa(actor, body?.empresa_id ?? req.nextUrl.searchParams.get('empresa_id'));
  if (!empresaId) return null;
  return { actor, empresaId };
}

export async function GET(req: NextRequest) {
  const s = await scope(req);
  if (!s) return json({error:'Sem permissão ou empresa não selecionada'},403);
  try {
    const row = await queryOne<any>(`SELECT empresa_id,instancia_id,habilitada,status,numero,
      saudacao_ativa,saudacao,atualizado_em,ultima_mensagem_em,ultimo_erro
      FROM public.aurox_wa_instancias WHERE empresa_id=$1`,[s.empresaId]);
    if (!row) return json({exists:false,status:'desconectado'});
    let live: any = null;
    let workerOnline = false;
    try {
      live = await workerRequest(`/v1/sessions/${s.empresaId}/status`,'GET');
      workerOnline = true;
    } catch { /* Mesmo se o worker cair, a UI mostra o problema sem fingir conexão. */ }
    // Não exibir conectado se o processo não está vivo.
    const state = !row.habilitada ? 'desconectado' : workerOnline ? live.status : 'worker_offline';
    return json({exists:true,enabled:row.habilitada,status:state,
      number:workerOnline ? (live.phone || row.numero) : null,
      qr:workerOnline && state === 'qr' ? live.qr : null,
      greeting_enabled:row.saudacao_ativa,greeting:row.saudacao,
      last_message:row.ultima_mensagem_em,worker_online:workerOnline,
      error:workerOnline ? (live.error || row.ultimo_erro) : (row.habilitada ? 'Serviço Aurox-WhatsApp indisponível' : null)});
  } catch (e) { return json({error:statusError(e)},503); }
}
export async function POST(req: NextRequest) {
  const b = await req.json().catch(()=>null);
  const s = await scope(req,b);
  if (!s) return json({error:'Sem permissão ou empresa não selecionada'},403);
  try {
    const active = await queryOne<{id:number}>(`SELECT id FROM public.empresas WHERE id=$1 AND ativo=TRUE`,[s.empresaId]);
    if (!active) return json({error:'Empresa não está ativa'},403);
    const row = await queryOne<{instancia_id:string}>(`
      INSERT INTO public.aurox_wa_instancias(empresa_id,habilitada,status,criado_por)
      VALUES ($1,TRUE,'iniciando',$2)
      ON CONFLICT(empresa_id) DO UPDATE SET habilitada=TRUE,status='iniciando',atualizado_em=now(),ultimo_erro=NULL
      RETURNING instancia_id`,[s.empresaId,s.actor.id]);
    try {
      await workerRequest(`/v1/sessions/${s.empresaId}/start`,'POST',{instance_id:row?.instancia_id});
    } catch (e) {
      await query(`UPDATE public.aurox_wa_instancias SET status='erro',ultimo_erro=$2 WHERE empresa_id=$1`,
        [s.empresaId,statusError(e).slice(0,300)]);
      return json({error:`Conexão criada, mas serviço de WhatsApp indisponível: ${statusError(e)}`},503);
    }
    return json({ok:true,message:'Preparando QR Code. Atualize em alguns segundos.'});
  } catch (e) { return json({error:statusError(e)},500); }
}
export async function PATCH(req: NextRequest) {
  const b=await req.json().catch(()=>null);
  const s=await scope(req,b);
  if (!s) return json({error:'Sem permissão ou empresa não selecionada'},403);
  const greeting=String(b?.greeting||'').trim();
  if(greeting.length>600) return json({error:'Mensagem deve ter até 600 caracteres'},400);
  if(b?.greeting_enabled && !greeting) return json({error:'Escreva a mensagem antes de ativar'},400);
  try {
    const r=await query(`UPDATE public.aurox_wa_instancias
      SET saudacao_ativa=$2,saudacao=$3,atualizado_em=now() WHERE empresa_id=$1`,
      [s.empresaId,Boolean(b.greeting_enabled),greeting]);
    return r.rowCount ? json({ok:true}) : json({error:'Conecte o WhatsApp antes de configurar mensagens'},404);
  } catch(e) { return json({error:statusError(e)},500); }
}
export async function DELETE(req:NextRequest) {
  const s=await scope(req);
  if(!s) return json({error:'Sem permissão ou empresa não selecionada'},403);
  try {
    // Bloqueia recepção antes de desconectar, mesmo se o worker não responder.
    await query(`UPDATE public.aurox_wa_instancias SET habilitada=FALSE,status='desconectado',numero=NULL,
      ultimo_erro=NULL,atualizado_em=now() WHERE empresa_id=$1`,[s.empresaId]);
    try { await workerRequest(`/v1/sessions/${s.empresaId}/logout`,'POST'); }
    catch(e) { return json({ok:true,warning:`Instância desativada no MANU. Remova o dispositivo no WhatsApp do celular: ${statusError(e)}`}); }
    return json({ok:true});
  } catch(e) { return json({error:statusError(e)},500); }
}
