import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { notificar } from '@/lib/notify';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERIFY =
  process.env.META_VERIFY_TOKEN ||
  process.env.WHATSAPP_VERIFY_TOKEN ||
  '';

/** GET — validação do webhook no painel Meta */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (VERIFY && mode === 'subscribe' && token === VERIFY && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

type Conn = {
  empresa_id: number;
  access_token_enc: string;
  external_id: string;
  label: string | null;
};

async function connByPageId(pageId: string): Promise<Conn | null> {
  if (!pageId) return null;
  const { rows } = await query<Conn>(
    `SELECT empresa_id, access_token_enc, external_id, label
       FROM public.manu_conexoes_oauth
      WHERE status='conectado' AND provedor IN ('meta_facebook','meta_instagram')
        AND (external_id=$1 OR meta->>'page_id'=$1)
      LIMIT 10`, [pageId],
  );
  // Um mesmo Page ID associado a empresas distintas não pode receber leads até resolver o vínculo.
  if (new Set(rows.map((r) => Number(r.empresa_id))).size !== 1) return null;
  return rows[0] || null;
}

async function connByPhoneNumberId(phoneId: string): Promise<Conn | null> {
  if (!phoneId) return null;
  const { rows } = await query<Conn>(
    `SELECT empresa_id, access_token_enc, external_id, label
       FROM public.manu_conexoes_oauth
      WHERE status='conectado' AND provedor='whatsapp_cloud'
        AND (external_id=$1 OR meta->>'phone_number_id'=$1)
      LIMIT 10`, [phoneId],
  );
  if (new Set(rows.map((r) => Number(r.empresa_id))).size !== 1) return null;
  return rows[0] || null;
}

function assinaturaMetaCorreta(body: string, signature: string | null) {
  const secret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), Buffer.from(expected, 'hex'));
}

async function criarLead(opts: {
  empresaId: number; nome: string; telefone?: string; email?: string;
  mensagem?: string; interesse?: string; origem: string; externalId?: string; psid?: string;
}) {
  // Reserva o ID do evento para impedir duplicação no reenvio do webhook.
  const eid = String(opts.externalId || '').slice(0,160);
  let eventId: number | null = null;
  if (eid) {
    const r = await queryOne<{ id: number }>(
      `INSERT INTO public.manu_meta_eventos (empresa_id, origem, external_id)
       VALUES ($1,$2,$3) ON CONFLICT (empresa_id, origem, external_id) DO NOTHING RETURNING id`,
      [opts.empresaId, opts.origem, eid],
    );
    if (!r) return { ok: true, duplicado: true };
    eventId = Number(r.id);
  }
  let row: { id: number } | null = null;
  try {
    row = await queryOne<{ id: number }>(
    `INSERT INTO public.triagem(empresa_id, nome, telefone, email, interesse, origem, mensagem, status)
     VALUES($1,$2,$3,$4,$5,$6,$7,'aguardando') RETURNING id`,
    [opts.empresaId, String(opts.nome || 'Contato Meta').slice(0,200),
      String(opts.telefone || '').slice(0,50) || null,
      String(opts.email || '').slice(0,254) || null,
      String(opts.interesse || '').slice(0,500) || null,
      String(opts.origem).slice(0,50), String(opts.mensagem || '').slice(0,2000)],
  );
    if (eventId && row?.id) await query(`UPDATE public.manu_meta_eventos SET triagem_id=$2 WHERE id=$1`,[eventId,row.id]);
  } catch (e) {
    if (eventId) await query('DELETE FROM public.manu_meta_eventos WHERE id=$1',[eventId]).catch(() => {});
    throw e;
  }
  if (row?.id) {
    notificar({ titulo: 'Novo lead Meta', mensagem: `${opts.nome || 'Contato'} · ${(opts.mensagem || '').slice(0,80)}`,
      tipo: 'lead', empresa_id: opts.empresaId, tipos: ['admin','marketing','gerente'] }).catch(() => {});
  }
  return { ok: true, triagem_id: row?.id };
}

/** POST — eventos Messenger / Instagram / WhatsApp Cloud / Lead Ads */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 130000 || !assinaturaMetaCorreta(raw, req.headers.get('x-hub-signature-256'))) {
      return NextResponse.json({ error: 'assinatura Meta inválida ou ausente' }, { status: 403 });
    }
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'json' }, { status: 400 });
    }

    const objectType = String(body.object || '');
    const results: unknown[] = [];

    // WhatsApp Cloud API
    if (objectType === 'whatsapp_business_account' || body.entry?.[0]?.changes) {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const val = change.value || {};
          const phoneNumberId = String(val.metadata?.phone_number_id || '');
          // resolve empresa by phone_number_id in meta jsonb
          const conn = await connByPhoneNumberId(phoneNumberId);

          for (const msg of val.messages || []) {
            if (!conn) continue;
            const contact = (val.contacts || []).find((c: any) => c.wa_id === msg.from) || val.contacts?.[0];
            results.push(
              await criarLead({
                empresaId: conn.empresa_id,
                nome: contact?.profile?.name || msg.from,
                telefone: msg.from,
                mensagem: msg.text?.body || msg.type || '',
                origem: 'whatsapp',
                externalId: `${phoneNumberId}:${msg.id || ''}`,
              }),
            );
          }
        }
      }
    }

    // Messenger / Instagram (page id = entry.id)
    if (objectType === 'page' || objectType === 'instagram' || body.entry?.[0]?.messaging) {
      for (const entry of body.entry || []) {
        const pageId = String(entry.id || '');
        const conn = pageId ? await connByPageId(pageId) : null;
        if (!conn) {
          results.push({ skip: true, reason: 'pagina_nao_conectada', pageId });
          continue;
        }
        for (const ev of entry.messaging || []) {
          // ignora eco da própria página
          if (ev.message?.is_echo) continue;
          const text = ev.message?.text || (ev.message?.attachments ? '[anexo]' : '');
          if (!text && !ev.postback) continue;
          const psid = String(ev.sender?.id || '');
          results.push(
            await criarLead({
              empresaId: conn.empresa_id,
              nome: `FB ${psid.slice(-6) || 'contato'}`,
              mensagem: text || String(ev.postback?.payload || ''),
              origem: objectType === 'instagram' ? 'instagram' : 'facebook',
              externalId: `${pageId}:${ev.message?.mid || String(ev.timestamp || '')}`,
              psid,
              interesse: conn.label || undefined,
            }),
          );
        }
        // leadgen
        for (const change of entry.changes || []) {
          if (change.field === 'leadgen') {
            const v = change.value || {};
            results.push(
              await criarLead({
                empresaId: conn.empresa_id,
                nome: v.full_name || v.name || 'Lead Ads',
                telefone: v.phone_number || v.phone || '',
                email: v.email || '',
                mensagem: 'Lead Ads Facebook',
                origem: 'facebook_leadads',
                externalId: `${pageId}:${String(v.leadgen_id || '')}`,
              }),
            );
          }
        }
      }
    }

    // Meta exige 200 rápido
    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (e: any) {
    console.error('meta webhook', e);
    return NextResponse.json({ ok: false, error: 'Falha ao processar webhook Meta.' }, { status: 500 });
  }
}
