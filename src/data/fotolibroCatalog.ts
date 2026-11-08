// Catálogo del editor simple de fotolibros (SimpleAlbumEditor).
// Fuente: lista oficial "servicios-halo.pdf" (Servicios y precios, HALO Fine Art Lab).
// Si cambian los precios, se cambian SOLO acá: lo usan el editor (precio en
// vivo) y api/create-preference.ts (recalcula el precio del lado del servidor
// vía src/lib/pricing.ts → priceFotolibro).

export type FotolibroCoverType = 'blanda' | 'dura';
export type FotolibroFinish = 'envolvente' | 'foto-tapa-cuero';
export type FotolibroLaminate = 'brillo' | 'mate';

export interface FotolibroSize {
  id: string;
  /** Texto "cerrado" tal cual figura en la lista de precios. */
  closedLabel: string;
  /** Texto "abierto" tal cual figura en la lista de precios. */
  openLabel: string;
  /** Medida de UNA página en cm (ancho × alto), deducida de la medida abierta. */
  pageWidthCm: number;
  pageHeightCm: number;
  orientation: 'cuadrado' | 'vertical' | 'apaisado';
  blanda: { sheets7: number; sheets10: number; extraSheet: number };
  dura: { price: number; extraSheet: number };
  /** Precio de la caja contenedora (tela/cuero) para tapa blanda. null = no hay caja para esta medida. */
  boxPrice: number | null;
  popular?: boolean;
}

export const FOTOLIBRO_SIZES: FotolibroSize[] = [
  { id: '10x15', closedLabel: '10 × 15 cm', openLabel: '15 × 21 cm', pageWidthCm: 10, pageHeightCm: 15, orientation: 'vertical',
    blanda: { sheets7: 30000, sheets10: 40000, extraSheet: 5400 }, dura: { price: 56000, extraSheet: 5400 }, boxPrice: null },
  { id: '15x21', closedLabel: '15 × 21 cm', openLabel: '20 × 30 cm', pageWidthCm: 15, pageHeightCm: 21, orientation: 'vertical',
    blanda: { sheets7: 50000, sheets10: 60000, extraSheet: 6000 }, dura: { price: 76000, extraSheet: 6000 }, boxPrice: 44000 },
  { id: '20x20', closedLabel: '20 × 20 cm', openLabel: '20 × 40 cm', pageWidthCm: 20, pageHeightCm: 20, orientation: 'cuadrado',
    blanda: { sheets7: 70000, sheets10: 78000, extraSheet: 7600 }, dura: { price: 98000, extraSheet: 7600 }, boxPrice: 55000 },
  { id: '20x30-apaisado', closedLabel: '20 × 30 cm apaisado', openLabel: '20 × 60 cm', pageWidthCm: 30, pageHeightCm: 20, orientation: 'apaisado',
    blanda: { sheets7: 96000, sheets10: 108000, extraSheet: 10800 }, dura: { price: 128000, extraSheet: 10800 }, boxPrice: null },
  { id: '20x30-vertical', closedLabel: '20 × 30 cm vertical', openLabel: '30 × 40 cm', pageWidthCm: 20, pageHeightCm: 30, orientation: 'vertical',
    blanda: { sheets7: 88000, sheets10: 96000, extraSheet: 9600 }, dura: { price: 116000, extraSheet: 9600 }, boxPrice: 64000 },
  { id: '22x30', closedLabel: '22,5 × 30 cm', openLabel: '30 × 45 cm', pageWidthCm: 22.5, pageHeightCm: 30, orientation: 'vertical',
    blanda: { sheets7: 96000, sheets10: 108000, extraSheet: 10800 }, dura: { price: 128000, extraSheet: 10800 }, boxPrice: 73000 },
  { id: '30x30', closedLabel: '30 × 30 cm', openLabel: '30 × 60 cm', pageWidthCm: 30, pageHeightCm: 30, orientation: 'cuadrado',
    blanda: { sheets7: 114000, sheets10: 124000, extraSheet: 12400 }, dura: { price: 166000, extraSheet: 12400 }, boxPrice: 90000, popular: true },
  { id: '30x45', closedLabel: '30 × 45 cm', openLabel: '30 × 90 cm', pageWidthCm: 45, pageHeightCm: 30, orientation: 'apaisado',
    blanda: { sheets7: 190000, sheets10: 210000, extraSheet: 17200 }, dura: { price: 258000, extraSheet: 17200 }, boxPrice: null },
  { id: '40x30', closedLabel: '40 × 30 cm', openLabel: '40 × 60 cm', pageWidthCm: 30, pageHeightCm: 40, orientation: 'vertical',
    blanda: { sheets7: 210000, sheets10: 220000, extraSheet: 21000 }, dura: { price: 290000, extraSheet: 21000 }, boxPrice: 102000 },
  { id: '40x40', closedLabel: '40 × 40 cm', openLabel: '40 × 80 cm', pageWidthCm: 40, pageHeightCm: 40, orientation: 'cuadrado',
    blanda: { sheets7: 260000, sheets10: 280000, extraSheet: 30000 }, dura: { price: 316000, extraSheet: 30000 }, boxPrice: null },
];

