import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, ShoppingBag, CheckCircle2, ShieldCheck, Truck, CreditCard, Sparkles, BookOpen, Phone, MapPin, Package, Clock, Database, AlertTriangle, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { PhotobookProject, DesignServiceRequest, TrackedOrder } from '../types';
import { BOOK_FORMATS, COVER_MATERIALS, PAPER_FINISHES, formatPriceARS, STORE_CONFIG } from '../data/mockData';
import { saveOrderToDatabase, isSupabaseConfigured } from '../lib/supabase';
import { buildAlbumLabLayout } from '../lib/albumOrder';

export interface CartItem {
  type: 'custom-album' | 'concierge-request' | 'photobook-order' | 'fine-art-print' | 'fotolibro';
  id: string;
  title: string;
  details: string;
  price: number;
  quantity?: number;
  badge?: string;
  thumbnailUrl?: string;
  project?: PhotobookProject;
  request?: DesignServiceRequest;
  photobookConfig?: {
    formatId: string;
    formatLabel: string;
    finish: string;
    finishName: string;
    sheets: number;
    extraSheets: number;
    includesBox: boolean;
  };
  /** Fotolibro del editor simple (SimpleAlbumEditor). El diseño está en project.album. */
  fotolibroConfig?: {
    sizeId: string;
    coverType: 'blanda' | 'dura';
    finish: 'envolvente' | 'foto-tapa-cuero';
    laminate: 'brillo' | 'mate';
    sheets: number;
    giftBox: boolean;
  };
  printConfig?: {
    sizeId: string;
    sizeLabel: string;
    paperId: string;
    paperName: string;
    quantity: number;
    unitPrice: number;
    // The photo the customer wants printed, backed up to Supabase Storage
    // when they uploaded it in the catalog (see ProductCatalog.tsx).
    photoId?: string;
    storagePath?: string;
    photoName?: string;
    thumbnailUrl?: string;
  };
}

interface CartCheckoutModalProps {
  cartItems: CartItem[];
  onClose: () => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onOrderPlaced?: (order: TrackedOrder) => void;
  onOpenTracker?: (orderId: string) => void;
}

