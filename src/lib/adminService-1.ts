import { TrackedOrder, OrderStatusStage, DesignServiceRequest, PhotoAsset, PhotobookProject } from '../types';
import { SAMPLE_ORDERS } from '../data/mockData';
import { supabase, isSupabaseConfigured, fetchAllOrders } from './supabase';
import { dbOrderToTrackedOrder } from './orderMapper';
import { getPhotoDownloadUrl } from './photoStorageService';
import JSZip from 'jszip';

const ADMIN_ORDERS_KEY = 'halo_admin_orders_db';
const CONCIERGE_REQUESTS_KEY = 'halo_concierge_requests_db';

// Mock sample concierge requests for workshop testing
const INITIAL_CONCIERGE_REQUESTS: DesignServiceRequest[] = [
  {
    id: 'req-201',
    customerName: 'Santiago Morales',
    customerEmail: 'santiago.morales@viajes.com',
    customerPhone: '+54 351 556-7890',
    occasion: 'viaje',
    bookFormatId: 'landscape-30-20',
    coverMaterialId: 'linen-terracotta',
    foilColor: 'bronze',
    coverTitle: 'PATAGONIA SUR · EXPEDICIÓN 2026',
    coverSubtitle: 'RECUERDOS DE VIAJE',
    hasCoverWindow: false,
    paperFinishId: 'fine-art-velvet',
    designStyle: 'editorial',
    uploadMethod: 'cloud-link',
    cloudLink: 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ?usp=sharing',
    uploadedPhotos: [],
    estimatedPhotosCount: 85,
    specialInstructions: 'Priorizar fotos panorámicas de El Chaltén y glaciares. Dejar espacios en blanco tipo libro de arte contemporáneo.',
    giftBox: true,
    estimatedPages: 24,
    estimatedTotal: 141000,
  },
  {
    id: 'req-202',
    customerName: 'Camila & Facundo Benítez',
    customerEmail: 'camila.benitez@gmail.com',
    customerPhone: '+54 11 3998-1234',
    occasion: 'boda',
    bookFormatId: 'square-30',
    coverMaterialId: 'photo-hardcover',
    foilColor: 'gold',
    coverTitle: 'NUESTRO DÍA SOÑADO',
    coverSubtitle: 'CAMI & FACU · 15 DE FEBRERO 2026',
    hasCoverWindow: true,
    coverWindowPhotoIndex: 0,
    paperFinishId: 'photo-lustre',
    designStyle: 'clasico',
    uploadMethod: 'direct',
    uploadedPhotos: [
      {
        id: 'req-ph-1',
        url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
        name: 'Vals_Principal.jpg',
        caption: 'Momento del vals',
      },
      {
        id: 'req-ph-2',
        url: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1200&q=80',
        name: 'Ceremonia_Anillos.jpg',
        caption: 'Entrega de alianzas',
      },
      {
        id: 'req-ph-3',
        url: 'https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=1200&q=80',
        name: 'Ramo_Novia.jpg',
        caption: 'Detalle del vestido y ramo',
      }
    ],
    estimatedPhotosCount: 120,
    specialInstructions: 'Queremos que el orden sea estrictamente cronológico desde la preparación hasta el final de la fiesta en Pilar.',
    giftBox: true,
    estimatedPages: 30,
    estimatedTotal: 185000,
  }
];

// 1. Get all orders
export function getAdminOrders(): TrackedOrder[] {
  try {
    const raw = localStorage.getItem(ADMIN_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading admin orders from localStorage', e);
  }
  // Initialize with sample orders
  saveAdminOrders(SAMPLE_ORDERS);
  return SAMPLE_ORDERS;
}

// 1b. Get real orders from Supabase (the actual source of truth once the
// store is live — `getAdminOrders()` above only ever returns localStorage
// demo data, which is fine for the workshop UI when Supabase isn't
// configured, but must never be what the admin sees once real customers
// are placing real, paid orders).
export async function getAdminOrdersFromSupabase(): Promise<{ orders: TrackedOrder[]; isLive: boolean; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { orders: getAdminOrders(), isLive: false, error: null };
  }
  const { data, error } = await fetchAllOrders();
  if (error) {
    // Fall back to whatever is cached locally rather than showing nothing.
    return { orders: getAdminOrders(), isLive: false, error };
  }
  return { orders: data.map(dbOrderToTrackedOrder), isLive: true, error: null };
}

// 2. Save orders
export function saveAdminOrders(orders: TrackedOrder[]) {
  try {
    localStorage.setItem(ADMIN_ORDERS_KEY, JSON.stringify(orders));
  } catch (e) {
    console.error('Error saving admin orders', e);
  }
}

