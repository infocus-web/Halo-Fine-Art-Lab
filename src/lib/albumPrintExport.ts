// Archivos de impresión de un fotolibro del editor simple.
//
// Se generan en el navegador del administrador (panel del laboratorio) a
// partir de la diagramación guardada en el pedido (items_json.albumLayout) y
// de las fotos ORIGINALES en Supabase Storage. Salida: un ZIP con
//   - tapa.jpg
//   - pliego_01.jpg … pliego_NN.jpg (una doble página abierta por archivo)
//   - especificaciones.txt
// a 300 DPI, con 3 mm de sangrado alrededor. Las fotos que tocan el borde de
// la hoja se extienden hasta el sangrado; la separación blanca entre fotos se
// mantiene igual a lo que vio el cliente.

import JSZip from 'jszip';
import { getPhotoDownloadUrl } from './photoStorageService';
import { BLEED_MM, PRINT_DPI, COVER_OPTIONS, getFotolibroSize } from '../data/fotolibroCatalog';
import { pageSizeMm, placeImage, type SpreadText } from './albumLayout';
import type { AlbumLabLayout } from './albumOrder';

const mmToPx = (mm: number) => Math.round((mm / 25.4) * PRINT_DPI);
const EDGE = 0.0005;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar el JPG'))), 'image/jpeg', 0.95);
  });
}

/** Dibuja una foto recortada dentro de un rectángulo (px), con la misma cuenta de encuadre que el editor. */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  zoom: number,
  panX: number,
  panY: number,
  bw = false
) {
  const place = placeImage(rw / rh, img.naturalWidth / img.naturalHeight, zoom, panX, panY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  if (bw) ctx.filter = 'grayscale(1)';
  ctx.drawImage(img, rx + place.left * rw, ry + place.top * rh, place.width * rw, place.height * rh);
  ctx.restore();
}

const FONT_FAMILY: Record<SpreadText['font'], string> = {
  serif: '"Cormorant Garamond", Georgia, serif',
  sans: '"Plus Jakarta Sans", Arial, sans-serif',
  script: '"Great Vibes", cursive',
};

/** Dibuja un texto de la página con la misma cuenta que el editor (tamaño = fracción del alto de la página). */
function drawText(ctx: CanvasRenderingContext2D, t: SpreadText, x: number, y: number, w: number, fontPx: number) {
  const text = t.text.trim();
  if (!text) return;
  ctx.save();
  ctx.font = `${t.italic ? 'italic ' : ''}${fontPx}px ${FONT_FAMILY[t.font] || FONT_FAMILY.sans}`;
  ctx.fillStyle = t.color || '#000';
  ctx.textBaseline = 'top';
  ctx.textAlign = t.align;
  const ax = t.align === 'center' ? x + w / 2 : t.align === 'right' ? x + w : x;
  // Corte de líneas por palabras, igual que el navegador con el mismo ancho
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const probe = line ? `${line} ${word}` : word;
      if (ctx.measureText(probe).width > w && line) {
        lines.push(line);
        line = word;
      } else line = probe;
    }
    lines.push(line);
  }
  lines.forEach((l, i) => ctx.fillText(l, ax, y + i * fontPx * 1.25));
  ctx.restore();
}

export interface AlbumPrintResult {
  ok: boolean;
  missingPhotos: string[];
  error?: string;
}

