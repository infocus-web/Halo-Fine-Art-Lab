import type { AlbumDesign } from './lib/albumLayout';

export type BookFormatId = 
  | 'square-30' 
  | 'square-20' 
  | 'square-15'
  | 'landscape-30-20' 
  | 'landscape-40-30'
  | 'portrait-20-30'
  | '30x30'
  | '30x45'
  | '40x30'
  | '40x40'
  | string;

// --- ESTRUCTURA DE CATÁLOGO: FOTOLIBROS DE AUTOR ---
export type PhotobookFinish = 'envolvente' | 'foto-tapa-cuero';

export interface PhotobookFormat {
  id: string; // "30x30", "30x45", "40x30", "40x40"
  label: string; // "30 × 30 cm"
  openLabel: string; // "abierto 30 × 60 cm"
  basePriceEnvolvente: number; // 166000
  basePriceCueroTapa: number; // 166000
  baseSheets: number; // 10 hojas (20 páginas)
  extraSheetPrice: number; // Precio por hoja adicional
  dimensions: string;
  idealPhotos: string;
  popular?: boolean;
  aspectRatioLabel?: string;
}

export interface PhotobookProduct {
  id: string;
  category: 'fotolibro';
  name: string;
  collection: string;
  subtitle: string;
  description: string;
  formats: PhotobookFormat[];
  finishes: {
    id: PhotobookFinish;
    name: string;
    description: string;
    badge?: string;
  }[];
  includesBox: true;
  productionTime: string;
  depositPercent: number; // 50%
}

// --- ESTRUCTURA DE CATÁLOGO: FOTOS SUELTAS FINE ART ---
export interface PrintSize {
  id: string; // "10x15", "13x18", "15x21", "20x30", etc.
  label: string; // "10 × 15 cm"
  price: number; // 3500
  aspectRatio: string;
  dimensionsMm: string;
  popular?: boolean;
  recommendedFor?: string;
}

export interface PrintPaperOption {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  grammage: string;
  priceMultiplier: number;
  badge?: string;
}

export interface PrintProduct {
  id: string;
  category: 'foto-suelta';
  name: string;
  collection: string;
  subtitle: string;
  description: string;
  sizes: PrintSize[];
  paperOptions: PrintPaperOption[];
  productionTime: string;
  minimumOrder: number;
}

export interface BookFormat {
  id: BookFormatId;
  name: string;
  dimensions: string;
  description: string;
  basePages: number;
  basePrice: number;
  extraSpreadPrice: number; // 2 pages
  idealPhotos: string;
  popular?: boolean;
  category?: 'cuadrado' | 'apaisado' | 'vertical';
}

export type CoverMaterialId = 
  | 'linen-natural' 
  | 'linen-sand' 
  | 'linen-sage' 
  | 'linen-terracotta' 
  | 'linen-midnight'
  | 'linen-rose'
  | 'linen-mustard'
  | 'linen-pearl-grey'
  | 'leather-taupe' 
  | 'leather-cognac'
  | 'leather-ebony'
  | 'silk-pearl'
  | 'silk-champagne'
  | 'silk-platinum'
  | 'photo-hardcover' 
  | 'velvet-rose'
  | 'velvet-emerald'
  | 'velvet-royal-blue'
  | 'velvet-terracotta';

export interface CoverMaterial {
  id: CoverMaterialId;
  name: string;
  category: 'lino' | 'cuero' | 'seda' | 'terciopelo' | 'fotografica';
  colorHex: string;
  textureClass: string;
  priceDelta: number;
  previewUrl: string;
  description: string;
}

export type FoilColor = 'gold' | 'rose-gold' | 'silver' | 'bronze' | 'deboss-blind';

export interface FoilOption {
  id: FoilColor;
  name: string;
  colorHex: string;
  description: string;
}

export type PaperFinishId = 'photo-lustre' | 'fine-art-velvet' | 'silk-anti-fingerprint';

export interface PaperFinish {
  id: PaperFinishId;
  name: string;
  subtitle: string;
  description: string;
  grammage: string;
  badge: string;
  priceDelta: number;
}

export type PrintQualityRating = 'optima' | 'buena' | 'advertencia' | 'insuficiente';
export type ColorSpaceProfile = 'sRGB' | 'Display P3' | 'Adobe RGB' | 'ProPhoto RGB' | 'CMYK' | 'sRGB (Estándar)';

