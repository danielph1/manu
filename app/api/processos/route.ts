import {NextRequest,NextResponse} from 'next/server';import {query,queryOne,getPool} from '@/lib/db';
import {auditarAlteracao} from '@/lib/auditoria';
import {requireUser,can} from '@/lib/session';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(u.tipo!=='superadmin'&&!u.empresa_id)return NextResponse.json({error:'Empresa não vinculada'},{status:403});
 const empresaQuery=Number(req.nextUrl.searchParams.get('empresa_id'));
 if(u.tipo!=='superadmin'&&empresaQuery>0&&empresaQuery!==Number(u.empresa_id))return NextResponse.json({error:'Empresa não autorizada'},{status:403});
 const empresaId=u.tipo==='superadmin'?(Number.isSafeInteger(empresaQuery)&&empresaQuery>0?empresaQuery:null):Number(u.empresa_id);
 const params:unknown[]=[];let scope=`p.empresa_id IS NOT NULL`;
 if(empresaId){params.push(empresaId);scope+=` AND p.empresa_id=$${params.length}`;}
 const seller=u.tipo==='vendedor'?Number(u.vendedor_id||0):0;
 if(u.tipo==='vendedor'&&!seller)return NextResponse.json([]);
 if(seller){params.push(seller);scope+=` AND l.vendedor_id=$${params.length}`;}
 const loja=u.tipo==='gerente'?String(u.loja||''):'';
 if(u.tipo==='gerente'&&!loja)return NextResponse.json({error:'Gerente sem loja atribuída'},{status:403});
 if(loja){params.push(loja);scope+=` AND UPPER(COALESCE(v.loja,fat.loja,''))=UPPER($${params.length})`;}
 try{
  // Criação de processos idempotente por empresa, nunca cruza placa de outro locatário.
  if(empresaId)await query(`INSERT INTO public.processos_transferencia
   (empresa_id,ficha_id,lead_id,placa,nome_lead,marca,modelo,ano,cor,status,observacao)
   SELECT fat.empresa_id,fat.ficha_id,fat.lead_id,fat.placa,fat.nome,fat.marca,
     COALESCE(fat.modelo,fat.carro),COALESCE(fat.ano_modelo,fat.ano),fat.cor,
     'em_andamento','auto: liberado no faturamento'
   FROM public.faturamentos fat WHERE fat.empresa_id=$1
     AND (COALESCE(fat.liberado,FALSE)=TRUE OR LOWER(COALESCE(fat.status,'')) IN ('emitido','liberado'))
     AND NOT EXISTS (SELECT 1 FROM public.processos_transferencia p WHERE p.empresa_id=fat.empresa_id
        AND ((fat.ficha_id IS NOT NULL AND p.ficha_id=fat.ficha_id)
          OR (fat.placa IS NOT NULL AND UPPER(REGEXP_REPLACE(COALESCE(p.placa,''),'[^A-Z0-9]','','g'))=
              UPPER(REGEXP_REPLACE(COALESCE(fat.placa,''),'[^A-Z0-9]','','g')))))
   LIMIT 50`,[empresaId]);
  const {rows}=await query(`SELECT p.id,p.ficha_id,p.status,p.observacao,p.empresa_id,
    COALESCE(p.gravame,FALSE) AS gravame,COALESCE(p.reconheceu_firma,FALSE) AS reconheceu_firma,
    COALESCE(p.documento_pronto,FALSE) AS documento_pronto,p.updated_at,
    COALESCE(f.lead_id,fat.lead_id,p.lead_id) AS lead_id,f.vendedor_id,
    COALESCE(NULLIF(TRIM(p.nome_lead),''),fat.nome,l.nome_lead,'—') AS nome_lead,
    COALESCE(NULLIF(TRIM(p.placa),''),fat.placa,l.placa_carro,'') AS placa,
    COALESCE(NULLIF(TRIM(p.marca),''),fat.marca,est.marca,l.marca_carro,'') AS marca,
    COALESCE(NULLIF(TRIM(p.modelo),''),fat.modelo,fat.carro,est.modelo,l.produto_interesse,'') AS modelo,
    COALESCE(NULLIF(TRIM(p.ano::text),''),fat.ano_modelo::text,est.ano::text,l.ano_carro::text,'') AS ano,
    COALESCE(NULLIF(TRIM(p.cor),''),fat.cor,est.cor,l.cor_carro,'') AS cor,
    fat.created_at AS compra_em,fat.status AS fat_status,COALESCE(fat.liberado,FALSE) AS liberado,
    v.nome AS vendedor_nome,COALESCE(fat.vendedor_nome,v.nome) AS vendedor_display
   FROM public.processos_transferencia p
   LEFT JOIN public.fichas_credito f ON f.id=p.ficha_id AND EXISTS
     (SELECT 1 FROM public.leads lx WHERE lx.id=f.lead_id AND lx.empresa_id=p.empresa_id)
   LEFT JOIN public.leads l ON l.id=COALESCE(f.lead_id,p.lead_id) AND l.empresa_id=p.empresa_id
   LEFT JOIN public.vendedores v ON v.id=COALESCE(f.vendedor_id,l.vendedor_id) AND v.empresa_id=p.empresa_id
   LEFT JOIN LATERAL (SELECT e.marca,e.modelo,e.ano,e.cor FROM public.estoque_carros e
      WHERE e.empresa_id=p.empresa_id AND COALESCE(p.placa,'')<>''
       AND UPPER(REGEXP_REPLACE(COALESCE(e.placa,''),'[^A-Z0-9]','','g'))=
           UPPER(REGEXP_REPLACE(COALESCE(p.placa,''),'[^A-Z0-9]','','g'))
      ORDER BY e.id DESC LIMIT 1) est ON TRUE
   LEFT JOIN LATERAL (SELECT fat2.* FROM public.faturamentos fat2
     WHERE fat2.empresa_id=p.empresa_id AND
     ((p.ficha_id IS NOT NULL AND fat2.ficha_id=p.ficha_id)
       OR (p.lead_id IS NOT NULL AND fat2.lead_id=p.lead_id)
       OR (COALESCE(p.placa,'')<>'' AND UPPER(REGEXP_REPLACE(COALESCE(fat2.placa,''),'[^A-Z0-9]','','g'))=
        UPPER(REGEXP_REPLACE(COALESCE(p.placa,''),'[^A-Z0-9]','','g'))))
      ORDER BY fat2.id DESC LIMIT 1) fat ON TRUE
   WHERE ${scope} ORDER BY p.updated_at DESC NULLS LAST,p.id DESC LIMIT 150`,params);
  return NextResponse.json(rows,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){console.error('[processos GET]',e instanceof Error?e.message:'erro');
  return NextResponse.json({error:'Falha ao consultar Transferências. Confira a migration de isolamento.'},{status:503});}
}
export async function PATCH(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(!can.editarDocumental(u)&&!['superadmin','admin','gerente','documentista'].includes(u.tipo))
  return NextResponse.json({error:'Sem permissão'},{status:403});
 const b=await req.json().catch(()=>null),id=Number(b?.id);
 if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'ID inválido'},{status:400});
 const empresaId=u.tipo==='superadmin'?Number(b?.empresa_id||0):Number(u.empresa_id||0);
 if(!Number.isSafeInteger(empresaId)||empresaId<=0)return NextResponse.json({error:'Empresa obrigatória para atualizar Transferências'},{status:403});
 const permitidos=['status','observacao','gravame','reconheceu_firma','documento_pronto'];
 const values=permitidos.filter(k=>b&&Object.prototype.hasOwnProperty.call(b,k));
 if(!values.length)return NextResponse.json({error:'Nada para atualizar'},{status:400});
 const db=await getPool().connect();
 try{
  await db.query('BEGIN');
  const args:unknown[]=[id,empresaId];let loja='';
  if(u.tipo==='gerente'){
   if(!u.loja){await db.query('ROLLBACK');return NextResponse.json({error:'Gerente sem loja'},{status:403});}
   args.push(u.loja);
   loja=` AND EXISTS(SELECT 1 FROM public.faturamentos f WHERE f.empresa_id=p.empresa_id
     AND (f.ficha_id=p.ficha_id OR f.lead_id=p.lead_id)
     AND UPPER(COALESCE(f.loja,''))=UPPER($3))`;
  }
  const {rows}=await db.query<Record<string,unknown>>(`SELECT p.* FROM public.processos_transferencia p
   WHERE p.id=$1 AND p.empresa_id=$2 ${loja} FOR UPDATE OF p`,args);
  const old=rows[0];if(!old){await db.query('ROLLBACK');return NextResponse.json({error:'Processo fora da empresa ou loja'},{status:403});}
  const change=values.map((k,i)=>`${k}=$${i+1}`);
  const params=values.map(k=>k==='observacao'?String(b[k]||'').slice(0,2000):b[k]);
  params.push(id,empresaId);
  await db.query(`UPDATE public.processos_transferencia SET ${change.join(', ')},updated_at=now()
   WHERE id=$${params.length-1} AND empresa_id=$${params.length}`,params);
  await auditarAlteracao(db,{usuario:u,empresaId,recurso:'transferencias',recursoId:id,acao:'alterar',
   resumo:'Processo de transferência atualizado',campos:values,
   antes:old,depois:Object.fromEntries(values.map(k=>[k,k==='observacao'?String(b[k]||'').slice(0,2000):b[k]]))});
  await db.query('COMMIT');return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[processos PATCH]',e instanceof Error?e.message:'erro');
  return NextResponse.json({error:'Não foi possível atualizar e auditar a transferência'},{status:503});}
 finally{db.release();}
}
