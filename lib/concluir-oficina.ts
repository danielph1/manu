import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import type { SessionUser } from '@/lib/session';
import { auditarAlteracao } from '@/lib/auditoria';

/** A conclusão desloca o veículo para a carteira de estoque/anúncios. Não publica em terceiros. */
export async function concluirOficina(u: SessionUser, raw: Record<string, unknown>) {
  const gestores = ['marketing', 'gerente', 'admin', 'superadmin'];
  if (!gestores.includes(String(u.tipo).toLowerCase())) {
    return NextResponse.json({ error: 'Só gerência, marketing e administradores podem liberar veículos para o estoque' }, { status: 403 });
  }
  const id = Number(raw.id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Oficina inválida' }, { status: 400 });
  const db = await getPool().connect();
  try {
    await db.query('BEGIN');
    const r = await db.query<{
      id: number; empresa_id: number | null; loja: string | null; pronto: boolean | null;
      estoque_carro_id: number | null; marca: string; modelo: string; ano_modelo: string | number | null;
      placa: string; cor: string | null; valor_final: unknown; onde_esta: string | null;
    }>('SELECT * FROM public.oficina_carros WHERE id=$1 FOR UPDATE', [id]);
    const item = r.rows[0]; const empresaId = Number(item?.empresa_id);
    if (!item || !Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      (u.tipo !== 'superadmin' && empresaId !== Number(u.empresa_id)) ||
      (u.tipo === 'gerente' && (!u.loja || String(item.loja || '').toUpperCase() !== String(u.loja).toUpperCase()))) {
      await db.query('ROLLBACK');
      return NextResponse.json({ error: 'Oficina fora da sua empresa ou loja' }, { status: 403 });
    }
    const placa = String(item.placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!/^[A-Z0-9]{7}$/.test(placa)) {
      await db.query('ROLLBACK'); return NextResponse.json({ error: 'Informe uma placa válida antes de marcar como pronto' }, { status: 422 });
    }
    if (item.pronto) {
      await db.query('COMMIT');
      return NextResponse.json({ ok: true, ja_estava_pronto: true });
    }
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`aurox-estoque:${empresaId}:${placa}`]);
    const estoque = await db.query<{ id: number; status: string | null; status_estoque: string | null }>(
      `SELECT id,status,status_estoque FROM public.estoque_carros WHERE empresa_id=$1
        AND (id=$2 OR REGEXP_REPLACE(UPPER(COALESCE(placa,'')),'[^A-Z0-9]','','g')=$3)
        ORDER BY CASE WHEN id=$2 THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE`,
      [empresaId, item.estoque_carro_id || 0, placa],
    );
    let estoqueId = estoque.rows[0]?.id;
    if (estoqueId && (/vendid/i.test(String(estoque.rows[0].status || '')) ||
      String(estoque.rows[0].status_estoque || '').toLowerCase() === 'inativo')) {
      await db.query('ROLLBACK');
      return NextResponse.json({ error: 'Veículo vendido/inativo. Revise o histórico antes de liberá-lo novamente.' }, { status: 409 });
    }
    const patio = String(item.loja || u.loja || '').toUpperCase().trim();
    const loja = await db.query('SELECT codigo FROM public.lojas WHERE empresa_id=$1 AND UPPER(codigo)=$2', [empresaId, patio]);
    if (!loja.rowCount) {
      await db.query('ROLLBACK');
      return NextResponse.json({ error: 'Veículo da oficina sem loja válida para o estoque' }, { status: 422 });
    }
    if (estoqueId) {
      await db.query(`UPDATE public.estoque_carros SET status_estoque='ativo',status='Disponível',
        patio=$1 WHERE id=$2 AND empresa_id=$3`, [patio, estoqueId, empresaId]);
    } else {
      const ano = Number(String(item.ano_modelo || '').slice(0,4));
      const preco = Number(String(item.valor_final ?? '').replace(',','.'));
      const ins = await db.query<{id:number}>(`INSERT INTO public.estoque_carros
        (empresa_id,marca,modelo,carro,ano,placa,cor,preco,patio,status,status_estoque,anunciado,aurox_detalhes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'Disponível','ativo',FALSE,'{}'::jsonb) RETURNING id`,
        [empresaId,item.marca,item.modelo,`${item.marca} ${item.modelo}`,Number.isInteger(ano)&&ano>1900?ano:null,
         placa,item.cor||null,Number.isFinite(preco)&&preco>=0?preco:0,patio]);
      estoqueId = ins.rows[0].id;
    }
    await db.query(`UPDATE public.oficina_carros SET pronto=TRUE,estoque_carro_id=$1,
      atualizado_por_id=$2,updated_at=now() WHERE id=$3 AND empresa_id=$4`,[estoqueId,u.id,id,empresaId]);
    await auditarAlteracao(db,{usuario:u,empresaId,recurso:'oficina',recursoId:id,acao:'alterar',
      resumo:'Veículo concluído na oficina e enviado para Estoque/Anúncios',campos:['status']});
    await db.query('COMMIT');
    return NextResponse.json({ok:true,estoque_id:estoqueId,mensagem:'Veículo pronto e disponível no Estoque e na aba Anúncios. A publicação externa é manual.'},
      {headers:{'Cache-Control':'no-store'}});
  } catch (e) {
    await db.query('ROLLBACK').catch(()=>{});
    console.error('[oficina concluir]',e instanceof Error?e.message:'erro');
    return NextResponse.json({error:'Não foi possível concluir e mover o veículo. Nenhuma transferência parcial foi confirmada.'},{status:503});
  } finally { db.release(); }
}
