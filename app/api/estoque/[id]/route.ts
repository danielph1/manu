import { NextRequest, NextResponse } from 'next/server';
import { getPool, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { prepararVeiculo } from '@/lib/aurox-veiculo-cadastro';
import { auditarAlteracao } from '@/lib/auditoria';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const EDITORES = new Set(['marketing', 'gerente', 'admin', 'superadmin']);
const numero = (x: unknown) => { const n = Number(x); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
type Context = { params: Promise<{ id: string }> };

async function validar(req: NextRequest, context: Context) {
  const user = await requireUser(req);
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) } as const;
  if (!EDITORES.has(String(user.tipo).toLowerCase())) return { error: NextResponse.json({ error: 'Sem permissão para alterar o estoque' }, { status: 403 }) } as const;
  const id = numero((await context.params).id);
  if (!id) return { error: NextResponse.json({ error: 'Veículo inválido' }, { status: 400 }) } as const;
  return { user, id } as const;
}

export async function GET(req: NextRequest, context: Context) {
  const a = await validar(req, context);
  if ('error' in a) return a.error;
  try {
    const row = await queryOne<Record<string, unknown>>('SELECT * FROM public.estoque_carros WHERE id=$1', [a.id]);
    if (!row || !numero(row.empresa_id) ||
      (a.user.tipo !== 'superadmin' && numero(row.empresa_id) !== numero(a.user.empresa_id))) {
      return NextResponse.json({ error: 'Veículo não encontrado nesta empresa' }, { status: 404 });
    }
    return NextResponse.json(row, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[estoque detalhe]', e instanceof Error ? e.message : 'erro');
    return NextResponse.json({ error: 'Não foi possível carregar a ficha do veículo' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const a = await validar(req, context);
  if ('error' in a) return a.error;
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  let v: ReturnType<typeof prepararVeiculo>;
  try { v = prepararVeiculo(raw); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Veículo inválido' }, { status: 400 }); }
  const db = await getPool().connect();
  try {
    await db.query('BEGIN');
    const r = await db.query<{
      id: number; empresa_id: number | null; status_estoque: string | null; status: string | null; placa: string | null;
    }>('SELECT id,empresa_id,status_estoque,status,placa FROM public.estoque_carros WHERE id=$1 FOR UPDATE', [a.id]);
    const old = r.rows[0];
    const empresaId = numero(old?.empresa_id);
    if (!old || !empresaId || (a.user.tipo !== 'superadmin' && empresaId !== numero(a.user.empresa_id))) {
      await db.query('ROLLBACK');
      return NextResponse.json({ error: 'Veículo fora da empresa selecionada' }, { status: 403 });
    }
    if (String(old.status_estoque || '').toLowerCase() === 'inativo' || /vendid/i.test(String(old.status || ''))) {
      await db.query('ROLLBACK');
      return NextResponse.json({ error: 'Veículo já vendido/inativo. Não edite o estoque histórico.' }, { status: 409 });
    }
    const patio = a.user.tipo === 'gerente' ? String(a.user.loja || '').trim().toUpperCase() : String(raw.patio || '').trim().toUpperCase();
    if (!patio) {
      await db.query('ROLLBACK');
      return NextResponse.json({ error: 'Selecione a loja responsável' }, { status: 400 });
    }
    const loja = await db.query('SELECT id FROM public.lojas WHERE empresa_id=$1 AND UPPER(codigo)=$2 AND COALESCE(ativo,TRUE)', [empresaId, patio]);
    if (!loja.rowCount) {
      await db.query('ROLLBACK');
      return NextResponse.json({ error: 'Loja não pertence à empresa deste veículo' }, { status: 403 });
    }
    if (v.placa) {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`aurox-estoque:${empresaId}:${v.placa}`]);
      const dup = await db.query(`SELECT id FROM public.estoque_carros WHERE empresa_id=$1 AND id<>$2
        AND REGEXP_REPLACE(UPPER(COALESCE(placa,'')),'[^A-Z0-9]','','g')=$3 LIMIT 1`, [empresaId, a.id, v.placa]);
      if (dup.rowCount) {
        await db.query('ROLLBACK');
        return NextResponse.json({ error: 'Placa já cadastrada nesta empresa' }, { status: 409 });
      }
    }
    await db.query(`UPDATE public.estoque_carros SET
      marca=$1,modelo=$2,carro=$3,placa=$4,ano=$5,cor=$6,preco=$7,patio=$8,
      km=$9,carroceria=$10,aurox_detalhes=$11::jsonb
      WHERE id=$12 AND empresa_id=$13`, [
      v.marca,v.modelo,`${v.marca} ${v.modelo}`,v.placa,v.ano,v.cor,v.preco,patio,
      v.detalhes.km ?? null,v.detalhes.carroceria || null,JSON.stringify(v.detalhes),a.id,empresaId,
    ]);
    await auditarAlteracao(db, { usuario: a.user, empresaId, recurso: 'estoque', recursoId: a.id,
      acao: 'alterar', resumo: 'Ficha do veículo atualizada pelo usuário',
      campos: ['marca','modelo','ano','preco','placa','patio'] });
    await db.query('COMMIT');
    return NextResponse.json({ ok: true, id: a.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('[estoque editar]', e instanceof Error ? e.message : 'erro');
    return NextResponse.json({ error: 'Não foi possível salvar o veículo. Confirme as migrations.' }, { status: 503 });
  } finally { db.release(); }
}
