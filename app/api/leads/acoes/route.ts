import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireUser } from '@/lib/session';
export const runtime='nodejs';
const GESTORES=new Set(['admin','gerente','marketing','superadmin']);
export async function POST(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 const b=await req.json().catch(()=>null);const acao=String(b?.acao||'');
 if(acao==='marcar_respondido')return NextResponse.json({error:'Atendido exige envio confirmado pelo WhatsApp. Abrir o link ou criar nota nao e prova de atendimento.'},{status:409});
 if(!['excluir','marcar_respondido','marcar_pendente','favoritar','agendar'].includes(acao))return NextResponse.json({error:'Ação desconhecida'},{status:400});
 const ids=[...new Set((Array.isArray(b?.ids)?b.ids:[]).map(Number))].filter(x=>Number.isSafeInteger(x)&&x>0);
 if(!ids.length||ids.length>100)return NextResponse.json({error:'Selecione até 100 leads'},{status:400});
 if(!GESTORES.has(u.tipo))return NextResponse.json({error:'Ações em massa exigem cargo administrativo'},{status:403});
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  const {rows}=await client.query(`SELECT l.id,l.empresa_id,v.loja FROM public.leads l LEFT JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=l.empresa_id WHERE l.id=ANY($1::bigint[]) AND l.empresa_id IS NOT NULL AND (l.vendedor_id IS NULL OR v.id IS NOT NULL) FOR UPDATE OF l`,[ids]);
  if(rows.length!==ids.length){await client.query('ROLLBACK');return NextResponse.json({error:'Algum lead não existe'},{status:404});}
  const autorizado=rows.every((r:any)=>u.tipo==='superadmin'||(
   u.empresa_id!=null&&r.empresa_id!=null&&Number(r.empresa_id)===Number(u.empresa_id)&&
   (u.tipo!=='gerente'||String(r.loja||'').toUpperCase()===String(u.loja||'').toUpperCase())
  ));
  if(!autorizado){await client.query('ROLLBACK');return NextResponse.json({error:'Um ou mais leads não pertencem à sua empresa/loja'},{status:403});}
  if(acao==='excluir') await client.query('DELETE FROM public.leads WHERE id=ANY($1::bigint[])',[ids]);
  else if(acao==='favoritar') await client.query(`INSERT INTO public.favoritos (usuario_id,lead_id)
    SELECT $2, l.id FROM public.leads l WHERE l.id=ANY($1::bigint[])
      AND NOT EXISTS (SELECT 1 FROM public.favoritos f WHERE f.usuario_id=$2 AND f.lead_id=l.id)`,[ids,u.id]);
  else if(acao==='agendar') {
    const dt=String(b?.data_hora_visita||'');
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt) || !Number.isFinite(Date.parse(dt))) {
      await client.query('ROLLBACK');return NextResponse.json({error:'Data e hora inválidas'},{status:400});
    }
    await client.query('UPDATE public.leads SET data_hora_visita=$2::timestamp WHERE id=ANY($1::bigint[])',[ids,dt]);
  }
  else await client.query('UPDATE public.leads SET respondeu=$2 WHERE id=ANY($1::bigint[])',[ids,acao==='marcar_respondido']);
  await client.query('COMMIT');return NextResponse.json({ok:true,alterados:ids.length});
 }catch(e:any){await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({error:'Não foi possível aplicar a ação em massa. '+String(e?.message||'').slice(0,130)},{status:500});}
 finally{client.release();}
}
