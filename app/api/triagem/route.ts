import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, getPool } from '@/lib/db';
import { gestorIntegracoes } from '@/lib/integracoes/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Checagem da fila sempre limitada à empresa para não atribuir leads entre clientes. */
async function expirar(empresaId: number | null, superadmin: boolean) {
  const {rows} = await query<{id:number;empresa_id:number}>(
    `SELECT id,empresa_id FROM public.triagem
      WHERE status='aguardando' AND empresa_id IS NOT NULL
        AND created_at < now() - interval '1 minute'
        AND ($1::boolean OR empresa_id=$2)
      ORDER BY created_at LIMIT 50`,[superadmin,empresaId],
  );
  for(const t of rows) {
    const v=await queryOne<{id:number}>(
      `SELECT id FROM public.vendedores
        WHERE empresa_id=$1 AND LOWER(COALESCE(nome,'')) <> 'matheus'
        ORDER BY random() LIMIT 1`,[t.empresa_id]);
    if(v) await virarLead(t.id,v.id,t.empresa_id).catch(err=>console.error('triagem auto',err instanceof Error?err.message:'erro'));
  }
}

/** Operação atômica: row lock, valida empresa do vendedor e registra lead exatamente uma vez. */
async function virarLead(triagemId:number,vendedorId:number,empresaPermitida:number | null) {
  const client=await getPool().connect();
  let leadId:number | null=null; let mensagem='';
  try {
    await client.query('BEGIN');
    const {rows:[t]}=await client.query(
      `SELECT * FROM public.triagem WHERE id=$1 AND status='aguardando' FOR UPDATE`,[triagemId]);
    if(!t) {await client.query('ROLLBACK');return null;}
    const {rows:[v]}=await client.query(
      `SELECT id,empresa_id FROM public.vendedores WHERE id=$1`,[vendedorId]);
    if(!v || !v.empresa_id || (t.empresa_id!=null && Number(t.empresa_id)!==Number(v.empresa_id)) ||
       (empresaPermitida!=null && Number(v.empresa_id)!==empresaPermitida)) {
      await client.query('ROLLBACK');throw new Error('vendedor não pertence à empresa do lead');
    }
    const {rows:[lead]}=await client.query(
      `INSERT INTO public.leads
        (nome_lead,telefone,email,produto_interesse,observacao,vendedor_id,data_lead,atribuido_em,rotacionar)
       VALUES($1,$2,$3,$4,$5,$6,now(),now(),TRUE) RETURNING id`,
      [t.nome,t.telefone,t.email,t.interesse,`[${t.origem}] ${t.mensagem||''}`.trim(),vendedorId],
    );
    leadId=Number(lead.id);mensagem=String(t.mensagem||'');
    await client.query(
      `UPDATE public.triagem SET status='atribuido',empresa_id=$1,vendedor_id=$2,lead_id=$3 WHERE id=$4`,
      [v.empresa_id,vendedorId,leadId,triagemId],
    );
    await client.query('COMMIT');
  } catch(err) {await client.query('ROLLBACK');throw err;}
  finally {client.release();}
  if(leadId && mensagem) {
    // Falha em chat não desfaz um lead já criado.
    try {
      await query(`INSERT INTO public.chat_geral_mensagens(remetente_id,mensagem,lead_id)
        VALUES(NULL,$1,$2)`,[`[cliente] ${mensagem}`,leadId]);
    } catch {/* configuração de chat pode ser diferente */}
  }
  return leadId;
}

export async function GET(req:NextRequest) {
  try {
    const actor=await gestorIntegracoes(req);
    if(!actor) return NextResponse.json({error:'sem permissão'},{status:403});
    await expirar(actor.empresa_id,actor.tipo==='superadmin');
    const {rows}=await query(
      `SELECT t.* FROM public.triagem t
        WHERE t.status='aguardando' AND ($1::boolean OR t.empresa_id=$2)
        ORDER BY t.created_at ASC LIMIT 300`,
      [actor.tipo==='superadmin',actor.empresa_id],
    );
    return NextResponse.json(rows,{headers:{'Cache-Control':'no-store'}});
  } catch(err) {console.error('triagem GET',err instanceof Error?err.message:'erro');
    return NextResponse.json({error:'erro ao consultar triagem'},{status:500});}
}

export async function POST(req:NextRequest) {
  try {
    const actor=await gestorIntegracoes(req);
    if(!actor) return NextResponse.json({error:'sem permissão'},{status:403});
    const b=await req.json().catch(()=>null);
    const id=Number(b?.id);
    let vendedorId=Number(b?.vendedor_id||0);
    if(!Number.isSafeInteger(id)||id<=0) return NextResponse.json({error:'id inválido'},{status:400});
    const alvo=await queryOne<{empresa_id:number|null}>(`SELECT empresa_id FROM public.triagem
      WHERE id=$1 AND ($2::boolean OR empresa_id=$3)`,[id,actor.tipo==='superadmin',actor.empresa_id]);
    if(!alvo) return NextResponse.json({error:'triagem não encontrada na sua empresa'},{status:404});
    if(!vendedorId&&b?.loja) {
      const v=await queryOne<{id:number}>(
        `SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,''))=UPPER($1)
          AND ($2::boolean OR empresa_id=$3) AND ($4::int IS NULL OR empresa_id=$4)
          ORDER BY random() LIMIT 1`,
        [String(b.loja).slice(0,30),actor.tipo==='superadmin',actor.empresa_id,alvo.empresa_id],
      );
      vendedorId=v?.id||0;
    }
    if(!Number.isSafeInteger(vendedorId)||vendedorId<=0) return NextResponse.json({error:'escolha um vendedor ou loja'},{status:400});
    // No caso de triagem legado sem empresa, só superadmin poderá decidir onde atribuí-la.
    if(alvo.empresa_id==null&&actor.tipo!=='superadmin')return NextResponse.json({error:'triagem antiga sem empresa'},{status:403});
    const leadId=await virarLead(id,vendedorId,alvo.empresa_id ?? actor.empresa_id);
    return NextResponse.json({ok:true,lead_id:leadId});
  } catch(err) {console.error('triagem POST',err instanceof Error?err.message:'erro');
    return NextResponse.json({error:'não foi possível atribuir esse lead'},{status:500});}
}
