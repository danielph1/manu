import { NextRequest,NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { accessTokenMLValido } from '@/lib/mercadolivre/access-token';
import { buscarAtributosML, categoriaVeiculo, isCategoriaVeiculo } from '@/lib/mercadolivre/atributos';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const allowed=new Set(['admin','marketing','gerente','superadmin']);
export async function GET(req:NextRequest){
  const user=await requireUser(req);
  if(!user)return NextResponse.json({error:'Não autenticado'},{status:401});
  if(!allowed.has(String(user.tipo||'').toLowerCase())&&!isSuperAdmin(user))return NextResponse.json({error:'Sem permissão'},{status:403});
  const id=Number(req.nextUrl.searchParams.get('estoque_id'));
  if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Veículo inválido'},{status:400});
  const car=await queryOne<{empresa_id:number|null;carroceria:string|null}>('SELECT empresa_id,carroceria FROM public.estoque_carros WHERE id=$1',[id]);
  if(!car?.empresa_id || (!isSuperAdmin(user)&&Number(user.empresa_id)!==Number(car.empresa_id))) return NextResponse.json({error:'Veículo fora da empresa'},{status:403});
  const categoria=req.nextUrl.searchParams.get('categoria_ml_id')||categoriaVeiculo(car.carroceria);
  if(!isCategoriaVeiculo(categoria))return NextResponse.json({error:'Categoria de veículo não autorizada'},{status:400});
  try{
    const token=await accessTokenMLValido(Number(car.empresa_id));
    const atributos=await buscarAtributosML(token,categoria);
    return NextResponse.json({categoria,atributos},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e:any){
    return NextResponse.json({error:e?.message||'Não foi possível consultar a ficha técnica do Mercado Livre'},{status:502});
  }
}
