import { NextRequest, NextResponse } from 'next/server';
import { getPool, query, queryOne } from '@/lib/db';
import { requireUser, type SessionUser } from '@/lib/session';
import { isSuperAdmin, isGerenteLoja } from '@/lib/tenant';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMINS = new Set(['admin', 'gerente', 'superadmin']);
const LEITORES = new Set(['admin', 'gerente', 'marketing', 'superadmin']);
const GRUPOS = new Set(['vendedor', 'guariba', 'mecanico', 'documentista', 'documento', 'marketing', 'gerente']);
const negar = () => NextResponse.json({ error: 'Meta fora de seu escopo ou sem permissão' }, { status: 403 });
const podeGerenciar = (u: SessionUser) => ADMINS.has(String(u.tipo).toLowerCase());

function idsValidos(raw: unknown): number[] {
  const values = Array.isArray(raw) ? raw : [raw];
  return [...new Set(values.map(Number))].filter(v => Number.isSafeInteger(v) && v > 0);
}

// Proteção multiempresa também para PATCH e DELETE. Nunca confiar no ID recebido pelo navegador.
function escopoMeta(u: SessionUser, params: unknown[], alias = 'm'): string {
  if (isSuperAdmin(u)) return 'TRUE';
  if (!u.empresa_id) return 'FALSE';
  params.push(Number(u.empresa_id));
  const e = `$${params.length}`;
  // Metas novas têm empresa_id próprio. Legadas: exibir apenas se os vínculos
  // de criador e destinatário concordarem com o tenant (sem inferir cliente).
  const criadorDaEmpresa = `EXISTS (SELECT 1 FROM public.usuarios c
            WHERE c.id=${alias}.criado_por_id AND c.empresa_id=${e})`;
  const criadoPelaPlataforma = `EXISTS (SELECT 1 FROM public.usuarios c
            WHERE c.id=${alias}.criado_por_id AND LOWER(c.tipo)='superadmin')`;
  const destinoDaEmpresa = `EXISTS (SELECT 1 FROM public.usuarios d
            WHERE d.id=${alias}.destinatario_id AND d.empresa_id=${e})`;
  let where = `(
    (${alias}.empresa_id=${e} AND (${criadorDaEmpresa} OR ${criadoPelaPlataforma})
      AND (${alias}.destinatario_id IS NULL OR ${destinoDaEmpresa}))
    OR (${alias}.empresa_id IS NULL AND (
      (${criadorDaEmpresa} AND (${alias}.destinatario_id IS NULL OR ${destinoDaEmpresa}))
      OR (${destinoDaEmpresa} AND ${criadoPelaPlataforma})
    ))
  )`;
  if (isGerenteLoja(u)) {
    if (!u.loja) return 'FALSE';
    params.push(String(u.loja).toUpperCase());
    const l = `$${params.length}`;
    params.push(u.id);
    const me = `$${params.length}`;
    where += ` AND (
      ${alias}.criado_por_id=${me}
      OR UPPER(COALESCE(${alias}.destinatario_loja,''))=${l}
      OR EXISTS (
        SELECT 1 FROM public.usuarios d LEFT JOIN public.vendedores v ON v.id=d.vendedor_id
         WHERE d.id=${alias}.destinatario_id
           AND UPPER(COALESCE(v.loja,d.loja,''))=${l}
      )
    )`;
  }
  return where;
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  try {
    const params: unknown[] = [];
    const scopes = [`COALESCE(m.ativo, TRUE)=TRUE`, `(${escopoMeta(u, params)})`];
    if (!LEITORES.has(String(u.tipo).toLowerCase())) {
      params.push(u.id); const id = `$${params.length}`;
      params.push(String(u.tipo).toLowerCase()); const role = `$${params.length}`;
      scopes.push(`(m.destinatario_id=${id} OR LOWER(COALESCE(m.destinatario_tipo,''))=${role})`);
      if (u.loja) {
        params.push(String(u.loja).toUpperCase());
        scopes.push(`(m.destinatario_loja IS NULL OR UPPER(m.destinatario_loja)=$${params.length})`);
      }
    }
    const { rows } = await query(
      `SELECT m.*, d.nome AS destinatario_nome, c.nome AS criador_nome
         FROM public.metas m
         LEFT JOIN public.usuarios d ON d.id=m.destinatario_id
         LEFT JOIN public.usuarios c ON c.id=m.criado_por_id
        WHERE ${scopes.join(' AND ')}
        ORDER BY m.created_at DESC LIMIT 200`, params);
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[metas GET]', error instanceof Error ? error.message : 'falha');
    return NextResponse.json({ error: 'Falha ao consultar metas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeGerenciar(u)) return negar();
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  const titulo = String(b.titulo || '').trim();
  if (!titulo || titulo.length > 180) return NextResponse.json({ error: 'Título obrigatório (até 180 caracteres)' }, { status: 400 });
  const destinatarioId = b.destinatario_id != null ? Number(b.destinatario_id) : null;
  const tipo = b.destinatario_tipo ? String(b.destinatario_tipo).toLowerCase() : null;
  let loja = b.destinatario_loja ? String(b.destinatario_loja).trim().toUpperCase() : null;
  if (destinatarioId && tipo) return NextResponse.json({ error: 'Escolha pessoa OU grupo' }, { status: 400 });
  if (tipo && !GRUPOS.has(tipo)) return NextResponse.json({ error: 'Grupo inválido' }, { status: 400 });
  if (destinatarioId && (!Number.isSafeInteger(destinatarioId) || destinatarioId < 1))
    return NextResponse.json({ error: 'Destinatário inválido' }, { status: 400 });
  if ([Boolean(destinatarioId), Boolean(tipo), Boolean(loja)].filter(Boolean).length === 0)
    return NextResponse.json({ error: 'Escolha um destinatário, grupo ou loja' }, { status: 400 });
  if (!isSuperAdmin(u) && !u.empresa_id) return negar();
  if (isGerenteLoja(u)) {
    if (!u.loja) return negar();
    loja = String(u.loja).toUpperCase();
  }
  const empresaSolicitada = Number(b.empresa_id || 0);
  let empresaId: number | null = isSuperAdmin(u) ? (Number.isSafeInteger(empresaSolicitada) && empresaSolicitada > 0 ? empresaSolicitada : null) : Number(u.empresa_id);
  let alvo: {id: number; empresa_id: number | null; loja: string | null} | null = null;
  try {
    if (destinatarioId) {
      alvo = await queryOne<{id:number;empresa_id:number|null;loja:string|null}>(
        `SELECT z.id,z.empresa_id,COALESCE(v.loja,z.loja) AS loja
           FROM public.usuarios z LEFT JOIN public.vendedores v ON v.id=z.vendedor_id
          WHERE z.id=$1 AND COALESCE(z.ativo,true)=TRUE AND COALESCE(z.status,'ativo')='ativo'`,
        [destinatarioId]);
      if (!alvo || !alvo.empresa_id) return negar();
      if (!isSuperAdmin(u) && Number(alvo.empresa_id) !== Number(u.empresa_id)) return negar();
      if (isSuperAdmin(u) && empresaId && empresaId !== Number(alvo.empresa_id)) return negar();
      empresaId = Number(alvo.empresa_id);
      if (isGerenteLoja(u) && String(alvo.loja || '').toUpperCase() !== loja) return negar();
    } else if (isSuperAdmin(u) && !empresaId) {
      // Não criar metas de grupo globais que possam atingir empresas de clientes diferentes.
      return NextResponse.json({ error: 'Superadmin: selecione a empresa para metas de grupos/lojas' }, { status: 400 });
    }
    if (loja) {
      if (!empresaId || loja.length > 80) return negar();
      const existe = await queryOne<{codigo:string}>(
        `SELECT codigo FROM public.lojas WHERE empresa_id=$1 AND UPPER(codigo)=UPPER($2) AND COALESCE(ativo,TRUE)`,
        [empresaId, loja]);
      if (!existe) return negar();
    }
    const valor = b.valor_objetivo == null || b.valor_objetivo === '' ? null : Number(b.valor_objetivo);
    if (valor !== null && (!Number.isFinite(valor) || valor < 0))
      return NextResponse.json({ error: 'Objetivo deve ser um número não negativo' }, { status: 400 });
    const row = await queryOne<{id:number}>(
      `INSERT INTO public.metas
       (titulo, descricao, valor_objetivo, unidade, periodo_inicio, periodo_fim,
        destinatario_id, destinatario_tipo, destinatario_loja, criado_por_id, empresa_id, ativo)
       VALUES ($1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),
         COALESCE($6::date,(date_trunc('month',CURRENT_DATE)+interval '1 month - 1 day')::date),
         $7,$8,$9,$10,$11,TRUE) RETURNING id`,
      [titulo, String(b.descricao || '').slice(0,2000) || null, valor, String(b.unidade || 'un').slice(0,20),
       b.periodo_inicio || null, b.periodo_fim || null, destinatarioId, tipo, loja, u.id, empresaId]);
    // Para grupos/lojas, listar destinatários no mesmo tenant (e loja, se indicada).
    let destinatarios: number[] = destinatarioId ? [destinatarioId] : [];
    if (!destinatarioId && empresaId) {
      const params: unknown[] = [empresaId];
      let where = `z.empresa_id=$1 AND COALESCE(z.ativo,TRUE) AND COALESCE(z.status,'ativo')='ativo'`;
      if (tipo) {
        params.push(tipo === 'documentista' ? ['documentista','documento'] : [tipo]);
        where += ` AND LOWER(z.tipo)=ANY($${params.length}::text[])`;
      }
      if (loja) {
        params.push(loja);
        where += ` AND UPPER(COALESCE(v.loja,z.loja,''))=$${params.length}`;
      }
      destinatarios = (await query<{id:number}>(
        `SELECT z.id FROM public.usuarios z LEFT JOIN public.vendedores v ON v.id=z.vendedor_id
          WHERE ${where} LIMIT 300`, params)).rows.map(x => Number(x.id));
    }
    if (destinatarios.length) await notificar({
      titulo: 'Nova meta', mensagem: titulo, tipo: 'meta', usuario_ids: destinatarios,
      empresa_id: empresaId || undefined, url: '/metas',
    }).catch(() => {});
    return NextResponse.json({ id: row?.id, ok: true }, { status: 201 });
  } catch (error) {
    console.error('[metas POST]', error instanceof Error ? error.message : 'falha');
    return NextResponse.json({ error: 'Não foi possível criar a meta' }, { status: 500 });
  }
}

async function alterarEmLote(u: SessionUser, ids: number[], operation: 'patch'|'delete', concl?: boolean, ativo?: boolean) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const params: unknown[] = [ids];
    const where = escopoMeta(u, params);
    const found = await client.query(
      `SELECT m.id FROM public.metas m WHERE m.id=ANY($1::int[]) AND (${where}) FOR UPDATE OF m`, params);
    if (found.rows.length !== ids.length) {
      await client.query('ROLLBACK');
      return negar();
    }
    if (operation === 'delete') {
      await client.query('DELETE FROM public.metas WHERE id=ANY($1::int[])', [ids]);
      await client.query('COMMIT');
      return NextResponse.json({ ok: true, excluidas: ids.length });
    }
    const {rows} = await client.query(
      `UPDATE public.metas SET concluida=COALESCE($2,concluida),
          ativo=COALESCE($3,ativo),updated_at=now()
        WHERE id=ANY($1::int[]) RETURNING id,concluida,ativo`, [ids,concl ?? null, ativo ?? null]);
    await client.query('COMMIT');
    return NextResponse.json({ ok: true, atualizadas: rows.length, metas: rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[metas lote]', error instanceof Error ? error.message : 'falha');
    return NextResponse.json({ error: 'Falha ao alterar metas' }, { status: 500 });
  } finally { client.release(); }
}

export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({error:'Não autenticado'},{status:401});
  if (!podeGerenciar(u)) return negar();
  const b = await req.json().catch(()=>null);
  const ids = idsValidos(b?.ids ?? b?.id);
  if (!ids.length || ids.length>100 || (typeof b?.concluida !== 'boolean' && typeof b?.ativo !== 'boolean'))
    return NextResponse.json({error:'Informe de 1 a 100 metas e a alteração solicitada'},{status:400});
  return alterarEmLote(u, ids, 'patch', b.concluida, b.ativo);
}

export async function DELETE(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({error:'Não autenticado'},{status:401});
  if (!podeGerenciar(u)) return negar();
  const b = await req.json().catch(()=>null);
  const ids = idsValidos(b?.ids ?? b?.id);
  if (!ids.length || ids.length>100) return NextResponse.json({error:'Selecione de 1 a 100 metas'},{status:400});
  return alterarEmLote(u, ids, 'delete');
}
