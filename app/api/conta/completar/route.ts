import {NextRequest,NextResponse} from 'next/server';
import {getPool,queryOne} from '@/lib/db';
import {requireUser} from '@/lib/session';
import {cpfValido} from '@/lib/identidade-cargos';
export const runtime='nodejs';export const dynamic='force-dynamic';
const header={'Cache-Control':'private, no-store'};
const cleanCpf=(v:unknown)=>String(v||'').replace(/\D/g,'');
export async function GET(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 try{
  const row=await queryOne<{cpf:string|null;email:string|null;nome:string|null}>(`SELECT cpf,email,nome FROM public.usuarios WHERE id=$1 AND COALESCE(ativo,TRUE)`,[u.id]);
  if(!row)return NextResponse.json({error:'Conta inativa ou não encontrada'},{status:403});
  const cpf=cleanCpf(row.cpf);return NextResponse.json({email:String(row.email||''),cpf_cadastrado:cpf.length===11,cpf_mascarado:cpf.length===11?`***.***.${cpf.slice(6,9)}-**`:null,nome:row.nome||'',completo:cpf.length===11&&/^\S+@\S+\.\S+$/.test(String(row.email||''))},{headers:header});
 }catch{return NextResponse.json({error:'Falha ao consultar cadastro. Confirme as migrations.'},{status:503});}
}
export async function PATCH(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 const b=await req.json().catch(()=>null);if(!b||typeof b!=='object')return NextResponse.json({error:'Dados inválidos'},{status:400});
 const cpf=typeof b.cpf==='string'?cleanCpf(b.cpf):null;
 const email=typeof b.email==='string'?String(b.email).trim().toLowerCase().slice(0,200):null;
 if(cpf!==null&&!cpfValido(cpf))return NextResponse.json({error:'CPF inválido'},{status:400});
 if(email!==null&&!/^\S+@\S+\.\S+$/.test(email))return NextResponse.json({error:'E-mail inválido'},{status:400});
 if(cpf===null&&email===null)return NextResponse.json({error:'Preencha CPF e/ou e-mail'},{status:400});
 const db=await getPool().connect().catch(()=>null);if(!db)return NextResponse.json({error:'Banco indisponível'},{status:503});
 try{
  await db.query('BEGIN');
  const r=await db.query<{id:number;empresa_id:number|null;cpf:string|null;email:string|null}>(`SELECT id,empresa_id,cpf,email FROM public.usuarios WHERE id=$1 AND COALESCE(ativo,TRUE) FOR UPDATE`,[u.id]);
  const row=r.rows[0];if(!row){await db.query('ROLLBACK');return NextResponse.json({error:'Conta não encontrada'},{status:403});}
  if(cpf!==null){
   const repeated=await db.query(`SELECT id FROM public.usuarios WHERE id<>$1 AND cpf=$2 AND empresa_id IS NOT DISTINCT FROM $3 LIMIT 1`,[row.id,cpf,row.empresa_id]);
   if(repeated.rowCount){await db.query('ROLLBACK');return NextResponse.json({error:'CPF já está associado a outra conta desta empresa'},{status:409});}
  }
  if(email!==null){const repeated=await db.query(`SELECT id FROM public.usuarios WHERE id<>$1 AND LOWER(TRIM(email))=$2 LIMIT 1`,[row.id,email]);
   if(repeated.rowCount){await db.query('ROLLBACK');return NextResponse.json({error:'Esse e-mail já está associado a uma conta'},{status:409});}}
  const changes:string[]=[];
  if(cpf!==null&&cpf!==cleanCpf(row.cpf))changes.push('cpf');
  if(email!==null&&email!==String(row.email||'').trim().toLowerCase())changes.push('email');
  if(!changes.length){await db.query('COMMIT');return NextResponse.json({ok:true,alterado:false},{headers:header});}
  await db.query(`UPDATE public.usuarios SET cpf=COALESCE($1,cpf),email=COALESCE($2,email) WHERE id=$3`,[cpf,email,row.id]);
  if(row.empresa_id){await db.query(`INSERT INTO public.aurox_auditoria_alteracoes(empresa_id,usuario_id,tipo_usuario,recurso,recurso_id,acao,resumo,campos)
   VALUES($1,$2,$3,'usuarios',$4,'alterar','Dados de perfil atualizados',$5::text[])`,[row.empresa_id,u.id,u.tipo,row.id,changes]);}
  await db.query('COMMIT');return NextResponse.json({ok:true,alterado:true},{headers:header});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.warn('[perfil complemento]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Não foi possível atualizar os dados'},{status:503});}
 finally{db.release();}
}
