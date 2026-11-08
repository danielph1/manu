import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';
import {requireUser} from '@/lib/session';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const VISUALIZAM=new Set(['gerente','marketing','admin','superadmin']);
function positive(x:unknown){const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0;}
const noStore={'Cache-Control':'private, no-store'};
export async function GET(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(!VISUALIZAM.has(u.tipo))return NextResponse.json({error:'Histórico restrito à gestão'},{status:403});
 const superadmin=u.tipo==='superadmin';
 if(!superadmin&&!positive(u.empresa_id))return NextResponse.json({error:'Empresa não identificada'},{status:403});
 const empresa=superadmin?positive(req.nextUrl.searchParams.get('empresa_id')):positive(u.empresa_id);
 const tipo=req.nextUrl.searchParams.get('tipo')==='alteracoes'?'alteracoes':'acessos';
 const page=Math.min(100,Math.max(1,Number(req.nextUrl.searchParams.get('pagina'))||1));
 const dias=Math.min(365,Math.max(1,Number(req.nextUrl.searchParams.get('dias'))||30));
 const usuario=positive(req.nextUrl.searchParams.get('usuario_id'));
 const params:unknown[]=[dias];let filtro='a.ocorreu_em>=now()-($1::integer * interval \'1 day\')';
 if(empresa){params.push(empresa);filtro+=` AND a.empresa_id=$${params.length}`;}
 else if(!superadmin)return NextResponse.json({error:'Empresa obrigatória'},{status:403});
 if(usuario){params.push(usuario);filtro+=` AND a.usuario_id=$${params.length}`;}
 const tabela=tipo==='acessos'?'aurox_auditoria_acessos':'aurox_auditoria_alteracoes';
 params.push(50);const limit=`$${params.length}`;params.push((page-1)*50);const offset=`$${params.length}`;
 try{
  const {rows}=await query(`SELECT a.*,COALESCE(u.nome,u.login,'Usuário') AS usuario_nome,e.nome AS empresa_nome
    FROM public.${tabela} a JOIN public.usuarios u ON u.id=a.usuario_id
    LEFT JOIN public.empresas e ON e.id=a.empresa_id
    WHERE ${filtro} ORDER BY a.ocorreu_em DESC,a.id DESC LIMIT ${limit} OFFSET ${offset}`,params);
  return NextResponse.json({eventos:rows,pagina:page,limite:50,tipo}, {headers:noStore});
 }catch(e){console.error('[auditoria GET]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Histórico indisponível. Verifique migration.'},{status:503});}
}
export async function POST(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 const b=await req.json().catch(()=>null);const caminho=String(b?.caminho||'');
 // Não guardar parâmetros de URL (podem conter CPF/telefone/token).
 if(!/^\/[a-z0-9/_-]{1,110}$/i.test(caminho))return NextResponse.json({error:'Caminho inválido'},{status:400});
 try{
  await query(`INSERT INTO public.aurox_auditoria_acessos(empresa_id,usuario_id,tipo_usuario,evento,caminho)
    SELECT $1,$2,$3,'pagina',$4 WHERE NOT EXISTS (
      SELECT 1 FROM public.aurox_auditoria_acessos WHERE usuario_id=$2 AND caminho=$4 AND evento='pagina' AND ocorreu_em>now()-interval '1 minute')`,
    [positive(u.empresa_id)||null,u.id,u.tipo,caminho]);
  return NextResponse.json({ok:true},{headers:noStore});
 }catch(e){console.error('[auditoria acesso]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Auditoria indisponível'},{status:503});}
}
