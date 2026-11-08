import {NextRequest,NextResponse} from 'next/server';
import {getPool} from '@/lib/db';
import {requireUser} from '@/lib/session';
import {auditarAlteracao} from '@/lib/auditoria';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const PAPEIS=new Set(['vendedor','gerente','admin','superadmin']);
function positive(x:unknown){const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0;}
export async function POST(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(!PAPEIS.has(u.tipo))return NextResponse.json({error:'Sem permissão para mover leads'},{status:403});
 const b=await req.json().catch(()=>null);
 const ids=[...new Set((Array.isArray(b?.ids)?b.ids:[b?.lead_id]).map(positive))].filter(Boolean);
 const acao=String(b?.acao||'mover');
 const status=acao==='recusar'?'recusado':'followup';
 const motivo=String(b?.motivo||'').trim().slice(0,400);
 if(!ids.length||ids.length>100||!['mover','recusar'].includes(acao))return NextResponse.json({error:'Selecione de 1 a 100 leads e uma ação válida'},{status:400});
 const empresaId=u.tipo==='superadmin'?positive(b?.empresa_id):positive(u.empresa_id);
 if(!empresaId)return NextResponse.json({error:'Selecione a empresa de destino'},{status:400});
 if(u.tipo==='vendedor'&&!positive(u.vendedor_id))return NextResponse.json({error:'Vendedor sem vínculo'},{status:403});
 const db=await getPool().connect();
 try{
  await db.query('BEGIN');
  const params:unknown[]=[ids,empresaId];
  let vendedor='';if(u.tipo==='vendedor'){params.push(u.vendedor_id);vendedor=` AND l.vendedor_id=$3`;}
  const {rows}=await db.query<{id:number;followup_status:string|null}>(`SELECT l.id,l.followup_status
     FROM public.leads l JOIN public.vendedores v ON v.id=l.vendedor_id
     WHERE l.id=ANY($1::bigint[]) AND v.empresa_id=$2 AND (l.empresa_id=$2 OR l.empresa_id IS NULL)
     ${vendedor} ORDER BY l.id FOR UPDATE OF l`,params);
  if(rows.length!==ids.length){await db.query('ROLLBACK');return NextResponse.json({error:'Um ou mais leads não pertencem à sua empresa ou à sua carteira. Nada foi movido.'},{status:403});}
  await db.query(`UPDATE public.leads SET followup_status=$1,followup_motivo=$2,followup_em=now(),followup_por=$3 WHERE id=ANY($4::bigint[])`,[status,motivo||null,u.id,ids]);
  for(const l of rows)await auditarAlteracao(db,{usuario:u,empresaId,recurso:'leads',recursoId:l.id,acao,
   resumo:acao==='recusar'?'Lead recusado pelo responsável':'Lead enviado ao Follow Up',
   campos:['followup_status'],antes:{followup_status:l.followup_status},depois:{followup_status:status}});
  await db.query('COMMIT');
  return NextResponse.json({ok:true,movidos:ids.length,status},{headers:{'Cache-Control':'no-store'}});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[followup mover]',e instanceof Error?e.message:'erro');
  return NextResponse.json({error:'Não foi possível movimentar. Verifique as migrations de Follow Up e Auditoria.'},{status:503});}
 finally{db.release();}
}
