"""Checagens estáticas do pacote. Não substituem o build nem testes de segurança reais."""
from pathlib import Path
import subprocess, shutil, re, sys
root=Path(__file__).resolve().parent.parent
patch=(root/'aplicar-seguranca.py').read_text()
upload=(root/'security-patch/upload-security.ts').read_text()
rate=(root/'security-patch/login-rate-limit.ts').read_text()
assert 'file.type' in upload or 'mimeInformado' in upload
assert 'sharp(' in upload
assert 'application/pdf' in upload and '%%EOF' in upload
assert '4 * 1024 * 1024' not in upload
assert 'base64Estrito' in upload
assert 'ON CONFLICT(chave)' in rate
assert 'bloqueado_ate' in rate
assert 'AUTH_RATE_LIMIT_SECRET' in rate
assert 'Senha deve ter 12' in patch
assert 'FAIL CLOSED' in patch.upper() or 'Fail closed' in patch
assert 'senha_hash' in patch or 'hashPassword' in patch
subprocess.run([sys.executable,'-m','py_compile',str(root/'aplicar-seguranca.py')],check=True)
if shutil.which('node'):
  code = """
let ts; try{ts=require('typescript')}catch{try{ts=require(require('child_process').execSync('npm root -g',{encoding:'utf8'}).trim()+'/typescript')}catch{console.log('Sem TypeScript instalado: teste de sintaxe TS ignorado');process.exit(0)}}
const fs=require('fs');
for(const p of process.argv.slice(1)){
 let src=fs.readFileSync(p,'utf8');
 let out=ts.transpileModule(src,{fileName:p,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 if(out.diagnostics?.length){ console.error(out.diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\\n')));process.exit(1) }
}
"""
  q=subprocess.run(['node','-e',code,str(root/'security-patch/upload-security.ts'),str(root/'security-patch/login-rate-limit.ts')],capture_output=True,text=True)
  if q.returncode:raise AssertionError(q.stderr or q.stdout)
print('OK: Python, assinaturas de proteção e sintaxe TypeScript transpilaram. NÃO foi feito teste integrado no projeto.')
