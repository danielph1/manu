/**
 * Exemplo: adapte o edge function do repo serverlxss e, no final, POST no MANU.
 *
 * O scraper ORIGINAL NÃO captura telefone — só listagem.
 *
 * Deno:
 *   MARKETPLACE_SCRAPER_SECRET=xxx
 *   MANU_API=https://manu-manu-automoveis.vercel.app
 *   BROWSERLESS_TOKEN=xxx
 */

const MANU = Deno.env.get('MANU_API') || 'https://manu-manu-automoveis.vercel.app';
const SECRET = Deno.env.get('MARKETPLACE_SCRAPER_SECRET') || '';

export async function pushToManu(items: unknown[]) {
  const r = await fetch(`${MANU}/api/olx/anuncios`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-manu-scraper-secret': SECRET,
    },
    body: JSON.stringify({ items, query: 'olx-browserless' }),
  });
  console.log(await r.text());
}
