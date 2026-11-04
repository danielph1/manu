import {readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const get=(p)=>readFileSync(join(root,p),'utf8');
const checks=[
 ['Consulta OAuth exclusivamente por empresa',get('app/api/integracoes/oauth/route.ts').includes('WHERE o.empresa_id = $1')],
 ['Seletor consulta empresa_id',get('app/(dashboard)/integracoes/page.tsx').includes("params: { empresa_id: empresa }")],
 ['Interface filtra empresa do status',get('app/(dashboard)/integracoes/page.tsx').includes('String(o.empresa_id) === empresa')],
 ['Webhook Z-API antigo desativado',get('app/api/webhooks/zapi/route.ts').includes('410')],
 ['Novo webhook Z-API com assinatura',get('app/api/webhooks/zapi/[connectionId]/route.ts').includes('validarZapiAssinatura')],
 ['Webhook Z-API com escopo da empresa',get('app/api/webhooks/zapi/[connectionId]/route.ts').includes('COALESCE(l.empresa_id, v.empresa_id)=$1')],
 ['Z-API configura callback via API',get('app/api/integracoes/oauth/whatsapp/zapi-qr/route.ts').includes('/update-webhook-received')],
 ['Meta exige assinatura',get('app/api/webhooks/meta/route.ts').includes('x-hub-signature-256')],
 ['Chat verifica lead e empresa',get('app/api/chat/route.ts').includes('leadAcessivel(u, leadId)')],
 ['Chat não usa ZAPI global',get('app/api/chat/route.ts').includes('enviarWhatsAppDaEmpresa')],
 ['Migration de segurança presente',existsSync(join(root,'supabase/migrations/202611030001_isolamento_integracoes_chat.sql'))],
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'OK':'FALHOU'} ${name}`);if(!ok)failed++}
process.exitCode=failed?1:0;
