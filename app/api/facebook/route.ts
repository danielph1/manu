import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';

const VERIFY = process.env.FB_VERIFY_TOKEN || 'manu-fb';
const PAGE_TOKEN = process.env.FB_PAGE_TOKEN || '';

// Facebook chama isto para confirmar o endereço
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === VERIFY) {
    return new NextResponse(challenge || '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

async function gravar(origem: string, nome: string, telefone: string, email: string, interesse: string, mensagem: string) {
  await queryOne(
    `INSERT INTO public.triagem (nome, telefone, email, interesse, origem, mensagem)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [nome || 'Sem nome', telefone, email, interesse, origem, mensagem],
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const entries = Array.isArray(body.entry) ? body.entry : [];

  for (const entry of entries) {
    // formulário de anúncio (leadgen): aqui vem nome, telefone, email
    for (const change of entry.changes || []) {
      if (change.field === 'leadgen' && change.value?.leadgen_id && PAGE_TOKEN) {
        const id = change.value.leadgen_id;
        const r = await fetch(`https://graph.facebook.com/v21.0/${id}?access_token=${PAGE_TOKEN}`);
        const lead = await r.json();
        const campos: Record<string, string> = {};
        for (const f of lead.field_data || []) campos[f.name] = (f.values || [])[0] || '';
        await gravar(
          'facebook',
          campos.full_name || campos.nome || '',
          campos.phone_number || campos.telefone || '',
          campos.email || '',
          campos.car_model || campos.interesse || '',
          'formulário',
        );
      }
    }
    // mensagem do Marketplace / Messenger: vem o texto. telefone só se a pessoa escrever
    for (const m of entry.messaging || []) {
      const texto = m.message?.text || '';
      if (!texto) continue;
      let nome = '';
      if (PAGE_TOKEN && m.sender?.id) {
        const p = await fetch(`https://graph.facebook.com/v21.0/${m.sender.id}?fields=name&access_token=${PAGE_TOKEN}`);
        const pj = await p.json();
        nome = pj.name || '';
      }
      const tel = (texto.match(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}/) || [])[0] || '';
      await gravar('facebook', nome, tel, '', '', texto);
    }
  }
  return NextResponse.json({ ok: true });
}
