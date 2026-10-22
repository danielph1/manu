import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { query, queryOne } from '@/lib/db';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cria sessão WhatsApp via Evolution API (ou compatível).
 * Env: EVOLUTION_API_URL, EVOLUTION_API_KEY
 * Isolamento: instance name = aurox_{empresa_id}_{random}
 */
export async function POST(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const empresaId = escopoEmpresa(actor, body.empresa_id ?? actor.empresa_id);
  if (!empresaId) return NextResponse.json({ error: 'empresa obrigatória' }, { status: 400 });

  const evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const evoKey = process.env.EVOLUTION_API_KEY || '';
  if (!evoUrl) {
    return NextResponse.json(
      {
        error: 'whatsapp_qr_nao_configurado',
        message:
          'Configure EVOLUTION_API_URL (e EVOLUTION_API_KEY) no servidor Aurox. O cliente só escaneia o QR.',
      },
      { status: 503 },
    );
  }

  const instance = `aurox_${empresaId}_${randomBytes(3).toString('hex')}`;
  const webhookBase = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  // Cria registro pendente
  const row = await queryOne(
    `INSERT INTO public.manu_conexoes_oauth
      (empresa_id, provedor, status, label, external_id, meta, criado_por)
     VALUES ($1,'whatsapp_qr','pendente','WhatsApp (QR)',$2,$3::jsonb,$4)
     RETURNING id`,
    [
      empresaId,
      instance,
      JSON.stringify({ instance }),
      actor.id,
    ],
  );

  try {
    // Evolution: create instance
    const create = await fetch(`${evoUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evoKey,
      },
      body: JSON.stringify({
        instanceName: instance,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });
    const created = await create.json().catch(() => ({}));

    // connect / get QR
    const qrRes = await fetch(`${evoUrl}/instance/connect/${instance}`, {
      method: 'GET',
      headers: { apikey: evoKey },
    });
    const qrJson = await qrRes.json().catch(() => ({}));
    const base64 =
      qrJson?.base64 ||
      qrJson?.qrcode?.base64 ||
      created?.qrcode?.base64 ||
      null;

    await query(
      `UPDATE public.manu_conexoes_oauth SET meta = meta || $2::jsonb, atualizado_em=now() WHERE id=$1`,
      [row?.id, JSON.stringify({ evolution: true, last: 'qr_requested' })],
    );

    return NextResponse.json({
      id: row?.id,
      instance,
      qrcode_base64: base64,
      message: base64
        ? 'Escaneie o QR no WhatsApp do celular da loja (Aparelhos conectados).'
        : 'Instância criada — atualize em alguns segundos se o QR não apareceu.',
    });
  } catch (e) {
    console.error('whatsapp qr', e);
    return NextResponse.json({ error: 'falha ao criar sessão WhatsApp' }, { status: 500 });
  }
}

/** Status da sessão */
export async function GET(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id' }, { status: 400 });

  const row = await queryOne(
    `SELECT id, empresa_id, status, external_id, meta FROM public.manu_conexoes_oauth
      WHERE id=$1 AND ($2::boolean OR empresa_id=$3)`,
    [id, actor.tipo === 'superadmin', actor.empresa_id],
  );
  if (!row) return NextResponse.json({ error: 'não encontrada' }, { status: 404 });

  const evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const evoKey = process.env.EVOLUTION_API_KEY || '';
  if (evoUrl && row.external_id) {
    try {
      const st = await fetch(`${evoUrl}/instance/connectionState/${row.external_id}`, {
        headers: { apikey: evoKey },
      });
      const j = await st.json().catch(() => ({}));
      const state = j?.instance?.state || j?.state || '';
      if (String(state).toLowerCase().includes('open') || state === 'connected') {
        await query(
          `UPDATE public.manu_conexoes_oauth SET status='conectado', atualizado_em=now() WHERE id=$1`,
          [id],
        );
        return NextResponse.json({ status: 'conectado', raw: state });
      }
      return NextResponse.json({ status: row.status, raw: state });
    } catch {
      /* fallthrough */
    }
  }
  return NextResponse.json({ status: row.status });
}
