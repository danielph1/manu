import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';
import {requireUser} from '@/lib/session';
export const runtime='nodejs';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'ID inválido'},{status:400});
 try{
  const {rows}=await query(`WITH novo AS (INSERT INTO public.feed_views(post_id,usuario_id)
   SELECT p.id,$2 FROM public.feed_posts p WHERE p.id=$1 AND COALESCE(p.ativo,TRUE)
   ON CONFLICT DO NOTHING RETURNING post_id)
   UPDATE public.feed_posts p SET views=COALESCE(views,0)+1 FROM novo WHERE p.id=novo.post_id RETURNING p.views`,[id,u.id]);
  return NextResponse.json({ok:true,nova:rows.length>0});
 }catch(e:any){return NextResponse.json({error:'Execute a migration de visualizações únicas'},{status:500});}
}
