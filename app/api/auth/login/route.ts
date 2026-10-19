import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { signSession } from '@/lib/session';
import { STATUS_LOGIN_OK } from '@/lib/tenant';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const login = String(body.login || body.usuario || '').trim();
    const senha = String(body.senha || body.password || '');

    if (!login) {
      return NextResponse.json({ error: 'Login obrigatório' }, { status: 400 });
    }

    const user = await queryOne<{
      id: number;
      login: string;
      tipo: string;
      vendedor_id: number | null;
      ativo: boolean;
      senha_hash: string | null;
      nome: string | null;
      status: string | null;
      empresa_id: number | null;
      empresa_ativa: boolean | null;
      empresa_nome: string | null;
    }>(
      `
      SELECT
        u.id,
        u.login,
        u.tipo,
        u.vendedor_id,
        COALESCE(u.ativo, TRUE) AS ativo,
        u.senha_hash,
        u.nome,
        COALESCE(u.status, 'ativo') AS status,
        u.empresa_id,
        COALESCE(e.ativo, TRUE) AS empresa_ativa,
        e.nome AS empresa_nome
      FROM public.usuarios u
      LEFT JOIN public.empresas e ON e.id = u.empresa_id
      WHERE LOWER(TRIM(u.login)) = LOWER(TRIM($1))
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
    const st = String(user.status || 'ativo').toLowerCase();
    if (!STATUS_LOGIN_OK.has(st)) {
      const msg: Record<string, string> = {
        demitido: 'Acesso encerrado',
        pausado: 'Acesso pausado',
        ferias: 'Usuário em férias',
        atestado: 'Usuário em atestado',
        folga: 'Usuário em folga',
      };
      return NextResponse.json({ error: msg[st] || 'Acesso bloqueado' }, { status: 401 });
    }
    if (user.empresa_id != null && user.empresa_ativa === false) {
      return NextResponse.json(
        { error: 'Contrato da empresa inativo. Contate o suporte Aurox.' },
        { status: 403 },
      );
    }

    if (!verifyPassword(senha, user.senha_hash)) {
      return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 });
    }

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
      empresa_id: user.empresa_id != null ? Number(user.empresa_id) : null,
      status: st,
      empresa_nome: user.empresa_nome || null,
    };

    const token = signSession(payload as any);
    return NextResponse.json({
      access_token: token,
      token_type: 'bearer',
      user: payload,
    });
  } catch (e: any) {
    console.error('login error', e);
    // fallback se colunas empresa/status ainda não existem
    try {
      const body = await req.clone().json().catch(() => ({}));
      const login = String(body.login || '').trim();
      const senha = String(body.senha || '');
      const user = await queryOne<any>(
        `SELECT id, login, tipo, vendedor_id, COALESCE(ativo,TRUE) AS ativo, senha_hash, nome
         FROM public.usuarios WHERE LOWER(TRIM(login)) = LOWER(TRIM($1)) LIMIT 1`,
        [login],
      );
      if (!user || !user.ativo || !verifyPassword(senha, user.senha_hash)) {
        return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 });
      }
      const payload = {
        id: Number(user.id),
        login: user.login,
        nome: user.nome || user.login,
        tipo: String(user.tipo || 'vendedor').toLowerCase(),
        vendedor_id: user.vendedor_id != null ? Number(user.vendedor_id) : null,
        loja: '381',
        ativo: true,
        empresa_id: null,
        status: 'ativo',
      };
      return NextResponse.json({
        access_token: signSession(payload as any),
        token_type: 'bearer',
        user: payload,
      });
    } catch {
      /* fallthrough */
    }
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
