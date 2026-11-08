import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  ShieldCheck, 
  Package, 
  Download, 
  Eye, 
  CheckCircle2, 
  Clock, 
  Truck, 
  FileText, 
  Sparkles, 
  MessageSquare, 
  Search, 
  Filter,
  Lock,
  RefreshCw,
  FolderDown, 
  Layers, 
  MapPin, 
  User, 
  Phone, 
  Mail, 
  DollarSign, 
  Calendar, 
  ArrowUpRight,
  ExternalLink,
  ChevronRight,
  Send,
  HelpCircle,
  Printer,
  HardDrive,
  Cloud,
  Copy,
  FolderPlus,
  Share2,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { TrackedOrder, OrderStatusStage, DesignServiceRequest, PhotoAsset, OrderCloudFolder } from '../types';
import {
  getAdminOrdersFromSupabase,
  updateOrderStatusInWorkshop,
  getAdminConciergeRequests,
  generateAndDownloadProductionZip,
  deleteOrderFromWorkshop
} from '../lib/adminService';
import { 
  downloadOrderInvoicePdf, 
  getOrderInvoiceBlobUrl 
} from '../lib/invoicePdfGenerator';
import {
  getWorkshopCloudConfig,
  saveWorkshopCloudConfig,
  generateAutomatedCloudFolder,
  generateClientPhotoRequestMessage,
  updateOrderCloudFolder,
  WorkshopCloudConfig
} from '../lib/cloudStorageService';
import { formatPriceARS } from '../data/mockData';
import { useAuth } from '../context/AuthContext';

interface AdminWorkshopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewOrderInTracker?: (orderCode: string) => void;
  onOpenAuth?: () => void;
}

