import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';

const SECRET = process.env.ENTRADA_SECRET || 'manu-entrada';

function pega(b: any, chaves: string[]) {
  for (const k of chaves) {
    const v = b?.[k];
    if (v) return String(v);
  }
  return '';
}

async function gravar(origem: string, b: any) {
  const nome = pega(b, ['nome','name','client_name','Nome','full_name']) || 'Sem nome';
  const telefone = pega(b, ['telefone','phone','phoneNumber','celular','fone','ddd']);
  const email = pega(b, ['email','Email','client_email']);
  const interesse = pega(b, ['interesse','veiculo','vehicle','modelo','listing','anuncio','titulo']);
  const mensagem = pega(b, ['mensagem','message','texto','comment','observacao']) || JSON.stringify(b).slice(0, 500);
  await queryOne(
    `INSERT INTO public.triagem (nome, telefone, email, interesse, origem, mensagem)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [nome, telefone, email, interesse, origem, mensagem],
  );
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-entrada-secret') || req.nextUrl.searchParams.get('token') || '';
  if (secret && secret !== SECRET) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const item = b.lead || b.cliente || b || {};
  await gravar('whatsapp', { ...b, ...item });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, origem: 'whatsapp' });
}
