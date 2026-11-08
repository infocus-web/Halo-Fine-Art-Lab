import React, { useState, Suspense, lazy } from 'react';
import { AnimatePresence } from 'motion/react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { StorytellingBanner } from './components/StorytellingBanner';
import { ProductCatalog } from './components/ProductCatalog';
import { QualityShowcase } from './components/QualityShowcase';
import { ReviewsAndFAQ } from './components/ReviewsAndFAQ';
import { Footer } from './components/Footer';
import { OrderTrackerSection } from './components/OrderTrackerSection';
import { EmailNotificationToast } from './components/EmailNotificationToast';
import type { CartItem } from './components/CartCheckoutModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { loadActiveDraftProject, hydratePhotosFromStorage } from './lib/projectStorage';

// Everything below is a modal that only appears after a user action (open
// the builder, open the cart, open the admin panel, etc). Lazy-loading them
// keeps the heaviest code — PhotobookBuilder (~7k lines), and the jsPDF /
// JSZip powered admin & invoice tooling — out of the bundle everyone
// downloads just to see the landing page.
const FotolibroExpress = lazy(() =>
  import('./components/FotolibroExpress').then((m) => ({ default: m.FotolibroExpress }))
);
const ConciergeDesignModal = lazy(() =>
  import('./components/ConciergeDesignModal').then((m) => ({ default: m.ConciergeDesignModal }))
);
const CartCheckoutModal = lazy(() =>
  import('./components/CartCheckoutModal').then((m) => ({ default: m.CartCheckoutModal }))
);
const OrderTrackerModal = lazy(() =>
  import('./components/OrderTrackerModal').then((m) => ({ default: m.OrderTrackerModal }))
);
const EmailViewerModal = lazy(() =>
  import('./components/EmailViewerModal').then((m) => ({ default: m.EmailViewerModal }))
);
const AuthModal = lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const UserProfileModal = lazy(() =>
  import('./components/UserProfileModal').then((m) => ({ default: m.UserProfileModal }))
);
const AdminWorkshopModal = lazy(() =>
  import('./components/AdminWorkshopModal').then((m) => ({ default: m.AdminWorkshopModal }))
);
const PaymentResultModal = lazy(() =>
  import('./components/PaymentResultModal').then((m) => ({ default: m.PaymentResultModal }))
);
import {
  BookFormatId,
  PhotobookProject, 
  DesignServiceRequest, 
  TrackedOrder, 
  OrderStatusStage,
  EmailNotification 
} from './types';
import { SAMPLE_ORDERS } from './data/mockData';
import { getFotolibroSize, COVER_OPTIONS } from './data/fotolibroCatalog';
import { generateStatusEmail } from './lib/emailNotificationService';
import { Sparkles, MessageCircle, BookOpen, Package, Mail } from 'lucide-react';

// Lightweight placeholder shown for the brief moment a lazy-loaded modal's
// code is still downloading.
function ModalLoadingFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-10 h-10 rounded-full border-2 border-[#ECC880] border-t-transparent animate-spin" />
    </div>
  );
}

