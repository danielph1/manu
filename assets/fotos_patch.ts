/** Ordem das fotos do mesmo veículo, sempre validada por empresa no servidor. */
export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!canEditFotos(u.tipo)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const carroId = Number(body?.carro_id);
  const ids: number[] = Array.isArray(body?.ordem) ? body.ordem.map(Number) : [];
  if (!Number.isSafeInteger(carroId) || carroId <= 0 || !ids.length || ids.length > 20 ||
    ids.some(v => !Number.isSafeInteger(v) || v <= 0) || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'Informe a ordem completa das fotos válidas' }, { status: 400 });
  }
  if (!(await podeAcessarVeiculo(u, carroId))) {
    return NextResponse.json({ error: 'Veículo de outra empresa' }, { status: 403 });
  }
  const db = await getPool().connect();
  try {
    await db.query('BEGIN');
    const r = await db.query<{id:number}>('SELECT id FROM public.estoque_fotos WHERE carro_id=$1 ORDER BY id FOR UPDATE', [carroId]);
    const atuais = r.rows.map(v => Number(v.id)).sort((a,b)=>a-b);
    const enviados = [...ids].sort((a,b)=>a-b);
    if (atuais.length !== enviados.length || atuais.some((v,i)=>v!==enviados[i])) {
      await db.query('ROLLBACK');
      return NextResponse.json({ error: 'A lista de fotos mudou. Atualize a página antes de reordenar.' }, { status: 409 });
    }
    for (let i=0;i<ids.length;i++) await db.query('UPDATE public.estoque_fotos SET ordem=$1 WHERE carro_id=$2 AND id=$3', [i,carroId,ids[i]]);
    await db.query('COMMIT');
    return NextResponse.json({ok:true});
  } catch (e) {
    await db.query('ROLLBACK').catch(()=>{});
    console.error('[estoque fotos ordenar]',e instanceof Error?e.message:'erro');
    return NextResponse.json({error:'Falha ao salvar a ordem das fotos'},{status:503});
  } finally {db.release();}
}
