// Shared pricing engine for HALO's three catalog-priced product types
// (custom-album, photobook-order, fine-art-print). This is the SINGLE
// source of truth for what an item should cost — imported by the client
// (real-time totals as the customer configures a product) AND by
// api/create-preference.ts (recomputes every item's price server-side and
// rejects the request if the client-declared price doesn't match exactly,
// instead of trusting it).
//
// Concierge requests ('concierge-request') are custom-quoted and have no
// catalog price to recompute — they stay outside this module by design.
//
// IMPORTANT: if you change how a price is computed in PhotobookBuilder.tsx
// or ProductCatalog.tsx, mirror the change here too, or legitimate orders
// will start getting rejected as "tampered".
import {
  BOOK_FORMATS,
  COVER_MATERIALS,
  PAPER_FINISHES,
  PHOTOBOOK_GRANDES_FORMATOS,
  FINE_ART_PRINTS_PRODUCT,
} from '../data/mockData';
import { getFotolibroSize, minSheetsFor, MAX_SHEETS } from '../data/fotolibroCatalog';

// Kept in sync with PhotobookBuilder.tsx's `giftBoxCost` (not broken out as
// its own named export there).
export const GIFT_BOX_PRICE = 28000;

export interface CustomAlbumPricingInput {
  formatId?: string;
  coverMaterialId?: string;
  paperFinishId?: string;
  pages?: number;
  giftBoxIncluded?: boolean;
}

/**
 * Exact price for a PhotobookBuilder ("custom-album") item — mirrors
 * PhotobookBuilder.tsx's `totalPrice`:
 *   basePrice + extraPagesCost + giftBoxCost + coverUpgradeCost + paperUpgradeCost
 * Returns null when formatId/paperFinishId don't match a real catalog
 * entry (can't price something that doesn't exist).
 */
export function priceCustomAlbum(input: CustomAlbumPricingInput): number | null {
  const format = BOOK_FORMATS.find((f) => f.id === input.formatId);
  if (!format) return null;

  // Paper finish carries a real price delta (up to +28000) — must match a
  // known finish, not silently default to the cheapest one.
  const paper = PAPER_FINISHES.find((p) => p.id === input.paperFinishId);
  if (!paper) return null;

  const cover = COVER_MATERIALS.find((c) => c.id === input.coverMaterialId);
  const coverDelta = cover ? cover.priceDelta : 0;

  const totalPages = Number(input.pages) || format.basePages;
  const extraPages = Math.max(0, totalPages - format.basePages);
  const extraSpreads = Math.ceil(extraPages / 2);
  const extraPagesCost = extraSpreads * format.extraSpreadPrice;
  const giftBoxCost = input.giftBoxIncluded ? GIFT_BOX_PRICE : 0;

  return format.basePrice + extraPagesCost + coverDelta + paper.priceDelta + giftBoxCost;
}

export interface PhotobookOrderPricingInput {
  formatId?: string;
  extraSheets?: number;
}

/**
 * Exact price for a "Fotolibro de Autor Gran Formato" item
 * (ProductCatalog.tsx) — mirrors `photobookTotalPrice`:
 *   basePriceEnvolvente + extraSheets * extraSheetPrice
 * Both finishes ('envolvente' / 'foto-tapa-cuero') cost the same
 * (basePriceEnvolvente === basePriceCueroTapa for every format), so the
 * finish choice doesn't affect price. Returns null when formatId doesn't
 * match a real catalog entry.
 */
export function pricePhotobookOrder(input: PhotobookOrderPricingInput): number | null {
  const format = PHOTOBOOK_GRANDES_FORMATOS.formats.find((f) => f.id === input.formatId);
  if (!format) return null;

  const extraSheets = Math.max(0, Math.floor(Number(input.extraSheets) || 0));
  return format.basePriceEnvolvente + extraSheets * format.extraSheetPrice;
}

export interface FineArtPrintPricingInput {
  sizeId?: string;
  paperId?: string;
  quantity?: number;
}

/**
 * Exact price for a Fine Art print item (ProductCatalog.tsx) — mirrors
 * `totalPrintPrice`: round(size.price * paper.priceMultiplier) * quantity.
 * Returns null when sizeId/paperId don't match a real catalog entry.
 */
export function priceFineArtPrint(input: FineArtPrintPricingInput): number | null {
  const size = FINE_ART_PRINTS_PRODUCT.sizes.find((s) => s.id === input.sizeId);
  const paper = FINE_ART_PRINTS_PRODUCT.paperOptions.find((p) => p.id === input.paperId);
  if (!size || !paper) return null;

  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const unitPrice = Math.round(size.price * paper.priceMultiplier);
  return unitPrice * quantity;
}

export interface FotolibroPricingInput {
  sizeId?: string;
  coverType?: string;
  finish?: string;
  sheets?: number;
  giftBox?: boolean;
}

/**
 * Precio exacto de un fotolibro armado en el editor simple
 * (SimpleAlbumEditor.tsx, ítem 'fotolibro'), según la lista oficial
 * (src/data/fotolibroCatalog.ts):
 *   - Tapa blanda: precio de 7 hojas (hasta 7) o de 10 hojas (8 a 10),
 *     + hoja adicional desde la 11; caja contenedora opcional aparte.
 *   - Tapa dura (envolvente o foto tapa + cuero): precio fijo con 10 hojas y
 *     caja incluida, + hoja adicional desde la 11.
 * 1 hoja = 1 doble página. Devuelve null si la configuración no existe.
 */
export function priceFotolibro(input: FotolibroPricingInput): number | null {
  const size = getFotolibroSize(input.sizeId);
  if (!size) return null;
  const coverType = input.coverType;
  if (coverType !== 'blanda' && coverType !== 'dura') return null;
  const finish = input.finish;
  if (coverType === 'blanda' && finish !== 'envolvente') return null;
  if (coverType === 'dura' && finish !== 'envolvente' && finish !== 'foto-tapa-cuero') return null;

  const sheets = Math.floor(Number(input.sheets) || 0);
  if (sheets < minSheetsFor(coverType) || sheets > MAX_SHEETS) return null;
  const extraSheets = Math.max(0, sheets - 10);

  if (coverType === 'dura') {
    return size.dura.price + extraSheets * size.dura.extraSheet;
  }
  const base = sheets <= 7 ? size.blanda.sheets7 : size.blanda.sheets10;
  const box = input.giftBox && size.boxPrice ? size.boxPrice : 0;
  return base + extraSheets * size.blanda.extraSheet + box;
}