/** 1 hoja = 1 doble página (2 páginas). */
export const MIN_SHEETS_BLANDA = 7;
export const MIN_SHEETS_DURA = 10;
export const MAX_SHEETS = 40;
export const MAX_PHOTOS_PER_PAGE = 8;

/** Separación blanca entre fotos, en mm (línea fina como en los fotolibros de HALO). */
export const GUTTER_MM = 3;
/** Sangrado que se agrega alrededor de cada archivo de impresión, en mm. */
export const BLEED_MM = 3;
/** Resolución de los archivos de impresión. */
export const PRINT_DPI = 300;

export const COVER_OPTIONS: { type: FotolibroCoverType; finish: FotolibroFinish; name: string; description: string }[] = [
  { type: 'blanda', finish: 'envolvente', name: 'Tapa blanda', description: 'Toda la tapa es foto, del mismo material que las páginas.' },
  { type: 'dura', finish: 'envolvente', name: 'Tapa dura envolvente', description: 'La foto cubre tapa, lomo y contratapa. Incluye caja.' },
  { type: 'dura', finish: 'foto-tapa-cuero', name: 'Tapa dura foto + cuero', description: 'Foto en la tapa y contratapa de cuero negro. Incluye caja.' },
];

export function getFotolibroSize(id?: string): FotolibroSize | undefined {
  return FOTOLIBRO_SIZES.find((s) => s.id === id);
}

export function minSheetsFor(cover: FotolibroCoverType): number {
  return cover === 'dura' ? MIN_SHEETS_DURA : MIN_SHEETS_BLANDA;
}

// ---------------------------------------------------------------------------
// Fotolibros "listos para elegir" (pantalla 1 de FotolibroExpress).
// Para cambiar qué se ofrece, editar SOLO esta lista: medida (sizeId de
// FOTOLIBRO_SIZES) + tipo de tapa. El precio sale solo de la lista oficial.
// ---------------------------------------------------------------------------

export interface FotolibroPreset {
  id: string;
  name: string;
  tagline: string;
  sizeId: string;
  coverType: FotolibroCoverType;
  finish: FotolibroFinish;
  badge?: string;
}

export const FOTOLIBRO_PRESETS: FotolibroPreset[] = [
  { id: 'esencial', name: 'Esencial', tagline: 'Tapa blanda con tu foto. Liviano y perfecto para regalar.', sizeId: '20x20', coverType: 'blanda', finish: 'envolvente' },
  { id: 'clasico', name: 'Clásico', tagline: 'Tapa dura con foto y contratapa de cuero negro. Incluye caja.', sizeId: '30x30', coverType: 'dura', finish: 'foto-tapa-cuero', badge: 'El más elegido' },
  { id: 'gran-formato', name: 'Gran formato', tagline: 'Nuestro libro más grande, para tus fotos más importantes. Incluye caja.', sizeId: '40x40', coverType: 'dura', finish: 'foto-tapa-cuero' },
];
