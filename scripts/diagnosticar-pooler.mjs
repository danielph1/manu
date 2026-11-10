// Diagnóstico seguro: não imprime usuário, host exato, senha, token nem URL.
const raw=process.env.DATABASE_POOLER_URL?.trim();
const fallback=process.env.DATABASE_URL?.trim();
console.log('DATABASE_POOLER_URL:',raw?'CONFIGURADA':'AUSENTE');
console.log('DATABASE_URL (legado):',fallback?'PRESENTE':'AUSENTE');
console.log('PG_POOL_MAX:',process.env.PG_POOL_MAX || '1 (padrão do hotfix)');
if(!raw){console.error('CONFIGURAÇÃO INCOMPLETA: use Connect > Transaction pooler no Supabase.');process.exitCode=1;}
else try{
 const url=new URL(raw);
 const transaction=url.port==='6543'&&url.hostname.endsWith('.pooler.supabase.com');
 const session=url.port==='5432'&&url.hostname.endsWith('.pooler.supabase.com');
 console.log('Modo identificado:',transaction?'TRANSACTION (correto)':session?'SESSION (INCORRETO)': 'DESCONHECIDO (revisar)');
 console.log('Porta:',url.port||'padrão');
 if(!transaction)process.exitCode=1;
}catch{console.error('DATABASE_POOLER_URL malformada.');process.exitCode=1;}
