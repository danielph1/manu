/** Regras compartilhadas entre a selecao e a fila. Nunca confiar em empresa_id do navegador. */
export const FINALIDADES = ['promocoes','novidades','retorno_comercial','pesquisa_satisfacao'] as const;
export const SEGMENTOS = ['todos','interesse','entrada','interesse_ou_entrada','interesse_e_entrada'] as const;
export type Finalidade = typeof FINALIDADES[number];
export type Segmento = typeof SEGMENTOS[number];
export const MAX_ALVOS_CAMPANHA = 500;
export const BUCKET_COLETIVO = 'manu_arquivos';
export const MIDIAS = {'image/jpeg':{ext:'jpg',max:4_000_000},'image/png':{ext:'png',max:4_000_000},'video/mp4':{ext:'mp4',max:8_000_000}} as const;
export type MimeColetivo = keyof typeof MIDIAS;

export function validaMidia(bytes:Buffer,mime:string):boolean {
  if(mime==='image/jpeg')return bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(mime==='image/png')return bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(mime==='video/mp4')return bytes.length>12&&bytes.toString('ascii',4,8)==='ftyp';
  return false;
}
export function parseSegmento(modo:unknown,interesse:unknown){
  const segmento=String(modo||'todos');
  if(!SEGMENTOS.includes(segmento as Segmento))throw new Error('Segmento inválido');
  const termo=String(interesse||'').trim().slice(0,80);
  if(segmento.includes('interesse')&&termo.length<2)throw new Error('Informe pelo menos dois caracteres do veículo de interesse');
  return {segmento:segmento as Segmento,termo};
}
/** SELECT com isolamento por empresa, finalidade, opt-out e deduplicacao por telefone. */
export function publicoSQL(empresaId:number,finalidade:Finalidade,segmento:Segmento,termo:string,limite=MAX_ALVOS_CAMPANHA+1,testeId?:number){
  const params:unknown[]=[empresaId,finalidade];
  const entrada=`(COALESCE(fc.valor_entrada,0)>0 OR COALESCE(l.valor_entrada,0)>0)`;
  let interessou='FALSE';
  if(segmento.includes('interesse')){
    params.push(`%${termo.replace(/[\\%_]/g,'\\$&')}%`);
    interessou=`COALESCE(l.produto_interesse,'') ILIKE $${params.length} ESCAPE '\\'`;
  }
  const filtroTeste=Number.isSafeInteger(testeId)&&Number(testeId)>0?(params.push(Number(testeId)),` AND l.id=$${params.length}`):'';
  const adicional=segmento==='todos'?'TRUE':segmento==='entrada'?entrada:
    segmento==='interesse'?interessou:segmento==='interesse_ou_entrada'?`(${interessou} OR ${entrada})`:`(${interessou} AND ${entrada})`;
  // Sem filtro por loja: campanhas sao compartilhadas dentro da EMPRESA.
  const sql=`WITH candidatos AS (
    SELECT l.id, l.nome_lead, l.telefone, l.produto_interesse,
      COALESCE(v.nome,'') AS vendedor_nome,COALESCE(v.loja,'') AS loja,
      CASE WHEN length(regexp_replace(COALESCE(l.telefone,''),'[^0-9]','','g')) IN (10,11)
        THEN '55'||regexp_replace(COALESCE(l.telefone,''),'[^0-9]','','g')
        ELSE regexp_replace(COALESCE(l.telefone,''),'[^0-9]','','g') END AS telefone_norm
    FROM public.leads l
    JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=$1
    LEFT JOIN LATERAL (SELECT f.valor_entrada FROM public.fichas_credito f
      WHERE f.lead_id=l.id ORDER BY f.id DESC LIMIT 1) fc ON TRUE
    WHERE (l.empresa_id=$1 OR l.empresa_id IS NULL)
      AND l.followup_optin=TRUE AND l.followup_optout_em IS NULL
      AND EXISTS(SELECT 1 FROM public.aurox_followup_permissoes p
        WHERE p.empresa_id=$1 AND p.lead_id=l.id AND p.finalidade=$2 AND p.revogado_em IS NULL)
      AND (${adicional}) ${filtroTeste}
  ), deduplicados AS (
    SELECT DISTINCT ON (telefone_norm) id,nome_lead,telefone,produto_interesse,vendedor_nome,loja,telefone_norm
      FROM candidatos WHERE telefone_norm ~ '^55[0-9]{10,11}$'
      ORDER BY telefone_norm,id DESC
  ) SELECT id,nome_lead,telefone,produto_interesse,vendedor_nome,loja
    FROM deduplicados ORDER BY id DESC LIMIT ${Math.max(1,Math.min(501,Math.floor(limite)))}`;
  return {sql,params};
}
export function personalizar(template:string,cliente:{nome_lead:string;produto_interesse:string|null;vendedor_nome:string;loja:string}){
  const clean=(s:unknown)=>String(s||'').slice(0,90).replace(/[{}\r\n]/g,' ');
  const values:Record<string,string>={nome:clean(cliente.nome_lead)||'Cliente',veiculo:clean(cliente.produto_interesse)||'seu veículo',vendedor:clean(cliente.vendedor_nome)||'equipe',loja:clean(cliente.loja)||'nossa loja'};
  return template.replace(/{{\s*(nome|veiculo|vendedor|loja)\s*}}/gi,(_m,k:string)=>values[k.toLowerCase()]||'');
}
