import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';
import {getPool,query,queryOne} from '@/lib/db';
import {requireUser,type SessionUser} from '@/lib/session';

const PAPEIS = new Set(['admin','superadmin']);
export const okFinanceiro=(u:SessionUser|null|undefined)=>Boolean(u&&PAPEIS.has(String(u.tipo||'').toLowerCase()));
export function positive(v:unknown) {const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:0;}
export function money(v:unknown, allowNull=false):number|null {
 if(allowNull && (v===null||v===undefined||v===''))return null;
 const n=Number(v);if(!Number.isFinite(n)||n<=0||n>1e12)throw Error('Valor inválido ou não positivo');
 return Math.round(n*100)/100;
}
export function dateOnly(v:unknown):string {
 const s=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||isNaN(new Date(s+'T12:00:00Z').getTime())||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s) throw Error('Data inválida');return s;
}
export async function financeAuth(req:NextRequest, rawEmpresa?:unknown):Promise<{actor:SessionUser;empresaId:number}|NextResponse>{
 const actor=await requireUser(req);
 if(!actor)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(!okFinanceiro(actor))return NextResponse.json({error:'Finanças: acesso exclusivo de admin e superadmin'},{status:403});
 const superadmin=String(actor.tipo).toLowerCase()==='superadmin';
 const pedido=positive(rawEmpresa);
 if(!superadmin && pedido && pedido!==positive(actor.empresa_id))return NextResponse.json({error:'Empresa diferente da sua'},{status:403});
 const empresaId=superadmin?pedido:positive(actor.empresa_id);
 if(!empresaId)return NextResponse.json({error:superadmin?'Selecione uma empresa':'Usuário sem empresa'},{status:400});
 const empresa=await queryOne<{id:number}>(`SELECT id FROM public.empresas WHERE id=$1`,[empresaId]);
 if(!empresa)return NextResponse.json({error:'Empresa inexistente'},{status:404});
 return {actor,empresaId};
}
export async function lojaDaEmpresa(empresaId:number,loja:string) {
 return Boolean(await queryOne(`SELECT id FROM public.lojas WHERE empresa_id=$1 AND UPPER(codigo)=UPPER($2)`,[empresaId,loja]));
}
/** Gera compromissos Aurox e parcelas de ate 12 meses a frente; nao insere valores ficticios.
 * Rodar apos migration e em cron. Transacao protege gatilhos de cobranca imutavel. */
export async function materializar(empresaId?:number) {
 const c=await getPool().connect();
 try {
  await c.query('BEGIN');
  await c.query(`SELECT set_config('aurox.finance_privileged','true',true)`);
  await c.query(`INSERT INTO public.manu_fin_agendamentos
    (empresa_id,loja,tipo,categoria,descricao,forma,valor,inicio,frequencia,origem,ativo)
    SELECT e.id, (SELECT l.codigo FROM public.lojas l WHERE l.empresa_id=e.id AND COALESCE(l.ativo,TRUE) ORDER BY l.id LIMIT 1),
       'saida','Assinatura Aurox','Mensalidade da plataforma Aurox','boleto',NULL,
       COALESCE(e.contrato_inicio,CURRENT_DATE),'mensal','aurox',TRUE
      FROM public.empresas e WHERE ($1::int IS NULL OR e.id=$1)
    ON CONFLICT (empresa_id) WHERE origem='aurox' DO NOTHING`,[empresaId||null]);
  await c.query(`INSERT INTO public.manu_fin_parcelas(agendamento_id,empresa_id,numero,vencimento,valor)
    SELECT a.id,a.empresa_id,seq.n+1,
    (date_trunc('month',a.inicio + make_interval(months=>seq.n))::date +
      (LEAST(EXTRACT(day FROM a.inicio)::int,
        EXTRACT(day FROM ((date_trunc('month',a.inicio + make_interval(months=>seq.n))
           + interval '1 month - 1 day')::date))::int)-1))::date,
    a.valor
    FROM public.manu_fin_agendamentos a
    CROSS JOIN LATERAL generate_series(0,
      CASE WHEN a.frequencia='unica' THEN 0 ELSE GREATEST(0,
        (EXTRACT(year FROM AGE(timezone('America/Sao_Paulo',now())::date,a.inicio))::int*12 +
         EXTRACT(month FROM AGE(timezone('America/Sao_Paulo',now())::date,a.inicio))::int)+13)
      END) AS seq(n)
    WHERE a.ativo AND ($1::int IS NULL OR a.empresa_id=$1)
      AND (a.frequencia='mensal' OR seq.n=0)
      AND (a.repeticoes IS NULL OR seq.n<a.repeticoes)
      AND (date_trunc('month',a.inicio + make_interval(months=>seq.n))::date <=
        (timezone('America/Sao_Paulo',now())::date + interval '12 months')::date)
    ON CONFLICT(agendamento_id,numero) DO NOTHING`,[empresaId||null]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
export async function reconcilePaid(empresaId:number,desde:string|null=null,ate:string|null=null){
 const r=await queryOne<{entradas:string;saidas:string;oficina:string;gerais:string;lancamentos:number}>(`
 SELECT COALESCE(SUM(valor) FILTER(WHERE tipo='entrada'),0)::text AS entradas,
  COALESCE(SUM(valor) FILTER(WHERE tipo='saida'),0)::text AS saidas,
  COALESCE(SUM(valor) FILTER(WHERE tipo='saida' AND origem_tipo='oficina'),0)::text AS oficina,
  COALESCE(SUM(valor) FILTER(WHERE tipo='saida' AND COALESCE(origem_tipo,'')<>'oficina'),0)::text AS gerais,
  COUNT(*)::int AS lancamentos
 FROM public.manu_movimentos_caixa
 WHERE empresa_id=$1 AND status='confirmado'
   AND ($2::date IS NULL OR data_movimento >= $2::date)
   AND ($3::date IS NULL OR data_movimento <= $3::date)`,[empresaId,desde,ate]);
 const n=(v:unknown)=>Number(v||0);
 return {entradas:n(r?.entradas),saidas:n(r?.saidas),oficina:n(r?.oficina),outras_saidas:n(r?.gerais),
   saldo_caixa:n(r?.entradas)-n(r?.saidas),saldo_operacional:n(r?.entradas)-n(r?.oficina),
   lancamentos_confirmados:Number(r?.lancamentos||0)};
}
