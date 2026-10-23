import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { query, queryOne } from '@/lib/db';
import { randomUUID } from 'node:crypto';
import { gerarToken, hashToken, urlWebhook } from '@/lib/integracoes/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVEDORES = new Set([
  'olx', 'webmotors', 'napista', 'icarros', 'chavesnamao', 'mercadolivre', 'facebook_marketplace',
]);

/**
 * A loja cola UMA VEZ a chave/token que o painel do parceiro deu a ELA.
 * Fica em manu_conexoes_oauth ligado ao empresa_id — nunca no Vercel global.
 * Gera webhook Aurox para a plataforma EMPURRAR leads.
 */
export async function POST(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const empresaId = escopoEmpresa(actor, body.empresa_id ?? actor.empresa_id);
  if (!empresaId) return NextResponse.json({ error: 'empresa obrigatória' }, { status: 400 });

  const provedor = String(body.provedor || '').toLowerCase().trim();
  if (!PROVEDORES.has(provedor)) {
    return NextResponse.json({ error: 'provedor inválido' }, { status: 400 });
  }

  const apiKey = String(body.api_key || body.token || body.client_secret || '').trim();
  const clientId = String(body.client_id || body.partner_id || '').trim();
  const label = String(body.label || provedor).trim().slice(0, 80);

  if (!apiKey && !clientId) {
    return NextResponse.json(
      { error: 'informe a chave ou token que o painel da plataforma forneceu à sua loja' },
      { status: 400 },
    );
  }

  const maps: Record<string, Record<string, string>> = {
    olx: { nome: 'name', telefone: 'phone', email: 'email', interesse: 'adsInfo.subject', mensagem: 'message', id_externo: 'externalId' },
    webmotors: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'veiculo', mensagem: 'mensagem', id_externo: 'id' },
    napista: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'veiculo', mensagem: 'mensagem', id_externo: 'id' },
    icarros: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'modelo', mensagem: 'observacao', id_externo: 'leadId' },
    chavesnamao: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'veiculo', mensagem: 'mensagem', id_externo: 'id' },
    mercadolivre: { nome: 'nome', telefone: 'telefone', email: 'email', interesse: 'titulo', mensagem: 'texto', id_externo: 'id' },
    facebook_marketplace: { nome: 'name', telefone: 'phone', email: 'email', interesse: 'item', mensagem: 'message', id_externo: 'id' },
  };

  const integId = randomUUID();
  const hookToken = gerarToken();
  let webhook_url = '';
  try {
    webhook_url = urlWebhook(integId, hookToken);
  } catch {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    if (base) {
      webhook_url = `${base.replace(/\/$/, '')}/functions/v1/manu-webhook/${integId}/${hookToken}`;
    }
  }

  try {
    await queryOne(
      `INSERT INTO public.manu_integracoes (id, empresa_id, nome, plataforma, token_hash, mapeamento, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id`,
      [
        integId,
        empresaId,
        label || provedor,
        provedor === 'facebook_marketplace' ? 'marketplace' : provedor,
        hashToken(hookToken),
        JSON.stringify(maps[provedor] || maps.olx),
        actor.id,
      ],
    );
  } catch (e) {
    console.error('integracao cred', e);
  }

  const external = clientId || `cred:${provedor}`;
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM public.manu_conexoes_oauth
      WHERE empresa_id=$1 AND provedor=$2 AND external_id=$3 LIMIT 1`,
    [empresaId, provedor, external],
  );

  const meta = {
    provider: 'partner_login',
    has_api_key: Boolean(apiKey),
    client_id: clientId || null,
    webhook_url,
    note: 'Credencial da loja — captura via webhook Aurox ou API do parceiro',
  };

  try {
    if (existing) {
      await query(
        `UPDATE public.manu_conexoes_oauth SET
           status='conectado', access_token_enc=$2, meta=$3::jsonb,
           label=$4, integracao_id=$5, atualizado_em=now()
         WHERE id=$1`,
        [existing.id, apiKey || clientId, JSON.stringify(meta), label, integId],
      );
    } else {
      await queryOne(
        `INSERT INTO public.manu_conexoes_oauth
          (empresa_id, provedor, status, label, external_id, access_token_enc, meta, integracao_id, criado_por)
         VALUES ($1,$2,'conectado',$3,$4,$5,$6::jsonb,$7,$8) RETURNING id`,
        [empresaId, provedor, label, external, apiKey || clientId, JSON.stringify(meta), integId, actor.id],
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: 'db', message: 'Rode SQL_MANU_OAUTH.sql', detail: String(e?.message || e).slice(0, 100) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: 'conectado',
    provedor,
    webhook_url,
    message:
      webhook_url
        ? `Conectado. No painel ${provedor}, cole esta URL de webhook (uma vez). Leads caem na triagem desta empresa.`
        : 'Conectado. Configure NEXT_PUBLIC_SUPABASE_URL para gerar URL de webhook.',
  });
}
