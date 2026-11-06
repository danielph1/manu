import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { accessTokenMLValido } from '@/lib/mercadolivre/access-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Localidade = { id: string; name: string };
const canPublish = new Set(['admin', 'marketing', 'superadmin', 'gerente']);
const cleanId = /^[a-zA-Z0-9_-]{2,120}$/;

/**
 * Catálogo oficial do Mercado Livre para classificados de veículos.
 * ?estoque_id=123              -> estados brasileiros
 * ?estoque_id=123&estado_id=X -> cidades do estado selecionado
 * Nunca envia access_token ao browser. Valida empresa pelo carro selecionado.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!canPublish.has(String(user.tipo || '').toLowerCase()) && !isSuperAdmin(user)) {
    return NextResponse.json({ error: 'Sem permissão para anunciar.' }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const id = Number(sp.get('estoque_id'));
  const estadoId = sp.get('estado_id')?.trim() || '';
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Veículo inválido.' }, { status: 400 });
  }
  if (estadoId && !cleanId.test(estadoId)) {
    return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
  }

  try {
    const car = await queryOne<{ empresa_id: number | null }>(
      'SELECT empresa_id FROM public.estoque_carros WHERE id=$1', [id],
    );
    if (!car || !car.empresa_id) {
      return NextResponse.json({ error: 'Veículo sem empresa vinculada.' }, { status: 404 });
    }
    if (!isSuperAdmin(user) && Number(user.empresa_id) !== Number(car.empresa_id)) {
      return NextResponse.json({ error: 'Veículo de outra empresa.' }, { status: 403 });
    }

    const token = await accessTokenMLValido(Number(car.empresa_id));
    const endpoint = estadoId
      ? `https://api.mercadolibre.com/classified_locations/states/${encodeURIComponent(estadoId)}`
      : 'https://api.mercadolibre.com/classified_locations/countries/BR';
    const result = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) {
      console.error('[Mercado Livre] consulta de localidades falhou', result.status);
      return NextResponse.json({
        error: result.status === 401 || result.status === 403
          ? 'Autorização do Mercado Livre inválida. Reconecte sua conta em Integrações.'
          : 'Não foi possível consultar as localidades do Mercado Livre. Tente novamente.',
      }, { status: 502 });
    }
    const raw: unknown = estadoId ? payload.cities : payload.states;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'O Mercado Livre retornou um formato inesperado de localidades.' }, { status: 502 });
    }
    const dados: Localidade[] = raw
      .filter((x): x is Localidade => x && typeof x.id === 'string' && typeof x.name === 'string')
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return NextResponse.json({ itens: dados }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes('Mercado Livre não conectado') || message.includes('Token Mercado Livre') || message.includes('renovar o Mercado Livre')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('[Mercado Livre] localidades:', e);
    return NextResponse.json({ error: 'Falha ao carregar estados/cidades. Confira a conexão em Integrações.' }, { status: 502 });
  }
}
