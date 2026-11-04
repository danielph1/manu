'use strict';

/**
 * Aurox-WhatsApp: correção idempotente do bug de mídia no whatsapp-web.js 1.34.7.
 * Ref.: wwebjs/whatsapp-web.js#201922 e PR #201923 (mediaOptions.__x_id).
 * Não altera autenticação, sessão, mensagens ou informações pessoais.
 */
const fs = require('node:fs');
const path = require('node:path');

const workerRoot = path.resolve(__dirname, '..');
const dependencyDir = path.join(workerRoot, 'node_modules', 'whatsapp-web.js');
const packagePath = path.join(dependencyDir, 'package.json');
const utilsPath = path.join(dependencyDir, 'src', 'util', 'Injected', 'Utils.js');

function stop(message) {
  console.error(`[Aurox-WhatsApp] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(packagePath) || !fs.existsSync(utilsPath)) {
  stop('A dependência whatsapp-web.js não foi encontrada nesta pasta. Execute npm install em workers/aurox-whatsapp.');
} else {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    stop(`Não foi possível ler a versão instalada: ${error.message}`);
  }

  if (pkg) {
    const source = fs.readFileSync(utilsPath, 'utf8');
    const fix = 'delete message.__x_id;';
    if (source.includes(fix)) {
      console.log(`[Aurox-WhatsApp] Correção de mídias já presente (${pkg.version}). Nenhuma alteração necessária.`);
    } else if (pkg.version !== '1.34.7') {
      stop(`Versão ${pkg.version} não testada com este patch. Não modificarei o pacote automaticamente.`);
    } else {
      const from = source.indexOf('window.WWebJS.sendMessage = async');
      const start = from >= 0 ? source.indexOf('const message = {', from) : -1;
      const anchor = "\n        // Bot's won't reply if canonicalUrl is set (linking)";
      const anchorIndex = start >= 0 ? source.indexOf(anchor, start) : -1;
      const segment = start >= 0 && anchorIndex > start ? source.slice(start, anchorIndex) : '';
      if (anchorIndex < 0 || !segment.includes('...mediaOptions,') || !segment.includes('...extraOptions,') || !segment.includes('};')) {
        stop('Estrutura de Utils.js não reconhecida. Patch não aplicado para evitar alterações incorretas.');
      } else {
        const addition = [
          '',
          '        // Aurox: evita que o ID interno do modelo de mídia sobrescreva o ID da mensagem.',
          '        delete message.__x_id;',
        ].join('\n');
        const updated = source.slice(0, anchorIndex) + addition + source.slice(anchorIndex);
        const backup = `${utilsPath}.aurox-original-1.34.7.bak`;
        if (!fs.existsSync(backup)) fs.copyFileSync(utilsPath, backup);
        fs.writeFileSync(utilsPath, updated, 'utf8');
        console.log('[Aurox-WhatsApp] Bug de envio de foto/áudio corrigido em whatsapp-web.js 1.34.7.');
      }
    }
  }
}
