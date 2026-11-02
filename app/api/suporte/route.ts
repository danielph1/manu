import {NextRequest,NextResponse} from 'next/server';
import {requireUser} from '@/lib/session';import {query,queryOne} from '@/lib/db';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 const b=await req.json().catch(()=>null);const assunto=String(b?.assunto||'').trim().slice(0,120);const mensagem=String(b?.mensagem||'').trim().slice(0,3000);
 if(assunto.length<3||mensagem.length<10)return NextResponse.json({error:'Informe um assunto e uma descrição com pelo menos 10 caracteres'},{status:400});
 try{
  const {rows}=await query('SELECT count(*)::int AS n FROM public.manu_suporte_chamados WHERE usuario_id=$1 AND criado_em>now()-interval \'1 hour\'',[u.id]);
  if(Number(rows[0]?.n||0)>=5)return NextResponse.json({error:'Limite de 5 chamados por hora. Tente mais tarde.'},{status:429});
  const r=await queryOne(`INSERT INTO public.manu_suporte_chamados(usuario_id,empresa_id,assunto,mensagem) VALUES($1,$2,$3,$4) RETURNING id`,[u.id,u.empresa_id??null,assunto,mensagem]);
  return NextResponse.json({ok:true,id:r?.id},{status:201});
 }catch(e:any){return NextResponse.json({error:'Não foi possível enviar o chamado. Execute a migration do suporte.'},{status:500});}
}

export async function GET(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 try{
  const {rows}=u.tipo==='superadmin'
   ? await query(`SELECT t.id,t.assunto,t.mensagem,t.status,t.criado_em,t.empresa_id,us.nome AS autor_nome FROM public.manu_suporte_chamados t LEFT JOIN public.usuarios us ON us.id=t.usuario_id ORDER BY t.criado_em DESC LIMIT 100`)
   : await query(`SELECT id,assunto,mensagem,status,criado_em FROM public.manu_suporte_chamados WHERE usuario_id=$1 ORDER BY criado_em DESC LIMIT 50`,[u.id]);
  return NextResponse.json(rows,{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Não foi possível consultar chamados'},{status:500});}
}
export async function PATCH(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(u.tipo!=='superadmin')return NextResponse.json({error:'Somente superadmin'},{status:403});
 const b=await req.json().catch(()=>({}));const id=Number(b.id);
 if(!Number.isSafeInteger(id)||!['aberto','em_andamento','resolvido'].includes(b.status))return NextResponse.json({error:'Dados inválidos'},{status:400});
 const row=await queryOne(`UPDATE public.manu_suporte_chamados SET status=$2 WHERE id=$1 RETURNING id,status`,[id,b.status]);
 return row?NextResponse.json(row):NextResponse.json({error:'Chamado não encontrado'},{status:404});
}
