// Teste mínimo de aceitação de formatos, sem sharp instalado. NÃO é teste de malware.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let ts; try { ts=require('typescript'); } catch { ts=require(execSync('npm root -g',{encoding:'utf8'}).trim()+'/typescript'); }
const input = fs.readFileSync(new URL('../security-patch/upload-security.ts',import.meta.url),'utf8');
const js = ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,Buffer,require:(name)=>({__esModule:true,default:()=>{throw new Error('sharp not installed in this smoke test')}})});
const {comprovanteSeguro,ArquivoInvalido} = mod.exports;
const encoded=b=>Buffer.from(b).toString('base64');
const ok = await comprovanteSeguro('comprovante.pdf','application/pdf',encoded('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF'));
assert.equal(ok.mime,'application/pdf');
for(const [name,mime,contents] of [
 ['falso.jpg','image/jpeg','MZ executable'],
 ['exploit.pdf','application/pdf','%PDF-1.7\n/JavaScript (alert)\n%%EOF'],
 ['arquivo.exe','application/pdf','%PDF-1.7\n%%EOF'],
 ['falso.pdf','application/pdf','%PDF-1.7 sem termino']
]) {
  await assert.rejects(comprovanteSeguro(name,mime,encoded(contents)),err=>err?.name==='ArquivoInvalido');
}
console.log('OK: PDF simples aceito; arquivo executável, MIME falso, PDF ativo e PDF truncado rejeitados.');
