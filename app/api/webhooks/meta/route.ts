import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERIFY =
  process.env.META_VERIFY_TOKEN ||
  process.env.WHATSAPP_VERIFY_TOKEN ||
  'aurox-meta-verify';

/** GET — validação do webhook no painel Meta */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === VERIFY && challenge) {
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
  return queryOne<Conn>(
    `SELECT empresa_id, access_token_enc, external_id, label
       FROM public.manu_conexoes_oauth
      WHERE status = 'conectado'
        AND provedor IN ('meta_facebook', 'meta_instagram')
        AND (
          external_id = $1
          OR meta->>'page_id' = $1
          OR meta::text ILIKE '%' || $1 || '%'
        )
      ORDER BY atualizado_em DESC NULLS LAST
      LIMIT 1`,
    [pageId],
  );
}

async function criarLead(opts: {
  empresaId: number;
  nome: string;
  telefone?: string;
  email?: string;
  mensagem?: string;
  interesse?: string;
  origem: string;
  externalId?: string;
  psid?: string;
}) {
  const nome = (opts.nome || 'Contato Meta').slice(0, 200);
  const tel = (opts.telefone || '').slice(0, 50);
  const mail = (opts.email || '').slice(0, 254);
  const msg = (opts.mensagem || '').slice(0, 2000);
  const interesse = (opts.interesse || '').slice(0, 500);
  const origem = opts.origem.slice(0, 50);
  const ext = (opts.externalId || '').slice(0, 128);

  // dedupe por external id recente
  if (ext) {
    try {
      const exists = await queryOne(
        `SELECT id FROM public.leads
          WHERE empresa_id = $1 AND observacao ILIKE '%' || $2 || '%'
            AND created_at > now() - interval '2 days'
          LIMIT 1`,
        [opts.empresaId, ext],
      );
      if (exists?.id) return { ok: true, deduped: true, lead_id: exists.id };
    } catch { /* ok */ }
  }

  // telefone: se já existe lead recente, só anexa mensagem no chat se possível
  if (tel && tel.length >= 8) {
    try {
      const old = await queryOne<{ id: number; vendedor_id: number | null }>(
        `SELECT id, vendedor_id FROM public.leads
          WHERE empresa_id = $1
            AND RIGHT(REGEXP_REPLACE(COALESCE(telefone,''), '[^0-9]', '', 'g'), 9)
              = RIGHT(REGEXP_REPLACE($2, '[^0-9]', '', 'g'), 9)
          ORDER BY id DESC LIMIT 1`,
        [opts.empresaId, tel],
      );
      if (old?.id) {
        try {
          await query(
            `INSERT INTO public.chat_mensagens (lead_id, remetente_id, mensagem, created_at)
             VALUES ($1, NULL, $2, now())`,
            [old.id, msg || '[mensagem Meta]'],
          );
        } catch {
          try {
            await query(
              `UPDATE public.leads SET observacao = COALESCE(observacao,'') || E'\n' || $2 WHERE id = $1`,
              [old.id, msg],
            );
          } catch { /* ok */ }
        }
        return { ok: true, existing: true, lead_id: old.id };
      }
    } catch { /* ok */ }
  }

  // triagem se existir tabela
  let triagemId: number | null = null;
  try {
    const tr = await queryOne<{ id: number }>(
      `INSERT INTO public.triagem (empresa_id, nome, telefone, email, mensagem, interesse, origem, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente', now()) RETURNING id`,
      [opts.empresaId, nome, tel || null, mail || null, msg || null, interesse || null, origem],
    );
    triagemId = tr?.id ?? null;
  } catch {
    try {
      const tr = await queryOne<{ id: number }>(
        `INSERT INTO public.leads_triagem (empresa_id, nome, telefone, email, mensagem, origem, created_at)
         VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING id`,
        [opts.empresaId, nome, tel || null, mail || null, msg || null, origem],
      );
      triagemId = tr?.id ?? null;
    } catch { /* triagem opcional */ }
  }

  // lead em fila (sem vendedor = triagem / random depois)
  let leadId: number | null = null;
  const obs = [
    msg && `Msg: ${msg}`,
    ext && `meta_id:${ext}`,
    opts.psid && `psid:${opts.psid}`,
    `origem:${origem}`,
  ]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 1800);

  try {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO public.leads (
         empresa_id, nome, nome_completo, telefone, email, observacao,
         produto_interesse, origem, status, created_at
       ) VALUES ($1,$2,$2,$3,$4,$5,$6,$7,'novo', now()) RETURNING id`,
      [opts.empresaId, nome, tel || null, mail || null, obs || null, interesse || null, origem],
    );
    leadId = row?.id ?? null;
  } catch {
    try {
      const row = await queryOne<{ id: number }>(
        `INSERT INTO public.leads (nome, telefone, email, observacao, created_at)
         VALUES ($1,$2,$3,$4, now()) RETURNING id`,
        [nome, tel || null, mail || null, obs || null],
      );
      leadId = row?.id ?? null;
    } catch (e: any) {
      console.error('lead insert', e?.message);
      return { ok: false, error: e?.message };
    }
  }

  try {
    await notificar({
      titulo: 'Lead Meta',
      corpo: `${nome}${tel ? ' · ' + tel : ''}: ${(msg || interesse || 'nova mensagem').slice(0, 80)}`,
      tipo: 'lead',
      empresa_id: opts.empresaId,
    } as any);
  } catch { /* ok */ }

  return { ok: true, lead_id: leadId, triagem_id: triagemId };
}

/** POST — eventos Messenger / Instagram / WhatsApp Cloud / Lead Ads */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
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
          let conn = phoneNumberId
            ? await queryOne<Conn>(
                `SELECT empresa_id, access_token_enc, external_id, label FROM public.manu_conexoes_oauth
                  WHERE status='conectado' AND (
                    external_id = $1 OR meta->>'phone_number_id' = $1 OR meta::text ILIKE '%' || $1 || '%'
                  ) ORDER BY atualizado_em DESC NULLS LAST LIMIT 1`,
                [phoneNumberId],
              )
            : null;

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
                externalId: msg.id,
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
              externalId: ev.message?.mid || String(ev.timestamp || ''),
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
                externalId: String(v.leadgen_id || ''),
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
    // ainda 200 para Meta não desinscrever em loop
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 200 });
  }
}
