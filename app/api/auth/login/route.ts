import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { signSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const login = String(body.login || body.usuario || '').trim();
    const senha = String(body.senha || body.password || '');

    if (!login) {
      return NextResponse.json({ error: 'Login obrigatório' }, { status: 400 });
    }

    // Tabela real (Table Editor): senha_hash — sem coluna "loja" em alguns schemas
    const user = await queryOne<{
      id: number;
      login: string;
      tipo: string;
      vendedor_id: number | null;
      ativo: boolean;
      senha_hash: string | null;
      nome: string | null;
    }>(
      `
      SELECT
        id,
        login,
        tipo,
        vendedor_id,
        COALESCE(ativo, TRUE) AS ativo,
        senha_hash,
        nome
      FROM public.usuarios
      WHERE LOWER(TRIM(login)) = LOWER(TRIM($1))
      LIMIT 1
      `,
      [login],
    );

    if (!user) {
      return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 });
    }
    if (!user.ativo) {
      return NextResponse.json({ error: 'Usuário inativo' }, { status: 401 });
    }

    if (!verifyPassword(senha, user.senha_hash)) {
      return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 });
    }

    // loja via vendedor (se existir)
    let loja = '381';
    if (user.vendedor_id) {
      try {
        const v = await queryOne<{ loja: string | null }>(
          `SELECT loja FROM public.vendedores WHERE id = $1`,
          [user.vendedor_id],
        );
        if (v?.loja) loja = String(v.loja);
      } catch {
        /* ignore */
      }
    }

    let tipo = String(user.tipo || 'vendedor').toLowerCase().trim();
    const aliases: Record<string, string> = {
      administrador: 'admin',
      dono: 'admin',
      owner: 'admin',
      documento: 'documentista',
      documentista: 'documentista',
      elfenai: 'elfenai',
      elfen_ai: 'elfenai',
      mecânico: 'mecanico',
    };
    tipo = aliases[tipo] || tipo;

    const payload = {
      id: Number(user.id),
      login: user.login,
      nome: user.nome || user.login,
      tipo,
      vendedor_id: user.vendedor_id != null ? Number(user.vendedor_id) : null,
      loja,
      ativo: true,
    };

    const token = signSession(payload as any);
    return NextResponse.json({
      access_token: token,
      token_type: 'bearer',
      user: payload,
    });
  } catch (e: any) {
    console.error('login error', e);
    return NextResponse.json(
      {
        error:
          e?.message ||
          'Erro ao conectar no banco. Confira DATABASE_URL no .env.local',
      },
      { status: 500 },
    );
  }
}