export const AdminWorkshopModal: React.FC<AdminWorkshopModalProps> = ({
  isOpen,
  onClose,
  onViewOrderInTracker,
  onOpenAuth,
}) => {
  // Admin access now comes from the real Supabase session: the signed-in
  // user's `profiles.is_admin` flag, set directly in the database. There is
  // no client-side PIN anymore — it was trivial to read out of the bundle
  // and to bypass entirely via localStorage.
  const { isLoggedIn, isLoading: isAuthLoading, profile, user, signOut } = useAuth();
  const isAdmin = Boolean(profile?.isAdmin);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'orders' | 'concierge' | 'cloud' | 'downloads' | 'settings'>('orders');

  // Orders State
  const [orders, setOrders] = useState<TrackedOrder[]>([]);
  const [conciergeRequests, setConciergeRequests] = useState<DesignServiceRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Workshop Cloud Storage Config
  const [cloudConfig, setCloudConfig] = useState<WorkshopCloudConfig>(getWorkshopCloudConfig());
  const [cloudConfigSaved, setCloudConfigSaved] = useState(false);
  const [copiedLinkOrderId, setCopiedLinkOrderId] = useState<string | null>(null);

  // Selected Order for Detail View / Editing
  const [selectedOrder, setSelectedOrder] = useState<TrackedOrder | null>(null);
  const [editingStatus, setEditingStatus] = useState<OrderStatusStage>('en_impresion');
  const [editingTracking, setEditingTracking] = useState('');
  const [editingLabNotes, setEditingLabNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccessMsg, setUpdateSuccessMsg] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState<string | null>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState<string | null>(null);
  const [invoicePreviewOrder, setInvoicePreviewOrder] = useState<TrackedOrder | null>(null);
  const [invoicePreviewUrl, setInvoicePreviewUrl] = useState<string | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [ordersAreLive, setOrdersAreLive] = useState(false);
  const [ordersLoadError, setOrdersLoadError] = useState<string | null>(null);
  const [orderPendingDelete, setOrderPendingDelete] = useState<TrackedOrder | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);
  const [zipFallbackInfo, setZipFallbackInfo] = useState<{ orderId: string; message: string } | null>(null);

  // Load orders once the modal is open AND the session has been confirmed as admin
  useEffect(() => {
    if (isOpen && isAdmin) {
      loadData();
    }
  }, [isOpen, isAdmin]);

  const loadData = async () => {
    setIsLoadingOrders(true);
    // Real orders live in Supabase (orders_select_owner_or_admin RLS lets an
    // is_admin profile read every row); localStorage sample data is only a
    // fallback for when Supabase isn't configured at all.
    const { orders: loadedOrders, isLive, error } = await getAdminOrdersFromSupabase();
    const loadedRequests = getAdminConciergeRequests();
    setOrders(loadedOrders);
    setOrdersAreLive(isLive);
    setOrdersLoadError(error);
    setConciergeRequests(loadedRequests);
    setIsLoadingOrders(false);
  };

  const handleLogout = async () => {
    await signOut();
  };

  const handleSelectOrder = (order: TrackedOrder) => {
    setSelectedOrder(order);
    setEditingStatus(order.status);
    setEditingTracking(order.trackingCode || '');
    setEditingLabNotes(order.labNotes || '');
    setUpdateSuccessMsg(false);
  };

  const handleSaveOrderStatus = async () => {
    if (!selectedOrder) return;
    setIsUpdating(true);
    const updated = await updateOrderStatusInWorkshop(
      selectedOrder,
      editingStatus,
      editingTracking,
      editingLabNotes
    );
    setIsUpdating(false);
    if (updated) {
      setSelectedOrder(updated);
      setUpdateSuccessMsg(true);
      loadData();
      setTimeout(() => setUpdateSuccessMsg(false), 3000);
    }
  };

  const handleDownloadZip = async (order: TrackedOrder) => {
    setIsDownloadingZip(order.id);
    setZipFallbackInfo(null);
    try {
      const result = await generateAndDownloadProductionZip(order);
      if (!result.ok && result.reason === 'no_photos') {
        // No real photo has a Supabase Storage path on this order yet (this
        // is expected today for custom-album orders) — open the client's
        // real Drive/MEGA upload folder instead of pretending to package
        // files that don't exist.
        const cloudFolder = generateAutomatedCloudFolder(order);
        const link = cloudFolder.googleDriveUrl || cloudFolder.megaUrl;
        setZipFallbackInfo({
          orderId: order.id,
          message: 'Todavía no hay fotos en alta calidad asociadas a este pedido en el sistema. Te abrimos la carpeta de Drive/MEGA del cliente — revisá ahí si ya subió los archivos.',
        });
        if (link) window.open(link, '_blank', 'noopener,noreferrer');
      } else if (!result.ok) {
        setZipFallbackInfo({ orderId: order.id, message: 'No se pudo generar el ZIP. Intentá de nuevo.' });
      }
    } catch (err) {
      console.error('Error generating zip', err);
      setZipFallbackInfo({ orderId: order.id, message: 'No se pudo generar el ZIP. Intentá de nuevo.' });
    } finally {
      setIsDownloadingZip(null);
    }
  };

  const handleDeleteOrder = async () => {
    if (!orderPendingDelete) return;
    setIsDeletingOrder(true);
    setDeleteErrorMsg(null);
    const { error } = await deleteOrderFromWorkshop(orderPendingDelete);
    setIsDeletingOrder(false);
    if (error) {
      setDeleteErrorMsg(error);
      return;
    }
    if (selectedOrder?.id === orderPendingDelete.id) {
      setSelectedOrder(null);
    }
    setOrderPendingDelete(null);
    loadData();
  };

  const handleDownloadInvoice = async (order: TrackedOrder) => {
    setIsGeneratingInvoice(order.id);
    try {
      // Short delay for UI feedback
      await new Promise(r => setTimeout(r, 200));
      downloadOrderInvoicePdf(order);
    } catch (err) {
      console.error('Error generating invoice PDF', err);
    } finally {
      setIsGeneratingInvoice(null);
    }
  };

  const handlePreviewInvoice = (order: TrackedOrder) => {
    try {
      if (invoicePreviewUrl) {
        URL.revokeObjectURL(invoicePreviewUrl);
      }
      const url = getOrderInvoiceBlobUrl(order);
      setInvoicePreviewUrl(url);
      setInvoicePreviewOrder(order);
    } catch (err) {
      console.error('Error opening invoice preview', err);
    }
  };

  const handleCloseInvoicePreview = () => {
    if (invoicePreviewUrl) {
      URL.revokeObjectURL(invoicePreviewUrl);
    }
    setInvoicePreviewUrl(null);
    setInvoicePreviewOrder(null);
  };

  const handleSaveCloudSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveWorkshopCloudConfig(cloudConfig);
    setCloudConfigSaved(true);
    setTimeout(() => setCloudConfigSaved(false), 3000);
  };

  const handleCopyClientUploadLink = (order: TrackedOrder) => {
    const cloudFolder = generateAutomatedCloudFolder(order);
    const targetUrl = cloudConfig.activeProvider === 'mega_nz' 
      ? cloudFolder.megaUrl 
      : cloudFolder.googleDriveUrl || cloudFolder.megaUrl;
    
    if (targetUrl) {
      navigator.clipboard.writeText(targetUrl);
      setCopiedLinkOrderId(order.id);
      setTimeout(() => setCopiedLinkOrderId(null), 2500);
    }
  };

  const handleUpdateCloudStatus = (orderId: string, status: OrderCloudFolder['status']) => {
    updateOrderCloudFolder(orderId, { status });
    loadData();
  };

  // Filter Orders
  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.shippingCity.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate Metrics
  const totalRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
  const inProductionCount = orders.filter(o => o.status === 'en_impresion').length;
  const inDesignCount = orders.filter(o => o.status === 'en_diseno').length;

  if (!isOpen) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#1F1C18]/80 backdrop-blur-md overflow-y-auto"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#FAF8F5] border border-[#D6CEBE] w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        
        {/* TOP BAR */}
        <div className="bg-[#1F1C18] text-[#FDFCF9] px-6 py-4 flex items-center justify-between border-b border-[#3D352E]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#ECC880]/20 flex items-center justify-center border border-[#ECC880]/40">
              <ShieldCheck className="w-4 h-4 text-[#ECC880]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif-luxury font-bold text-base sm:text-lg tracking-wide text-[#FDFCF9]">
                  HALO Fine Art Lab · Panel de Taller
                </span>
                <span className="text-[10px] uppercase font-semibold bg-[#ECC880]/20 text-[#ECC880] px-2 py-0.5 rounded-full border border-[#ECC880]/30">
                  Pilar, Bs.As.
                </span>
              </div>
              <p className="text-[11px] text-[#A69C8D]">
                Control de Producción Artesanal, Gestión de Pedidos y Descarga de Fotos para Revelado
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs text-[#A69C8D] hover:text-[#FDFCF9] transition-colors px-3 py-1.5 rounded-lg border border-[#3D352E] hover:border-[#A69C8D]"
              >
                Cerrar Sesión Taller
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-[#A69C8D] hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AUTHENTICATION GATE — real Supabase session + profiles.is_admin, no client-side PIN */}
        {!isAdmin ? (
          <div className="p-8 sm:p-12 flex flex-col items-center justify-center my-auto">
            <div className="w-16 h-16 rounded-full bg-[#EFE9DE] flex items-center justify-center mb-4 border border-[#D6CEBE] shadow-sm">
              <Lock className="w-8 h-8 text-[#8C6D37]" />
            </div>
            <h2 className="font-serif-luxury text-2xl font-bold text-[#1F1C18] text-center mb-2">
              Acceso a Control de Taller & Descargas
            </h2>
            <p className="text-sm text-[#595248] text-center max-w-md mb-6 leading-relaxed">
              Esta área es exclusiva para el equipo del laboratorio en Pilar. Iniciá sesión con una cuenta habilitada como administradora para descargar los archivos fotográficos en alta resolución y coordinar los envíos.
            </p>

            {isAuthLoading ? (
              <p className="text-xs text-[#8C6D37]">Verificando sesión…</p>
            ) : !isLoggedIn ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-6 py-2.5 rounded-xl bg-[#1F1C18] text-white text-xs uppercase tracking-wider font-semibold hover:bg-[#3D352E] transition-all shadow-md"
              >
                Iniciar Sesión
              </button>
            ) : (
              <div className="w-full max-w-sm text-center space-y-3">
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                  La cuenta <strong>{user?.email}</strong> no tiene permisos de administrador del taller. Pedile a alguien del equipo que te habilite desde Supabase, o iniciá sesión con otra cuenta.
                </p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-xl border border-[#D6CEBE] bg-[#F7F3EB] text-xs font-semibold text-[#8C6D37] hover:bg-[#EFE9DE] transition-colors"
                >
                  Cerrar sesión y probar con otra cuenta
                </button>
              </div>
            )}
          </div>
        ) : (
          /* AUTHENTICATED WORKSHOP INTERFACE */
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* KPI STATS BAR */}
            <div className="bg-[#F4EFE6] border-b border-[#E8E2D5] px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white border border-[#D6CEBE] flex items-center justify-center text-[#8C6D37] shadow-xs">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#736B60] block">Pedidos Totales</span>
                  <span className="font-serif-luxury font-bold text-sm sm:text-base text-[#1F1C18]">{orders.length}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white border border-[#D6CEBE] flex items-center justify-center text-amber-700 shadow-xs">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#736B60] block">En Revelado / Taller</span>
                  <span className="font-serif-luxury font-bold text-sm sm:text-base text-[#1F1C18]">{inProductionCount}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white border border-[#D6CEBE] flex items-center justify-center text-indigo-700 shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#736B60] block">Solicitudes Concierge</span>
                  <span className="font-serif-luxury font-bold text-sm sm:text-base text-[#1F1C18]">{conciergeRequests.length}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white border border-[#D6CEBE] flex items-center justify-center text-emerald-700 shadow-xs">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#736B60] block">Facturación Total</span>
                  <span className="font-serif-luxury font-bold text-sm sm:text-base text-emerald-800">{formatPriceARS(totalRevenue)} ARS</span>
                </div>
              </div>
            </div>

            {/* TAB SELECTOR */}
            <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#E8E2D5] bg-[#FAF8F5]">
              <button
                type="button"
                onClick={() => { setActiveTab('orders'); setSelectedOrder(null); }}
                className={`pb-3 px-3 text-xs uppercase tracking-wider font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'orders'
                    ? 'border-[#8C6D37] text-[#1F1C18]'
                    : 'border-transparent text-[#736B60] hover:text-[#1F1C18]'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>Pedidos & Producción ({orders.length})</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('concierge'); setSelectedOrder(null); }}
                className={`pb-3 px-3 text-xs uppercase tracking-wider font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'concierge'
                    ? 'border-[#8C6D37] text-[#1F1C18]'
                    : 'border-transparent text-[#736B60] hover:text-[#1F1C18]'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Diseño Asistido Concierge ({conciergeRequests.length})</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('cloud'); setSelectedOrder(null); }}
                className={`pb-3 px-3 text-xs uppercase tracking-wider font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'cloud'
                    ? 'border-[#8C6D37] text-[#1F1C18]'
                    : 'border-transparent text-[#736B60] hover:text-[#1F1C18]'
                }`}
              >
                <Cloud className="w-4 h-4 text-[#8C6D37]" />
                <span>Nube Drive & MEGA ({orders.length})</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('downloads'); setSelectedOrder(null); }}
                className={`pb-3 px-3 text-xs uppercase tracking-wider font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'downloads'
                    ? 'border-[#8C6D37] text-[#1F1C18]'
                    : 'border-transparent text-[#736B60] hover:text-[#1F1C18]'
                }`}
              >
                <FolderDown className="w-4 h-4" />
                <span>Cómo Descargar Fotos</span>
              </button>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#FAF8F5]">
              
              {/* TAB 1: ORDERS MANAGEMENT */}
              {activeTab === 'orders' && (
                <div className="space-y-4">

                  {/* Data source banner */}
                  {ordersAreLive ? (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mostrando pedidos reales desde la base de datos ({orders.length})
                      </span>
                      <button type="button" onClick={() => loadData()} disabled={isLoadingOrders} className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold disabled:opacity-50">
                        <RefreshCw className={`w-3 h-3 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                        Actualizar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                      <span className="flex items-center gap-1.5 font-semibold">
                        ⚠️ {ordersLoadError ? `No se pudo leer Supabase (${ordersLoadError}) — mostrando datos de ejemplo.` : 'Supabase no está configurado — mostrando datos de ejemplo, no pedidos reales.'}
                      </span>
                      <button type="button" onClick={() => loadData()} disabled={isLoadingOrders} className="flex items-center gap-1 text-amber-700 hover:text-amber-900 font-semibold disabled:opacity-50">
                        <RefreshCw className={`w-3 h-3 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                        Reintentar
                      </button>
                    </div>
                  )}

                  {/* Search and Filters */}
                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="relative w-full sm:w-80">
                      <Search className="w-4 h-4 text-[#8C6D37] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por código, cliente o ciudad..."
                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#D6CEBE] bg-white text-xs text-[#1F1C18] focus:outline-none focus:ring-1 focus:ring-[#8C6D37]"
                      />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1">
                      <Filter className="w-3.5 h-3.5 text-[#736B60] shrink-0" />
                      <span className="text-[11px] text-[#736B60] shrink-0">Filtrar:</span>
                      {[
                        { id: 'all', label: 'Todos' },
                        { id: 'en_diseno', label: 'En Diseño' },
                        { id: 'en_impresion', label: 'En Taller / Revelado' },
                        { id: 'enviado', label: 'Enviados' },
                        { id: 'entregado', label: 'Entregados' }
                      ].map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setStatusFilter(f.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                            statusFilter === f.id
                              ? 'bg-[#1F1C18] text-white'
                              : 'bg-[#EFE9DE] text-[#595248] hover:bg-[#E2D9C8]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Orders Table / List */}
                  <div className="grid grid-cols-1 gap-3">
                    {filteredOrders.length === 0 ? (
                      <div className="p-8 text-center bg-white rounded-xl border border-[#D6CEBE]">
                        <Package className="w-8 h-8 text-[#A69C8D] mx-auto mb-2 opacity-50" />
                        <p className="text-xs text-[#736B60]">No se encontraron pedidos con ese criterio.</p>
                      </div>
                    ) : (
                      filteredOrders.map((order) => {
                        const isSelected = selectedOrder?.id === order.id;
                        return (
                          <div
                            key={order.id}
                            className={`p-4 rounded-xl border transition-all bg-white ${
                              isSelected 
                                ? 'border-[#8C6D37] ring-2 ring-[#8C6D37]/20 shadow-md' 
                                : 'border-[#E8E2D5] hover:border-[#D6CEBE] shadow-xs'
                            }`}
                          >
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                              
                              {/* Left Info */}
                              <div className="flex items-start gap-3">
                                {order.items[0]?.previewUrl && (
                                  <img
                                    src={order.items[0].previewUrl}
                                    alt="Preview"
                                    className="w-14 h-14 rounded-lg object-cover border border-[#D6CEBE] shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs font-bold text-[#1F1C18] bg-[#F7F3EB] px-2 py-0.5 rounded border border-[#D6CEBE]">
                                      {order.orderNumber}
                                    </span>
                                    
                                    {/* Status Badge */}
                                    <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                      order.status === 'en_diseno' 
                                        ? 'bg-blue-100 text-blue-800' 
                                        : order.status === 'en_impresion'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                        : order.status === 'enviado'
                                        ? 'bg-purple-100 text-purple-800'
                                        : 'bg-emerald-100 text-emerald-800'
                                    }`}>
                                      {order.status === 'en_diseno' && <Sparkles className="w-2.5 h-2.5" />}
                                      {order.status === 'en_impresion' && <Clock className="w-2.5 h-2.5" />}
                                      {order.status === 'enviado' && <Truck className="w-2.5 h-2.5" />}
                                      {order.status === 'entregado' && <CheckCircle2 className="w-2.5 h-2.5" />}
                                      {order.status === 'en_diseno' && 'En Diseño'}
                                      {order.status === 'en_impresion' && 'En Impresión / Taller'}
                                      {order.status === 'enviado' && 'En Reparto / Enviado'}
                                      {order.status === 'entregado' && 'Entregado'}
                                    </span>

                                    {/* Shipping badge */}
                                    {order.shippingMethod === 'pilar_direct' ? (
                                      <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                                        🛵 Entrega Directa Pilar (20 km)
                                      </span>
                                    ) : (
                                      <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold border border-blue-200">
                                        📦 Correo Argentino Expreso
                                      </span>
                                    )}

                                    {/* Payment status badge */}
                                    {order.paymentProvider === 'transfer' ? (
                                      <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold border border-slate-300">
                                        🏦 Transferencia (verificar manualmente)
                                      </span>
                                    ) : order.paymentStatus === 'approved' ? (
                                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold border border-emerald-300">
                                        ✓ Pago Acreditado (Mercado Pago)
                                      </span>
                                    ) : order.paymentStatus === 'rejected' || order.paymentStatus === 'cancelled' ? (
                                      <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded font-semibold border border-red-300">
                                        ✕ Pago Rechazado
                                      </span>
                                    ) : order.paymentStatus === 'refunded' ? (
                                      <span className="text-[10px] bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-semibold border border-orange-300">
                                        ↩ Reembolsado
                                      </span>
                                    ) : (
                                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold border border-amber-300 animate-pulse">
                                        ⏳ Pago Pendiente (Mercado Pago)
                                      </span>
                                    )}
                                  </div>

                                  <h4 className="font-serif-luxury font-bold text-sm text-[#1F1C18]">
                                    {order.items[0]?.title || 'Fotolibro Fine Art'}
                                  </h4>

                                  <div className="flex items-center gap-4 text-xs text-[#595248] flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <User className="w-3 h-3 text-[#8C6D37]" />
                                      <strong>{order.customerName}</strong>
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-[#8C6D37]" />
                                      {order.shippingCity}
                                    </span>
                                    <span className="text-[#8C6D37] font-semibold">
                                      {formatPriceARS(order.totalPrice)} ARS
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex items-center gap-2 flex-wrap border-t lg:border-t-0 pt-2 lg:pt-0 border-[#E8E2D5]">
                                
                                {/* Download ZIP Button */}
                                <button
                                  type="button"
                                  onClick={() => handleDownloadZip(order)}
                                  disabled={isDownloadingZip === order.id}
                                  className="px-3 py-1.5 rounded-lg border border-[#D6CEBE] bg-[#F7F3EB] hover:bg-[#EFE9DE] text-xs font-semibold text-[#1F1C18] transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                                  title="Descargar paquete ZIP con fotos en alta calidad y ficha técnica"
                                >
                                  {isDownloadingZip === order.id ? (
                                    <div className="w-3.5 h-3.5 border-2 border-[#8C6D37] border-t-transparent rounded-full animate-spin"></div>
                                  ) : (
                                    <Download className="w-3.5 h-3.5 text-[#8C6D37]" />
                                  )}
                                  <span>Descargar ZIP Fotos</span>
                                </button>

                                {/* Invoice PDF Button */}
                                <div className="flex items-center rounded-lg border border-[#D6CEBE] bg-[#F7F3EB] overflow-hidden shadow-xs">
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadInvoice(order)}
                                    disabled={isGeneratingInvoice === order.id}
                                    className="px-2.5 py-1.5 hover:bg-[#EFE9DE] text-xs font-semibold text-[#1F1C18] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                    title="Descargar Factura Oficial en PDF (AFIP/B)"
                                  >
                                    {isGeneratingInvoice === order.id ? (
                                      <div className="w-3.5 h-3.5 border-2 border-[#8C6D37] border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                      <FileText className="w-3.5 h-3.5 text-[#8C6D37]" />
                                    )}
                                    <span>Factura PDF</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewInvoice(order)}
                                    className="px-2 py-1.5 border-l border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#736B60] hover:text-[#1F1C18] transition-colors"
                                    title="Ver Vista Previa de Factura"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Cloud Storage Folder Links (Drive / MEGA) */}
                                {(() => {
                                  const cloudFolder = generateAutomatedCloudFolder(order);
                                  return (
                                    <div className="flex items-center rounded-lg border border-blue-200 bg-blue-50/80 overflow-hidden shadow-xs">
                                      <a
                                        href={cloudFolder.googleDriveUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1.5 hover:bg-blue-100 text-xs font-semibold text-blue-900 transition-colors flex items-center gap-1.5"
                                        title="Abrir Carpeta Google Drive del Pedido"
                                      >
                                        <Cloud className="w-3.5 h-3.5 text-blue-700" />
                                        <span>Drive</span>
                                      </a>
                                      <a
                                        href={cloudFolder.megaUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1.5 border-l border-blue-200 hover:bg-red-50 text-xs font-semibold text-red-900 transition-colors flex items-center gap-1"
                                        title="Abrir Carpeta MEGA.NZ del Pedido"
                                      >
                                        <HardDrive className="w-3.5 h-3.5 text-red-600" />
                                        <span>MEGA</span>
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyClientUploadLink(order)}
                                        className="px-2 py-1.5 border-l border-blue-200 hover:bg-blue-200 text-blue-800 transition-colors"
                                        title="Copiar Link de Carga para Cliente"
                                      >
                                        {copiedLinkOrderId === order.id ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        ) : (
                                          <Copy className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </div>
                                  );
                                })()}

                                {/* WhatsApp Customer */}
                                {order.customerPhone && (
                                  <a
                                    href={`https://wa.me/${order.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                      `Hola ${order.customerName}, te escribimos desde HALO Fine Art Lab en Pilar respecto a tu pedido ${order.orderNumber}. ¡Tu fotolibro ya se encuentra en nuestro taller!`
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 transition-colors flex items-center gap-1.5"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>WhatsApp</span>
                                  </a>
                                )}

                                {/* Manage Status Button */}
                                <button
                                  type="button"
                                  onClick={() => handleSelectOrder(order)}
                                  className="px-3.5 py-1.5 rounded-lg bg-[#1F1C18] text-white text-xs uppercase tracking-wider font-semibold hover:bg-[#3D352E] transition-colors flex items-center gap-1.5 shadow-xs"
                                >
                                  <Layers className="w-3.5 h-3.5 text-[#ECC880]" />
                                  <span>Gestionar Taller</span>
                                </button>

                                {/* Delete Order Button */}
                                <button
                                  type="button"
                                  onClick={() => { setDeleteErrorMsg(null); setOrderPendingDelete(order); }}
                                  className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 transition-colors flex items-center gap-1.5"
                                  title="Eliminar Pedido"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Eliminar</span>
                                </button>
                              </div>

                              {zipFallbackInfo && zipFallbackInfo.orderId === order.id && (
                                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">
                                  {zipFallbackInfo.message}
                                </p>
                              )}
                            </div>

                            {/* EXPANDED WORKSHOP MANAGEMENT DRAWER */}
                            {isSelected && (
                              <div className="mt-4 pt-4 border-t border-[#E8E2D5] bg-[#FDFCF9] -mx-4 -mb-4 p-4 rounded-b-xl space-y-4 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  
                                  {/* Left: Technical Specs */}
                                  <div className="bg-white p-3.5 rounded-xl border border-[#D6CEBE] space-y-2">
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-[#8C6D37] flex items-center gap-1.5">
                                      <FileText className="w-3.5 h-3.5" /> Ficha de Encuadernación
                                    </h5>
                                    <div className="text-xs text-[#595248] space-y-1">
                                      <p><strong>Formato:</strong> {order.items[0]?.format}</p>
                                      <p><strong>Tapa:</strong> {order.items[0]?.cover}</p>
                                      <p><strong>Hot Stamping:</strong> {order.items[0]?.foil}</p>
                                      <p><strong>Páginas:</strong> {order.items[0]?.pages} páginas ({Math.ceil((order.items[0]?.pages || 20) / 2)} pliegos Layflat)</p>
                                      <p><strong>Caja de Presentación:</strong> {order.items[0]?.hasGiftBox ? 'SÍ (Incluida)' : 'NO'}</p>
                                      <p><strong>Destino:</strong> {order.shippingAddress}, {order.shippingCity}</p>
                                      <p><strong>Email Cliente:</strong> {order.customerEmail}</p>
                                    </div>

                                    {/* Action to view in tracker */}
                                    {onViewOrderInTracker && (
                                      <button
                                        type="button"
                                        onClick={() => onViewOrderInTracker(order.orderNumber)}
                                        className="text-xs text-[#8C6D37] hover:text-[#6E5528] font-semibold underline flex items-center gap-1 pt-1"
                                      >
                                        Ver vista pública del cliente (Tracker) <ArrowUpRight className="w-3 h-3" />
                                      </button>
                                    )}

                                    {/* Invoice PDF Actions within specs box */}
                                    <div className="pt-2.5 border-t border-[#E8E2D5] mt-2 space-y-1.5">
                                      <span className="text-[10px] uppercase font-bold text-[#736B60] block">
                                        Facturación & Comprobante Oficial (AFIP/B)
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleDownloadInvoice(order)}
                                          disabled={isGeneratingInvoice === order.id}
                                          className="px-3 py-1.5 rounded-lg bg-[#8C6D37] hover:bg-[#73592B] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
                                        >
                                          {isGeneratingInvoice === order.id ? (
                                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                          ) : (
                                            <FileText className="w-3.5 h-3.5" />
                                          )}
                                          <span>Descargar Factura PDF</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handlePreviewInvoice(order)}
                                          className="px-2.5 py-1.5 rounded-lg border border-[#D6CEBE] bg-[#F7F3EB] hover:bg-[#EFE9DE] text-xs font-semibold text-[#1F1C18] flex items-center gap-1 transition-colors"
                                        >
                                          <Eye className="w-3.5 h-3.5 text-[#8C6D37]" />
                                          <span>Ver</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right: Update Status & Tracking */}
                                  <div className="bg-white p-3.5 rounded-xl border border-[#D6CEBE] space-y-3">
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-[#8C6D37] flex items-center gap-1.5">
                                      <RefreshCw className="w-3.5 h-3.5" /> Actualizar Estado de Producción
                                    </h5>

                                    <div>
                                      <label className="block text-[11px] font-semibold text-[#736B60] mb-1">
                                        Etapa Actual de Taller
                                      </label>
                                      <select
                                        value={editingStatus}
                                        onChange={(e) => setEditingStatus(e.target.value as OrderStatusStage)}
                                        className="w-full px-3 py-1.5 rounded-lg border border-[#D6CEBE] text-xs text-[#1F1C18] bg-white focus:ring-1 focus:ring-[#8C6D37]"
                                      >
                                        <option value="en_diseno">1. En Diseño / Revisión Editorial</option>
                                        <option value="en_impresion">2. En Taller / Revelado Químico & Encuadernación</option>
                                        <option value="enviado">3. Despachado / En Reparto Directo Pilar</option>
                                        <option value="entregado">4. Entregado al Cliente</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block text-[11px] font-semibold text-[#736B60] mb-1">
                                        Código de Seguimiento / Guía de Envío
                                      </label>
                                      <input
                                        type="text"
                                        value={editingTracking}
                                        onChange={(e) => setEditingTracking(e.target.value)}
                                        placeholder="ej. CORREO-AR-93821094 o REPARTO-PILAR-01"
                                        className="w-full px-3 py-1.5 rounded-lg border border-[#D6CEBE] text-xs text-[#1F1C18] bg-white focus:ring-1 focus:ring-[#8C6D37]"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[11px] font-semibold text-[#736B60] mb-1">
                                        Notas de Taller (Visibles para el cliente en el tracker)
                                      </label>
                                      <input
                                        type="text"
                                        value={editingLabNotes}
                                        onChange={(e) => setEditingLabNotes(e.target.value)}
                                        placeholder="ej. Curado en prensa 24hs. Grabado oro con tipografía Cormorant."
                                        className="w-full px-3 py-1.5 rounded-lg border border-[#D6CEBE] text-xs text-[#1F1C18] bg-white focus:ring-1 focus:ring-[#8C6D37]"
                                      />
                                    </div>

                                    <div className="flex items-center gap-2 pt-1">
                                      <button
                                        type="button"
                                        onClick={handleSaveOrderStatus}
                                        disabled={isUpdating}
                                        className="px-4 py-2 rounded-lg bg-[#8C6D37] text-white text-xs font-semibold hover:bg-[#73592B] transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                                      >
                                        {isUpdating ? (
                                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                        )}
                                        <span>Guardar y Notificar al Cliente</span>
                                      </button>
                                      
                                      {updateSuccessMsg && (
                                        <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                                          ✓ ¡Estado actualizado con éxito!
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: CONCIERGE REQUESTS ("NOSOTROS LO DISEÑAMOS") */}
              {activeTab === 'concierge' && (
                <div className="space-y-4">
                  <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
                    <div className="text-xs text-indigo-900 leading-relaxed">
                      <strong className="block font-bold mb-0.5 text-indigo-950">Servicio Concierge: Clientes que solicitaron diseño asistido</strong>
                      Aquí recibes los pedidos de clientes que prefieren que el equipo de HALO diseñe el álbum. Puedes acceder directamente a las fotos enviadas por enlace de Google Drive / Dropbox o subidas directamente.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {conciergeRequests.map((req) => (
                      <div key={req.id} className="p-4 rounded-xl border border-[#D6CEBE] bg-white shadow-xs space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              Ocasión: {req.occasion.toUpperCase()}
                            </span>
                            <h4 className="font-serif-luxury font-bold text-base text-[#1F1C18] mt-1">
                              {req.customerName}
                            </h4>
                          </div>
                          <span className="text-xs font-bold text-[#8C6D37]">
                            {formatPriceARS(req.estimatedTotal)} ARS
                          </span>
                        </div>

                        <div className="text-xs text-[#595248] space-y-1 bg-[#FDFCF9] p-3 rounded-lg border border-[#E8E2D5]">
                          <p><strong>Título Portada:</strong> {req.coverTitle}</p>
                          <p><strong>Subtítulo:</strong> {req.coverSubtitle || 'Sin subtítulo'}</p>
                          <p><strong>Estilo Solicitado:</strong> {req.designStyle.toUpperCase()}</p>
                          <p><strong>Cantidad de Fotos Estimadas:</strong> {req.estimatedPhotosCount} fotografías</p>
                          <p><strong>Instrucciones Especiales:</strong> <em>"{req.specialInstructions}"</em></p>
                        </div>

                        {/* Photos Link or direct photos */}
                        {req.cloudLink ? (
                          <a
                            href={req.cloudLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2 px-3 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-xs font-semibold text-blue-800 flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Abrir Fotos en Google Drive / Dropbox</span>
                          </a>
                        ) : req.uploadedPhotos && req.uploadedPhotos.length > 0 ? (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold text-[#736B60] block">
                              Fotos cargadas por el cliente ({req.uploadedPhotos.length}):
                            </span>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {req.uploadedPhotos.map((ph, idx) => (
                                <a
                                  key={idx}
                                  href={ph.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 relative group"
                                >
                                  <img
                                    src={ph.url}
                                    alt={ph.name}
                                    className="w-16 h-16 rounded-lg object-cover border border-[#D6CEBE]"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity">
                                    <Eye className="w-4 h-4 text-white" />
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex items-center gap-2 pt-2 border-t border-[#E8E2D5]">
                          <a
                            href={`https://wa.me/${req.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                              `Hola ${req.customerName}, te contactamos desde HALO Fine Art Lab en Pilar sobre tu solicitud de diseño asistido para tu álbum de ${req.occasion}. ¡Ya tenemos tus fotos listas para diagramar!`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Contactar por WhatsApp</span>
                          </a>

                          <a
                            href={`mailto:${req.customerEmail}`}
                            className="p-2 rounded-lg border border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#595248] transition-colors"
                            title="Enviar Email"
                          >
                            <Mail className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: CLOUD STORAGE & AUTOMATED FOLDERS (GOOGLE DRIVE & MEGA) */}
              {activeTab === 'cloud' && (
                <div className="space-y-6">
                  
                  {/* Top Cloud Overview Banner */}
                  <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-blue-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-500/30 text-blue-200 border border-blue-400/30 text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Cloud className="w-3 h-3 text-blue-300" />
                          Sincronización Cloud Automática
                        </span>
                        <span className="text-xs text-blue-200">Google Drive & MEGA.NZ</span>
                      </div>
                      <h3 className="font-serif-luxury text-xl font-bold text-white">
                        Carpetas Automatizadas de Recepción Fotográfica
                      </h3>
                      <p className="text-xs text-blue-200 max-w-2xl leading-relaxed">
                        Cada pedido cuenta con su carpeta única y enlace directo para que el cliente deposite sus fotografías en resolución original (JPG / RAW / TIFF). El taller en Pilar puede abrir y descargar las fotos sin compresión.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                      <a
                        href={cloudConfig.googleDriveRootUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Cloud className="w-4 h-4" />
                        <span>Abrir Google Drive Master</span>
                      </a>
                      <a
                        href={cloudConfig.megaMasterFolderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                      >
                        <HardDrive className="w-4 h-4" />
                        <span>Abrir MEGA Master</span>
                      </a>
                    </div>
                  </div>

                  {/* Cloud Settings & Provider Preferences */}
                  <div className="bg-white p-5 rounded-2xl border border-[#D6CEBE] shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-serif-luxury font-bold text-base text-[#1F1C18] flex items-center gap-2">
                        <FolderPlus className="w-4 h-4 text-[#8C6D37]" />
                        Configuración de Enlaces del Laboratorio (Google Drive / MEGA)
                      </h4>
                      {cloudConfigSaved && (
                        <span className="text-xs text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Configuración Guardada
                        </span>
                      )}
                    </div>

                    <form onSubmit={handleSaveCloudSettings} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#736B60] mb-1">
                          Carpeta Raíz Google Drive (Master URL)
                        </label>
                        <input
                          type="url"
                          value={cloudConfig.googleDriveRootUrl}
                          onChange={(e) => setCloudConfig({ ...cloudConfig, googleDriveRootUrl: e.target.value })}
                          placeholder="https://drive.google.com/drive/folders/..."
                          className="w-full text-xs px-3 py-2 rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] focus:outline-none focus:border-[#8C6D37]"
                          required
                        />
                        <span className="text-[10px] text-[#A69C8D] mt-0.5 block">
                          URL donde se almacenan las subcarpetas por pedido
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#736B60] mb-1">
                          MEGA.NZ File Drop / Carpeta Maestra
                        </label>
                        <input
                          type="url"
                          value={cloudConfig.megaMasterFolderUrl}
                          onChange={(e) => setCloudConfig({ ...cloudConfig, megaMasterFolderUrl: e.target.value })}
                          placeholder="https://mega.nz/megadrop/..."
                          className="w-full text-xs px-3 py-2 rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] focus:outline-none focus:border-[#8C6D37]"
                          required
                        />
                        <span className="text-[10px] text-[#A69C8D] mt-0.5 block">
                          Buzón MEGA para archivos pesados de gran tamaño
                        </span>
                      </div>

                      <div className="flex flex-col justify-between">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#736B60] mb-1">
                            Proveedor Recomendado al Cliente
                          </label>
                          <select
                            value={cloudConfig.activeProvider}
                            onChange={(e) => setCloudConfig({ ...cloudConfig, activeProvider: e.target.value as any })}
                            className="w-full text-xs px-3 py-2 rounded-xl border border-[#D6CEBE] bg-[#FDFCF9] focus:outline-none focus:border-[#8C6D37]"
                          >
                            <option value="both">Ambos (Google Drive + MEGA.NZ)</option>
                            <option value="google_drive">Google Drive Exclusivo</option>
                            <option value="mega_nz">MEGA.NZ Exclusivo</option>
                          </select>
                        </div>

                        <div className="pt-2">
                          <button
                            type="submit"
                            className="w-full py-2 px-4 rounded-xl bg-[#1F1C18] text-[#ECC880] text-xs font-bold hover:bg-[#3D352E] transition-colors"
                          >
                            Guardar Preferencias de Nube
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>

                  {/* Orders Cloud Table */}
                  <div className="bg-white rounded-2xl border border-[#D6CEBE] overflow-hidden shadow-xs">
                    <div className="px-5 py-4 border-b border-[#E8E2D5] bg-[#F7F3EB] flex items-center justify-between">
                      <div>
                        <h4 className="font-serif-luxury font-bold text-sm sm:text-base text-[#1F1C18]">
                          Listado de Carpetas Cloud por Pedido ({orders.length})
                        </h4>
                        <p className="text-[11px] text-[#736B60]">
                          Acceso instantáneo a carpetas individuales, enlaces para enviar a clientes y estado de recepción de archivos.
                        </p>
                      </div>
                    </div>

                    <div className="divide-y divide-[#E8E2D5] overflow-x-auto">
                      {orders.map((order) => {
                        const cloudFolder = generateAutomatedCloudFolder(order);
                        const whatsAppMsg = generateClientPhotoRequestMessage(order, cloudConfig.activeProvider);

                        return (
                          <div key={order.id} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#FAF8F5] transition-colors">
                            
                            {/* Order Info & Folder Name */}
                            <div className="space-y-1.5 min-w-[280px]">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold bg-[#1F1C18] text-[#ECC880] px-2 py-0.5 rounded">
                                  {order.orderNumber}
                                </span>
                                <span className="text-xs font-bold text-[#1F1C18]">
                                  {order.customerName}
                                </span>
                              </div>

                              <div className="text-xs text-[#595248] flex items-center gap-1.5 font-mono">
                                <span className="text-[#8C6D37]">📁 Carpeta:</span>
                                <code className="bg-[#F4EFE6] px-1.5 py-0.5 rounded text-[11px] text-[#1F1C18] font-bold">
                                  {cloudFolder.folderName}
                                </code>
                              </div>

                              <div className="flex items-center gap-3 text-[11px] text-[#736B60]">
                                <span>{order.items[0]?.formatName || 'Fotolibro'}</span>
                                <span>•</span>
                                <span>{order.photosCount || 0} fotos cargadas en app</span>
                              </div>
                            </div>

                            {/* Status Selector */}
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-[#736B60]">Estado Cloud:</span>
                              <select
                                value={cloudFolder.status}
                                onChange={(e) => handleUpdateCloudStatus(order.id, e.target.value as any)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none ${
                                  cloudFolder.status === 'downloaded_to_lab'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : cloudFolder.status === 'photos_received'
                                    ? 'bg-blue-50 text-blue-800 border-blue-300'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}
                              >
                                <option value="pending_upload">⏳ Esperando Subida Cliente</option>
                                <option value="photos_received">📸 Fotos Recibidas en Nube</option>
                                <option value="downloaded_to_lab">💻 Descargadas al Taller Pilar (Listas)</option>
                              </select>
                            </div>

                            {/* Cloud Direct Links & Actions */}
                            <div className="flex items-center gap-2 flex-wrap">
                              
                              {/* Open Google Drive */}
                              <a
                                href={cloudFolder.googleDriveUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                                title="Abrir carpeta en Google Drive"
                              >
                                <Cloud className="w-3.5 h-3.5 text-blue-700" />
                                <span>Google Drive</span>
                                <ExternalLink className="w-3 h-3 text-blue-500" />
                              </a>

                              {/* Open MEGA */}
                              <a
                                href={cloudFolder.megaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                                title="Abrir buzón en MEGA.NZ"
                              >
                                <HardDrive className="w-3.5 h-3.5 text-red-600" />
                                <span>MEGA.NZ</span>
                                <ExternalLink className="w-3 h-3 text-red-500" />
                              </a>

                              {/* Copy Client Link */}
                              <button
                                type="button"
                                onClick={() => handleCopyClientUploadLink(order)}
                                className="px-3 py-1.5 rounded-lg bg-[#FAF8F5] hover:bg-[#EFE9DE] text-[#1F1C18] border border-[#D6CEBE] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                                title="Copiar enlace directo de subida para enviar al cliente"
                              >
                                {copiedLinkOrderId === order.id ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-emerald-700">¡Link Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 text-[#8C6D37]" />
                                    <span>Copiar Link Cliente</span>
                                  </>
                                )}
                              </button>

                              {/* Send WhatsApp with Cloud Links */}
                              {order.customerPhone && (
                                <a
                                  href={`https://wa.me/${order.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(whatsAppMsg)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                                  title="Enviar mensaje de WhatsApp con los enlaces de subida en alta resolución"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>WhatsApp con Enlaces</span>
                                </a>
                              )}

                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 3: HOW TO DOWNLOAD GUIDE */}
              {activeTab === 'downloads' && (
                <div className="max-w-3xl mx-auto space-y-6 py-2">
                  <div className="bg-white p-6 rounded-2xl border border-[#D6CEBE] shadow-sm space-y-4">
                    <h3 className="font-serif-luxury text-xl font-bold text-[#1F1C18] flex items-center gap-2">
                      <Download className="w-5 h-5 text-[#8C6D37]" />
                      ¿Cómo funciona el flujo de descarga de imágenes en HALO?
                    </h3>
                    
                    <p className="text-xs text-[#595248] leading-relaxed">
                      El sistema está optimizado para que el laboratorio en Pilar reciba las fotografías en resolución original listas para calibrar en perfiles sRGB / AdobeRGB y enviar a revelado químico Fuji o trazadora Fine Art.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      <div className="p-4 rounded-xl bg-[#F7F3EB] border border-[#E8E2D5] space-y-2">
                        <div className="w-8 h-8 rounded-full bg-[#8C6D37] text-white flex items-center justify-center font-bold text-xs">
                          1
                        </div>
                        <h4 className="font-bold text-xs text-[#1F1C18]">Descarga en 1 Clic (ZIP)</h4>
                        <p className="text-[11px] text-[#595248] leading-relaxed">
                          Al presionar el botón <strong>"Descargar ZIP Fotos"</strong> en cada pedido, se empaqueta un archivo ZIP con las fotos originales del cliente numeradas en orden de página.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#F7F3EB] border border-[#E8E2D5] space-y-2">
                        <div className="w-8 h-8 rounded-full bg-[#8C6D37] text-white flex items-center justify-center font-bold text-xs">
                          2
                        </div>
                        <h4 className="font-bold text-xs text-[#1F1C18]">Ficha Técnica del Taller</h4>
                        <p className="text-[11px] text-[#595248] leading-relaxed">
                          Cada ZIP incluye un archivo <code className="bg-white px-1 py-0.5 rounded border text-[10px]">FICHA_TECNICA.txt</code> con formato, tela de lino, tipo de hot stamping y notas para el encuadernador.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#F7F3EB] border border-[#E8E2D5] space-y-2">
                        <div className="w-8 h-8 rounded-full bg-[#8C6D37] text-white flex items-center justify-center font-bold text-xs">
                          3
                        </div>
                        <h4 className="font-bold text-xs text-[#1F1C18]">Almacenamiento Cloud</h4>
                        <p className="text-[11px] text-[#595248] leading-relaxed">
                          En producción con Supabase, las fotos se guardan en el bucket privado <code className="bg-white px-1 py-0.5 rounded border text-[10px]">/orders/ORD-XXX/</code> con acceso seguro para el taller.
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                      <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <strong>Consejo para el revelado en minilab:</strong>
                        <p className="mt-0.5">
                          Para álbumes Layflat 180°, los pliegos se imprimen como páginas dobles panorámicas continuas. El corte y ranurado central se realiza sobre alma plástica rígida de 650g.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </motion.div>

      {/* DELETE ORDER CONFIRMATION MODAL */}
      {orderPendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#FDFCF9] border border-[#D6CEBE] w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="font-serif-luxury text-lg font-bold text-[#1F1C18]">Eliminar Pedido</h3>
            </div>
            <p className="text-sm text-[#595248] leading-relaxed">
              Vas a eliminar definitivamente el pedido <strong>{orderPendingDelete.orderNumber}</strong> ({orderPendingDelete.customerName}). Esta acción no se puede deshacer.
            </p>
            {deleteErrorMsg && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {deleteErrorMsg}
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setOrderPendingDelete(null); setDeleteErrorMsg(null); }}
                disabled={isDeletingOrder}
                className="px-4 py-2 rounded-xl border border-[#D6CEBE] text-xs font-semibold text-[#595248] hover:bg-[#F7F3EB] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteOrder}
                disabled={isDeletingOrder}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isDeletingOrder ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Eliminar Definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVOICE PDF PREVIEW MODAL */}
      {invoicePreviewOrder && invoicePreviewUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-[#FAF8F5] border border-[#D6CEBE] w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            
            {/* Invoice Preview Header */}
            <div className="bg-[#1F1C18] text-[#FDFCF9] px-5 py-3.5 flex items-center justify-between border-b border-[#3D352E]">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-[#ECC880]" />
                <div>
                  <h3 className="font-serif-luxury font-bold text-sm sm:text-base text-[#FDFCF9]">
                    Factura Oficial HALO · {invoicePreviewOrder.orderNumber}
                  </h3>
                  <span className="text-[10px] text-[#A69C8D]">
                    Cliente: {invoicePreviewOrder.customerName} · {formatPriceARS(invoicePreviewOrder.totalPrice)} ARS
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadInvoice(invoicePreviewOrder)}
                  className="px-3 py-1.5 rounded-lg bg-[#8C6D37] hover:bg-[#73592B] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleCloseInvoicePreview}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-[#A69C8D] hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Embedded PDF Viewer */}
            <div className="flex-1 bg-[#525659] p-2 overflow-hidden">
              <iframe
                src={`${invoicePreviewUrl}#toolbar=1&navpanes=0`}
                title={`Factura ${invoicePreviewOrder.orderNumber}`}
                className="w-full h-full rounded-lg border-0 bg-white shadow-inner"
              />
            </div>

            {/* Footer actions */}
            <div className="bg-white px-5 py-2.5 border-t border-[#E8E2D5] flex items-center justify-between text-xs text-[#736B60]">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Comprobante electrónico generado en el cliente con jsPDF
              </span>
              <button
                type="button"
                onClick={handleCloseInvoicePreview}
                className="px-4 py-1.5 rounded-lg border border-[#D6CEBE] bg-[#FAF8F5] hover:bg-[#EFE9DE] font-semibold text-[#1F1C18] text-xs transition-colors"
              >
                Cerrar Vista Previa
              </button>
            </div>

          </div>
        </div>
      )}
    </motion.div>
  );
};
