import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  Sparkles, 
  Upload, 
  Link as LinkIcon, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Heart, 
  Gift, 
  BookOpen,
  Send,
  HelpCircle,
  FileCheck,
  Phone,
  Truck,
  Package
} from 'lucide-react';
import { BookFormatId, CoverMaterialId, FoilColor, PaperFinishId, DesignServiceRequest, PhotoAsset, TrackedOrder } from '../types';
import { BOOK_FORMATS, COVER_MATERIALS, FOIL_OPTIONS, PAPER_FINISHES, formatPriceARS, STORE_CONFIG } from '../data/mockData';
import { saveConciergeRequestToDatabase, saveOrderToDatabase } from '../lib/supabase';
import { batchProcessPhotoFiles, getThumbnailSrc, calculatePhotoSavingsSummary } from '../lib/imageProcessor';

interface ConciergeDesignModalProps {
  onClose: () => void;
  onSubmitRequest: (request: DesignServiceRequest) => void;
  onOrderPlaced?: (order: TrackedOrder) => void;
  onOpenTracker?: (orderId: string) => void;
}

export const ConciergeDesignModal: React.FC<ConciergeDesignModalProps> = ({
  onClose,
  onSubmitRequest,
  onOrderPlaced,
  onOpenTracker,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [occasion, setOccasion] = useState<'boda' | 'familia' | 'viaje' | 'bebe' | 'aniversario' | 'otro'>('boda');
  const [bookFormatId, setBookFormatId] = useState<BookFormatId>('square-30');
  const [coverMaterialId, setCoverMaterialId] = useState<CoverMaterialId>('photo-hardcover');
  const [foilColor, setFoilColor] = useState<FoilColor>('gold');
  const [coverTitle, setCoverTitle] = useState('');
  const [coverSubtitle, setCoverSubtitle] = useState('');
  const [hasCoverWindow, setHasCoverWindow] = useState(false);
  const [paperFinishId, setPaperFinishId] = useState<PaperFinishId>('photo-lustre');
  const [designStyle, setDesignStyle] = useState<'minimalista' | 'editorial' | 'clasico' | 'contemporaneo'>('editorial');
  
  // Upload options
  const [uploadMethod, setUploadMethod] = useState<'direct' | 'cloud-link'>('cloud-link');
  const [cloudLink, setCloudLink] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState<PhotoAsset[]>([]);
  const [estimatedPhotosCount, setEstimatedPhotosCount] = useState<number>(60);
  const [isOptimizingPhotos, setIsOptimizingPhotos] = useState(false);
  const [optimizingProgress, setOptimizingProgress] = useState<{ current: number; total: number } | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [giftBox, setGiftBox] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [createdOrderNumber, setCreatedOrderNumber] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState('');

  // Lock background body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedFormat = BOOK_FORMATS.find((f) => f.id === bookFormatId) || BOOK_FORMATS[0];
  const selectedCover = COVER_MATERIALS.find((c) => c.id === coverMaterialId) || COVER_MATERIALS[0];
  const selectedPaper = PAPER_FINISHES.find((p) => p.id === paperFinishId) || PAPER_FINISHES[0];

  // Calculate estimated price
  const estimatedPages = Math.max(20, Math.ceil(estimatedPhotosCount / 2.5));
  const extraPages = Math.max(0, estimatedPages - selectedFormat.basePages);
  const extraSpreads = Math.ceil(extraPages / 2);
  const estimatedTotal = selectedFormat.basePrice + (extraSpreads * selectedFormat.extraSpreadPrice) + (giftBox ? 28000 : 0) + selectedCover.priceDelta + selectedPaper.priceDelta;

  const handleFileUploadPos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsOptimizingPhotos(true);
    setOptimizingProgress({ current: 0, total: files.length });

    try {
      const processedAssets = await batchProcessPhotoFiles(
        files,
        { maxDimension: 360, quality: 0.8 },
        (processed, total) => {
          setOptimizingProgress({ current: processed, total });
        }
      );

      setUploadedPhotos((prev) => [...prev, ...processedAssets]);
      setEstimatedPhotosCount((prev) => Math.max(prev, uploadedPhotos.length + processedAssets.length));
    } catch (err) {
      console.error('Error optimizing concierge photos:', err);
    } finally {
      setIsOptimizingPhotos(false);
      setOptimizingProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerEmail) {
      alert('Por favor ingresa tu nombre y correo electrónico.');
      return;
    }

    const genOrderNum = `HALO-${Math.floor(100000 + Math.random() * 900000)}`;
    const genOrderId = `ord-${Date.now()}`;
    setCreatedOrderNumber(genOrderNum);
    setCreatedOrderId(genOrderId);

    const request: DesignServiceRequest = {
      id: genOrderId,
      customerName,
      customerEmail,
      customerPhone,
      occasion,
      bookFormatId,
      coverMaterialId,
      foilColor,
      coverTitle: coverTitle || 'NUESTRA HISTORIA',
      coverSubtitle,
      hasCoverWindow,
      paperFinishId,
      designStyle,
      uploadMethod,
      cloudLink: uploadMethod === 'cloud-link' ? cloudLink : undefined,
      uploadedPhotos,
      estimatedPhotosCount,
      specialInstructions,
      giftBox,
      estimatedPages,
      estimatedTotal,
    };

    const newTrackedOrder: TrackedOrder = {
      id: genOrderId,
      orderNumber: genOrderNum,
      customerName: customerName || 'Cliente Concierge',
      customerEmail: customerEmail || 'contacto@cliente.com',
      customerPhone,
      shippingAddress: 'A coordinar con el cliente tras revisión de maqueta',
      shippingCity: 'Pilar / Zona Norte (o Envío Nacional)',
      shippingMethod: 'pilar_direct',
      status: 'en_diseno',
      createdAt: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }),
      estimatedDeliveryDate: '4 a 6 días hábiles tras aprobación de maqueta',
      estimatedDays: '4 a 6 días hábiles',
      totalPrice: estimatedTotal,
      paymentMethod: 'A confirmar con el borrador digital (Mercado Pago / Transf)',
      items: [
        {
          title: coverTitle || 'Fotolibro Concierge Editorial',
          format: selectedFormat.name,
          cover: selectedCover.name,
          foil: foilColor === 'gold' ? 'Oro Champagne' : foilColor === 'silver' ? 'Plata Cromo' : 'Bronce Envejecido',
          pages: estimatedPages,
          price: estimatedTotal,
          previewUrl: uploadedPhotos[0]?.url || 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80',
          hasGiftBox: giftBox,
        }
      ],
      timeline: [
        {
          stage: 'en_diseno',
          title: 'Servicio Concierge: Maquetación en Curso',
          description: 'Nuestro equipo de directores de arte está seleccionando y editando tus fotos para armar el borrador digital.',
          date: 'Hoy',
          time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          completed: false,
          current: true,
        },
        {
          stage: 'en_impresion',
          title: 'Aprobación & Entrada a Taller',
          description: 'Una vez que apruebes la maqueta por WhatsApp/email, entra a imprenta y encuadernado artesanal.',
          date: 'En 48 hs hábiles',
          completed: false,
          current: false,
        },
        {
          stage: 'enviado',
          title: 'Despacho & Embalaje Seguro',
          description: 'Embalaje rígido y salida directa desde Pilar.',
          date: 'En 3 a 5 días hábiles',
          completed: false,
          current: false,
        },
        {
          stage: 'entregado',
          title: 'Entrega Final en Domicilio',
          description: 'Recepción del fotolibro.',
          date: 'En 4 a 6 días hábiles',
          completed: false,
          current: false,
        }
      ],
      labNotes: `Solicitud Concierge para ${customerName}. Ocasión: ${occasion}. Estilo: ${designStyle}.`,
    };

    if (onOrderPlaced) {
      onOrderPlaced(newTrackedOrder);
    }

    // Guardar solicitud y orden inicial en Supabase
    saveConciergeRequestToDatabase({
      customer_name: customerName || 'Cliente Concierge',
      customer_email: customerEmail || 'contacto@cliente.com',
      customer_phone: customerPhone || undefined,
      occasion,
      estimated_photos: estimatedPhotosCount,
      special_notes: specialInstructions || undefined,
      status: 'pendiente',
    }).catch((err) => {
      console.warn('Error no bloqueante al guardar solicitud en Supabase:', err);
    });

    saveOrderToDatabase({
      order_code: genOrderNum,
      customer_name: customerName || 'Cliente Concierge',
      customer_email: customerEmail || 'contacto@cliente.com',
      customer_phone: customerPhone || undefined,
      shipping_address: 'A coordinar',
      city: 'Pilar / Envío Nacional',
      format_title: `Concierge: ${selectedFormat.name}`,
      cover_type: selectedCover.name,
      paper_type: 'Fuji Lustre HD',
      total_price: estimatedTotal,
      status: 'en_diseno',
    }).catch((err) => {
      console.warn('Error no bloqueante al guardar orden concierge en Supabase:', err);
    });

    setSubmitted(true);
    onSubmitRequest(request);
  };

  const whatsappInquiryUrl = `https://wa.me/${STORE_CONFIG.whatsappRaw}?text=${encodeURIComponent(
    `¡Hola HALO Fine Art Lab! Acabo de enviar la solicitud de diseño para la Orden #${createdOrderNumber || 'NUEVA'} (${selectedFormat.name}) a nombre de ${customerName || 'Cliente'}. ¿Podemos coordinar por acá?`
  )}`;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md overflow-y-auto"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative my-8 w-full max-w-3xl rounded-3xl border border-[#D6CEBE] bg-[#FDFCF9] shadow-2xl overflow-hidden text-[#1F1C18]"
      >
        {/* Top Header Banner */}
        <div className="flex items-center justify-between border-b border-[#E8E2D5] bg-[#F4EFE6] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EFE9DE] border border-[#D6CEBE] flex items-center justify-center text-[#8C6D37]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-widest text-[#8C6D37] uppercase">SERVICIO CONCIERGE HALO</span>
              <h2 className="font-serif-luxury text-2xl font-bold text-[#1F1C18]">Nosotros Diseñamos Tu Historia</h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-[#736B60] hover:bg-[#E8E2D5] hover:text-[#1F1C18]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="font-serif-luxury text-3xl font-bold text-[#1F1C18]">
              ¡Solicitud Recibida con Éxito!
            </h3>
            <p className="text-sm text-[#595248] max-w-lg mx-auto leading-relaxed">
              Muchas gracias, <strong className="text-[#1F1C18]">{customerName}</strong>. Generamos tu orden <strong className="font-mono text-[#8C6D37]">#{createdOrderNumber}</strong>. Nuestro equipo de directores de arte en el laboratorio de Pilar ya comenzó a revisar tus fotos para <strong>{coverTitle || 'tu fotolibro'}</strong>.
            </p>
            <div className="p-4 rounded-2xl border border-[#D6CEBE] bg-[#F4EFE6] max-w-md mx-auto text-xs text-[#595248] text-left space-y-2">
              <p className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#8C6D37] shrink-0" />
                <span>Te enviaremos el borrador digital interactivo en <strong>48 horas hábiles</strong> a <strong>{customerEmail}</strong> y WhatsApp.</span>
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#8C6D37] shrink-0" />
                <span>Tendrás revisiones y ajustes ilimitados sin costo antes de mandar a encuadernar.</span>
              </p>
              <p className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#8C6D37] shrink-0" />
                <span>Producción en <strong>4 a 6 días hábiles</strong> tras tu aprobación final. Entrega sin costo en Pilar y radio de 20 km.</span>
              </p>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              {onOpenTracker && createdOrderId && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTracker(createdOrderId);
                  }}
                  className="px-6 py-3 rounded-full bg-[#8C6D37] text-white text-xs uppercase tracking-wider font-bold hover:bg-[#73582A] flex items-center gap-2 shadow-md transition-transform hover:scale-105"
                >
                  <Package className="w-4 h-4" />
                  <span>Ver Tracker en Vivo</span>
                </button>
              )}

              <a
                href={whatsappInquiryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-full bg-[#25D366] text-white text-xs uppercase tracking-wider font-semibold hover:bg-[#1EBE5D] flex items-center gap-2 shadow-sm"
              >
                <Phone className="w-4 h-4" />
                <span>Escribirnos al WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-wider font-semibold hover:bg-[#3D352E]"
              >
                Volver a la Tienda
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
            {/* Value Proposition Note */}
            <div className="rounded-2xl border border-[#C5A059]/40 bg-[#F4EFE6]/80 p-4 flex items-start gap-3 text-xs text-[#595248]">
              <Sparkles className="w-5 h-5 text-[#8C6D37] shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-[#1F1C18] block">Servicio de Maquetación Profesional Incluido</span>
                <span>No te preocupes por el orden ni la diagramación. Nuestros diseñadores seleccionan la mejor narrativa visual, balance de blancos y armonía de color para tus fotos.</span>
              </div>
            </div>

            {/* Direct WhatsApp Quick Option */}
            <div className="rounded-2xl border border-[#D6CEBE] bg-[#FDFCF9] p-3.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-[#595248]">
                <Phone className="w-4 h-4 text-[#8C6D37]" />
                <span>¿Preferís mandar las fotos directo por WhatsApp?</span>
              </div>
              <a
                href={`https://wa.me/${STORE_CONFIG.whatsappRaw}?text=${encodeURIComponent('Hola HALO Fine Art, quiero encargar un fotolibro con el servicio de diseño asistido.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-full bg-[#25D366] text-white text-[11px] font-bold hover:bg-[#1EBE5D] transition-colors shrink-0"
              >
                Chat WhatsApp ({STORE_CONFIG.whatsappNumber})
              </a>
            </div>

            {/* 1. Contact Information */}
            <div className="space-y-3">
              <h3 className="font-serif-luxury text-lg font-bold text-[#1F1C18] border-b border-[#E8E2D5] pb-1">
                1. Tus Datos de Contacto
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#1F1C18] block mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ej: Valentina Rossi"
                    className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs text-[#1F1C18] focus:border-[#8C6D37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#1F1C18] block mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="valentina@ejemplo.com"
                    className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs text-[#1F1C18] focus:border-[#8C6D37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#1F1C18] block mb-1">Teléfono / WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Ej: 11 2345-6789"
                    className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs text-[#1F1C18] focus:border-[#8C6D37] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 2. Occasion & Format */}
            <div className="space-y-3">
              <h3 className="font-serif-luxury text-lg font-bold text-[#1F1C18] border-b border-[#E8E2D5] pb-1">
                2. Motivo del Libro & Formato
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                {[
                  { id: 'boda', label: '💍 Boda' },
                  { id: 'familia', label: '👨‍👩‍👧 Familia' },
                  { id: 'viaje', label: '✈️ Viaje' },
                  { id: 'bebe', label: '👶 Bebé / 1 Año' },
                  { id: 'aniversario', label: '🥂 Aniversario' },
                  { id: 'otro', label: '✨ Otro' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOccasion(item.id as any)}
                    className={`py-2 px-2 rounded-xl border font-medium text-center transition-all ${
                      occasion === item.id
                        ? 'border-[#8C6D37] bg-[#8C6D37] text-white shadow-sm'
                        : 'border-[#D6CEBE] bg-[#F4EFE6]/50 text-[#1F1C18] hover:bg-[#FDFCF9]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Format selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {BOOK_FORMATS.map((fmt) => (
                  <div
                    key={fmt.id}
                    onClick={() => setBookFormatId(fmt.id)}
                    className={`cursor-pointer p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                      bookFormatId === fmt.id
                        ? 'border-[#8C6D37] bg-[#FDFCF9] shadow-sm ring-1 ring-[#8C6D37]'
                        : 'border-[#D6CEBE] bg-[#F4EFE6]/40 hover:bg-[#FDFCF9]'
                    }`}
                  >
                    <div>
                      <span className="font-serif-luxury text-sm font-bold text-[#1F1C18] block">{fmt.name}</span>
                      <span className="text-[#736B60]">{fmt.dimensions}</span>
                    </div>
                    <span className="font-serif-luxury font-bold text-[#1F1C18]">
                      {formatPriceARS(fmt.basePrice)} ARS
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Cover & Foil Title */}
            <div className="space-y-3">
              <h3 className="font-serif-luxury text-lg font-bold text-[#1F1C18] border-b border-[#E8E2D5] pb-1">
                3. Tapa & Grabado en Oro (Hot Stamping)
              </h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {COVER_MATERIALS.map((cov) => (
                  <button
                    key={cov.id}
                    type="button"
                    onClick={() => setCoverMaterialId(cov.id)}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs transition-all ${
                      coverMaterialId === cov.id
                        ? 'border-[#8C6D37] bg-[#FDFCF9] ring-1 ring-[#8C6D37] shadow-sm'
                        : 'border-[#D6CEBE] bg-[#F4EFE6]/40'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full border border-black/15 shrink-0" style={{ backgroundColor: cov.colorHex }} />
                    <span className="font-medium text-[#1F1C18] truncate text-[11px]">{cov.name}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs font-semibold text-[#1F1C18] block mb-1">Título Principal en Tapa</label>
                  <input
                    type="text"
                    value={coverTitle}
                    onChange={(e) => setCoverTitle(e.target.value.toUpperCase())}
                    placeholder="EJ: NUESTRA BODA · VALENTINA & MATEO"
                    className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs font-brand tracking-widest text-[#1F1C18] focus:border-[#8C6D37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#1F1C18] block mb-1">Subtítulo / Fecha / Lugar</label>
                  <input
                    type="text"
                    value={coverSubtitle}
                    onChange={(e) => setCoverSubtitle(e.target.value.toUpperCase())}
                    placeholder="EJ: 14 NOVIEMBRE 2025 · PILAR"
                    className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs font-serif-luxury text-[#1F1C18] focus:border-[#8C6D37] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 4. How to Send Photos */}
            <div className="space-y-3">
              <h3 className="font-serif-luxury text-lg font-bold text-[#1F1C18] border-b border-[#E8E2D5] pb-1">
                4. Envío de tus Fotografías
              </h3>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setUploadMethod('cloud-link')}
                  className={`w-full sm:flex-1 py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 ${
                    uploadMethod === 'cloud-link'
                      ? 'border-[#8C6D37] bg-[#8C6D37] text-white shadow-sm'
                      : 'border-[#D6CEBE] bg-[#F4EFE6]/50 text-[#1F1C18]'
                  }`}
                >
                  <LinkIcon className="w-4 h-4" />
                  <span>Enlace de Drive / Dropbox / WeTransfer</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUploadMethod('direct')}
                  className={`w-full sm:flex-1 py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 ${
                    uploadMethod === 'direct'
                      ? 'border-[#8C6D37] bg-[#8C6D37] text-white shadow-sm'
                      : 'border-[#D6CEBE] bg-[#F4EFE6]/50 text-[#1F1C18]'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span>Subir Fotos Directamente ({uploadedPhotos.length})</span>
                </button>
              </div>

              {uploadMethod === 'cloud-link' ? (
                <div>
                  <input
                    type="url"
                    value={cloudLink}
                    onChange={(e) => setCloudLink(e.target.value)}
                    placeholder="Pega aquí el link público de Google Drive, Dropbox, iCloud o WeTransfer"
                    className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2.5 text-xs text-[#1F1C18] focus:border-[#8C6D37] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#736B60] block mt-1">
                    (Si todavía no lo tienes preparado, podés enviarlo más tarde por WhatsApp o responder al correo de confirmación).
                  </span>
                </div>
              ) : (
                <div className="p-4 rounded-xl border-2 border-dashed border-[#D6CEBE] bg-[#F4EFE6]/50 text-center space-y-3">
                  <button
                    type="button"
                    disabled={isOptimizingPhotos}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs font-semibold hover:bg-[#3D352E] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Seleccionar Archivos desde tu Celular o PC</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUploadPos}
                    className="hidden"
                  />

                  {/* Optimization Progress */}
                  {isOptimizingPhotos && optimizingProgress && (
                    <div className="max-w-md mx-auto bg-blue-50 border border-blue-200 rounded-xl p-3 text-left space-y-1.5 animate-pulse">
                      <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                          Generando miniaturas optimizadas en navegador...
                        </span>
                        <span>{optimizingProgress.current} / {optimizingProgress.total}</span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-200"
                          style={{ width: `${(optimizingProgress.current / Math.max(1, optimizingProgress.total)) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-blue-700 block">
                        Comprimiendo miniaturas para envío inmediato y renderizado fluido
                      </span>
                    </div>
                  )}

                  {/* Savings & Previews */}
                  {uploadedPhotos.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {(() => {
                        const savings = calculatePhotoSavingsSummary(uploadedPhotos);
                        return (
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{uploadedPhotos.length} fotos optimizadas</span>
                            {savings.savedPercent > 0 && (
                              <span className="font-bold bg-emerald-100 px-2 py-0.5 rounded-full text-emerald-900 text-[10px]">
                                -{savings.savedPercent}% peso de miniatura ({savings.formattedSaved} ahorrados)
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Small thumbnail strip */}
                      <div className="flex items-center justify-center gap-1.5 overflow-x-auto py-1 max-w-full">
                        {uploadedPhotos.slice(0, 10).map((ph, idx) => (
                          <div key={idx} className="relative w-12 h-12 rounded-lg overflow-hidden border border-[#D6CEBE] shrink-0 group">
                            <img 
                              src={getThumbnailSrc(ph)} 
                              alt={ph.name} 
                              className="w-full h-full object-cover" 
                            />
                            {ph.compressionRatio && (
                              <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] font-mono text-center">
                                -{ph.compressionRatio}%
                              </span>
                            )}
                          </div>
                        ))}
                        {uploadedPhotos.length > 10 && (
                          <div className="w-12 h-12 rounded-lg bg-[#EFE9DE] border border-[#D6CEBE] flex items-center justify-center text-[10px] font-bold text-[#736B60] shrink-0">
                            +{uploadedPhotos.length - 10}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Special Instructions */}
              <div>
                <label className="text-xs font-semibold text-[#1F1C18] block mb-1">
                  Notas Especiales o Pedidos para el Diseñador:
                </label>
                <textarea
                  rows={2}
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="Ej: Darle más protagonismo a las fotos del atardecer; incluir dedicatoria en la primera página..."
                  className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] p-3 text-xs text-[#1F1C18] focus:border-[#8C6D37] focus:outline-none"
                />
              </div>
            </div>

            {/* Estimated Quote & Submit Button */}
            <div className="rounded-2xl border border-[#8C6D37] bg-[#F4EFE6] p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#8C6D37] tracking-wider block">
                  Cotización Estimada · Servicio de Diseño Bonificado
                </span>
                <span className="font-serif-luxury text-2xl font-bold text-[#1F1C18]">
                  {formatPriceARS(estimatedTotal)} ARS
                </span>
                <span className="text-xs text-[#736B60] block">
                  Incluye fotolibro {selectedFormat.name} + diseño profesional + revisiones ilimitadas.
                </span>
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-widest font-bold hover:bg-[#3D352E] shadow-xl flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4 text-[#ECC880]" />
                <span>Enviar y Comenzar Diseño</span>
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
};