export async function generateAlbumPrintZip(
  orderNumber: string,
  layout: AlbumLabLayout,
  onProgress?: (done: number, total: number) => void,
  resolveUrl: (storagePath: string) => Promise<string | null> = getPhotoDownloadUrl,
  download = true
): Promise<AlbumPrintResult & { zip?: Blob }> {
  const { w: pw, h: ph } = pageSizeMm(layout.sizeId);
  const bleed = BLEED_MM;
  const missing: string[] = [];

  // 1. Fotos originales
  const images = new Map<string, HTMLImageElement>();
  const total = layout.photos.length + layout.spreads.length + 1;
  let done = 0;
  for (const p of layout.photos) {
    try {
      const url = p.storagePath ? await resolveUrl(p.storagePath) : null;
      if (!url) throw new Error('sin archivo');
      images.set(p.id, await loadImage(url));
    } catch {
      missing.push(p.name || p.id);
    }
    onProgress?.(++done, total);
  }
  if (images.size === 0) return { ok: false, missingPhotos: missing, error: 'No hay fotos originales guardadas para este pedido.' };

  const zip = new JSZip();
  const folder = zip.folder(`${orderNumber}_impresion`)!;

  // 2. Pliegos
  const spreadWmm = pw * 2;
  const canvasW = mmToPx(spreadWmm + bleed * 2);
  const canvasH = mmToPx(ph + bleed * 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, missingPhotos: missing, error: 'El navegador no permite generar imágenes tan grandes.' };

  for (let i = 0; i < layout.spreads.length; i++) {
    const spread = layout.spreads[i];
    ctx.fillStyle = spread.background || '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);
    for (const c of spread.cells) {
      const img = images.get(c.photoId);
      if (!img) continue;
      // Rectángulo en mm sobre el pliego (sin sangrado)…
      let x0 = c.x * spreadWmm;
      let y0 = c.y * ph;
      let x1 = (c.x + c.w) * spreadWmm;
      let y1 = (c.y + c.h) * ph;
      // …extendido hasta el sangrado si toca el borde exterior.
      if (c.x <= EDGE) x0 -= bleed;
      if (c.y <= EDGE) y0 -= bleed;
      if (c.x + c.w >= 1 - EDGE) x1 += bleed;
      if (c.y + c.h >= 1 - EDGE) y1 += bleed;
      drawPhoto(ctx, img, mmToPx(x0 + bleed), mmToPx(y0 + bleed), mmToPx(x1 - x0), mmToPx(y1 - y0), c.zoom, c.panX, c.panY, !!c.bw);
    }
    if (spread.texts?.length) {
      try {
        await Promise.all(spread.texts.map((t) => document.fonts.load(`${t.italic ? 'italic ' : ''}${mmToPx(t.size * ph)}px ${FONT_FAMILY[t.font]}`)));
      } catch {
        /* si no cargan, se usa la fuente de respaldo */
      }
      for (const t of spread.texts) drawText(ctx, t, mmToPx(bleed + t.x * spreadWmm), mmToPx(bleed + t.y * ph), mmToPx(t.w * spreadWmm), mmToPx(t.size * ph));
    }
    folder.file(`pliego_${String(i + 1).padStart(2, '0')}.jpg`, await canvasToBlob(canvas));
    onProgress?.(++done, total);
  }

  // 3. Tapa
  const leather = layout.finish === 'foto-tapa-cuero';
  const coverWmm = leather ? pw : pw * 2;
  const cover = document.createElement('canvas');
  cover.width = mmToPx(coverWmm + bleed * 2);
  cover.height = canvasH;
  const cctx = cover.getContext('2d')!;
  cctx.fillStyle = '#FFFFFF';
  cctx.fillRect(0, 0, cover.width, cover.height);
  const coverImg = layout.cover.photoId ? images.get(layout.cover.photoId) : undefined;
  if (coverImg) {
    drawPhoto(cctx, coverImg, 0, 0, cover.width, cover.height, layout.cover.zoom, layout.cover.panX, layout.cover.panY);
  }
  const title = (layout.cover.title || '').trim();
  if (title) {
    try {
      await document.fonts.load(`64px "Great Vibes"`);
    } catch {
      /* si no carga, usa la cursiva del sistema */
    }
    // Mismas proporciones que el editor: 5% del ancho de la tapa abierta.
    const fontPx = mmToPx(pw * 2 * 0.05);
    // En cuero el archivo es solo el frente; en envolvente, contratapa + tapa.
    const xMm = leather ? pw * 0.08 : pw * 2 * 0.54;
    cctx.font = `${fontPx}px "Great Vibes", cursive`;
    cctx.fillStyle = '#FFFFFF';
    cctx.textBaseline = 'bottom';
    cctx.shadowColor = 'rgba(0,0,0,0.45)';
    cctx.shadowBlur = fontPx * 0.12;
    cctx.shadowOffsetY = fontPx * 0.02;
    cctx.fillText(title, mmToPx(bleed + xMm), mmToPx(bleed + ph * 0.92));
  }
  folder.file('tapa.jpg', await canvasToBlob(cover));
  onProgress?.(++done, total);

  // 4. Especificaciones
  const size = getFotolibroSize(layout.sizeId);
  const coverName = COVER_OPTIONS.find((o) => o.type === layout.coverType && o.finish === layout.finish)?.name || layout.coverType;
  const spec = [
    `HALO FINE ART LAB · Pedido ${orderNumber}`,
    '',
    `Medida:        ${size?.closedLabel || layout.sizeId} (abierto ${size?.openLabel || ''})`,
    `Tapa:          ${coverName}`,
    `Laminado:      ${layout.laminate}`,
    `Caja:          ${layout.giftBox ? 'Sí' : 'No'}`,
    `Hojas:         ${layout.sheets} (${layout.sheets * 2} páginas)`,
    `Título tapa:   ${title || '(sin título)'}`,
    '',
    `Archivos a ${PRINT_DPI} DPI con ${bleed} mm de sangrado por lado.`,
    `Pliego: ${spreadWmm / 10} × ${ph / 10} cm + sangrado = ${canvasW} × ${canvasH} px.`,
    leather
      ? 'tapa.jpg = solo el frente (la contratapa es de cuero negro).'
      : 'tapa.jpg = contratapa + tapa en un solo archivo (sin lomo: agregarlo según el grosor final).',
    '',
    missing.length ? `FALTAN ${missing.length} FOTOS ORIGINALES (quedaron en blanco):\n- ${missing.join('\n- ')}` : 'Todas las fotos originales se encontraron.',
  ].join('\n');
  folder.file('especificaciones.txt', spec);

  const blob = await zip.generateAsync({ type: 'blob' });
  if (!download) return { ok: true, missingPhotos: missing, zip: blob };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${orderNumber}_fotolibro_impresion.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);

  return { ok: true, missingPhotos: missing };
}
