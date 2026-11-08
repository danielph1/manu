import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {getPool} from '@/lib/db';
import {hashPassword} from '@/lib/password';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const b=await req.json().catch(()=>null);const token=String(b?.token||'');const senha=String(b?.senha||'');
 if(!/^[a-f0-9]{64}$/.test(token)||senha.length<12||senha.length>150)
  return NextResponse.json({error:'Link inválido ou senha menor que 12 caracteres'},{status:400});
 const hash=createHash('sha256').update(token).digest('hex');const db=await getPool().connect();
 try{
  await db.query('BEGIN');
  const r=await db.query<{id:number;usuario_id:number}>(`SELECT t.id,t.usuario_id FROM public.aurox_senha_reset_tokens t
    JOIN public.usuarios u ON u.id=t.usuario_id AND COALESCE(u.ativo,TRUE)=TRUE AND COALESCE(u.status,'ativo')='ativo'
    WHERE t.token_hash=$1 AND t.usado_em IS NULL AND t.expira_em>now() FOR UPDATE OF t`,[hash]);
  const row=r.rows[0];if(!row){await db.query('ROLLBACK');return NextResponse.json({error:'Link expirado ou já utilizado'},{status:400});}
  await db.query(`UPDATE public.usuarios SET senha_hash=$1,senha_alterada_em=now() WHERE id=$2`,[hashPassword(senha),row.usuario_id]);
  await db.query(`UPDATE public.aurox_senha_reset_tokens SET usado_em=now() WHERE usuario_id=$1 AND usado_em IS NULL`,[row.usuario_id]);
  await db.query('COMMIT');return NextResponse.json({ok:true,mensagem:'Senha atualizada. Entre novamente.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[auth reset commit]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Não foi possível redefinir a senha'},{status:503});}
 finally{db.release();}
}
