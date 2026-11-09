import {NextRequest,NextResponse} from 'next/server';
import {getPool,query} from '@/lib/db';
import {requireUser} from '@/lib/session';
import {auditarAlteracao} from '@/lib/auditoria';
export const runtime='nodejs';export const dynamic='force-dynamic';
const MANAGER=new Set(['gerente','admin','superadmin']);
const idNum=(v:unknown)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:0};
const cut=(v:unknown,len:number)=>String(v||'').trim().slice(0,len);
const escapeName=(v:unknown)=>cut(v,100).replace(/[{}\r\n]/g,' ');
function compose(kind:string,body:string,choices:string[]){
 if(kind==='mensagem')return body;
 return `${body}\n\n${choices.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nResponda com o número da opção desejada.`;
}
function personalize(s:string,l:{nome_lead:string;produto_interesse:string|null;vendedor_nome:string;loja:string|null}){
 return s.replace(/{{\s*(nome|veiculo|vendedor|loja)\s*}}/gi,(_m,k:string)=>({nome:escapeName(l.nome_lead),veiculo:escapeName(l.produto_interesse)||'seu veículo',vendedor:escapeName(l.vendedor_nome),loja:escapeName(l.loja)}[k.toLowerCase()]||''));
}
async function scope(req:NextRequest,empresa:unknown){
 const u=await requireUser(req);if(!u)return {error:NextResponse.json({error:'Não autenticado'},{status:401})} as const;
 if(!MANAGER.has(u.tipo))return {error:NextResponse.json({error:'Somente gerentes e administradores podem enviar campanhas'},{status:403})} as const;
 const empresaId=u.tipo==='superadmin'?idNum(empresa):idNum(u.empresa_id);
 if(!empresaId)return {error:NextResponse.json({error:'Selecione a empresa'},{status:400})} as const;
 return {u,empresaId};
}
export async function GET(req:NextRequest){
 const s=await scope(req,req.nextUrl.searchParams.get('empresa_id'));if('error'in s)return s.error;
 try{const {rows}=await query(`SELECT c.id,c.formato,c.titulo,c.estado,c.criado_em,
   COUNT(e.id)::int AS total,COUNT(e.id) FILTER (WHERE e.estado='enviado')::int AS enviados,
   COUNT(e.id) FILTER (WHERE e.estado='pendente')::int AS pendentes,
   COUNT(e.id) FILTER (WHERE e.estado IN ('erro','ignorado'))::int AS falhas
   FROM public.aurox_followup_campanhas c LEFT JOIN public.aurox_followup_envios e ON e.campanha_id=c.id AND e.empresa_id=c.empresa_id
   WHERE c.empresa_id=$1 GROUP BY c.id ORDER BY c.id DESC LIMIT 30`,[s.empresaId]);
  return NextResponse.json(rows,{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Execute a migration do Follow Up'},{status:503});}
}
export async function PATCH(req:NextRequest){
 const body=await req.json().catch(()=>null),s=await scope(req,body?.empresa_id);if('error'in s)return s.error;
 const id=idNum(body?.id);if(!id||body?.acao!=='pausar')return NextResponse.json({error:'Ação inválida'},{status:400});
 const db=await getPool().connect();try{
  await db.query('BEGIN');
  const r=await db.query(`UPDATE public.aurox_followup_campanhas SET estado='pausada' WHERE id=$1 AND empresa_id=$2 AND estado='ativa' RETURNING id`,[id,s.empresaId]);
  if(!r.rowCount){await db.query('ROLLBACK');return NextResponse.json({error:'Campanha não encontrada'},{status:404});}
  await db.query(`UPDATE public.aurox_followup_envios SET estado='cancelado' WHERE campanha_id=$1 AND empresa_id=$2 AND estado='pendente'`,[id,s.empresaId]);
  await auditarAlteracao(db,{usuario:s.u,empresaId:s.empresaId,recurso:'campanhas',recursoId:id,acao:'pausar',resumo:'Campanha de Follow Up pausada'});
  await db.query('COMMIT');return NextResponse.json({ok:true});
 }catch{await db.query('ROLLBACK').catch(()=>{});return NextResponse.json({error:'Falha ao pausar'},{status:503});}finally{db.release();}
}
export async function POST(req:NextRequest){
 const body=await req.json().catch(()=>null),s=await scope(req,body?.empresa_id);if('error'in s)return s.error;
 const {u,empresaId}=s;
 const tipo=cut(body?.formato,24),titulo=cut(body?.titulo,100),message=cut(body?.mensagem,550);
 const options=Array.isArray(body?.opcoes)?body.opcoes.map((v:unknown)=>cut(v,85)).filter(Boolean):[];
 const isList=['lista_texto','enquete_texto'].includes(tipo);
 if(!['mensagem','lista_texto','enquete_texto'].includes(tipo)||titulo.length<3||message.length<10||
   (isList&&(options.length<2||options.length>8))||(!isList&&options.length))
  return NextResponse.json({error:'Informe título, mensagem (mín. 10 caracteres) e 2 a 8 opções quando aplicável'},{status:400});
 if(body?.confirmado!==true)return NextResponse.json({error:'Revise e confirme consentimento e destinatários antes de agendar'},{status:400});
 const all=body?.todos===true;
 const ids=[...new Set((Array.isArray(body?.ids)?body.ids:[]).map(idNum))].filter(Boolean);
 if((!all&&!ids.length)||ids.length>100)return NextResponse.json({error:'Selecione de 1 a 100 leads ou use Todos'},{status:400});
 const db=await getPool().connect();try{
  await db.query('BEGIN');
  // Uma reserva de capacidade por empresa, evitando que campanhas paralelas excedam o teto.
  await db.query(`SELECT pg_advisory_xact_lock($1)`,[700000000+empresaId]);
  const sent=await db.query<{total:number}>(`SELECT COUNT(*)::int AS total FROM public.aurox_followup_envios
   WHERE empresa_id=$1 AND estado IN ('pendente','processando','enviado') AND agendado_em >= now()-interval '24 hours'`,[empresaId]);
  const rest=Math.max(0,30-Number(sent.rows[0]?.total||0));
  if(!rest){await db.query('ROLLBACK');return NextResponse.json({error:'Limite de segurança: até 30 agendamentos por empresa em 24 horas'},{status:429});}
  const params:unknown[]=[empresaId];let selected='';
  if(!all){params.push(ids);selected=` AND l.id=ANY($${params.length}::bigint[])`;}
  const r=await db.query<{id:number;nome_lead:string;produto_interesse:string|null;telefone:string|null;vendedor_nome:string;loja:string|null}>(
   `SELECT l.id,l.nome_lead,l.produto_interesse,l.telefone,v.nome AS vendedor_nome,v.loja
      FROM public.leads l JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=$1
     WHERE (l.empresa_id=$1 OR l.empresa_id IS NULL)
       AND l.followup_optin=TRUE AND l.followup_optout_em IS NULL
       AND l.followup_optin_em IS NOT NULL AND LENGTH(TRIM(COALESCE(l.followup_optin_origem,'')))>=8
       AND EXISTS(SELECT 1 FROM public.aurox_followup_permissoes cp WHERE cp.empresa_id=$1 AND cp.lead_id=l.id AND cp.revogado_em IS NULL)
       AND EXISTS (SELECT 1 FROM public.aurox_wa_contatos c JOIN public.aurox_wa_mensagens m
           ON m.contato_id=c.id AND m.empresa_id=c.empresa_id
         WHERE c.empresa_id=$1 AND c.lead_id=l.id AND m.direcao='recebida' AND m.recebida_em>=now()-interval '24 hours')
       AND (l.followup_status IN ('followup','recusado') OR
         EXISTS (SELECT 1 FROM public.fichas_credito f
          WHERE f.id=(SELECT MAX(f2.id) FROM public.fichas_credito f2 WHERE f2.lead_id=l.id)
          AND LOWER(COALESCE(f.status_geral,''))~'^(negad|recus|reprov)'))
       AND NOT EXISTS (SELECT 1 FROM public.aurox_followup_envios e WHERE e.empresa_id=$1 AND e.lead_id=l.id AND
         e.estado IN ('pendente','processando','enviado') AND e.agendado_em>now()-interval '7 days')
       ${selected}
     ORDER BY l.id LIMIT 101`,params);
  if(r.rows.length>100){await db.query('ROLLBACK');return NextResponse.json({error:'Há mais de 100 leads elegíveis. Refine a seleção.'},{status:400});}
  const targets=r.rows.filter(l=>/^\d{10,15}$/.test(String(l.telefone||'').replace(/\D/g,''))).slice(0,rest);
  if(!targets.length){await db.query('ROLLBACK');return NextResponse.json({error:'Nenhum contato elegível: verifique consentimento, telefone, intervalo de 7 dias e mensagem recebida nas últimas 24 horas.'},{status:422});}
  const template=compose(tipo,message,options);
  const camp=await db.query<{id:number}>(`INSERT INTO public.aurox_followup_campanhas(empresa_id,criado_por,formato,titulo,conteudo)
    VALUES($1,$2,$3,$4,$5) RETURNING id`,[empresaId,u.id,tipo,titulo,template]);
  for(let i=0;i<targets.length;i++){
   const target=targets[i];const full=personalize(template,target);
   if(full.length>1800)throw new Error('Mensagem final excede o limite');
   await db.query(`INSERT INTO public.aurox_followup_envios(empresa_id,campanha_id,lead_id,texto,agendado_em)
     VALUES($1,$2,$3,$4,now()+($5::integer * interval '2 minutes'))`,[empresaId,camp.rows[0].id,target.id,full,i]);
  }
  await auditarAlteracao(db,{usuario:u,empresaId,recurso:'campanhas',recursoId:camp.rows[0].id,acao:'enviar',
   resumo:'Campanha de Follow Up agendada',campos:[]});
  await db.query('COMMIT');
  return NextResponse.json({ok:true,agendados:targets.length,ignorados:all?null:ids.length-targets.length,
   observacao:'Envios agendados com consentimento e limites; não há garantia de entrega nem de ausência de bloqueio.'},{status:201});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[followup campanha]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Não foi possível agendar campanha. Verifique limites e migrations.'},{status:503});}
 finally{db.release();}
}