// 3. Update Order Status in Workshop
// Takes the full order currently being edited (rather than re-reading it out
// of the localStorage demo cache) so this works correctly for real orders
// that only exist in Supabase — the localStorage cache is written too, but
// purely as an offline fallback, never as the lookup source.
export async function updateOrderStatusInWorkshop(
  currentOrder: TrackedOrder,
  newStage: OrderStatusStage,
  trackingCode?: string,
  labNotes?: string
): Promise<TrackedOrder | null> {
  const order: TrackedOrder = { ...currentOrder, status: newStage };

  if (trackingCode !== undefined) {
    order.trackingCode = trackingCode;
  }
  if (labNotes !== undefined) {
    order.labNotes = labNotes;
  }

  // Update timeline
  const nowStr = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';

  const stagesOrder: OrderStatusStage[] = ['en_diseno', 'en_impresion', 'enviado', 'entregado'];
  const currentStageIdx = stagesOrder.indexOf(newStage);

  order.timeline = order.timeline.map((step, idx) => {
    const isCompleted = idx < currentStageIdx || (idx === currentStageIdx && newStage === 'entregado');
    const isCurrent = idx === currentStageIdx && newStage !== 'entregado';
    return {
      ...step,
      completed: isCompleted,
      current: isCurrent,
      date: isCurrent || (isCompleted && !step.completed) ? nowStr : step.date,
      time: isCurrent || (isCompleted && !step.completed) ? timeStr : step.time,
    };
  });

  // Best-effort offline cache (only meaningful when this order came from the
  // localStorage demo set to begin with).
  const orders = getAdminOrders();
  const orderIdx = orders.findIndex((o) => o.id === order.id || o.orderNumber === order.orderNumber);
  if (orderIdx !== -1) {
    orders[orderIdx] = order;
    saveAdminOrders(orders);
  }

  // Source of truth: Supabase
  if (supabase) {
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: newStage,
          tracking_number: order.trackingCode || null,
          lab_notes: order.labNotes || null,
        })
        .eq('order_code', order.orderNumber);
      if (error) {
        console.warn('No se pudo sincronizar el estado con Supabase', error.message);
      }
    } catch (err) {
      console.warn('No se pudo sincronizar el estado con Supabase', err);
    }
  }

  return order;
}

// 3b. Delete Order (Panel de Taller — "Eliminar Pedido")
// Removes the order from Supabase (source of truth) and from the local
// offline cache. There is no undo once this succeeds — the caller is
// expected to confirm with the admin before calling this.
export async function deleteOrderFromWorkshop(order: TrackedOrder): Promise<{ error: string | null }> {
  // Best-effort local cache cleanup regardless of Supabase result.
  const orders = getAdminOrders().filter((o) => o.id !== order.id && o.orderNumber !== order.orderNumber);
  saveAdminOrders(orders);

  if (supabase) {
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('order_code', order.orderNumber);
      if (error) {
        return { error: error.message };
      }
    } catch (err: any) {
      return { error: err?.message || 'No se pudo eliminar el pedido.' };
    }
  }

  return { error: null };
}

