const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const fs = require('node:fs');
for(const file of process.argv.slice(2)) {
 const code=fs.readFileSync(file,'utf8');
 const output=ts.transpileModule(code,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.Preserve},reportDiagnostics:true});
 const errors=(output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 if(errors.length){console.error(file,errors);process.exitCode=1;}
}
if(!process.exitCode) console.log('TS syntax OK');
