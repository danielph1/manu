import {NextRequest,NextResponse} from 'next/server';
import {getPool,query} from '@/lib/db';
import {requireUser} from '@/lib/session';
import {supabaseAdmin} from '@/lib/supabase';
import {auditarAlteracao} from '@/lib/auditoria';
import {BUCKET_COLETIVO,FINALIDADES,MAX_ALVOS_CAMPANHA,MIDIAS,parseSegmento,publicoSQL,publicoTotalSQL,personalizar,validaMidia,
 type Finalidade,type Segmento,type MimeColetivo} from '@/lib/anuncio-coletivo';
export const runtime='nodejs';export const dynamic='force-dynamic';
const GESTORES=new Set(['marketing','gerente','admin','superadmin']);
const id=(v:unknown)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:0};
const texto=(v:unknown,n:number)=>String(v||'').trim().slice(0,n);
async function scope(req:NextRequest,requested:unknown){
 const u=await requireUser(req);
 if(!u)return {error:NextResponse.json({error:'Não autenticado'},{status:401})} as const;
 if(!GESTORES.has(u.tipo))return {error:NextResponse.json({error:'Sem acesso ao Anúncio Coletivo'},{status:403})} as const;
 const empresaId=u.tipo==='superadmin'?id(requested):id(u.empresa_id);
 if(!empresaId)return {error:NextResponse.json({error:'Selecione a empresa'},{status:400})} as const;
 return {u,empresaId};
}
function finalidade(v:unknown):Finalidade{
 const f=String(v||'promocoes');if(!FINALIDADES.includes(f as Finalidade))throw new Error('Finalidade inválida');
 return f as Finalidade;
}
function requestSegment(modo:unknown,interesse:unknown){return parseSegmento(modo,interesse);}
function bad(e:unknown){return NextResponse.json({error:e instanceof Error?e.message:'Parâmetros inválidos'},{status:400});}
export async function GET(req:NextRequest){
 const q=req.nextUrl.searchParams,s=await scope(req,q.get('empresa_id'));if('error'in s)return s.error;
 try{
  if(q.get('modo')==='preview'){
   const f=finalidade(q.get('finalidade'));const seg=requestSegment(q.get('segmento'),q.get('interesse'));
   const spec=publicoSQL(s.empresaId,f,seg.segmento,seg.termo);
   // Mostra toda a base no segmento, mas só permite enviar aos autorizados.
   const totalSpec=publicoTotalSQL(s.empresaId,f,seg.segmento,seg.termo);
   const [autorizados,base]=await Promise.all([
     query(spec.sql,spec.params),
     query<{total_leads:number;telefones_validos:number}>(totalSpec.sql,totalSpec.params),
   ]);
   const baseResumo=base.rows[0];
   return NextResponse.json({
     elegiveis:Math.min(autorizados.rows.length,MAX_ALVOS_CAMPANHA),
     excede_limite:autorizados.rows.length>MAX_ALVOS_CAMPANHA,
     total_leads:Number(baseResumo?.total_leads||0),
     telefones_validos:Number(baseResumo?.telefones_validos||0),
   },
    {headers:{'Cache-Control':'private, no-store'}});
  }
  const {rows}=await query(`SELECT c.id,c.titulo,c.finalidade,c.formato,c.criado_em,c.estado,c.segmento,
    c.media_mime,COUNT(e.id)::int AS total,
    COUNT(e.id) FILTER (WHERE e.estado='enviado')::int AS aceitos,
    COUNT(e.id) FILTER (WHERE e.estado='confirmado_manual')::int AS confirmados_manual,
    COUNT(e.id) FILTER (WHERE e.estado='pendente')::int AS pendentes,
    COUNT(e.id) FILTER (WHERE e.estado='processando')::int AS processando,
    COUNT(e.id) FILTER (WHERE e.estado='incerto')::int AS incertos,
    COUNT(e.id) FILTER (WHERE e.estado IN ('erro','ignorado'))::int AS falhas,
    COUNT(e.id) FILTER (WHERE e.estado='cancelado')::int AS cancelados
   FROM public.aurox_followup_campanhas c
   LEFT JOIN public.aurox_followup_envios e ON e.campanha_id=c.id AND e.empresa_id=c.empresa_id
   WHERE c.empresa_id=$1 AND c.origem='coletivo' GROUP BY c.id ORDER BY c.id DESC LIMIT 40`,[s.empresaId]);
  return NextResponse.json({campanhas:rows},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){console.error('[coletivo GET]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Não foi possível listar campanhas. Confira a migration do Anúncio Coletivo.'},{status:503});}
}

