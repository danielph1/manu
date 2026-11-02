import {readdir} from 'node:fs/promises';
import {join,relative,sep} from 'node:path';
const root=join(process.cwd(),'app');let routes=new Map();
async function walk(dir){for(const ent of await readdir(dir,{withFileTypes:true})){
 const full=join(dir,ent.name);if(ent.isDirectory()){if(!ent.name.startsWith('@'))await walk(full);continue;}
 if(!/^page\.(tsx|ts|jsx|js)$/.test(ent.name))continue;
 const seg=relative(root,dir).split(sep).filter(v=>v&&!/^\([^)]*\)$/.test(v));
 const url='/'+seg.join('/');const arr=routes.get(url)||[];arr.push(relative(root,full));routes.set(url,arr);
}}
await walk(root);
const clashes=[...routes].filter(([,f])=>f.length>1);
if(clashes.length){console.error('Rotas duplicadas detectadas:');for(const [url,files] of clashes)console.error(url,files.join(' | '));process.exitCode=1;}
else console.log(`Rotas Next.js verificadas: ${routes.size}, sem duplicações.`);
