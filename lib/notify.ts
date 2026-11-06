import { query } from '@/lib/db';

/**
 * Grava notificação no banco + envia Web Push (fora do app / tela apagada).
 * Env no Vercel:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT=mailto:seu@email.com
 */

import { dispatchAuroxPush } from '@/lib/push/dispatch';

export async function notificar(opts: {
  titulo: string;
  mensagem: string;
  tipo?: string;
  usuario_ids?: number[];
  tipos?: string[];
  broadcast?: boolean;
  empresa_id?: number;
  url?: string;
}) {
  try {
    let ids = [...(opts.usuario_ids || [])];
    if (opts.broadcast) {
      const { rows } = await query(
        `SELECT id FROM public.usuarios WHERE COALESCE(ativo, TRUE) = TRUE AND ($1::int IS NULL OR empresa_id=$1)`,
        [opts.empresa_id ?? null],
      );
      ids = rows.map((r: any) => r.id);
    } else if (opts.tipos?.length) {
      const { rows } = await query(
        `SELECT id FROM public.usuarios
         WHERE COALESCE(ativo, TRUE) = TRUE AND LOWER(tipo) = ANY($1)
           AND ($2::int IS NULL OR empresa_id=$2)`,
        [opts.tipos.map((t) => t.toLowerCase()), opts.empresa_id ?? null],
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
    // Os inserts são enfileirados por trigger SQL. Tenta envio imediato, sem perder
    // o aviso se o provedor estiver indisponível; o worker reprocessa posteriormente.
    if (ids.length) await dispatchAuroxPush(Math.min(35, ids.length)).catch(() => {});
  } catch {
    /* tabela pode falhar; nao derruba o fluxo */
  }
}
