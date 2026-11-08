// Motor de diagramación automática del editor simple (estilo SmartAlbums).
//
// Idea: el cliente no diseña, solo corrige. Cada doble página recibe una lista
// ordenada de fotos y este módulo busca el mosaico que mejor respeta la forma
// de cada foto (menos recorte), con fotos a sangre y una separación blanca fina
// y pareja entre ellas. "Cambiar diseño" recorre las mejores alternativas.
//
// Todas las coordenadas de las celdas se guardan como fracción (0..1) del
// ancho/alto de la DOBLE PÁGINA abierta, así la vista del editor y el archivo
// de impresión salen de los mismos números.

import {
  BLEED_MM,
  GUTTER_MM,
  MAX_PHOTOS_PER_PAGE,
  MAX_SHEETS,
  FotolibroCoverType,
  FotolibroFinish,
  FotolibroLaminate,
  getFotolibroSize,
} from '../data/fotolibroCatalog';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface AlbumCell {
  photoId: string;
  /** Rectángulo en fracción de la doble página (0..1). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Zoom dentro del marco (1 = la foto apenas cubre el marco). */
  zoom: number;
  /** Encuadre: 0..1 (0.5 = centrado). */
  panX: number;
  panY: number;
}

export interface AlbumSpread {
  id: string;
  photoIds: string[];
  /** Índice de la alternativa de diseño elegida (0 = la mejor). */
  variant: number;
  cells: AlbumCell[];
}

export interface AlbumCover {
  photoId?: string;
  zoom: number;
  panX: number;
  panY: number;
  title: string;
}

export interface AlbumDesign {
  version: 1;
  sizeId: string;
  coverType: FotolibroCoverType;
  finish: FotolibroFinish;
  laminate: FotolibroLaminate;
  /** Solo tiene efecto en tapa blanda (la tapa dura ya incluye caja). */
  giftBox: boolean;
  cover: AlbumCover;
  spreads: AlbumSpread[];
  /** Separación entre fotos y margen exterior (como los controles de SmartAlbums). */
  spacing?: SpacingOptions;
}

export interface SpacingOptions {
  /** Separación blanca entre fotos, en mm. */
  gutterMm: number;
  /** Margen blanco alrededor de cada página, en mm (0 = fotos a sangre). */
  marginMm: number;
}

export const DEFAULT_SPACING: SpacingOptions = { gutterMm: GUTTER_MM, marginMm: 0 };

export interface LayoutPhoto {
  id: string;
  /** ancho / alto */
  aspect: number;
}

// ---------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function pageSizeMm(sizeId: string): { w: number; h: number } {
  const s = getFotolibroSize(sizeId);
  return { w: (s?.pageWidthCm ?? 30) * 10, h: (s?.pageHeightCm ?? 30) * 10 };
}

/** Árbol binario con hojas ordenadas: number = índice de foto, o un corte. */
type Shape = number | [Shape, Shape];

const shapeCache = new Map<string, Shape[]>();

