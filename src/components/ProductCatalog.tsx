import React, { useState, useRef } from 'react';
import { BookFormatId, PhotobookFinish } from '../types';
import {
  PHOTOBOOK_GRANDES_FORMATOS,
  FINE_ART_PRINTS_PRODUCT,
  formatPriceARS
} from '../data/mockData';
import { CartItem } from './CartCheckoutModal';
import { useAuth } from '../context/AuthContext';
import { processUploadedPhotoFile, getThumbnailSrc } from '../lib/imageProcessor';
import { uploadOriginalPhoto } from '../lib/photoStorageService';
import layflatSpreadImg from '../assets/images/layflat_paper_texture_1788109298366.jpg';
import greenLandscapeImg from '../assets/images/artisan_bookbinding_macro_1788109266332.jpg';
import pocketMiniImg from '../assets/images/archival_box_luxury_1788109342591.jpg';
import linenMacroImg from '../assets/images/linen_swatches_box_1788109313568.jpg';
import pressMacroImg from '../assets/images/gold_foil_stamping_1788109282366.jpg';
import {
  CheckCircle2,
  Sparkles,
  ShoppingBag,
  BookOpen,
  Layers,
  Package,
  ShieldCheck,
  Plus,
  Minus,
  Info,
  Palette,
  Image as ImageIcon,
  ArrowRight,
  Clock,
  Award,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  X as XIcon,
  Lock,
} from 'lucide-react';

interface ProductCatalogProps {
  onSelectFormatToBuild: (formatId: BookFormatId) => void;
  onOpenConcierge: (formatId?: BookFormatId) => void;
  onAddToCart?: (item: CartItem) => void;
  onOpenAuth?: () => void;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({
  onSelectFormatToBuild,
  onOpenConcierge,
  onAddToCart,
  onOpenAuth,
}) => {
  const { user, profile, isLoggedIn } = useAuth();
  const currentUserId = user?.id || profile?.id;
  const [activeCatalogTab, setActiveCatalogTab] = useState<'photobooks' | 'prints'>('photobooks');

  // --- State for Photobook interactive selector ---
  const [selectedFormatId, setSelectedFormatId] = useState<string>('30x30');
  const [selectedFinish, setSelectedFinish] = useState<PhotobookFinish>('envolvente');
  const [extraSheets, setExtraSheets] = useState<number>(0);

  // --- State for Fine Art Prints interactive selector ---
  const [selectedPrintSizeId, setSelectedPrintSizeId] = useState<string>('20x30');
  const [selectedPaperId, setSelectedPaperId] = useState<string>('perlado-lustre');
  const [printQuantity, setPrintQuantity] = useState<number>(1);

  // --- State for the mandatory photo upload on Fine Art Prints ---
  // A print order is meaningless without a photo, so we require the
  // customer to upload one (and be logged in, so it lands in their own
  // Supabase Storage folder) before "Agregar al carrito" is enabled.
  const [printPhotoId, setPrintPhotoId] = useState<string | null>(null);
  const [printPhotoThumbnail, setPrintPhotoThumbnail] = useState<string | null>(null);
  const [printPhotoStoragePath, setPrintPhotoStoragePath] = useState<string | null>(null);
  const [printPhotoName, setPrintPhotoName] = useState<string | null>(null);
  const [printPhotoStatus, setPrintPhotoStatus] = useState<'idle' | 'processing' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [printPhotoError, setPrintPhotoError] = useState<string | null>(null);
  const printFileInputRef = useRef<HTMLInputElement>(null);

  const handlePrintPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isLoggedIn || !currentUserId) {
      onOpenAuth?.();
      return;
    }

