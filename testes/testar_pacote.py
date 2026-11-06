#!/usr/bin/env python3
"""Testes sintéticos de compatibilidade do instalador; NÃO simulam produção/Supabase."""
import ast, shutil, hashlib, subprocess, pathlib, tempfile, sys
root=pathlib.Path(__file__).resolve().parents[1]
src=(root/'aplicar_melhorias.py').read_text('utf-8')
tree=ast.parse(src)
edits={}
for node in tree.body:
    if isinstance(node,ast.Expr) and isinstance(node.value,ast.Call):
        callee=node.value.func
        if isinstance(callee,ast.Name) and callee.id=='edit':
            name=ast.literal_eval(node.value.args[0]);edits[name]=ast.literal_eval(node.value.args[1])
with tempfile.TemporaryDirectory(prefix='manu-patch-test-') as d:
    dest=pathlib.Path(d)/'manu';dest.mkdir();(dest/'package.json').write_text('{}')
    for name,ops in edits.items():
        p=dest/name;p.parent.mkdir(parents=True,exist_ok=True)
        orig='\n\n'.join(x[0] for x in ops)
        if name=='lib/i18n.ts':orig += '\n  ...pt,\n  ...pt,\n  ...pt,\n'
        p.write_text(orig,encoding='utf-8')
    for name in ['app/api/metas/route.ts','app/(dashboard)/metas/page.tsx']:
        p=dest/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('VERSAO_FIXTURE',encoding='utf-8')
        origSha='46c09dba2aa96f3fd6d8e5f72f8baffa63aab0b5' if 'api' in name else '567a26248cc17bfecc630b8b22afea53097ed876'
        data=p.read_bytes();newSha=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        src=src.replace(origSha,newSha)
    script=root/'testes'/'_simular_instalacao_tmp.py';script.write_text(src,encoding='utf-8')
    try:
        # O simulador precisa encontrar o diretório 'novos' no pai.
        package_test=pathlib.Path(d)/'package';shutil.copytree(root/'novos',package_test/'novos')
        shutil.copy(script,package_test/'aplicar_melhorias.py')
        res=subprocess.run([sys.executable,str(package_test/'aplicar_melhorias.py'),str(dest)],capture_output=True,text=True)
        if res.returncode:
            print('INSTALADOR FALHOU:',res.stderr,res.stdout)
            sys.exit(1)
        print('SUCESSO:',res.stdout.splitlines()[0])
        # Deve falhar numa segunda instalação sem sobrescrever a anterior.
        res2=subprocess.run([sys.executable,str(package_test/'aplicar_melhorias.py'),str(dest)],capture_output=True,text=True)
        assert res2.returncode != 0, 'Instalador deveria rejeitar reexecução / arquivos alterados'
        print('SUCESSO: reexecução recusada com segurança')
    finally:
        script.unlink(missing_ok=True)
