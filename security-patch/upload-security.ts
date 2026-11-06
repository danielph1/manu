/** Validação no SERVIDOR. Extensão e file.type não provam o conteúdo do upload. */
import sharp from 'sharp';

export class ArquivoInvalido extends Error {
  constructor(message: string) { super(message); this.name = 'ArquivoInvalido'; }
}

type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
function tipoReal(buf: Buffer): ImageMime | 'application/pdf' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 8 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export async function fotoSegura(buffer: Buffer, mimeInformado: string, entradaMax = 1_572_864, saidaMax = 1_572_864): Promise<Buffer> {
  if (!buffer.length || buffer.length > entradaMax) throw new ArquivoInvalido('Foto acima do limite permitido.');
  const real = tipoReal(buffer);
  if (!real || real === 'application/pdf' || real !== mimeInformado.toLowerCase().split(';')[0].trim()) {
    throw new ArquivoInvalido('A foto deve ser JPG, PNG ou WebP válido; o conteúdo não corresponde ao tipo informado.');
  }
  try {
    // Decodificação com restrição de pixels, regravação em JPG RGB sem EXIF ou payload adicional.
    // SVG, GIF, HTML, scripts, PDF e formatos arbitrários são rejeitados antes do Sharp.
    const img = sharp(buffer, { limitInputPixels: 24_000_000, failOn: 'error', animated: false });
    const md = await img.metadata();
    if (!md.width || !md.height || md.width < 48 || md.height < 48 || md.pages && md.pages > 1) {
      throw new ArquivoInvalido('Foto inválida ou pequena demais.');
    }
    const out = await img.rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    if (out.length > saidaMax) throw new ArquivoInvalido('Foto processada ainda acima do limite; comprima antes de enviar.');
    return out;
  } catch (e) {
    if (e instanceof ArquivoInvalido) throw e;
    throw new ArquivoInvalido('A foto está corrompida ou não é uma imagem suportada.');
  }
}

function base64Estrito(value: unknown, maxBytes: number): Buffer {
  if (typeof value !== 'string') throw new ArquivoInvalido('Anexo inválido.');
  const m = /^(?:data:([\w/+.-]+);base64,)?([A-Za-z0-9+/]+={0,2})$/.exec(value.trim());
  if (!m || !m[2] || m[2].length > Math.ceil(maxBytes / 3) * 4 + 8 || m[2].length % 4 === 1) {
    throw new ArquivoInvalido('O comprovante deve ser PDF, JPG, PNG ou WebP, dentro do limite de tamanho.');
  }
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > maxBytes || buf.toString('base64').replace(/=+$/, '') !== m[2].replace(/=+$/, '')) {
    throw new ArquivoInvalido('Arquivo Base64 inválido.');
  }
  return buf;
}

/** Somente comprovantes: imagens ou PDF (até 2 MB). Nenhum arquivo executável/documento Office. */
export async function comprovanteSeguro(nome: unknown, mime: unknown, b64: unknown): Promise<{ nome: string; mime: string; base64: string }> {
  const limite = 2 * 1024 * 1024; // Base64 no JSON fica abaixo do limite de request da Vercel.
  const buf = base64Estrito(b64, limite);
  const real = tipoReal(buf);
  const tipoDeclarado = String(mime || '').toLowerCase().trim().split(';')[0];
  const nomeRecebido = String(nome || '').replace(/[/\\\x00-\x1f]/g, '_').slice(0, 120);
  const ext = nomeRecebido.split('.').pop()?.toLowerCase() || '';
  const extensoes: Record<string, string[]> = {
    'application/pdf': ['pdf'], 'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'], 'image/webp': ['webp'],
  };
  if (!real || !extensoes[real] || tipoDeclarado !== real || !extensoes[real].includes(ext)) {
    throw new ArquivoInvalido('Comprovante permitido: somente PDF ou foto JPG/PNG/WebP verdadeira.');
  }
  if (real === 'application/pdf') {
    const tail = buf.subarray(-2048).toString('latin1');
    if (!tail.includes('%%EOF')) throw new ArquivoInvalido('PDF incompleto ou inválido.');
    // Filtro de risco básico, NÃO substitui análise AV/CDR de PDFs.
    const source = buf.toString('latin1');
    if (/\/(?:JavaScript|JS|Launch|OpenAction|EmbeddedFile|RichMedia|XFA)\b/i.test(source)) {
      throw new ArquivoInvalido('PDF com conteúdo ativo ou incorporado não permitido.');
    }
    return { nome: nomeRecebido, mime: real, base64: buf.toString('base64') };
  }
  const clean = await fotoSegura(buf, real, limite, limite);
  const semExt = nomeRecebido.replace(/\.[^.]+$/, '').slice(0, 110) || 'comprovante';
  return { nome: `${semExt}.jpg`, mime: 'image/jpeg', base64: clean.toString('base64') };
}