    setPrintPhotoStatus('processing');
    setPrintPhotoError(null);
    try {
      const asset = await processUploadedPhotoFile(file);
      setPrintPhotoId(asset.id);
      setPrintPhotoThumbnail(getThumbnailSrc(asset));
      setPrintPhotoName(file.name);

      setPrintPhotoStatus('uploading');
      const { storagePath, error } = await uploadOriginalPhoto(
        currentUserId,
        'fine-art-prints',
        asset.id,
        file
      );
      if (error || !storagePath) {
        setPrintPhotoStatus('error');
        setPrintPhotoError('No pudimos guardar tu foto. Probá de nuevo.');
        return;
      }
      setPrintPhotoStoragePath(storagePath);
      setPrintPhotoStatus('uploaded');
    } catch (err) {
      setPrintPhotoStatus('error');
      setPrintPhotoError('No pudimos procesar esa imagen. Probá con otro archivo.');
    }
  };

  const handleRemovePrintPhoto = () => {
    setPrintPhotoId(null);
    setPrintPhotoThumbnail(null);
    setPrintPhotoStoragePath(null);
    setPrintPhotoName(null);
    setPrintPhotoStatus('idle');
    setPrintPhotoError(null);
  };

  // Active Photobook Format Calculation
  const activeFormat = PHOTOBOOK_GRANDES_FORMATOS.formats.find((f) => f.id === selectedFormatId) 
    || PHOTOBOOK_GRANDES_FORMATOS.formats[0];

  const photobookBasePrice = selectedFinish === 'envolvente' 
    ? activeFormat.basePriceEnvolvente 
    : activeFormat.basePriceCueroTapa;

  const photobookTotalPrice = photobookBasePrice + (extraSheets * activeFormat.extraSheetPrice);
  const totalPages = (activeFormat.baseSheets + extraSheets) * 2;

  // Active Fine Art Print Calculation
  const activePrintSize = FINE_ART_PRINTS_PRODUCT.sizes.find((s) => s.id === selectedPrintSizeId) 
    || FINE_ART_PRINTS_PRODUCT.sizes[3];

  const activePaperOption = FINE_ART_PRINTS_PRODUCT.paperOptions.find((p) => p.id === selectedPaperId) 
    || FINE_ART_PRINTS_PRODUCT.paperOptions[1];

  const unitPrintPrice = Math.round(activePrintSize.price * activePaperOption.priceMultiplier);
  const totalPrintPrice = unitPrintPrice * printQuantity;

  // Handle Add Photobook directly to Cart
  const handleAddPhotobookToCart = () => {
    if (!onAddToCart) return;
    const finishObj = PHOTOBOOK_GRANDES_FORMATOS.finishes.find((f) => f.id === selectedFinish);
    const item: CartItem = {
      id: `cart-pb-${Date.now()}`,
      type: 'photobook-order',
      title: `Fotolibro Tapa Dura ${activeFormat.label}`,
      details: `${finishObj?.name || 'Envolvente'} · ${activeFormat.baseSheets + extraSheets} hojas (${totalPages} págs.) · Incluye Caja Contenedora`,
      price: photobookTotalPrice,
      badge: 'Gran Formato',
      photobookConfig: {
        formatId: activeFormat.id,
        formatLabel: activeFormat.label,
        finish: selectedFinish,
        finishName: finishObj?.name || 'Envolvente',
        sheets: activeFormat.baseSheets + extraSheets,
        extraSheets: extraSheets,
        includesBox: true,
      }
    };
    onAddToCart(item);
  };

  // Handle Add Fine Art Prints directly to Cart
  const canAddPrintToCart = printPhotoStatus === 'uploaded' && !!printPhotoStoragePath;

  const handleAddPrintToCart = () => {
    if (!onAddToCart) return;
    if (!isLoggedIn || !currentUserId) {
      onOpenAuth?.();
      return;
    }
    if (!canAddPrintToCart || !printPhotoStoragePath || !printPhotoId) return;

    const item: CartItem = {
      id: `cart-print-${Date.now()}`,
      type: 'fine-art-print',
      title: `Foto Fine Art ${activePrintSize.label} (${printQuantity} ${printQuantity === 1 ? 'copia' : 'copias'})`,
      details: `${activePaperOption.name} (${activePaperOption.grammage}) · Calibración química de laboratorio`,
      price: totalPrintPrice,
      quantity: printQuantity,
      badge: 'Copia Fine Art',
      thumbnailUrl: printPhotoThumbnail || undefined,
      printConfig: {
        sizeId: activePrintSize.id,
        sizeLabel: activePrintSize.label,
        paperId: activePaperOption.id,
        paperName: activePaperOption.name,
        quantity: printQuantity,
        unitPrice: unitPrintPrice,
        photoId: printPhotoId,
        storagePath: printPhotoStoragePath,
        photoName: printPhotoName || undefined,
        thumbnailUrl: printPhotoThumbnail || undefined,
      }
    };
    onAddToCart(item);
    handleRemovePrintPhoto();
  };

  return (
    <div id="catalog" className="bg-[#FAF8F5]">
      
      {/* SECTION HEADER & CATALOG NAVIGATION SWITCHER */}
      <section className="pt-20 pb-12 border-b border-[#E8E2D5]/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-10">
            <span className="text-xs sm:text-sm font-semibold tracking-[0.22em] text-[#8C6D37] uppercase block mb-3">
              CATÁLOGO & TALLER DE REVELADO
            </span>
            <h2 className="font-serif-luxury text-3xl sm:text-5xl text-[#1F1C18] font-normal leading-tight tracking-tight">
              Obras impresas con fidelidad de archivo
            </h2>
            <p className="text-sm sm:text-base text-[#595248] font-light mt-4 max-w-2xl mx-auto leading-relaxed">
              Fotolibros cosidos en tapa dura con apertura 180° Layflat y copias de autor individuales en papel químico de museo.
            </p>
          </div>

          {/* Luxury Tab Selector */}
          <div className="flex justify-center mb-4">
            <div className="inline-flex p-1.5 rounded-2xl bg-[#EFE9DE] border border-[#D6CEBE]/80 shadow-inner max-w-full overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveCatalogTab('photobooks')}
                className={`px-5 sm:px-8 py-3 rounded-xl text-xs sm:text-sm font-semibold uppercase tracking-wider transition-all flex items-center gap-2.5 cursor-pointer whitespace-nowrap ${
                  activeCatalogTab === 'photobooks'
                    ? 'bg-[#1F1C18] text-[#FDFCF9] shadow-md'
                    : 'text-[#595248] hover:text-[#1F1C18] hover:bg-[#FAF8F5]/60'
                }`}
              >
                <BookOpen className={`w-4 h-4 ${activeCatalogTab === 'photobooks' ? 'text-[#ECC880]' : 'text-[#8C6D37]'}`} />
                <span>Fotolibros de Autor</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeCatalogTab === 'photobooks' ? 'bg-[#3D352E] text-[#ECC880]' : 'bg-[#D6CEBE]/60 text-[#595248]'}`}>
                  Grandes Formatos
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveCatalogTab('prints')}
                className={`px-5 sm:px-8 py-3 rounded-xl text-xs sm:text-sm font-semibold uppercase tracking-wider transition-all flex items-center gap-2.5 cursor-pointer whitespace-nowrap ${
                  activeCatalogTab === 'prints'
                    ? 'bg-[#1F1C18] text-[#FDFCF9] shadow-md'
                    : 'text-[#595248] hover:text-[#1F1C18] hover:bg-[#FAF8F5]/60'
                }`}
              >
                <ImageIcon className={`w-4 h-4 ${activeCatalogTab === 'prints' ? 'text-[#ECC880]' : 'text-[#8C6D37]'}`} />
                <span>Fotos Fine Art</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeCatalogTab === 'prints' ? 'bg-[#3D352E] text-[#ECC880]' : 'bg-[#D6CEBE]/60 text-[#595248]'}`}>
                  Tamaños Estándar
                </span>
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================== */}
      {/* 1. COLECCIÓN FOTOLIBROS DE AUTOR EN TAPA DURA */}
      {/* ======================================================== */}
      {activeCatalogTab === 'photobooks' && (
        <section className="py-16 border-b border-[#E8E2D5]/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* Storytelling Quote matching the budget */}
            <div className="mb-12 text-center">
              <span className="font-serif-luxury italic text-xl sm:text-2xl text-[#8C6D37] block">
                &ldquo;Cuanto más grande el libro, más presente la historia.&rdquo;
              </span>
              <p className="text-sm sm:text-base text-[#736B60] mt-1">
                Fotolibros grandes · Precios oficiales
              </p>
            </div>

            {/* Interactive Builder / Configurator Card */}
            <div className="bg-[#FDFCF9] border border-[#D6CEBE] rounded-3xl p-6 sm:p-10 shadow-sm mb-16">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                
                {/* Left Visual Preview & Features (Col 5) */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-[#EAE5D9] border border-[#E8E2D5] relative group shadow-inner">
                    <img
                      src={layflatSpreadImg}
                      onError={(e) => {
                        e.currentTarget.src = 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80';
                      }}
                      alt={activeFormat.label}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    
                    {/* Badge: Incluye Caja Contenedora */}
                    <div className="absolute top-3 left-3 bg-[#1F1C18]/90 backdrop-blur-md text-[#FDFCF9] border border-[#ECC880]/50 px-3.5 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 shadow-lg">
                      <Package className="w-3.5 h-3.5 text-[#ECC880]" />
                      <span>Incluye caja de regalo</span>
                    </div>

                    {/* Badge: Formato */}
                    <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-md text-[#1F1C18] border border-[#D6CEBE] px-3 py-1 rounded-xl text-sm font-bold shadow-sm">
                      {activeFormat.label} ({activeFormat.openLabel})
                    </div>
                  </div>

                  {/* Product Details Pills */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D5] space-y-1">
                      <span className="text-[#8C6D37] font-bold block text-sm">Abre plano</span>
                      <p className="text-[#595248] text-sm">Hojas rígidas, sin corte en el medio.</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D5] space-y-1">
                      <span className="text-[#8C6D37] font-bold block text-sm">Caja de regalo</span>
                      <p className="text-[#595248] text-sm">Caja rígida a medida para guardarlo.</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D5] space-y-1">
                      <span className="text-[#8C6D37] font-bold block text-sm">20 páginas</span>
                      <p className="text-[#595248] text-sm">Ideal para {activeFormat.idealPhotos}.</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D5] space-y-1">
                      <span className="text-[#8C6D37] font-bold block text-sm">Tiempo</span>
                      <p className="text-[#595248] text-sm">Listo en 15 a 20 días hábiles.</p>
                    </div>
                  </div>
                </div>

                {/* Right Interactive Selection (Col 7) */}
                <div className="lg:col-span-7 space-y-7">
                  
                  {/* Title & Collection */}
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold tracking-widest text-[#8C6D37] uppercase mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-[#8C6D37]" />
                      <span>{PHOTOBOOK_GRANDES_FORMATOS.collection}</span>
                    </div>
                    <h3 className="font-serif-luxury text-2xl sm:text-3xl text-[#1F1C18] font-normal">
                      {PHOTOBOOK_GRANDES_FORMATOS.name}
                    </h3>
                    <p className="text-sm sm:text-base text-[#595248] mt-2 leading-relaxed">
                      {PHOTOBOOK_GRANDES_FORMATOS.description}
                    </p>
                  </div>

                  {/* 1. Formato Selector */}
                  <div className="space-y-2.5">
                    <label className="block text-sm font-bold text-[#1F1C18] flex items-center justify-between">
                      <span>1. Elegí el tamaño</span>
                      <span className="text-sm text-[#8C6D37] font-normal">Incluye 20 páginas</span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {PHOTOBOOK_GRANDES_FORMATOS.formats.map((fmt) => {
                        const isSelected = selectedFormatId === fmt.id;
                        return (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => setSelectedFormatId(fmt.id)}
                            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                              isSelected
                                ? 'border-[#8C6D37] bg-[#FAF8F5] shadow-md ring-1 ring-[#8C6D37]'
                                : 'border-[#D6CEBE] bg-[#FDFCF9] hover:bg-[#FAF8F5]'
                            }`}
                          >
                            {fmt.popular && (
                              <span className="absolute -top-2.5 right-3 bg-[#8C6D37] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                Más pedido
                              </span>
                            )}
                            <div className="text-xl font-semibold text-[#1F1C18]">
                              {fmt.label}
                            </div>
                            <div className="text-sm text-[#736B60] mt-0.5">
                              {fmt.openLabel}
                            </div>
                            <div className="text-sm text-[#8C8275] mt-2 flex justify-between items-center border-t border-[#E8E2D5]/60 pt-1.5">
                              <span>Desde</span>
                              <strong className="text-lg font-semibold text-[#1F1C18]">
                                {formatPriceARS(fmt.basePriceEnvolvente)} ARS
                              </strong>
                            </div>
                            <div className="text-sm text-[#8C6D37] mt-0.5">
                              + {formatPriceARS(fmt.extraSheetPrice)} por hoja extra
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Terminación Selector (Same Price) */}
                  <div className="space-y-2.5">
                    <label className="block text-sm font-bold text-[#1F1C18] flex items-center justify-between">
                      <span>2. Elegí la tapa</span>
                      <span className="text-sm text-emerald-800 font-semibold bg-emerald-100 px-2 py-0.5 rounded-full">
                        Mismo precio
                      </span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {PHOTOBOOK_GRANDES_FORMATOS.finishes.map((finish) => {
                        const isSelected = selectedFinish === finish.id;
                        return (
                          <button
                            key={finish.id}
                            type="button"
                            onClick={() => setSelectedFinish(finish.id)}
                            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'border-[#8C6D37] bg-[#FAF8F5] shadow-md ring-1 ring-[#8C6D37]'
                                : 'border-[#D6CEBE] bg-[#FDFCF9] hover:bg-[#FAF8F5]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-lg font-semibold text-[#1F1C18]">
                                {finish.name}
                              </span>
                              <CheckCircle2 className={`w-4 h-4 ${isSelected ? 'text-[#8C6D37]' : 'text-gray-300'}`} />
                            </div>
                            <p className="text-sm text-[#595248] mt-2 leading-relaxed">
                              {finish.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Stepper de Hojas Adicionales */}
                  <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D5] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-bold text-[#1F1C18] block">
                          3. ¿Querés más páginas?
                        </span>
                        <p className="text-sm text-[#736B60]">
                          Incluye 10 hojas (20 páginas). Cada hoja extra suma 2 páginas.
                        </p>
                      </div>

                      {/* Stepper Controls */}
                      <div className="flex items-center gap-3 self-start sm:self-auto bg-white border border-[#D6CEBE] rounded-full p-1 shadow-xs">
                        <button
                          type="button"
                          onClick={() => setExtraSheets((prev) => Math.max(0, prev - 1))}
                          disabled={extraSheets === 0}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[#1F1C18] hover:bg-[#FAF8F5] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-base font-bold text-[#1F1C18] px-2 min-w-16 text-center">
                          +{extraSheets} {extraSheets === 1 ? 'hoja' : 'hojas'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setExtraSheets((prev) => Math.min(30, prev + 1))}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[#1F1C18] hover:bg-[#FAF8F5] cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Breakdown calculation */}
                    <div className="flex flex-wrap items-center justify-between text-sm text-[#595248] pt-2 border-t border-[#E8E2D5]/80">
                      <span>
                        Total: <strong>{activeFormat.baseSheets + extraSheets} hojas</strong> ({totalPages} páginas)
                      </span>
                      {extraSheets > 0 && (
                        <span className="text-[#8C6D37] font-semibold">
                          +{formatPriceARS(extraSheets * activeFormat.extraSheetPrice)} ARS ({extraSheets} × {formatPriceARS(activeFormat.extraSheetPrice)})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Summary & Call to Actions */}
                  <div className="pt-4 border-t border-[#E8E2D5] space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-sm text-[#736B60] block">
                          Total con IVA
                        </span>
                        <div className="text-3xl sm:text-4xl font-semibold text-[#1F1C18]">
                          {formatPriceARS(photobookTotalPrice)}
                        </div>
                        <span className="text-sm text-[#8C6D37] font-medium block">
                          Seña del 50%: {formatPriceARS(Math.round(photobookTotalPrice * 0.5))}. El resto, al entregar.
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddPhotobookToCart}
                        className="px-7 py-3.5 rounded-full bg-[#1F1C18] hover:bg-[#3D352E] text-[#FDFCF9] text-base font-bold transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <ShoppingBag className="w-4 h-4 text-[#ECC880]" />
                        <span>Agregar al carrito</span>
                      </button>
                    </div>

                    {/* Secondary Actions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => onSelectFormatToBuild(activeFormat.id)}
                        className="py-3 px-4 rounded-xl border border-[#D6CEBE] bg-[#FAF8F5] hover:bg-[#EFE9DE] text-sm font-semibold text-[#1F1C18] transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <BookOpen className="w-4 h-4 text-[#8C6D37]" />
                        <span>Subir mis fotos y armarlo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenConcierge(activeFormat.id)}
                        className="py-3 px-4 rounded-xl border border-[#8C6D37]/50 bg-white hover:bg-[#FAF8F5] text-sm font-semibold text-[#8C6D37] transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-[#8C6D37]" />
                        <span>Que lo armen ustedes</span>
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            </div>

            {/* Official Budget Price Table */}
            <div className="rounded-3xl border border-[#D6CEBE] bg-white p-6 sm:p-8 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                <div>
                  <h4 className="font-serif-luxury text-xl font-bold text-[#1F1C18]">
                    Lista de precios
                  </h4>
                  <p className="text-sm text-[#736B60]">
                    Precios finales en pesos, con IVA. Todos incluyen caja de regalo.
                  </p>
                </div>
                <span className="text-sm text-[#8C6D37] bg-[#FAF8F5] border border-[#E8E2D5] px-3 py-1 rounded-full self-start sm:self-auto font-medium">
                  Actualizado Agosto 2026
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-[#262422] text-[#FDFCF9] font-serif-luxury text-sm">
                      <th className="py-3.5 px-4 rounded-l-xl">Tamaño</th>
                      <th className="py-3.5 px-4">Abierto</th>
                      <th className="py-3.5 px-4">Tapa envolvente</th>
                      <th className="py-3.5 px-4">Tapa foto + cuero</th>
                      <th className="py-3.5 px-4 rounded-r-xl">Hoja extra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D5] text-[#1F1C18]">
                    {PHOTOBOOK_GRANDES_FORMATOS.formats.map((fmt) => (
                      <tr 
                        key={fmt.id} 
                        className={`hover:bg-[#FAF8F5] transition-colors ${selectedFormatId === fmt.id ? 'bg-[#FAF8F5]/80 font-medium' : ''}`}
                      >
                        <td className="py-4 px-4 font-bold font-serif-luxury text-base">
                          {fmt.label}
                          {fmt.popular && (
                            <span className="ml-2 text-sm bg-[#8C6D37]/10 text-[#8C6D37] px-2 py-0.5 rounded-full font-sans font-bold">
                              Insignia
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-[#736B60]">{fmt.openLabel}</td>
                        <td className="py-4 px-4 font-bold text-[#1F1C18]">{formatPriceARS(fmt.basePriceEnvolvente)} ARS</td>
                        <td className="py-4 px-4 font-bold text-[#1F1C18]">{formatPriceARS(fmt.basePriceCueroTapa)} ARS</td>
                        <td className="py-4 px-4 text-[#8C6D37] font-semibold">+ {formatPriceARS(fmt.extraSheetPrice)} ARS</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Note for smaller formats */}
              <div className="mt-6 p-4 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D5] flex items-start gap-3 text-sm text-[#595248]">
                <Info className="w-4 h-4 text-[#8C6D37] mt-0.5 shrink-0" />
                <div>
                  <strong className="text-[#1F1C18]">Formatos menores a 30×30 cm y otras terminaciones clásicas:</strong>
                  <p className="mt-0.5 text-sm leading-relaxed">
                    Contamos con la colección clásica en 20×20 cm, 15×15 cm y 30×20 cm con encuadernación en linos puros europeos. Para consultar la lista completa y presupuestos a medida para souvenirs o fotógrafos profesionales, consultanos por WhatsApp.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* 2. COLECCIÓN FOTOS FINE ART EN TAMAÑOS ESTÁNDAR */}
      {/* ======================================================== */}
      {activeCatalogTab === 'prints' && (
        <section className="py-16 border-b border-[#E8E2D5]/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="mb-12 text-center max-w-2xl mx-auto">
              <span className="text-xs font-semibold tracking-[0.2em] text-[#8C6D37] uppercase block mb-2">
                COLECCIÓN COPIAS DE AUTOR
              </span>
              <h3 className="font-serif-luxury text-3xl sm:text-4xl text-[#1F1C18] font-normal">
                {FINE_ART_PRINTS_PRODUCT.name}
              </h3>
              <p className="text-xs sm:text-sm text-[#595248] font-light mt-3 leading-relaxed">
                {FINE_ART_PRINTS_PRODUCT.description}
              </p>
            </div>

            {/* Interactive Print Configurator */}
            <div className="bg-[#FDFCF9] border border-[#D6CEBE] rounded-3xl p-6 sm:p-10 shadow-sm mb-16">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                
                {/* Left: Size Grid (Col 7) */}
                <div className="lg:col-span-7 space-y-6">
                  
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#1F1C18] mb-1 flex items-center justify-between">
                      <span>1. Elegir Tamaño Estándar</span>
                      <span className="text-[11px] font-mono text-[#8C6D37] font-normal">8 tamaños disponibles</span>
                    </label>
                    <p className="text-xs text-[#736B60] mb-3">
                      Medidas estandarizadas compatibles con marcos comerciales y passe-partout.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {FINE_ART_PRINTS_PRODUCT.sizes.map((size) => {
                        const isSelected = selectedPrintSizeId === size.id;
                        return (
                          <button
                            key={size.id}
                            type="button"
                            onClick={() => setSelectedPrintSizeId(size.id)}
                            className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                              isSelected
                                ? 'border-[#8C6D37] bg-[#FAF8F5] shadow-md ring-1 ring-[#8C6D37]'
                                : 'border-[#D6CEBE] bg-[#FDFCF9] hover:bg-[#FAF8F5]'
                            }`}
                          >
                            {size.popular && (
                              <span className="inline-block bg-[#8C6D37] text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider mb-1">
                                Popular
                              </span>
                            )}
                            <div className="font-serif-luxury text-base font-bold text-[#1F1C18]">
                              {size.label}
                            </div>
                            <div className="text-[10px] font-mono text-[#736B60] mt-0.5">
                              {size.dimensionsMm}
                            </div>
                            <div className="text-xs font-serif-luxury font-bold text-[#8C6D37] mt-2 pt-1 border-t border-[#E8E2D5]">
                              {formatPriceARS(size.price)} ARS
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Size recommendation tooltip */}
                  <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D5] text-xs text-[#595248] space-y-1">
                    <strong className="text-[#1F1C18] block font-serif-luxury">
                      Tamaño seleccionado: {activePrintSize.label} ({activePrintSize.aspectRatio})
                    </strong>
                    <p className="text-[11px] leading-relaxed">
                      Recomendado para: {activePrintSize.recommendedFor}.
                    </p>
                  </div>

                  {/* 2. Paper Option Selector */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#1F1C18]">
                      2. Seleccionar Papel Fotográfico de Archivo
                    </label>

                    <div className="space-y-2.5">
                      {FINE_ART_PRINTS_PRODUCT.paperOptions.map((paper) => {
                        const isSelected = selectedPaperId === paper.id;
                        return (
                          <button
                            key={paper.id}
                            type="button"
                            onClick={() => setSelectedPaperId(paper.id)}
                            className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between gap-4 ${
                              isSelected
                                ? 'border-[#8C6D37] bg-[#FAF8F5] shadow-md ring-1 ring-[#8C6D37]'
                                : 'border-[#D6CEBE] bg-[#FDFCF9] hover:bg-[#FAF8F5]'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-serif-luxury text-sm font-bold text-[#1F1C18]">
                                  {paper.name}
                                </span>
                                <span className="text-[10px] font-mono bg-[#E8E2D5] text-[#595248] px-2 py-0.5 rounded font-semibold">
                                  {paper.grammage}
                                </span>
                                {paper.badge && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                    isSelected ? 'bg-[#8C6D37] text-white' : 'bg-[#EFE9DE] text-[#8C6D37]'
                                  }`}>
                                    {paper.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#595248] leading-relaxed">
                                {paper.description}
                              </p>
                            </div>

                            <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${isSelected ? 'text-[#8C6D37]' : 'text-gray-300'}`} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Right: Quantity, Calculation & Add To Cart (Col 5) */}
                <div className="lg:col-span-5 space-y-6 bg-[#FAF8F5] p-6 sm:p-8 rounded-3xl border border-[#E8E2D5]">
                  
                  <div>
                    <span className="text-xs font-semibold tracking-widest text-[#8C6D37] uppercase block mb-1">
                      RESUMEN DE COPIAS
                    </span>
                    <h4 className="font-serif-luxury text-2xl font-bold text-[#1F1C18]">
                      Copia Fine Art {activePrintSize.label}
                    </h4>
                    <p className="text-xs text-[#736B60] mt-1 font-mono">
                      Papel: {activePaperOption.name}
                    </p>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="p-4 rounded-2xl bg-white border border-[#D6CEBE] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#1F1C18]">
                        Cantidad de Fotos
                      </span>
                      
                      <div className="flex items-center gap-3 bg-[#FAF8F5] border border-[#D6CEBE] rounded-full p-1">
                        <button
                          type="button"
                          onClick={() => setPrintQuantity((prev) => Math.max(1, prev - 1))}
                          disabled={printQuantity <= 1}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[#1F1C18] hover:bg-white disabled:opacity-30 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono text-sm font-bold text-[#1F1C18] min-w-8 text-center">
                          {printQuantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPrintQuantity((prev) => prev + 1)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[#1F1C18] hover:bg-white cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Photo upload — required before adding a print to the cart */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#1F1C18]">
                      Tu Foto
                    </label>

                    {!isLoggedIn && (
                      <button
                        type="button"
                        onClick={() => onOpenAuth?.()}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-[#D6CEBE] text-xs font-semibold text-[#8C6D37] hover:bg-[#F4EFE6] cursor-pointer"
                      >
                        <Lock className="w-4 h-4" />
                        <span>Iniciá sesión para subir tu foto</span>
                      </button>
                    )}

                    {isLoggedIn && printPhotoStatus === 'idle' && (
                      <button
                        type="button"
                        onClick={() => printFileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-[#D6CEBE] text-xs font-semibold text-[#8C6D37] hover:bg-[#F4EFE6] cursor-pointer"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Subir la foto a imprimir</span>
                      </button>
                    )}

                    {isLoggedIn && (printPhotoStatus === 'processing' || printPhotoStatus === 'uploading') && (
                      <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-[#D6CEBE] bg-[#F4EFE6] text-xs font-semibold text-[#8C6D37]">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{printPhotoStatus === 'processing' ? 'Procesando imagen…' : 'Guardando tu foto…'}</span>
                      </div>
                    )}

                    {isLoggedIn && printPhotoStatus === 'uploaded' && printPhotoThumbnail && (
                      <div className="flex items-center gap-3 p-2.5 rounded-2xl border border-emerald-300 bg-emerald-50">
                        <img
                          src={printPhotoThumbnail}
                          alt={printPhotoName || 'Foto seleccionada'}
                          className="w-12 h-12 rounded-lg object-cover shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-emerald-900 truncate">{printPhotoName}</p>
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold">
                            <CheckCircle className="w-3 h-3" />
                            Guardada de forma segura
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemovePrintPhoto}
                          className="p-1.5 rounded-full hover:bg-emerald-100 text-emerald-800 shrink-0 cursor-pointer"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {printPhotoStatus === 'error' && (
                      <div className="flex items-center gap-2 p-3 rounded-2xl border border-red-300 bg-red-50 text-[11px] text-red-800">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{printPhotoError}</span>
                        <button
                          type="button"
                          onClick={handleRemovePrintPhoto}
                          className="underline font-semibold shrink-0 cursor-pointer"
                        >
                          Reintentar
                        </button>
                      </div>
                    )}

                    <input
                      ref={printFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePrintPhotoSelected}
                    />

                    <p className="text-[11px] text-[#8C8275]">
                      Esta copia se imprime {printQuantity === 1 ? 'de esta foto' : `${printQuantity} veces de esta misma foto`}. Para imprimir varias fotos distintas, agregalas al carrito una por una.
                    </p>
                  </div>

                  {/* Price breakdown */}
                  <div className="space-y-2 text-xs text-[#595248] pt-2 border-t border-[#E8E2D5]">
                    <div className="flex justify-between">
                      <span>Precio unitario ({activePrintSize.label}):</span>
                      <span className="font-mono font-bold text-[#1F1C18]">{formatPriceARS(unitPrintPrice)} ARS</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cantidad:</span>
                      <span className="font-mono">{printQuantity} {printQuantity === 1 ? 'copia' : 'copias'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Calibración de color:</span>
                      <span className="text-emerald-700 font-semibold">Incluida sin cargo</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-[#1F1C18] pt-3 border-t border-[#E8E2D5]">
                      <span>Total Final:</span>
                      <span className="font-serif-luxury text-2xl text-[#8C6D37]">{formatPriceARS(totalPrintPrice)} ARS</span>
                    </div>
                  </div>

                  {/* Button */}
                  <button
                    type="button"
                    onClick={handleAddPrintToCart}
                    disabled={isLoggedIn && !canAddPrintToCart}
                    className="w-full py-4 rounded-full bg-[#1F1C18] hover:bg-[#3D352E] text-[#FDFCF9] text-xs uppercase tracking-widest font-bold transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#1F1C18]"
                  >
                    <ShoppingBag className="w-4 h-4 text-[#ECC880]" />
                    <span>
                      {isLoggedIn && !canAddPrintToCart
                        ? 'Subí tu foto para continuar'
                        : `Agregar al Carrito (${formatPriceARS(totalPrintPrice)} ARS)`}
                    </span>
                  </button>

                  <div className="flex items-center gap-2 text-[11px] text-[#736B60] justify-center">
                    <Clock className="w-3.5 h-3.5 text-[#8C6D37]" />
                    <span>Plazo de revelado en laboratorio: 3 a 5 días hábiles</span>
                  </div>

                </div>

              </div>
            </div>

          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* 3. CONDICIONES COMERCIALES Y GARANTÍAS DEL LABORATORIO */}
      {/* ======================================================== */}
      <section className="py-16 bg-[#F4EFE6]/70 border-b border-[#E8E2D5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-3xl mx-auto text-center mb-10">
            <span className="text-xs font-semibold tracking-widest text-[#8C6D37] uppercase block mb-2">
              TRANSPARENCIA & COMPROMISO
            </span>
            <h3 className="font-serif-luxury text-2xl sm:text-3xl text-[#1F1C18] font-normal">
              Condiciones Comerciales y Plazos de Entrega
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            <div className="p-6 rounded-2xl bg-white border border-[#E8E2D5] shadow-xs space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#FAF8F5] border border-[#D6CEBE] flex items-center justify-center text-[#8C6D37] font-bold">
                1
              </div>
              <h4 className="font-serif-luxury text-base font-bold text-[#1F1C18]">
                Presupuesto Válido 15 Días
              </h4>
              <p className="text-xs text-[#595248] leading-relaxed">
                Los valores vigentes en pesos argentinos se congelan por 15 días corridos desde su emisión.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-[#E8E2D5] shadow-xs space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#FAF8F5] border border-[#D6CEBE] flex items-center justify-center text-[#8C6D37] font-bold">
                2
              </div>
              <h4 className="font-serif-luxury text-base font-bold text-[#1F1C18]">
                Seña del 50%
              </h4>
              <p className="text-xs text-[#595248] leading-relaxed">
                Confirmación de orden tras aprobar el diseño final. El 50% de saldo restante se abona contra entrega o despacho.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-[#E8E2D5] shadow-xs space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#FAF8F5] border border-[#D6CEBE] flex items-center justify-center text-[#8C6D37] font-bold">
                3
              </div>
              <h4 className="font-serif-luxury text-base font-bold text-[#1F1C18]">
                15 a 20 Días de Taller
              </h4>
              <p className="text-xs text-[#595248] leading-relaxed">
                Tiempo de elaboración artesanal milimétrica y secado de prensa desde la aprobación formal del archivo.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-[#E8E2D5] shadow-xs space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#FAF8F5] border border-[#D6CEBE] flex items-center justify-center text-[#8C6D37] font-bold">
                4
              </div>
              <h4 className="font-serif-luxury text-base font-bold text-[#1F1C18]">
                Envíos Asegurados
              </h4>
              <p className="text-xs text-[#595248] leading-relaxed">
                Bonificado en Pilar y corredor Panamericana km 38 a 60. Envíos con seguro de arte a toda la Argentina.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ======================================================== */}
      {/* 4. MATERIALES NOBLES (Dark Contrast Section) */}
      {/* ======================================================== */}
      <section id="quality" className="py-24 bg-[#262422] text-[#FDFCF9] border-b border-[#3D352E]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            
            {/* Left Narrative Text (Col 6) */}
            <div className="lg:col-span-6 space-y-6">
              <div className="flex items-center gap-2 text-xs sm:text-sm tracking-[0.25em] text-[#C5A059] uppercase font-semibold">
                <span>✦</span>
                <span>CALIDAD DE ARCHIVO</span>
              </div>

              <h2 className="font-serif-luxury text-4xl sm:text-5xl lg:text-6xl text-[#FDFCF9] font-normal leading-[1.12]">
                Materiales nobles para historias que trascienden.
              </h2>

              <p className="text-sm sm:text-base text-[#D4CABE] font-light leading-relaxed max-w-xl">
                Cada ejemplar es una pieza de arte irrepetible. Desde el corte milimétrico del bloque de páginas hasta el grabado térmico de la tipografía, ensamblamos cada fotolibro a mano en nuestro laboratorio en Pilar.
              </p>

              {/* 3 Pillars with Checkmarks */}
              <div className="space-y-5 pt-2">
                <div className="flex items-start gap-4">
                  <CheckCircle2 className="w-5 h-5 text-[#ECC880] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-base sm:text-lg font-serif-luxury font-medium text-[#FDFCF9]">
                      Papel Fotográfico Químico Layflat
                    </h4>
                    <p className="text-xs sm:text-sm text-[#C7BFA8] font-light mt-1 leading-relaxed">
                      Hojas rígidas de 650 g/m² con alma central. Tono continuo sin trama de puntos para negros puros.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <CheckCircle2 className="w-5 h-5 text-[#ECC880] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-base sm:text-lg font-serif-luxury font-medium text-[#FDFCF9]">
                      Linos Puros y Cueros Italianos
                    </h4>
                    <p className="text-xs sm:text-sm text-[#C7BFA8] font-light mt-1 leading-relaxed">
                      Telas naturales y cueros genuinos de primera selección para una experiencia táctil inigualable.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <CheckCircle2 className="w-5 h-5 text-[#ECC880] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-base sm:text-lg font-serif-luxury font-medium text-[#FDFCF9]">
                      Hot Stamping en Oro
                    </h4>
                    <p className="text-xs sm:text-sm text-[#C7BFA8] font-light mt-1 leading-relaxed">
                      Grabado artesanal térmico en bajorrelieve para títulos y monogramas en la tapa.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Photo Mosaic (Col 6) */}
            <div className="lg:col-span-6 grid grid-cols-2 gap-4">
              
              {/* Image 1: Linen Fabric Macro */}
              <div className="aspect-[4/5] overflow-hidden bg-[#1A1816] rounded-none border border-white/10">
                <img
                  src={linenMacroImg}
                  onError={(e) => {
                    e.currentTarget.src = 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&w=800&q=80';
                  }}
                  alt="Textura de lino crudo artesanal"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Stacked Images Column */}
              <div className="space-y-4">
                <div className="aspect-[4/3] overflow-hidden bg-[#1A1816] rounded-none border border-white/10">
                  <img
                    src="https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80"
                    alt="Libros apilados en lino blanco"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="aspect-[4/3] overflow-hidden bg-[#1A1816] rounded-none border border-white/10">
                  <img
                    src="https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80"
                    alt="Libro abierto sobre mesa junto a ventana"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Bottom Image 3: Hand Press */}
              <div className="col-span-2 aspect-[16/9] overflow-hidden bg-[#1A1816] rounded-none border border-white/10">
                <img
                  src={pressMacroImg}
                  onError={(e) => {
                    e.currentTarget.src = 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=1000&q=80';
                  }}
                  alt="Prensa manual de encuadernación en taller"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

            </div>

          </div>

        </div>
      </section>

    </div>
  );
};