/** Todas las formas de árbol binario con hojas en orden [from, to). */
function shapes(from: number, to: number): Shape[] {
  const key = `${from}-${to}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const out: Shape[] = [];
  if (to - from === 1) {
    out.push(from);
  } else {
    for (let k = from + 1; k < to; k++) {
      for (const l of shapes(from, k)) for (const r of shapes(k, to)) out.push([l, r]);
    }
  }
  shapeCache.set(key, out);
  return out;
}

interface Candidate {
  /** Rectángulos en mm dentro de la página, en el orden de las fotos. */
  rects: Rect[];
  score: number;
  signature: string;
}

function countCuts(shape: Shape): number {
  return typeof shape === 'number' ? 0 : 1 + countCuts(shape[0]) + countCuts(shape[1]);
}

/**
 * Aspect "natural" (ancho/alto) de un subárbol si cada foto se mostrara sin
 * recorte. Las direcciones se leen en preorden desde dirs[off]:
 * 0 = lado a lado, 1 = una arriba de la otra.
 */
function naturalAspect(shape: Shape, photos: LayoutPhoto[], dirs: number[], off: number): number {
  if (typeof shape === 'number') return photos[shape].aspect;
  const dir = dirs[off];
  const nl = countCuts(shape[0]);
  const aL = naturalAspect(shape[0], photos, dirs, off + 1);
  const aR = naturalAspect(shape[1], photos, dirs, off + 1 + nl);
  return dir === 0 ? aL + aR : 1 / (1 / aL + 1 / aR);
}

/** Reparte el rectángulo entre las fotos del subárbol y llena `out`. */
function layoutShape(shape: Shape, photos: LayoutPhoto[], dirs: number[], off: number, rect: Rect, gap: number, out: Rect[]): void {
  if (typeof shape === 'number') {
    out[shape] = rect;
    return;
  }
  const dir = dirs[off];
  const nl = countCuts(shape[0]);
  const offL = off + 1;
  const offR = off + 1 + nl;
  const aL = naturalAspect(shape[0], photos, dirs, offL);
  const aR = naturalAspect(shape[1], photos, dirs, offR);
  if (dir === 0) {
    const usable = Math.max(1, rect.w - gap);
    const wl = (usable * aL) / (aL + aR);
    layoutShape(shape[0], photos, dirs, offL, { x: rect.x, y: rect.y, w: wl, h: rect.h }, gap, out);
    layoutShape(shape[1], photos, dirs, offR, { x: rect.x + wl + gap, y: rect.y, w: usable - wl, h: rect.h }, gap, out);
  } else {
    const usable = Math.max(1, rect.h - gap);
    const ht = (usable * (1 / aL)) / (1 / aL + 1 / aR);
    layoutShape(shape[0], photos, dirs, offL, { x: rect.x, y: rect.y, w: rect.w, h: ht }, gap, out);
    layoutShape(shape[1], photos, dirs, offR, { x: rect.x, y: rect.y + ht + gap, w: rect.w, h: usable - ht }, gap, out);
  }
}

function scoreRects(rects: Rect[], photos: LayoutPhoto[], pageW: number, pageH: number): number {
  const pageArea = pageW * pageH;
  const minSide = Math.min(pageW, pageH);
  let score = 0;
  let minArea = Infinity;
  let maxArea = 0;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.w <= 0 || r.h <= 0) return Infinity;
    const crop = Math.abs(Math.log(r.w / r.h / photos[i].aspect));
    const areaFrac = (r.w * r.h) / pageArea;
    score += crop * crop * (0.4 + areaFrac);
    // Celdas demasiado finas o diminutas se ven mal impresas.
    const ar = r.w / r.h;
    if (ar > 3.2 || ar < 1 / 3.2) score += 1.5;
    if (Math.min(r.w, r.h) < minSide * 0.13) score += 2;
    minArea = Math.min(minArea, r.w * r.h);
    maxArea = Math.max(maxArea, r.w * r.h);
  }
  // Leve preferencia por tamaños parejos (se ve más prolijo).
  score += 0.04 * Math.log(maxArea / minArea);
  return score;
}

function signatureOf(rects: Rect[], pageW: number, pageH: number): string {
  return rects.map((r) => `${Math.round((r.x / pageW) * 20)},${Math.round((r.y / pageH) * 20)},${Math.round((r.w / pageW) * 20)},${Math.round((r.h / pageH) * 20)}`).join('|');
}

const pageCache = new Map<string, Candidate[]>();

/** Mejores mosaicos para una página con estas fotos (en orden). */
function bestPageLayouts(photos: LayoutPhoto[], pageW: number, pageH: number, gap: number, limit = 8, margin = 0): Candidate[] {
  const key = `${pageW}x${pageH}:${gap}:${margin}:${photos.map((p) => p.aspect.toFixed(2)).join(',')}`;
  const hit = pageCache.get(key);
  if (hit) return hit;

  const n = photos.length;
  const page: Rect = { x: margin, y: margin, w: pageW - margin * 2, h: pageH - margin * 2 };
  const all: Candidate[] = [];
  const cuts = n - 1;
  const shapeList = shapes(0, n);
  const totalCombos = shapeList.length * (1 << cuts);
  // Para 7-8 fotos hay decenas de miles de combinaciones: se muestrea.
  const sampleEvery = totalCombos > 12000 ? Math.ceil(totalCombos / 12000) : 1;
  let counter = 0;

  for (const shape of shapeList) {
    for (let mask = 0; mask < 1 << cuts; mask++) {
      counter++;
      if (sampleEvery > 1 && (counter * 7919) % sampleEvery !== 0) continue;
      const dirs: number[] = [];
      for (let b = 0; b < cuts; b++) dirs.push((mask >> b) & 1);
      const rects: Rect[] = new Array(n);
      layoutShape(shape, photos, dirs, 0, page, gap, rects);
      const score = scoreRects(rects, photos, pageW, pageH);
      if (!isFinite(score)) continue;
      all.push({ rects, score, signature: signatureOf(rects, pageW, pageH) });
    }
  }

  all.sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  const result: Candidate[] = [];
  for (const c of all) {
    if (seen.has(c.signature)) continue;
    seen.add(c.signature);
    result.push(c);
    if (result.length >= limit) break;
  }
  pageCache.set(key, result);
  if (pageCache.size > 4000) pageCache.clear();
  return result;
}

interface SpreadOption {
  /** Celdas en mm sobre la doble página (ancho = 2 páginas). */
  rects: Rect[];
  score: number;
}

/** Alternativas de diseño para una doble página, ordenadas de mejor a peor. */
function spreadOptions(photos: LayoutPhoto[], sizeId: string, spacing: SpacingOptions = DEFAULT_SPACING, limit = 14): SpreadOption[] {
  const { w: pw, h: ph } = pageSizeMm(sizeId);
  const gap = Math.max(0, spacing.gutterMm);
  const margin = Math.max(0, Math.min(spacing.marginMm, Math.min(pw, ph) / 4));
  const n = photos.length;
  if (n === 0) return [];

  const options: SpreadOption[] = [];
  if (n === 1) {
    // Una sola foto: toda la doble página (layflat), o sola en una página.
    const a = photos[0].aspect;
    const crop = (w: number, h: number) => Math.abs(Math.log(w / h / a));
    const fw = pw * 2 - margin * 2;
    const fh = ph - margin * 2;
    options.push({ rects: [{ x: margin, y: margin, w: fw, h: fh }], score: crop(fw, fh) * 0.6 });
  }
  // Todas las fotos en una sola página (la otra queda en blanco), o repartidas.
  for (let k = 0; k <= n; k++) {
    if (k > MAX_PHOTOS_PER_PAGE || n - k > MAX_PHOTOS_PER_PAGE) continue;
    const left = k > 0 ? bestPageLayouts(photos.slice(0, k), pw, ph, gap, 4, margin) : [{ rects: [], score: 0, signature: '' }];
    const right = k < n ? bestPageLayouts(photos.slice(k), pw, ph, gap, 4, margin) : [{ rects: [], score: 0, signature: '' }];
    const oneSided = k === 0 || k === n;
    // Dejar una página en blanco es una alternativa, nunca la primera opción.
    const balance = oneSided ? (n > 1 ? 8 : 0.9) : Math.abs(k - (n - k)) / n;
    for (const l of left) {
      for (const r of right) {
        options.push({
          rects: [...l.rects, ...r.rects.map((rc) => ({ ...rc, x: rc.x + pw }))],
          score: l.score + r.score + balance * 0.9,
        });
      }
    }
  }
  options.sort((a, b) => a.score - b.score);
  return options.slice(0, limit);
}

/** Cantidad de diseños distintos disponibles para estas fotos. */
export function countSpreadVariants(photos: LayoutPhoto[], sizeId: string, spacing?: SpacingOptions): number {
  return spreadOptions(photos, sizeId, spacing).length;
}

/** Calcula las celdas de una doble página para la alternativa `variant`. */
export function layoutSpread(photos: LayoutPhoto[], sizeId: string, variant = 0, previous?: AlbumCell[], spacing?: SpacingOptions): AlbumCell[] {
  const opts = spreadOptions(photos, sizeId, spacing);
  if (opts.length === 0) return [];
  const opt = opts[((variant % opts.length) + opts.length) % opts.length];
  const { w: pw, h: ph } = pageSizeMm(sizeId);
  const spreadW = pw * 2;
  return opt.rects.map((r, i) => {
    const prev = previous?.find((c) => c.photoId === photos[i].id);
    return {
      photoId: photos[i].id,
      x: r.x / spreadW,
      y: r.y / ph,
      w: r.w / spreadW,
      h: r.h / ph,
      // Conservamos el encuadre que el cliente ya ajustó.
      zoom: prev?.zoom ?? 1,
      panX: prev?.panX ?? 0.5,
      panY: prev?.panY ?? 0.5,
    };
  });
}

// ---------------------------------------------------------------------------
// Armado automático del álbum completo
// ---------------------------------------------------------------------------

let idCounter = 0;
export function newSpreadId(): string {
  idCounter++;
  return `sp-${Date.now().toString(36)}-${idCounter}`;
}

/** Cuántas dobles páginas conviene usar para N fotos. */
export function suggestedSheets(photoCount: number, minSheets: number): number {
  // Promedio cómodo: ~6 fotos por doble página; nunca más de 16 (8 por página).
  const comfortable = Math.ceil(photoCount / 6);
  const needed = Math.ceil(photoCount / (MAX_PHOTOS_PER_PAGE * 2));
  return Math.min(MAX_SHEETS, Math.max(minSheets, comfortable, needed));
}

/**
 * Reparte las fotos (en orden) entre las dobles páginas con algo de ritmo:
 * algunas cargadas, otras más aireadas, como un diseñador.
 */
export function distributeCounts(photoCount: number, sheets: number): number[] {
  if (sheets <= 0) return [];
  const counts: number[] = new Array(sheets).fill(0);
  if (photoCount <= 0) return counts;
  if (photoCount <= sheets) {
    for (let i = 0; i < photoCount; i++) counts[i] = 1;
    return counts;
  }
  const maxPer = MAX_PHOTOS_PER_PAGE * 2;
  const rhythm = [0.6, 1.15, 0.9, 1.3, 0.75, 1.2, 1.0, 1.25, 0.85, 1.1];
  const weights = counts.map((_, i) => rhythm[i % rhythm.length]);
  // Con suficientes fotos, cada tanto una doble página con una sola foto grande.
  const hero = new Set<number>();
  if (photoCount / sheets >= 4) {
    for (let i = 5; i < sheets - 1; i += 6) hero.add(i);
  }
  const others = counts.map((_, i) => i).filter((i) => !hero.has(i));
  const remaining = photoCount - hero.size;
  if (others.length * maxPer < remaining) hero.clear();
  const pool = counts.map((_, i) => i).filter((i) => !hero.has(i));
  const toPlace = photoCount - hero.size;
  const sumW = pool.reduce((a, i) => a + weights[i], 0);
  const ideal = new Map<number, number>();
  for (const i of pool) ideal.set(i, (toPlace * weights[i]) / sumW);
  for (const i of hero) counts[i] = 1;
  for (const i of pool) counts[i] = Math.min(maxPer, Math.max(1, Math.floor(ideal.get(i)!)));
  let sum = counts.reduce((a, b) => a + b, 0);
  while (sum < photoCount) {
    let best = -1;
    for (const i of pool) if (counts[i] < maxPer && (best < 0 || ideal.get(i)! - counts[i] > ideal.get(best)! - counts[best])) best = i;
    if (best < 0) break;
    counts[best]++;
    sum++;
  }
  while (sum > photoCount) {
    let best = -1;
    for (const i of pool) if (counts[i] > 1 && (best < 0 || ideal.get(i)! - counts[i] < ideal.get(best)! - counts[best])) best = i;
    if (best < 0) break;
    counts[best]--;
    sum--;
  }
  return counts;
}

export function buildSpreads(photos: LayoutPhoto[], sizeId: string, sheets: number, spacing?: SpacingOptions): AlbumSpread[] {
  const counts = distributeCounts(photos.length, sheets);
  const spreads: AlbumSpread[] = [];
  let cursor = 0;
  for (const c of counts) {
    const slice = photos.slice(cursor, cursor + c);
    cursor += c;
    spreads.push({
      id: newSpreadId(),
      photoIds: slice.map((p) => p.id),
      variant: 0,
      cells: layoutSpread(slice, sizeId, 0, undefined, spacing),
    });
  }
  return spreads;
}

// ---------------------------------------------------------------------------
// Encuadre (misma cuenta para la pantalla y para el archivo de impresión)
// ---------------------------------------------------------------------------

/**
 * Dado el tamaño del marco y la forma de la foto, devuelve dónde dibujar la
 * foto relativo al marco (fracciones del marco). left/top pueden ser negativos.
 */
export function placeImage(frameAspect: number, photoAspect: number, zoom: number, panX: number, panY: number) {
  // Escala "cover": la foto cubre el marco por completo.
  let w: number;
  let h: number;
  if (photoAspect > frameAspect) {
    h = 1;
    w = photoAspect / frameAspect;
  } else {
    w = 1;
    h = frameAspect / photoAspect;
  }
  const z = Math.max(1, zoom);
  w *= z;
  h *= z;
  return { width: w, height: h, left: (1 - w) * clamp01(panX), top: (1 - h) * clamp01(panY) };
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

/** Resolución real (DPI) con la que se imprimiría una foto en esa celda. */
export function effectiveDpi(cell: AlbumCell, sizeId: string, photoWidthPx?: number, photoHeightPx?: number): number | null {
  if (!photoWidthPx || !photoHeightPx) return null;
  const { w: pw, h: ph } = pageSizeMm(sizeId);
  const cellWmm = cell.w * pw * 2;
  const cellHmm = cell.h * ph;
  const place = placeImage(cellWmm / cellHmm, photoWidthPx / photoHeightPx, cell.zoom, cell.panX, cell.panY);
  const drawnWidthInches = (place.width * cellWmm) / 25.4;
  return photoWidthPx / drawnWidthInches;
}

export { BLEED_MM };
