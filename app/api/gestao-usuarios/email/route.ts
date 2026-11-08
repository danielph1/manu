import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { podeAdministrarConta } from '@/lib/hierarquia-usuarios';
export const runtime='nodejs';
/** Gestor autorizado atualiza o email de recuperação sem expor credenciais. */
export async function PATCH(req:NextRequest){
  const session=await requireUser(req);if(!session)return NextResponse.json({error:'Não autenticado'},{status:401});
  const body=await req.json().catch(()=>null);const id=Number(body?.id);
  const email=String(body?.email||'').trim().toLowerCase();
  if(!Number.isSafeInteger(id)||id<=0||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)
    return NextResponse.json({error:'Informe ID e e-mail válido'},{status:400});
  if(id===session.id)return NextResponse.json({error:'Altere seu próprio e-mail na Minha Conta'},{status:403});
  const db=await getPool().connect();
  try{
    await db.query('BEGIN');
    const a=await db.query(`SELECT id,tipo,empresa_id FROM public.usuarios WHERE id=$1 AND ativo=TRUE FOR SHARE`,[session.id]);
    const t=await db.query(`SELECT id,tipo,empresa_id,email FROM public.usuarios WHERE id=$1 FOR UPDATE`,[id]);
    const autor=a.rows[0],alvo=t.rows[0];
    if(!autor||!alvo||!podeAdministrarConta(autor.tipo,alvo.tipo)||
      (autor.tipo!=='superadmin'&&(!autor.empresa_id||Number(autor.empresa_id)!==Number(alvo.empresa_id)))){
      await db.query('ROLLBACK');return NextResponse.json({error:'Conta fora do seu escopo'},{status:403});
    }
    if(!alvo.empresa_id){await db.query('ROLLBACK');return NextResponse.json({error:'Conta sem empresa vinculada'},{status:403});}
    await db.query(`UPDATE public.usuarios SET email=$1 WHERE id=$2`,[email,id]);
    // Registra a ação sem armazenar o e-mail (PII) no histórico.
    await db.query(`INSERT INTO public.aurox_auditoria_alteracoes
      (empresa_id,usuario_id,tipo_usuario,recurso,recurso_id,acao,resumo,campos)
      VALUES($1,$2,$3,'usuarios',$4,'alterar','E-mail de recuperação alterado',ARRAY['email'])`,
      [alvo.empresa_id,session.id,autor.tipo,id]);
    await db.query('COMMIT');return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[gestao email]',e instanceof Error?e.message:'erro');
    return NextResponse.json({error:'Erro ao atualizar e-mail. Confirme a migration de auditoria V2.'},{status:500});}
  finally{db.release();}
}
