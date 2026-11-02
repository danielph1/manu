import {NextRequest,NextResponse} from 'next/server';
import {getPool} from '@/lib/db';import {requireUser} from '@/lib/session';
export const runtime='nodejs';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(String(u.tipo||'').toLowerCase()!=='superadmin')return NextResponse.json({error:'Feed restrito ao superadmin'},{status:403});
 const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'ID inválido'},{status:400});
 const client=await getPool().connect();
 try{await client.query('BEGIN');await client.query('SELECT id FROM public.feed_posts WHERE id=$1 FOR UPDATE',[id]);
  const {rows}=await client.query('DELETE FROM public.feed_likes WHERE post_id=$1 AND usuario_id=$2 RETURNING post_id',[id,u.id]);
  const liked=!rows.length;
  if(liked)await client.query('INSERT INTO public.feed_likes(post_id,usuario_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,u.id]);
  await client.query('UPDATE public.feed_posts SET likes=(SELECT count(*) FROM public.feed_likes WHERE post_id=$1) WHERE id=$1',[id]);
  await client.query('COMMIT');return NextResponse.json({liked});
 }catch(e:any){await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({error:'Não foi possível curtir'},{status:500});}
 finally{client.release();}
}
