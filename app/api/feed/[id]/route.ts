import {NextRequest,NextResponse} from 'next/server';
import { queryOne,getPool } from '@/lib/db';
import {requireUser} from '@/lib/session';
import {supabaseAdmin} from '@/lib/supabase';
export const runtime='nodejs';
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(String(u.tipo||'').toLowerCase()!=='superadmin')return NextResponse.json({error:'Feed restrito ao superadmin'},{status:403});
 const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'ID inválido'},{status:400});
 const post=await queryOne<{id:number,autor_id:number,midia_url:string|null}>(`SELECT id,autor_id,midia_url FROM public.feed_posts WHERE id=$1`,[id]);
 if(!post)return NextResponse.json({error:'Post inexistente'},{status:404});
 if(Number(post.autor_id)!==Number(u.id)&&u.tipo!=='superadmin')return NextResponse.json({error:'Você só pode excluir seus posts'},{status:403});
 const client=await getPool().connect();
 try{await client.query('BEGIN');await client.query('DELETE FROM public.feed_views WHERE post_id=$1',[id]);
  await client.query('DELETE FROM public.feed_likes WHERE post_id=$1',[id]);
  await client.query('DELETE FROM public.feed_comentarios WHERE post_id=$1',[id]);
  await client.query('DELETE FROM public.feed_posts WHERE id=$1',[id]);await client.query('COMMIT');
  // Storage cleanup: só arquivos no diretório deste post/autor.
  try{if(post.midia_url){const path=decodeURIComponent(new URL(post.midia_url).pathname.split('/storage/v1/object/public/manu_arquivos/')[1]||'');
   if(path.startsWith(`feed/${post.autor_id}/`) && !path.includes('..'))await supabaseAdmin.storage.from('manu_arquivos').remove([path]);}}catch(e){console.warn('Post apagado, mas mídia exigirá limpeza posterior');}
  return NextResponse.json({ok:true});
 }catch(e:any){await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({error:e?.message||'Falha ao apagar'},{status:500});}
 finally{client.release();}
}