export async function POST(req:NextRequest){
 const b=await req.json().catch(()=>null),s=await scope(req,b?.empresa_id);if('error'in s)return s.error;
 try{
  if(b?.confirmado!==true)throw new Error('Confirme que revisou a autorização e os destinatários');
  const f=finalidade(b?.finalidade),seg=requestSegment(b?.segmento,b?.interesse);
  const testeId=b?.teste_id==null?0:id(b.teste_id);
  if(b?.teste_id!=null&&!testeId)throw new Error('Contato de teste inválido');
  const titulo=texto(b?.titulo,100),mensagem=texto(b?.mensagem,550);
  if(titulo.length<3||mensagem.length<10)throw new Error('Informe um título e uma mensagem de pelo menos 10 caracteres');
  const mediaId=b?.media_id==null?0:id(b.media_id);
  if(b?.media_id!=null&&!mediaId)throw new Error('Mídia inválida');
  const start=b?.iniciar_em?new Date(String(b.iniciar_em)):new Date();
  if(!Number.isFinite(start.getTime())||start.getTime()<Date.now()-60_000||start.getTime()>Date.now()+90*86400_000)
   throw new Error('Agende entre agora e os próximos 90 dias');
  const {sql,params}=publicoSQL(s.empresaId,f,seg.segmento,seg.termo,MAX_ALVOS_CAMPANHA+1,testeId||undefined);
  const publicos=await query<{id:number;nome_lead:string;telefone:string;produto_interesse:string|null;vendedor_nome:string;loja:string}>(sql,params);
  if(!publicos.rows.length)return NextResponse.json({error:testeId?'Contato de teste não pertence à empresa ou não autorizou esta finalidade':'Nenhum contato autorizou esta finalidade no segmento selecionado'},{status:422});
  if(publicos.rows.length>MAX_ALVOS_CAMPANHA)return NextResponse.json({error:`Segmento acima de ${MAX_ALVOS_CAMPANHA} contatos; refine os filtros para criar lotes seguros`},{status:422});
  let media:{path:string;mime:MimeColetivo;nome:string}|null=null;
  if(mediaId){
    const record=await query<{path:string;mime:MimeColetivo;bytes_esperados:number}>(`SELECT path,mime,bytes_esperados FROM public.aurox_coletivo_midia
      WHERE id=$1 AND empresa_id=$2 AND criado_por=$3`,[mediaId,s.empresaId,s.u.id]);
    const item=record.rows[0];if(!item)throw new Error('Mídia não pertence a esta empresa ou usuário');
    const max=MIDIAS[item.mime]?.max;
    if(!max||!new RegExp(`^coletivo/${s.empresaId}/[0-9a-f-]{36}\\.(jpg|png|mp4)$`,'i').test(item.path))throw new Error('Caminho da mídia inválido');
    const {data,error}=await supabaseAdmin.storage.from(BUCKET_COLETIVO).download(item.path);
    if(error||!data)throw new Error('O arquivo não foi enviado ao Storage. Tente carregar novamente.');
    const file=Buffer.from(await data.arrayBuffer());
    if(file.length!==item.bytes_esperados||file.length>max||!validaMidia(file,item.mime))
      throw new Error('Mídia incompleta, alterada ou de formato não permitido');
    media={path:item.path,mime:item.mime,nome:item.path.split('/').at(-1)||'midia'};
  }
  // Uma transacao reserva todos os destinos; API nunca aceita ids arbitrarios do navegador.
  const db=await getPool().connect();
  try{
   await db.query('BEGIN');
   await db.query('SELECT pg_advisory_xact_lock($1)',[700000000+s.empresaId]);
   const pending=await db.query<{total:number}>(`SELECT COUNT(*)::int AS total FROM public.aurox_followup_envios
      WHERE empresa_id=$1 AND estado IN ('pendente','processando')`,[s.empresaId]);
   if(Number(pending.rows[0]?.total||0)+publicos.rows.length>MAX_ALVOS_CAMPANHA){
     await db.query('ROLLBACK');return NextResponse.json({error:`A fila da empresa pode ter até ${MAX_ALVOS_CAMPANHA} envios pendentes; aguarde os existentes`},{status:429});
   }
   const {rows:camp}=await db.query<{id:number}>(`INSERT INTO public.aurox_followup_campanhas
    (empresa_id,criado_por,formato,titulo,conteudo,finalidade,origem,segmento,media_path,media_mime,media_nome)
    VALUES($1,$2,'mensagem',$3,$4,$5,'coletivo',$6::jsonb,$7,$8,$9) RETURNING id`,
    [s.empresaId,s.u.id,titulo,mensagem,f,JSON.stringify(seg),media?.path||null,media?.mime||null,media?.nome||null]);
   const startAt=start.toISOString();
   // INSERT em lote: uma ida ao banco, sem 500 consultas sequenciais por campanha.
   const leadIds=publicos.rows.map(x=>x.id);
   const textos=publicos.rows.map(x=>personalizar(mensagem,x));
   await db.query(`INSERT INTO public.aurox_followup_envios(empresa_id,campanha_id,lead_id,texto,agendado_em)
     SELECT $1,$2,t.id,t.texto,$3::timestamptz + ((t.ord-1)::integer * interval '2 minutes')
       FROM unnest($4::integer[],$5::text[]) WITH ORDINALITY AS t(id,texto,ord)`,
     [s.empresaId,camp[0].id,startAt,leadIds,textos]);
   await auditarAlteracao(db,{usuario:s.u,empresaId:s.empresaId,recurso:'anuncio_coletivo',recursoId:camp[0].id,
      acao:'enviar',resumo:testeId?'Campanha teste de mídia agendada para contato autorizado':'Campanha coletiva agendada com segmento e autorizacoes verificadas'});
   await db.query('COMMIT');
   return NextResponse.json({ok:true,campanha_id:camp[0].id,agendados:publicos.rows.length,teste:!!testeId,
     aviso:'Fila QR limitada a 30 envios/empresa/24h. Envios em massa oficiais requerem modelos aprovados.'},{status:201});
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 }catch(e){console.error('[coletivo POST]',e instanceof Error?e.message:'erro');
  if(e instanceof Error&&/segmento|finalidade|Mídia|mídia|Agende|Informe|Confirme|autoriz/.test(e.message))return bad(e);
  return NextResponse.json({error:'Não foi possível criar campanha coletiva; confira as migrations e os logs.'},{status:503});}
}

export async function PATCH(req:NextRequest){
 const b=await req.json().catch(()=>null),s=await scope(req,b?.empresa_id);if('error'in s)return s.error;
 const campId=id(b?.id);if(!campId||b?.acao!=='pausar')return NextResponse.json({error:'Ação inválida'},{status:400});
 const db=await getPool().connect();try{
  await db.query('BEGIN');
  const res=await db.query(`UPDATE public.aurox_followup_campanhas c SET estado='pausada'
    WHERE c.id=$1 AND c.empresa_id=$2 AND c.origem='coletivo' AND c.estado='ativa'
      AND EXISTS(SELECT 1 FROM public.aurox_followup_envios e WHERE e.campanha_id=c.id AND e.estado='pendente')
    RETURNING c.id`,[campId,s.empresaId]);
  if(!res.rowCount){await db.query('ROLLBACK');return NextResponse.json({error:'Não existem envios pendentes a pausar'},{status:409});}
  await db.query(`UPDATE public.aurox_followup_envios SET estado='cancelado'
    WHERE empresa_id=$1 AND campanha_id=$2 AND estado='pendente'`,[s.empresaId,campId]);
  await auditarAlteracao(db,{usuario:s.u,empresaId:s.empresaId,recurso:'anuncio_coletivo',recursoId:campId,
    acao:'pausar',resumo:'Envios ainda pendentes da campanha coletiva cancelados'});
  await db.query('COMMIT');return NextResponse.json({ok:true});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});return NextResponse.json({error:'Não foi possível pausar a campanha'},{status:503});}
 finally{db.release();}
}