// 4. Get Concierge Requests
export function getAdminConciergeRequests(): DesignServiceRequest[] {
  try {
    const raw = localStorage.getItem(CONCIERGE_REQUESTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading concierge requests', e);
  }
  localStorage.setItem(CONCIERGE_REQUESTS_KEY, JSON.stringify(INITIAL_CONCIERGE_REQUESTS));
  return INITIAL_CONCIERGE_REQUESTS;
}

// 5. Add new Concierge Request
export function addAdminConciergeRequest(req: DesignServiceRequest) {
  const requests = getAdminConciergeRequests();
  requests.unshift(req);
  try {
    localStorage.setItem(CONCIERGE_REQUESTS_KEY, JSON.stringify(requests));
  } catch (e) {
    console.error('Error saving concierge request', e);
  }
}

// 6. Download ZIP of High-Resolution Production Assets
//
// Only ever packages REAL files: either photoAssets explicitly passed in, or
// files whose Supabase Storage path (item.photoStoragePath, set today for
// 'fine-art-print' cart items) we can resolve to a real signed download URL.
// It used to silently fall back to three unrelated Unsplash stock photos
// when no real photo was available — that produced a ZIP that looked
// legitimate but contained sample images, which is worse than saying
// plainly that there's nothing to download yet. If no real photo is found,
// this now returns { ok: false, reason: 'no_photos' } instead of a fake ZIP,
// so the caller can point the admin at the order's real Google Drive/MEGA
// folder (where the client's originals actually live) instead.
export async function generateAndDownloadProductionZip(
  order: TrackedOrder,
  photoAssets: PhotoAsset[] = []
): Promise<{ ok: boolean; reason?: 'no_photos' | 'zip_error' }> {
  // If the caller didn't pass explicit assets, try to resolve real ones from
  // any order item that has a Supabase Storage path on file.
  let resolvedAssets = photoAssets;
  if (resolvedAssets.length === 0) {
    const withPaths = order.items.filter((it: any) => it.photoStoragePath);
    const resolved = await Promise.all(
      withPaths.map(async (it: any, idx: number) => {
        const url = await getPhotoDownloadUrl(it.photoStoragePath);
        if (!url) return null;
        return { id: `item-${idx}`, name: it.title || `foto_${idx + 1}`, url } as PhotoAsset;
      })
    );
    resolvedAssets = resolved.filter((a): a is PhotoAsset => a !== null);
  }

  if (resolvedAssets.length === 0) {
    return { ok: false, reason: 'no_photos' };
  }

  const zip = new JSZip();

  // Create Workshop Technical Spec Sheet
  const specSheetContent = `========================================================================
HALO FINE ART LAB - FICHA TÉCNICA DE PRODUCCIÓN & ENCUADERNACIÓN
Laboratorio Artesanal de Fotolibros · Pilar, Buenos Aires
========================================================================

NÚMERO DE PEDIDO:     ${order.orderNumber}
FECHA DE ORDEN:       ${order.createdAt}
ESTADO ACTUAL:        ${order.status.toUpperCase()}
MÉTODO DE PAGO:       ${order.paymentMethod}
INVERSIÓN TOTAL:      $${order.totalPrice.toLocaleString('es-AR')} ARS

------------------------------------------------------------------------
DATOS DEL CLIENTE & DESTINO DE ENTREGA
------------------------------------------------------------------------
Nombre:               ${order.customerName}
Email de Contacto:    ${order.customerEmail}
Teléfono:             ${order.customerPhone || 'No proporcionado'}
Dirección de Entrega: ${order.shippingAddress}
Localidad:            ${order.shippingCity}
Modalidad de Envío:   ${order.shippingMethod === 'pilar_direct' ? 'ENTREGA DIRECTA PILAR & ALREDEDORES (Radio 20 km Bonificada)' : 'ENVÍO NACIONAL (Correo Argentino / Expreso)'}
Código de Despacho:   ${order.trackingCode || 'Pendiente de emisión'}

------------------------------------------------------------------------
ESPECIFICACIONES DEL FOTOLIBRO & ENCUADERNACIÓN
------------------------------------------------------------------------
${order.items.map((item, i) => `
ÍTEM #${i + 1}: ${item.title}
• Formato:              ${item.format}
• Material de Portada:  ${item.cover}
• Estampado Hot Stamping: ${item.foil}
• Tipo de Papel:        Papel Fotográfico Químico Profesional HD (Fuji Crystal Archive Lustre / Velvet)
• Apertura:             180° Layflat (Apertura Panorámica Plana)
• Cantidad de Páginas:  ${item.pages} páginas (${Math.ceil(item.pages / 2)} pliegos dobles)
• Caja Rígida de Lujo:  ${item.hasGiftBox ? 'INCLUIDA (Acabado texturado con lazo)' : 'NO'}
• Importe:              $${item.price.toLocaleString('es-AR')} ARS
`).join('\n')}

------------------------------------------------------------------------
INSTRUCCIONES & NOTAS DE TALLER:
------------------------------------------------------------------------
${order.labNotes || 'Inspección minuciosa de apertura 180° y curado de lomo bajo prensa de 24 horas.'}

========================================================================
HALO Fine Art Lab · Pilar, Buenos Aires · www.halofineart.com.ar
========================================================================
`;

  zip.file(`FICHA_TECNICA_${order.orderNumber}.txt`, specSheetContent);

  const photosFolder = zip.folder(`FOTOS_ALTA_CALIDAD_${order.orderNumber}`);

  // Fetch each real photo as a blob and add it to the zip, naming the file
  // from the photo's actual content type instead of always forcing ".jpg"
  // (that mismatch used to produce names like "02_Pliego_01_Apertura.jpg.jpg"
  // when photo.name already ended in .jpg).
  for (let i = 0; i < resolvedAssets.length; i++) {
    const photo = resolvedAssets[i];
    try {
      const response = await fetch(photo.url);
      const blob = await response.blob();
      const extFromType = blob.type?.split('/')[1]?.split(';')[0]?.toLowerCase();
      const ext = extFromType === 'jpeg' ? 'jpg' : (extFromType && /^[a-z0-9]+$/.test(extFromType) ? extFromType : 'jpg');
      const baseName = (photo.name || `foto_${i + 1}`)
        .replace(/\.[a-zA-Z0-9]+$/, '') // strip any extension already present
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${String(i + 1).padStart(2, '0')}_${baseName}.${ext}`;
      photosFolder?.file(filename, blob);
    } catch (e) {
      console.warn(`Could not fetch photo ${photo.url}`, e);
      photosFolder?.file(`FOTO_${i + 1}_ENLACE_ALTA_CALIDAD.txt`, `Enlace de descarga directa: ${photo.url}`);
    }
  }

  // Generate ZIP and trigger browser download
  try {
    const content = await zip.generateAsync({ type: 'blob' });
    const downloadUrl = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `HALO_PRODUCCION_${order.orderNumber}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { ok: true };
  } catch (e) {
    console.error('Error generando el ZIP de producción', e);
    return { ok: false, reason: 'zip_error' };
  }
  URL.revokeObjectURL(downloadUrl);
}
