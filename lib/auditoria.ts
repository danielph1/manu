import type {PoolClient} from 'pg';
import type {SessionUser} from '@/lib/session';

const CAMPOS_SEGUROS=new Set(['status','followup_status','followup_optin','ativo','tipo','loja','gravame','reconheceu_firma','documento_pronto']);
const ALLOWED_ACTIONS=new Set(['criar','alterar','mover','recusar','restaurar','consentimento','excluir','enviar','pausar']);

/** Escreve junto da mutacao, na MESMA transacao, inclusive quando ator for superadmin. */
export async function auditarAlteracao(db:PoolClient,args:{
  usuario:SessionUser;empresaId:number;recurso:string;recursoId?:number|null;
  acao:string;resumo:string;campos?:string[];antes?:Record<string,unknown>;depois?:Record<string,unknown>;
}){
  const {usuario,empresaId,recurso,recursoId,acao,resumo}=args;
  if(!usuario.id||!Number.isSafeInteger(empresaId)||empresaId<=0||!ALLOWED_ACTIONS.has(acao))throw new Error('Auditoria sem ator, tenant ou acao');
  const campos=(args.campos||[]).filter(v=>/^[a-z_]{2,65}$/.test(v)).slice(0,30);
  // CPF, telefone, enderecos, senha, mensagens e dados dos clientes NUNCA entram no log.
  const diff:Record<string,{anterior:unknown;novo:unknown}>={};
  for(const chave of campos){
    if(!CAMPOS_SEGUROS.has(chave))continue;
    const old=args.antes?.[chave],now=args.depois?.[chave];
    if(old!==now&&[old,now].every(v=>v==null||typeof v==='boolean'||typeof v==='number'||(typeof v==='string'&&v.length<=80)))
      diff[chave]={anterior:old??null,novo:now??null};
  }
  await db.query(`INSERT INTO public.aurox_auditoria_alteracoes
     (empresa_id,usuario_id,tipo_usuario,recurso,recurso_id,acao,resumo,campos,detalhes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::text[],$9::jsonb)`,
    [empresaId,usuario.id,usuario.tipo,recurso.slice(0,65),recursoId||null,acao,resumo.slice(0,250),campos,JSON.stringify(diff)]);
}
