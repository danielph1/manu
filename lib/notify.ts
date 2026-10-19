import { query } from '@/lib/db';

/**
 * Grava notificação no banco + envia Web Push (fora do app / tela apagada).
 * Env no Vercel:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT=mailto:seu@email.com
 */

async function sendWebPush(usuarioIds: number[], title: string, body: string, url?: string) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@manu.local';
  if (!pub || !priv || !usuarioIds.length) return;

  let webpush: any;
  try {
    webpush = (await import('web-push')).default;
  } catch {
    return; // pacote não instalado
  }
  webpush.setVapidDetails(subject, pub, priv);

  let subs: any[] = [];
  try {
    const { rows } = await query(
      `SELECT id, endpoint, p256dh, auth FROM public.push_subscriptions
       WHERE ativo = TRUE AND usuario_id = ANY($1)`,
      [usuarioIds],
    );
    subs = rows || [];
  } catch {
    return;
  }

  const payload = JSON.stringify({
    title: title || 'Manu Automóveis',
    body: body || '',
    url: url || '/painel',
  });

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
    } catch (err: any) {
      const code = err?.statusCode || err?.status;
      if (code === 404 || code === 410) {
        try {
          await query(`UPDATE public.push_subscriptions SET ativo = FALSE WHERE id = $1`, [s.id]);
        } catch { /* ok */ }
      }
    }
  }
}

export async function notificar(opts: {
  titulo: string;
  mensagem: string;
  tipo?: string;
  usuario_ids?: number[];
  tipos?: string[];
  broadcast?: boolean;
  url?: string;
}) {
  try {
    let ids = [...(opts.usuario_ids || [])];
    if (opts.broadcast) {
      const { rows } = await query(
        `SELECT id FROM public.usuarios WHERE COALESCE(ativo, TRUE) = TRUE`,
      );
      ids = rows.map((r: any) => r.id);
    } else if (opts.tipos?.length) {
      const { rows } = await query(
        `SELECT id FROM public.usuarios
         WHERE COALESCE(ativo, TRUE) = TRUE AND LOWER(tipo) = ANY($1)`,
        [opts.tipos.map((t) => t.toLowerCase())],
      );
      ids.push(...rows.map((r: any) => r.id));
    }
    ids = [...new Set(ids.map(Number).filter(Boolean))];
    for (const id of ids) {
      await query(
        `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem)
         VALUES ($1, $2, $3, $4)`,
        [id, opts.tipo || 'geral', opts.titulo, opts.mensagem],
      );
    }
    // push em paralelo (não bloqueia se falhar)
    sendWebPush(ids, opts.titulo, opts.mensagem, opts.url).catch(() => {});
  } catch {
    /* tabela pode falhar; nao derruba o fluxo */
  }
}
