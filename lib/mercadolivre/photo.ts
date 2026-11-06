import sharp from 'sharp';

/**
 * Produz uma cópia adequada ao endpoint de fotos do Mercado Livre.
 * NÃO altera o arquivo original do estoque, nem aumenta a informação visual
 * de uma imagem originalmente pequena. A ampliação apenas atende a dimensão
 * técnica mínima; a foto real precisa continuar nítida e fiel ao veículo.
 */
export async function prepararFotoMercadoLivre(
  original: Buffer,
): Promise<{ buffer: Buffer; larguraOriginal: number; alturaOriginal: number; larguraConteudo: number; alturaConteudo: number }> {
  if (!original?.length || original.length > 10 * 1024 * 1024) {
    throw new Error('Arquivo vazio ou maior que 10 MB; envie uma foto JPG/PNG em boa qualidade.');
  }

  const imagem = sharp(original, {
    failOn: 'error',
    limitInputPixels: 40_000_000,
  }).rotate();
  let metadata;
  try {
    metadata = await imagem.metadata();
  } catch {
    throw new Error('Não foi possível ler a foto. Use JPG, PNG ou WebP válido.');
  }
  const w = Number(metadata.width || 0);
  const h = Number(metadata.height || 0);
  if (w < 300 || h < 300) {
    throw new Error(`Foto muito pequena (${w} × ${h}px). Use a imagem original em maior resolução, preferencialmente 1200 × 1200px.`);
  }
  if (w / h > 3 || h / w > 3) {
    throw new Error('Foto muito estreita para anúncio; envie uma foto do veículo inteiro, sem faixa panorâmica.');
  }

  // Corrige orientação EXIF, transparência, espaço de cor e elimina bordas
  // realmente brancas. Não recorta fotografias de fundos variados.
  const rgb = await imagem.flatten({ background: '#ffffff' }).toColourspace('srgb').png().toBuffer();
  let conteudo = rgb;
  let cw = w;
  let ch = h;
  try {
    const cortada = await sharp(rgb).trim({ background: '#ffffff', threshold: 12 }).png().toBuffer({ resolveWithObject: true });
    if (cortada.info.width >= 240 && cortada.info.height >= 240) {
      conteudo = cortada.data;
      cw = cortada.info.width;
      ch = cortada.info.height;
    }
  } catch {
    // Imagem sem bordas uniformes: preservar conteúdo completo.
  }

  if (Math.max(cw, ch) < 350) {
    throw new Error(`Área útil da foto muito pequena (${cw} × ${ch}px). Substitua por uma foto original maior, sem margens brancas.`);
  }
  if (cw / ch > 3 || ch / cw > 3) {
    throw new Error('As bordas brancas escondem quase todo o veículo. Refaça a foto com o veículo ocupando a maior parte do quadro.');
  }

  // Escala o objeto para ocupar até 93% do quadro 1200 × 1200;
  // o smartcrop do Mercado Livre pode remover o restante do fundo branco
  // sem deixar o objeto abaixo do mínimo exigido.
  const dentro = await sharp(conteudo)
    .resize(1120, 1120, { fit: 'inside', kernel: 'lanczos3' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const centerX = Math.floor((1200 - dentro.info.width) / 2);
  const centerY = Math.floor((1200 - dentro.info.height) / 2);
  const buffer = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: '#ffffff' },
  })
    .composite([{ input: dentro.data, left: centerX, top: centerY }])
    .jpeg({ quality: 89, mozjpeg: true })
    .toBuffer();

  return {
    buffer,
    larguraOriginal: w,
    alturaOriginal: h,
    larguraConteudo: cw,
    alturaConteudo: ch,
  };
}
