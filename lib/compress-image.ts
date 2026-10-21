/**
 * Compressão de imagem no browser (Canvas).
 * Sem dependência extra — reduz MB → ~150–300 KB.
 * Use em TODOS os uploads de foto do app.
 */

export type CompressOpts = {
  maxWidthOrHeight?: number;
  maxSizeMB?: number;
  quality?: number;
  mime?: 'image/webp' | 'image/jpeg';
};

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('falha ao ler imagem'));
    };
    img.src = url;
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))),
      mime,
      quality,
    );
  });
}

/**
 * Comprime foto mantendo proporção.
 * Default: max 1280px, WebP q~0.72, alvo ~0.25 MB.
 */
export async function compressImage(
  file: File | Blob,
  opts: CompressOpts = {},
): Promise<File> {
  const maxSide = opts.maxWidthOrHeight ?? 1280;
  const targetMB = opts.maxSizeMB ?? 0.28;
  let quality = opts.quality ?? 0.72;
  const preferWebp = opts.mime !== 'image/jpeg';

  // não-imagem: devolve como está
  const type = (file as File).type || '';
  if (type && !type.startsWith('image/')) {
    const name = (file as File).name || 'arquivo.bin';
    return file instanceof File ? file : new File([file], name, { type });
  }

  const img = await loadImage(file);
  let { width, height } = img;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponível');
  ctx.drawImage(img, 0, 0, width, height);

  const tryMime = preferWebp ? 'image/webp' : 'image/jpeg';
  let blob: Blob;
  try {
    blob = await canvasToBlob(canvas, tryMime, quality);
  } catch {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }

  // reduz qualidade se ainda grande
  let q = quality;
  while (blob.size > targetMB * 1024 * 1024 && q > 0.4) {
    q -= 0.08;
    try {
      blob = await canvasToBlob(canvas, blob.type || 'image/jpeg', q);
    } catch {
      break;
    }
  }

  const ext = blob.type.includes('webp') ? 'webp' : 'jpg';
  const base =
    ((file as File).name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
  return new File([blob], `${base}.${ext}`, {
    type: blob.type || 'image/jpeg',
    lastModified: Date.now(),
  });
}

/** Compacto para avatar (256px) */
export async function compressAvatar(file: File | Blob): Promise<File> {
  return compressImage(file, {
    maxWidthOrHeight: 512,
    maxSizeMB: 0.12,
    quality: 0.8,
    mime: 'image/jpeg',
  });
}

/** Galeria de estoque / anexos */
export async function compressGallery(file: File | Blob): Promise<File> {
  return compressImage(file, {
    maxWidthOrHeight: 1600,
    maxSizeMB: 0.3,
    quality: 0.7,
    mime: 'image/webp',
  });
}