function MainAppContent() {
  const { user, profile, isLoggedIn } = useAuth();

  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [builderInitialProject, setBuilderInitialProject] = useState<PhotobookProject | null>(null);
  const [isConciergeOpen, setIsConciergeOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAdminWorkshopOpen, setIsAdminWorkshopOpen] = useState(false);

  const [selectedTrackerOrderId, setSelectedTrackerOrderId] = useState<string>('');
  const [activeSection, setActiveSection] = useState('hero');

  // Mercado Pago return handling (?mp_return=success|pending|failure&order=HALO-XXXXXX).
  // Read once on mount — the full-page redirect to/from Mercado Pago means
  // this is effectively a fresh load of the SPA.
  const [mpReturnState] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const mpReturn = params.get('mp_return');
      const orderCode = params.get('order');
      if (
        (mpReturn === 'success' || mpReturn === 'pending' || mpReturn === 'failure') &&
        orderCode &&
        /^HALO-\d{6}$/.test(orderCode)
      ) {
        // The buyer's email was stashed alongside the order code right
        // before the Mercado Pago redirect (see CartCheckoutModal.tsx) —
        // /api/order-status requires it as a second factor so a guessed
        // order code alone can't pull someone else's order.
        let orderEmail = '';
        try {
          const pending = JSON.parse(localStorage.getItem('halo_pending_mp_order') || 'null');
          if (pending && pending.code === orderCode && typeof pending.email === 'string') {
            orderEmail = pending.email;
          }
        } catch {}
        return { mpReturn: mpReturn as 'success' | 'pending' | 'failure', orderCode, orderEmail };
      }
    } catch {}
    return null;
  });
  const [isPaymentResultOpen, setIsPaymentResultOpen] = useState(Boolean(mpReturnState));

  // Tracked Orders State (User's placed orders persisted locally)
  const [trackedOrders, setTrackedOrders] = useState<TrackedOrder[]>(() => {
    try {
      const saved = localStorage.getItem('halo_user_orders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  // Save placed orders to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('halo_user_orders', JSON.stringify(trackedOrders));
    } catch {}
  }, [trackedOrders]);

  // Email Notification Modal & Toast States
  const [activeToastNotification, setActiveToastNotification] = useState<EmailNotification | null>(null);
  const [selectedEmailModal, setSelectedEmailModal] = useState<{
    notification: EmailNotification;
    order?: TrackedOrder;
  } | null>(null);

  // Cart State (Starts clean at 0 items for real customers)
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('halo_cart_items');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save cart items to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('halo_cart_items', JSON.stringify(cartItems));
    } catch {}
  }, [cartItems]);

  const handleNavigateSection = (sectionId: string) => {
    setActiveSection(sectionId);
    if (sectionId === 'hero') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (sectionId === 'tracker') {
      const elem = document.getElementById('tracker');
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth' });
        return;
      } else {
        setIsTrackerOpen(true);
        return;
      }
    }
    const elem = document.getElementById(sectionId);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOpenBuilderWithProject = async (project?: PhotobookProject) => {
    if (project) {
      if (project.photos && project.photos.length > 0) {
        const hydratedPhotos = await hydratePhotosFromStorage(project.photos);
        setBuilderInitialProject({ ...project, photos: hydratedPhotos });
      } else {
        setBuilderInitialProject(project);
      }
    } else {
      try {
        const draft = await loadActiveDraftProject();
        if (draft && ((draft.photos && draft.photos.length > 0) || (draft.spreads && draft.spreads.length > 0))) {
          setBuilderInitialProject(draft);
        } else {
          setBuilderInitialProject(null);
        }
      } catch {
        setBuilderInitialProject(null);
      }
    }
    setIsBuilderOpen(true);
  };

  const handleAddProjectToCart = (project: PhotobookProject, totalPrice: number) => {
    const album = project.album;
    if (album) {
      const size = getFotolibroSize(album.sizeId);
      const coverName = COVER_OPTIONS.find((o) => o.type === album.coverType && o.finish === album.finish)?.name || 'Fotolibro';
      const sheets = album.spreads.length;
      const giftBox = album.coverType === 'dura' ? true : album.giftBox;
      const fotolibroItem: CartItem = {
        id: `cart-${Date.now()}`,
        type: 'fotolibro',
        title: `Fotolibro ${size?.closedLabel || album.sizeId}${project.title && project.title !== 'Mi fotolibro' ? ` · ${project.title}` : ''}`,
        details: `${coverName} · Laminado ${album.laminate} · ${sheets} hojas (${sheets * 2} páginas)${giftBox ? ' · Con caja' : ''}`,
        price: totalPrice,
        project,
        fotolibroConfig: {
          sizeId: album.sizeId,
          coverType: album.coverType,
          finish: album.finish,
          laminate: album.laminate,
          sheets,
          giftBox,
        },
      };
      setCartItems((prev) => [fotolibroItem, ...prev]);
      setIsBuilderOpen(false);
      setIsCartOpen(true);
      return;
    }
    const newItem: CartItem = {
      id: `cart-${Date.now()}`,
      type: 'custom-album',
      title: `${project.title} (${project.formatId})`,
      details: `Tapa ${project.coverMaterialId} · Grabado ${project.foilColor.toUpperCase()} · ${project.spreads.length * 2} páginas`,
      price: totalPrice,
      project,
    };
    setCartItems((prev) => [newItem, ...prev]);
    setIsBuilderOpen(false);
    setIsCartOpen(true);
  };

  const handleAddToCartDirectly = (item: CartItem) => {
    setCartItems((prev) => [item, ...prev]);
    setIsCartOpen(true);
  };

  const handleAddConciergeRequest = (request: DesignServiceRequest) => {
    const newItem: CartItem = {
      id: `cart-req-${Date.now()}`,
      type: 'concierge-request',
      title: `Servicio Concierge: ${request.coverTitle}`,
      details: `Formato ${request.bookFormatId} · Tapa ${request.coverMaterialId} · ${request.estimatedPages} páginas estimadas`,
      price: request.estimatedTotal,
      request,
    };
    setCartItems((prev) => [newItem, ...prev]);
  };

  const handleOrderPlaced = (newOrder: TrackedOrder) => {
    // Generate initial order confirmation email
    const initialEmail = generateStatusEmail(newOrder, 'en_diseno');
    const orderWithEmail: TrackedOrder = {
      ...newOrder,
      emailNotificationsEnabled: true,
      emailHistory: [initialEmail],
    };

    setTrackedOrders((prev) => [orderWithEmail, ...prev]);
    setSelectedTrackerOrderId(newOrder.id);
    
    // Trigger toast notification
    setActiveToastNotification(initialEmail);
  };

  const handleOpenTrackerForOrder = (orderId?: string) => {
    if (orderId) {
      setSelectedTrackerOrderId(orderId);
    }
    setIsTrackerOpen(true);
  };

  const handleUpdateOrderStatus = (orderId: string, newStage: OrderStatusStage) => {
    setTrackedOrders((prev) => {
      let updatedOrderForToast: TrackedOrder | null = null;
      let generatedEmailForToast: EmailNotification | null = null;

      const newOrders = prev.map((ord) => {
        if (ord.id !== orderId) return ord;
        
        // Update timeline steps dynamically
        const updatedTimeline = ord.timeline.map((step) => {
          if (newStage === 'en_diseno') {
            return {
              ...step,
              completed: false,
              current: step.stage === 'en_diseno',
            };
          } else if (newStage === 'en_impresion') {
            return {
              ...step,
              completed: step.stage === 'en_diseno',
              current: step.stage === 'en_impresion',
            };
          } else if (newStage === 'enviado') {
            return {
              ...step,
              completed: step.stage === 'en_diseno' || step.stage === 'en_impresion',
              current: step.stage === 'enviado',
            };
          } else {
            return {
              ...step,
              completed: true,
              current: false,
            };
          }
        });

        // Generate automated email for status change
        const email = generateStatusEmail({ ...ord, status: newStage }, newStage);
        const existingHistory = ord.emailHistory || [];
        
        const updatedOrder: TrackedOrder = {
          ...ord,
          status: newStage,
          timeline: updatedTimeline,
          emailHistory: [...existingHistory, email],
        };

        updatedOrderForToast = updatedOrder;
        generatedEmailForToast = email;

        return updatedOrder;
      });

      if (generatedEmailForToast) {
        setActiveToastNotification(generatedEmailForToast);
      }

      return newOrders;
    });
  };

  const handleViewEmail = (notification: EmailNotification, order?: TrackedOrder) => {
    const matchedOrder = order || trackedOrders.find((o) => o.orderNumber === notification.orderNumber);
    setSelectedEmailModal({
      notification,
      order: matchedOrder,
    });
  };

  const handlePaymentConfirmed = (order: TrackedOrder) => {
    const initialEmail = generateStatusEmail(order, 'en_diseno');
    const orderWithEmail: TrackedOrder = {
      ...order,
      emailNotificationsEnabled: true,
      emailHistory: [initialEmail],
    };
    setTrackedOrders((prev) => {
      if (prev.some((o) => o.orderNumber === orderWithEmail.orderNumber)) return prev;
      return [orderWithEmail, ...prev];
    });
    setSelectedTrackerOrderId(order.id);
    setCartItems([]);
  };

  const handleClosePaymentResult = () => {
    setIsPaymentResultOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('mp_return');
      url.searchParams.delete('order');
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  const handleRemoveCartItem = (id: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  return (
    <div className="min-h-screen bg-[#FDFCF9] text-[#1F1C18] selection:bg-[#ECC880]/30 selection:text-[#1F1C18] flex flex-col font-sans">
      {/* Ephemeral Toast Notification for Automated Emails */}
      <EmailNotificationToast
        notification={activeToastNotification}
        onClose={() => setActiveToastNotification(null)}
        onViewEmail={(notif) => {
          handleViewEmail(notif);
          setActiveToastNotification(null);
        }}
      />

      {/* Top Main Navigation with User Profile Integration */}
      <Navbar
        onOpenBuilder={() => handleOpenBuilderWithProject()}
        onOpenConcierge={() => setIsConciergeOpen(true)}
        onOpenTracker={() => handleOpenTrackerForOrder()}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        cartCount={cartItems.length}
        onOpenCart={() => setIsCartOpen(true)}
        activeSection={activeSection}
        onNavigateSection={handleNavigateSection}
      />

      {/* Main Page Layout */}
      <main className="flex-1">
        {/* 1. Hero Section matching user's uploaded visual flow */}
        <HeroSection
          onOpenBuilder={() => handleOpenBuilderWithProject()}
          onOpenConcierge={() => setIsConciergeOpen(true)}
          onExploreCatalog={() => handleNavigateSection('catalog')}
        />

        {/* 2. Emotional Storytelling Banner */}
        <StorytellingBanner
          onOpenBuilder={() => handleOpenBuilderWithProject()}
          onOpenConcierge={() => setIsConciergeOpen(true)}
        />

        {/* 3. Products & Formats Catalog */}
        <ProductCatalog
          onSelectFormatToBuild={(formatId) => {
            handleOpenBuilderWithProject();
          }}
          onOpenConcierge={(formatId) => {
            setIsConciergeOpen(true);
          }}
          onAddToCart={handleAddToCartDirectly}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />

        {/* 4. Quality & Photographic Paper Deep Dive */}
        <QualityShowcase />

        {/* 5. Live Order Tracker Section with 4-6 Business Days Status & Email Preview */}
        <OrderTrackerSection
          orders={trackedOrders}
          onOpenTrackerModal={handleOpenTrackerForOrder}
          onViewEmailNotification={(notif, ord) => handleViewEmail(notif, ord)}
          onUpdateOrderStatus={handleUpdateOrderStatus}
        />

        {/* 6. Customer Reviews & FAQ */}
        <ReviewsAndFAQ />
      </main>

      {/* Footer */}
      <Footer
        onOpenBuilder={() => handleOpenBuilderWithProject()}
        onOpenConcierge={() => setIsConciergeOpen(true)}
        onNavigateSection={handleNavigateSection}
        onOpenAdminWorkshop={() => setIsAdminWorkshopOpen(true)}
      />

      {/* Floating Action Buttons for Tracker & WhatsApp Concierge */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2.5">
        <button
          type="button"
          onClick={() => handleOpenTrackerForOrder()}
          className="px-4 py-2.5 rounded-full bg-[#FDFCF9] text-[#1F1C18] text-xs font-semibold shadow-lg hover:bg-[#F4EFE6] flex items-center gap-2 border border-[#D6CEBE] hover:scale-105 transition-all"
        >
          <Package className="w-4 h-4 text-[#8C6D37]" />
          <span>Tracker de Pedido (4-6 días)</span>
        </button>

        <button
          type="button"
          onClick={() => setIsConciergeOpen(true)}
          className="px-5 py-3 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-wider font-semibold shadow-2xl hover:bg-[#3D352E] flex items-center gap-2 border border-[#C5A059]/40 hover:scale-105 transition-all"
        >
          <Sparkles className="w-4 h-4 text-[#ECC880]" />
          <span className="hidden sm:inline">¿Dudas? Nosotros lo Diseñamos</span>
          <span className="sm:hidden">Diseño Asistido</span>
        </button>
      </div>

      {/* Modals with graceful fade/scale entrance & exit transitions */}
      <AnimatePresence mode="wait">
        {/* Interactive Photobook Builder Modal */}
        {isBuilderOpen && (
          <Suspense key="photobook-builder-modal" fallback={<ModalLoadingFallback />}>
            <FotolibroExpress
              initialProject={builderInitialProject}
              onClose={() => {
                setIsBuilderOpen(false);
                setBuilderInitialProject(null);
              }}
              onAddToCart={handleAddProjectToCart}
              onOpenAuth={() => setIsAuthModalOpen(true)}
            />
          </Suspense>
        )}

        {/* Concierge "Nosotros lo Diseñamos" Modal */}
        {isConciergeOpen && (
          <Suspense key="concierge-modal" fallback={<ModalLoadingFallback />}>
            <ConciergeDesignModal
              onClose={() => setIsConciergeOpen(false)}
              onSubmitRequest={handleAddConciergeRequest}
              onOrderPlaced={handleOrderPlaced}
              onOpenTracker={handleOpenTrackerForOrder}
            />
          </Suspense>
        )}

        {/* Shopping Cart & Checkout Modal */}
        {isCartOpen && (
          <Suspense key="cart-checkout-modal" fallback={<ModalLoadingFallback />}>
            <CartCheckoutModal
              cartItems={cartItems}
              onClose={() => setIsCartOpen(false)}
              onRemoveItem={handleRemoveCartItem}
              onClearCart={handleClearCart}
              onOrderPlaced={handleOrderPlaced}
              onOpenTracker={handleOpenTrackerForOrder}
            />
          </Suspense>
        )}

        {/* Order Tracker & History Modal */}
        {isTrackerOpen && (
          <Suspense key="order-tracker-modal" fallback={<ModalLoadingFallback />}>
            <OrderTrackerModal
              orders={trackedOrders}
              selectedOrderId={selectedTrackerOrderId}
              onClose={() => setIsTrackerOpen(false)}
              onSelectOrder={(id) => setSelectedTrackerOrderId(id)}
              onUpdateOrderStatus={handleUpdateOrderStatus}
            />
          </Suspense>
        )}

        {/* Full Email Notification Viewer Modal */}
        {selectedEmailModal && (
          <Suspense key="email-viewer-modal" fallback={<ModalLoadingFallback />}>
            <EmailViewerModal
              notification={selectedEmailModal.notification}
              order={selectedEmailModal.order}
              emailHistory={selectedEmailModal.order?.emailHistory || [selectedEmailModal.notification]}
              onClose={() => setSelectedEmailModal(null)}
              onSelectHistoricalEmail={(histEmail) => {
                setSelectedEmailModal({
                  ...selectedEmailModal,
                  notification: histEmail,
                });
              }}
              onOpenTracker={(ordId) => {
                setSelectedEmailModal(null);
                handleOpenTrackerForOrder(ordId);
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* User Auth Modal (Login / Sign Up / Forgot Password) */}
      {isAuthModalOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            onSuccess={() => {
              setIsAuthModalOpen(false);
              setIsProfileModalOpen(true);
            }}
          />
        </Suspense>
      )}

      {/* User Profile & Projects Account Portal Modal */}
      {isProfileModalOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <UserProfileModal
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            onOpenTrackerForOrder={(orderCode) => {
              handleOpenTrackerForOrder(orderCode);
            }}
            onResumeProject={(project) => {
              handleOpenBuilderWithProject(project);
            }}
            onOpenAuth={() => {
              setIsProfileModalOpen(false);
              setIsAuthModalOpen(true);
            }}
          />
        </Suspense>
      )}

      {/* Admin Workshop & Production Orders Portal */}
      {isAdminWorkshopOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <AdminWorkshopModal
            isOpen={isAdminWorkshopOpen}
            onClose={() => setIsAdminWorkshopOpen(false)}
            onViewOrderInTracker={(orderCode) => {
              setIsAdminWorkshopOpen(false);
              handleOpenTrackerForOrder(orderCode);
            }}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        </Suspense>
      )}

      {/* Mercado Pago return screen (?mp_return=success|pending|failure&order=HALO-XXXXXX) */}
      {mpReturnState && isPaymentResultOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <PaymentResultModal
            mpReturn={mpReturnState.mpReturn}
            orderCode={mpReturnState.orderCode}
            orderEmail={mpReturnState.orderEmail}
            onClose={handleClosePaymentResult}
            onOrderConfirmed={handlePaymentConfirmed}
            onOpenTracker={(orderId) => {
              handleClosePaymentResult();
              handleOpenTrackerForOrder(orderId);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}

