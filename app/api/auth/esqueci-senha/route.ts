import {NextRequest,NextResponse} from 'next/server';
import {createHash,randomBytes} from 'node:crypto';
import {getPool} from '@/lib/db';
export const runtime='nodejs';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const GENERIC='Se o usuário possui um e-mail cadastrado e ativo, enviaremos instruções para recuperar a senha.';
export async function POST(req:NextRequest){
 const b=await req.json().catch(()=>null);const login=String(b?.login||'').trim().toLowerCase().slice(0,100);
 if(login.length<3)return NextResponse.json({error:'Informe seu login'},{status:400});
 const apiKey=process.env.RESEND_API_KEY||'';const from=process.env.AUROX_EMAIL_FROM||'';const app=process.env.AUROX_APP_URL||'';
 if(!apiKey||!from||!/^https:\/\/[\w.-]+(?::\d+)?(?:\/)?$/.test(app))
  return NextResponse.json({error:'Recuperação automática indisponível. Solicite redefinição ao administrador da empresa.'},{status:503});
 const rawIP=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
 const ipHash=sha(`${process.env.JWT_SECRET||'aurox'}:${rawIP}`);const db=await getPool().connect();
 try{
  const ipCount=await db.query<{total:number}>(`SELECT COUNT(*)::int AS total FROM public.aurox_senha_reset_tokens WHERE ip_hash=$1 AND criado_em>now()-interval '1 hour'`,[ipHash]);
  if(Number(ipCount.rows[0]?.total||0)>=5)return NextResponse.json({mensagem:GENERIC});
  const r=await db.query<{id:number;email:string;nome:string}>(`SELECT u.id,TRIM(u.email) AS email,COALESCE(u.nome,u.login) nome
    FROM public.usuarios u LEFT JOIN public.empresas e ON e.id=u.empresa_id
    WHERE LOWER(TRIM(u.login))=$1 AND COALESCE(u.ativo,TRUE)=TRUE
    AND COALESCE(u.status,'ativo')='ativo' AND COALESCE(e.ativo,TRUE)=TRUE LIMIT 1`,[login]);
  const user=r.rows[0];if(!user||!/^\S+@\S+\.\S+$/.test(user.email||''))return NextResponse.json({mensagem:GENERIC});
  const latest=await db.query(`SELECT id FROM public.aurox_senha_reset_tokens WHERE usuario_id=$1 AND criado_em>now()-interval '15 minutes' LIMIT 1`,[user.id]);
  if(latest.rowCount)return NextResponse.json({mensagem:GENERIC});
  const token=randomBytes(32).toString('hex');
  await db.query(`INSERT INTO public.aurox_senha_reset_tokens(usuario_id,token_hash,ip_hash,expira_em) VALUES($1,$2,$3,now()+interval '20 minutes')`,[user.id,sha(token),ipHash]);
  const url=`${app.replace(/\/$/,'')}/redefinir-senha?token=${encodeURIComponent(token)}`;
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:[user.email],subject:'Aurox — redefinição de senha',
      text:`Uma redefinição de senha foi solicitada para sua conta Aurox.\n\nAbra este link em até 20 minutos:\n${url}\n\nSe não foi você, ignore este e-mail.`}),
    signal:AbortSignal.timeout(9000),cache:'no-store',
  }).catch(()=>null);
  if(!response?.ok){await db.query(`DELETE FROM public.aurox_senha_reset_tokens WHERE token_hash=$1`,[sha(token)]).catch(()=>{});
   console.warn('[auth reset] entrega de e-mail indisponível');return NextResponse.json({error:'Serviço de e-mail temporariamente indisponível. Contate seu administrador.'},{status:503});}
  return NextResponse.json({mensagem:GENERIC},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[auth reset request]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Serviço indisponível. Contate seu administrador.'},{status:503});}
 finally{db.release();}
}