export interface FineArtPreflightAnalysis {
  rating: PrintQualityRating;
  ratingLabel: string;
  qualityScore: number; // 0 to 100
  colorSpace: ColorSpaceProfile;
  isSrgbCompliant: boolean;
  megaPixels: number;
  nativeWidth: number;
  nativeHeight: number;
  estimatedDpiAtA4: number; // DPI at ~25x25cm page size
  estimatedDpiAtSpread: number; // DPI at 60x30cm double spread
  maxPrintCmAt300Dpi: { widthCm: number; heightCm: number };
  maxPrintCmAt200Dpi: { widthCm: number; heightCm: number };
  warnings: string[];
  recommendations: string[];
  passedChecks: string[];
}

export interface PhotoAsset {
  id: string;
  url: string;
  name: string;
  thumbnailUrl?: string;
  hdDataUrl?: string; // High definition WebP preview for pristine clarity across sessions
  originalSizeBytes?: number;
  thumbnailSizeBytes?: number;
  width?: number;
  height?: number;
  aspectRatio?: number;
  dateTaken?: string;
  caption?: string;
  compressionRatio?: number; // percentage saved, e.g. 92
  isOptimized?: boolean;
  preflight?: FineArtPreflightAnalysis;
  uploadStatus?: 'pending' | 'uploading' | 'uploaded' | 'error' | 'skipped';
  storagePath?: string;
}

export type PageLayoutId = 
  | 'single-full' 
  | 'single-bordered' 
  | 'single-with-caption' 
  | 'two-vertical' 
  | 'two-horizontal' 
  | 'three-collage' 
  | 'four-grid' 
  | 'five-photo-editorial'
  | 'asymmetric-split'
  | 'three-vertical-triptych'
  | 'editorial-magazine-polaroid'
  | 'moodboard-mosaic-9'
  | 'lifestyle-bento-10'
  | 'botanical-floral-scrapbook'
  | 'editorial-text-photo'
  | 'full-bleed-spread'
  | 'blank';

export type PhotoFilterMode = 
  | 'none' 
  | 'fine-art-bw' 
  | 'warm-vintage' 
  | 'high-contrast' 
  | 'fuji-film' 
  | 'kodak-chrome'
  | 'matte-portrait';

export interface PageSlot {
  id: string;
  photoId?: string;
  customScale?: number; // 1 to 3
  customPosition?: { x: number; y: number }; // pan offset in %
  rotation?: number; // 0, 90, 180, 270
  flipH?: boolean;
  flipV?: boolean;
  filter?: PhotoFilterMode;
  borderWidth?: number; // 0, 2, 4, 8 px
  borderColor?: string; // '#FFFFFF', '#1F1C18', '#C5A059'
  borderRadius?: number; // 0, 4, 8, 16 px
  opacity?: number; // 0 to 1
  fitMode?: 'cover' | 'contain';
  caption?: string;
  frameWidthDelta?: number; // px delta resize
  frameHeightDelta?: number; // px delta resize
  frameOffsetX?: number; // px offset position
  frameOffsetY?: number; // px offset position
}

export interface CustomTextElement {
  id: string;
  text: string;
  fontSize: number;
  fontFamily: 'serif-luxury' | 'sans-modern' | 'script-hand' | 'mono-clean';
  color: string;
  alignment: 'left' | 'center' | 'right';
  letterSpacing: string;
  isBold?: boolean;
  isItalic?: boolean;
  position: { x: number; y: number };
}

export interface PhotobookPage {
  id: string;
  layout: PageLayoutId;
  slots: PageSlot[];
  backgroundColor?: string;
  backgroundTexture?: 'smooth-white' | 'fine-art-cotton' | 'warm-ivory' | 'charcoal-black' | 'natural-linen';
  customTextHeading?: string;
  customTextBody?: string;
  textElements?: CustomTextElement[];
  pageNumber?: number;
}

export interface PhotobookSpread {
  id: string;
  spreadNumber: number;
  leftPage: PhotobookPage;
  rightPage: PhotobookPage;
  isFullSpreadBleed?: boolean;
  fullSpreadPhotoId?: string;
  backgroundColor?: string;
  isFlushMargin?: boolean;
  textElements?: CustomTextElement[];
}

