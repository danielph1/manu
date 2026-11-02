import { NextRequest, NextResponse } from 'next/server';
import { getPool, query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { hashPassword } from '@/lib/password';
import { podeCriarCargo, podeGerenciarUsuarios, CARGOS_CADASTRAVEIS } from '@/lib/hierarquia-usuarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const DENY=()=>NextResponse.json({error:'Sem permissão para gerenciar usuários'},{status:403});
function idValido(x:unknown){const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0;}

// Nunca confia apenas no cargo do token: lê permissão e empresa atual no PostgreSQL.
async function atorAtual(id:number){
 const {rows}=await query<{id:number;tipo:string;empresa_id:number|null;ativo:boolean}>(
 `SELECT u.id,LOWER(TRIM(u.tipo)) tipo,u.empresa_id,COALESCE(u.ativo,FALSE) ativo
 FROM public.usuarios u LEFT JOIN public.empresas e ON e.id=u.empresa_id
 WHERE u.id=$1 AND COALESCE(u.ativo,FALSE) AND COALESCE(u.status,'ativo')='ativo'
 AND COALESCE(e.ativo,TRUE)`,[id]);return rows[0]||null;
}

export async function GET(req:NextRequest){
 const session=await requireUser(req);if(!session)return NextResponse.json({error:'Não autenticado'},{status:401});
 try{
  const actor=await atorAtual(session.id);if(!actor||!podeGerenciarUsuarios(actor.tipo))return DENY();
  const superUser=actor.tipo==='superadmin';
  const requested=idValido(req.nextUrl.searchParams.get('empresa_id'));
  const empresaId=superUser?requested:idValido(actor.empresa_id);
  const empresas=superUser?(await query<{id:number;nome:string}>(`SELECT id,nome FROM public.empresas WHERE COALESCE(ativo,TRUE) ORDER BY nome`)).rows:
   (await query<{id:number;nome:string}>(`SELECT id,nome FROM public.empresas WHERE id=$1 AND COALESCE(ativo,TRUE)`,[empresaId])).rows;
  const lojas=empresaId?(await query(`SELECT codigo,nome FROM public.lojas WHERE empresa_id=$1 AND COALESCE(ativo,TRUE) ORDER BY codigo`,[empresaId])).rows:[];
  const inferiores=CARGOS_CADASTRAVEIS.filter(tipo=>podeCriarCargo(actor.tipo,tipo));
  const usuarios=empresaId?(await query(`SELECT u.id,u.nome,u.login,u.tipo,u.loja,u.empresa_id,u.vendedor_id,COALESCE(u.ativo,TRUE) AS ativo
   FROM public.usuarios u WHERE u.empresa_id=$1 AND ($2::boolean OR u.id=$3 OR LOWER(u.tipo)=ANY($4::text[])) ORDER BY u.id DESC LIMIT 300`,
   [empresaId,superUser,actor.id,inferiores])).rows:[];
  return NextResponse.json({empresas,lojas,usuarios,nivel:actor.tipo,empresa_id:empresaId},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('gestao usuarios GET',e);return NextResponse.json({error:'Falha ao consultar usuários. Verifique o banco.'},{status:500});}
}

export async function POST(req:NextRequest){
 const session=await requireUser(req);if(!session)return NextResponse.json({error:'Não autenticado'},{status:401});
 const body=await req.json().catch(()=>null);if(!body)return NextResponse.json({error:'Envie os dados do usuário'},{status:400});
 const nome=String(body.nome||'').trim();const login=String(body.login||'').trim().toLowerCase();
 const senha=String(body.senha||'');const cargo=String(body.tipo||'').trim().toLowerCase();
 const loja=String(body.loja||'').trim().toUpperCase();
 if(nome.length<2||nome.length>140||!/^[a-zA-Z0-9._@-]{3,80}$/.test(login)||senha.length<8||senha.length>150||!loja||loja.length>80)
  return NextResponse.json({error:'Informe nome, login (3–80 caracteres), senha (mín. 8 caracteres) e loja'},{status:400});
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  // Lock de consulta, previne alteração de papel concorrente enquanto cria.
  const a=await client.query(`SELECT id,LOWER(TRIM(tipo)) tipo,empresa_id FROM public.usuarios WHERE id=$1
    AND COALESCE(ativo,FALSE)=TRUE AND COALESCE(status,'ativo')='ativo' FOR SHARE`,[session.id]);
  const actor=a.rows[0];
  if(!actor||!podeCriarCargo(actor.tipo,cargo)){await client.query('ROLLBACK');return DENY();}
  const empresaId=actor.tipo==='superadmin'?idValido(body.empresa_id):idValido(actor.empresa_id);
  if(!empresaId){await client.query('ROLLBACK');return NextResponse.json({error:'Selecione uma empresa'},{status:400});}
  const emp=await client.query(`SELECT id FROM public.empresas WHERE id=$1 AND COALESCE(ativo,TRUE)`,[empresaId]);
  const lj=await client.query(`SELECT codigo FROM public.lojas WHERE empresa_id=$1 AND UPPER(codigo)=UPPER($2) AND COALESCE(ativo,TRUE)`,[empresaId,loja]);
  if(!emp.rowCount||!lj.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Empresa ou loja inexistente/inativa'},{status:400});}
  // Serializa disputa de login (sem exigir modificar tabelas legadas).
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`manu-login:${login}`]);
  const found=await client.query(`SELECT id FROM public.usuarios WHERE LOWER(TRIM(login))=$1 LIMIT 1`,[login]);
  if(found.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Esse login já está em uso'},{status:409});}
  let vendedorId:number|null=null;
  if(cargo==='vendedor'){
   const v=await client.query(`INSERT INTO public.vendedores(nome,empresa_id,loja,ativo) VALUES($1,$2,$3,TRUE) RETURNING id`,[nome,empresaId,loja]);
   vendedorId=Number(v.rows[0].id);
  }
  const created=await client.query(`INSERT INTO public.usuarios(nome,login,senha_hash,tipo,loja,empresa_id,vendedor_id,ativo,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,'ativo') RETURNING id,nome,login,tipo,loja,empresa_id,vendedor_id,ativo`,
    [nome,login,hashPassword(senha),cargo,loja,empresaId,vendedorId]);
  await client.query('COMMIT');return NextResponse.json(created.rows[0],{status:201});
 }catch(e:any){await client.query('ROLLBACK').catch(()=>{});console.error('gestao usuarios POST',String(e?.code||'erro'));
  return NextResponse.json({error:e?.code==='23505'?'Login já cadastrado':'Não foi possível cadastrar o usuário. Confira as migrations e restrições de loja.'},{status:e?.code==='23505'?409:500});
 }finally{client.release();}
}

// Desativar/reativar conta de nível inferior, sem exclusão irreversível.
export async function PATCH(req:NextRequest){
 const session=await requireUser(req);if(!session)return NextResponse.json({error:'Não autenticado'},{status:401});
 const body=await req.json().catch(()=>null);const targetId=idValido(body?.id);
 if(!targetId||typeof body?.ativo!=='boolean')return NextResponse.json({error:'ID e ativo obrigatórios'},{status:400});
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  const a=await client.query(`SELECT id,LOWER(TRIM(tipo)) tipo,empresa_id FROM public.usuarios WHERE id=$1 AND COALESCE(ativo,FALSE) AND COALESCE(status,'ativo')='ativo' FOR SHARE`,[session.id]);
  const t=await client.query(`SELECT id,LOWER(TRIM(tipo)) tipo,empresa_id,vendedor_id FROM public.usuarios WHERE id=$1 FOR UPDATE`,[targetId]);
  const actor=a.rows[0],alvo=t.rows[0];
  if(!actor||!alvo||!podeCriarCargo(actor.tipo,alvo.tipo)||Number(actor.id)===targetId ||
    (actor.tipo!=='superadmin'&&Number(actor.empresa_id)!==Number(alvo.empresa_id))){await client.query('ROLLBACK');return DENY();}
  await client.query(`UPDATE public.usuarios SET ativo=$1 WHERE id=$2`,[body.ativo,targetId]);
  if(alvo.vendedor_id)await client.query(`UPDATE public.vendedores SET ativo=$1 WHERE id=$2 AND empresa_id=$3`,[body.ativo,alvo.vendedor_id,alvo.empresa_id]);
  await client.query('COMMIT');return NextResponse.json({ok:true});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({error:'Falha ao alterar acesso'},{status:500});}
 finally{client.release();}
}
