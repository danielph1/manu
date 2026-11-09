const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const code=ts.transpileModule(fs.readFileSync(__dirname+'/lib_db_novo.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class PoolMock {
 constructor(options){this.options=options;this.listeners={};this.closed=false;}
 on(event,handler){this.listeners[event]=handler;}
 async query(text,params){return {rows:[{answer:42}],rowCount:1};}
 async end(){this.closed=true;}
}
function boot(env){
 const module={exports:{}};const process={env};
 const sandbox={module,exports:module.exports,process,console,URL,require(id){if(id==='pg')return {Pool:PoolMock};if(id==='@vercel/functions')return {attachDatabasePool:(p)=>{p.attached=true;}};throw Error(id);}};
 vm.runInNewContext(code,sandbox,{filename:'db.cjs'});
 return module.exports;
}
const direct='postgresql://postgres:dummy@db.fakeproject.supabase.co:5432/postgres';
const pooler='postgresql://postgres.fakeproject:dummy@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require';
let api=boot({NODE_ENV:'production',DATABASE_URL:direct});
assert.throws(()=>api.getPool(),/Conexão direta bloqueada em produção/);
api=boot({NODE_ENV:'production',DATABASE_URL:direct,DATABASE_POOLER_URL:pooler});
const p=api.getPool();
assert.equal(p.options.max,2);
assert.equal(p.attached,undefined);
assert.equal(p.options.min,0);
assert.equal(p.options.idleTimeoutMillis,5000);
assert.equal(p.options.connectionTimeoutMillis,5000);
assert.equal(p.options.allowExitOnIdle,true);
assert.equal(p.options.maxLifetimeSeconds,120);
assert.equal(api.getPool(),p);
assert.equal(boot({NODE_ENV:'production',VERCEL:'1',DATABASE_POOLER_URL:pooler}).getPool().attached,true);
api.query('SELECT 42').then(async result=>{
 assert.equal(result.rowCount,1);
 await api.closePool();assert.equal(p.closed,true);
 assert.notEqual(api.getPool(),p);
 console.log('PASSOU: proteção direta, Supavisor 6543, singleton, limites, release/end');
}).catch(e=>{console.error(e);process.exitCode=1;});
