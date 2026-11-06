import { query, queryOne } from '@/lib/db';

async function tokenML(empresaId: number) {
  return queryOne<{
    id: string;
    access_token_enc: string;
    refresh_token_enc: string | null;
    external_id: string;
  }>(
    `SELECT id, access_token_enc, refresh_token_enc, external_id FROM public.manu_conexoes_oauth
      WHERE empresa_id=$1 AND provedor='mercadolivre' AND status='conectado'
      ORDER BY atualizado_em DESC NULLS LAST, criado_em DESC LIMIT 1`,
    [empresaId],
  );
}

/** Access token ML expira (~6h). Usa refresh_token e grava o novo. */
export async function accessTokenMLValido(empresaId: number): Promise<string> {
  const row = await tokenML(empresaId);
  if (!row?.access_token_enc) {
    throw new Error('Mercado Livre não conectado — Integrações → Conectar Mercado Livre');
  }

  // testa o token
  const me = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { Authorization: `Bearer ${row.access_token_enc}` },
  });
  if (me.ok) return row.access_token_enc;

  const clientId = process.env.ML_APP_ID || process.env.MERCADOLIVRE_APP_ID || '';
  const secret = process.env.ML_APP_SECRET || process.env.MERCADOLIVRE_APP_SECRET || '';
  if (!row.refresh_token_enc || !clientId || !secret) {
    throw new Error(
      'Token Mercado Livre expirado. Abra Integrações → desconecte e conecte o Mercado Livre de novo.',
    );
  }

  const refreshRes = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: secret,
      refresh_token: row.refresh_token_enc,
    }),
  });
  const tj = await refreshRes.json();
  if (!tj.access_token) {
    throw new Error(
      'Não foi possível renovar o Mercado Livre. Reconecte o canal em Integrações.',
    );
  }

  try {
    await query(
      `UPDATE public.manu_conexoes_oauth SET
         access_token_enc = $2,
         refresh_token_enc = COALESCE($3, refresh_token_enc),
         atualizado_em = now()
       WHERE id = $1`,
      [row.id, tj.access_token, tj.refresh_token || null],
    );
  } catch {
    await query(
      `UPDATE public.manu_conexoes_oauth SET access_token_enc = $2 WHERE id = $1`,
      [row.id, tj.access_token],
    );
  }
  return tj.access_token as string;
}