export interface PhotobookProject {
  id: string;
  title: string;
  subtitle?: string;
  formatId: BookFormatId;
  coverMaterialId: CoverMaterialId;
  foilColor: FoilColor;
  foilTitleText: string;
  foilSubtitleText: string;
  coverWindowPhotoId?: string;
  hasCoverWindow: boolean;
  paperFinishId: PaperFinishId;
  photos: PhotoAsset[];
  spreads: PhotobookSpread[];
  giftBoxIncluded: boolean;
  /** Diseño del editor simple (SimpleAlbumEditor). Si existe, manda sobre spreads/cover/foil. */
  album?: AlbumDesign;
  createdAt: string;
  updatedAt: string;
}

export interface DesignServiceRequest {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  occasion: 'boda' | 'familia' | 'viaje' | 'bebe' | 'aniversario' | 'otro';
  bookFormatId: BookFormatId;
  coverMaterialId: CoverMaterialId;
  foilColor: FoilColor;
  coverTitle: string;
  coverSubtitle: string;
  hasCoverWindow: boolean;
  coverWindowPhotoIndex?: number;
  paperFinishId: PaperFinishId;
  designStyle: 'minimalista' | 'editorial' | 'clasico' | 'contemporaneo';
  uploadMethod: 'direct' | 'cloud-link';
  cloudLink?: string;
  uploadedPhotos: PhotoAsset[];
  estimatedPhotosCount: number;
  specialInstructions: string;
  giftBox: boolean;
  estimatedPages: number;
  estimatedTotal: number;
}

export interface CustomerReview {
  id: string;
  name: string;
  location: string;
  occasion: string;
  avatarUrl: string;
  rating: number;
  comment: string;
  bookPhotoUrl: string;
  format: string;
}

export type OrderStatusStage = 'en_diseno' | 'en_impresion' | 'enviado' | 'entregado';

export interface EmailNotification {
  id: string;
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  stage: OrderStatusStage;
  subject: string;
  sentAt: string; // e.g. "30 Ago 2026, 14:15 hs"
  headline: string;
  bodyText: string;
  highlightBadge: string;
  nextStep: string;
  estimatedDelivery: string;
  trackingCode?: string;
  shippingAddress: string;
  shippingMethodName: string;
  itemsSummary: string;
  itemPreviewUrl?: string;
  read?: boolean;
}

export interface OrderTimelineStep {
  stage: OrderStatusStage;
  title: string;
  description: string;
  date: string;
  time?: string;
  completed: boolean;
  current: boolean;
}

export interface OrderCloudFolder {
  provider: 'google_drive' | 'mega_nz' | 'both' | 'custom';
  folderName: string;
  googleDriveUrl?: string;
  megaUrl?: string;
  customUrl?: string;
  status: 'pending_upload' | 'photos_received' | 'downloaded_to_lab';
  uploadedPhotosCount?: number;
  uploadedAt?: string;
  notes?: string;
}

export type PaymentStatus = 'pending' | 'approved' | 'in_process' | 'rejected' | 'refunded' | 'cancelled' | 'not_required';

export interface TrackedOrder {
  id: string;
  orderNumber: string; // e.g. "HALO-849201"
  trackingCode?: string; // e.g. "CORREO-AR-93821094"
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  shippingAddress: string;
  shippingCity: string;
  shippingMethod: 'pilar_direct' | 'correo_nacional';
  status: OrderStatusStage;
  createdAt: string;
  estimatedDeliveryDate: string;
  estimatedDays: string; // "4 a 6 días hábiles"
  totalPrice: number;
  paymentMethod: string;
  /** Real payment status from Mercado Pago (or 'not_required' for manual bank transfer). */
  paymentStatus?: PaymentStatus;
  paymentProvider?: 'mercadopago' | 'transfer';
  emailNotificationsEnabled?: boolean;
  emailHistory?: EmailNotification[];
  items: Array<{
    title: string;
    format: string;
    cover: string;
    foil: string;
    pages: number;
    price: number;
    previewUrl?: string;
    hasGiftBox?: boolean;
  }>;
  timeline: OrderTimelineStep[];
  labNotes?: string;
  cloudFolder?: OrderCloudFolder;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  createdAt?: string;
  avatarUrl?: string;
  /** Set only in the database (profiles.is_admin), never writable from the client. */
  isAdmin?: boolean;
}

export interface SavedProject {
  id: string;
  userId?: string;
  title: string;
  formatId: BookFormatId;
  coverMaterialId: CoverMaterialId;
  foilColor: FoilColor;
  totalPages: number;
  totalPrice: number;
  projectData: PhotobookProject;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}
