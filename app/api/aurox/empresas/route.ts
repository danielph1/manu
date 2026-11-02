import { NextRequest, NextResponse } from 'next/server';
import { query, getPool } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { hashPassword } from '@/lib/password';
import { isSuperAdmin } from '@/lib/tenant';
export const runtime='nodejs';
function slugify(s: string) {
 return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
}
export async function GET(req:NextRequest) {
 const u=await requireUser(req);
 if(!u || !isSuperAdmin(u)) return NextResponse.json({error:'Apenas superadmin'}, {status:403});
 try {
  const {rows}=await query(`SELECT e.*,
   (SELECT count(*)::int FROM public.lojas l WHERE l.empresa_id=e.id) AS qtd_lojas,
   (SELECT count(*)::int FROM public.usuarios u WHERE u.empresa_id=e.id AND COALESCE(u.ativo,TRUE)) AS qtd_usuarios
   FROM public.empresas e ORDER BY e.id`);
  return NextResponse.json(rows);
 } catch(e:any){return NextResponse.json({error:e?.message||'Falha ao consultar empresas'},{status:500});}
}
/** Tudo ou nada: nunca cria uma empresa órfã após erro no admin. */
export async function POST(req:NextRequest){
 const u=await requireUser(req);
 if(!u || !isSuperAdmin(u)) return NextResponse.json({error:'Apenas superadmin'}, {status:403});
 const b=await req.json().catch(()=>null);
 if(!b) return NextResponse.json({error:'JSON inválido'},{status:400});
 const nome=String(b.nome||'').trim();
 const adm=b.admin||{};const login=String(adm.login||'').trim().toLowerCase();
 const senha=String(adm.senha||'');const adminNome=String(adm.nome||'Administrador').trim();
 const plano=String(b.plano||'black').toLowerCase();
 const lojas=(Array.isArray(b.lojas)?b.lojas:[]).map((l:any)=>({
  codigo:String(l.codigo||'').trim().toUpperCase(),
  nome:String(l.nome||l.codigo||'').trim(),
  plano:String(l.plano||plano).toLowerCase(),
 })).filter((l:any)=>l.codigo);
 if(!nome || !login || senha.length<6 || !lojas.length || lojas.some((l:any)=>l.codigo.length>30 || !/^[\p{L}\p{N}_-]+$/u.test(l.codigo)))
  return NextResponse.json({error:'Informe nome, login, senha de no mínimo 6 caracteres e código válido de pelo menos uma loja'},{status:400});
 if(new Set(lojas.map((l:any)=>l.codigo)).size!==lojas.length)return NextResponse.json({error:'Códigos de loja repetidos'},{status:400});
 const slug=slugify(String(b.slug||nome));
 if(!slug) return NextResponse.json({error:'Slug inválido'},{status:400});
 const client=await getPool().connect();
 try {
  await client.query('BEGIN');
  const dup=await client.query('SELECT id FROM public.usuarios WHERE LOWER(TRIM(login))=$1 LIMIT 1',[login]);
  if(dup.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Esse login já está em uso; nenhuma empresa foi criada'},{status:409});}
  const ex=await client.query('SELECT id FROM public.empresas WHERE slug=$1 LIMIT 1',[slug]);
  if(ex.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Slug já existente; escolha outro'},{status:409});}
  const {rows:[empresa]}=await client.query(`INSERT INTO public.empresas(nome,slug,ativo,plano,contrato_inicio)
    VALUES($1,$2,TRUE,$3,CURRENT_DATE) RETURNING *`,[nome,slug,plano]);
  const lojasCriadas=[];
  for(const l of lojas){
   const {rows:[loja]}=await client.query(`INSERT INTO public.lojas(empresa_id,codigo,nome,ativo,plano)
    VALUES($1,$2,$3,TRUE,$4) RETURNING *`,[empresa.id,l.codigo,l.nome,l.plano]);
   lojasCriadas.push(loja);
  }
  // A coluna loja segue os códigos cadastrados, jamais um exemplo fixo.
  const {rows:[admin]}=await client.query(`INSERT INTO public.usuarios(nome,login,senha_hash,tipo,ativo,status,empresa_id,loja)
   VALUES($1,$2,$3,'admin',TRUE,'ativo',$4,$5)
   RETURNING id,nome,login,tipo,empresa_id,loja,ativo,status`,
   [adminNome,login,hashPassword(senha),empresa.id,lojas[0].codigo]);
  await client.query('COMMIT');
  return NextResponse.json({empresa,lojas:lojasCriadas,admin},{status:201});
 } catch(e:any) {
  await client.query('ROLLBACK').catch(()=>{});
  const m=String(e?.message||'');
  const lojaCheck=m.includes('usuarios_loja_check');
  return NextResponse.json({error:lojaCheck?'A restrição antiga de lojas no banco impede o código informado. Execute a migration 202611020001_manu_melhorias.sql antes de cadastrar.':m.includes('duplicate key')?'Já existe registro com esse login, loja ou identificador.': 'Não foi possível concluir o cadastro. Nenhuma empresa/loja/usuário foi criado.'},{status:lojaCheck?409:500});
 } finally {client.release();}
}
