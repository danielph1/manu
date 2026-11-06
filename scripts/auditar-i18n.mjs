// node scripts/auditar-i18n.mjs (rode no projeto MANU)
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const app = join(process.cwd(),'app');
if(!existsSync(app))throw new Error('Execute na raiz do projeto, que contém app/');
const pages=[];
function walk(p){for(const d of readdirSync(p,{withFileTypes:true})){const file=join(p,d.name);
 if(d.isDirectory())walk(file);else if(d.name==='page.tsx'||d.name==='page.jsx'){
 const src=readFileSync(file,'utf8');pages.push({file:file.slice(process.cwd().length+1),temI18n:/useI18n|\bt\('page\.|\bt\('nav\./.test(src)});
 }}}
walk(app);
const missing=pages.filter(p=>!p.temI18n);
console.log(`Páginas: ${pages.length}; já usam dicionário: ${pages.length-missing.length}; sem integração explícita: ${missing.length}`);
for(const p of missing)console.log('PENDENTE:',p.file);
console.log('Observação: telas que usam i18n também podem conter textos fixos. Revise componente por componente.');
