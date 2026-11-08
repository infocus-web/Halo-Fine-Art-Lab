import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Plus, 
  Trash2, 
  Upload, 
  Sparkles, 
  Image as ImageIcon, 
  Type, 
  Layout, 
  Check, 
  Eye, 
  BookOpen, 
  Layers, 
  Gift, 
  RotateCw,
  Maximize2,
  Minimize2,
  FolderOpen,
  Save,
  CheckCircle2,
  Cloud,
  AlertTriangle,
  AlertOctagon,
  Printer,
  Info,
  ZoomIn,
  ZoomOut,
  Sliders,
  Move,
  ArrowLeftRight,
  Grid,
  Copy,
  Scissors,
  Wand2,
  Sparkle,
  Undo2,
  Redo2,
  FlipHorizontal,
  Hand,
  SlidersHorizontal,
  Palette,
  Crop,
  MousePointerClick,
  RotateCcw,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  CheckSquare,
  Square,
  Expand,
  FileCheck2,
  Heading1,
  Heading2,
  Quote,
  Tag,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Scan,
  Maximize,
  Minimize,
  GripVertical,
  GripHorizontal,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { 
  BookFormatId, 
  CoverMaterialId, 
  FoilColor, 
  PaperFinishId, 
  PhotobookProject, 
  PhotobookSpread, 
  PhotobookPage,
  PageLayoutId, 
  PhotoAsset,
  PhotoFilterMode,
  PageSlot,
  CustomTextElement
} from '../types';
import { 
  BOOK_FORMATS, 
  COVER_MATERIALS, 
  FOIL_OPTIONS, 
  PAPER_FINISHES, 
  SAMPLE_PHOTO_PACKS,
  formatPriceARS
} from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { saveUserProject } from '../lib/supabase';
import { getPhotoDisplayUrl, persistProjectLocally, loadActiveDraftProject, hydratePhotosFromStorage } from '../lib/projectStorage';
import { 
  batchProcessPhotoFiles, 
  formatFileSize, 
  getThumbnailSrc, 
  calculatePhotoSavingsSummary 
} from '../lib/imageProcessor';
import { uploadOriginalPhoto } from '../lib/photoStorageService';
import { FineArtQualityModal } from './FineArtQualityModal';

interface PhotobookBuilderProps {
  onClose: () => void;
  onAddToCart: (project: PhotobookProject, totalPrice: number) => void;
  initialProject?: PhotobookProject | null;
  onOpenAuth?: () => void;
}