export const CartCheckoutModal: React.FC<CartCheckoutModalProps> = ({
  cartItems,
  onClose,
  onRemoveItem,
  onClearCart,
  onOrderPlaced,
  onOpenTracker,
}) => {
  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientCity, setRecipientCity] = useState('');
  const [recipientProvince, setRecipientProvince] = useState('Buenos Aires');
  const [recipientPostal, setRecipientPostal] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [shippingMethod, setShippingMethod] = useState<'pilar-free' | 'correo-nacional'>('pilar-free');
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'transfer' | 'card'>('mercadopago');
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string>('');
  const [createdOrderId, setCreatedOrderId] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const subtotal = cartItems.reduce((acc, item) => acc + item.price, 0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const isBankTransfer = paymentMethod === 'transfer';
  const discountAmount = isBankTransfer ? Math.round(subtotal * (STORE_CONFIG.bankDiscountPercent / 100)) : 0;
  const shippingCost = shippingMethod === 'pilar-free' ? 0 : (subtotal > 200000 ? 0 : 9500);
  const total = subtotal - discountAmount + shippingCost;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const buildItemsPayload = () =>
    cartItems.map((ci) => ({
      // Which pricing formula the server should use to recompute this
      // item's price (see api/create-preference.ts + src/lib/pricing.ts).
      type: ci.type,
      title: ci.title,
      format: ci.project?.formatId || 'Formato Fine Art',
      cover: ci.project?.coverMaterialId || 'Lino Seleccionado',
      foil: ci.project?.foilColor || 'Oro Champagne',
      pages: ci.fotolibroConfig ? ci.fotolibroConfig.sheets * 2 : ci.project ? ci.project.spreads.length * 2 : 20,
      price: ci.price,
      previewUrl: ci.project?.photos[0]?.url || ci.printConfig?.thumbnailUrl || ci.thumbnailUrl || 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80',
      // Whether this specific item actually includes the gift box — was
      // hardcoded to `true` before, which both misreported "sin cofre"
      // custom albums on the invoice and made the server's price floor
      // reject legitimate orders that opted out of the box.
      hasGiftBox: ci.type === 'fotolibro' ? !!ci.fotolibroConfig?.giftBox : ci.type === 'custom-album' ? !!ci.project?.giftBoxIncluded : ci.type === 'photobook-order',
      // Storage path of the customer's original photo (fine-art-print
      // orders only), so the lab can retrieve the full-resolution file.
      photoStoragePath: ci.printConfig?.storagePath,

      // --- fields the server needs to recompute an EXACT price ---------
      // 'custom-album' (PhotobookBuilder.tsx)
      paperFinishId: ci.project?.paperFinishId,
      giftBoxIncluded: ci.project?.giftBoxIncluded,
      // 'photobook-order' (ProductCatalog.tsx — "Gran Formato")
      photobookFormatId: ci.photobookConfig?.formatId,
      extraSheets: ci.photobookConfig?.extraSheets,
      // 'fotolibro' (SimpleAlbumEditor.tsx)
      fotolibroSizeId: ci.fotolibroConfig?.sizeId,
      fotolibroCoverType: ci.fotolibroConfig?.coverType,
      fotolibroFinish: ci.fotolibroConfig?.finish,
      fotolibroSheets: ci.fotolibroConfig?.sheets,
      fotolibroGiftBox: ci.fotolibroConfig?.giftBox,
      // Diagramación completa + rutas de las fotos originales, para el laboratorio.
      albumLayout: ci.type === 'fotolibro' && ci.project ? buildAlbumLabLayout(ci.project) : undefined,
      // 'fine-art-print' (ProductCatalog.tsx)
      printSizeId: ci.printConfig?.sizeId,
      printPaperId: ci.printConfig?.paperId,
      printQuantity: ci.printConfig?.quantity,
    }));

  // Real Mercado Pago Checkout Pro flow: create a preference server-side
  // (the order is saved to Supabase there too, with payment_status =
  // 'pending') and redirect the shopper to Mercado Pago to actually pay.
  // Nothing here is "confirmed" yet — the webhook is the source of truth.
  const handleMercadoPagoCheckout = async () => {
    setIsProcessingPayment(true);
    setPaymentError(null);
    try {
      const orderCode = `HALO-${Math.floor(100000 + Math.random() * 900000)}`;
      const response = await fetch('/api/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderCode,
          items: buildItemsPayload(),
          subtotal,
          discountAmount,
          shippingCost,
          total,
          payer: {
            name: recipientName,
            email: recipientEmail,
            phone: recipientPhone,
          },
          shippingAddress: recipientAddress,
          city: recipientCity,
          postalCode: recipientPostal,
          shippingMethod: shippingMethod === 'pilar-free' ? 'pilar_direct' : 'correo_nacional',
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.initPoint) {
        throw new Error(data.error || 'No se pudo iniciar el pago con Mercado Pago.');
      }

      // The redirect to Mercado Pago is a full page navigation away from
      // this SPA, so stash the order code AND the buyer's email — the
      // return screen (App.tsx / PaymentResultModal.tsx) reads both back to
      // poll /api/order-status, which requires the email as a second factor
      // alongside the (only 6-digit) order code so a guessed code alone
      // can't be used to pull someone else's order details.
      localStorage.setItem('halo_pending_mp_order', JSON.stringify({ code: orderCode, email: recipientEmail }));
      window.location.href = data.initPoint;
    } catch (err: any) {
      setPaymentError(err?.message || 'No se pudo conectar con Mercado Pago. Probá de nuevo en unos segundos.');
      setIsProcessingPayment(false);
    }
  };

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();

    // Mercado Pago ('mercadopago' and 'card' both go through the real,
    // secure Checkout Pro flow — Mercado Pago itself handles cards,
    // installments, debit and account balance within that one checkout).
    if (paymentMethod === 'mercadopago' || paymentMethod === 'card') {
      handleMercadoPagoCheckout();
      return;
    }

    const generatedOrderNum = `HALO-${Math.floor(100000 + Math.random() * 900000)}`;
    const generatedOrderId = `ord-${Date.now()}`;
    setCreatedOrderNumber(generatedOrderNum);
    setCreatedOrderId(generatedOrderId);
    setStep('success');

    // Create the TrackedOrder entity to append to the order tracker
    const newTrackedOrder: TrackedOrder = {
      id: generatedOrderId,
      orderNumber: generatedOrderNum,
      customerName: recipientName || 'Cliente HALO',
      customerEmail: recipientEmail || 'cliente@ejemplo.com',
      customerPhone: recipientPhone,
      shippingAddress: recipientAddress || 'Dirección de Entrega',
      shippingCity: recipientCity || 'Pilar, Buenos Aires',
      shippingMethod: shippingMethod === 'pilar-free' ? 'pilar_direct' : 'correo_nacional',
      status: 'en_diseno',
      createdAt: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }),
      estimatedDeliveryDate: '4 a 6 días hábiles',
      estimatedDays: '4 a 6 días hábiles',
      totalPrice: total,
      paymentMethod: paymentMethod === 'mercadopago' 
        ? 'Mercado Pago' 
        : paymentMethod === 'transfer' 
        ? 'Transferencia Bancaria' 
        : 'Tarjeta de Crédito',
      items: cartItems.map((ci) => ({
        title: ci.title,
        format: ci.project?.formatId || 'Formato Fine Art',
        cover: ci.project?.coverMaterialId || 'Lino Seleccionado',
        foil: ci.project?.foilColor || 'Oro Champagne',
        pages: ci.fotolibroConfig ? ci.fotolibroConfig.sheets * 2 : ci.project ? ci.project.spreads.length * 2 : 20,
        price: ci.price,
        previewUrl: ci.project?.photos[0]?.url || ci.printConfig?.thumbnailUrl || ci.thumbnailUrl || 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80',
        // See buildItemsPayload() above — reflects whether this item
        // actually includes the gift box, instead of always `true`.
        hasGiftBox: ci.type === 'fotolibro' ? !!ci.fotolibroConfig?.giftBox : ci.type === 'custom-album' ? !!ci.project?.giftBoxIncluded : ci.type === 'photobook-order',
        photoStoragePath: ci.printConfig?.storagePath,
      })),
      timeline: [
        {
          stage: 'en_diseno',
          title: 'Orden Registrada & Control de Archivos',
          description: 'Recibimos tu pedido en el laboratorio de Pilar. Iniciando calibración de perfiles de color.',
          date: 'Hoy',
          time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          completed: false,
          current: true,
        },
        {
          stage: 'en_impresion',
          title: 'Revelado Químico & Encuadernación',
          description: 'Prensado de hojas Layflat y estampado Hot Stamping en tapa.',
          date: 'Próximamente',
          completed: false,
          current: false,
        },
        {
          stage: 'enviado',
          title: 'Despacho & Embalaje Rígido',
          description: 'Salida desde Pilar con logística asegurada.',
          date: 'En 3 a 5 días hábiles',
          completed: false,
          current: false,
        },
        {
          stage: 'entregado',
          title: 'Entrega en Domicilio',
          description: 'Recepción en tu domicilio.',
          date: 'En 4 a 6 días hábiles',
          completed: false,
          current: false,
        }
      ],
      labNotes: 'Pedido recién ingresado al sistema. Revisión por maestro de encuadernación en curso.',
    };

    if (onOrderPlaced) {
      onOrderPlaced(newTrackedOrder);
    }

    // Persistir orden en Supabase (si está configurado)
    saveOrderToDatabase({
      order_code: generatedOrderNum,
      customer_name: recipientName || 'Cliente HALO',
      customer_email: recipientEmail || 'cliente@ejemplo.com',
      customer_phone: recipientPhone || undefined,
      shipping_address: recipientAddress || undefined,
      city: recipientCity || undefined,
      format_title: cartItems[0]?.title || 'Fotolibro Fine Art',
      cover_type: cartItems[0]?.project?.coverMaterialId || 'Lino Natural',
      paper_type: cartItems[0]?.project?.paperType || 'Fuji Lustre HD',
      total_price: total,
      status: 'confirmado',
      // Guardamos los ítems (con la diagramación de los fotolibros) para que
      // el laboratorio tenga todo lo necesario también en pagos por transferencia.
      items_json: buildItemsPayload() as any,
    }).catch((err) => {
      console.warn('Error no bloqueante al sincronizar pedido con Supabase:', err);
    });

    // Trigger celebration confetti
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ECC880', '#C5A059', '#1F1C18', '#D8CFBC'],
      });
    } catch (err) {
      // safe fallback
    }
  };

  const whatsappConfirmationUrl = `https://wa.me/${STORE_CONFIG.whatsappRaw}?text=${encodeURIComponent(
    `¡Hola HALO Fine Art Lab! Acabo de generar la Orden #${createdOrderNumber || 'NUEVA'} por ${formatPriceARS(total)} ARS a nombre de ${recipientName || 'Cliente'}. ¿Me confirman los datos para el pago y envío a ${recipientCity || 'Pilar'}?`
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
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative my-8 w-full max-w-2xl rounded-3xl border border-[#D6CEBE] bg-[#FDFCF9] shadow-2xl overflow-hidden text-[#1F1C18]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E8E2D5] bg-[#F4EFE6] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#8C6D37]" />
            <h2 className="font-serif-luxury text-xl font-bold text-[#1F1C18]">
              {step === 'cart' && 'Tu Carrito en HALO Fine Art'}
              {step === 'checkout' && 'Detalles de Envío & Facturación'}
              {step === 'success' && '¡Orden Registrada con Éxito!'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#736B60] hover:bg-[#E8E2D5]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content based on step */}
        {step === 'cart' && (
          <div className="p-6 sm:p-8 space-y-6">
            {cartItems.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <BookOpen className="w-12 h-12 text-[#A89F91] mx-auto opacity-50" />
                <h3 className="font-serif-luxury text-xl font-semibold text-[#1F1C18]">Tu carrito está vacío</h3>
                <p className="text-xs text-[#736B60]">Diseñá tu fotolibro con nuestro editor o solicitá el servicio de diseño asistido.</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 px-6 py-2.5 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs font-semibold uppercase tracking-wider"
                >
                  Explorar Formatos
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                  {cartItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl border border-[#D6CEBE] bg-[#F4EFE6]/50 flex items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C6D37] bg-[#EFE9DE] px-2 py-0.5 rounded">
                            {item.type === 'fotolibro'
                              ? 'Fotolibro'
                              : item.type === 'custom-album' 
                              ? 'Fotolibro a Medida' 
                              : item.type === 'photobook-order'
                              ? 'Fotolibro Grandes Formatos'
                              : item.type === 'fine-art-print'
                              ? 'Fotos Fine Art'
                              : 'Servicio Concierge'}
                          </span>
                          {item.badge && (
                            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <h4 className="font-serif-luxury text-lg font-bold text-[#1F1C18]">{item.title}</h4>
                        <p className="text-xs text-[#595248]">{item.details}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-serif-luxury text-xl font-bold text-[#1F1C18] block">
                          {formatPriceARS(item.price)} ARS
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          className="text-[11px] text-red-600 hover:underline mt-1"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Logistics & Delivery Highlights */}
                <div className="rounded-2xl border border-[#D6CEBE] bg-[#F4EFE6]/60 p-4 text-xs text-[#595248] space-y-2">
                  <div className="flex items-center gap-2 text-[#1F1C18] font-bold">
                    <MapPin className="w-4 h-4 text-[#8C6D37]" />
                    <span>Fabricación Artesanal en Pilar, Zona Norte (Bs. As.)</span>
                  </div>
                  <p className="text-[11px]">
                    • Plazo de elaboración: <strong>4 a 6 días hábiles</strong>.<br />
                    • Envío sin costo en Pilar y radio de 20 km. Envíos asegurados por Correo a toda la Argentina.
                  </p>
                </div>

                {/* Totals Breakdown */}
                <div className="rounded-2xl border border-[#E8E2D5] bg-[#FDFCF9] p-4 space-y-2 text-xs text-[#595248]">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <strong className="text-[#1F1C18]">{formatPriceARS(subtotal)} ARS</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Entrega en Pilar y zona norte (radio 20km):</span>
                    <strong className="text-emerald-700">GRATIS</strong>
                  </div>
                  <div className="border-t border-[#E8E2D5] pt-2 flex justify-between text-sm font-bold text-[#1F1C18]">
                    <span>Total Final Estimado:</span>
                    <span className="font-serif-luxury text-xl text-[#8C6D37]">{formatPriceARS(subtotal)} ARS</span>
                  </div>
                </div>

                {/* Proceed Button */}
                {cartItems.some((ci) => ci.type === 'fine-art-print' && !ci.printConfig?.storagePath) && (
                  <p className="text-[11px] text-red-700 text-center -mt-1">
                    Hay una copia Fine Art en el carrito sin foto asociada. Quitala y volvé a agregarla desde el catálogo.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setStep('checkout')}
                  disabled={cartItems.some((ci) => ci.type === 'fine-art-print' && !ci.printConfig?.storagePath)}
                  className="w-full py-4 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-widest font-bold hover:bg-[#3D352E] shadow-xl flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#1F1C18]"
                >
                  <ShieldCheck className="w-4 h-4 text-[#ECC880]" />
                  <span>Continuar con Datos de Entrega</span>
                </button>
              </>
            )}
          </div>
        )}

        {step === 'checkout' && (
          <form onSubmit={handlePlaceOrder} className="p-6 sm:p-8 space-y-5 max-h-[80vh] overflow-y-auto">
            {/* 1. Recipient info */}
            <div className="space-y-3">
              <h3 className="font-serif-luxury text-base font-bold text-[#1F1C18] border-b border-[#E8E2D5] pb-1">
                1. Datos de Quien Recibe
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Nombre y Apellido completo"
                  className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs"
                />
                <input
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="Email para seguimiento"
                  className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs"
                />
                <input
                  type="tel"
                  required
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="Teléfono / WhatsApp de contacto"
                  className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  required
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="Calle, Número, Piso / Depto / Barrio cerrado"
                  className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  required
                  value={recipientCity}
                  onChange={(e) => setRecipientCity(e.target.value)}
                  placeholder="Localidad (Ej: Pilar, Nordelta, CABA, Córdoba...)"
                  className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  required
                  value={recipientPostal}
                  onChange={(e) => setRecipientPostal(e.target.value)}
                  placeholder="Código Postal"
                  className="w-full rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] px-3 py-2 text-xs"
                />
              </div>
            </div>

            {/* 2. Delivery options */}
            <div className="space-y-3">
              <h3 className="font-serif-luxury text-base font-bold text-[#1F1C18] border-b border-[#E8E2D5] pb-1">
                2. Método de Entrega
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setShippingMethod('pilar-free')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    shippingMethod === 'pilar-free'
                      ? 'border-[#8C6D37] bg-[#FDFCF9] ring-1 ring-[#8C6D37] shadow-sm'
                      : 'border-[#D6CEBE] bg-[#F4EFE6]/40'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-[#1F1C18]">Zona Pilar & Alrededores (20km)</span>
                    <span className="text-emerald-700 font-bold uppercase text-[10px]">Sin Costo</span>
                  </div>
                  <p className="text-[11px] text-[#736B60]">Entrega directa protegida desde nuestro laboratorio</p>
                </button>

                <button
                  type="button"
                  onClick={() => setShippingMethod('correo-nacional')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    shippingMethod === 'correo-nacional'
                      ? 'border-[#8C6D37] bg-[#FDFCF9] ring-1 ring-[#8C6D37] shadow-sm'
                      : 'border-[#D6CEBE] bg-[#F4EFE6]/40'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-[#1F1C18]">Envío Correo a Todo el País</span>
                    <span className="font-bold text-[#1F1C18]">
                      {subtotal > 200000 ? 'GRATIS' : `${formatPriceARS(9500)} ARS`}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#736B60]">Embalaje rígido de alta seguridad con seguimiento online</p>
                </button>
              </div>
            </div>

            {/* 3. Payment Method */}
            <div className="space-y-3">
              <h3 className="font-serif-luxury text-base font-bold text-[#1F1C18] border-b border-[#E8E2D5] pb-1 flex items-center justify-between">
                <span>3. Forma de Pago (Pesos Argentinos)</span>
                {isBankTransfer && (
                  <span className="text-[11px] text-emerald-800 bg-emerald-100 font-bold px-2 py-0.5 rounded-full">
                    10% OFF Aplicado (-{formatPriceARS(discountAmount)} ARS)
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { id: 'transfer', label: '🏦 Transferencia Bancaria', badge: '10% OFF' },
                  { id: 'mercadopago', label: '💙 Mercado Pago', badge: 'CVU / QR' },
                  { id: 'card', label: '💳 Tarjetas Bancarias', badge: '1, 3 o 6 Cuotas' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`py-3 px-3 rounded-xl border font-medium text-left sm:text-center transition-all cursor-pointer ${
                      paymentMethod === m.id
                        ? 'border-[#8C6D37] bg-[#8C6D37] text-white shadow-md ring-1 ring-[#8C6D37]'
                        : 'border-[#D6CEBE] bg-[#F4EFE6]/50 text-[#1F1C18] hover:bg-[#F4EFE6]'
                    }`}
                  >
                    <div className="font-bold">{m.label}</div>
                    <div className={`text-[10px] mt-0.5 ${paymentMethod === m.id ? 'text-white/90 font-semibold' : 'text-[#8C6D37]'}`}>
                      {m.badge}
                    </div>
                  </button>
                ))}
              </div>

              {/* Payment Details Drawer */}
              {paymentMethod === 'transfer' && (
                <div className="p-4 rounded-2xl border border-emerald-300 bg-emerald-50/70 text-xs text-[#284E3A] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <strong className="text-emerald-950 flex items-center gap-1.5 font-bold">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      Datos para Transferencia Bancaria (10% de Ahorro)
                    </strong>
                    <span className="text-xs font-mono font-bold text-emerald-900 bg-emerald-200/80 px-2 py-0.5 rounded">
                      Total: {formatPriceARS(total)} ARS
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] bg-white/80 p-3 rounded-xl border border-emerald-200">
                    <div>
                      <span className="text-gray-500 block text-[10px]">BANCO:</span>
                      <strong>{STORE_CONFIG.bankDetails.bankName}</strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px]">TITULAR:</span>
                      <strong>{STORE_CONFIG.bankDetails.accountHolder}</strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px]">CUIT:</span>
                      <strong>{STORE_CONFIG.bankDetails.cuit}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-gray-500 block text-[10px]">ALIAS:</span>
                        <strong className="text-emerald-900">{STORE_CONFIG.bankDetails.alias}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(STORE_CONFIG.bankDetails.alias, 'alias')}
                        className="px-2 py-1 bg-emerald-700 text-white rounded text-[10px] uppercase tracking-wider font-sans font-bold hover:bg-emerald-800"
                      >
                        {copiedKey === 'alias' ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-between pt-1 border-t border-emerald-100">
                      <div>
                        <span className="text-gray-500 block text-[10px]">CBU:</span>
                        <strong className="text-xs tracking-wider">{STORE_CONFIG.bankDetails.cbu}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(STORE_CONFIG.bankDetails.cbu, 'cbu')}
                        className="px-2.5 py-1 bg-emerald-700 text-white rounded text-[10px] uppercase tracking-wider font-sans font-bold hover:bg-emerald-800"
                      >
                        {copiedKey === 'cbu' ? '¡Copiado!' : 'Copiar CBU'}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald-800">
                    Al confirmar, recibirás el remito y podrás adjuntar el comprobante por WhatsApp o email para iniciar de inmediato el revelado.
                  </p>
                </div>
              )}

              {paymentMethod === 'mercadopago' && (
                <div className="p-4 rounded-2xl border border-sky-300 bg-sky-50/70 text-xs text-[#1E3A5F] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <strong className="text-sky-950 flex items-center gap-1.5 font-bold">
                      <Sparkles className="w-4 h-4 text-sky-700" />
                      Mercado Pago (Dinero en Cuenta / Débito / QR)
                    </strong>
                    <span className="text-xs font-mono font-bold text-sky-900 bg-sky-200/80 px-2 py-0.5 rounded">
                      Total: {formatPriceARS(total)} ARS
                    </span>
                  </div>
                  <p className="text-[11px] text-sky-800 leading-relaxed">
                    Al confirmar te vamos a redirigir al Checkout seguro de Mercado Pago para completar el pago. Acreditación automática e instantánea — no hace falta que nos envíes comprobante.
                  </p>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="p-4 rounded-2xl border border-[#D6CEBE] bg-[#F4EFE6]/70 text-xs text-[#595248] space-y-2">
                  <div className="flex items-center justify-between">
                    <strong className="text-[#1F1C18] flex items-center gap-1.5 font-bold">
                      <ShieldCheck className="w-4 h-4 text-[#8C6D37]" />
                      Pago Seguro con Tarjetas Bancarias
                    </strong>
                    <span className="text-xs font-mono font-bold text-[#1F1C18]">
                      Total: {formatPriceARS(total)} ARS
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Aceptamos {STORE_CONFIG.mercadoPagoDetails.cardsAccepted} en {STORE_CONFIG.mercadoPagoDetails.installmentsText.toLowerCase()}. Se procesa a través del Checkout seguro de Mercado Pago — te redirigimos ahí para completar el pago.
                  </p>
                </div>
              )}

              {paymentError && (
                <div className="p-3 rounded-xl border border-red-300 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{paymentError}</span>
                </div>
              )}
            </div>

            {/* Price Summary Before Submit */}
            <div className="rounded-xl border border-[#E8E2D5] bg-[#FAF8F5] p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-[#595248]">
                <span>Subtotal ({cartItems.length} {cartItems.length === 1 ? 'producto' : 'productos'}):</span>
                <span className="font-mono">{formatPriceARS(subtotal)} ARS</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-800 font-medium">
                  <span>Descuento Transferencia Bancaria (10% OFF):</span>
                  <span className="font-mono">- {formatPriceARS(discountAmount)} ARS</span>
                </div>
              )}
              <div className="flex justify-between text-[#595248]">
                <span>Envío:</span>
                <span className="font-mono">{shippingCost === 0 ? 'GRATIS' : `${formatPriceARS(shippingCost)} ARS`}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-[#1F1C18] pt-1.5 border-t border-[#E8E2D5]">
                <span>Total a Abonar:</span>
                <span className="font-serif-luxury text-lg text-[#8C6D37]">{formatPriceARS(total)} ARS</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-[#E8E2D5]">
              <button
                type="button"
                onClick={() => setStep('cart')}
                className="text-xs font-semibold text-[#736B60] hover:text-[#1F1C18]"
              >
                ← Volver al Carrito
              </button>

              <button
                type="submit"
                disabled={isProcessingPayment}
                className="px-8 py-3.5 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-widest font-bold hover:bg-[#3D352E] shadow-xl cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Redirigiendo a Mercado Pago…</span>
                  </>
                ) : paymentMethod === 'mercadopago' || paymentMethod === 'card' ? (
                  <span>Pagar con Mercado Pago ({formatPriceARS(total)} ARS)</span>
                ) : (
                  <span>Confirmar Orden ({formatPriceARS(total)} ARS)</span>
                )}
              </button>
            </div>
          </form>
        )}

        {step === 'success' && (
          <div className="p-8 sm:p-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-[#EFE9DE] text-[#8C6D37] flex items-center justify-center mx-auto mb-2 border border-[#D6CEBE]">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="font-serif-luxury text-3xl font-bold text-[#1F1C18]">
              ¡Tu Pedido fue Registrado con Éxito!
            </h3>
            <p className="text-sm text-[#595248] max-w-md mx-auto leading-relaxed">
              Orden: <strong className="font-mono text-[#8C6D37]">#{createdOrderNumber}</strong><br />
              Total: <strong className="text-[#1F1C18]">{formatPriceARS(total)} ARS</strong>
            </p>
            <div className="p-4 rounded-2xl border border-[#D6CEBE] bg-[#F4EFE6] text-xs text-[#595248] max-w-md mx-auto text-left space-y-2">
              <p className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#8C6D37] shrink-0" />
                <span>Tiempo de elaboración & entrega: <strong>4 a 6 días hábiles</strong> desde nuestro taller en Pilar.</span>
              </p>
              <p>• Te enviamos la confirmación a <strong>{recipientEmail || 'tu email'}</strong>.</p>
              <p>• Podés seguir el avance de diseño, impresión y envío en tiempo real con tu número de orden.</p>
            </div>

            <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
              {onOpenTracker && createdOrderId && (
                <button
                  type="button"
                  onClick={() => {
                    onClearCart();
                    onClose();
                    onOpenTracker(createdOrderId);
                  }}
                  className="px-6 py-3 rounded-full bg-[#8C6D37] text-white text-xs uppercase tracking-wider font-bold hover:bg-[#73582A] flex items-center gap-2 shadow-md transition-transform hover:scale-105"
                >
                  <Package className="w-4 h-4" />
                  <span>Ver Tracker de Pedido</span>
                </button>
              )}

              <a
                href={whatsappConfirmationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-full bg-[#25D366] text-white text-xs uppercase tracking-wider font-semibold hover:bg-[#1EBE5D] flex items-center gap-2 shadow-sm"
              >
                <Phone className="w-4 h-4" />
                <span>Confirmar por WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  onClearCart();
                  onClose();
                }}
                className="px-5 py-3 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-wider font-semibold hover:bg-[#3D352E]"
              >
                Volver a la Tienda
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
