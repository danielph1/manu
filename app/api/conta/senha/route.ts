import {NextRequest,NextResponse} from 'next/server';
import {getPool} from '@/lib/db';
import {requireUser} from '@/lib/session';
import {hashPassword,verifyPassword} from '@/lib/password';
export const runtime='nodejs';
/** Alteração de senha pelo usuário logado, exigindo a senha atual. */
export async function POST(req:NextRequest){
  const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
  const b=await req.json().catch(()=>null);const atual=String(b?.atual||''),nova=String(b?.nova||'');
  if(!atual||nova.length<12||nova.length>150||nova===atual)return NextResponse.json({error:'Informe a senha atual e uma nova senha diferente com 12 a 150 caracteres'},{status:400});
  const db=await getPool().connect();try{
    await db.query('BEGIN');
    const r=await db.query<{senha_hash:string}>(`SELECT senha_hash FROM public.usuarios WHERE id=$1 AND ativo=TRUE FOR UPDATE`,[u.id]);
    if(!r.rows[0]||!verifyPassword(atual,r.rows[0].senha_hash)){
      await db.query('ROLLBACK');return NextResponse.json({error:'Senha atual incorreta'},{status:403});}
    await db.query(`UPDATE public.usuarios SET senha_hash=$1,senha_alterada_em=NOW() WHERE id=$2`,[hashPassword(nova),u.id]);
    await db.query('COMMIT');return NextResponse.json({ok:true,mensagem:'Senha alterada. Entre novamente.'});
  }catch(e){await db.query('ROLLBACK').catch(()=>{});return NextResponse.json({error:'Falha ao atualizar a senha'},{status:503});}
  finally{db.release();}
}