export const PhotobookBuilder: React.FC<PhotobookBuilderProps> = ({
  onClose,
  onAddToCart,
  initialProject,
  onOpenAuth,
}) => {
  const { user, profile, isLoggedIn } = useAuth();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Current Builder Step
  const [currentStep, setCurrentStep] = useState<'config' | 'format' | 'cover' | 'paper' | 'editor' | 'preview'>('config');

  // Photobook Configuration State
  const [projectId, setProjectId] = useState<string>(initialProject?.id || `proj-${Date.now()}`);
  const [formatId, setFormatId] = useState<BookFormatId>(initialProject?.formatId || 'square-30');
  const [coverMaterialId, setCoverMaterialId] = useState<CoverMaterialId>(initialProject?.coverMaterialId || 'photo-hardcover');
  const [foilColor, setFoilColor] = useState<FoilColor>(initialProject?.foilColor || 'gold');
  const [foilTitleText, setFoilTitleText] = useState(initialProject?.foilTitleText || 'NUESTRA HISTORIA');
  const [foilSubtitleText, setFoilSubtitleText] = useState(initialProject?.foilSubtitleText || 'MEMORIAS INOLVIDABLES · 2026');
  const [hasCoverWindow, setHasCoverWindow] = useState(initialProject?.hasCoverWindow || false);
  const [paperFinishId, setPaperFinishId] = useState<PaperFinishId>(initialProject?.paperFinishId || 'photo-lustre');
  const [giftBoxIncluded, setGiftBoxIncluded] = useState(initialProject?.giftBoxIncluded ?? true);

  // Photos Library
  const [uploadedPhotos, setUploadedPhotos] = useState<PhotoAsset[]>(() => {
    return initialProject?.photos && initialProject.photos.length > 0 
      ? initialProject.photos 
      : [];
  });
  const [selectedPhotoForSlot, setSelectedPhotoForSlot] = useState<string | null>(null);
  const [isOptimizingPhotos, setIsOptimizingPhotos] = useState(false);
  const [optimizingProgress, setOptimizingProgress] = useState<{ current: number; total: number } | null>(null);
  const [inspectedPhotoForQuality, setInspectedPhotoForQuality] = useState<PhotoAsset | null>(null);
  const [qualityFilter, setQualityFilter] = useState<'all' | 'issues' | 'optimal'>('all');

  // Lock background body scroll while builder modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Spreads State (each spread has left and right page - minimum 10 spreads = 20 pages)
  const [spreads, setSpreads] = useState<PhotobookSpread[]>(() => {
    if (initialProject?.spreads && initialProject.spreads.length >= 10) {
      return initialProject.spreads;
    }
    if (initialProject?.spreads && initialProject.spreads.length > 0) {
      const existing = [...initialProject.spreads];
      while (existing.length < 10) {
        const spreadNum = existing.length + 1;
        existing.push({
          id: `spread-pad-${spreadNum}-${Date.now()}`,
          spreadNumber: spreadNum,
          leftPage: {
            id: `p-pad-${spreadNum}-L`,
            layout: 'single-bordered',
            slots: [{ id: `s-pad-${spreadNum}-1` }],
          },
          rightPage: {
            id: `p-pad-${spreadNum}-R`,
            layout: 'two-vertical',
            slots: [{ id: `s-pad-${spreadNum}-2` }, { id: `s-pad-${spreadNum}-3` }],
          }
        });
      }
      return existing;
    }
    return [
      {
        id: 'spread-1',
        spreadNumber: 1,
        leftPage: {
          id: 'p-1',
          layout: 'editorial-text-photo',
          slots: [{ id: 's-1' }],
          customTextHeading: 'Nuestra Historia',
          customTextBody: 'Cada fotografía es un instante detenido en el tiempo que revive las emociones más profundas.',
        },
        rightPage: {
          id: 'p-2',
          layout: 'single-bordered',
          slots: [{ id: 's-2' }],
        }
      },
      {
        id: 'spread-2',
        spreadNumber: 2,
        leftPage: {
          id: 'p-3',
          layout: 'two-vertical',
          slots: [{ id: 's-3' }, { id: 's-4' }],
        },
        rightPage: {
          id: 'p-4',
          layout: 'single-full',
          slots: [{ id: 's-5' }],
        }
      },
      {
        id: 'spread-3',
        spreadNumber: 3,
        leftPage: {
          id: 'p-5',
          layout: 'single-bordered',
          slots: [{ id: 's-6' }],
        },
        rightPage: {
          id: 'p-6',
          layout: 'two-horizontal',
          slots: [{ id: 's-7' }, { id: 's-8-b' }],
        }
      },
      {
        id: 'spread-4',
        spreadNumber: 4,
        leftPage: {
          id: 'p-7',
          layout: 'three-collage',
          slots: [{ id: 's-8' }, { id: 's-9' }, { id: 's-10' }],
        },
        rightPage: {
          id: 'p-8',
          layout: 'two-horizontal',
          slots: [{ id: 's-11' }, { id: 's-12' }],
        }
      },
      {
        id: 'spread-5',
        spreadNumber: 5,
        leftPage: {
          id: 'p-9',
          layout: 'editorial-magazine-polaroid',
          slots: [{ id: 's-13' }, { id: 's-14' }, { id: 's-15' }, { id: 's-16' }],
        },
        rightPage: {
          id: 'p-10',
          layout: 'single-bordered',
          slots: [{ id: 's-17' }],
        }
      },
      {
        id: 'spread-6',
        spreadNumber: 6,
        leftPage: {
          id: 'p-11',
          layout: 'four-grid',
          slots: [{ id: 's-18' }, { id: 's-19' }, { id: 's-20' }, { id: 's-21' }],
        },
        rightPage: {
          id: 'p-12',
          layout: 'two-vertical',
          slots: [{ id: 's-22' }, { id: 's-23' }],
        }
      },
      {
        id: 'spread-7',
        spreadNumber: 7,
        leftPage: {
          id: 'p-13',
          layout: 'botanical-floral-scrapbook',
          slots: [{ id: 's-24' }, { id: 's-25' }, { id: 's-26' }, { id: 's-27' }, { id: 's-28' }],
        },
        rightPage: {
          id: 'p-14',
          layout: 'single-full',
          slots: [{ id: 's-29' }],
        }
      },
      {
        id: 'spread-8',
        spreadNumber: 8,
        leftPage: {
          id: 'p-15',
          layout: 'asymmetric-split',
          slots: [{ id: 's-30' }, { id: 's-31' }, { id: 's-32' }],
        },
        rightPage: {
          id: 'p-16',
          layout: 'three-vertical-triptych',
          slots: [{ id: 's-33' }, { id: 's-34' }, { id: 's-35' }],
        }
      },
      {
        id: 'spread-9',
        spreadNumber: 9,
        leftPage: {
          id: 'p-17',
          layout: 'five-photo-editorial',
          slots: [{ id: 's-36' }, { id: 's-37' }, { id: 's-38' }, { id: 's-39' }, { id: 's-40' }],
        },
        rightPage: {
          id: 'p-18',
          layout: 'single-bordered',
          slots: [{ id: 's-41' }],
        }
      },
      {
        id: 'spread-10',
        spreadNumber: 10,
        leftPage: {
          id: 'p-19',
          layout: 'two-vertical',
          slots: [{ id: 's-42' }, { id: 's-43' }],
        },
        rightPage: {
          id: 'p-20',
          layout: 'editorial-text-photo',
          slots: [{ id: 's-44' }],
          customTextHeading: 'Memorias Eternas',
          customTextBody: 'Guardado para siempre en papel químico Fine Art.',
        }
      }
    ];
  });

  const [activeSpreadIndex, setActiveSpreadIndex] = useState(0);
  const [activePageSide, setActivePageSide] = useState<'left' | 'right'>('left');
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [activeLayoutMenuSide, setActiveLayoutMenuSide] = useState<'left' | 'right' | 'spread' | null>(null);
  const [showSafeMarginGuides, setShowSafeMarginGuides] = useState(true);
  const [activeEditorTab, setActiveEditorTab] = useState<'photos' | 'layouts' | 'text'>('photos');
  const [spreadNotification, setSpreadNotification] = useState<string | null>(null);

  // Zno Designer Toolbar & Customization State
  const [bottomBarMode, setBottomBarMode] = useState<'photos' | 'pages'>('photos');
  const [layoutPhotoFilter, setLayoutPhotoFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5+' | 'panoramic' | 'text'>('all');
  const [spreadBgColor, setSpreadBgColor] = useState<string>('#FDFCFA');
  const [spreadPhotoGap, setSpreadPhotoGap] = useState<number>(8);
  const [showBgColorMenu, setShowBgColorMenu] = useState(false);
  const [showGapMenu, setShowGapMenu] = useState(false);
  const [showAddElementMenu, setShowAddElementMenu] = useState(false);
  const [showFullBleedMenu, setShowFullBleedMenu] = useState(false);
  const [showBorderMenuSlotId, setShowBorderMenuSlotId] = useState<string | null>(null);
  const [showFilterMenuSlotId, setShowFilterMenuSlotId] = useState<string | null>(null);
  const [showSwapPickerSlotId, setShowSwapPickerSlotId] = useState<string | null>(null);

  // Multi-photo selection state
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [lastSelectedPhotoId, setLastSelectedPhotoId] = useState<string | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [photoUsageFilter, setPhotoUsageFilter] = useState<'all' | 'unused' | 'used'>('all');
  const [isCanvasDragOver, setIsCanvasDragOver] = useState<boolean>(false);

  // Pro Studio Workspace Paneling, Zoom & Resizable Guides State
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState<boolean>(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState<boolean>(false);
  const [leftSidebarTab, setLeftSidebarTab] = useState<'photos' | 'spreads'>('photos');
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(310);
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(320);
  const [isDraggingLeftResizer, setIsDraggingLeftResizer] = useState<boolean>(false);
  const [isDraggingRightResizer, setIsDraggingRightResizer] = useState<boolean>(false);
  const [isDraggingTopResizer, setIsDraggingTopResizer] = useState<boolean>(false);
  const [topLayoutsSpacing, setTopLayoutsSpacing] = useState<number>(12);
  const [isPredefinedLayoutsCollapsed, setIsPredefinedLayoutsCollapsed] = useState<boolean>(false);
  const [canvasZoomLevel, setCanvasZoomLevel] = useState<number>(1);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Resize Guide Handlers for Left, Right, and Top Predefined Panels
  const handleZoomIn = () => {
    setCanvasZoomLevel((prev) => {
      const pct = Math.round(prev * 100);
      if (pct < 75) return 0.75;
      if (pct < 90) return 0.90;
      if (pct < 100) return 1.0;
      if (pct < 110) return 1.10;
      if (pct < 125) return 1.25;
      return Math.min(1.5, Number(((pct + 10) / 100).toFixed(2)));
    });
  };

  const handleZoomOut = () => {
    setCanvasZoomLevel((prev) => {
      const pct = Math.round(prev * 100);
      if (pct > 125) return 1.25;
      if (pct > 110) return 1.10;
      if (pct > 100) return 1.0;
      if (pct > 90) return 0.90;
      if (pct > 75) return 0.75;
      return Math.max(0.6, Number(((pct - 10) / 100).toFixed(2)));
    });
  };

  const handleStartResizeTop = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingTopResizer(true);
    const startY = e.clientY;
    const startSpacing = topLayoutsSpacing;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - startY;
      const newSpacing = Math.max(6, Math.min(48, startSpacing + delta));
      setTopLayoutsSpacing(newSpacing);
    };

    const onPointerUp = () => {
      setIsDraggingTopResizer(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleStartResizeLeft = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingLeftResizer(true);
    const startX = e.clientX;
    const startWidth = leftSidebarWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(220, Math.min(540, startWidth + delta));
      setLeftSidebarWidth(newWidth);
      if (isLeftSidebarCollapsed && newWidth > 120) {
        setIsLeftSidebarCollapsed(false);
      }
    };

    const onPointerUp = () => {
      setIsDraggingLeftResizer(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleStartResizeRight = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingRightResizer(true);
    const startX = e.clientX;
    const startWidth = rightSidebarWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX; // moving left expands right panel
      const newWidth = Math.max(240, Math.min(540, startWidth + delta));
      setRightSidebarWidth(newWidth);
      if (isRightSidebarCollapsed && newWidth > 120) {
        setIsRightSidebarCollapsed(false);
      }
    };

    const onPointerUp = () => {
      setIsDraggingRightResizer(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Template 4-Squares [ < ] [ ⊞ ] [ > ] Popover & Hover Preview State
  const [showTemplateGridModal, setShowTemplateGridModal] = useState<boolean>(false);
  const [hoveredLayoutTemplateId, setHoveredLayoutTemplateId] = useState<string | null>(null);
  const [showLayoutsMenu, setShowLayoutsMenu] = useState<boolean>(false);
  const [showTextMenu, setShowTextMenu] = useState<boolean>(false);
  const [coverMaterialCategoryFilter, setCoverMaterialCategoryFilter] = useState<'all' | 'cuero' | 'seda' | 'terciopelo'>('all');
  const [layoutTabMode, setLayoutTabMode] = useState<'page' | 'spread'>('page');

  // Floating text layer state
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextInlineId, setEditingTextInlineId] = useState<string | null>(null);
  const spreadCanvasRef = useRef<HTMLDivElement | null>(null);
  const textDragRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    textId: string;
    hasMoved: boolean;
    containerRect: DOMRect;
  } | null>(null);

  // Interactive Pan / Image Displacement State (Zno Pan Tool)
  const [panningSlotId, setPanningSlotId] = useState<string | null>(null);
  const panDragRef = useRef<{
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    slotId: string;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    hasMoved: boolean;
  } | null>(null);

  // Calculate exact panning boundary limits to ensure the photo always covers the entire frame slot
  // and never exposes any background color of the page.
  const getSlotPanBounds = (
    slot: PageSlot,
    photo?: PhotoAsset,
    slotEl?: HTMLElement | null
  ) => {
    let slotWidth = 300;
    let slotHeight = 300;

    if (slotEl) {
      const rect = slotEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        slotWidth = rect.width;
        slotHeight = rect.height;
      }
    } else if (typeof document !== 'undefined') {
      const el = document.getElementById(`slot-content-${slot.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          slotWidth = rect.width;
          slotHeight = rect.height;
        }
      }
    }

    const scale = Math.max(1, slot.customScale || 1);
    const rot = Math.abs((slot.rotation || 0) % 360);
    const isRotated90 = rot === 90 || rot === 270;

    let natW = photo?.width || slotWidth;
    let natH = photo?.height || slotHeight;

    if (typeof document !== 'undefined') {
      const img = document.getElementById(`slot-img-${slot.id}`) as HTMLImageElement | null;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        natW = img.naturalWidth;
        natH = img.naturalHeight;
      }
    }

    if (isRotated90) {
      const temp = natW;
      natW = natH;
      natH = temp;
    }

    const imgAspect = (natW > 0 && natH > 0) ? natW / natH : 1;
    const slotAspect = slotWidth / (slotHeight || 1);

    let baseW = slotWidth;
    let baseH = slotHeight;

    if (slot.fitMode === 'contain') {
      if (imgAspect >= slotAspect) {
        baseW = slotWidth;
        baseH = slotWidth / imgAspect;
      } else {
        baseH = slotHeight;
        baseW = slotHeight * imgAspect;
      }
    } else {
      // Default 'cover' mode:
      if (imgAspect >= slotAspect) {
        baseH = slotHeight;
        baseW = slotHeight * imgAspect;
      } else {
        baseW = slotWidth;
        baseH = slotWidth / imgAspect;
      }
    }

    const renderW = baseW * scale;
    const renderH = baseH * scale;

    // The maximum offset allowed so the photo edge never slips inside the slot
    const maxPanX = Math.max(0, Math.floor((renderW - slotWidth) / 2));
    const maxPanY = Math.max(0, Math.floor((renderH - slotHeight) / 2));

    return {
      minX: -maxPanX,
      maxX: maxPanX,
      minY: -maxPanY,
      maxY: maxPanY,
      maxPanX,
      maxPanY,
      slotWidth,
      slotHeight,
      baseW,
      baseH,
      renderW,
      renderH,
    };
  };

  // Undo / Redo History Stack (Deshacer / Rehacer con Ctrl+Z y Ctrl+Y)
  const spreadsRef = useRef<PhotobookSpread[]>(spreads);
  useEffect(() => {
    spreadsRef.current = spreads;
  }, [spreads]);

  const historyRef = useRef<PhotobookSpread[][]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Initialize history with initial state on mount
  useEffect(() => {
    if (historyRef.current.length === 0 && spreads.length > 0) {
      const initialSnapshot = JSON.parse(JSON.stringify(spreads));
      historyRef.current = [initialSnapshot];
      historyIndexRef.current = 0;
      setHistoryCount(1);
      setHistoryIndex(0);
    }
  }, []);

  // Synchronize state whenever initialProject changes or load active draft on mount
  useEffect(() => {
    const applyProjectState = async (proj: PhotobookProject) => {
      if (proj.id) setProjectId(proj.id);
      if (proj.formatId) setFormatId(proj.formatId);
      if (proj.coverMaterialId) setCoverMaterialId(proj.coverMaterialId);
      if (proj.foilColor) setFoilColor(proj.foilColor);
      if (proj.foilTitleText !== undefined) setFoilTitleText(proj.foilTitleText);
      if (proj.foilSubtitleText !== undefined) setFoilSubtitleText(proj.foilSubtitleText);
      if (proj.hasCoverWindow !== undefined) setHasCoverWindow(proj.hasCoverWindow);
      if (proj.paperFinishId) setPaperFinishId(proj.paperFinishId);
      if (proj.giftBoxIncluded !== undefined) setGiftBoxIncluded(proj.giftBoxIncluded);
      if (proj.photos && proj.photos.length > 0) {
        const hydratedPhotos = await hydratePhotosFromStorage(proj.photos);
        setUploadedPhotos(hydratedPhotos);
      }
      if (proj.spreads && proj.spreads.length > 0) {
        spreadsRef.current = proj.spreads;
        setSpreads(proj.spreads);
        historyRef.current = [proj.spreads];
        historyIndexRef.current = 0;
        setHistoryCount(1);
        setHistoryIndex(0);
      }
    };

    if (initialProject) {
      applyProjectState(initialProject);
    } else {
      // Check if an existing active draft is available locally
      loadActiveDraftProject()
        .then((draft) => {
          if (draft && ((draft.spreads && draft.spreads.length > 0) || (draft.photos && draft.photos.length > 0))) {
            applyProjectState(draft);
          }
        })
        .catch(() => {});
    }
  }, [initialProject]);

  const [lastAutoSavedTime, setLastAutoSavedTime] = useState<string | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  // Save new state snapshot to history (discards redo forward branch, prevents duplicate states)
  const pushStateToHistory = useCallback((nextSpreads: PhotobookSpread[]) => {
    const currentIdx = historyIndexRef.current;
    const nextHistory = historyRef.current.slice(0, currentIdx + 1);
    const serialized = JSON.stringify(nextSpreads);

    if (nextHistory.length > 0) {
      const lastSerialized = JSON.stringify(nextHistory[nextHistory.length - 1]);
      if (lastSerialized === serialized) {
        return;
      }
    }

    nextHistory.push(JSON.parse(serialized));
    if (nextHistory.length > 50) {
      nextHistory.shift();
    }
    historyRef.current = nextHistory;
    const newIdx = nextHistory.length - 1;
    historyIndexRef.current = newIdx;
    setHistoryCount(nextHistory.length);
    setHistoryIndex(newIdx);
  }, []);

  // Snapshot recording helper (accepts explicit state or falls back to latest ref)
  const recordHistorySnapshot = useCallback((stateToSnapshot?: PhotobookSpread[]) => {
    const targetState = stateToSnapshot || spreadsRef.current;
    pushStateToHistory(targetState);
  }, [pushStateToHistory]);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      const targetIndex = historyIndexRef.current - 1;
      const targetState = historyRef.current[targetIndex];
      if (targetState) {
        historyIndexRef.current = targetIndex;
        setHistoryIndex(targetIndex);
        const restored = JSON.parse(JSON.stringify(targetState));
        spreadsRef.current = restored;
        setSpreads(restored);
      }
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      const targetIndex = historyIndexRef.current + 1;
      const targetState = historyRef.current[targetIndex];
      if (targetState) {
        historyIndexRef.current = targetIndex;
        setHistoryIndex(targetIndex);
        const restored = JSON.parse(JSON.stringify(targetState));
        spreadsRef.current = restored;
        setSpreads(restored);
      }
    }
  }, []);

  // Keyboard shortcuts: Ctrl+Z (Undo), Ctrl+Y / Cmd+Shift+Z (Redo), Arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Undo: Ctrl+Z or Cmd+Z (without Shift)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Ctrl+Shift+Z, Cmd+Shift+Z, Ctrl+Y, Cmd+Y
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y'))
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Deselect all selected photos and elements: Ctrl+D or Cmd+D or Escape
      if (((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) || e.key === 'Escape') {
        e.preventDefault();
        setSelectedPhotoIds([]);
        setSelectedSlotId(null);
        setSelectedTextId(null);
        setShowTemplateGridModal(false);
        setHoveredLayoutTemplateId(null);
        return;
      }

      // Spread Navigation
      if (e.key === 'ArrowLeft') {
        setActiveSpreadIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setActiveSpreadIndex((prev) => Math.min(spreads.length - 1, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, spreads.length]);

  // Interactive Frame Node Resize State & Rotation State
  const [resizingHandle, setResizingHandle] = useState<{
    slotId: string;
    handle: string;
    wDelta: number;
    hDelta: number;
  } | null>(null);

  const [rotatingSlotState, setRotatingSlotState] = useState<{
    slotId: string;
    deg: number;
  } | null>(null);

  // Live Panning Drag Handler for image displacement inside frame with strict boundary clamping
  const handleStartPan = (slot: PageSlot, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPanningSlotId(slot.id);
    const photo = uploadedPhotos.find((p) => p.id === slot.photoId);
    const slotEl = document.getElementById(`slot-content-${slot.id}`);
    const bounds = getSlotPanBounds(slot, photo, slotEl);
    const currentPos = slot.customPosition || { x: 0, y: 0 };
    const initialX = Math.max(bounds.minX, Math.min(bounds.maxX, currentPos.x));
    const initialY = Math.max(bounds.minY, Math.min(bounds.maxY, currentPos.y));

    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX,
      initialY,
      slotId: slot.id,
      bounds,
      hasMoved: false
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!panDragRef.current) return;
      const { bounds } = panDragRef.current;
      const dx = moveEvent.clientX - panDragRef.current.startX;
      const dy = moveEvent.clientY - panDragRef.current.startY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        panDragRef.current.hasMoved = true;
      }
      // Strict boundary check: prevent photo from moving beyond the edges of the frame layout
      const rawX = panDragRef.current.initialX + dx;
      const rawY = panDragRef.current.initialY + dy;
      const newX = Math.max(bounds.minX, Math.min(bounds.maxX, Math.round(rawX)));
      const newY = Math.max(bounds.minY, Math.min(bounds.maxY, Math.round(rawY)));

      setSpreads((prevSpreads) => {
        const activeSpread = prevSpreads[activeSpreadIndex];
        if (!activeSpread) return prevSpreads;

        const updateSlots = (page: any) => ({
          ...page,
          slots: page.slots.map((s: PageSlot) =>
            s.id === panDragRef.current?.slotId ? { ...s, customPosition: { x: newX, y: newY } } : s
          )
        });

        const updatedSpread = {
          ...activeSpread,
          leftPage: updateSlots(activeSpread.leftPage),
          rightPage: updateSlots(activeSpread.rightPage)
        };

        return prevSpreads.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s));
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (panDragRef.current?.hasMoved) {
        pushStateToHistory(spreadsRef.current);
      }
      setPanningSlotId(null);
      panDragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Interactive Frame Node Resize Handler (8 Bounding Box Handles)
  const handleStartResize = (
    slot: PageSlot,
    handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w',
    e: React.PointerEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const initialW = slot.frameWidthDelta || 0;
    const initialH = slot.frameHeightDelta || 0;
    const initialOffX = slot.frameOffsetX || 0;
    const initialOffY = slot.frameOffsetY || 0;

    let hasMoved = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        hasMoved = true;
      }

      let newW = initialW;
      let newH = initialH;
      let newOffX = initialOffX;
      let newOffY = initialOffY;

      if (handle === 'se') {
        newW = initialW + dx;
        newH = initialH + dy;
      } else if (handle === 'e') {
        newW = initialW + dx;
      } else if (handle === 's') {
        newH = initialH + dy;
      } else if (handle === 'sw') {
        newW = initialW - dx;
        newH = initialH + dy;
        newOffX = initialOffX + dx;
      } else if (handle === 'w') {
        newW = initialW - dx;
        newOffX = initialOffX + dx;
      } else if (handle === 'ne') {
        newW = initialW + dx;
        newH = initialH - dy;
        newOffY = initialOffY + dy;
      } else if (handle === 'n') {
        newH = initialH - dy;
        newOffY = initialOffY + dy;
      } else if (handle === 'nw') {
        newW = initialW - dx;
        newH = initialH - dy;
        newOffX = initialOffX + dx;
        newOffY = initialOffY + dy;
      }

      newW = Math.max(-150, Math.min(600, Math.round(newW)));
      newH = Math.max(-150, Math.min(600, Math.round(newH)));
      newOffX = Math.round(newOffX);
      newOffY = Math.round(newOffY);

      setResizingHandle({ slotId: slot.id, handle, wDelta: newW, hDelta: newH });

      setSpreads((prevSpreads) => {
        const activeSpread = prevSpreads[activeSpreadIndex];
        if (!activeSpread) return prevSpreads;

        const updateSlots = (page: any) => ({
          ...page,
          slots: page.slots.map((s: PageSlot) =>
            s.id === slot.id
              ? {
                  ...s,
                  frameWidthDelta: newW,
                  frameHeightDelta: newH,
                  frameOffsetX: newOffX,
                  frameOffsetY: newOffY,
                }
              : s
          ),
        });

        const updatedSpread = {
          ...activeSpread,
          leftPage: updateSlots(activeSpread.leftPage),
          rightPage: updateSlots(activeSpread.rightPage),
        };

        return prevSpreads.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s));
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (hasMoved) {
        recordHistorySnapshot(spreads);
      }
      setResizingHandle(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Interactive Rotation Handler (Drag Top Node)
  const handleStartRotateInteractive = (slot: PageSlot, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const targetEl = document.getElementById(slot.id);
    let centerX = e.clientX;
    let centerY = e.clientY + 50;

    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
    }

    let hasMoved = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - centerX;
      const dy = moveEvent.clientY - centerY;
      hasMoved = true;

      const angleRad = Math.atan2(dy, dx);
      let deg = Math.round((angleRad * 180) / Math.PI) + 90;
      if (deg < 0) deg += 360;
      deg = deg % 360;

      // Snap near angles 0, 45, 90, 135, 180, 225, 270, 315, 360
      for (const snap of [0, 45, 90, 135, 180, 225, 270, 315, 360]) {
        if (Math.abs(deg - snap) <= 4) {
          deg = snap % 360;
          break;
        }
      }

      setRotatingSlotState({ slotId: slot.id, deg });

      setSpreads((prevSpreads) => {
        const activeSpread = prevSpreads[activeSpreadIndex];
        if (!activeSpread) return prevSpreads;

        const updateSlots = (page: any) => ({
          ...page,
          slots: page.slots.map((s: PageSlot) =>
            s.id === slot.id ? { ...s, rotation: deg } : s
          ),
        });

        const updatedSpread = {
          ...activeSpread,
          leftPage: updateSlots(activeSpread.leftPage),
          rightPage: updateSlots(activeSpread.rightPage),
        };

        return prevSpreads.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s));
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (hasMoved) {
        recordHistorySnapshot(spreads);
      }
      setRotatingSlotState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Interactive Frame Move Handler (Move entire frame on page)
  const handleStartFrameMove = (slot: PageSlot, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const initialOffX = slot.frameOffsetX || 0;
    const initialOffY = slot.frameOffsetY || 0;
    let hasMoved = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        hasMoved = true;
      }

      const newOffX = Math.round(initialOffX + dx);
      const newOffY = Math.round(initialOffY + dy);

      setSpreads((prevSpreads) => {
        const activeSpread = prevSpreads[activeSpreadIndex];
        if (!activeSpread) return prevSpreads;

        const updateSlots = (page: any) => ({
          ...page,
          slots: page.slots.map((s: PageSlot) =>
            s.id === slot.id
              ? { ...s, frameOffsetX: newOffX, frameOffsetY: newOffY }
              : s
          ),
        });

        const updatedSpread = {
          ...activeSpread,
          leftPage: updateSlots(activeSpread.leftPage),
          rightPage: updateSlots(activeSpread.rightPage),
        };

        return prevSpreads.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s));
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (hasMoved) {
        recordHistorySnapshot(spreads);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleResetSlotPosition = (slotId: string) => {
    updateActiveSlot(slotId, (slot) => ({
      ...slot,
      customPosition: { x: 0, y: 0 }
    }));
  };

  const handleNudgeSlotPosition = (slotId: string, dx: number, dy: number) => {
    updateActiveSlot(slotId, (slot) => {
      const photo = uploadedPhotos.find((p) => p.id === slot.photoId);
      const bounds = getSlotPanBounds(slot, photo);
      const cur = slot.customPosition || { x: 0, y: 0 };
      const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, cur.x + dx));
      const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, cur.y + dy));
      return {
        ...slot,
        customPosition: { x: clampedX, y: clampedY }
      };
    });
  };

  // Photo Dragging & Drop Slot State
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);

  // File upload reference
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to count how many times a photo is used across all spreads
  const getPhotoUsageCount = (photoId: string): number => {
    let count = 0;
    spreads.forEach((spread) => {
      if (spread.isFullSpreadBleed && spread.fullSpreadPhotoId === photoId) {
        count++;
      }
      spread.leftPage.slots.forEach((s) => {
        if (s.photoId === photoId) count++;
      });
      spread.rightPage.slots.forEach((s) => {
        if (s.photoId === photoId) count++;
      });
    });
    return count;
  };

  // Helper to update a single slot in active spread with history tracking
  const updateActiveSlot = (slotId: string, updater: (slot: PageSlot) => PageSlot) => {
    const activeSpread = spreads[activeSpreadIndex];
    if (!activeSpread) return;

    recordHistorySnapshot(spreads);

    const updatePageSlots = (page: any) => ({
      ...page,
      slots: page.slots.map((s: PageSlot) => (s.id === slotId ? updater(s) : s))
    });

    const updatedSpread: PhotobookSpread = {
      ...activeSpread,
      leftPage: updatePageSlots(activeSpread.leftPage),
      rightPage: updatePageSlots(activeSpread.rightPage),
    };

    setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
  };

  // Zoom / Pan / Rotate / Filter / Flip / Fit handlers for active slot
  const handleSlotZoom = (slotId: string, delta: number) => {
    updateActiveSlot(slotId, (slot) => {
      const currentScale = slot.customScale || 1;
      const nextScale = Math.min(3, Math.max(1, +(currentScale + delta).toFixed(2)));
      const photo = uploadedPhotos.find((p) => p.id === slot.photoId);
      const bounds = getSlotPanBounds({ ...slot, customScale: nextScale }, photo);
      const curX = slot.customPosition?.x || 0;
      const curY = slot.customPosition?.y || 0;
      const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, curX));
      const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, curY));
      return {
        ...slot,
        customScale: nextScale,
        customPosition: { x: clampedX, y: clampedY }
      };
    });
  };

  const handleSlotSetScale = (slotId: string, scale: number) => {
    const nextScale = Math.min(3, Math.max(1, +(scale).toFixed(2)));
    setSpreads((prevSpreads) => {
      const activeSpread = prevSpreads[activeSpreadIndex];
      if (!activeSpread) return prevSpreads;

      const updateSlots = (page: any) => ({
        ...page,
        slots: page.slots.map((s: PageSlot) => {
          if (s.id !== slotId) return s;
          const photo = uploadedPhotos.find((p) => p.id === s.photoId);
          const bounds = getSlotPanBounds({ ...s, customScale: nextScale }, photo);
          const curX = s.customPosition?.x || 0;
          const curY = s.customPosition?.y || 0;
          const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, curX));
          const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, curY));
          return {
            ...s,
            customScale: nextScale,
            customPosition: { x: clampedX, y: clampedY }
          };
        })
      });

      return prevSpreads.map((s, i) =>
        i === activeSpreadIndex
          ? {
              ...s,
              leftPage: updateSlots(s.leftPage),
              rightPage: updateSlots(s.rightPage),
            }
          : s
      );
    });
  };

  const handleSlotSetPositionX = (slotId: string, x: number) => {
    setSpreads((prevSpreads) => {
      const activeSpread = prevSpreads[activeSpreadIndex];
      if (!activeSpread) return prevSpreads;

      const updateSlots = (page: any) => ({
        ...page,
        slots: page.slots.map((s: PageSlot) => {
          if (s.id !== slotId) return s;
          const photo = uploadedPhotos.find((p) => p.id === s.photoId);
          const bounds = getSlotPanBounds(s, photo);
          const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, x));
          const cur = s.customPosition || { x: 0, y: 0 };
          return { ...s, customPosition: { ...cur, x: clampedX } };
        })
      });

      return prevSpreads.map((s, i) =>
        i === activeSpreadIndex
          ? {
              ...s,
              leftPage: updateSlots(s.leftPage),
              rightPage: updateSlots(s.rightPage),
            }
          : s
      );
    });
  };

  const handleSlotSetPositionY = (slotId: string, y: number) => {
    setSpreads((prevSpreads) => {
      const activeSpread = prevSpreads[activeSpreadIndex];
      if (!activeSpread) return prevSpreads;

      const updateSlots = (page: any) => ({
        ...page,
        slots: page.slots.map((s: PageSlot) => {
          if (s.id !== slotId) return s;
          const photo = uploadedPhotos.find((p) => p.id === s.photoId);
          const bounds = getSlotPanBounds(s, photo);
          const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, y));
          const cur = s.customPosition || { x: 0, y: 0 };
          return { ...s, customPosition: { ...cur, y: clampedY } };
        })
      });

      return prevSpreads.map((s, i) =>
        i === activeSpreadIndex
          ? {
              ...s,
              leftPage: updateSlots(s.leftPage),
              rightPage: updateSlots(s.rightPage),
            }
          : s
      );
    });
  };

  const handleSlotSetFrameWidth = (slotId: string, delta: number) => {
    updateActiveSlot(slotId, (slot) => ({ ...slot, frameWidthDelta: delta }));
  };

  const handleSlotSetFrameHeight = (slotId: string, delta: number) => {
    updateActiveSlot(slotId, (slot) => ({ ...slot, frameHeightDelta: delta }));
  };

  const handleSlotSetFrameOffsetX = (slotId: string, offset: number) => {
    updateActiveSlot(slotId, (slot) => ({ ...slot, frameOffsetX: offset }));
  };

  const handleSlotSetFrameOffsetY = (slotId: string, offset: number) => {
    updateActiveSlot(slotId, (slot) => ({ ...slot, frameOffsetY: offset }));
  };

  const handleResetFrameDimensions = (slotId: string) => {
    updateActiveSlot(slotId, (slot) => ({
      ...slot,
      frameWidthDelta: 0,
      frameHeightDelta: 0,
      frameOffsetX: 0,
      frameOffsetY: 0,
    }));
  };

  const handleSlotRotate = (slotId: string) => {
    updateActiveSlot(slotId, (slot) => {
      const currentRot = slot.rotation || 0;
      const nextRot = (currentRot + 90) % 360;
      return { ...slot, rotation: nextRot };
    });
  };

  const handleSlotSetRotation = (slotId: string, rot: number) => {
    updateActiveSlot(slotId, (slot) => ({ ...slot, rotation: rot % 360 }));
  };

  const handleSlotFlipH = (slotId: string) => {
    updateActiveSlot(slotId, (slot) => ({
      ...slot,
      flipH: !slot.flipH
    }));
  };

  const handleSlotFitMode = (slotId: string) => {
    updateActiveSlot(slotId, (slot) => ({
      ...slot,
      fitMode: slot.fitMode === 'contain' ? 'cover' : 'contain'
    }));
  };

  const handleSlotBorder = (slotId: string, borderWidth: number, borderColor = '#FFFFFF') => {
    updateActiveSlot(slotId, (slot) => ({
      ...slot,
      borderWidth,
      borderColor,
      borderRadius: borderWidth > 0 ? 4 : 0
    }));
    setShowBorderMenuSlotId(null);
  };

  const handleSlotFilter = (slotId: string, filter: PhotoFilterMode) => {
    updateActiveSlot(slotId, (slot) => ({ ...slot, filter }));
    setShowFilterMenuSlotId(null);
  };

  const handleRemovePhotoFromSlot = (slotId: string) => {
    updateActiveSlot(slotId, (slot) => ({
      ...slot,
      photoId: undefined,
      customScale: 1,
      customPosition: { x: 0, y: 0 },
      filter: 'none',
      rotation: 0,
      flipH: false
    }));
    setSelectedSlotId(null);
  };

  // Add photo slot dynamically to active page (Zno "Agregar Marco")
  const handleAddPhotoSlotToPage = (side: 'left' | 'right') => {
    const current = spreadsRef.current.length > 0 ? spreadsRef.current : spreads;
    const activeSpread = current[activeSpreadIndex];
    if (!activeSpread) return;

    const targetPage = side === 'left' ? activeSpread.leftPage : activeSpread.rightPage;
    const newSlotId = `slot-add-${Date.now()}`;
    const newSlot: PageSlot = { id: newSlotId };

    const updatedPage = {
      ...targetPage,
      slots: [...targetPage.slots, newSlot]
    };

    const updatedSpread: PhotobookSpread = {
      ...activeSpread,
      [side === 'left' ? 'leftPage' : 'rightPage']: updatedPage
    };

    const nextSpreads = current.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s));
    spreadsRef.current = nextSpreads;
    setSpreads(nextSpreads);
    pushStateToHistory(nextSpreads);
    setSelectedSlotId(newSlotId);
  };

  // Invert left and right pages in current spread (Zno "Voltear")
  const handleFlipSpreadSides = () => {
    const current = spreadsRef.current.length > 0 ? spreadsRef.current : spreads;
    const activeSpread = current[activeSpreadIndex];
    if (!activeSpread) return;

    const updatedSpread: PhotobookSpread = {
      ...activeSpread,
      leftPage: { ...activeSpread.rightPage, id: `p-${Date.now()}-L` },
      rightPage: { ...activeSpread.leftPage, id: `p-${Date.now()}-R` }
    };

    const nextSpreads = current.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s));
    spreadsRef.current = nextSpreads;
    setSpreads(nextSpreads);
    pushStateToHistory(nextSpreads);
  };

  const handleDuplicateSpread = (index: number) => {
    const current = spreadsRef.current.length > 0 ? spreadsRef.current : spreads;
    const spreadToCopy = current[index];
    if (!spreadToCopy) return;

    const newSpread: PhotobookSpread = {
      ...spreadToCopy,
      id: `spread-dup-${Date.now()}`,
      spreadNumber: current.length + 1,
      leftPage: {
        ...spreadToCopy.leftPage,
        id: `p-dup-L-${Date.now()}`,
        slots: spreadToCopy.leftPage.slots.map((s, idx) => ({ ...s, id: `s-dup-L-${Date.now()}-${idx}` }))
      },
      rightPage: {
        ...spreadToCopy.rightPage,
        id: `p-dup-R-${Date.now()}`,
        slots: spreadToCopy.rightPage.slots.map((s, idx) => ({ ...s, id: `s-dup-R-${Date.now()}-${idx}` }))
      }
    };

    const newSpreads = [...current];
    newSpreads.splice(index + 1, 0, newSpread);
    const renumbered = newSpreads.map((s, idx) => ({ ...s, spreadNumber: idx + 1 }));
    spreadsRef.current = renumbered;
    setSpreads(renumbered);
    pushStateToHistory(renumbered);
    setActiveSpreadIndex(index + 1);
  };

  // Swap photos between two slots
  const handleSwapSlots = (slotIdA: string, slotIdB: string) => {
    const current = spreadsRef.current.length > 0 ? spreadsRef.current : spreads;
    const activeSpread = current[activeSpreadIndex];
    if (!activeSpread) return;

    const allSlots = [...activeSpread.leftPage.slots, ...activeSpread.rightPage.slots];
    const slotA = allSlots.find((s) => s.id === slotIdA);
    const slotB = allSlots.find((s) => s.id === slotIdB);
    if (!slotA || !slotB) return;

    const photoA = slotA.photoId;
    const photoB = slotB.photoId;

    const swapInPage = (page: any) => ({
      ...page,
      slots: page.slots.map((s: PageSlot) => {
        if (s.id === slotIdA) return { ...s, photoId: photoB };
        if (s.id === slotIdB) return { ...s, photoId: photoA };
        return s;
      })
    });

    const updatedSpread: PhotobookSpread = {
      ...activeSpread,
      leftPage: swapInPage(activeSpread.leftPage),
      rightPage: swapInPage(activeSpread.rightPage),
    };

    const nextSpreads = current.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s));
    spreadsRef.current = nextSpreads;
    setSpreads(nextSpreads);
    pushStateToHistory(nextSpreads);
  };

  // Calculate pricing
  const currentFormat = BOOK_FORMATS.find((f) => f.id === formatId) || BOOK_FORMATS[0];
  const currentCover = COVER_MATERIALS.find((c) => c.id === coverMaterialId) || COVER_MATERIALS[0];
  const currentPaper = PAPER_FINISHES.find((p) => p.id === paperFinishId) || PAPER_FINISHES[0];
  // "Tapa Dura Fotográfica" prints the client's own photo edge-to-edge as the cover
  const isPhotoCover = currentCover.category === 'fotografica';
  const coverPreviewPhotoUrl = isPhotoCover ? getPhotoDisplayUrl(uploadedPhotos[0]) : null;

  const totalPages = spreads.length * 2;
  const extraPages = Math.max(0, totalPages - currentFormat.basePages);
  const extraSpreads = Math.ceil(extraPages / 2);
  const extraPagesCost = extraSpreads * currentFormat.extraSpreadPrice;
  const giftBoxCost = giftBoxIncluded ? 28000 : 0;
  const coverUpgradeCost = currentCover.priceDelta;
  const paperUpgradeCost = currentPaper.priceDelta;
  const totalPrice = currentFormat.basePrice + extraPagesCost + giftBoxCost + coverUpgradeCost + paperUpgradeCost;

  // Debounced auto-save: syncs to IndexedDB, LocalStorage and Supabase automatically
  useEffect(() => {
    const timer = setTimeout(() => {
      if (spreads && spreads.length > 0) {
        setIsAutoSaving(true);
        const project: PhotobookProject = {
          id: projectId,
          title: foilTitleText || 'Fotolibro Fine Art',
          subtitle: foilSubtitleText,
          formatId,
          coverMaterialId,
          foilColor,
          foilTitleText,
          foilSubtitleText,
          paperFinishId,
          hasCoverWindow,
          photos: uploadedPhotos,
          spreads,
          giftBoxIncluded,
          createdAt: initialProject?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const currentUserId = user?.id || profile?.id || 'local-user';
        saveUserProject(currentUserId, project, totalPrice)
          .then(() => {
            const now = new Date();
            setLastAutoSavedTime(
              `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
            );
          })
          .catch((e) => console.warn('Auto-save notice:', e))
          .finally(() => setIsAutoSaving(false));
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [
    projectId,
    foilTitleText,
    foilSubtitleText,
    formatId,
    coverMaterialId,
    foilColor,
    paperFinishId,
    hasCoverWindow,
    uploadedPhotos,
    spreads,
    giftBoxIncluded,
    totalPrice,
    user?.id,
    profile?.id,
    initialProject?.createdAt,
  ]);

  // Handlers for photos
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray: File[] = Array.from(files);

    setIsOptimizingPhotos(true);
    setOptimizingProgress({ current: 0, total: fileArray.length });

    try {
      const processedAssets = await batchProcessPhotoFiles(
        fileArray,
        { maxDimension: 380, quality: 0.8 },
        (processed, total) => {
          setOptimizingProgress({ current: processed, total });
        }
      );

      // `processedAssets` is index-aligned with `fileArray` (see
      // batchProcessPhotoFiles), so we can zip them to know which original
      // File belongs to which asset for the background Storage upload.
      const currentUserId = user?.id || profile?.id;
      const assetsWithUploadState: PhotoAsset[] = processedAssets.map((asset) => ({
        ...asset,
        uploadStatus: isLoggedIn && currentUserId ? 'pending' : 'skipped',
      }));

      setUploadedPhotos((prev) => [...assetsWithUploadState, ...prev]);

      // Back up each original photo (full resolution) to Supabase Storage in
      // the background so it survives past this browser session and is
      // available later for the HD print export — doesn't block the editor.
      if (isLoggedIn && currentUserId) {
        assetsWithUploadState.forEach((asset, idx) => {
          const originalFile = fileArray[idx];
          if (!originalFile) return;

          setUploadedPhotos((prev) =>
            prev.map((p) => (p.id === asset.id ? { ...p, uploadStatus: 'uploading' } : p))
          );

          uploadOriginalPhoto(currentUserId, projectId, asset.id, originalFile)
            .then(({ storagePath, error }) => {
              setUploadedPhotos((prev) =>
                prev.map((p) =>
                  p.id === asset.id
                    ? {
                        ...p,
                        storagePath: storagePath || undefined,
                        uploadStatus: error ? 'error' : 'uploaded',
                      }
                    : p
                )
              );
              if (error) {
                console.warn(`No se pudo respaldar "${asset.name}" en Supabase Storage:`, error);
              }
            })
            .catch((err) => {
              console.warn(`No se pudo respaldar "${asset.name}" en Supabase Storage:`, err);
              setUploadedPhotos((prev) =>
                prev.map((p) => (p.id === asset.id ? { ...p, uploadStatus: 'error' } : p))
              );
            });
        });
      }
    } catch (err) {
      console.error('Error processing uploaded photos:', err);
    } finally {
      setIsOptimizingPhotos(false);
      setOptimizingProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLoadSamplePack = (packKey: 'boda' | 'familia' | 'viaje') => {
    const pack = SAMPLE_PHOTO_PACKS[packKey];
    if (!pack) return;
    setUploadedPhotos(pack.photos);
  };

  // Photo removal handlers
  const handleDeletePhoto = (photoId: string) => {
    setUploadedPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setSelectedPhotoIds((prev) => prev.filter((id) => id !== photoId));
    setSpreads((prevSpreads) => {
      const updated = prevSpreads.map((s) => ({
        ...s,
        fullSpreadPhotoId: s.fullSpreadPhotoId === photoId ? undefined : s.fullSpreadPhotoId,
        leftPage: {
          ...s.leftPage,
          slots: s.leftPage.slots.map((slot) => (slot.photoId === photoId ? { ...slot, photoId: undefined } : slot)),
        },
        rightPage: {
          ...s.rightPage,
          slots: s.rightPage.slots.map((slot) => (slot.photoId === photoId ? { ...slot, photoId: undefined } : slot)),
        },
      }));
      spreadsRef.current = updated;
      pushStateToHistory(updated);
      return updated;
    });
    setSpreadNotification("Foto eliminada de la galería.");
    setTimeout(() => setSpreadNotification(null), 2500);
  };

  const handleDeleteSelectedPhotos = () => {
    if (selectedPhotoIds.length === 0) return;
    const count = selectedPhotoIds.length;
    const idsToDelete = new Set(selectedPhotoIds);

    setUploadedPhotos((prev) => prev.filter((p) => !idsToDelete.has(p.id)));
    setSelectedPhotoIds([]);

    setSpreads((prevSpreads) => {
      const updated = prevSpreads.map((s) => ({
        ...s,
        fullSpreadPhotoId: s.fullSpreadPhotoId && idsToDelete.has(s.fullSpreadPhotoId) ? undefined : s.fullSpreadPhotoId,
        leftPage: {
          ...s.leftPage,
          slots: s.leftPage.slots.map((slot) => (slot.photoId && idsToDelete.has(slot.photoId) ? { ...slot, photoId: undefined } : slot)),
        },
        rightPage: {
          ...s.rightPage,
          slots: s.rightPage.slots.map((slot) => (slot.photoId && idsToDelete.has(slot.photoId) ? { ...slot, photoId: undefined } : slot)),
        },
      }));
      spreadsRef.current = updated;
      pushStateToHistory(updated);
      return updated;
    });

    setSpreadNotification(`${count} fotos eliminadas de la galería.`);
    setTimeout(() => setSpreadNotification(null), 2500);
  };

  const handleClearAllPhotos = () => {
    if (uploadedPhotos.length === 0) return;
    const count = uploadedPhotos.length;
    setUploadedPhotos([]);
    setSelectedPhotoIds([]);
    setSpreads((prevSpreads) => {
      const updated = prevSpreads.map((s) => ({
        ...s,
        fullSpreadPhotoId: undefined,
        leftPage: {
          ...s.leftPage,
          slots: s.leftPage.slots.map((slot) => ({ ...slot, photoId: undefined })),
        },
        rightPage: {
          ...s.rightPage,
          slots: s.rightPage.slots.map((slot) => ({ ...slot, photoId: undefined })),
        },
      }));
      spreadsRef.current = updated;
      pushStateToHistory(updated);
      return updated;
    });
    setSpreadNotification(`Galería vaciada (${count} fotos eliminadas).`);
    setTimeout(() => setSpreadNotification(null), 2500);
  };

  // Spread manipulations
  const handleAddSpread = () => {
    const current = spreadsRef.current.length > 0 ? spreadsRef.current : spreads;
    const newSpreadNumber = current.length + 1;
    const newSpread: PhotobookSpread = {
      id: `spread-${Date.now()}`,
      spreadNumber: newSpreadNumber,
      leftPage: {
        id: `p-${Date.now()}-L`,
        layout: 'single-bordered',
        slots: [{ id: `s-${Date.now()}-1` }],
      },
      rightPage: {
        id: `p-${Date.now()}-R`,
        layout: 'two-vertical',
        slots: [{ id: `s-${Date.now()}-2` }, { id: `s-${Date.now()}-3` }],
      }
    };
    const nextSpreads = [...current, newSpread];
    spreadsRef.current = nextSpreads;
    setSpreads(nextSpreads);
    pushStateToHistory(nextSpreads);
    setActiveSpreadIndex(nextSpreads.length - 1);
  };

  const handleDeleteSpread = (index: number) => {
    const current = spreadsRef.current.length > 0 ? spreadsRef.current : spreads;
    if (current.length <= 1) {
      setSpreadNotification("El fotolibro debe contener al menos 1 pliego (2 páginas).");
      setTimeout(() => setSpreadNotification(null), 3500);
      return;
    }
    const filtered = current.filter((_, i) => i !== index);
    // re-number
    const renumbered = filtered.map((s, idx) => ({ ...s, spreadNumber: idx + 1 }));
    spreadsRef.current = renumbered;
    setSpreads(renumbered);
    pushStateToHistory(renumbered);
    setActiveSpreadIndex(Math.max(0, Math.min(index, renumbered.length - 1)));
    setSpreadNotification(`Pliego ${index + 1} eliminado correctamente.`);
    setTimeout(() => setSpreadNotification(null), 3000);
  };

  // Change page layout
  const handleChangePageLayout = (side: 'left' | 'right', newLayout: PageLayoutId) => {
    const activeSpread = spreads[activeSpreadIndex];
    if (!activeSpread) return;

    let newSlots = [{ id: `slot-${Date.now()}-1` }];
    if (newLayout === 'two-vertical' || newLayout === 'two-horizontal') {
      newSlots = [
        { id: `slot-${Date.now()}-1` },
        { id: `slot-${Date.now()}-2` }
      ];
    } else if (newLayout === 'three-collage' || newLayout === 'asymmetric-split' || newLayout === 'three-vertical-triptych') {
      newSlots = [
        { id: `slot-${Date.now()}-1` },
        { id: `slot-${Date.now()}-2` },
        { id: `slot-${Date.now()}-3` }
      ];
    } else if (newLayout === 'four-grid' || newLayout === 'editorial-magazine-polaroid') {
      newSlots = [
        { id: `slot-${Date.now()}-1` },
        { id: `slot-${Date.now()}-2` },
        { id: `slot-${Date.now()}-3` },
        { id: `slot-${Date.now()}-4` }
      ];
    } else if (newLayout === 'five-photo-editorial' || newLayout === 'botanical-floral-scrapbook') {
      newSlots = [
        { id: `slot-${Date.now()}-1` },
        { id: `slot-${Date.now()}-2` },
        { id: `slot-${Date.now()}-3` },
        { id: `slot-${Date.now()}-4` },
        { id: `slot-${Date.now()}-5` }
      ];
    } else if (newLayout === 'moodboard-mosaic-9') {
      newSlots = Array.from({ length: 9 }, (_, i) => ({ id: `slot-${Date.now()}-${i + 1}` }));
    } else if (newLayout === 'lifestyle-bento-10') {
      newSlots = Array.from({ length: 10 }, (_, i) => ({ id: `slot-${Date.now()}-${i + 1}` }));
    } else if (newLayout === 'full-bleed-spread') {
      // Makes both pages full bleed with one photo
      const updatedSpread: PhotobookSpread = {
        ...activeSpread,
        isFullSpreadBleed: true,
        fullSpreadPhotoId: uploadedPhotos[0]?.id,
        leftPage: { ...activeSpread.leftPage, layout: 'full-bleed-spread' },
        rightPage: { ...activeSpread.rightPage, layout: 'full-bleed-spread' },
      };
      setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
      setActiveLayoutMenuSide(null);
      return;
    }

    const updatedSpread: PhotobookSpread = {
      ...activeSpread,
      isFullSpreadBleed: false,
      [side === 'left' ? 'leftPage' : 'rightPage']: {
        ...activeSpread[side === 'left' ? 'leftPage' : 'rightPage'],
        layout: newLayout,
        slots: newSlots,
      }
    };

    setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
    setActiveLayoutMenuSide(null);
  };

  // Assign photo to slot
  const handleAssignPhotoToSlot = (slotId: string, photoId: string) => {
    const activeSpread = spreads[activeSpreadIndex];
    if (!activeSpread) return;

    recordHistorySnapshot(spreads);

    const updateSideSlots = (page: any) => ({
      ...page,
      slots: page.slots.map((s: any) => (s.id === slotId ? { ...s, photoId } : s))
    });

    const updatedSpread: PhotobookSpread = {
      ...activeSpread,
      leftPage: updateSideSlots(activeSpread.leftPage),
      rightPage: updateSideSlots(activeSpread.rightPage),
    };

    setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
    setSelectedSlotId(slotId);
  };

  // Smart Auto Fill
  const handleAutoLayout = () => {
    if (uploadedPhotos.length === 0) return;
    recordHistorySnapshot(spreads);

    let photoIdx = 0;
    const newSpreads: PhotobookSpread[] = [];
    // Always create at least 10 spreads (20 pages) for the artisan photobook minimum binding
    const spreadCount = Math.max(10, Math.ceil(uploadedPhotos.length / 3));

    for (let i = 0; i < spreadCount; i++) {
      const p1 = uploadedPhotos[photoIdx % uploadedPhotos.length];
      const p2 = uploadedPhotos[(photoIdx + 1) % uploadedPhotos.length];
      const p3 = uploadedPhotos[(photoIdx + 2) % uploadedPhotos.length];
      photoIdx += 3;

      newSpreads.push({
        id: `spread-auto-${i + 1}`,
        spreadNumber: i + 1,
        leftPage: {
          id: `p-${i}-L`,
          layout: i === 0 ? 'editorial-text-photo' : i % 2 === 0 ? 'single-bordered' : 'two-vertical',
          slots: [
            { id: `s-${i}-1`, photoId: p1?.id },
            { id: `s-${i}-2`, photoId: p2?.id }
          ],
          customTextHeading: i === 0 ? foilTitleText : undefined,
          customTextBody: i === 0 ? 'Cada página guarda un instante irrepetible.' : undefined,
        },
        rightPage: {
          id: `p-${i}-R`,
          layout: i % 2 === 0 ? 'two-vertical' : 'single-full',
          slots: [
            { id: `s-${i}-3`, photoId: p3?.id }
          ],
        }
      });
    }

    setSpreads(newSpreads);
    setActiveSpreadIndex(0);
    setSpreadNotification(`✨ Auto Fill completado: ${uploadedPhotos.length} fotos distribuidas en ${spreadCount} pliegos (${spreadCount * 2} páginas).`);
    setTimeout(() => setSpreadNotification(null), 4000);
  };

  const handleAutoPopulateSpreads = handleAutoLayout;

  // Background color changer with persistence per spread & global apply
  const handleSetSpreadBgColor = (color: string, applyToAll = false) => {
    recordHistorySnapshot(spreads);
    setSpreadBgColor(color);
    setSpreads((prev) =>
      prev.map((s, i) => {
        if (applyToAll || i === activeSpreadIndex) {
          return {
            ...s,
            backgroundColor: color,
            leftPage: { ...s.leftPage, backgroundColor: color },
            rightPage: { ...s.rightPage, backgroundColor: color },
          };
        }
        return s;
      })
    );
    setShowBgColorMenu(false);
  };

  // Full-bleed / Zero-margin toggle to force photos to touch spread edges (Sin Bordes)
  const handleToggleSpreadFlushMargin = (allSpreads = false) => {
    recordHistorySnapshot(spreads);
    if (allSpreads) {
      setSpreads((prev) =>
        prev.map((s) => ({
          ...s,
          isFlushMargin: true,
          leftPage: {
            ...s.leftPage,
            layout: s.leftPage.layout === 'single-bordered' ? 'single-full' : s.leftPage.layout,
            slots: s.leftPage.slots.map((sl) => ({ ...sl, fitMode: 'cover', borderWidth: 0 })),
          },
          rightPage: {
            ...s.rightPage,
            layout: s.rightPage.layout === 'single-bordered' ? 'single-full' : s.rightPage.layout,
            slots: s.rightPage.slots.map((sl) => ({ ...sl, fitMode: 'cover', borderWidth: 0 })),
          },
        }))
      );
      setSpreadPhotoGap(0);
    } else {
      setSpreads((prev) =>
        prev.map((s, i) => {
          if (i !== activeSpreadIndex) return s;
          const nextFlush = !s.isFlushMargin;
          return {
            ...s,
            isFlushMargin: nextFlush,
            leftPage: {
              ...s.leftPage,
              layout: nextFlush && s.leftPage.layout === 'single-bordered' ? 'single-full' : s.leftPage.layout,
              slots: s.leftPage.slots.map((sl) => ({ ...sl, fitMode: 'cover', borderWidth: 0 })),
            },
            rightPage: {
              ...s.rightPage,
              layout: nextFlush && s.rightPage.layout === 'single-bordered' ? 'single-full' : s.rightPage.layout,
              slots: s.rightPage.slots.map((sl) => ({ ...sl, fitMode: 'cover', borderWidth: 0 })),
            },
          };
        })
      );
    }
    setShowFullBleedMenu(false);
  };

  // Multi-Photo Selection Handlers with Shift+Click range selection and Ctrl/Cmd+Click
  const handleTogglePhotoSelection = (photoId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // If slot is selected on canvas and no modifier key is pressed, assign directly
    if (selectedSlotId && e && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      handleAssignPhotoToSlot(selectedSlotId, photoId);
      return;
    }

    // Visible photo list according to active quality filter
    const visiblePhotos = uploadedPhotos.filter((photo) => {
      if (qualityFilter === 'issues') return photo.preflight?.rating === 'advertencia' || photo.preflight?.rating === 'insuficiente';
      if (qualityFilter === 'optimal') return photo.preflight?.rating === 'optima';
      return true;
    });
    const visibleIds = visiblePhotos.map((p) => p.id);
    const clickedIndex = visibleIds.indexOf(photoId);

    // Shift + Click: Select range between lastSelectedPhotoId and clicked photo
    if (e?.shiftKey && lastSelectedPhotoId && visibleIds.includes(lastSelectedPhotoId)) {
      const lastIndex = visibleIds.indexOf(lastSelectedPhotoId);
      const start = Math.min(lastIndex, clickedIndex);
      const end = Math.max(lastIndex, clickedIndex);
      const rangeIds = visibleIds.slice(start, end + 1);

      setSelectedPhotoIds((prev) => {
        const combined = new Set(prev);
        rangeIds.forEach((id) => combined.add(id));
        return Array.from(combined);
      });
      return;
    }

    // Normal Click or Ctrl/Cmd + Click: Toggle selection
    setSelectedPhotoIds((prev) => {
      const isAlreadySelected = prev.includes(photoId);
      if (isAlreadySelected) {
        return prev.filter((id) => id !== photoId);
      } else {
        return [...prev, photoId];
      }
    });
    setLastSelectedPhotoId(photoId);
  };

  const handleSelectAllPhotos = () => {
    const visiblePhotos = uploadedPhotos.filter((photo) => {
      if (qualityFilter === 'issues') return photo.preflight?.rating === 'advertencia' || photo.preflight?.rating === 'insuficiente';
      if (qualityFilter === 'optimal') return photo.preflight?.rating === 'optima';
      return true;
    });
    setSelectedPhotoIds(visiblePhotos.map((p) => p.id));
  };

  const handleDeselectAllPhotos = () => {
    setSelectedPhotoIds([]);
    setLastSelectedPhotoId(null);
  };

  // Volcar Fotos Seleccionadas en la Plantilla / Pliego Activo (Smart Dump to Spread)
  const handleDumpSelectedPhotosToCurrentSpread = (targetSide: 'spread' | 'left' | 'right' = 'spread') => {
    const photosToDump = selectedPhotoIds.length > 0
      ? uploadedPhotos.filter((p) => selectedPhotoIds.includes(p.id))
      : uploadedPhotos;

    if (photosToDump.length === 0) return;
    recordHistorySnapshot(spreads);

    const activeSpread = spreads[activeSpreadIndex];
    if (!activeSpread) return;

    if (targetSide === 'left') {
      const count = photosToDump.length;
      let layout: PageLayoutId = 'single-full';
      if (count === 1) layout = 'single-full';
      else if (count === 2) layout = 'two-vertical';
      else if (count === 3) layout = 'three-collage';
      else layout = 'four-grid';

      const slots: PageSlot[] = photosToDump.map((p, idx) => ({
        id: `slot-L-${Date.now()}-${idx}`,
        photoId: p.id,
        fitMode: 'cover',
      }));

      const updatedSpread: PhotobookSpread = {
        ...activeSpread,
        isFullSpreadBleed: false,
        leftPage: {
          ...activeSpread.leftPage,
          layout,
          slots,
        },
      };
      setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
      return;
    }

    if (targetSide === 'right') {
      const count = photosToDump.length;
      let layout: PageLayoutId = 'single-full';
      if (count === 1) layout = 'single-full';
      else if (count === 2) layout = 'two-vertical';
      else if (count === 3) layout = 'three-collage';
      else layout = 'four-grid';

      const slots: PageSlot[] = photosToDump.map((p, idx) => ({
        id: `slot-R-${Date.now()}-${idx}`,
        photoId: p.id,
        fitMode: 'cover',
      }));

      const updatedSpread: PhotobookSpread = {
        ...activeSpread,
        isFullSpreadBleed: false,
        rightPage: {
          ...activeSpread.rightPage,
          layout,
          slots,
        },
      };
      setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
      return;
    }

    // Default: Dump across entire active spread (both left and right pages)
    const count = photosToDump.length;

    if (count === 1) {
      // 1 photo: Full bleed or fill first slot
      const updatedSpread: PhotobookSpread = {
        ...activeSpread,
        leftPage: {
          ...activeSpread.leftPage,
          slots: [{ id: `s-L-${Date.now()}`, photoId: photosToDump[0].id, fitMode: 'cover' }],
        },
      };
      setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
    } else if (count === 2) {
      // 2 photos: 1 on Left, 1 on Right
      const updatedSpread: PhotobookSpread = {
        ...activeSpread,
        isFullSpreadBleed: false,
        leftPage: {
          ...activeSpread.leftPage,
          layout: 'single-full',
          slots: [{ id: `s-L-${Date.now()}`, photoId: photosToDump[0].id, fitMode: 'cover' }],
        },
        rightPage: {
          ...activeSpread.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}`, photoId: photosToDump[1].id, fitMode: 'cover' }],
        },
      };
      setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
    } else if (count === 3) {
      // 3 photos: 2 on Left (two-vertical), 1 on Right (single-full)
      const updatedSpread: PhotobookSpread = {
        ...activeSpread,
        isFullSpreadBleed: false,
        leftPage: {
          ...activeSpread.leftPage,
          layout: 'two-vertical',
          slots: [
            { id: `s-L1-${Date.now()}`, photoId: photosToDump[0].id, fitMode: 'cover' },
            { id: `s-L2-${Date.now()}`, photoId: photosToDump[1].id, fitMode: 'cover' },
          ],
        },
        rightPage: {
          ...activeSpread.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R1-${Date.now()}`, photoId: photosToDump[2].id, fitMode: 'cover' }],
        },
      };
      setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
    } else if (count === 4) {
      // 4 photos: 2 on Left, 2 on Right
      const updatedSpread: PhotobookSpread = {
        ...activeSpread,
        isFullSpreadBleed: false,
        leftPage: {
          ...activeSpread.leftPage,
          layout: 'two-vertical',
          slots: [
            { id: `s-L1-${Date.now()}`, photoId: photosToDump[0].id, fitMode: 'cover' },
            { id: `s-L2-${Date.now()}`, photoId: photosToDump[1].id, fitMode: 'cover' },
          ],
        },
        rightPage: {
          ...activeSpread.rightPage,
          layout: 'two-vertical',
          slots: [
            { id: `s-R1-${Date.now()}`, photoId: photosToDump[2].id, fitMode: 'cover' },
            { id: `s-R2-${Date.now()}`, photoId: photosToDump[3].id, fitMode: 'cover' },
          ],
        },
      };
      setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
    } else {
      // 5+ photos: Distribute evenly across Left and Right pages
      const leftCount = Math.ceil(count / 2);
      const rightCount = count - leftCount;

      const leftSlots: PageSlot[] = photosToDump.slice(0, leftCount).map((p, idx) => ({
        id: `s-L-${Date.now()}-${idx}`,
        photoId: p.id,
        fitMode: 'cover',
      }));
      const rightSlots: PageSlot[] = photosToDump.slice(leftCount).map((p, idx) => ({
        id: `s-R-${Date.now()}-${idx}`,
        photoId: p.id,
        fitMode: 'cover',
      }));

      const updatedSpread: PhotobookSpread = {
        ...activeSpread,
        isFullSpreadBleed: false,
        leftPage: {
          ...activeSpread.leftPage,
          layout: leftCount <= 2 ? 'two-vertical' : leftCount === 3 ? 'three-collage' : 'four-grid',
          slots: leftSlots,
        },
        rightPage: {
          ...activeSpread.rightPage,
          layout: rightCount <= 2 ? 'two-vertical' : rightCount === 3 ? 'three-collage' : 'four-grid',
          slots: rightSlots,
        },
      };
      setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
    }
  };

  // Smart Auto Populate with Selected Photos into new spreads
  const handleAutoPopulateWithSelected = (onlyCurrentSpread = false) => {
    if (onlyCurrentSpread) {
      handleDumpSelectedPhotosToCurrentSpread('spread');
      return;
    }

    const photosToUse = selectedPhotoIds.length > 0 
      ? uploadedPhotos.filter((p) => selectedPhotoIds.includes(p.id))
      : uploadedPhotos;

    if (photosToUse.length === 0) return;
    recordHistorySnapshot(spreads);

    let photoIdx = 0;
    const newSpreads: PhotobookSpread[] = [];
    const spreadCount = Math.max(1, Math.ceil(photosToUse.length / 3));

    for (let i = 0; i < spreadCount; i++) {
      const remaining = photosToUse.length - photoIdx;
      const countForSpread = Math.min(3, remaining);
      const p1 = photosToUse[photoIdx % photosToUse.length];
      const p2 = countForSpread >= 2 ? photosToUse[(photoIdx + 1) % photosToUse.length] : undefined;
      const p3 = countForSpread >= 3 ? photosToUse[(photoIdx + 2) % photosToUse.length] : undefined;
      photoIdx += countForSpread;

      newSpreads.push({
        id: `spread-auto-${Date.now()}-${i + 1}`,
        spreadNumber: i + 1,
        backgroundColor: spreadBgColor,
        leftPage: {
          id: `p-${i}-L`,
          layout: p2 ? 'two-vertical' : 'single-full',
          slots: p2 
            ? [{ id: `s-${i}-1`, photoId: p1?.id }, { id: `s-${i}-2`, photoId: p2?.id }]
            : [{ id: `s-${i}-1`, photoId: p1?.id }],
          customTextHeading: i === 0 ? foilTitleText : undefined,
          customTextBody: i === 0 ? 'Cada página guarda un instante irrepetible.' : undefined,
        },
        rightPage: {
          id: `p-${i}-R`,
          layout: 'single-full',
          slots: [{ id: `s-${i}-3`, photoId: p3?.id || p1?.id }],
        }
      });
    }

    setSpreads(newSpreads);
    setActiveSpreadIndex(0);
  };

  // Predefined spread templates for [ < ] [ ⊞ ] [ > ] Popover & Real-Time Hover Preview
  interface SpreadTemplatePreset {
    id: string;
    title: string;
    subtitle: string;
    category: 'all' | '1' | '2' | '3' | '4' | '5+' | 'panoramic' | 'editorial';
    photoCount: number;
    badge?: string;
    apply: (source: PhotobookSpread, photos: string[]) => PhotobookSpread;
    renderDiagram: () => React.ReactNode;
  }

  const SPREAD_TEMPLATE_PRESETS: SpreadTemplatePreset[] = [
    {
      id: 'panoramic-spread',
      title: 'Panorámica 180°',
      subtitle: '1 Foto Continua en Todo el Pliego',
      category: 'panoramic',
      photoCount: 1,
      badge: 'Panorámica',
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: true,
        fullSpreadPhotoId: photos[0] || source.fullSpreadPhotoId || uploadedPhotos[0]?.id || '',
      }),
      renderDiagram: () => (
        <div className="w-full h-full bg-[#FAF7F2] p-0.5 flex items-center justify-center border border-[#8C6D37]/40 rounded">
          <div className="w-full h-full bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs flex items-center justify-center">
            <span className="text-[7px] font-bold text-[#8C6D37]">180°</span>
          </div>
        </div>
      ),
    },
    {
      id: 'single-left-right',
      title: '2 Fotos Clásicas',
      subtitle: '1 Foto Izq + 1 Foto Der',
      category: '2',
      photoCount: 2,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'single-full',
          slots: [{ id: `s-L-${Date.now()}-1`, photoId: photos[0], fitMode: 'cover' }],
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[1] || photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
        </div>
      ),
    },
    {
      id: 'two-vert-left-one-right',
      title: '3 Fotos (2 Vert + 1 Full)',
      subtitle: '2 Fotos Izq + 1 Foto Der',
      category: '3',
      photoCount: 3,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'two-vertical',
          slots: [
            { id: `s-L-${Date.now()}-1`, photoId: photos[0], fitMode: 'cover' },
            { id: `s-L-${Date.now()}-2`, photoId: photos[1] || photos[0], fitMode: 'cover' },
          ],
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[2] || photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="grid grid-cols-2 gap-0.5">
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
          </div>
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
        </div>
      ),
    },
    {
      id: 'two-horiz-left-one-right',
      title: '3 Fotos (2 Horiz + 1 Full)',
      subtitle: '2 Filas Izq + 1 Foto Der',
      category: '3',
      photoCount: 3,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'two-horizontal',
          slots: [
            { id: `s-L-${Date.now()}-1`, photoId: photos[0], fitMode: 'cover' },
            { id: `s-L-${Date.now()}-2`, photoId: photos[1] || photos[0], fitMode: 'cover' },
          ],
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[2] || photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="grid grid-rows-2 gap-0.5">
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
          </div>
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
        </div>
      ),
    },
    {
      id: 'three-collage-spread',
      title: '4 Fotos Mosaico',
      subtitle: '1 Hero + 2 Stacked + 1 Full',
      category: '4',
      photoCount: 4,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'three-collage',
          slots: [
            { id: `s-L-${Date.now()}-1`, photoId: photos[0], fitMode: 'cover' },
            { id: `s-L-${Date.now()}-2`, photoId: photos[1] || photos[0], fitMode: 'cover' },
            { id: `s-L-${Date.now()}-3`, photoId: photos[2] || photos[0], fitMode: 'cover' },
          ],
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[3] || photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="grid grid-cols-2 gap-0.5">
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="grid grid-rows-2 gap-0.5">
              <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
              <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            </div>
          </div>
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
        </div>
      ),
    },
    {
      id: 'three-triptych-spread',
      title: 'Tríptico 3 Verticales',
      subtitle: '3 Columnas Altas + 1 Full',
      category: '4',
      photoCount: 4,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'three-vertical-triptych',
          slots: [
            { id: `s-L-${Date.now()}-1`, photoId: photos[0], fitMode: 'cover' },
            { id: `s-L-${Date.now()}-2`, photoId: photos[1] || photos[0], fitMode: 'cover' },
            { id: `s-L-${Date.now()}-3`, photoId: photos[2] || photos[0], fitMode: 'cover' },
          ],
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[3] || photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="grid grid-cols-3 gap-0.5">
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
          </div>
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
        </div>
      ),
    },
    {
      id: 'four-grid-left-one-right',
      title: '5 Fotos (2x2 Grilla + 1 Full)',
      subtitle: '4 Cuadrantes Izq + 1 Foto Der',
      category: '5+',
      photoCount: 5,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'four-grid',
          slots: [0, 1, 2, 3].map((i) => ({
            id: `s-L-${Date.now()}-${i + 1}`,
            photoId: photos[i] || photos[0],
            fitMode: 'cover',
          })),
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[4] || photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="grid grid-cols-2 grid-rows-2 gap-0.5">
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
          </div>
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
        </div>
      ),
    },
    {
      id: 'four-grid-both-spread',
      title: '8 Fotos Grilla Doble',
      subtitle: '4 Fotos Izq + 4 Fotos Der',
      category: '5+',
      photoCount: 8,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'four-grid',
          slots: [0, 1, 2, 3].map((i) => ({
            id: `s-L-${Date.now()}-${i + 1}`,
            photoId: photos[i] || photos[0],
            fitMode: 'cover',
          })),
        },
        rightPage: {
          ...source.rightPage,
          layout: 'four-grid',
          slots: [4, 5, 6, 7].map((i) => ({
            id: `s-R-${Date.now()}-${i + 1}`,
            photoId: photos[i] || photos[0],
            fitMode: 'cover',
          })),
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="grid grid-cols-2 grid-rows-2 gap-0.5">
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
          </div>
          <div className="grid grid-cols-2 grid-rows-2 gap-0.5">
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
          </div>
        </div>
      ),
    },
    {
      id: 'five-photo-editorial-spread',
      title: '6 Fotos (5 Editorial + 1 Full)',
      subtitle: '2 Arriba + 3 Abajo en Izq',
      category: '5+',
      photoCount: 6,
      badge: 'Popular',
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'five-photo-editorial',
          slots: [0, 1, 2, 3, 4].map((i) => ({
            id: `s-L-${Date.now()}-${i + 1}`,
            photoId: photos[i] || photos[0],
            fitMode: 'cover',
          })),
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[5] || photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="flex flex-col gap-0.5">
            <div className="flex-1 grid grid-cols-2 gap-0.5">
              <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
              <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            </div>
            <div className="flex-1 grid grid-cols-3 gap-0.5">
              <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
              <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
              <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            </div>
          </div>
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
        </div>
      ),
    },
    {
      id: 'editorial-magazine-polaroid-spread',
      title: '5 Fotos Revista & Polaroid',
      subtitle: 'Hero + Polaroids + 1 Full',
      category: '5+',
      photoCount: 5,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'editorial-magazine-polaroid',
          slots: [0, 1, 2, 3].map((i) => ({
            id: `s-L-${Date.now()}-${i + 1}`,
            photoId: photos[i] || photos[0],
            fitMode: 'cover',
          })),
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[4] || photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="flex gap-0.5">
            <div className="w-1/2 bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="w-1/2 flex flex-col gap-0.5">
              <div className="h-1/2 bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
              <div className="h-1/2 grid grid-cols-2 gap-0.5">
                <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
                <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
              </div>
            </div>
          </div>
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
        </div>
      ),
    },
    {
      id: 'moodboard-mosaic-9-spread',
      title: '10 Fotos Moodboard Mosaico',
      subtitle: '9 Fotos Mosaico Izq + 1 Foto Der',
      category: '5+',
      photoCount: 10,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'moodboard-mosaic-9',
          slots: Array.from({ length: 9 }, (_, i) => ({
            id: `s-L-${Date.now()}-${i + 1}`,
            photoId: photos[i] || photos[0],
            fitMode: 'cover',
          })),
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[9] || photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="grid grid-cols-3 grid-rows-3 gap-0.5">
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="col-span-2 bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="row-span-2 bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            <div className="col-span-2 bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
          </div>
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
        </div>
      ),
    },
    {
      id: 'lifestyle-bento-10-spread',
      title: '11 Fotos Bento Lifestyle',
      subtitle: '10 Fotos Detalle Izq + 1 Foto Der',
      category: '5+',
      photoCount: 11,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'lifestyle-bento-10',
          slots: Array.from({ length: 10 }, (_, i) => ({
            id: `s-L-${Date.now()}-${i + 1}`,
            photoId: photos[i] || photos[0],
            fitMode: 'cover',
          })),
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-full',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[10] || photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="grid grid-cols-3 grid-rows-3 gap-0.5">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div key={idx} className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
            ))}
          </div>
          <div className="bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
        </div>
      ),
    },
    {
      id: 'editorial-text-photo-spread',
      title: 'Editorial Clásica con Texto',
      subtitle: 'Página de Dedicatoria Izq + 1 Foto Der',
      category: 'editorial',
      photoCount: 1,
      apply: (source, photos) => ({
        ...source,
        isFullSpreadBleed: false,
        leftPage: {
          ...source.leftPage,
          layout: 'editorial-text-photo',
          slots: [],
          customTextHeading: source.leftPage.customTextHeading || foilTitleText || 'Momentos Inolvidables',
          customTextBody: source.leftPage.customTextBody || 'Cada imagen narra una historia única.',
        },
        rightPage: {
          ...source.rightPage,
          layout: 'single-bordered',
          slots: [{ id: `s-R-${Date.now()}-1`, photoId: photos[0], fitMode: 'cover' }],
        },
      }),
      renderDiagram: () => (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5 bg-[#FAF7F2]">
          <div className="flex flex-col justify-center items-center p-1 border border-[#D6CEBE] rounded-xs bg-white">
            <div className="w-3/4 h-1 bg-[#8C6D37] rounded-full mb-1" />
            <div className="w-1/2 h-0.5 bg-[#736B60] rounded-full mb-0.5" />
            <div className="w-2/3 h-0.5 bg-[#736B60] rounded-full" />
          </div>
          <div className="bg-white p-0.5 border border-[#D6CEBE] rounded-xs flex items-center justify-center">
            <div className="w-3/4 h-3/4 bg-[#8C6D37]/35 border border-[#8C6D37] rounded-xs" />
          </div>
        </div>
      ),
    },
  ];

  // Helper to extract all photo IDs in the current spread (or fallback to uploaded photos)
  const getSpreadPhotos = useCallback((spread: PhotobookSpread): string[] => {
    const photos: string[] = [];
    if (spread.isFullSpreadBleed && spread.fullSpreadPhotoId) {
      photos.push(spread.fullSpreadPhotoId);
    }
    spread.leftPage.slots.forEach((s) => {
      if (s.photoId && !photos.includes(s.photoId)) photos.push(s.photoId);
    });
    spread.rightPage.slots.forEach((s) => {
      if (s.photoId && !photos.includes(s.photoId)) photos.push(s.photoId);
    });
    // Add selected photos if any
    selectedPhotoIds.forEach((id) => {
      if (!photos.includes(id)) photos.push(id);
    });
    // Fill remaining from uploaded photos
    uploadedPhotos.forEach((p) => {
      if (!photos.includes(p.id)) photos.push(p.id);
    });
    return photos;
  }, [selectedPhotoIds, uploadedPhotos]);

  // Compute live preview spread when hovered over a template style
  const activeSpread = spreads[activeSpreadIndex] || spreads[0];
  const previewSpread = hoveredLayoutTemplateId && activeSpread
    ? SPREAD_TEMPLATE_PRESETS.find((t) => t.id === hoveredLayoutTemplateId)?.apply(activeSpread, getSpreadPhotos(activeSpread)) || null
    : null;
  const displaySpread = previewSpread || activeSpread;

  // Apply template permanently on click
  const handleApplySpreadTemplate = (templateId: string) => {
    const tmpl = SPREAD_TEMPLATE_PRESETS.find((t) => t.id === templateId);
    if (!tmpl || !activeSpread) return;
    recordHistorySnapshot(spreads);
    const updated = tmpl.apply(activeSpread, getSpreadPhotos(activeSpread));
    setSpreads((prev) => prev.map((s, idx) => (idx === activeSpreadIndex ? updated : s)));
    setHoveredLayoutTemplateId(null);
    setShowTemplateGridModal(false);
  };

  // Cycle spread templates with [ < ] and [ > ]
  const handleCycleSpreadTemplate = (direction: 'prev' | 'next') => {
    if (!activeSpread) return;
    const currentIdx = SPREAD_TEMPLATE_PRESETS.findIndex((t) => {
      if (activeSpread.isFullSpreadBleed) return t.id === 'panoramic-spread';
      return t.id.includes(activeSpread.leftPage.layout);
    });
    let nextIdx = 0;
    if (direction === 'prev') {
      nextIdx = currentIdx <= 0 ? SPREAD_TEMPLATE_PRESETS.length - 1 : currentIdx - 1;
    } else {
      nextIdx = currentIdx >= SPREAD_TEMPLATE_PRESETS.length - 1 ? 0 : currentIdx + 1;
    }
    const nextTmpl = SPREAD_TEMPLATE_PRESETS[nextIdx];
    if (nextTmpl) {
      handleApplySpreadTemplate(nextTmpl.id);
    }
  };

  // Delete spread directly with history (undoable with Ctrl+Z)
  const handleDeleteSpreadWithConfirmation = (index: number) => {
    if (spreads.length <= 1) return;
    handleDeleteSpread(index);
  };

  // Multi-photo drag & drop auto-layout handler
  const handleDropPhotosOnTarget = (target: 'spread' | 'left' | 'right', e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlotId(null);
    setIsCanvasDragOver(false);

    let photoIdsToPlace: string[] = [];
    if (selectedPhotoIds.length > 0 && draggedPhotoId && selectedPhotoIds.includes(draggedPhotoId)) {
      photoIdsToPlace = [...selectedPhotoIds];
    } else if (selectedPhotoIds.length > 1 && !draggedPhotoId) {
      photoIdsToPlace = [...selectedPhotoIds];
    } else if (draggedPhotoId) {
      photoIdsToPlace = [draggedPhotoId];
    } else if (selectedPhotoIds.length > 0) {
      photoIdsToPlace = [...selectedPhotoIds];
    }

    if (photoIdsToPlace.length === 0) return;
    if (!activeSpread) return;

    recordHistorySnapshot(spreads);
    const count = photoIdsToPlace.length;

    if (target === 'left' || target === 'right') {
      let layout: PageLayoutId = 'single-full';
      if (count === 1) layout = 'single-full';
      else if (count === 2) layout = 'two-vertical';
      else if (count === 3) layout = 'three-collage';
      else if (count === 4) layout = 'four-grid';
      else if (count === 5) layout = 'five-photo-editorial';
      else if (count <= 9) layout = 'moodboard-mosaic-9';
      else layout = 'lifestyle-bento-10';

      const slots: PageSlot[] = photoIdsToPlace.map((pId, idx) => ({
        id: `slot-${target === 'left' ? 'L' : 'R'}-${Date.now()}-${idx}`,
        photoId: pId,
        fitMode: 'cover',
      }));

      const updatedSpread: PhotobookSpread = {
        ...activeSpread,
        isFullSpreadBleed: false,
        [target === 'left' ? 'leftPage' : 'rightPage']: {
          ...activeSpread[target === 'left' ? 'leftPage' : 'rightPage'],
          layout,
          slots,
        },
      };
      setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
    } else {
      // Whole spread drop
      if (count === 1) {
        const updatedSpread: PhotobookSpread = {
          ...activeSpread,
          isFullSpreadBleed: false,
          leftPage: {
            ...activeSpread.leftPage,
            layout: 'single-full',
            slots: [{ id: `s-L-${Date.now()}`, photoId: photoIdsToPlace[0], fitMode: 'cover' }],
          },
        };
        setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
      } else if (count === 2) {
        const updatedSpread: PhotobookSpread = {
          ...activeSpread,
          isFullSpreadBleed: false,
          leftPage: {
            ...activeSpread.leftPage,
            layout: 'single-full',
            slots: [{ id: `s-L-${Date.now()}`, photoId: photoIdsToPlace[0], fitMode: 'cover' }],
          },
          rightPage: {
            ...activeSpread.rightPage,
            layout: 'single-full',
            slots: [{ id: `s-R-${Date.now()}`, photoId: photoIdsToPlace[1], fitMode: 'cover' }],
          },
        };
        setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
      } else if (count === 3) {
        const updatedSpread: PhotobookSpread = {
          ...activeSpread,
          isFullSpreadBleed: false,
          leftPage: {
            ...activeSpread.leftPage,
            layout: 'two-vertical',
            slots: [
              { id: `s-L1-${Date.now()}`, photoId: photoIdsToPlace[0], fitMode: 'cover' },
              { id: `s-L2-${Date.now()}`, photoId: photoIdsToPlace[1], fitMode: 'cover' },
            ],
          },
          rightPage: {
            ...activeSpread.rightPage,
            layout: 'single-full',
            slots: [{ id: `s-R1-${Date.now()}`, photoId: photoIdsToPlace[2], fitMode: 'cover' }],
          },
        };
        setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
      } else if (count === 4) {
        const updatedSpread: PhotobookSpread = {
          ...activeSpread,
          isFullSpreadBleed: false,
          leftPage: {
            ...activeSpread.leftPage,
            layout: 'two-vertical',
            slots: [
              { id: `s-L1-${Date.now()}`, photoId: photoIdsToPlace[0], fitMode: 'cover' },
              { id: `s-L2-${Date.now()}`, photoId: photoIdsToPlace[1], fitMode: 'cover' },
            ],
          },
          rightPage: {
            ...activeSpread.rightPage,
            layout: 'two-vertical',
            slots: [
              { id: `s-R1-${Date.now()}`, photoId: photoIdsToPlace[2], fitMode: 'cover' },
              { id: `s-R2-${Date.now()}`, photoId: photoIdsToPlace[3], fitMode: 'cover' },
            ],
          },
        };
        setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
      } else {
        const leftCount = Math.ceil(count / 2);
        const rightCount = count - leftCount;

        const getLayout = (c: number): PageLayoutId => {
          if (c === 1) return 'single-full';
          if (c === 2) return 'two-vertical';
          if (c === 3) return 'three-collage';
          if (c === 4) return 'four-grid';
          if (c === 5) return 'five-photo-editorial';
          if (c <= 9) return 'moodboard-mosaic-9';
          return 'lifestyle-bento-10';
        };

        const leftSlots: PageSlot[] = photoIdsToPlace.slice(0, leftCount).map((pId, idx) => ({
          id: `s-L-${Date.now()}-${idx}`,
          photoId: pId,
          fitMode: 'cover',
        }));
        const rightSlots: PageSlot[] = photoIdsToPlace.slice(leftCount).map((pId, idx) => ({
          id: `s-R-${Date.now()}-${idx}`,
          photoId: pId,
          fitMode: 'cover',
        }));

        const updatedSpread: PhotobookSpread = {
          ...activeSpread,
          isFullSpreadBleed: false,
          leftPage: {
            ...activeSpread.leftPage,
            layout: getLayout(leftCount),
            slots: leftSlots,
          },
          rightPage: {
            ...activeSpread.rightPage,
            layout: getLayout(rightCount),
            slots: rightSlots,
          },
        };
        setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
      }
    }
  };

  // Free Floating Draggable Text Handlers
  const handleAddFloatingText = (presetType: 'title' | 'subtitle' | 'quote' | 'label' = 'title') => {
    recordHistorySnapshot(spreads);
    const activeSpread = spreads[activeSpreadIndex];
    if (!activeSpread) return;

    interface TextPreset {
      text: string;
      fontSize: number;
      fontFamily: 'serif-luxury' | 'sans-modern' | 'script-hand' | 'mono-clean';
      color: string;
      isBold?: boolean;
      isItalic?: boolean;
      letterSpacing: string;
      position: { x: number; y: number };
    }

    const presets: Record<'title' | 'subtitle' | 'quote' | 'label', TextPreset> = {
      title: {
        text: 'Título del Pliego',
        fontSize: 24,
        fontFamily: 'serif-luxury',
        color: '#1F1C18',
        isBold: true,
        isItalic: false,
        letterSpacing: '0.05em',
        position: { x: 50, y: 15 },
      },
      subtitle: {
        text: 'Lugar & Fecha · 2026',
        fontSize: 14,
        fontFamily: 'sans-modern',
        color: '#736B60',
        isBold: false,
        isItalic: false,
        letterSpacing: '0.1em',
        position: { x: 50, y: 85 },
      },
      quote: {
        text: '“Los mejores recuerdos son los que creamos juntos.”',
        fontSize: 16,
        fontFamily: 'serif-luxury',
        color: '#595248',
        isBold: false,
        isItalic: true,
        letterSpacing: 'normal',
        position: { x: 50, y: 50 },
      },
      label: {
        text: 'Momento Especial',
        fontSize: 11,
        fontFamily: 'mono-clean',
        color: '#8C6D37',
        isBold: true,
        isItalic: false,
        letterSpacing: '0.15em',
        position: { x: 75, y: 88 },
      },
    };

    const selectedPreset = presets[presetType];
    const newTextEl: CustomTextElement = {
      id: `text-${Date.now()}`,
      text: selectedPreset.text,
      fontSize: selectedPreset.fontSize,
      fontFamily: selectedPreset.fontFamily,
      color: selectedPreset.color,
      alignment: 'center',
      letterSpacing: selectedPreset.letterSpacing,
      isBold: selectedPreset.isBold,
      isItalic: selectedPreset.isItalic,
      position: selectedPreset.position,
    };

    const existing = activeSpread.textElements || [];
    const updatedSpread = {
      ...activeSpread,
      textElements: [...existing, newTextEl],
    };

    setSpreads((prev) => prev.map((s, i) => (i === activeSpreadIndex ? updatedSpread : s)));
    setSelectedTextId(newTextEl.id);
    setSelectedSlotId(null);
    setActiveEditorTab('text');
  };

  const handleUpdateFloatingText = (
    textId: string, 
    updater: Partial<CustomTextElement> | ((t: CustomTextElement) => CustomTextElement)
  ) => {
    setSpreads((prev) => {
      const activeSpread = prev[activeSpreadIndex];
      if (!activeSpread) return prev;
      const elements = activeSpread.textElements || [];
      const updated = elements.map((el) => {
        if (el.id !== textId) return el;
        if (typeof updater === 'function') {
          return updater(el);
        }
        return { ...el, ...updater };
      });
      return prev.map((s, i) => (i === activeSpreadIndex ? { ...s, textElements: updated } : s));
    });
  };

  const handleDeleteFloatingText = (textId: string) => {
    recordHistorySnapshot(spreads);
    setSpreads((prev) => {
      const activeSpread = prev[activeSpreadIndex];
      if (!activeSpread) return prev;
      const elements = activeSpread.textElements || [];
      const filtered = elements.filter((el) => el.id !== textId);
      return prev.map((s, i) => (i === activeSpreadIndex ? { ...s, textElements: filtered } : s));
    });
    if (selectedTextId === textId) setSelectedTextId(null);
  };

  const handleStartTextDrag = (textEl: CustomTextElement, e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedTextId(textEl.id);
    setSelectedSlotId(null);

    const canvasEl = spreadCanvasRef.current;
    if (!canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    textDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: textEl.position.x,
      initY: textEl.position.y,
      textId: textEl.id,
      hasMoved: false,
      containerRect: rect,
    };

    const handlePointerMove = (moveEv: PointerEvent) => {
      if (!textDragRef.current) return;
      const dx = moveEv.clientX - textDragRef.current.startX;
      const dy = moveEv.clientY - textDragRef.current.startY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        textDragRef.current.hasMoved = true;
      }

      const dxPercent = (dx / textDragRef.current.containerRect.width) * 100;
      const dyPercent = (dy / textDragRef.current.containerRect.height) * 100;

      const newX = Math.min(95, Math.max(5, Math.round((textDragRef.current.initX + dxPercent) * 10) / 10));
      const newY = Math.min(95, Math.max(5, Math.round((textDragRef.current.initY + dyPercent) * 10) / 10));

      handleUpdateFloatingText(textDragRef.current.textId, (t) => ({
        ...t,
        position: { x: newX, y: newY },
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (textDragRef.current?.hasMoved) {
        recordHistorySnapshot(spreads);
      }
      textDragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Save Project Draft
  const handleSaveDraft = async () => {
    setSaveStatus('saving');
    const project: PhotobookProject = {
      id: projectId,
      title: foilTitleText || 'Fotolibro Fine Art',
      subtitle: foilSubtitleText,
      formatId,
      coverMaterialId,
      foilColor,
      foilTitleText,
      foilSubtitleText,
      paperFinishId,
      hasCoverWindow,
      photos: uploadedPhotos,
      spreads,
      giftBoxIncluded,
      createdAt: initialProject?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const currentUserId = user?.id || profile?.id || 'local-user';
    await saveUserProject(currentUserId, project, totalPrice);

    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  // Finalize Project
  const handleFinishAndOrder = () => {
    const project: PhotobookProject = {
      id: projectId || `album-${Date.now()}`,
      title: foilTitleText || 'Fotolibro Fine Art',
      subtitle: foilSubtitleText,
      formatId,
      coverMaterialId,
      foilColor,
      foilTitleText,
      foilSubtitleText,
      paperFinishId,
      hasCoverWindow,
      photos: uploadedPhotos,
      spreads,
      giftBoxIncluded,
      createdAt: initialProject?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onAddToCart(project, totalPrice);
  };

  // Interactive Slot Renderer with Zno Cloud Pro Editing Controls
  const renderSlotInteractive = (slot?: PageSlot, containerClasses = '', readOnly = false) => {
    if (!slot) return null;

    const photo = uploadedPhotos.find((p) => p.id === slot.photoId);
    const isSelected = !readOnly && selectedSlotId === slot.id;
    const isDragOver = !readOnly && dragOverSlotId === slot.id;
    const scale = slot.customScale || 1;
    const rotation = slot.rotation || 0;
    const flipH = slot.flipH || false;
    const fitMode = slot.fitMode || 'cover';
    const filter = slot.filter || 'none';
    const borderWidth = slot.borderWidth || 0;
    const borderColor = slot.borderColor || '#FFFFFF';

    const bounds = getSlotPanBounds(slot, photo);
    const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, slot.customPosition?.x || 0));
    const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, slot.customPosition?.y || 0));

    // CSS filter styling mapping
    const getFilterClass = (f: PhotoFilterMode) => {
      switch (f) {
        case 'fine-art-bw':
          return 'grayscale contrast-125';
        case 'warm-vintage':
          return 'sepia-[0.45] contrast-105 saturate-110';
        case 'high-contrast':
          return 'contrast-135 saturate-115 brightness-95';
        case 'fuji-film':
          return 'saturate-120 contrast-110 hue-rotate-[350deg]';
        case 'kodak-chrome':
          return 'sepia-[0.15] contrast-125 saturate-130';
        case 'matte-portrait':
          return 'contrast-90 brightness-105 saturate-95';
        default:
          return '';
      }
    };

    return (
      <div
        key={slot.id}
        id={slot.id}
        onClick={(e) => {
          if (readOnly) return;
          e.stopPropagation();
          setSelectedSlotId(slot.id);
        }}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOverSlotId(slot.id);
        }}
        onDragLeave={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.stopPropagation();
          if (dragOverSlotId === slot.id) setDragOverSlotId(null);
        }}
        onDrop={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOverSlotId(null);
          if (draggedPhotoId) {
            handleAssignPhotoToSlot(slot.id, draggedPhotoId);
          }
        }}
        onWheel={(e) => {
          if (readOnly) return;
          if (photo) {
            e.preventDefault();
            e.stopPropagation();
            if (selectedSlotId !== slot.id) {
              setSelectedSlotId(slot.id);
            }
            const delta = e.deltaY < 0 ? 0.08 : -0.08;
            const currentScale = slot.customScale || 1;
            const nextScale = Math.min(3, Math.max(1, +(currentScale + delta).toFixed(2)));
            handleSlotSetScale(slot.id, nextScale);
          }
        }}
        style={{
          borderWidth: borderWidth > 0 ? `${borderWidth}px` : undefined,
          borderColor: borderWidth > 0 ? borderColor : undefined,
          transform: (slot.frameOffsetX || slot.frameOffsetY)
            ? `translate(${slot.frameOffsetX || 0}px, ${slot.frameOffsetY || 0}px)`
            : undefined,
          width: slot.frameWidthDelta ? `calc(100% + ${slot.frameWidthDelta}px)` : undefined,
          height: slot.frameHeightDelta ? `calc(100% + ${slot.frameHeightDelta}px)` : undefined,
          zIndex: isSelected ? 35 : (slot.frameOffsetX || slot.frameOffsetY || slot.frameWidthDelta || slot.frameHeightDelta) ? 20 : undefined,
        }}
        className={`group relative overflow-visible rounded-lg transition-all select-none ${containerClasses} ${
          readOnly
            ? 'cursor-default border border-[#D6CEBE]/40'
            : isSelected
            ? 'ring-2 ring-[#0091FF] shadow-lg cursor-pointer'
            : isDragOver
            ? 'border-dashed border-2 border-[#8C6D37] bg-[#8C6D37]/15 scale-[1.01] cursor-pointer'
            : 'border border-[#D6CEBE]/80 hover:border-[#1F1C18] cursor-pointer'
        } bg-[#EFE9DE]`}
      >
        {/* Content Container */}
        <div 
          id={`slot-content-${slot.id}`}
          className={`w-full h-full relative overflow-hidden rounded-md flex items-center justify-center bg-black/5 ${
            !readOnly && isSelected && photo ? (panningSlotId === slot.id ? 'cursor-grabbing' : 'cursor-grab') : ''
          }`}
          onPointerDown={(e) => {
            if (!readOnly && isSelected && photo) {
              handleStartPan(slot, e);
            }
          }}
        >
          {photo ? (
            <div className="w-full h-full relative overflow-hidden flex items-center justify-center pointer-events-none">
              {/* The Photo with transform (Zoom, Rotate, Flip, Fit, Position) */}
              <img
                id={`slot-img-${slot.id}`}
                src={getPhotoDisplayUrl(photo) || photo.hdDataUrl || photo.url || photo.thumbnailUrl}
                alt={photo.name}
                draggable={false}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (photo.hdDataUrl && target.src !== photo.hdDataUrl) {
                    target.src = photo.hdDataUrl;
                  } else if (photo.url && target.src !== photo.url) {
                    target.src = photo.url;
                  } else if (photo.thumbnailUrl && target.src !== photo.thumbnailUrl) {
                    target.src = photo.thumbnailUrl;
                  }
                }}
                className={`select-none transition-transform duration-75 ease-out ${getFilterClass(filter)}`}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: bounds.baseW > 0 ? `${bounds.baseW}px` : '100%',
                  height: bounds.baseH > 0 ? `${bounds.baseH}px` : '100%',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  objectFit: fitMode === 'contain' ? 'contain' : 'cover',
                  transform: `translate(-50%, -50%) translate3d(${clampedX}px, ${clampedY}px, 0px) scale(${scale}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
                  transformOrigin: 'center center',
                }}
              />

              {/* Quick DPI & Filter Tags (Only in editor mode) */}
              {!readOnly && (
                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                  {filter !== 'none' && (
                    <span className="px-1 py-0.5 rounded bg-black/60 backdrop-blur-xs text-white text-[8px] uppercase font-mono">
                      {filter}
                    </span>
                  )}
                  {scale > 1 && (
                    <span className="px-1 py-0.5 rounded bg-black/60 backdrop-blur-xs text-white text-[8px] font-mono">
                      {Math.round(scale * 100)}%
                    </span>
                  )}
                  {(clampedX !== 0 || clampedY !== 0) && (
                    <span className="px-1 py-0.5 rounded bg-[#0091FF]/80 backdrop-blur-xs text-white text-[8px] font-mono">
                      Encuadre ({clampedX}px, {clampedY}px)
                    </span>
                  )}
                  {Boolean(slot.frameWidthDelta || slot.frameHeightDelta || slot.frameOffsetX || slot.frameOffsetY) && (
                    <span className="px-1 py-0.5 rounded bg-[#8C6D37]/90 backdrop-blur-xs text-white text-[8px] font-mono">
                      Marco Personalizado
                    </span>
                  )}
                  {flipH && (
                    <span className="px-1 py-0.5 rounded bg-black/60 backdrop-blur-xs text-white text-[8px] font-mono">
                      Espejo
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Empty Slot / Placeholder */
            readOnly ? (
              <div className="w-full h-full bg-[#EFE9DE]/40 rounded flex items-center justify-center">
                <span className="text-[8px] text-[#A89F91] font-mono">Ranura Vacía</span>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-[#736B60]">
                <ImageIcon className="w-6 h-6 mb-1 text-[#8C6D37]/50" />
                <span className="text-[10px] font-bold text-[#595248] block leading-tight">
                  {isDragOver ? 'Soltar foto aquí' : isSelected ? 'Haz clic en una foto' : 'Ranura Vacía'}
                </span>
                <span className="text-[8px] text-[#A89F91]">Arrastra o selecciona</span>
              </div>
            )
          )}
        </div>

        {/* ZNO CLOUD SELECTION HANDLES & OVERLAYS WHEN SELECTED (EDITOR ONLY) */}
        {!readOnly && isSelected && photo && (
          <>
            {/* Top Rotation Pivot Handle */}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-40">
              <button
                type="button"
                onPointerDown={(e) => handleStartRotateInteractive(slot, e)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSlotRotate(slot.id);
                }}
                title="Arrastra para rotar libremente o haz clic para girar 90°"
                className={`w-5 h-5 rounded-full bg-white border-2 border-[#0091FF] text-[#0091FF] hover:bg-[#0091FF] hover:text-white flex items-center justify-center shadow-lg transition-transform ${
                  rotatingSlotState?.slotId === slot.id ? 'scale-125 ring-2 ring-[#0091FF]' : 'hover:scale-110'
                } cursor-grab active:cursor-grabbing`}
              >
                <RotateCw className="w-2.5 h-2.5" />
              </button>
              <div className="w-[1.5px] h-2 bg-[#0091FF]" />
            </div>

            {/* Corner Resize Handles (NW, NE, SW, SE) */}
            <div
              onPointerDown={(e) => handleStartResize(slot, 'nw', e)}
              title="Redimensionar esquina superior izquierda"
              className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#0091FF] hover:bg-[#0091FF] hover:scale-125 transition-transform shadow-md pointer-events-auto z-40 cursor-nwse-resize"
            />
            <div
              onPointerDown={(e) => handleStartResize(slot, 'ne', e)}
              title="Redimensionar esquina superior derecha"
              className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#0091FF] hover:bg-[#0091FF] hover:scale-125 transition-transform shadow-md pointer-events-auto z-40 cursor-nesw-resize"
            />
            <div
              onPointerDown={(e) => handleStartResize(slot, 'sw', e)}
              title="Redimensionar esquina inferior izquierda"
              className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#0091FF] hover:bg-[#0091FF] hover:scale-125 transition-transform shadow-md pointer-events-auto z-40 cursor-nesw-resize"
            />
            <div
              onPointerDown={(e) => handleStartResize(slot, 'se', e)}
              title="Redimensionar esquina inferior derecha"
              className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#0091FF] hover:bg-[#0091FF] hover:scale-125 transition-transform shadow-md pointer-events-auto z-40 cursor-nwse-resize"
            />

            {/* Top-Left Circular Swap Icon Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowSwapPickerSlotId(slot.id);
              }}
              title="Cambiar foto de este marco"
              className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-[#8C6D37] hover:bg-[#73582A] text-white flex items-center justify-center shadow-lg z-40 transition-transform hover:scale-110 cursor-pointer border border-white"
            >
              <ArrowLeftRight className="w-3 h-3" />
            </button>

            {/* Frame Move Button (Top Right) */}
            <div
              onPointerDown={(e) => handleStartFrameMove(slot, e)}
              title="Arrastra para mover la posición del marco en la página"
              className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-[#1F1C18] text-white flex items-center justify-center shadow-lg z-40 cursor-move hover:scale-110 transition-transform border border-white"
            >
              <Move className="w-3 h-3" />
            </div>

            {/* Live Active HUD indicator */}
            {resizingHandle?.slotId === slot.id && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-[#1F1C18] text-white text-[10px] font-mono px-2.5 py-1 rounded-full shadow-2xl border border-white/20 z-50 whitespace-nowrap pointer-events-none flex items-center gap-1.5">
                <span className="text-[#0091FF] font-bold">Marco:</span>
                <span>Ancho {resizingHandle.wDelta >= 0 ? `+${resizingHandle.wDelta}` : resizingHandle.wDelta}px</span>
                <span className="text-white/40">|</span>
                <span>Alto {resizingHandle.hDelta >= 0 ? `+${resizingHandle.hDelta}` : resizingHandle.hDelta}px</span>
              </div>
            )}
            {rotatingSlotState?.slotId === slot.id && (
              <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-[#1F1C18] text-white text-[10px] font-mono px-2.5 py-1 rounded-full shadow-2xl border border-white/20 z-50 whitespace-nowrap pointer-events-none flex items-center gap-1.5">
                <RotateCw className="w-3 h-3 text-[#0091FF]" />
                <span>Rotación: {rotatingSlotState.deg}°</span>
              </div>
            )}

            {/* Floating Dark Action Toolbar - Floats below the frame to never obstruct the photo */}
            <div 
              onClick={(e) => e.stopPropagation()}
              className="absolute top-full mt-2 left-1/2 -translate-x-1/2 flex items-center bg-[#242220]/95 text-white rounded-xl shadow-2xl px-2 py-1 gap-1.5 z-50 border border-white/20 backdrop-blur-md whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
            >
              {/* 1. Cambiar Foto */}
              <button
                type="button"
                onClick={() => setShowSwapPickerSlotId(slot.id)}
                title="Cambiar foto de este marco (Elegir o subir otra imagen)"
                className="px-2 py-1 rounded-lg bg-[#8C6D37] hover:bg-[#73582A] text-white transition-colors flex items-center gap-1 text-[10px] font-bold shrink-0 cursor-pointer shadow-xs"
              >
                <ArrowLeftRight className="w-3 h-3" />
                <span>Cambiar</span>
              </button>

              <div className="w-[1px] h-3 bg-white/20" />

              {/* 2. Ajustar vs Llenar Marco (Fit / Cover) */}
              <button
                type="button"
                onClick={() => handleSlotFitMode(slot.id)}
                title={fitMode === 'contain' ? "Llenar todo el marco (Cover)" : "Ajustar foto completa al marco (Contain)"}
                className={`p-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer ${fitMode === 'contain' ? 'text-[#0091FF] bg-white/15' : 'text-white/80'}`}
              >
                {fitMode === 'contain' ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>

              {/* 3. Girar 90° */}
              <button
                type="button"
                onClick={() => handleSlotRotate(slot.id)}
                title="Girar 90°"
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              {/* 4. Voltear Espejo / Mirror */}
              <button
                type="button"
                onClick={() => handleSlotFlipH(slot.id)}
                title="Voltear horizontalmente (Espejo)"
                className={`p-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer ${flipH ? 'text-[#0091FF] bg-white/15' : 'text-white/80'}`}
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
              </button>

              {/* 5. Reset Pan / Center Button if moved */}
              {(slot.customPosition?.x !== 0 || slot.customPosition?.y !== 0) && (
                <button
                  type="button"
                  onClick={() => handleResetSlotPosition(slot.id)}
                  title="Restablecer posición centrada"
                  className="px-1.5 py-0.5 rounded bg-[#0091FF]/30 hover:bg-[#0091FF] text-[#0091FF] hover:text-white text-[9px] font-bold transition-colors cursor-pointer"
                >
                  Centrar
                </button>
              )}

              {/* 6. Reset Frame Size/Position if resized or moved */}
              {Boolean(slot.frameWidthDelta || slot.frameHeightDelta || slot.frameOffsetX || slot.frameOffsetY) && (
                <button
                  type="button"
                  onClick={() => handleResetFrameDimensions(slot.id)}
                  title="Restablecer tamaño y posición del marco al diseño original"
                  className="px-1.5 py-0.5 rounded bg-[#8C6D37]/50 hover:bg-[#8C6D37] text-[#ECC880] hover:text-white text-[9px] font-bold transition-colors cursor-pointer"
                >
                  Reset Marco
                </button>
              )}

              <div className="w-[1px] h-3 bg-white/20" />

              {/* 7. Eliminar Foto de la Ranura */}
              <button
                type="button"
                onClick={() => handleRemovePhotoFromSlot(slot.id)}
                title="Eliminar foto de esta ranura"
                className="p-1 rounded-lg hover:bg-rose-600 text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Helper to render layout content for any page (left or right)
  const renderPageLayoutContent = (page: PhotobookPage, isRight: boolean, readOnly = false) => {
    if (!page) return null;

    // 1. EDITORIAL TEXT & HEADING
    if (page.layout === 'editorial-text-photo') {
      if (readOnly) {
        return (
          <div className="w-full h-full flex flex-col justify-center text-center px-4 py-2">
            {page.customTextHeading && (
              <h3 className="font-serif-luxury text-lg sm:text-xl text-center text-[#1F1C18] font-bold mb-2">
                {page.customTextHeading}
              </h3>
            )}
            {page.customTextBody && (
              <p className="text-[11px] sm:text-xs text-[#595248] text-center italic leading-relaxed whitespace-pre-wrap">
                {page.customTextBody}
              </p>
            )}
            {!page.customTextHeading && !page.customTextBody && (
              <span className="text-[10px] text-[#A89F91] italic">Página editorial</span>
            )}
          </div>
        );
      }
      return (
        <div className="w-full h-full flex flex-col justify-center text-center px-4 py-2">
          <input
            type="text"
            value={page.customTextHeading || ''}
            onChange={(e) => {
              const val = e.target.value;
              setSpreads((prev) =>
                prev.map((s, i) => {
                  if (i !== activeSpreadIndex) return s;
                  return isRight
                    ? { ...s, rightPage: { ...s.rightPage, customTextHeading: val } }
                    : { ...s, leftPage: { ...s.leftPage, customTextHeading: val } };
                })
              );
            }}
            placeholder="Título del Pliego"
            className="font-serif-luxury text-xl sm:text-2xl text-center text-[#1F1C18] font-bold bg-transparent border-b border-dashed border-[#D6CEBE] mb-2 focus:outline-none focus:border-[#8C6D37]"
          />
          <textarea
            value={page.customTextBody || ''}
            onChange={(e) => {
              const val = e.target.value;
              setSpreads((prev) =>
                prev.map((s, i) => {
                  if (i !== activeSpreadIndex) return s;
                  return isRight
                    ? { ...s, rightPage: { ...s.rightPage, customTextBody: val } }
                    : { ...s, leftPage: { ...s.leftPage, customTextBody: val } };
                })
              );
            }}
            placeholder="Escribe una memoria, dedicatoria o poesía aquí..."
            className="text-[11px] sm:text-xs text-[#595248] text-center italic bg-transparent border border-dashed border-[#D6CEBE] p-2 rounded-lg resize-none focus:outline-none focus:border-[#8C6D37]"
            rows={4}
          />
        </div>
      );
    }

    // 2. SINGLE FULL (FULL BLEED SINGLE PAGE)
    if (page.layout === 'single-full') {
      return (
        <div className="w-full h-full">
          {page.slots[0] && renderSlotInteractive(page.slots[0], 'w-full h-full', readOnly)}
        </div>
      );
    }

    // 3. SINGLE BORDERED / PASSEPARTOUT
    if (page.layout === 'single-bordered') {
      return (
        <div className="w-5/6 h-5/6 shadow-lg bg-[#EFE9DE] border border-[#D6CEBE] p-2.5 rounded-lg flex items-center justify-center">
          {page.slots[0] && renderSlotInteractive(page.slots[0], 'w-full h-full rounded', readOnly)}
        </div>
      );
    }

    // 4. TWO VERTICAL
    if (page.layout === 'two-vertical') {
      return (
        <div className="w-full h-full grid grid-cols-2" style={{ gap: `${spreadPhotoGap}px` }}>
          {page.slots.map((slot) => renderSlotInteractive(slot, 'h-full', readOnly))}
        </div>
      );
    }

    // 5. TWO HORIZONTAL
    if (page.layout === 'two-horizontal') {
      return (
        <div className="w-full h-full grid grid-rows-2" style={{ gap: `${spreadPhotoGap}px` }}>
          {page.slots.map((slot) => renderSlotInteractive(slot, 'w-full h-full', readOnly))}
        </div>
      );
    }

    // 6. THREE COLLAGE (1 Hero + 2 Stacked)
    if (page.layout === 'three-collage') {
      return (
        <div className="w-full h-full grid grid-cols-2" style={{ gap: `${spreadPhotoGap}px` }}>
          <div className="h-full">
            {page.slots[0] && renderSlotInteractive(page.slots[0], 'h-full', readOnly)}
          </div>
          <div className="h-full grid grid-rows-2" style={{ gap: `${spreadPhotoGap}px` }}>
            {page.slots[1] && renderSlotInteractive(page.slots[1], 'h-full', readOnly)}
            {page.slots[2] && renderSlotInteractive(page.slots[2], 'h-full', readOnly)}
          </div>
        </div>
      );
    }

    // 7. THREE VERTICAL TRIPTYCH
    if (page.layout === 'three-vertical-triptych') {
      return (
        <div className="w-full h-full grid grid-cols-3" style={{ gap: `${spreadPhotoGap}px` }}>
          {page.slots.slice(0, 3).map((slot) => renderSlotInteractive(slot, 'h-full', readOnly))}
        </div>
      );
    }

    // 8. ASYMMETRIC SPLIT (2 Stacked + 1 Tall)
    if (page.layout === 'asymmetric-split') {
      return (
        <div className="w-full h-full grid grid-cols-2" style={{ gap: `${spreadPhotoGap}px` }}>
          <div className="h-full grid grid-rows-2" style={{ gap: `${spreadPhotoGap}px` }}>
            {page.slots[0] && renderSlotInteractive(page.slots[0], 'h-full', readOnly)}
            {page.slots[1] && renderSlotInteractive(page.slots[1], 'h-full', readOnly)}
          </div>
          <div className="h-full">
            {page.slots[2] && renderSlotInteractive(page.slots[2], 'h-full', readOnly)}
          </div>
        </div>
      );
    }

    // 9. FOUR GRID (2x2)
    if (page.layout === 'four-grid') {
      return (
        <div className="w-full h-full grid grid-cols-2 grid-rows-2" style={{ gap: `${spreadPhotoGap}px` }}>
          {page.slots.map((slot) => renderSlotInteractive(slot, 'h-full', readOnly))}
        </div>
      );
    }

    // 10. FIVE PHOTO EDITORIAL (2 Top + 3 Bottom)
    if (page.layout === 'five-photo-editorial') {
      return (
        <div className="w-full h-full flex flex-col" style={{ gap: `${spreadPhotoGap}px` }}>
          <div className="flex-1 grid grid-cols-2" style={{ gap: `${spreadPhotoGap}px` }}>
            {page.slots[0] && renderSlotInteractive(page.slots[0], 'h-full', readOnly)}
            {page.slots[1] && renderSlotInteractive(page.slots[1], 'h-full', readOnly)}
          </div>
          <div className="flex-1 grid grid-cols-3" style={{ gap: `${spreadPhotoGap}px` }}>
            {page.slots[2] && renderSlotInteractive(page.slots[2], 'h-full', readOnly)}
            {page.slots[3] && renderSlotInteractive(page.slots[3], 'h-full', readOnly)}
            {page.slots[4] && renderSlotInteractive(page.slots[4], 'h-full', readOnly)}
          </div>
        </div>
      );
    }

    // 11. EDITORIAL MAGAZINE & POLAROID (4 Photos + Editorial styling)
    if (page.layout === 'editorial-magazine-polaroid') {
      return (
        <div className="w-full h-full flex gap-3 p-1">
          {/* Left Hero Column */}
          <div className="w-5/12 h-full flex flex-col justify-between">
            <div className="flex-1 h-4/5">
              {page.slots[0] && renderSlotInteractive(page.slots[0], 'h-full rounded-md shadow-xs', readOnly)}
            </div>
            <div className="pt-2 text-center">
              <span className="text-[10px] font-serif tracking-widest uppercase text-[#8C6D37] block font-bold">
                Editorial Moments
              </span>
              <span className="text-[8px] text-[#736B60] italic">Colección Especial</span>
            </div>
          </div>

          {/* Right Column: 1 Landscape + 2 Mini Polaroids */}
          <div className="w-7/12 h-full flex flex-col" style={{ gap: `${spreadPhotoGap}px` }}>
            <div className="h-1/2">
              {page.slots[1] && renderSlotInteractive(page.slots[1], 'h-full rounded-md', readOnly)}
            </div>
            <div className="h-1/2 grid grid-cols-2 gap-2">
              <div className="bg-white p-1.5 rounded-lg border border-[#E8E2D5] shadow-xs flex flex-col">
                <div className="flex-1">
                  {page.slots[2] && renderSlotInteractive(page.slots[2], 'h-full rounded-xs', readOnly)}
                </div>
                <span className="text-[7px] text-center text-[#736B60] font-mono mt-1">polaroid 01</span>
              </div>
              <div className="bg-white p-1.5 rounded-lg border border-[#E8E2D5] shadow-xs flex flex-col">
                <div className="flex-1">
                  {page.slots[3] && renderSlotInteractive(page.slots[3], 'h-full rounded-xs', readOnly)}
                </div>
                <span className="text-[7px] text-center text-[#736B60] font-mono mt-1">polaroid 02</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 12. BOTANICAL FLORAL SCRAPBOOK (5 Photos + Botanical Embellishments)
    if (page.layout === 'botanical-floral-scrapbook') {
      return (
        <div className="w-full h-full flex flex-col justify-between p-1 bg-[#FAF7F2] rounded-xl border border-[#EAE4D8]/80 relative overflow-hidden">
          {/* Botanical Header */}
          <div className="text-center py-0.5 border-b border-[#E8E2D5]/60 flex items-center justify-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-[#8C6D37]" />
            <span className="font-serif italic text-[11px] text-[#556B2F] font-bold">
              🌿 fleur & sweet memories 🌿
            </span>
            <Sparkles className="w-2.5 h-2.5 text-[#8C6D37]" />
          </div>

          {/* Top Hero Photo with subtle frame */}
          <div className="flex-1 my-1.5 bg-white p-1.5 rounded-lg border border-[#E0D8C8] shadow-xs">
            {page.slots[0] && renderSlotInteractive(page.slots[0], 'h-full rounded', readOnly)}
          </div>

          {/* Bottom 4 Mini Stamp Slots */}
          <div className="grid grid-cols-4 gap-1.5 h-24">
            {page.slots.slice(1, 5).map((slot, idx) => (
              <div key={slot.id} className="bg-white p-1 rounded-md border border-[#E8E2D5] shadow-2xs flex flex-col">
                <div className="flex-1">
                  {renderSlotInteractive(slot, 'h-full rounded-xs', readOnly)}
                </div>
                <span className="text-[6px] text-center text-[#8C6D37] font-mono mt-0.5">#{idx + 1}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 13. MOODBOARD MOSAIC 9 (9 Photos Grid)
    if (page.layout === 'moodboard-mosaic-9') {
      const gap = Math.max(2, Math.floor(spreadPhotoGap / 2));
      return (
        <div className="w-full h-full grid grid-cols-3 grid-rows-3" style={{ gap: `${gap}px` }}>
          <div className="col-span-1">{page.slots[0] && renderSlotInteractive(page.slots[0], 'h-full', readOnly)}</div>
          <div className="col-span-2">{page.slots[1] && renderSlotInteractive(page.slots[1], 'h-full', readOnly)}</div>
          <div className="row-span-2">{page.slots[2] && renderSlotInteractive(page.slots[2], 'h-full', readOnly)}</div>
          <div className="col-span-1">{page.slots[3] && renderSlotInteractive(page.slots[3], 'h-full', readOnly)}</div>
          <div className="col-span-1">{page.slots[4] && renderSlotInteractive(page.slots[4], 'h-full', readOnly)}</div>
          <div className="col-span-1">{page.slots[5] && renderSlotInteractive(page.slots[5], 'h-full', readOnly)}</div>
          <div className="col-span-1">{page.slots[6] && renderSlotInteractive(page.slots[6], 'h-full', readOnly)}</div>
          <div className="col-span-2">{page.slots[7] && renderSlotInteractive(page.slots[7], 'h-full', readOnly)}</div>
          <div className="col-span-1">{page.slots[8] && renderSlotInteractive(page.slots[8], 'h-full', readOnly)}</div>
        </div>
      );
    }

    // 14. LIFESTYLE BENTO 10 (10 Micro-detail Photos)
    if (page.layout === 'lifestyle-bento-10') {
      const gap = Math.max(2, Math.floor(spreadPhotoGap / 2));
      return (
        <div className="w-full h-full flex flex-col justify-between" style={{ gap: `${gap}px` }}>
          <div className="flex-1 grid grid-cols-3" style={{ gap: `${gap}px` }}>
            {page.slots.slice(0, 3).map((slot) => renderSlotInteractive(slot, 'h-full', readOnly))}
          </div>
          <div className="flex-1 grid grid-cols-4" style={{ gap: `${gap}px` }}>
            {page.slots.slice(3, 7).map((slot) => renderSlotInteractive(slot, 'h-full', readOnly))}
          </div>
          <div className="flex-1 grid grid-cols-3" style={{ gap: `${gap}px` }}>
            {page.slots.slice(7, 10).map((slot) => renderSlotInteractive(slot, 'h-full', readOnly))}
          </div>
        </div>
      );
    }

    // 15. BLANK PAGE
    if (page.layout === 'blank') {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-[#A89F91] text-xs italic gap-1">
          <Sparkles className="w-4 h-4 text-[#D6CEBE]" />
          <span>Página en Blanco Fine Art</span>
        </div>
      );
    }

    // Default fallback
    return (
      <div className="w-full h-full flex items-center justify-center">
        {page.slots[0] && renderSlotInteractive(page.slots[0], 'w-full h-full', readOnly)}
      </div>
    );
  };

  const selectedSlotData = (() => {
    if (!selectedSlotId) return null;
    const activeSpread = spreads[activeSpreadIndex];
    if (!activeSpread) return null;
    const leftSlots = activeSpread.leftPage?.slots || [];
    const rightSlots = activeSpread.rightPage?.slots || [];
    const leftSlotIndex = leftSlots.findIndex((s) => s.id === selectedSlotId);
    if (leftSlotIndex !== -1) {
      const slot = leftSlots[leftSlotIndex];
      const photo = uploadedPhotos.find((p) => p.id === slot.photoId);
      return {
        slot,
        photo,
        pageSide: 'left' as const,
        pageNumber: activeSpreadIndex * 2 + 1,
        slotIndex: leftSlotIndex + 1,
      };
    }
    const rightSlotIndex = rightSlots.findIndex((s) => s.id === selectedSlotId);
    if (rightSlotIndex !== -1) {
      const slot = rightSlots[rightSlotIndex];
      const photo = uploadedPhotos.find((p) => p.id === slot.photoId);
      return {
        slot,
        photo,
        pageSide: 'right' as const,
        pageNumber: activeSpreadIndex * 2 + 2,
        slotIndex: rightSlotIndex + 1,
      };
    }
    return null;
  })();

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col bg-[#F7F5EE] text-[#1F1C18] select-none overflow-hidden"
    >
      {/* Top Header / Step Bar */}
      <div className="flex items-center justify-between border-b border-[#E0D8C8] bg-[#FDFCF9] px-4 sm:px-6 py-3.5 shadow-sm shrink-0 z-10">
        {/* Brand & Project Title */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-[#736B60] hover:bg-[#F2ECE1] hover:text-[#1F1C18] transition-colors"
            title="Cerrar y Volver"
          >
            <X className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-brand text-sm tracking-widest text-[#8C6D37] font-semibold">HALO STUDIO</span>
              <span className="text-xs text-[#A89F91]">/</span>
              <span className="text-xs font-semibold text-[#1F1C18]">{foilTitleText || 'Nuevo Fotolibro'}</span>
            </div>
            <p className="text-[11px] text-[#736B60] hidden sm:block">
              {currentFormat.name} · {currentCover.name} · {totalPages} páginas
            </p>
          </div>
        </div>

        {/* Step Tabs */}
        <div className="hidden md:flex items-center gap-1 rounded-full border border-[#D6CEBE] bg-[#F2ECE1]/70 p-1 text-xs">
          {[
            { id: 'config', label: '1. Configuración del Libro' },
            { id: 'editor', label: '2. Diseñar Páginas' },
            { id: 'preview', label: '3. Hojeado 3D' },
          ].map((tab) => {
            const isActive =
              currentStep === tab.id ||
              (tab.id === 'config' &&
                (currentStep === 'format' || currentStep === 'cover' || currentStep === 'paper'));
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCurrentStep(tab.id as any)}
                className={`px-4 py-1.5 rounded-full font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1F1C18] text-[#FDFCF9] shadow-sm'
                    : 'text-[#736B60] hover:text-[#1F1C18]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Price & Action Buttons */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Real-time Auto-save Badge */}
          <div
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#D6CEBE]/80 bg-[#FAF8F5] text-[11px] font-medium text-[#736B60] select-none"
            title="Sincronización automática activa en IndexedDB, LocalStorage y Supabase"
          >
            {isAutoSaving ? (
              <>
                <div className="w-2 h-2 rounded-full bg-[#8C6D37] animate-pulse"></div>
                <span className="text-[#8C6D37]">Guardando...</span>
              </>
            ) : lastAutoSavedTime ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                <span>Autoguardado {lastAutoSavedTime}</span>
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/70"></div>
                <span>Autoguardado activo</span>
              </>
            )}
          </div>

          {/* Save to Account / Draft button */}
          <button
            type="button"
            onClick={handleSaveDraft}
            className="px-3.5 py-2 rounded-full border border-[#D6CEBE] bg-[#F7F3EB] hover:bg-[#EFE9DE] text-xs font-semibold text-[#1F1C18] transition-all flex items-center gap-1.5 shadow-sm"
            title="Guardar borrador en mi cuenta de Supabase"
          >
            {saveStatus === 'saving' ? (
              <div className="w-3.5 h-3.5 border-2 border-[#8C6D37] border-t-transparent rounded-full animate-spin"></div>
            ) : saveStatus === 'saved' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Save className="w-3.5 h-3.5 text-[#8C6D37]" />
            )}
            <span className="hidden sm:inline">
              {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? '¡Guardado!' : 'Guardar en mi Cuenta'}
            </span>
          </button>

          <div className="text-right hidden sm:block">
            <span className="text-[10px] uppercase tracking-wider text-[#736B60] block">Inversión Total</span>
            <span className="font-serif-luxury text-lg sm:text-xl font-bold text-[#1F1C18]">
              {formatPriceARS(totalPrice)} ARS
            </span>
          </div>

          <button
            type="button"
            onClick={handleFinishAndOrder}
            className="px-4 sm:px-5 py-2.5 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-wider font-semibold hover:bg-[#3D352E] shadow-md transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#ECC880]" />
            <span>Finalizar y Pedir</span>
          </button>
        </div>
      </div>

      {/* Main Workspace based on Step */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* UNIFIED STEP 1: ALL-IN-ONE PHOTOBOOK CONFIGURATION (Formato, Tapas/Grabado & Papel) */}
        {(currentStep === 'config' || currentStep === 'format' || currentStep === 'cover' || currentStep === 'paper') && (
          <div className="w-full flex-1 overflow-y-auto bg-[#FAF8F5] p-3 sm:p-5 lg:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header Title Bar */}
              <div className="mb-4 sm:mb-6 text-left border-b border-[#E8E2D5] pb-3 sm:pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold tracking-widest text-[#8C6D37] uppercase block mb-1">
                    Paso 1 de 3 · Configuración Integral
                  </span>
                  <h1 className="font-serif-luxury text-xl sm:text-2xl lg:text-3xl font-bold text-[#1F1C18] leading-tight">
                    Configuración de tu Fotolibro Fine Art
                  </h1>
                  <p className="text-xs sm:text-sm text-[#595248] mt-1">
                    Personaliza el formato, los materiales de portada, el grabado en oro y el papel químico en una sola vista.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentStep('editor')}
                  className="px-5 py-2.5 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-wider font-semibold hover:bg-[#3D352E] shadow-md transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shrink-0 cursor-pointer self-start sm:self-auto"
                >
                  <span>Continuar a Diseñar Páginas</span>
                  <ChevronRight className="w-4 h-4 text-[#ECC880]" />
                </button>
              </div>

              {/* 2-Column Responsive Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                {/* LEFT COLUMN: Sticky Real-time 3D Preview & Specs Card */}
                <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-3 space-y-4">
                  <div className="rounded-2xl border border-[#D6CEBE] bg-[#FDFCF9] p-4 sm:p-5 shadow-lg space-y-4">
                    <div className="flex items-center justify-between border-b border-[#E8E2D5] pb-2.5">
                      <span className="text-[9px] font-bold tracking-widest text-[#8C6D37] uppercase">
                        Vista Previa en Tiempo Real
                      </span>
                      <span className="text-[10px] font-bold text-[#1F1C18] bg-[#EFE9DE] px-2 py-0.5 rounded-full">
                        {currentFormat.dimensions}
                      </span>
                    </div>

                    {/* The Luxury Book Cover Live Mockup — realistic 3D tilted hardcover */}
                    <div className="flex justify-center py-4">
                      <div
                        className="w-full max-w-[180px] sm:max-w-[195px]"
                        style={{ perspective: '1100px' }}
                      >
                        <div
                          className="relative transition-transform duration-500 ease-out"
                          style={{ transformStyle: 'preserve-3d', transform: 'rotateY(-24deg) rotateX(3deg)' }}
                        >
                          {/* Spine / page-block side face, gives the cover real thickness */}
                          <div
                            className="absolute top-[3%] bottom-[3%] w-[16px] rounded-l-[2px]"
                            style={{
                              left: '-16px',
                              transform: 'rotateY(-90deg)',
                              transformOrigin: 'right center',
                              background: isPhotoCover
                                ? 'linear-gradient(to bottom, #37332C, #1C1A17)'
                                : `linear-gradient(to bottom, ${currentCover.colorHex}, rgba(0,0,0,0.55))`,
                              boxShadow: 'inset -3px 0 6px rgba(0,0,0,0.45)',
                            }}
                          >
                            {/* Fine art paper-block stripes on the spine */}
                            <div className="absolute inset-y-[6%] left-[3px] right-[3px] bg-[repeating-linear-gradient(to_bottom,rgba(255,255,255,0.35)_0px,rgba(255,255,255,0.35)_1px,transparent_1px,transparent_3px)] opacity-40" />
                          </div>

                          {/* Front cover face */}
                          <div
                            className={`aspect-[4/5] rounded-r-lg rounded-l-[2px] p-4 flex flex-col justify-between relative border border-black/20 overflow-hidden ${!isPhotoCover ? currentCover.textureClass : ''}`}
                            style={{
                              backgroundColor: isPhotoCover ? '#1C1A17' : currentCover.colorHex,
                              boxShadow: '14px 22px 34px -12px rgba(20,16,10,0.55), 3px 4px 10px rgba(0,0,0,0.25)',
                            }}
                          >
                            {/* Full-bleed client photo for "Tapa Dura Fotográfica" */}
                            {isPhotoCover && (
                              coverPreviewPhotoUrl ? (
                                <img
                                  src={coverPreviewPhotoUrl}
                                  alt="Foto de Portada"
                                  className="absolute inset-0 w-full h-full object-cover"
                                />
                              ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#3A362F] to-[#1C1A17] text-[#C7BFA8]">
                                  <ImageIcon className="w-6 h-6 opacity-60" />
                                  <span className="text-[8px] uppercase tracking-widest opacity-70 px-4 text-center leading-relaxed">
                                    Subí tus fotos para verlas en la portada
                                  </span>
                                </div>
                              )
                            )}

                            {/* Layered Realistic Texture Overlay for material covers */}
                            {!isPhotoCover && (
                              <>
                                <div className={`absolute inset-0 ${currentCover.textureClass} opacity-40 pointer-events-none`} />
                                <div className="absolute inset-0 bg-gradient-to-tr from-black/10 via-transparent to-white/15 pointer-events-none" />
                              </>
                            )}

                            {/* Gradient so the gold foil title stays legible over a photo */}
                            {isPhotoCover && (
                              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/45 pointer-events-none" />
                            )}

                            {/* Left Spine Crease Shadow */}
                            <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black/35 via-black/15 to-transparent pointer-events-none" />

                            {/* Sheen highlight to sell the 3D tilt */}
                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-black/20 pointer-events-none" />

                            {/* Optional die-cut Cover Photo Window — only for non-photo materials */}
                            {!isPhotoCover && (
                              hasCoverWindow ? (
                                <div className="w-14 h-14 mx-auto my-auto rounded-lg border-2 border-[#C5A059]/60 overflow-hidden shadow-md relative bg-white ring-1 ring-black/10 z-10">
                                  <img
                                    src={getPhotoDisplayUrl(uploadedPhotos[0]) || 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80'}
                                    alt="Foto de Portada"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="h-3" />
                              )
                            )}

                            {/* Embossed & Stamped Hot Foil Title */}
                            <div className="text-center relative z-10 my-auto px-1">
                              <span
                                className="font-brand text-xs sm:text-sm font-bold tracking-[0.18em] block uppercase foil-stamping-emboss drop-shadow-xs truncate"
                                style={{
                                  color: FOIL_OPTIONS.find(f => f.id === foilColor)?.colorHex || '#D4AF37',
                                }}
                              >
                                {foilTitleText || 'HALO FINE ART'}
                              </span>

                              <span
                                className="font-serif-luxury text-[9px] sm:text-[10px] tracking-[0.12em] block uppercase mt-0.5 font-medium opacity-90 foil-stamping-emboss truncate"
                                style={{
                                  color: FOIL_OPTIONS.find(f => f.id === foilColor)?.colorHex || '#D4AF37',
                                }}
                              >
                                {foilSubtitleText}
                              </span>
                            </div>

                            {/* Bottom Spine & Brand Stamp */}
                            <div className="text-center text-[7px] tracking-[0.25em] uppercase opacity-60 font-brand relative z-10">
                              {currentCover.name} · FINE ART LAB
                            </div>
                          </div>
                        </div>

                        {/* Grounding contact shadow beneath the tilted book */}
                        <div
                          className="mx-auto mt-1 h-3 rounded-full bg-black/30 blur-md"
                          style={{ width: '78%' }}
                        />
                      </div>
                    </div>

                    {/* Summary Technical Specs */}
                    <div className="rounded-xl bg-[#F5EFE6]/60 border border-[#E8E2D5] p-3 space-y-2 text-xs">
                      <div className="flex justify-between items-center text-[#595248]">
                        <span className="font-semibold text-[#1F1C18]">Formato:</span>
                        <span className="font-bold text-[#8C6D37]">{currentFormat.name}</span>
                      </div>
                      <div className="flex justify-between items-center text-[#595248]">
                        <span className="font-semibold text-[#1F1C18]">Material Tapa:</span>
                        <span className="font-medium text-[#1F1C18] truncate max-w-[150px]">{currentCover.name}</span>
                      </div>
                      <div className="flex justify-between items-center text-[#595248]">
                        <span className="font-semibold text-[#1F1C18]">Hot Stamping:</span>
                        <span className="font-medium text-[#1F1C18]">{FOIL_OPTIONS.find(f => f.id === foilColor)?.name}</span>
                      </div>
                      <div className="flex justify-between items-center text-[#595248]">
                        <span className="font-semibold text-[#1F1C18]">Papel Químico:</span>
                        <span className="font-medium text-[#1F1C18] truncate max-w-[150px]">{currentPaper.name}</span>
                      </div>
                      <div className="flex justify-between items-center text-[#595248]">
                        <span className="font-semibold text-[#1F1C18]">Cofre Presentación:</span>
                        <span className={`font-semibold ${giftBoxIncluded ? 'text-emerald-700' : 'text-[#736B60]'}`}>
                          {giftBoxIncluded ? 'Incluido' : 'Sin cofre'}
                        </span>
                      </div>
                    </div>

                    {/* Total Price & Large Action CTA */}
                    <div className="pt-2 border-t border-[#E8E2D5] space-y-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs uppercase font-bold text-[#736B60] tracking-wider">Inversión Final</span>
                        <span className="font-serif-luxury text-xl sm:text-2xl font-bold text-[#1F1C18]">
                          {formatPriceARS(totalPrice)} ARS
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCurrentStep('editor')}
                        className="w-full py-3 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-wider font-bold hover:bg-[#3D352E] shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Comenzar a Diseñar Páginas</span>
                        <ChevronRight className="w-4 h-4 text-[#ECC880]" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Unified Configuration Controls (3 Sections in One) */}
                <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                  {/* SECCIÓN 1: FORMATO Y TAMAÑO */}
                  <div className="rounded-2xl border border-[#D6CEBE] bg-[#FDFCF9] p-4 sm:p-5 shadow-sm space-y-3">
                    <div className="border-b border-[#E8E2D5] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#8C6D37] text-white flex items-center justify-center text-xs font-bold">
                          1
                        </span>
                        <h2 className="font-serif-luxury text-base sm:text-lg font-bold text-[#1F1C18]">
                          Formato y Tamaño del Libro
                        </h2>
                      </div>
                      <p className="text-xs text-[#595248] mt-0.5 ml-8">
                        Encuadernación rígida 100% Layflat de apertura plana a 180° en auténtico papel químico Fuji.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                      {BOOK_FORMATS.map((fmt) => {
                        const isSelected = fmt.id === formatId;
                        return (
                          <div
                            key={fmt.id}
                            onClick={() => setFormatId(fmt.id)}
                            className={`cursor-pointer rounded-xl border p-3 transition-all relative flex flex-col justify-between ${
                              isSelected
                                ? 'border-[#8C6D37] bg-[#FAF6EF] shadow-md ring-2 ring-[#8C6D37]/40'
                                : 'border-[#D6CEBE] bg-[#F4EFE6]/40 hover:bg-[#FDFCF9] hover:border-[#B8AB98]'
                            }`}
                          >
                            {fmt.popular && (
                              <span className="absolute top-2 right-2 bg-[#8C6D37] text-white text-[8px] tracking-wider uppercase font-bold px-2 py-0.5 rounded-full shadow-xs">
                                Más Elegido
                              </span>
                            )}

                            <div>
                              <div className="flex items-baseline justify-between gap-1 mb-1 pr-14">
                                <h3 className="font-serif-luxury text-sm font-bold text-[#1F1C18] leading-tight">
                                  {fmt.name}
                                </h3>
                              </div>

                              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                <span className="font-mono text-xs text-[#8C6D37] font-bold">{fmt.dimensions}</span>
                                <span className="font-serif-luxury text-sm font-bold text-[#1F1C18]">
                                  {formatPriceARS(fmt.basePrice)}
                                </span>
                              </div>

                              <p className="text-[10px] text-[#595248] leading-tight line-clamp-2 mb-2">
                                {fmt.description}
                              </p>
                            </div>

                            <div className="flex items-center justify-between border-t border-[#E8E2D5] pt-1.5 text-[10px] text-[#736B60]">
                              <span>{fmt.basePages} pág. rígidas</span>
                              <span className="font-semibold text-[#1F1C18]">Fotos: {fmt.idealPhotos}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SECCIÓN 2: TAPAS, MATERIALES & GRABADO */}
                  <div className="rounded-2xl border border-[#D6CEBE] bg-[#FDFCF9] p-4 sm:p-5 shadow-sm space-y-4">
                    <div className="border-b border-[#E8E2D5] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#8C6D37] text-white flex items-center justify-center text-xs font-bold">
                          2
                        </span>
                        <h2 className="font-serif-luxury text-base sm:text-lg font-bold text-[#1F1C18]">
                          Tapas, Materiales & Grabado en Oro
                        </h2>
                      </div>
                      <p className="text-xs text-[#595248] mt-0.5 ml-8">
                        Telas de lino natural, cueros de grano fino, sedas y grabado artesanal en caliente.
                      </p>
                    </div>

                    {/* Material Family Category Tabs */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[#1F1C18] block">
                          Material y Textura:
                        </label>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          {[
                            { id: 'all', label: 'Todos' },
                            // 'lino' se sacó del catálogo (no se consigue la tela) — ver
                            // ACTIVE_COVER_CATEGORIES en src/data/mockData.ts.
                            { id: 'cuero', label: 'Cuero' },
                            { id: 'seda', label: 'Seda' },
                            { id: 'terciopelo', label: 'Terciopelo' },
                          ].map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setCoverMaterialCategoryFilter(cat.id as any)}
                              className={`px-2 py-1 rounded-full font-bold transition-colors cursor-pointer ${
                                coverMaterialCategoryFilter === cat.id
                                  ? 'bg-[#8C6D37] text-white'
                                  : 'bg-[#EFE9DE] text-[#736B60] hover:text-[#1F1C18]'
                              }`}
                            >
                              {cat.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Cover Materials Swatches Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {COVER_MATERIALS
                          .filter((cov) => coverMaterialCategoryFilter === 'all' || cov.category === coverMaterialCategoryFilter)
                          .map((cov) => {
                            const isSelected = cov.id === coverMaterialId;
                            return (
                              <button
                                key={cov.id}
                                type="button"
                                onClick={() => setCoverMaterialId(cov.id)}
                                className={`flex flex-col items-center text-center p-2 rounded-xl border transition-all cursor-pointer ${
                                  isSelected
                                    ? 'border-[#8C6D37] bg-[#FAF6EF] shadow-sm ring-2 ring-[#8C6D37]/50 scale-[1.02]'
                                    : 'border-[#D6CEBE] bg-[#F4EFE6]/50 hover:bg-[#FDFCF9]'
                                }`}
                              >
                                <div
                                  className="w-6 h-6 rounded-full border border-black/15 shadow-xs mb-1"
                                  style={{ backgroundColor: cov.colorHex }}
                                />
                                <span className="text-[9.5px] font-bold text-[#1F1C18] truncate w-full leading-tight">{cov.name}</span>
                                <span className="text-[8.5px] text-[#736B60] mt-0.5">
                                  {cov.priceDelta > 0 ? `+${formatPriceARS(cov.priceDelta)}` : 'Incluido'}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>

                    {/* Foil Stamping Color */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#1F1C18] block">
                        Color de Grabado en Hot Stamping:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                        {FOIL_OPTIONS.map((f) => {
                          const isSelected = f.id === foilColor;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setFoilColor(f.id)}
                              className={`flex items-center gap-1.5 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-[#8C6D37] bg-[#FAF6EF] shadow-xs ring-2 ring-[#8C6D37]'
                                  : 'border-[#D6CEBE] bg-[#F4EFE6]/50 hover:bg-[#FDFCF9]'
                              }`}
                            >
                              <div
                                className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0 shadow-2xs"
                                style={{ backgroundColor: f.colorHex }}
                              />
                              <span className="text-[10px] font-medium text-[#1F1C18] truncate">{f.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Foil Title Input & Window Toggle */}
                    <div className="space-y-2 rounded-xl border border-[#D6CEBE] bg-[#FAF7F2] p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9.5px] font-bold uppercase tracking-wider text-[#1F1C18] block mb-1">
                            Título Principal de Portada:
                          </label>
                          <input
                            type="text"
                            value={foilTitleText}
                            onChange={(e) => setFoilTitleText(e.target.value.toUpperCase())}
                            placeholder="EJ: NUESTRA HISTORIA"
                            className="w-full rounded-lg border border-[#D6CEBE] bg-white px-2.5 py-1.5 text-xs font-brand tracking-wider text-[#1F1C18] focus:border-[#8C6D37] focus:outline-none shadow-xs"
                            maxLength={35}
                          />
                        </div>

                        <div>
                          <label className="text-[9.5px] font-bold uppercase tracking-wider text-[#1F1C18] block mb-1">
                            Subtítulo / Fecha / Lugar:
                          </label>
                          <input
                            type="text"
                            value={foilSubtitleText}
                            onChange={(e) => setFoilSubtitleText(e.target.value.toUpperCase())}
                            placeholder="EJ: 2026 · PATAGONIA"
                            className="w-full rounded-lg border border-[#D6CEBE] bg-white px-2.5 py-1.5 text-xs font-serif-luxury tracking-wide text-[#1F1C18] focus:border-[#8C6D37] focus:outline-none shadow-xs"
                            maxLength={45}
                          />
                        </div>
                      </div>

                      {/* Cover Window toggle */}
                      <div className="flex items-center justify-between border-t border-[#E8E2D5] pt-2.5">
                        <div>
                          <span className="text-xs font-bold text-[#1F1C18] block">Ventana Fotográfica Calada</span>
                          <span className="text-[10px] text-[#736B60]">Troquelado con marco biselado en el centro de la portada</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={hasCoverWindow}
                          onChange={(e) => setHasCoverWindow(e.target.checked)}
                          className="w-4 h-4 accent-[#8C6D37] rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 3: PAPEL FOTOGRÁFICO FINE ART & PRESENTACIÓN */}
                  <div className="rounded-2xl border border-[#D6CEBE] bg-[#FDFCF9] p-4 sm:p-5 shadow-sm space-y-4">
                    <div className="border-b border-[#E8E2D5] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#8C6D37] text-white flex items-center justify-center text-xs font-bold">
                          3
                        </span>
                        <h2 className="font-serif-luxury text-base sm:text-lg font-bold text-[#1F1C18]">
                          Auténtico Papel Fotográfico Fine Art & Presentación
                        </h2>
                      </div>
                      <p className="text-xs text-[#595248] mt-0.5 ml-8">
                        Papel químico de máxima durabilidad tonal (100+ años) y accesorios de conservación.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {PAPER_FINISHES.map((paper) => {
                        const isSelected = paper.id === paperFinishId;
                        return (
                          <div
                            key={paper.id}
                            onClick={() => setPaperFinishId(paper.id)}
                            className={`cursor-pointer rounded-xl border p-3 transition-all flex flex-col justify-between ${
                              isSelected
                                ? 'border-[#8C6D37] bg-[#FAF6EF] shadow-md ring-2 ring-[#8C6D37]/40'
                                : 'border-[#D6CEBE] bg-[#F4EFE6]/40 hover:bg-[#FDFCF9]'
                            }`}
                          >
                            <div>
                              <span className="inline-block bg-[#8C6D37]/15 text-[#8C6D37] text-[8.5px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full mb-1.5">
                                {paper.badge}
                              </span>
                              <h3 className="font-serif-luxury text-sm font-bold text-[#1F1C18] mb-0.5">{paper.name}</h3>
                              <p className="text-[10px] text-[#8C6D37] font-semibold mb-1">{paper.subtitle}</p>
                              <p className="text-[10px] text-[#595248] leading-tight mb-2 line-clamp-2">{paper.description}</p>
                            </div>

                            <div className="border-t border-[#E8E2D5] pt-1.5 flex items-center justify-between text-[10px]">
                              <span className="text-[#736B60] font-mono">{paper.grammage}</span>
                              <span className="font-bold text-[#1F1C18]">
                                {paper.priceDelta > 0 ? `+${formatPriceARS(paper.priceDelta)} ARS` : 'Incluido'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Gift Box Addon */}
                    <div className="rounded-xl border border-[#D6CEBE] bg-[#FAF7F2] p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[#EFE9DE] flex items-center justify-center text-[#8C6D37] shrink-0 shadow-2xs">
                          <Gift className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-serif-luxury text-xs font-bold text-[#1F1C18]">Cofre / Caja de Presentación en Lino</h4>
                          <p className="text-[10px] text-[#595248]">
                            Caja rígida forrada en lino con cinta de satén para extracción suave y protección.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="font-serif-luxury text-xs font-bold text-[#1F1C18]">
                          +{formatPriceARS(28000)} ARS
                        </span>
                        <input
                          type="checkbox"
                          checked={giftBoxIncluded}
                          onChange={(e) => setGiftBoxIncluded(e.target.checked)}
                          className="w-4 h-4 accent-[#8C6D37] rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Final Continue Button Footer */}
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setCurrentStep('editor')}
                      className="px-6 py-3 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-wider font-semibold hover:bg-[#3D352E] shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
                    >
                      <span>Guardar Configuración y Continuar a Diseñar Páginas</span>
                      <ChevronRight className="w-4 h-4 text-[#ECC880]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: INTERACTIVE SPREAD & PHOTO EDITOR (Optimized Unified Layout) */}
        {currentStep === 'editor' && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
            {/* Hidden file input for uploading photos from any upload trigger */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* LEFT SIDEBAR: BANCO DE FOTOS & TIRA DE PLIEGOS (Pro Studio Panel) */}
            <div
              style={{ width: isLeftSidebarCollapsed ? undefined : `${leftSidebarWidth}px` }}
              className={`transition-all duration-200 border-r border-[#E0D8C8] bg-[#FDFCF9] flex flex-col shrink-0 z-20 ${
                isLeftSidebarCollapsed ? 'w-14 items-center' : ''
              }`}
            >
              {isLeftSidebarCollapsed ? (
                <div className="flex flex-col items-center py-3 gap-4 w-full h-full">
                  <button
                    type="button"
                    onClick={() => setIsLeftSidebarCollapsed(false)}
                    className="p-2 rounded-xl bg-[#FAF7F2] border border-[#D6CEBE] text-[#8C6D37] hover:bg-[#EFE9DE] shadow-xs transition-colors"
                    title="Expandir Galería de Fotos y Pliegos"
                  >
                    <PanelLeftOpen className="w-5 h-5" />
                  </button>

                  <div className="w-8 h-[1px] bg-[#E8E2D5]" />

                  <button
                    type="button"
                    onClick={() => {
                      setLeftSidebarTab('photos');
                      setIsLeftSidebarCollapsed(false);
                    }}
                    className={`relative p-2.5 rounded-xl transition-all ${
                      leftSidebarTab === 'photos'
                        ? 'bg-[#1F1C18] text-[#ECC880] shadow-sm'
                        : 'text-[#736B60] hover:bg-[#FAF7F2]'
                    }`}
                    title={`Galería de Fotos (${uploadedPhotos.length})`}
                  >
                    <ImageIcon className="w-5 h-5" />
                    <span className="absolute -top-1 -right-1 bg-[#8C6D37] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {uploadedPhotos.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLeftSidebarTab('spreads');
                      setIsLeftSidebarCollapsed(false);
                    }}
                    className={`relative p-2.5 rounded-xl transition-all ${
                      leftSidebarTab === 'spreads'
                        ? 'bg-[#1F1C18] text-[#ECC880] shadow-sm'
                        : 'text-[#736B60] hover:bg-[#FAF7F2]'
                    }`}
                    title={`Tira de Pliegos (${spreads.length})`}
                  >
                    <Layers className="w-5 h-5" />
                    <span className="absolute -top-1 -right-1 bg-[#8C6D37] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {spreads.length}
                    </span>
                  </button>

                  {isOptimizingPhotos && (
                    <button
                      type="button"
                      onClick={() => setIsLeftSidebarCollapsed(false)}
                      className="p-2 rounded-xl bg-[#FAF6EF] border border-[#8C6D37]/40 flex flex-col items-center gap-1 shadow-xs animate-pulse cursor-pointer"
                      title="Optimizando fotos... Clic para ver progreso"
                    >
                      <Loader2 className="w-4 h-4 animate-spin text-[#8C6D37]" />
                      <span className="text-[8px] font-bold font-mono text-[#8C6D37]">
                        {optimizingProgress ? `${Math.round((optimizingProgress.current / Math.max(1, optimizingProgress.total)) * 100)}%` : '...'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-xl bg-[#FAF7F2] border border-dashed border-[#8C6D37] text-[#8C6D37] hover:bg-[#EFE9DE] mt-auto mb-2 transition-colors"
                    title="Subir Fotos"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col h-full overflow-hidden">
                  {/* Header Tabs */}
                  <div className="p-2.5 border-b border-[#E0D8C8] bg-[#F9F6EE] flex items-center justify-between gap-1.5 shrink-0">
                    <div className="flex items-center gap-1 bg-[#EFE9DE] p-0.5 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setLeftSidebarTab('photos')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                          leftSidebarTab === 'photos'
                            ? 'bg-[#1F1C18] text-[#FDFCF9] shadow-xs'
                            : 'text-[#595248] hover:text-[#1F1C18]'
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-[#ECC880]" />
                        <span>Fotos ({uploadedPhotos.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLeftSidebarTab('spreads')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                          leftSidebarTab === 'spreads'
                            ? 'bg-[#1F1C18] text-[#FDFCF9] shadow-xs'
                            : 'text-[#595248] hover:text-[#1F1C18]'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5 text-[#ECC880]" />
                        <span>Pliegos ({spreads.length})</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsLeftSidebarCollapsed(true)}
                      className="p-1.5 rounded-lg text-[#736B60] hover:text-[#1F1C18] hover:bg-[#EFE9DE] transition-colors"
                      title="Colapsar Panel Lateral"
                    >
                      <PanelLeftClose className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Photo Upload & Processing Progress Bar */}
                  {isOptimizingPhotos && (
                    <div className="p-3 bg-[#FAF6EF] border-b border-[#C5A059]/40 flex flex-col gap-1.5 shrink-0">
                      <div className="flex items-center justify-between text-[11px] font-bold text-[#8C6D37]">
                        <div className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8C6D37]" />
                          <span>Subiendo y Optimizando Fotos</span>
                        </div>
                        <span className="font-mono">
                          {optimizingProgress ? `${optimizingProgress.current}/${optimizingProgress.total}` : 'Iniciando...'}
                        </span>
                      </div>
                      
                      <div className="w-full h-2 bg-[#EFE9DE] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#8C6D37] via-[#C5A059] to-[#8C6D37] transition-all duration-200 rounded-full"
                          style={{
                            width: optimizingProgress 
                              ? `${Math.max(5, Math.round((optimizingProgress.current / Math.max(1, optimizingProgress.total)) * 100))}%` 
                              : '15%'
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-[#736B60]">
                        <span>Generando miniaturas HD...</span>
                        <span className="font-bold text-[#8C6D37]">
                          {optimizingProgress 
                            ? `${Math.round((optimizingProgress.current / Math.max(1, optimizingProgress.total)) * 100)}%` 
                            : '0%'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Tab 1: Fotos Panel */}
                  {leftSidebarTab === 'photos' && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      {/* Action Bar */}
                      <div className="p-2.5 border-b border-[#E8E2D5] bg-[#FDFCF9] space-y-2 shrink-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#8C6D37] text-white hover:bg-[#73582A] text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>+ Subir Fotos</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setSelectedPhotoIds(
                                selectedPhotoIds.length === uploadedPhotos.length ? [] : uploadedPhotos.map((p) => p.id)
                              )
                            }
                            className="px-2 py-1.5 rounded-xl border border-[#D6CEBE] hover:bg-[#FAF7F2] text-[10px] font-bold text-[#595248] cursor-pointer"
                          >
                            {selectedPhotoIds.length === uploadedPhotos.length ? 'Deseleccionar' : 'Seleccionar Todo'}
                          </button>

                          {uploadedPhotos.length > 0 && (
                            <button
                              type="button"
                              onClick={handleClearAllPhotos}
                              className="p-1.5 rounded-xl border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-600 hover:text-rose-700 text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer"
                              title="Vaciar toda la galería de fotos"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Filter Chips */}
                        <div className="flex items-center gap-1 text-[10px]">
                          {[
                            { id: 'all', label: `Todas (${uploadedPhotos.length})` },
                            {
                              id: 'unused',
                              label: `Sin usar (${
                                uploadedPhotos.filter((p) => getPhotoUsageCount(p.id) === 0).length
                              })`,
                            },
                            {
                              id: 'used',
                              label: `En uso (${
                                uploadedPhotos.filter((p) => getPhotoUsageCount(p.id) > 0).length
                              })`,
                            },
                          ].map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setPhotoUsageFilter(f.id as any)}
                              className={`flex-1 py-1 px-1.5 rounded-lg text-center font-medium transition-colors ${
                                photoUsageFilter === f.id
                                  ? 'bg-[#8C6D37] text-white font-bold'
                                  : 'bg-[#EFE9DE] text-[#595248] hover:bg-[#E2D8C7]'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>

                        {/* Multi-selection Banner */}
                        {selectedPhotoIds.length > 0 && (
                          <div className="p-2 rounded-xl bg-[#FAF6EF] border border-[#C5A059]/40 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-[#8C6D37]">
                                {selectedPhotoIds.length} foto(s) seleccionada(s)
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedPhotoIds([])}
                                className="text-[10px] text-[#736B60] hover:text-[#1F1C18] underline cursor-pointer"
                              >
                                Limpiar selección
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={handleAutoPopulateWithSelected}
                                className="flex-1 px-2 py-1 rounded-lg bg-[#8C6D37] text-white text-[10px] font-bold hover:bg-[#73582A] flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                              >
                                <Sparkles className="w-3 h-3 text-[#ECC880]" />
                                <span>Llenar</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleDeleteSelectedPhotos}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300 text-[10px] font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                title="Eliminar fotos seleccionadas de la galería"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Eliminar ({selectedPhotoIds.length})</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Helper banner when a canvas slot is selected */}
                      {selectedSlotId && (
                        <div className="mx-2.5 mt-1.5 p-2 rounded-xl bg-[#0091FF]/10 border border-[#0091FF]/30 flex items-center justify-between text-xs text-[#0066CC] animate-in fade-in duration-150 shrink-0">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                            <MousePointerClick className="w-3.5 h-3.5 shrink-0 text-[#0091FF]" />
                            <span>Haz clic en una foto para asignarla al marco</span>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => setSelectedSlotId(null)}
                            className="text-[10px] text-[#736B60] hover:text-[#1F1C18] underline ml-1 cursor-pointer shrink-0"
                          >
                            Listo
                          </button>
                        </div>
                      )}

                      {/* Scrollable Photos Grid */}
                      <div className="flex-1 overflow-y-auto p-2.5 min-h-0">
                        {uploadedPhotos.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center p-4 text-center">
                            <ImageIcon className="w-8 h-8 text-[#A89F91] mb-2" />
                            <p className="text-xs font-bold text-[#1F1C18]">No hay fotos subidas</p>
                            <p className="text-[10px] text-[#736B60] mt-1 mb-3">Sube tus fotos para empezar a diseñar</p>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="px-3 py-1.5 rounded-xl bg-[#8C6D37] text-white text-xs font-bold hover:bg-[#73582A]"
                            >
                              Subir Fotos
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {uploadedPhotos
                              .filter((p) => {
                                const usage = getPhotoUsageCount(p.id);
                                if (photoUsageFilter === 'unused') return usage === 0;
                                if (photoUsageFilter === 'used') return usage > 0;
                                return true;
                              })
                              .map((photo) => {
                                const usageCount = getPhotoUsageCount(photo.id);
                                const isSelected = selectedPhotoIds.includes(photo.id);

                                return (
                                  <div
                                    key={photo.id}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/plain', photo.id);
                                      setDraggedPhotoId(photo.id);
                                    }}
                                    onDragEnd={() => setDraggedPhotoId(null)}
                                    onClick={(e) => {
                                      if (selectedSlotId && !isMultiSelectMode && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                                        handleAssignPhotoToSlot(selectedSlotId, photo.id);
                                      } else {
                                        handleTogglePhotoSelection(photo.id, e);
                                      }
                                    }}
                                    onDoubleClick={() => {
                                      if (selectedSlotId) {
                                        handleAssignPhotoToSlot(selectedSlotId, photo.id);
                                      } else {
                                        const currentSpread = spreads[activeSpreadIndex];
                                        const emptyLeft = currentSpread?.leftPage.slots.find((s) => !s.photoId);
                                        const emptyRight = currentSpread?.rightPage.slots.find((s) => !s.photoId);
                                        const targetSlot = emptyLeft || emptyRight;
                                        if (targetSlot) {
                                          handleAssignPhotoToSlot(targetSlot.id, photo.id);
                                        }
                                      }
                                    }}
                                    className={`group relative aspect-square rounded-xl border-2 transition-all p-1 bg-white cursor-grab active:cursor-grabbing flex flex-col justify-between ${
                                      isSelected
                                        ? 'border-[#8C6D37] ring-2 ring-[#8C6D37]/40 shadow-md scale-[1.02]'
                                        : 'border-[#D6CEBE] hover:border-[#8C6D37] hover:shadow-xs'
                                    }`}
                                    title={selectedSlotId ? "Haz clic para asignar a la ranura seleccionada" : "Arrastra al pliego o haz doble clic para colocar"}
                                  >
                                    <div className="w-full h-full rounded-lg overflow-hidden bg-[#EFE9DE] relative">
                                      <img
                                        src={getThumbnailSrc(photo)}
                                        alt={photo.name}
                                        className="w-full h-full object-cover select-none pointer-events-none"
                                      />

                                      {/* Usage badge */}
                                      {usageCount > 0 ? (
                                        <span className="absolute top-1 left-1 bg-[#8C6D37] text-white text-[8px] font-bold px-1.5 py-0.2 rounded-full shadow-xs">
                                          {usageCount}x
                                        </span>
                                      ) : (
                                        <span className="absolute top-1 left-1 bg-black/55 text-white text-[7px] font-medium px-1 rounded-full backdrop-blur-xs">
                                          Sin usar
                                        </span>
                                      )}

                                      {/* Checkmark */}
                                      <div
                                        className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center transition-opacity ${
                                          isSelected
                                            ? 'bg-[#8C6D37] text-white opacity-100'
                                            : 'bg-black/30 text-transparent group-hover:opacity-100 opacity-0'
                                        }`}
                                      >
                                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                                      </div>

                                      {/* Individual Delete Photo Button */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeletePhoto(photo.id);
                                        }}
                                        className="absolute bottom-1 right-1 p-1 rounded-md bg-rose-600/90 hover:bg-rose-700 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-xs z-10 cursor-pointer"
                                        title={`Eliminar "${photo.name || 'foto'}"`}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Pliegos Panel */}
                  {leftSidebarTab === 'spreads' && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      <div className="p-2.5 border-b border-[#E8E2D5] bg-[#FDFCF9] flex items-center justify-between shrink-0">
                        <span className="text-[11px] font-bold text-[#595248]">
                          {spreads.length} Pliegos ({spreads.length * 2} Págs.)
                        </span>
                        <button
                          type="button"
                          onClick={handleAddSpread}
                          className="px-2.5 py-1 rounded-lg bg-[#8C6D37] text-white text-[10px] font-bold hover:bg-[#73582A] flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Pliego</span>
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-0">
                        {spreads.map((spread, idx) => {
                          const isActive = idx === activeSpreadIndex;
                          const leftPhoto = uploadedPhotos.find((p) => p.id === spread.leftPage.slots[0]?.photoId);
                          const rightPhoto = uploadedPhotos.find((p) => p.id === spread.rightPage.slots[0]?.photoId);

                          return (
                            <div
                              key={spread.id}
                              onClick={() => setActiveSpreadIndex(idx)}
                              className={`p-2 rounded-xl border-2 transition-all cursor-pointer bg-white ${
                                isActive
                                  ? 'border-[#8C6D37] ring-2 ring-[#8C6D37]/30 shadow-md'
                                  : 'border-[#D6CEBE] hover:border-[#8C6D37]/60 hover:shadow-xs'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[10px] font-bold mb-1.5">
                                <span className={isActive ? 'text-[#8C6D37]' : 'text-[#1F1C18]'}>
                                  Pliego {idx + 1}
                                </span>
                                <span className="text-[9px] text-[#736B60]">
                                  Págs. {idx * 2 + 1} - {idx * 2 + 2}
                                </span>
                              </div>

                              {/* Miniature */}
                              <div className="w-full aspect-[16/10] rounded-lg bg-[#FAF7F2] border border-[#E8E2D5] flex overflow-hidden relative">
                                {spread.isFullSpreadBleed ? (
                                  <div className="w-full h-full bg-[#E2D8C7] flex items-center justify-center overflow-hidden">
                                    {uploadedPhotos.find((p) => p.id === spread.fullSpreadPhotoId) ? (
                                      <img
                                        src={getThumbnailSrc(uploadedPhotos.find((p) => p.id === spread.fullSpreadPhotoId)!)}
                                        alt="Panorámica"
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-[8px] font-bold text-[#736B60]">Panorámica</span>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <div className="w-1/2 h-full border-r border-[#E8E2D5] bg-[#F4EFE6] overflow-hidden flex items-center justify-center">
                                      {leftPhoto ? (
                                        <img src={getThumbnailSrc(leftPhoto)} alt="L" className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-[7px] text-[#A89F91]">P.{idx * 2 + 1}</span>
                                      )}
                                    </div>
                                    <div className="w-1/2 h-full bg-[#F4EFE6] overflow-hidden flex items-center justify-center">
                                      {rightPhoto ? (
                                        <img src={getThumbnailSrc(rightPhoto)} alt="R" className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-[7px] text-[#A89F91]">P.{idx * 2 + 2}</span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center justify-end gap-1 mt-1.5 pt-1 border-t border-[#F0EBE1]">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDuplicateSpread(idx);
                                  }}
                                  className="p-1 text-[#736B60] hover:text-[#1F1C18] text-[9px] font-medium flex items-center gap-0.5"
                                  title="Duplicar pliego"
                                >
                                  <Copy className="w-2.5 h-2.5" />
                                  <span>Duplicar</span>
                                </button>
                                {spreads.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteSpread(idx);
                                    }}
                                    className="p-1 text-rose-600 hover:text-rose-800 text-[9px] font-medium flex items-center gap-0.5 ml-1"
                                    title="Eliminar pliego"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                    <span>Eliminar</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Left Draggable Resizer Guide / Splitter */}
            {!isLeftSidebarCollapsed && (
              <div
                onPointerDown={handleStartResizeLeft}
                onDoubleClick={() => setLeftSidebarWidth(310)}
                className={`hidden lg:flex w-2.5 hover:w-3 -mx-1 cursor-col-resize z-30 transition-all items-center justify-center group relative select-none shrink-0 ${
                  isDraggingLeftResizer ? 'bg-[#8C6D37]/30 ring-2 ring-[#8C6D37]' : 'hover:bg-[#8C6D37]/20'
                }`}
                title="Arrastra para cambiar el ancho del panel izquierdo (Doble clic para 310px)"
              >
                <div className="w-[2px] h-12 bg-[#C5A059] group-hover:bg-[#8C6D37] rounded-full group-hover:h-16 transition-all flex flex-col items-center justify-center" />
              </div>
            )}

            {/* Center Area: Double Page Spread Canvas (Zno CXEditor Style) */}
            <div className="flex-1 flex flex-col overflow-y-auto p-2 sm:p-3.5 bg-[#EFECE3] items-center min-h-0 relative">
              {/* TOP BAR: DISEÑOS PREDEFINIDOS (Predefined Layouts Strip) */}
              <div className="w-full max-w-[1500px] 2xl:max-w-[1750px] bg-[#FDFCF9] rounded-2xl border border-[#D6CEBE] p-2 sm:p-2.5 shadow-xs select-none space-y-2 shrink-0 z-10">
                {/* Header with Title, Photo Count Filters, and Full Modal Button */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E2D5] pb-1.5">
                  <div className="flex items-center gap-2">
                    <Layout className="w-4 h-4 text-[#8C6D37]" />
                    <span className="font-serif-luxury font-bold text-xs sm:text-sm text-[#1F1C18]">
                      Diseños Predefinidos
                    </span>
                    <span className="text-[10px] text-[#736B60] bg-[#EFE9DE] px-2 py-0.5 rounded-full font-medium hidden sm:inline">
                      15 Estilos Fine Art
                    </span>
                  </div>

                  {/* Filter chips & Actions */}
                  <div className="flex items-center gap-2">
                    {!isPredefinedLayoutsCollapsed && (
                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        <span className="text-[#736B60] font-semibold mr-1 hidden md:inline">Filtrar:</span>
                        {[
                          { id: 'all', label: 'Todo' },
                          { id: '1', label: '1 foto' },
                          { id: '2', label: '2 fotos' },
                          { id: '3', label: '3 fotos' },
                          { id: '4', label: '4 fotos' },
                          { id: '5+', label: '5+ fotos' },
                          { id: 'panoramic', label: 'Panorámica' },
                          { id: 'text', label: 'Texto' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setLayoutPhotoFilter(tab.id as any)}
                            className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                              layoutPhotoFilter === tab.id
                                ? 'bg-[#8C6D37] text-white font-bold'
                                : 'bg-[#EFE9DE] text-[#595248] hover:bg-[#E2D8C7]'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Open full modal button */}
                    <button
                      type="button"
                      onClick={() => setShowTemplateGridModal(true)}
                      className="px-2 py-1 rounded-lg bg-[#FAF7F2] border border-[#D6CEBE] hover:bg-[#EFE9DE] text-[10px] sm:text-[11px] font-bold text-[#8C6D37] flex items-center gap-1 transition-colors cursor-pointer"
                      title="Ver catálogo completo de plantillas de pliego"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Catálogo</span>
                    </button>

                    {/* Collapse / Expand Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setIsPredefinedLayoutsCollapsed(!isPredefinedLayoutsCollapsed)}
                      className="p-1 rounded-lg bg-[#EFE9DE] hover:bg-[#D6CEBE] text-[#1F1C18] text-xs transition-colors cursor-pointer flex items-center gap-1 px-2 font-semibold"
                      title={isPredefinedLayoutsCollapsed ? 'Mostrar catálogo de diseños' : 'Ocultar catálogo de diseños para más espacio'}
                    >
                      {isPredefinedLayoutsCollapsed ? (
                        <>
                          <ChevronDown className="w-3.5 h-3.5 text-[#8C6D37]" />
                          <span className="text-[10px] text-[#8C6D37]">Ver Diseños</span>
                        </>
                      ) : (
                        <>
                          <ChevronUp className="w-3.5 h-3.5 text-[#736B60]" />
                          <span className="text-[10px] text-[#736B60]">Plegar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Horizontal Scrollable Predefined Layouts Cards */}
                {!isPredefinedLayoutsCollapsed && (
                  <div className="flex items-center gap-2 overflow-x-auto py-1 px-0.5 scrollbar-thin">
                  {[
                    {
                      id: 'five-photo-editorial',
                      title: '5 Fotos Editorial',
                      subtitle: '2 Arriba + 3 Abajo',
                      photos: '5+',
                      diagram: (
                        <div className="w-full h-full flex flex-col gap-0.5 p-0.5 bg-[#FAF7F2]">
                          <div className="flex-1 grid grid-cols-2 gap-0.5">
                            <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                            <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          </div>
                          <div className="flex-1 grid grid-cols-3 gap-0.5">
                            <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                            <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                            <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          </div>
                        </div>
                      ),
                    },
                    {
                      id: 'asymmetric-split',
                      title: '3 Asimétrico 2+1',
                      subtitle: '2 Horiz + 1 Vertical',
                      photos: 3,
                      diagram: (
                        <div className="w-full h-full grid grid-cols-2 gap-0.5 p-0.5 bg-[#FAF7F2]">
                          <div className="grid grid-rows-2 gap-0.5">
                            <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                            <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          </div>
                          <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                        </div>
                      ),
                    },
                    {
                      id: 'three-vertical-triptych',
                      title: 'Tríptico 3 Vert',
                      subtitle: '3 Columnas Altas',
                      photos: 3,
                      diagram: (
                        <div className="w-full h-full grid grid-cols-3 gap-0.5 p-0.5 bg-[#FAF7F2]">
                          <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                        </div>
                      ),
                    },
                    {
                      id: 'editorial-magazine-polaroid',
                      title: 'Revista & Polaroid',
                      subtitle: '4 Fotos + Título',
                      photos: 4,
                      diagram: (
                        <div className="w-full h-full flex gap-0.5 p-0.5 bg-[#FAF7F2]">
                          <div className="w-5/12 bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs flex flex-col justify-end p-0.5">
                            <div className="h-1 bg-[#1F1C18]/30 rounded-full" />
                          </div>
                          <div className="w-7/12 flex flex-col gap-0.5">
                            <div className="h-2/5 bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                            <div className="h-3/5 grid grid-cols-2 gap-0.5">
                              <div className="bg-white border border-[#D6CEBE] p-0.5 flex flex-col">
                                <div className="flex-1 bg-[#8C6D37]/40 rounded-xs" />
                              </div>
                              <div className="bg-white border border-[#D6CEBE] p-0.5 flex flex-col">
                                <div className="flex-1 bg-[#8C6D37]/40 rounded-xs" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ),
                    },
                    {
                      id: 'moodboard-mosaic-9',
                      title: 'Moodboard 9',
                      subtitle: '9 Fotos Mosaico',
                      photos: '5+',
                      diagram: (
                        <div className="w-full h-full grid grid-cols-3 grid-rows-3 gap-0.5 p-0.5 bg-[#FAF7F2]">
                          <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="col-span-2 bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="row-span-2 bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="col-span-2 bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                        </div>
                      ),
                    },
                    {
                      id: 'lifestyle-bento-10',
                      title: 'Bento 10',
                      subtitle: '10 Fotos Detalle',
                      photos: '5+',
                      diagram: (
                        <div className="w-full h-full grid grid-cols-6 grid-rows-4 gap-0.5 p-0.5 bg-[#FAF7F2]">
                          <div className="col-span-2 row-span-2 bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="col-span-2 row-span-2 bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="col-span-2 row-span-2 bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="col-span-3 row-span-2 bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                          <div className="col-span-3 row-span-2 bg-[#8C6D37]/40 border border-[#8C6D37] rounded-xs" />
                        </div>
                      ),
                    },
                    {
                      id: 'single-full',
                      title: '1 Foto Sangrada',
                      subtitle: 'Página Completa',
                      photos: 1,
                      diagram: (
                        <div className="w-full h-full bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs flex items-center justify-center text-[9px] font-bold text-[#8C6D37]">
                          1
                        </div>
                      ),
                    },
                    {
                      id: 'single-bordered',
                      title: 'Passepartout',
                      subtitle: '1 con Marco',
                      photos: 1,
                      diagram: (
                        <div className="w-full h-full bg-white border border-[#D6CEBE] p-1 flex items-center justify-center">
                          <div className="w-4/5 h-4/5 bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs flex items-center justify-center text-[8px] font-bold text-[#8C6D37]">
                            1
                          </div>
                        </div>
                      ),
                    },
                    {
                      id: 'two-vertical',
                      title: '2 Verticales',
                      subtitle: 'Paralelas',
                      photos: 2,
                      diagram: (
                        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5">
                          <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                        </div>
                      ),
                    },
                    {
                      id: 'two-horizontal',
                      title: '2 Horizontales',
                      subtitle: 'Apiladas',
                      photos: 2,
                      diagram: (
                        <div className="w-full h-full grid grid-rows-2 gap-1 p-0.5">
                          <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                        </div>
                      ),
                    },
                    {
                      id: 'three-collage',
                      title: '3 Mosaico',
                      subtitle: '1 Gran + 2 Peq',
                      photos: 3,
                      diagram: (
                        <div className="w-full h-full grid grid-cols-2 gap-1 p-0.5">
                          <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                          <div className="grid grid-rows-2 gap-1">
                            <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                            <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                          </div>
                        </div>
                      ),
                    },
                    {
                      id: 'four-grid',
                      title: '4 Grilla 2x2',
                      subtitle: 'Cuadrícula',
                      photos: 4,
                      diagram: (
                        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-1 p-0.5">
                          <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                          <div className="bg-[#8C6D37]/30 border border-[#8C6D37] rounded-xs" />
                        </div>
                      ),
                    },
                    {
                      id: 'full-bleed-spread',
                      title: 'Panorámica 180°',
                      subtitle: 'Doble Pliego',
                      photos: 'panoramic',
                      diagram: (
                        <div className="w-full h-full bg-[#1F1C18] text-[#ECC880] flex items-center justify-center text-[8px] font-bold rounded-xs">
                          Panorámica
                        </div>
                      ),
                    },
                    {
                      id: 'editorial-text-photo',
                      title: 'Página de Texto',
                      subtitle: 'Dedicatoria',
                      photos: 'text',
                      diagram: (
                        <div className="w-full h-full bg-[#F4EFE6] border border-[#D6CEBE] p-1 flex flex-col items-center justify-center text-[7px] text-[#595248] italic font-serif">
                          <span>“Título”</span>
                          <span className="text-[5px]">editorial</span>
                        </div>
                      ),
                    },
                    {
                      id: 'blank',
                      title: 'Blanco Fine Art',
                      subtitle: 'Minimalista',
                      photos: 0,
                      diagram: (
                        <div className="w-full h-full bg-white border border-[#D6CEBE] flex items-center justify-center text-[7px] text-[#A89F91]">
                          Vacío
                        </div>
                      ),
                    },
                  ]
                    .filter((tmpl) => {
                      if (layoutPhotoFilter === 'all') return true;
                      if (layoutPhotoFilter === 'panoramic') return tmpl.id === 'full-bleed-spread';
                      if (layoutPhotoFilter === 'text') return tmpl.id === 'editorial-text-photo';
                      if (layoutPhotoFilter === '5+') return tmpl.photos === '5+' || (typeof tmpl.photos === 'number' && tmpl.photos >= 5);
                      return String(tmpl.photos) === layoutPhotoFilter;
                    })
                    .map((tmpl) => (
                      <div
                        key={tmpl.id}
                        onMouseEnter={() => setHoveredLayoutTemplateId(tmpl.id)}
                        onMouseLeave={() => setHoveredLayoutTemplateId(null)}
                        className="flex-shrink-0 group/card bg-white rounded-xl border border-[#D6CEBE] hover:border-[#8C6D37] hover:shadow-md transition-all p-1.5 flex flex-col items-center gap-1 w-28 relative"
                      >
                        {/* Miniature Wireframe Diagram */}
                        <div className="w-24 h-12 rounded bg-[#EFE9DE] overflow-hidden border border-[#D6CEBE]/50">
                          {tmpl.diagram}
                        </div>

                        <div className="w-full text-center">
                          <span className="text-[9px] font-bold text-[#1F1C18] truncate block">
                            {tmpl.title}
                          </span>
                        </div>

                        {/* Quick Apply Buttons (Izq, Der, or Spread) */}
                        <div className="w-full flex gap-1 mt-0.5">
                          {tmpl.id === 'full-bleed-spread' ? (
                            <button
                              type="button"
                              onClick={() => {
                                handleChangePageLayout('left', 'full-bleed-spread');
                              }}
                              className="w-full py-0.5 rounded bg-[#8C6D37] text-white text-[8px] font-bold hover:bg-[#73582A]"
                            >
                              Pliego
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  handleChangePageLayout('left', tmpl.id as PageLayoutId);
                                }}
                                className="flex-1 py-0.5 rounded bg-[#EFE9DE] hover:bg-[#1F1C18] hover:text-white text-[8px] font-bold transition-colors"
                              >
                                Izq
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleChangePageLayout('right', tmpl.id as PageLayoutId);
                                }}
                                className="flex-1 py-0.5 rounded bg-[#EFE9DE] hover:bg-[#1F1C18] hover:text-white text-[8px] font-bold transition-colors"
                              >
                                Der
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Horizontal Resizer / Drag Guide between Predefined Layouts & Canvas */}
              <div
                onPointerDown={handleStartResizeTop}
                onDoubleClick={() => setIsPredefinedLayoutsCollapsed(!isPredefinedLayoutsCollapsed)}
                style={{ 
                  marginTop: `${Math.max(2, topLayoutsSpacing / 2)}px`, 
                  marginBottom: `${Math.max(2, topLayoutsSpacing / 2)}px` 
                }}
                className={`w-full max-w-[1500px] 2xl:max-w-[1750px] py-1 cursor-row-resize z-20 flex items-center justify-center group relative select-none shrink-0 transition-all ${
                  isDraggingTopResizer ? 'bg-[#8C6D37]/30 ring-2 ring-[#8C6D37] rounded-full' : 'hover:bg-[#8C6D37]/15 rounded-full'
                }`}
                title="Arrastra verticalmente para ajustar la separación entre los diseños y el lienzo (Doble clic para plegar/desplegar)"
              >
                <div className="h-[3px] w-28 bg-[#C5A059] group-hover:bg-[#8C6D37] rounded-full group-hover:w-44 transition-all flex items-center justify-center shadow-xs">
                  <div className="w-8 h-1 bg-[#8C6D37] rounded-full opacity-70 group-hover:opacity-100" />
                </div>
              </div>

              {/* Canvas Stage Wrapper */}
              <div className="w-full flex-1 flex flex-col items-center justify-start relative min-h-0 pb-6 overflow-visible">
                {/* Unified Top Action & Navigation Toolbar (Sticky & Always on Top) */}
                <div className="sticky top-0 z-40 w-full max-w-[1500px] 2xl:max-w-[1750px] flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 mb-2 text-[11px] text-[#736B60] bg-[#EFECE3]/95 backdrop-blur-md rounded-2xl border border-[#D6CEBE]/70 shadow-xs">
                  {/* Left: Spread Navigation & Addition */}
                  <div className="flex items-center gap-1.5 bg-[#FDFCF9] border border-[#D6CEBE] p-1 rounded-xl shadow-xs">
                    <button
                      type="button"
                      onClick={() => setActiveSpreadIndex((prev) => Math.max(0, prev - 1))}
                      disabled={activeSpreadIndex === 0}
                      className="px-2.5 py-1 rounded-lg border border-[#D6CEBE] bg-[#FAF7F2] text-[#1F1C18] hover:bg-[#EFE9DE] disabled:opacity-30 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Pliego Anterior"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Anterior</span>
                    </button>

                    <div className="flex items-center gap-1.5 px-2 py-0.5">
                      <span className="font-bold text-xs text-[#1F1C18]">
                        Pliego {activeSpreadIndex + 1} de {spreads.length}
                      </span>
                      <span className="text-[10px] text-[#8C6D37] bg-[#FAF6EF] border border-[#8C6D37]/20 px-1.5 py-0.5 rounded-full font-medium hidden md:inline">
                        Págs. {activeSpreadIndex * 2 + 1} y {activeSpreadIndex * 2 + 2}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveSpreadIndex((prev) => Math.min(spreads.length - 1, prev + 1))}
                      disabled={activeSpreadIndex === spreads.length - 1}
                      className="px-2.5 py-1 rounded-lg border border-[#D6CEBE] bg-[#FAF7F2] text-[#1F1C18] hover:bg-[#EFE9DE] disabled:opacity-30 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Siguiente Pliego"
                    >
                      <span className="hidden sm:inline">Siguiente</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-[1px] h-4 bg-[#E0D8C8] mx-0.5" />

                    <button
                      type="button"
                      onClick={handleAddSpread}
                      className="px-2.5 py-1 rounded-lg bg-[#1F1C18] text-[#FDFCF9] text-xs font-bold hover:bg-[#3D352E] flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                      title="Añadir nuevo pliego (2 páginas)"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#ECC880]" />
                      <span>+ Pliego</span>
                    </button>

                    {spreads.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSpread(activeSpreadIndex)}
                        className="px-2 py-1 rounded-lg border border-rose-200 bg-rose-50/80 text-rose-700 hover:bg-rose-100 hover:border-rose-300 text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                        title={`Eliminar este pliego actual (${activeSpreadIndex + 1})`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span className="hidden md:inline">Eliminar Pliego</span>
                      </button>
                    )}
                  </div>

                  {/* Middle: Undo / Redo / Swap Sides */}
                  <div className="flex items-center gap-1 bg-[#FDFCF9] border border-[#D6CEBE] p-1 rounded-xl shadow-xs">
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={historyIndex <= 0}
                      className="p-1.5 rounded-lg border border-[#D6CEBE] hover:bg-[#FAF7F2] text-[#736B60] hover:text-[#1F1C18] disabled:opacity-30 transition-colors cursor-pointer"
                      title="Deshacer (Ctrl+Z)"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRedo}
                      disabled={historyIndex >= history.length - 1}
                      className="p-1.5 rounded-lg border border-[#D6CEBE] hover:bg-[#FAF7F2] text-[#736B60] hover:text-[#1F1C18] disabled:opacity-30 transition-colors cursor-pointer"
                      title="Rehacer (Ctrl+Y)"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-[1px] h-4 bg-[#E0D8C8] mx-0.5" />

                    <button
                      type="button"
                      onClick={handleFlipSpreadSides}
                      className="px-2 py-1 rounded-lg border border-[#D6CEBE] bg-[#FAF7F2] text-[10px] font-bold text-[#1F1C18] hover:bg-[#EFE9DE] flex items-center gap-1 transition-colors cursor-pointer"
                      title="Invertir páginas izquierda y derecha"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 text-[#8C6D37]" />
                      <span className="hidden lg:inline">Invertir Lados</span>
                    </button>
                  </div>

                  {/* Right: Safe Margins, Zoom & Focus Mode */}
                  <div className="flex items-center gap-1 bg-[#FDFCF9] border border-[#D6CEBE] p-1 rounded-xl shadow-xs">
                    {/* Safe Margins Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowSafeMarginGuides(!showSafeMarginGuides)}
                      className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        showSafeMarginGuides
                          ? 'bg-[#8C6D37] text-white shadow-xs'
                          : 'text-[#736B60] hover:bg-[#FAF7F2]'
                      }`}
                      title="Mostrar u ocultar guías de corte y márgenes seguros de impresión"
                    >
                      <Scan className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Guías</span>
                    </button>

                    <div className="w-[1px] h-4 bg-[#E0D8C8]" />

                    {/* Zoom Out */}
                    <button
                      type="button"
                      onClick={handleZoomOut}
                      className="p-1 rounded-lg hover:bg-[#FAF7F2] text-[#736B60] hover:text-[#1F1C18] cursor-pointer"
                      title="Reducir Zoom"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setCanvasZoomLevel(1)}
                      className="px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold text-[#1F1C18] hover:bg-[#FAF7F2] cursor-pointer bg-[#FAF7F2] border border-[#D6CEBE]/60"
                      title="Restablecer Zoom a 100% (Clic para reajustar)"
                    >
                      {Math.round(canvasZoomLevel * 100)}%
                    </button>

                    {/* Zoom In */}
                    <button
                      type="button"
                      onClick={handleZoomIn}
                      className="p-1 rounded-lg hover:bg-[#FAF7F2] text-[#736B60] hover:text-[#1F1C18] cursor-pointer"
                      title="Aumentar Zoom"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-[1px] h-4 bg-[#E0D8C8]" />

                    {/* Focus Mode */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isFocusMode;
                        setIsFocusMode(next);
                        setIsLeftSidebarCollapsed(next);
                        setIsRightSidebarCollapsed(next);
                      }}
                      className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        isFocusMode
                          ? 'bg-[#1F1C18] text-[#ECC880]'
                          : 'text-[#736B60] hover:bg-[#FAF7F2]'
                      }`}
                      title="Modo Enfoque: oculta paneles laterales para máxima amplitud de diseño"
                    >
                      {isFocusMode ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                      <span className="hidden md:inline">{isFocusMode ? 'Salir de Enfoque' : 'Enfoque'}</span>
                    </button>
                  </div>
                </div>

                {/* The 180° Layflat Open Book Spread Canvas */}
                <div
                  style={{
                    transform: canvasZoomLevel !== 1 ? `scale(${canvasZoomLevel})` : undefined,
                    transformOrigin: 'top center',
                    transition: 'transform 0.2s ease-out'
                  }}
                  className="w-full max-w-[1500px] 2xl:max-w-[1750px] flex items-center justify-center pt-1 z-10"
                >
                  <div 
                    ref={spreadCanvasRef}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsCanvasDragOver(true);
                    }}
                    onDragLeave={() => setIsCanvasDragOver(false)}
                    onDrop={(e) => handleDropPhotosOnTarget('spread', e)}
                    className={`w-full aspect-[16/10] max-h-[calc(100vh-260px)] min-h-[340px] rounded-2xl shadow-2xl border overflow-hidden flex relative paper-texture select-none transition-all duration-200 ${
                      isCanvasDragOver
                        ? 'border-[#8C6D37] ring-4 ring-[#8C6D37]/40'
                        : 'border-[#D6CEBE]'
                    }`}
                    style={{ backgroundColor: displaySpread.backgroundColor || spreadBgColor }}
                  >
                {/* Live Real-time Template Hover Preview Badge */}
                {hoveredLayoutTemplateId && (
                  <div className="absolute top-3 inset-x-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-full bg-[#1F1C18]/95 border border-[#ECC880] text-[#ECC880] text-[11px] font-bold flex items-center gap-2 shadow-2xl backdrop-blur-md animate-pulse pointer-events-none whitespace-nowrap">
                    <Sparkles className="w-3.5 h-3.5 text-[#ECC880]" />
                    <span>Previsualizando: {SPREAD_TEMPLATE_PRESETS.find((t) => t.id === hoveredLayoutTemplateId)?.title} · Clic para fijar</span>
                  </div>
                )}

                {/* Central Gutter / Spine Fold Shadow */}
                <div className="absolute inset-y-0 left-1/2 -ml-4 w-8 book-gutter-shadow pointer-events-none z-20" />
                <div className="absolute inset-y-0 left-1/2 w-[1px] bg-black/15 z-20 pointer-events-none" />

                {/* SPREAD NAVIGATION ARROWS: Left Previous Arrow */}
                <button
                  type="button"
                  onClick={() => setActiveSpreadIndex((prev) => Math.max(0, prev - 1))}
                  disabled={activeSpreadIndex === 0}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-[#1F1C18]/80 hover:bg-[#1F1C18] text-white flex items-center justify-center shadow-2xl backdrop-blur-xs transition-all disabled:opacity-20 disabled:pointer-events-none hover:scale-110 active:scale-95 group"
                  title="Pliego Anterior (Flecha Izquierda ←)"
                >
                  <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
                </button>

                {/* SPREAD NAVIGATION ARROWS: Right Next Arrow */}
                <button
                  type="button"
                  onClick={() => setActiveSpreadIndex((prev) => Math.min(spreads.length - 1, prev + 1))}
                  disabled={activeSpreadIndex >= spreads.length - 1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-[#1F1C18]/80 hover:bg-[#1F1C18] text-white flex items-center justify-center shadow-2xl backdrop-blur-xs transition-all disabled:opacity-20 disabled:pointer-events-none hover:scale-110 active:scale-95 group"
                  title="Siguiente Pliego (Flecha Derecha →)"
                >
                  <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* Safe Margins & Bleed Overlay Guides (Zno CXEditor Feature) */}
                {showSafeMarginGuides && (
                  <div className="absolute inset-2 print-safe-guide pointer-events-none z-20 rounded">
                    <span className="absolute top-1 left-2 text-[8px] font-mono text-blue-500/80 uppercase font-bold tracking-wider">
                      Área Segura de Impresión Fine Art
                    </span>
                    <span className="absolute top-1 right-2 text-[8px] font-mono text-blue-500/80 uppercase font-bold tracking-wider">
                      Corte 3mm Bleed
                    </span>
                  </div>
                )}

                {/* FULL SPREAD PANORAMA OVERRIDE */}
                {displaySpread.isFullSpreadBleed ? (
                  <div 
                    className="w-full h-full relative group cursor-pointer"
                    onClick={() => setSelectedSlotId('full-spread')}
                    onDragOver={(e) => { e.preventDefault(); setDragOverSlotId('full-spread'); }}
                    onDragLeave={() => setDragOverSlotId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverSlotId(null);
                      if (draggedPhotoId) {
                        setSpreads((prev) =>
                          prev.map((s, i) =>
                            i === activeSpreadIndex ? { ...s, fullSpreadPhotoId: draggedPhotoId } : s
                          )
                        );
                      }
                    }}
                  >
                    {displaySpread.fullSpreadPhotoId && uploadedPhotos.find((p) => p.id === displaySpread.fullSpreadPhotoId) ? (
                      <img
                        src={getPhotoDisplayUrl(uploadedPhotos.find((p) => p.id === displaySpread.fullSpreadPhotoId))}
                        alt="Foto Panorámica"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#EFE9DE] flex flex-col items-center justify-center text-[#736B60]">
                        <ImageIcon className="w-12 h-12 mb-2 opacity-50 text-[#8C6D37]" />
                        <span className="text-xs font-bold">Arrastra o haz clic para colocar una foto panorámica a doble página</span>
                      </div>
                    )}

                    {/* Change layout back button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChangePageLayout('left', 'single-bordered');
                      }}
                      className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-[#1F1C18]/85 text-[#FDFCF9] text-xs font-bold hover:bg-[#1F1C18] flex items-center gap-1 z-30 shadow-md"
                    >
                      <Layout className="w-3 h-3" />
                      <span>Volver a 2 Páginas Separadas</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* LEFT PAGE CONTAINER */}
                    <div 
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => handleDropPhotosOnTarget('left', e)}
                      className={`w-1/2 h-full flex flex-col justify-between relative border-r border-[#EAE4D8] ${
                        displaySpread.isFlushMargin ? 'p-0' : 'p-4 sm:p-6'
                      }`}
                    >
                      {/* Left Layout Quick Switcher */}
                      <div className="absolute top-2.5 left-2.5 z-10">
                        <button
                          type="button"
                          onClick={() => setActiveLayoutMenuSide(activeLayoutMenuSide === 'left' ? null : 'left')}
                          className="px-2 py-1 rounded-lg bg-[#1F1C18]/80 text-[#FDFCF9] text-[10px] font-semibold hover:bg-[#1F1C18] flex items-center gap-1.5 shadow-sm backdrop-blur-xs transition-all hover:scale-105"
                          title="Cambiar diseño / disposición de la página izquierda"
                        >
                          <Layout className="w-3 h-3 text-[#ECC880]" />
                          <span>Diseño Izq.</span>
                        </button>
                      </div>

                      {/* Content of Left Page */}
                      <div className="flex-1 flex flex-col justify-center items-center h-full w-full">
                        {renderPageLayoutContent(displaySpread.leftPage, false)}
                      </div>

                      {/* Page number */}
                      <span className={`text-[9px] font-mono text-[#A89F91] text-left ${
                        displaySpread.isFlushMargin ? 'p-1.5 bg-black/40 text-white rounded-tr' : ''
                      }`}>
                        {activeSpreadIndex * 2 + 1}
                      </span>
                    </div>

                    {/* RIGHT PAGE CONTAINER */}
                    <div 
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => handleDropPhotosOnTarget('right', e)}
                      className={`w-1/2 h-full flex flex-col justify-between relative ${
                        displaySpread.isFlushMargin ? 'p-0' : 'p-4 sm:p-6'
                      }`}
                    >
                      {/* Right Layout Quick Switcher */}
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <button
                          type="button"
                          onClick={() => setActiveLayoutMenuSide(activeLayoutMenuSide === 'right' ? null : 'right')}
                          className="px-2 py-1 rounded-lg bg-[#1F1C18]/80 text-[#FDFCF9] text-[10px] font-semibold hover:bg-[#1F1C18] flex items-center gap-1.5 shadow-sm backdrop-blur-xs transition-all hover:scale-105"
                          title="Cambiar diseño / disposición de la página derecha"
                        >
                          <Layout className="w-3 h-3 text-[#ECC880]" />
                          <span>Diseño Der.</span>
                        </button>
                      </div>

                      {/* Content of Right Page */}
                      <div className="flex-1 flex flex-col justify-center items-center h-full w-full">
                        {renderPageLayoutContent(displaySpread.rightPage, true)}
                      </div>

                      {/* Page number */}
                      <span className={`text-[9px] font-mono text-[#A89F91] text-right ${
                        displaySpread.isFlushMargin ? 'p-1.5 bg-black/40 text-white rounded-tl' : ''
                      }`}>
                        {activeSpreadIndex * 2 + 2}
                      </span>
                    </div>
                  </>
                )}

                {/* FREE FLOATING TEXT OVERLAYS ON SPREAD CANVAS */}
                {displaySpread.textElements && displaySpread.textElements.map((txt) => {
                  const isSelected = selectedTextId === txt.id;
                  return (
                    <div
                      key={txt.id}
                      onPointerDown={(e) => handleStartTextDrag(txt, e)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTextId(txt.id);
                      }}
                      className={`absolute z-30 cursor-move transition-shadow select-none group/text ${
                        isSelected
                          ? 'ring-2 ring-[#8C6D37] ring-offset-1 rounded bg-white/70 shadow-lg'
                          : 'hover:ring-1 hover:ring-[#8C6D37]/50 rounded'
                      }`}
                      style={{
                        left: `${txt.position.x}%`,
                        top: `${txt.position.y}%`,
                        transform: 'translate(-50%, -50%)',
                        fontFamily:
                          txt.fontFamily === 'serif-luxury'
                            ? '"Playfair Display", Georgia, serif'
                            : txt.fontFamily === 'mono-clean'
                            ? 'ui-monospace, monospace'
                            : txt.fontFamily === 'script-hand'
                            ? 'cursive'
                            : 'inherit',
                        fontSize: `${txt.fontSize}px`,
                        fontWeight: txt.isBold ? 'bold' : 'normal',
                        fontStyle: txt.isItalic ? 'italic' : 'normal',
                        color: txt.color,
                        textAlign: txt.alignment,
                        letterSpacing: txt.letterSpacing,
                        padding: '4px 8px',
                        maxWidth: '80%',
                      }}
                    >
                      {/* In-place text editor */}
                      <input
                        type="text"
                        value={txt.text}
                        onChange={(e) => handleUpdateFloatingText(txt.id, { text: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent border-none outline-hidden p-0 m-0 w-full"
                        style={{
                          fontFamily: 'inherit',
                          fontSize: 'inherit',
                          fontWeight: 'inherit',
                          fontStyle: 'inherit',
                          color: 'inherit',
                          textAlign: 'inherit',
                          letterSpacing: 'inherit',
                        }}
                      />

                      {/* Selection handle & delete button */}
                      {isSelected && (
                        <div className="absolute -top-7 left-0 flex items-center gap-1 bg-[#1F1C18] text-white px-2 py-0.5 rounded text-[10px] font-sans shadow-md z-40">
                          <span className="font-bold">Texto</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFloatingText(txt.id);
                            }}
                            className="text-rose-400 hover:text-rose-200 ml-1"
                            title="Eliminar texto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Floating Layout Selector Modal Drawer */}
                {activeLayoutMenuSide && (
                  <div
                    className={`absolute top-10 ${
                      activeLayoutMenuSide === 'left' ? 'left-4' : 'right-4'
                    } z-30 w-80 max-h-[460px] overflow-y-auto rounded-2xl border border-[#D6CEBE] bg-[#FDFCF9] p-3.5 shadow-2xl scrollbar-thin`}
                  >
                    <div className="flex items-center justify-between border-b border-[#E8E2D5] pb-2 mb-2.5">
                      <div>
                        <span className="text-xs font-bold uppercase text-[#1F1C18] block">
                          Diseño de Página {activeLayoutMenuSide === 'left' ? 'Izquierda' : 'Derecha'}
                        </span>
                        <span className="text-[10px] text-[#736B60]">Selecciona una plantilla de diseño</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveLayoutMenuSide(null)}
                        className="text-[#736B60] hover:text-[#1F1C18] p-1 rounded-md hover:bg-[#EFE9DE]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick Category Sections */}
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-[#8C6D37] tracking-wider mb-1.5 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          <span>Nuevos Estilos Editoriales</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'five-photo-editorial');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#8C6D37]/40 bg-[#FAF7F2] hover:bg-[#F4EFE6] text-left font-medium flex flex-col"
                          >
                            <span className="font-bold text-[#1F1C18]">5 Fotos Editorial</span>
                            <span className="text-[9px] text-[#736B60]">2 arriba + 3 abajo</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'asymmetric-split');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#8C6D37]/40 bg-[#FAF7F2] hover:bg-[#F4EFE6] text-left font-medium flex flex-col"
                          >
                            <span className="font-bold text-[#1F1C18]">3 Asimétrico 2+1</span>
                            <span className="text-[9px] text-[#736B60]">2 apiladas + 1 vertical</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'three-vertical-triptych');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#8C6D37]/40 bg-[#FAF7F2] hover:bg-[#F4EFE6] text-left font-medium flex flex-col"
                          >
                            <span className="font-bold text-[#1F1C18]">Tríptico Vertical</span>
                            <span className="text-[9px] text-[#736B60]">3 fotos esbeltas</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'editorial-magazine-polaroid');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#8C6D37]/40 bg-[#FAF7F2] hover:bg-[#F4EFE6] text-left font-medium flex flex-col"
                          >
                            <span className="font-bold text-[#1F1C18]">Revista & Polaroids</span>
                            <span className="text-[9px] text-[#736B60]">Hero + 2 marcos mini</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'moodboard-mosaic-9');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#8C6D37]/40 bg-[#FAF7F2] hover:bg-[#F4EFE6] text-left font-medium flex flex-col"
                          >
                            <span className="font-bold text-[#1F1C18]">Moodboard 9 Fotos</span>
                            <span className="text-[9px] text-[#736B60]">Mosaico romántico</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'lifestyle-bento-10');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#8C6D37]/40 bg-[#FAF7F2] hover:bg-[#F4EFE6] text-left font-medium flex flex-col"
                          >
                            <span className="font-bold text-[#1F1C18]">Bento Lifestyle 10</span>
                            <span className="text-[9px] text-[#736B60]">Cuadrícula moderna</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'botanical-floral-scrapbook');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 col-span-2 rounded-lg border border-[#8C6D37]/40 bg-[#FAF7F2] hover:bg-[#F4EFE6] text-left font-medium flex flex-col"
                          >
                            <span className="font-bold text-[#1F1C18]">Scrapbook Botánico Floral 5 Fotos</span>
                            <span className="text-[9px] text-[#736B60]">Ilustraciones de acuarela botánica y caligrafía</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-bold uppercase text-[#736B60] tracking-wider mb-1.5">
                          Diseños Clásicos
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'single-full');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#D6CEBE] hover:bg-[#F4EFE6] text-left font-medium"
                          >
                            1 Foto Sangrada
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'single-bordered');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#D6CEBE] hover:bg-[#F4EFE6] text-left font-medium"
                          >
                            1 c/ Passepartout
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'two-vertical');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#D6CEBE] hover:bg-[#F4EFE6] text-left font-medium"
                          >
                            2 Fotos Verticales
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'two-horizontal');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#D6CEBE] hover:bg-[#F4EFE6] text-left font-medium"
                          >
                            2 Horizontales
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'three-collage');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#D6CEBE] hover:bg-[#F4EFE6] text-left font-medium"
                          >
                            3 Fotos Mosaico
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'four-grid');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#D6CEBE] hover:bg-[#F4EFE6] text-left font-medium"
                          >
                            4 Fotos Grilla
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'editorial-text-photo');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#D6CEBE] hover:bg-[#F4EFE6] text-left font-medium"
                          >
                            Página de Texto
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleChangePageLayout(activeLayoutMenuSide, 'blank');
                              setActiveLayoutMenuSide(null);
                            }}
                            className="p-2 rounded-lg border border-[#D6CEBE] hover:bg-[#F4EFE6] text-left font-medium"
                          >
                            Página en Blanco
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

                </div>
              </div>
            </div>

            {/* Right Draggable Resizer Guide / Splitter */}
            {!isRightSidebarCollapsed && (
              <div
                onPointerDown={handleStartResizeRight}
                onDoubleClick={() => setRightSidebarWidth(320)}
                className={`hidden lg:flex w-2.5 hover:w-3 -mx-1 cursor-col-resize z-30 transition-all items-center justify-center group relative select-none shrink-0 ${
                  isDraggingRightResizer ? 'bg-[#8C6D37]/30 ring-2 ring-[#8C6D37]' : 'hover:bg-[#8C6D37]/20'
                }`}
                title="Arrastra para cambiar el ancho del panel de herramientas (Doble clic para 320px)"
              >
                <div className="w-[2px] h-12 bg-[#C5A059] group-hover:bg-[#8C6D37] rounded-full group-hover:h-16 transition-all flex flex-col items-center justify-center" />
              </div>
            )}

            {/* Right Sidebar: Permanent Inspector & Tool Sliders Panel (Collapsible) */}
            <div
              style={{ width: isRightSidebarCollapsed ? undefined : `${rightSidebarWidth}px` }}
              className={`transition-all duration-200 border-t lg:border-t-0 lg:border-l border-[#E0D8C8] bg-[#FDFCF9] flex flex-col shrink-0 z-20 ${
                isRightSidebarCollapsed ? 'w-full lg:w-14 items-center overflow-hidden' : 'w-full overflow-y-auto'
              }`}
            >
              {isRightSidebarCollapsed ? (
                <div className="flex flex-row lg:flex-col items-center justify-between lg:justify-start py-2 lg:py-3 px-3 lg:px-0 gap-3 w-full h-auto lg:h-full">
                  <button
                    type="button"
                    onClick={() => setIsRightSidebarCollapsed(false)}
                    className="p-2 rounded-xl bg-[#FAF7F2] border border-[#D6CEBE] text-[#8C6D37] hover:bg-[#EFE9DE] shadow-xs transition-colors cursor-pointer"
                    title="Expandir Herramientas y Ajustes"
                  >
                    <PanelRightOpen className="w-5 h-5" />
                  </button>

                  <div className="hidden lg:block w-8 h-[1px] bg-[#E8E2D5]" />

                  <button
                    type="button"
                    onClick={() => setIsRightSidebarCollapsed(false)}
                    className="p-2.5 rounded-xl text-[#736B60] hover:bg-[#FAF7F2] hover:text-[#1F1C18] transition-colors cursor-pointer"
                    title="Herramientas y Ajustes"
                  >
                    <SlidersHorizontal className="w-5 h-5 text-[#8C6D37]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRightSidebarCollapsed(false)}
                    className="p-2.5 rounded-xl text-[#736B60] hover:bg-[#FAF7F2] hover:text-[#1F1C18] transition-colors cursor-pointer"
                    title="Paleta y Estilos"
                  >
                    <Palette className="w-5 h-5 text-[#8C6D37]" />
                  </button>
                </div>
              ) : (
                <>
                  {/* Compact Header */}
                  <div className="px-3 py-2 border-b border-[#E0D8C8] bg-[#F9F6EE] flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-[#8C6D37] shrink-0" />
                      <span className="font-bold text-[11px] uppercase tracking-wide text-[#1F1C18] truncate">
                        Ajustes
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedTextId ? (
                        <span className="px-1.5 py-0.5 rounded bg-[#8C6D37] text-white font-bold text-[9px]">
                          Texto
                        </span>
                      ) : selectedSlotData ? (
                        <span className="px-1.5 py-0.5 rounded bg-[#0091FF]/10 text-[#0091FF] font-bold text-[9px] border border-[#0091FF]/30">
                          Pág. {selectedSlotData.pageNumber}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-[#8C6D37]/10 text-[#8C6D37] font-bold text-[9px] border border-[#8C6D37]/30">
                          Pliego {activeSpreadIndex + 1}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsRightSidebarCollapsed(true)}
                        className="p-1 rounded-md text-[#736B60] hover:text-[#1F1C18] hover:bg-[#EFE9DE] transition-colors cursor-pointer ml-0.5"
                        title="Ocultar Panel"
                      >
                        <PanelRightClose className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

              {/* Panel Body: Mode 0 - Floating Text Element Inspector */}
              {selectedTextId && activeSpread.textElements?.find((t) => t.id === selectedTextId) ? (() => {
                const txt = activeSpread.textElements!.find((t) => t.id === selectedTextId)!;
                return (
                  <div className="p-3 space-y-3">
                    {/* Header */}
                    <div className="p-2.5 rounded-lg border border-[#8C6D37]/40 bg-[#FAF7F2] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-[#8C6D37] flex items-center gap-1">
                          <Type className="w-3 h-3" />
                          <span>Texto</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteFloatingText(txt.id)}
                          className="text-rose-600 hover:text-rose-800 text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Eliminar</span>
                        </button>
                      </div>
                      <textarea
                        value={txt.text}
                        onChange={(e) => handleUpdateFloatingText(txt.id, { text: e.target.value })}
                        rows={2}
                        className="w-full p-1.5 text-xs rounded-md border border-[#D6CEBE] bg-white text-[#1F1C18] focus:outline-hidden focus:ring-1 focus:ring-[#8C6D37]"
                        placeholder="Escribe tu texto..."
                      />
                    </div>

                    {/* Font Family Selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#595248] block">
                        Tipografía
                      </label>
                      <div className="grid grid-cols-3 gap-1 text-[10px]">
                        {[
                          { id: 'serif-luxury', label: 'Playfair', desc: 'Serif' },
                          { id: 'sans-modern', label: 'Moderna', desc: 'Sans' },
                          { id: 'mono-clean', label: 'Máquina', desc: 'Mono' },
                        ].map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => handleUpdateFloatingText(txt.id, { fontFamily: f.id as any })}
                            className={`p-1.5 rounded-md border text-center transition-all cursor-pointer ${
                              txt.fontFamily === f.id
                                ? 'bg-[#8C6D37] text-white border-[#8C6D37] font-bold shadow-xs'
                                : 'bg-white text-[#1F1C18] border-[#D6CEBE] hover:bg-[#FAF7F2]'
                            }`}
                          >
                            <span className="block font-bold text-[10px]">{f.label}</span>
                            <span className="text-[8px] opacity-75">{f.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Font Size Slider */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[#595248]">
                          Tamaño
                        </label>
                        <span className="font-mono font-bold text-[11px] text-[#8C6D37] bg-[#8C6D37]/10 px-1.5 py-0.2 rounded">
                          {txt.fontSize}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="12"
                        max="72"
                        step="1"
                        value={txt.fontSize}
                        onChange={(e) => handleUpdateFloatingText(txt.id, { fontSize: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-[#EFE9DE] rounded-lg appearance-none cursor-pointer accent-[#8C6D37]"
                      />
                    </div>

                    {/* Weight, Italic, Alignment */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#595248] block">
                        Estilo & Alineación
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateFloatingText(txt.id, {
                              isBold: !txt.isBold,
                            })
                          }
                          className={`flex-1 py-1 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                            txt.isBold
                              ? 'bg-[#1F1C18] text-white border-[#1F1C18]'
                              : 'bg-white text-[#1F1C18] border-[#D6CEBE]'
                          }`}
                        >
                          Negrita
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateFloatingText(txt.id, {
                              isItalic: !txt.isItalic,
                            })
                          }
                          className={`flex-1 py-1 rounded-md border text-[10px] italic font-serif transition-all cursor-pointer ${
                            txt.isItalic
                              ? 'bg-[#1F1C18] text-white border-[#1F1C18]'
                              : 'bg-white text-[#1F1C18] border-[#D6CEBE]'
                          }`}
                        >
                          Cursiva
                        </button>
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() => handleUpdateFloatingText(txt.id, { alignment: align })}
                            className={`p-1.5 rounded-md border text-xs transition-all cursor-pointer ${
                              txt.alignment === align
                                ? 'bg-[#8C6D37] text-white border-[#8C6D37]'
                                : 'bg-white text-[#1F1C18] border-[#D6CEBE]'
                            }`}
                            title={`Alinear a ${align}`}
                          >
                            {align === 'left' ? '⇤' : align === 'center' ? '⇥⇤' : '⇥'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Text Color Picker */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#595248] block">
                        Color
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[
                          { color: '#1F1C18', name: 'Negro Carbón' },
                          { color: '#8C6D37', name: 'Oro Fine Art' },
                          { color: '#595248', name: 'Gris Cálido' },
                          { color: '#FFFFFF', name: 'Blanco' },
                          { color: '#802B2B', name: 'Borgoña' },
                          { color: '#2B4A3D', name: 'Salvia' },
                        ].map((c) => (
                          <button
                            key={c.color}
                            type="button"
                            onClick={() => handleUpdateFloatingText(txt.id, { color: c.color })}
                            className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 shadow-xs cursor-pointer ${
                              txt.color === c.color ? 'ring-2 ring-[#8C6D37] scale-110' : 'border-[#D6CEBE]'
                            }`}
                            style={{ backgroundColor: c.color }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Deselect text */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedTextId(null)}
                        className="w-full py-1.5 rounded-lg bg-[#EFE9DE] hover:bg-[#E2D8C7] text-[#595248] text-xs font-bold transition-colors cursor-pointer"
                      >
                        Listo
                      </button>
                    </div>
                  </div>
                );
              })() : selectedSlotData ? (
                <div className="p-3 space-y-3">
                  {/* Photo Header Card */}
                  <div className="p-2 rounded-lg border border-[#D6CEBE] bg-[#F4EFE6]/70 flex items-center justify-between gap-2">
                    {selectedSlotData.photo ? (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={getThumbnailSrc(selectedSlotData.photo)}
                            alt=""
                            className="w-9 h-9 rounded-md object-cover border border-[#D6CEBE] shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold text-[#1F1C18] truncate block">
                              {selectedSlotData.photo.name}
                            </span>
                            <span className="text-[9px] text-emerald-700 font-semibold flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" />
                              300 DPI
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowSwapPickerSlotId(selectedSlotData.slot.id)}
                            className="px-2 py-1 rounded-md bg-[#8C6D37]/10 hover:bg-[#8C6D37] border border-[#8C6D37]/30 text-[#8C6D37] hover:text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Cambiar foto de este marco"
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                            <span>Cambiar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePhotoFromSlot(selectedSlotData.slot.id)}
                            className="p-1 rounded-md bg-white hover:bg-rose-50 border border-[#D6CEBE] text-rose-600 hover:border-rose-300 transition-colors cursor-pointer"
                            title="Quitar foto de este marco"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="w-full flex items-center justify-between py-0.5">
                        <span className="text-[11px] font-semibold text-[#736B60]">Ranura vacía</span>
                        <button
                          type="button"
                          onClick={() => setShowSwapPickerSlotId(selectedSlotData.slot.id)}
                          className="px-2 py-1 rounded-md bg-[#8C6D37] hover:bg-[#73582A] text-white text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Elegir Foto</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 1. CONTROL DESLIZANTE: ZOOM */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#595248] flex items-center gap-1">
                        <ZoomIn className="w-3 h-3 text-[#8C6D37]" />
                        <span>Zoom</span>
                      </label>
                      <span className="font-mono font-bold text-[11px] text-[#8C6D37] bg-[#8C6D37]/10 px-1.5 py-0.2 rounded">
                        {Math.round((selectedSlotData.slot.customScale || 1) * 100)}%
                      </span>
                    </div>

                    {/* Range Slider */}
                    <input
                      type="range"
                      min="1.0"
                      max="3.0"
                      step="0.05"
                      value={selectedSlotData.slot.customScale || 1}
                      onChange={(e) => handleSlotSetScale(selectedSlotData.slot.id, parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-[#EFE9DE] rounded-lg appearance-none cursor-pointer accent-[#8C6D37]"
                    />

                    {/* Quick Presets & Precision Steppers */}
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => handleSlotZoom(selectedSlotData.slot.id, -0.1)}
                        className="px-2 py-0.5 rounded bg-[#EFE9DE] hover:bg-[#E2D8C7] text-xs font-bold text-[#1F1C18] cursor-pointer"
                        title="Reducir zoom 10%"
                      >
                        -
                      </button>
                      <div className="flex items-center gap-1">
                        {[1, 1.25, 1.5, 2, 3].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handleSlotSetScale(selectedSlotData.slot.id, val)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                              Math.abs((selectedSlotData.slot.customScale || 1) - val) < 0.05
                                ? 'bg-[#8C6D37] text-white shadow-xs'
                                : 'bg-[#EFE9DE] hover:bg-[#E2D8C7] text-[#595248]'
                            }`}
                          >
                            {val === 1 ? '1x' : `${val}x`}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSlotZoom(selectedSlotData.slot.id, 0.1)}
                        className="px-2 py-0.5 rounded bg-[#EFE9DE] hover:bg-[#E2D8C7] text-xs font-bold text-[#1F1C18] cursor-pointer"
                        title="Aumentar zoom 10%"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* 2. CONTROLES DESLIZANTES: DESPLAZAMIENTO X & Y */}
                  {(() => {
                    const selectedSlotPhoto = uploadedPhotos.find((p) => p.id === selectedSlotData.slot.photoId);
                    const selectedBounds = getSlotPanBounds(selectedSlotData.slot, selectedSlotPhoto);
                    const currentPanX = Math.max(selectedBounds.minX, Math.min(selectedBounds.maxX, selectedSlotData.slot.customPosition?.x || 0));
                    const currentPanY = Math.max(selectedBounds.minY, Math.min(selectedBounds.maxY, selectedSlotData.slot.customPosition?.y || 0));

                    return (
                      <div className="space-y-1.5 pt-1.5 border-t border-[#E8E2D5]">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-[#595248] flex items-center gap-1">
                            <Move className="w-3 h-3 text-[#8C6D37]" />
                            <span>Posición (X / Y)</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleResetSlotPosition(selectedSlotData.slot.id)}
                            className="text-[10px] font-bold text-[#8C6D37] hover:underline cursor-pointer"
                          >
                            Centrar
                          </button>
                        </div>

                        {/* Horizontal X Slider */}
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between text-[9px] text-[#736B60]">
                            <span>Horizontal (X)</span>
                            <span className="font-mono font-bold text-[#1F1C18]">
                              {currentPanX}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={selectedBounds.minX}
                            max={selectedBounds.maxX}
                            step="1"
                            disabled={selectedBounds.maxPanX === 0}
                            value={currentPanX}
                            onChange={(e) => handleSlotSetPositionX(selectedSlotData.slot.id, parseInt(e.target.value))}
                            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#8C6D37] ${
                              selectedBounds.maxPanX === 0 ? 'bg-[#E5DFD3] opacity-50 cursor-not-allowed' : 'bg-[#EFE9DE]'
                            }`}
                          />
                        </div>

                        {/* Vertical Y Slider */}
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between text-[9px] text-[#736B60]">
                            <span>Vertical (Y)</span>
                            <span className="font-mono font-bold text-[#1F1C18]">
                              {currentPanY}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={selectedBounds.minY}
                            max={selectedBounds.maxY}
                            step="1"
                            disabled={selectedBounds.maxPanY === 0}
                            value={currentPanY}
                            onChange={(e) => handleSlotSetPositionY(selectedSlotData.slot.id, parseInt(e.target.value))}
                            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#8C6D37] ${
                              selectedBounds.maxPanY === 0 ? 'bg-[#E5DFD3] opacity-50 cursor-not-allowed' : 'bg-[#EFE9DE]'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* 3. CONTROL DESLIZANTE: BORDE & PASSEPARTOUT */}
                  <div className="space-y-1.5 pt-1.5 border-t border-[#E8E2D5]">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#595248] flex items-center gap-1">
                        <Crop className="w-3 h-3 text-[#8C6D37]" />
                        <span>Borde</span>
                      </label>
                      <span className="font-mono font-bold text-[11px] text-[#1F1C18]">
                        {selectedSlotData.slot.borderWidth || 0}px
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={selectedSlotData.slot.borderWidth || 0}
                      onChange={(e) =>
                        handleSlotBorder(
                          selectedSlotData.slot.id,
                          parseInt(e.target.value),
                          selectedSlotData.slot.borderColor || '#FFFFFF'
                        )
                      }
                      className="w-full h-1.5 bg-[#EFE9DE] rounded-lg appearance-none cursor-pointer accent-[#8C6D37]"
                    />

                    {/* Border Color Swatches */}
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[9px] text-[#736B60]">Color:</span>
                      <div className="flex items-center gap-1">
                        {[
                          { color: '#FFFFFF', name: 'Blanco' },
                          { color: '#C5A059', name: 'Oro Fine Art' },
                          { color: '#1F1C18', name: 'Negro Carbón' },
                          { color: '#EFE9DE', name: 'Marfil' },
                          { color: '#D6CEBE', name: 'Lino' },
                        ].map((c) => (
                          <button
                            key={c.color}
                            type="button"
                            onClick={() =>
                              handleSlotBorder(
                                selectedSlotData.slot.id,
                                (selectedSlotData.slot.borderWidth || 0) > 0 ? selectedSlotData.slot.borderWidth! : 4,
                                c.color
                              )
                            }
                            className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 shadow-xs cursor-pointer ${
                              selectedSlotData.slot.borderColor === c.color && (selectedSlotData.slot.borderWidth || 0) > 0
                                ? 'ring-2 ring-[#8C6D37] scale-110'
                                : 'border-[#D6CEBE]'
                            }`}
                            style={{ backgroundColor: c.color }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 4. MODO DE RELLENO (FIT / COVER) */}
                  <div className="space-y-1 pt-1.5 border-t border-[#E8E2D5]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#595248] block">
                      Ajuste
                    </span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedSlotData.slot.fitMode === 'contain') {
                            handleSlotFitMode(selectedSlotData.slot.id);
                          }
                        }}
                        className={`py-1 px-1.5 rounded-md text-[10px] font-bold transition-all border cursor-pointer ${
                          selectedSlotData.slot.fitMode !== 'contain'
                            ? 'bg-[#1F1C18] text-[#FDFCF9] border-[#1F1C18] shadow-xs'
                            : 'bg-white text-[#736B60] border-[#D6CEBE] hover:text-[#1F1C18]'
                        }`}
                      >
                        Llenar Marco
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedSlotData.slot.fitMode !== 'contain') {
                            handleSlotFitMode(selectedSlotData.slot.id);
                          }
                        }}
                        className={`py-1 px-1.5 rounded-md text-[10px] font-bold transition-all border cursor-pointer ${
                          selectedSlotData.slot.fitMode === 'contain'
                            ? 'bg-[#1F1C18] text-[#FDFCF9] border-[#1F1C18] shadow-xs'
                            : 'bg-white text-[#736B60] border-[#D6CEBE] hover:text-[#1F1C18]'
                        }`}
                      >
                        Foto Completa
                      </button>
                    </div>
                  </div>

                  {/* 5. ROTACIÓN Y REFLEJO */}
                  <div className="space-y-1.5 pt-1.5 border-t border-[#E8E2D5]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#595248] block">
                        Rotación
                      </span>
                      <span className="font-mono font-bold text-[11px] text-[#1F1C18]">
                        {selectedSlotData.slot.rotation || 0}°
                      </span>
                    </div>

                    {/* Rotation Range Slider */}
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="1"
                      value={selectedSlotData.slot.rotation || 0}
                      onChange={(e) =>
                        handleSlotSetRotation(selectedSlotData.slot.id, parseInt(e.target.value) || 0)
                      }
                      className="w-full h-1.5 bg-[#EFE9DE] rounded-lg appearance-none cursor-pointer accent-[#8C6D37]"
                    />

                    <div className="grid grid-cols-4 gap-1">
                      {[0, 90, 180, 270].map((deg) => (
                        <button
                          key={deg}
                          type="button"
                          onClick={() => handleSlotSetRotation(selectedSlotData.slot.id, deg)}
                          className={`py-0.5 rounded text-[9px] font-bold transition-all border cursor-pointer ${
                            (selectedSlotData.slot.rotation || 0) === deg
                              ? 'bg-[#8C6D37] text-white border-[#8C6D37]'
                              : 'bg-white text-[#595248] border-[#D6CEBE] hover:bg-[#EFE9DE]'
                          }`}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleSlotRotate(selectedSlotData.slot.id)}
                        className="py-1 px-1.5 rounded-md bg-white border border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#1F1C18] text-[9px] font-bold flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>+90°</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSlotFlipH(selectedSlotData.slot.id)}
                        className={`py-1 px-1.5 rounded-md border text-[9px] font-bold flex items-center justify-center gap-1 shadow-xs cursor-pointer ${
                          selectedSlotData.slot.flipH
                            ? 'bg-[#8C6D37] text-white border-[#8C6D37]'
                            : 'bg-white border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#1F1C18]'
                        }`}
                      >
                        <FlipHorizontal className="w-3 h-3" />
                        <span>Espejo</span>
                      </button>
                    </div>
                  </div>

                  {/* 6. TAMAÑO Y POSICIÓN DEL MARCO */}
                  <div className="space-y-1.5 pt-1.5 border-t border-[#E8E2D5]">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#595248] flex items-center gap-1">
                        <Move className="w-3 h-3 text-[#0091FF]" />
                        <span>Tamaño Marco</span>
                      </label>
                      {Boolean(
                        selectedSlotData.slot.frameWidthDelta ||
                        selectedSlotData.slot.frameHeightDelta ||
                        selectedSlotData.slot.frameOffsetX ||
                        selectedSlotData.slot.frameOffsetY
                      ) && (
                        <button
                          type="button"
                          onClick={() => handleResetFrameDimensions(selectedSlotData.slot.id)}
                          className="text-[9px] font-bold text-[#8C6D37] hover:underline cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Width Delta Slider */}
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between text-[9px] text-[#736B60]">
                        <span>Ancho</span>
                        <span className="font-mono font-bold text-[#1F1C18]">
                          {(selectedSlotData.slot.frameWidthDelta || 0) >= 0 ? `+${selectedSlotData.slot.frameWidthDelta || 0}` : selectedSlotData.slot.frameWidthDelta}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-150"
                        max="300"
                        step="5"
                        value={selectedSlotData.slot.frameWidthDelta || 0}
                        onChange={(e) => handleSlotSetFrameWidth(selectedSlotData.slot.id, parseInt(e.target.value))}
                        className="w-full h-1.5 bg-[#EFE9DE] rounded-lg appearance-none cursor-pointer accent-[#0091FF]"
                      />
                    </div>

                    {/* Height Delta Slider */}
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between text-[9px] text-[#736B60]">
                        <span>Alto</span>
                        <span className="font-mono font-bold text-[#1F1C18]">
                          {(selectedSlotData.slot.frameHeightDelta || 0) >= 0 ? `+${selectedSlotData.slot.frameHeightDelta || 0}` : selectedSlotData.slot.frameHeightDelta}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-150"
                        max="300"
                        step="5"
                        value={selectedSlotData.slot.frameHeightDelta || 0}
                        onChange={(e) => handleSlotSetFrameHeight(selectedSlotData.slot.id, parseInt(e.target.value))}
                        className="w-full h-1.5 bg-[#EFE9DE] rounded-lg appearance-none cursor-pointer accent-[#0091FF]"
                      />
                    </div>
                  </div>

                  {/* 7. FILTROS FINE ART */}
                  <div className="space-y-1 pt-1.5 border-t border-[#E8E2D5]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#595248] block">
                      Filtros
                    </span>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: 'none', label: 'Original' },
                        { id: 'fine-art-bw', label: 'B&N Fine Art' },
                        { id: 'warm-vintage', label: 'Warm Vintage' },
                        { id: 'high-contrast', label: 'Alto Contraste' },
                        { id: 'fuji-film', label: 'Fuji Astia' },
                        { id: 'kodak-chrome', label: 'Kodak Portra' },
                        { id: 'matte-portrait', label: 'Matte' },
                      ].map((f) => {
                        const isCurrent = (selectedSlotData.slot.filter || 'none') === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => handleSlotFilter(selectedSlotData.slot.id, f.id as any)}
                            className={`py-1 px-1.5 rounded-md text-[9px] font-bold transition-all text-left truncate border cursor-pointer ${
                              isCurrent
                                ? 'bg-[#8C6D37] text-white border-[#8C6D37] shadow-xs'
                                : 'bg-white text-[#595248] border-[#D6CEBE] hover:bg-[#EFE9DE]'
                            }`}
                          >
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 8. DESELECCIONAR */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedSlotId(null)}
                      className="w-full py-1.5 rounded-lg bg-[#EFE9DE] hover:bg-[#E2D8C7] text-[#595248] text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              ) : (
                /* Mode 2 - General Spread Controls */
                <div className="p-3 space-y-3">
                  {/* Active Spread Info Card */}
                  <div className="p-2 rounded-lg border border-[#D6CEBE] bg-[#F4EFE6]/80 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-[#1F1C18] block">
                        Pliego {activeSpreadIndex + 1} de {spreads.length}
                      </span>
                      <span className="text-[9px] text-[#736B60]">
                        Págs. {activeSpreadIndex * 2 + 1} y {activeSpreadIndex * 2 + 2}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-[#8C6D37] uppercase bg-[#8C6D37]/10 px-1.5 py-0.2 rounded">
                      Activo
                    </span>
                  </div>

                  {/* SEPARACIÓN ENTRE FOTOS (GAP) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#595248] flex items-center gap-1">
                        <Grid className="w-3 h-3 text-[#8C6D37]" />
                        <span>Separación (Gap)</span>
                      </label>
                      <span className="font-mono font-bold text-[11px] text-[#8C6D37] bg-[#8C6D37]/10 px-1.5 py-0.2 rounded">
                        {spreadPhotoGap}px
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="32"
                      step="2"
                      value={spreadPhotoGap}
                      onChange={(e) => setSpreadPhotoGap(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#EFE9DE] rounded-lg appearance-none cursor-pointer accent-[#8C6D37]"
                    />

                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { val: 0, label: '0px' },
                        { val: 8, label: '8px' },
                        { val: 16, label: '16px' },
                        { val: 24, label: '24px' },
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => setSpreadPhotoGap(preset.val)}
                          className={`py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                            spreadPhotoGap === preset.val
                              ? 'bg-[#8C6D37] text-white shadow-xs'
                              : 'bg-[#EFE9DE] hover:bg-[#E2D8C7] text-[#595248]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* FONDOS PARA EL PLIEGO */}
                  <div className="space-y-1.5 pt-1.5 border-t border-[#E8E2D5]">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#595248] flex items-center gap-1">
                      <Palette className="w-3 h-3 text-[#8C6D37]" />
                      <span>Color de Fondo</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[
                        { color: '#FFFFFF', name: 'Blanco Puro' },
                        { color: '#FDFCFA', name: 'Lino Cálido' },
                        { color: '#FAF6EF', name: 'Marfil Algodón' },
                        { color: '#F2F4F0', name: 'Salvia' },
                        { color: '#2B2B2B', name: 'Carbón' },
                      ].map((bg) => (
                        <button
                          key={bg.color}
                          type="button"
                          onClick={() => handleSetSpreadBgColor(bg.color)}
                          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 shadow-xs flex items-center justify-center cursor-pointer ${
                            (activeSpread.backgroundColor || spreadBgColor) === bg.color ? 'ring-2 ring-[#8C6D37] scale-110' : 'border-[#D6CEBE]'
                          }`}
                          style={{ backgroundColor: bg.color }}
                          title={bg.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* HERRAMIENTAS DE TEXTO */}
                  <div className="space-y-1.5 pt-1.5 border-t border-[#E8E2D5]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#595248] flex items-center gap-1">
                      <Type className="w-3 h-3 text-[#8C6D37]" />
                      <span>Añadir Texto</span>
                    </span>

                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => handleAddFloatingText('title')}
                        className="p-1.5 rounded-lg bg-white border border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#1F1C18] text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Heading1 className="w-3 h-3 text-[#8C6D37]" />
                        <span>Título</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddFloatingText('subtitle')}
                        className="p-1.5 rounded-lg bg-white border border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#1F1C18] text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Heading2 className="w-3 h-3 text-[#8C6D37]" />
                        <span>Subtítulo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddFloatingText('quote')}
                        className="p-1.5 rounded-lg bg-white border border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#1F1C18] text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Quote className="w-3 h-3 text-[#8C6D37]" />
                        <span>Cita</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddFloatingText('label')}
                        className="p-1.5 rounded-lg bg-white border border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#1F1C18] text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Tag className="w-3 h-3 text-[#8C6D37]" />
                        <span>Etiqueta</span>
                      </button>
                    </div>
                  </div>

                  {/* COMPOSICIÓN */}
                  <div className="space-y-1.5 pt-1.5 border-t border-[#E8E2D5]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#595248] block">
                      Composición
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleSpreadFlushMargin}
                      className={`w-full p-1.5 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer ${
                        activeSpread.isFlushMargin
                          ? 'bg-[#8C6D37] text-white border-[#8C6D37]'
                          : 'bg-white border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#1F1C18]'
                      }`}
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>{activeSpread.isFlushMargin ? 'Sin Margen' : 'Llenar Pliego'}</span>
                    </button>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => handleAddPhotoSlotToPage('left')}
                        className="p-1.5 rounded-lg bg-white border border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#1F1C18] text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3 h-3 text-[#8C6D37]" />
                        <span>+ Marco Izq</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddPhotoSlotToPage('right')}
                        className="p-1.5 rounded-lg bg-white border border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#1F1C18] text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3 h-3 text-[#8C6D37]" />
                        <span>+ Marco Der</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleFlipSpreadSides}
                      className="w-full p-1.5 rounded-lg bg-white border border-[#D6CEBE] hover:bg-[#EFE9DE] text-[#1F1C18] text-[10px] font-bold flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                    >
                      <ArrowLeftRight className="w-3 h-3 text-[#8C6D37]" />
                      <span>Invertir (Izq ⇄ Der)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAutoLayout}
                      className="w-full p-2 rounded-lg bg-[#8C6D37] text-white hover:bg-[#73582A] text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Auto-Fill Inteligente</span>
                    </button>
                  </div>
                </div>
              )}
                </>
              )}
            </div>
          </div>
        )}

        {/* STEP 5: 3D FLIP PREVIEW & FINAL SUMMARY */}
        {currentStep === 'preview' && (
          <div className="w-full flex-1 overflow-y-auto min-h-0 p-3 sm:p-4">
            <div className="max-w-3xl mx-auto pb-8 flex flex-col items-center">
              <div className="text-center mb-3">
                <span className="text-[9px] font-bold tracking-widest text-[#8C6D37] uppercase">Paso 5 de 5</span>
                <h2 className="font-serif-luxury text-xl sm:text-2xl text-[#1F1C18]">
                  Hojeado Digital & Revisión Final
                </h2>
                <p className="text-[11px] text-[#595248]">
                  Revisa cada pliego antes de enviar tu fotolibro a impresión artesanal.
                </p>
              </div>

              {/* Flip Book Showcase */}
              <div 
                className="w-full aspect-[16/10] max-h-[50vh] bg-[#FDFCFA] rounded-2xl shadow-2xl border border-[#D6CEBE] overflow-hidden flex relative mb-3 paper-texture"
                style={{
                  backgroundColor: activeSpread.backgroundColor || '#FFFFFF',
                }}
              >
                {/* Center Spine Gutter Shadow */}
                <div className="absolute inset-y-0 left-1/2 -ml-3 w-6 book-gutter-shadow pointer-events-none z-20" />
                
                {activeSpread.isFullSpreadBleed ? (
                  <div className="w-full h-full relative">
                    {activeSpread.fullSpreadPhotoId && uploadedPhotos.find((p) => p.id === activeSpread.fullSpreadPhotoId) ? (
                      <img
                        src={getPhotoDisplayUrl(uploadedPhotos.find((p) => p.id === activeSpread.fullSpreadPhotoId))}
                        alt="Foto Panorámica"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#EFE9DE] flex flex-col items-center justify-center text-xs text-[#736B60]">
                        <ImageIcon className="w-8 h-8 mb-1 text-[#8C6D37]/40" />
                        <span>Pliego Panorámico a Doble Página</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* LEFT PAGE */}
                    <div className={`w-1/2 h-full flex flex-col justify-between relative border-r border-[#EAE4D8] ${
                      activeSpread.isFlushMargin ? 'p-0' : 'p-3 sm:p-5'
                    }`}>
                      <div className="flex-1 flex flex-col justify-center items-center h-full w-full">
                        {renderPageLayoutContent(activeSpread.leftPage, false, true)}
                      </div>
                      <span className={`text-[9px] font-mono text-[#A89F91] text-left ${
                        activeSpread.isFlushMargin ? 'p-1.5 bg-black/40 text-white rounded-tr' : ''
                      }`}>
                        {activeSpreadIndex * 2 + 1}
                      </span>
                    </div>

                    {/* RIGHT PAGE */}
                    <div className={`w-1/2 h-full flex flex-col justify-between relative ${
                      activeSpread.isFlushMargin ? 'p-0' : 'p-3 sm:p-5'
                    }`}>
                      <div className="flex-1 flex flex-col justify-center items-center h-full w-full">
                        {renderPageLayoutContent(activeSpread.rightPage, true, true)}
                      </div>
                      <span className={`text-[9px] font-mono text-[#A89F91] text-right ${
                        activeSpread.isFlushMargin ? 'p-1.5 bg-black/40 text-white rounded-tl' : ''
                      }`}>
                        {activeSpreadIndex * 2 + 2}
                      </span>
                    </div>
                  </>
                )}

                {/* Floating Text Overlays in Preview */}
                {activeSpread.textElements && activeSpread.textElements.map((txt) => (
                  <div
                    key={txt.id}
                    className="absolute z-30 select-none pointer-events-none"
                    style={{
                      left: `${txt.position.x}%`,
                      top: `${txt.position.y}%`,
                      transform: 'translate(-50%, -50%)',
                      fontFamily:
                        txt.fontFamily === 'serif-luxury'
                          ? '"Playfair Display", Georgia, serif'
                          : txt.fontFamily === 'mono-clean'
                          ? 'ui-monospace, monospace'
                          : txt.fontFamily === 'script-hand'
                          ? 'cursive'
                          : 'inherit',
                      fontSize: `${txt.fontSize}px`,
                      fontWeight: txt.isBold ? 'bold' : 'normal',
                      fontStyle: txt.isItalic ? 'italic' : 'normal',
                      color: txt.color,
                      textAlign: txt.alignment,
                      letterSpacing: txt.letterSpacing,
                      padding: '4px 8px',
                      maxWidth: '80%',
                    }}
                  >
                    {txt.text}
                  </div>
                ))}
              </div>

              {/* Spread Quick Thumbnails Strip in Preview Mode */}
              <div className="w-full flex items-center justify-center gap-1.5 overflow-x-auto py-1.5 mb-2.5 max-w-full">
                {spreads.map((sp, idx) => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => setActiveSpreadIndex(idx)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold shrink-0 transition-all cursor-pointer ${
                      activeSpreadIndex === idx
                        ? 'bg-[#1F1C18] text-[#ECC880] shadow-md ring-2 ring-[#8C6D37]'
                        : 'bg-[#F0EBE1] text-[#595248] hover:bg-[#E2D8C7]'
                    }`}
                  >
                    Pliego {idx + 1}
                  </button>
                ))}
              </div>

              {/* Stepper controls */}
              <div className="flex items-center gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setActiveSpreadIndex((prev) => Math.max(0, prev - 1))}
                  disabled={activeSpreadIndex === 0}
                  className="px-3.5 py-1.5 rounded-full border border-[#D6CEBE] bg-[#FDFCF9] text-xs font-semibold text-[#1F1C18] disabled:opacity-30 hover:bg-[#EFE9DE] cursor-pointer"
                >
                  ← Pliego Anterior
                </button>
                <span className="font-serif-luxury text-sm font-bold text-[#1F1C18]">
                  Pliego {activeSpreadIndex + 1} de {spreads.length}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSpreadIndex((prev) => Math.min(spreads.length - 1, prev + 1))}
                  disabled={activeSpreadIndex === spreads.length - 1}
                  className="px-3.5 py-1.5 rounded-full border border-[#D6CEBE] bg-[#FDFCF9] text-xs font-semibold text-[#1F1C18] disabled:opacity-30 hover:bg-[#EFE9DE] cursor-pointer"
                >
                  Siguiente Pliego →
                </button>
              </div>

              {/* Final Order Confirmation Card */}
              <div className="w-full rounded-xl border border-[#8C6D37] bg-[#FDFCF9] p-4 shadow-lg text-left space-y-3">
                <div className="flex items-center justify-between border-b border-[#E8E2D5] pb-2.5">
                  <div>
                    <h3 className="font-serif-luxury text-base sm:text-lg font-bold text-[#1F1C18]">{foilTitleText}</h3>
                    <p className="text-[11px] text-[#736B60]">{currentFormat.name} · {currentCover.name}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-serif-luxury text-lg sm:text-xl font-bold text-[#1F1C18]">
                      {formatPriceARS(totalPrice)} ARS
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[#595248]">
                  <div>
                    <span className="block text-[#736B60] font-medium">Papel:</span>
                    <span className="font-semibold text-[#1F1C18]">{currentPaper.name}</span>
                  </div>
                  <div>
                    <span className="block text-[#736B60] font-medium">Páginas:</span>
                    <span className="font-semibold text-[#1F1C18]">{totalPages} pág ({spreads.length} pliegos)</span>
                  </div>
                  <div>
                    <span className="block text-[#736B60] font-medium">Grabado:</span>
                    <span className="font-semibold text-[#1F1C18]">Hot Stamping {foilColor.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="block text-[#736B60] font-medium">Cofre de Regalo:</span>
                    <span className="font-semibold text-[#1F1C18]">{giftBoxIncluded ? 'Incluido' : 'No'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleFinishAndOrder}
                  className="w-full py-3 rounded-full bg-[#1F1C18] text-[#FDFCF9] text-xs uppercase tracking-widest font-bold hover:bg-[#3D352E] shadow-lg flex items-center justify-center gap-2 mt-2"
                >
                  <BookOpen className="w-4 h-4 text-[#ECC880]" />
                  <span>Confirmar y Enviar a Fabricación</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fine Art Quality Modal Inspector */}
        {inspectedPhotoForQuality && (
          <FineArtQualityModal
            photo={inspectedPhotoForQuality}
            onClose={() => setInspectedPhotoForQuality(null)}
          />
        )}

        {/* Modal: Cambiar / Reemplazar Foto de la Ranura */}
        {showSwapPickerSlotId && (() => {
          let targetSpreadIdx = activeSpreadIndex;
          let targetPageNum = activeSpreadIndex * 2 + 1;
          let targetSlotObj: any = null;

          for (let i = 0; i < spreads.length; i++) {
            const sp = spreads[i];
            const lSlot = sp.leftPage?.slots.find((s) => s.id === showSwapPickerSlotId);
            if (lSlot) {
              targetSpreadIdx = i;
              targetPageNum = i * 2 + 1;
              targetSlotObj = lSlot;
              break;
            }
            const rSlot = sp.rightPage?.slots.find((s) => s.id === showSwapPickerSlotId);
            if (rSlot) {
              targetSpreadIdx = i;
              targetPageNum = i * 2 + 2;
              targetSlotObj = rSlot;
              break;
            }
          }

          const currentPhotoObj = targetSlotObj?.photoId
            ? uploadedPhotos.find((p) => p.id === targetSlotObj.photoId)
            : null;

          return (
            <div 
              className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
              onClick={() => setShowSwapPickerSlotId(null)}
            >
              <div 
                className="bg-[#FDFCF9] rounded-2xl border border-[#D6CEBE] shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-[#E8E2D5] bg-[#FAF7F2] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#8C6D37]/15 border border-[#8C6D37]/30 flex items-center justify-center text-[#8C6D37] shrink-0">
                      <ArrowLeftRight className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-serif-luxury text-lg font-bold text-[#1F1C18]">Cambiar Foto del Marco</h3>
                        <span className="px-2 py-0.5 rounded-full bg-[#8C6D37] text-white text-[10px] font-bold">
                          Página {targetPageNum} · Pliego {targetSpreadIdx + 1}
                        </span>
                      </div>
                      <p className="text-xs text-[#736B60]">
                        Selecciona cualquier foto de tu galería o sube una nueva para sustituir la imagen actual.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSwapPickerSlotId(null)}
                    className="p-2 rounded-xl text-[#736B60] hover:text-[#1F1C18] hover:bg-[#EFE9DE] transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Sub-bar: Current Photo + Direct Upload Button */}
                <div className="p-3 sm:p-4 bg-[#F4EFE6] border-b border-[#E8E2D5] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {currentPhotoObj ? (
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-[#D6CEBE] bg-white shrink-0 shadow-xs">
                          <img src={getThumbnailSrc(currentPhotoObj)} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] uppercase font-bold text-[#8C6D37] block">Foto en el Marco</span>
                          <span className="text-xs font-semibold text-[#1F1C18] truncate max-w-[200px] block">
                            {currentPhotoObj.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleRemovePhotoFromSlot(showSwapPickerSlotId);
                            setShowSwapPickerSlotId(null);
                          }}
                          className="ml-2 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Quitar Foto</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-[#736B60]">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="font-semibold text-[#1F1C18]">Marco vacío:</span> elige una foto para colocarla
                      </div>
                    )}
                  </div>

                  {/* Upload button */}
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#8C6D37] text-white text-xs font-bold hover:bg-[#73582A] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer ml-auto"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>+ Subir Nueva Foto</span>
                  </button>
                </div>

                {/* Photo Gallery Grid */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                  {uploadedPhotos.length === 0 ? (
                    <div className="text-center py-12">
                      <ImageIcon className="w-12 h-12 text-[#A89F91] mx-auto mb-3" />
                      <h4 className="text-sm font-bold text-[#1F1C18] mb-1">No hay fotos en tu galería</h4>
                      <p className="text-xs text-[#736B60] mb-4">Sube fotos para empezar a personalizar tu fotolibro.</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 rounded-xl bg-[#8C6D37] text-white text-xs font-bold hover:bg-[#73582A] cursor-pointer"
                      >
                        Subir Fotos
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {uploadedPhotos.map((p) => {
                        const isCurrent = currentPhotoObj?.id === p.id;
                        const usage = getPhotoUsageCount(p.id);

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              handleAssignPhotoToSlot(showSwapPickerSlotId, p.id);
                              setShowSwapPickerSlotId(null);
                            }}
                            className={`group relative aspect-square rounded-xl overflow-hidden border-2 transition-all p-1 bg-white flex flex-col justify-between cursor-pointer text-left ${
                              isCurrent
                                ? 'border-[#0091FF] ring-2 ring-[#0091FF]/40 shadow-lg scale-[1.02]'
                                : 'border-[#D6CEBE] hover:border-[#8C6D37] hover:shadow-md hover:scale-[1.03]'
                            }`}
                          >
                            <div className="w-full h-full rounded-lg overflow-hidden bg-[#EFE9DE] relative">
                              <img
                                src={getThumbnailSrc(p)}
                                alt={p.name}
                                className="w-full h-full object-cover select-none group-hover:scale-105 transition-transform duration-200"
                              />

                              {isCurrent && (
                                <div className="absolute inset-0 bg-[#0091FF]/30 flex items-center justify-center backdrop-blur-2xs">
                                  <span className="px-2 py-1 rounded-md bg-[#0091FF] text-white font-bold text-[10px] shadow-sm flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Actual
                                  </span>
                                </div>
                              )}

                              {!isCurrent && usage > 0 && (
                                <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white/90 text-[9px] font-semibold backdrop-blur-xs">
                                  En uso ({usage}x)
                                </div>
                              )}

                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="px-2.5 py-1 rounded-lg bg-white text-[#1F1C18] font-bold text-xs shadow-lg flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5 text-[#8C6D37]" />
                                  Asignar
                                </span>
                              </div>

                              {/* Delete photo button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePhoto(p.id);
                                }}
                                className="absolute bottom-1 right-1 p-1 rounded-md bg-rose-600/90 hover:bg-rose-700 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-xs z-20 cursor-pointer"
                                title={`Eliminar "${p.name || 'foto'}"`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-3 sm:p-4 border-t border-[#E8E2D5] bg-[#FAF7F2] flex items-center justify-between">
                  <span className="text-xs text-[#736B60]">
                    {uploadedPhotos.length} fotos en tu catálogo
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSwapPickerSlotId(null)}
                    className="px-4 py-2 rounded-xl bg-[#EFE9DE] hover:bg-[#D6CEBE] text-[#1F1C18] text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal: Catálogo Completo de Plantillas & Diseños */}
        {showTemplateGridModal && (
          <div 
            className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
            onClick={() => setShowTemplateGridModal(false)}
          >
            <div 
              className="bg-[#FDFCF9] rounded-2xl border border-[#D6CEBE] shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 sm:p-5 border-b border-[#E8E2D5] bg-[#FAF7F2] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#8C6D37]/15 border border-[#8C6D37]/30 flex items-center justify-center text-[#8C6D37] shrink-0">
                    <LayoutGrid className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif-luxury text-lg font-bold text-[#1F1C18]">Catálogo de Diseños de Pliego</h3>
                    <p className="text-xs text-[#736B60]">
                      Selecciona una composición para el Pliego {activeSpreadIndex + 1}. Las fotos existentes se adaptarán automáticamente.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTemplateGridModal(false)}
                  className="p-2 rounded-xl text-[#736B60] hover:text-[#1F1C18] hover:bg-[#EFE9DE] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {SPREAD_TEMPLATE_PRESETS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleApplySpreadTemplate(t.id)}
                    className="group relative p-3 rounded-xl border border-[#D6CEBE] bg-white hover:border-[#8C6D37] hover:shadow-lg transition-all text-left flex flex-col justify-between cursor-pointer"
                  >
                    <div className="w-full aspect-[16/10] rounded-lg overflow-hidden border border-[#E8E2D5] bg-[#FAF7F2] p-2 mb-2.5 flex items-center justify-center group-hover:scale-[1.02] transition-transform">
                      {t.renderDiagram()}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-xs text-[#1F1C18]">{t.title}</span>
                        {t.badge && (
                          <span className="px-1.5 py-0.5 rounded bg-[#8C6D37]/15 text-[#8C6D37] text-[9px] font-bold">
                            {t.badge}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#736B60] block">{t.subtitle}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
