/** Cadastro manual de veículo; registro e auditoria na mesma transação, sempre isolado por empresa. */
export async function POST(req: NextRequest) {
  const u=await requireUser(req);
  if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
  if(!['superadmin','admin','gerente','marketing'].includes(String(u.tipo).toLowerCase()))
    return NextResponse.json({error:'Sem permissão para cadastrar veículos'},{status:403});
  const raw=await req.json().catch(()=>null);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return NextResponse.json({error:'Dados inválidos'},{status:400});
  const empresaId=u.tipo==='superadmin'?Number(raw.empresa_id):Number(u.empresa_id);
  if(!Number.isSafeInteger(empresaId)||empresaId<=0)return NextResponse.json({error:'Empresa obrigatória'},{status:400});
  let dados:ReturnType<typeof prepararVeiculo>;
  try{dados=prepararVeiculo(raw);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Veículo inválido'},{status:400});}
  const patio=u.tipo==='gerente'?String(u.loja||'').trim().toUpperCase():String(raw.patio||u.loja||'').trim().toUpperCase();
  if(!patio)return NextResponse.json({error:'Loja responsável obrigatória'},{status:400});
  const db=await getPool().connect().catch(()=>null);
  if(!db)return NextResponse.json({error:'Banco de dados indisponível'},{status:503});
  try{
    await db.query('BEGIN');
    const empresa=await db.query(`SELECT id FROM public.empresas WHERE id=$1 AND COALESCE(ativo,TRUE)`,[empresaId]);
    const loja=await db.query(`SELECT codigo FROM public.lojas WHERE empresa_id=$1 AND UPPER(codigo)=$2 AND COALESCE(ativo,TRUE)`,[empresaId,patio]);
    if(!empresa.rowCount||!loja.rowCount){await db.query('ROLLBACK');return NextResponse.json({error:'Empresa ou loja inexistente/inativa'},{status:403});}
    if(dados.placa){
      await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`aurox-estoque:${empresaId}:${dados.placa}`]);
      const duplicado=await db.query(`SELECT id FROM public.estoque_carros
        WHERE empresa_id=$1 AND REPLACE(REPLACE(UPPER(COALESCE(placa,'')),'-',''),' ','')=$2 LIMIT 1`,[empresaId,dados.placa]);
      if(duplicado.rowCount){await db.query('ROLLBACK');return NextResponse.json({error:'Esta placa já está cadastrada nesta empresa'},{status:409});}
    }
    const {rows}=await db.query(`INSERT INTO public.estoque_carros
      (empresa_id,marca,carro,modelo,placa,ano,cor,preco,patio,status,aurox_detalhes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'Disponível',$10::jsonb) RETURNING id`,[
      empresaId,dados.marca,`${dados.marca} ${dados.modelo}`,dados.modelo,dados.placa,
      dados.ano,dados.cor,dados.preco,patio,JSON.stringify(dados.detalhes),
    ]);
    await db.query(`INSERT INTO public.aurox_auditoria_alteracoes
      (empresa_id,usuario_id,tipo_usuario,recurso,recurso_id,acao,resumo,campos)
      VALUES($1,$2,$3,'estoque',$4,'criar','Veículo cadastrado no estoque',ARRAY['marca','modelo','ano','preco','placa','patio'])`,
      [empresaId,u.id,u.tipo,rows[0]?.id]);
    await db.query('COMMIT');
    return NextResponse.json({ok:true,id:rows[0]?.id},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[cadastro-estoque]',e instanceof Error?e.message:'erro');
    return NextResponse.json({error:'Erro ao cadastrar veículo. Confirme as migrations de auditoria e detalhes.'},{status:500});}
  finally{db.release();}
}
