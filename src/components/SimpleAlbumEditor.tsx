// Editor de fotolibros para clientes, con la interfaz y la forma de trabajar de SmartAlbums.
//
//   ┌──────────────────────── barra superior ─────────────────────────┐
//   │ Imágenes │        doble página grande (zoom)         │ Diseños  │
//   │ (bandeja)│                                            │ Estilo   │
//   │ filtros  │ ──── vista general de hojas (timeline) ─── │ Texto    │
//   │ orden    │                                            │ Página   │
//   └──────────────────────────────────────────────────────────────────┘
//
// - La bandeja de la izquierda tiene las fotos: filtros (todas / sin usar / usadas),
//   orden, tamaño de miniatura y marca de uso. Se arrastran de a una o varias.
// - La doble página del centro se diagrama sola al soltar fotos (src/lib/albumLayout.ts).
//   Soltar en el centro de una foto la reemplaza; en el borde, la agrega.
//   Las separaciones entre fotos se arrastran para agrandar una y achicar la otra.
//   Doble clic en una foto para encuadrarla (arrastrar + rueda).
// - El panel de la derecha muestra todos los diseños posibles para esas fotos
//   (miniaturas de alambre), separación / margen / a sangre / fotos a doble página,
//   fondos de página, textos y las acciones de la hoja (bloquear, vaciar, quitar).
// - Abajo, la vista general: hojas en miniatura, arrastrar para reordenar, insertar.
// - Atajos: ← → hojas · ↑ ↓ diseños · Supr quitar · B blanco y negro · L bloquear
//   · Ctrl+Z / Ctrl+Shift+Z · Ctrl+A seleccionar todas las fotos · ? ayuda.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eraser,
  Expand,
  ImagePlus,
  Images,
  Keyboard,
  LayoutGrid,
  Loader2,
  Lock,
  LockOpen,
  Minus,
  Package,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { PhotoAsset, PhotobookProject } from '../types';
import {
  COVER_OPTIONS,
  FOTOLIBRO_SIZES,
  FotolibroCoverType,
  FotolibroFinish,
  FotolibroLaminate,
  MAX_PHOTOS_PER_PAGE,
  MAX_SHEETS,
  getFotolibroSize,
  minSheetsFor,
} from '../data/fotolibroCatalog';
import {
  AlbumCell,
  AlbumDesign,
  AlbumSpread,
  DEFAULT_SPACING,
  Divider,
  FracRect,
  LayoutPhoto,
  PAGE_BACKGROUNDS,
  SpacingOptions,
  SpreadText,
  buildSpreads,
  effectiveDpi,
  findDividers,
  layoutSpread,
  moveDivider,
  newSpreadId,
  newTextId,
  pageSizeMm,
  placeImage,
  spreadVariants,
  suggestedSheets,
} from '../lib/albumLayout';
import { priceFotolibro } from '../lib/pricing';
import { formatPriceARS } from '../data/mockData';
import { batchProcessPhotoFiles } from '../lib/imageProcessor';
import { uploadOriginalPhoto } from '../lib/photoStorageService';
import { saveUserProject } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface SimpleAlbumEditorProps {
  onClose: () => void;
  onAddToCart: (project: PhotobookProject, totalPrice: number) => void;
  initialProject?: PhotobookProject | null;
  onOpenAuth?: () => void;
  /** Si se pasa, «Volver» devuelve el proyecto editado (lo usa FotolibroExpress para seguir desde ahí). */
  onExit?: (project: PhotobookProject) => void;
}

type Phase = 'setup' | 'upload' | 'choose-start' | 'editor';
type TrayFilter = 'all' | 'unused' | 'used';
type TraySort = 'date' | 'name' | 'orientation';
type RightTab = 'disenos' | 'estilo' | 'texto' | 'pagina';

const LOW_DPI = 150;
const COVER = -1;
const DRAG_TYPE = 'application/x-halo-photos';
const ACCENT = '#3B8BEB';
const WIDE = 1100;

// Paleta oscura tipo SmartAlbums
const C = {
  app: '#1C1C1E',
  bar: '#2A2A2D',
  panel: '#232326',
  panel2: '#2A2A2E',
  tray: '#19191B',
  line: '#0F0F10',
  line2: '#34343A',
  text: '#E4E4E6',
  dim: '#9A9AA0',
  faint: '#6B6B72',
  warn: '#E0B65A',
};

const FONT_FAMILY: Record<SpreadText['font'], string> = {
  serif: '"Cormorant Garamond", Georgia, serif',
  sans: '"Plus Jakarta Sans", Arial, sans-serif',
  script: '"Great Vibes", cursive',
};
const FONT_NAME: Record<SpreadText['font'], string> = { serif: 'Serif', sans: 'Sans', script: 'Manuscrita' };

function photoAspect(p?: PhotoAsset): number {
  if (!p) return 1.5;
  if (p.width && p.height) return p.width / p.height;
  return p.aspectRatio || 1.5;
}
const displaySrc = (p?: PhotoAsset) => (p ? p.hdDataUrl || p.url || p.thumbnailUrl || '' : '');
const thumbSrc = (p?: PhotoAsset) => (p ? p.thumbnailUrl || p.hdDataUrl || p.url || '' : '');

function sortPhotos(list: PhotoAsset[], by: TraySort = 'date'): PhotoAsset[] {
  return [...list].sort((a, b) => {
    if (by === 'name') return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
    if (by === 'orientation') {
      const d = photoAspect(b) - photoAspect(a);
      if (Math.abs(d) > 0.01) return d;
    }
    const da = a.dateTaken || '';
    const db = b.dateTaken || '';
    if (da !== db) return da < db ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
  });
}

function emptyDesign(): AlbumDesign {
  return {
    version: 1,
    sizeId: '30x30',
    coverType: 'dura',
    finish: 'foto-tapa-cuero',
    laminate: 'brillo',
    giftBox: false,
    cover: { zoom: 1, panX: 0.5, panY: 0.5, title: '' },
    spreads: [],
    spacing: { ...DEFAULT_SPACING },
    background: '#FFFFFF',
  };
}

const isDark = (hex?: string) => {
  if (!hex || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
};

interface DragPayload {
  photoIds: string[];
  fromSpreadId?: string;
  spreadIndex?: number;
}

// ---------------------------------------------------------------------------
// Piezas chicas
// ---------------------------------------------------------------------------

const PhotoImg: React.FC<{ photo?: PhotoAsset; frameAspect: number; zoom: number; panX: number; panY: number; thumb?: boolean; bw?: boolean }> = ({
  photo,
  frameAspect,
  zoom,
  panX,
  panY,
  thumb,
  bw,
}) => {
  if (!photo) return null;
  const pl = placeImage(frameAspect, photoAspect(photo), zoom, panX, panY);
  return (
    <img
      src={thumb ? thumbSrc(photo) : displaySrc(photo)}
      alt=""
      draggable={false}
      className="absolute max-w-none select-none pointer-events-none"
      style={{
        width: `${pl.width * 100}%`,
        height: `${pl.height * 100}%`,
        left: `${pl.left * 100}%`,
        top: `${pl.top * 100}%`,
        filter: bw ? 'grayscale(1)' : undefined,
      }}
    />
  );
};

/** Miniatura de alambre de un diseño (como el panel de diseños de SmartAlbums). */
const Wireframe: React.FC<{ rects: FracRect[]; aspect: number; active: boolean; onClick: () => void; index: number }> = ({ rects, aspect, active, onClick, index }) => (
  <button
    type="button"
    onClick={onClick}
    title={`Diseño ${index + 1}`}
    className="relative w-full rounded-sm overflow-hidden transition-transform hover:scale-[1.03]"
    style={{ aspectRatio: `${aspect}`, background: '#E9E9EC', outline: active ? `2px solid ${ACCENT}` : '1px solid #3A3A40', outlineOffset: 1 }}
  >
    {rects.map((r, i) => (
      <span key={i} className="absolute" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, background: active ? '#7FB2F0' : '#8E8E96' }} />
    ))}
    <span className="absolute inset-y-0 left-1/2 w-px" style={{ background: 'rgba(0,0,0,.25)' }} />
  </button>
);

const Section: React.FC<{ title: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => (
  <div className="px-3 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11px] uppercase tracking-widest" style={{ color: C.dim }}>{title}</span>
      {right}
    </div>
    {children}
  </div>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; format?: (v: number) => string }> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  format,
}) => (
  <label className="block text-xs mb-3" style={{ color: C.text }}>
    <div className="flex justify-between mb-1">
      <span>{label}</span>
      <span className="tabular-nums" style={{ color: C.dim }}>{format ? format(value) : `${value}${unit}`}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: ACCENT }} />
  </label>
);

const Toggle: React.FC<{ label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, hint, checked, onChange }) => (
  <button type="button" onClick={() => onChange(!checked)} className="w-full flex items-center justify-between gap-3 py-1.5 text-left" role="switch" aria-checked={checked}>
    <span>
      <span className="block text-xs" style={{ color: C.text }}>{label}</span>
      {hint && <span className="block text-[10px] leading-snug mt-0.5" style={{ color: C.faint }}>{hint}</span>}
    </span>
    <span className="shrink-0 w-8 h-[18px] rounded-full relative transition-colors" style={{ background: checked ? ACCENT : '#4A4A52' }}>
      <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all" style={{ left: checked ? 16 : 2 }} />
    </span>
  </button>
);

const SmallBtn: React.FC<{ onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean; danger?: boolean; title?: string; full?: boolean }> = ({
  onClick,
  children,
  active,
  disabled,
  danger,
  title,
  full,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`${full ? 'w-full justify-start' : ''} inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] disabled:opacity-30 transition-colors`}
    style={{ background: active ? '#3A3A40' : '#2E2E33', color: danger ? '#F87171' : C.text, boxShadow: active ? `inset 0 0 0 1px ${ACCENT}` : undefined }}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------

export const SimpleAlbumEditor: React.FC<SimpleAlbumEditorProps> = ({ onClose, onAddToCart, initialProject, onOpenAuth, onExit }) => {
  const { user, profile, isLoggedIn } = useAuth();
  const userId = user?.id || profile?.id;

  const [projectId] = useState(initialProject?.id || `proj-${Date.now()}`);
  const [createdAt] = useState(initialProject?.createdAt || new Date().toISOString());
  const [design, setDesign] = useState<AlbumDesign>(() => {
    const d = initialProject?.album || emptyDesign();
    return { ...d, spacing: { ...DEFAULT_SPACING, ...(d.spacing || {}) }, background: d.background || '#FFFFFF' };
  });
  const [photos, setPhotos] = useState<PhotoAsset[]>(() => initialProject?.photos || []);
  const [phase, setPhase] = useState<Phase>(() =>
    initialProject?.album?.spreads?.length ? 'editor' : initialProject?.photos?.length ? 'choose-start' : 'setup'
  );
  const [current, setCurrent] = useState(0);
  const [undoStack, setUndoStack] = useState<AlbumDesign[]>([]);
  const [redoStack, setRedoStack] = useState<AlbumDesign[]>([]);

  // Bandeja
  const [trayFilter, setTrayFilter] = useState<TrayFilter>('all');
  const [traySort, setTraySort] = useState<TraySort>('date');
  const [trayZoom, setTrayZoom] = useState(76);
  const [traySearch, setTraySearch] = useState('');
  const [traySel, setTraySel] = useState<string[]>([]);
  const lastTrayClick = useRef<string | null>(null);

  // Selección en la página
  const [selCell, setSelCell] = useState<{ spreadId: string; photoId: string } | null>(null);
  const [selText, setSelText] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [hover, setHover] = useState<{ spreadId: string; photoId?: string; mode: 'replace' | 'add' } | null>(null);
  const [timelineHover, setTimelineHover] = useState<string | null>(null);
  const [dragDivider, setDragDivider] = useState<number | null>(null);

  // Paneles
  const wide = () => typeof window !== 'undefined' && window.innerWidth >= WIDE;
  const [isWide, setIsWide] = useState(wide);
  const [leftOpen, setLeftOpen] = useState(wide);
  const [rightOpen, setRightOpen] = useState(wide);
  const [rightTab, setRightTab] = useState<RightTab>('disenos');
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [processing, setProcessing] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragPayload | null>(null);
  const spreadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onResize = () => {
      const w = wide();
      setIsWide((was) => {
        if (was !== w) {
          setLeftOpen(w);
          setRightOpen(w);
        }
        return w;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const size = getFotolibroSize(design.sizeId) || FOTOLIBRO_SIZES[0];
  const pageMm = pageSizeMm(design.sizeId);
  const spreadAspect = (pageMm.w * 2) / pageMm.h;
  const spacing: SpacingOptions = design.spacing || DEFAULT_SPACING;
  const sheets = design.spreads.length;
  const minSheets = minSheetsFor(design.coverType);

  const useCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const sp of design.spreads) for (const id of sp.photoIds) m.set(id, (m.get(id) || 0) + 1);
    if (design.cover.photoId) m.set(design.cover.photoId, (m.get(design.cover.photoId) || 0) + 1);
    return m;
  }, [design.spreads, design.cover.photoId]);
  const inSpreads = useMemo(() => new Set(design.spreads.flatMap((s) => s.photoIds)), [design.spreads]);
  const unusedCount = photos.filter((p) => !inSpreads.has(p.id)).length;

  const price =
    priceFotolibro({
      sizeId: design.sizeId,
      coverType: design.coverType,
      finish: design.finish,
      sheets: Math.max(sheets, minSheets),
      giftBox: design.giftBox,
    }) ?? 0;

  const toLayout = useCallback(
    (ids: string[]): LayoutPhoto[] => ids.filter((id) => photoById.has(id)).map((id) => ({ id, aspect: photoAspect(photoById.get(id)) })),
    [photoById]
  );
  const relayout = useCallback(
    (sp: AlbumSpread, d: AlbumDesign, variant = sp.variant): AlbumSpread => {
      const lp = toLayout(sp.photoIds);
      return { ...sp, photoIds: lp.map((p) => p.id), variant, cells: layoutSpread(lp, d.sizeId, variant, sp.cells, d.spacing), custom: false };
    },
    [toLayout]
  );

  const commit = useCallback((fn: (d: AlbumDesign) => AlbumDesign) => {
    setDesign((prev) => {
      const next = fn(prev);
      if (next !== prev) {
        setUndoStack((u) => [...u.slice(-59), prev]);
        setRedoStack([]);
      }
      return next;
    });
  }, []);
  const undo = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, design]);
    setUndoStack((u) => u.slice(0, -1));
    setDesign(prev);
    setSelCell(null);
    setSelText(null);
  };
  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, design]);
    setRedoStack((r) => r.slice(0, -1));
    setDesign(next);
  };

  // -------------------------------------------------------------------------
  // Fotos
  // -------------------------------------------------------------------------

  const handleFiles = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) return;
    setProcessing({ done: 0, total: files.length });
    try {
      const assets = await batchProcessPhotoFiles(files, { maxDimension: 380, quality: 0.8 }, (done, total) => setProcessing({ done, total }));
      const merged = sortPhotos([...photos, ...assets.map((a) => ({ ...a, uploadStatus: 'pending' as const }))]);
      setPhotos(merged);
      if (phase === 'upload') setPhase('choose-start');
      else {
        setToast(`${assets.length} fotos nuevas en la bandeja.`);
        setLeftOpen(true);
      }
    } finally {
      setProcessing(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startAlbum = (mode: 'auto' | 'blank') => {
    const lp = sortPhotos(photos).map((p) => ({ id: p.id, aspect: photoAspect(p) }));
    setDesign((d) => {
      const spreads =
        mode === 'auto'
          ? buildSpreads(lp, d.sizeId, suggestedSheets(lp.length, minSheetsFor(d.coverType)), d.spacing)
          : Array.from({ length: minSheetsFor(d.coverType) }, () => ({ id: newSpreadId(), photoIds: [], variant: 0, cells: [] }));
      return { ...d, spreads, cover: { ...d.cover, photoId: d.cover.photoId || (mode === 'auto' ? lp[0]?.id : undefined) } };
    });
    setUndoStack([]);
    setRedoStack([]);
    setCurrent(0);
    setPhase('editor');
  };

  // Respaldo de originales (solo con sesión)
  const uploading = useRef(new Set<string>());
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!isLoggedIn || !userId) return;
    const pending = photos.filter((p) => !p.storagePath && p.uploadStatus !== 'uploaded' && p.uploadStatus !== 'error' && p.url?.startsWith('blob:') && !uploading.current.has(p.id));
    if (!pending.length) return;
    let cancelled = false;
    (async () => {
      for (const p of pending) {
        if (cancelled) break;
        uploading.current.add(p.id);
        setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, uploadStatus: 'uploading' } : x)));
        try {
          const blob = await fetch(p.url).then((r) => r.blob());
          const file = new File([blob], p.name || `${p.id}.jpg`, { type: blob.type || 'image/jpeg' });
          const { storagePath, error } = await uploadOriginalPhoto(userId, projectId, p.id, file);
          setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, storagePath: storagePath || undefined, uploadStatus: error ? 'error' : 'uploaded' } : x)));
        } catch {
          setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, uploadStatus: 'error' } : x)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, userId, photos.length, retry]);
  const pendingUploads = isLoggedIn ? photos.filter((p) => p.uploadStatus === 'uploading' || p.uploadStatus === 'pending').length : 0;
  const failedUploads = isLoggedIn ? photos.filter((p) => p.uploadStatus === 'error' && useCount.has(p.id)).length : 0;

  // Guardado automático
  const buildProject = useCallback(
    (): PhotobookProject => ({
      id: projectId,
      title: design.cover.title.trim() || 'Mi fotolibro',
      formatId: design.sizeId,
      coverMaterialId: 'photo-hardcover',
      foilColor: 'gold',
      foilTitleText: design.cover.title,
      foilSubtitleText: '',
      hasCoverWindow: false,
      paperFinishId: 'photo-lustre',
      photos,
      spreads: [],
      giftBoxIncluded: design.coverType === 'dura' ? true : design.giftBox,
      album: design,
      createdAt,
      updatedAt: new Date().toISOString(),
    }),
    [design, photos, projectId, createdAt]
  );
  useEffect(() => {
    if (phase !== 'editor' || !photos.length) return;
    const t = setTimeout(() => {
      saveUserProject(userId || 'local-user', buildProject(), price).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [design, photos, phase, userId, price, buildProject]);

  // -------------------------------------------------------------------------
  // Operaciones sobre el álbum
  // -------------------------------------------------------------------------

  const lockedToast = () => setToast('Esta hoja está bloqueada. Destrabala en el panel «Página» para cambiarla.');

  /** Agrega fotos a una doble página (sacándolas de donde estuvieran). */
  const addPhotos = (spreadId: string, ids: string[]) => {
    const target = design.spreads.find((s) => s.id === spreadId);
    if (target?.locked) return lockedToast();
    commit((d) => {
      const ti = d.spreads.findIndex((s) => s.id === spreadId);
      if (ti < 0) return d;
      const incoming = ids.filter((id) => !d.spreads[ti].photoIds.includes(id));
      if (!incoming.length) return d;
      const room = MAX_PHOTOS_PER_PAGE * 2 - d.spreads[ti].photoIds.length;
      const take = incoming.slice(0, Math.max(0, room));
      if (take.length < incoming.length) setToast(`Una doble página admite hasta ${MAX_PHOTOS_PER_PAGE * 2} fotos.`);
      if (!take.length) return d;
      const takeSet = new Set(take);
      return {
        ...d,
        spreads: d.spreads.map((s, i) => {
          if (i === ti) return relayout({ ...s, photoIds: [...s.photoIds, ...take] }, d, 0);
          if (!s.locked && s.photoIds.some((id) => takeSet.has(id))) return relayout({ ...s, photoIds: s.photoIds.filter((id) => !takeSet.has(id)) }, d, 0);
          return s;
        }),
      };
    });
  };

  /** Pone `photoId` en el lugar de `targetId` (intercambia si ya estaba en el álbum). */
  const replacePhoto = (spreadId: string, targetId: string, photoId: string) => {
    if (targetId === photoId) return;
    const target = design.spreads.find((s) => s.id === spreadId);
    if (target?.locked) return lockedToast();
    commit((d) => {
      const spreads = d.spreads.map((s) => ({ ...s, photoIds: [...s.photoIds] }));
      const ti = spreads.findIndex((s) => s.id === spreadId);
      if (ti < 0) return d;
      const tPos = spreads[ti].photoIds.indexOf(targetId);
      if (tPos < 0) return d;
      const si = spreads.findIndex((s) => s.photoIds.includes(photoId));
      if (si >= 0 && spreads[si].locked && si !== ti) return d;
      if (si >= 0) spreads[si].photoIds[spreads[si].photoIds.indexOf(photoId)] = targetId;
      spreads[ti].photoIds[tPos] = photoId;
      // Mismas celdas, otra foto: el encuadre se reinicia solo para las que cambiaron
      const keep = (s: AlbumSpread) => ({
        ...s,
        cells: s.photoIds.map((id, k) => {
          const old = s.cells[k];
          return old ? { ...old, photoId: id, zoom: old.photoId === id ? old.zoom : 1, panX: old.photoId === id ? old.panX : 0.5, panY: old.photoId === id ? old.panY : 0.5 } : old;
        }).filter(Boolean),
      });
      return { ...d, spreads: spreads.map((s, i) => (i === ti || i === si ? (s.cells.length === s.photoIds.length ? keep(s) : relayout(s, d)) : s)) };
    });
  };

  const removePhotos = (spreadId: string, ids: string[]) => {
    const target = design.spreads.find((s) => s.id === spreadId);
    if (target?.locked) return lockedToast();
    const set = new Set(ids);
    commit((d) => ({ ...d, spreads: d.spreads.map((s) => (s.id === spreadId ? relayout({ ...s, photoIds: s.photoIds.filter((id) => !set.has(id)) }, d, 0) : s)) }));
    setSelCell(null);
    setCropMode(false);
  };

  const setVariant = (variant: number) => {
    const sp = design.spreads[current];
    if (!sp) return;
    if (sp.locked) return lockedToast();
    commit((d) => ({ ...d, spreads: d.spreads.map((s) => (s.id === sp.id ? relayout(s, d, variant) : s)) }));
  };
  const cycleLayout = (dir: 1 | -1) => {
    const sp = design.spreads[current];
    if (!sp || variantList.length <= 1) return;
    setVariant((sp.variant + dir + variantList.length) % variantList.length);
  };

  const insertSpread = (at: number, ids: string[] = []) => {
    if (sheets >= MAX_SHEETS) {
      setToast(`El máximo es ${MAX_SHEETS} hojas.`);
      return;
    }
    commit((d) => {
      const set = new Set(ids);
      const cleaned = d.spreads.map((s) => (!s.locked && s.photoIds.some((id) => set.has(id)) ? relayout({ ...s, photoIds: s.photoIds.filter((id) => !set.has(id)) }, d, 0) : s));
      const fresh = relayout({ id: newSpreadId(), photoIds: ids.slice(0, MAX_PHOTOS_PER_PAGE * 2), variant: 0, cells: [], background: d.background }, d, 0);
      cleaned.splice(at, 0, fresh);
      return { ...d, spreads: cleaned };
    });
    setCurrent(at);
  };

  const duplicateSpread = (i: number) => {
    if (sheets >= MAX_SHEETS) return setToast(`El máximo es ${MAX_SHEETS} hojas.`);
    commit((d) => {
      const src = d.spreads[i];
      if (!src) return d;
      // Las fotos no se repiten: la copia queda con el mismo diseño pero vacía, lista para otras fotos
      const copy: AlbumSpread = { ...src, id: newSpreadId(), photoIds: [], cells: [], locked: false, texts: src.texts?.map((t) => ({ ...t, id: newTextId() })) };
      const spreads = [...d.spreads];
      spreads.splice(i + 1, 0, copy);
      return { ...d, spreads };
    });
    setCurrent(i + 1);
  };

  const deleteSpread = (i: number) => {
    if (sheets <= minSheets) {
      setToast(`Este fotolibro lleva como mínimo ${minSheets} hojas.`);
      return;
    }
    if (design.spreads[i]?.locked) return lockedToast();
    commit((d) => ({ ...d, spreads: d.spreads.filter((_, k) => k !== i) }));
    setCurrent((c) => Math.max(0, Math.min(c, sheets - 2)));
  };

  const clearSpread = (i: number) => {
    if (design.spreads[i]?.locked) return lockedToast();
    commit((d) => ({ ...d, spreads: d.spreads.map((s, k) => (k === i ? { ...s, photoIds: [], cells: [], texts: [], custom: false } : s)) }));
    setSelCell(null);
    setSelText(null);
  };

  const toggleLock = (i: number) => {
    commit((d) => ({ ...d, spreads: d.spreads.map((s, k) => (k === i ? { ...s, locked: !s.locked } : s)) }));
    setSelCell(null);
    setCropMode(false);
  };

  const moveSpreadTo = (from: number, to: number) => {
    if (from === to || to < 0 || to >= sheets) return;
    commit((d) => {
      const spreads = [...d.spreads];
      const [sp] = spreads.splice(from, 1);
      spreads.splice(to, 0, sp);
      return { ...d, spreads };
    });
    setCurrent(to);
  };

  const autoBuildAll = () => {
    if (design.spreads.some((s) => s.photoIds.length) && !window.confirm('¿Diseñar todo el álbum automáticamente? Se reemplaza el diseño actual (podés deshacerlo con Ctrl+Z).')) return;
    const lp = sortPhotos(photos).map((p) => ({ id: p.id, aspect: photoAspect(p) }));
    commit((d) => ({
      ...d,
      spreads: buildSpreads(lp, d.sizeId, suggestedSheets(lp.length, minSheetsFor(d.coverType)), d.spacing).map((s) => ({ ...s, background: d.background })),
      cover: { ...d.cover, photoId: d.cover.photoId || lp[0]?.id },
    }));
    setCurrent(0);
  };

  /** Rellena con las fotos sin usar, en orden, las páginas vacías y agrega hojas si hace falta. */
  const autoFillUnused = () => {
    const unused = sortPhotos(photos.filter((p) => !inSpreads.has(p.id))).map((p) => ({ id: p.id, aspect: photoAspect(p) }));
    if (!unused.length) return;
    commit((d) => {
      const spreads = [...d.spreads];
      const rest = [...unused];
      for (let i = 0; i < spreads.length && rest.length; i++) {
        if (!spreads[i].photoIds.length && !spreads[i].locked) spreads[i] = relayout({ ...spreads[i], photoIds: rest.splice(0, 6).map((p) => p.id) }, d, 0);
      }
      if (rest.length) {
        const room = MAX_SHEETS - spreads.length;
        const n = Math.min(room, Math.max(Math.ceil(rest.length / 6), Math.ceil(rest.length / (MAX_PHOTOS_PER_PAGE * 2))));
        if (n > 0) spreads.push(...buildSpreads(rest, d.sizeId, n, d.spacing).map((s) => ({ ...s, background: d.background })));
      }
      return { ...d, spreads };
    });
  };

  /** Una foto más en esta hoja: la primera que todavía no está en el álbum. */
  const addNextUnused = () => {
    if (!sp) return;
    if (sp.locked) return lockedToast();
    const next = sortPhotos(photos.filter((p) => !inSpreads.has(p.id)))[0];
    if (!next) return setToast('No quedan fotos sin usar: agregá más a la bandeja o arrastrá una desde otra hoja.');
    addPhotos(sp.id, [next.id]);
  };
  /** Una foto menos: sale la última de la hoja y vuelve a la bandeja. */
  const removeLast = () => {
    if (!sp || !sp.photoIds.length) return;
    removePhotos(sp.id, [sp.photoIds[sp.photoIds.length - 1]]);
  };

  const setSpacing = (patch: Partial<SpacingOptions>) => {
    commit((d) => {
      const nd = { ...d, spacing: { ...(d.spacing || DEFAULT_SPACING), ...patch } };
      return { ...nd, spreads: nd.spreads.map((s) => (s.locked ? s : relayout(s, nd))) };
    });
  };

  const changeFormat = (sizeId: string, coverType: FotolibroCoverType, finish: FotolibroFinish) => {
    commit((d) => {
      const nd = { ...d, sizeId, coverType, finish };
      let spreads = nd.spreads.map((s) => relayout(s, nd));
      const min = minSheetsFor(coverType);
      while (phase === 'editor' && spreads.length < min) spreads = [...spreads, { id: newSpreadId(), photoIds: [], variant: 0, cells: [], background: d.background }];
      return { ...nd, spreads };
    });
  };

  const updateCell = (spreadId: string, photoId: string, patch: Partial<AlbumCell>, withUndo = false) =>
    (withUndo ? commit : setDesign)((d: AlbumDesign) => ({
      ...d,
      spreads: d.spreads.map((s) => (s.id === spreadId ? { ...s, cells: s.cells.map((c) => (c.photoId === photoId ? { ...c, ...patch } : c)) } : s)),
    }));

  const toggleBw = () => {
    if (!selCell) return;
    const cell = design.spreads.find((s) => s.id === selCell.spreadId)?.cells.find((c) => c.photoId === selCell.photoId);
    if (cell) updateCell(selCell.spreadId, selCell.photoId, { bw: !cell.bw }, true);
  };

  const setBackground = (color: string, scope: 'this' | 'all') => {
    commit((d) => ({
      ...d,
      background: scope === 'all' ? color : d.background,
      spreads: d.spreads.map((s, i) => (scope === 'all' || i === current ? { ...s, background: color } : s)),
    }));
  };

  const setCoverPhoto = (photoId: string) => commit((d) => ({ ...d, cover: { ...d.cover, photoId, zoom: 1, panX: 0.5, panY: 0.5 } }));

  const removeFromTray = (ids: string[]) => {
    const removable = ids.filter((id) => !useCount.has(id));
    if (!removable.length) return setToast('Esas fotos están en el álbum: primero quitalas de las páginas.');
    if (!window.confirm(`¿Sacar ${removable.length} ${removable.length === 1 ? 'foto' : 'fotos'} de la bandeja?`)) return;
    const set = new Set(removable);
    setPhotos((prev) => prev.filter((p) => !set.has(p.id)));
    setTraySel([]);
  };

  // Textos
  const addText = () => {
    const sp = design.spreads[current];
    if (!sp) return;
    if (sp.locked) return lockedToast();
    const id = newTextId();
    const dark = isDark(sp.background || design.background);
    commit((d) => ({
      ...d,
      spreads: d.spreads.map((s) =>
        s.id === sp.id
          ? { ...s, texts: [...(s.texts || []), { id, text: 'Escribí acá', x: 0.55, y: 0.82, w: 0.4, size: 0.045, align: 'left', color: dark ? '#FFFFFF' : '#222222', font: 'serif' }] }
          : s
      ),
    }));
    setSelCell(null);
    setSelText(id);
    setRightTab('texto');
    setRightOpen(true);
  };
  const updateText = (spreadId: string, id: string, patch: Partial<SpreadText>, withUndo = true) =>
    (withUndo ? commit : setDesign)((d: AlbumDesign) => ({
      ...d,
      spreads: d.spreads.map((s) => (s.id === spreadId ? { ...s, texts: (s.texts || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) } : s)),
    }));
  const removeText = (spreadId: string, id: string) => {
    commit((d) => ({ ...d, spreads: d.spreads.map((s) => (s.id === spreadId ? { ...s, texts: (s.texts || []).filter((t) => t.id !== id) } : s)) }));
    setSelText(null);
  };

  // -------------------------------------------------------------------------
  // Arrastrar y soltar
  // -------------------------------------------------------------------------

  const beginDrag = (e: React.DragEvent, payload: DragPayload, previewSrc?: string) => {
    dragRef.current = payload;
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', payload.photoIds.join(','));
    e.dataTransfer.effectAllowed = 'move';
    if (previewSrc && payload.photoIds.length > 1) {
      const ghost = document.createElement('div');
      ghost.style.cssText = `position:fixed;top:-200px;left:-200px;width:72px;height:72px;border-radius:6px;background:url(${previewSrc}) center/cover;box-shadow:6px 6px 0 #555,12px 12px 0 #444;color:#fff;font:600 13px sans-serif;display:flex;align-items:flex-end;justify-content:flex-end;padding:4px`;
      ghost.textContent = String(payload.photoIds.length);
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 36, 36);
      setTimeout(() => ghost.remove(), 0);
    }
  };
  const readDrag = (e: React.DragEvent): DragPayload | null => {
    try {
      const raw = e.dataTransfer.getData(DRAG_TYPE);
      return raw ? JSON.parse(raw) : dragRef.current;
    } catch {
      return dragRef.current;
    }
  };
  const isOurDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);
  const endDrag = () => {
    if (dragRef.current && !dragRef.current.fromSpreadId && dragRef.current.spreadIndex === undefined) setTraySel([]);
    dragRef.current = null;
    setHover(null);
    setTimelineHover(null);
  };

  /** Soltar en el centro de una foto = reemplazar; en el borde = agregar a la página. */
  const zoneFor = (e: React.DragEvent): 'replace' | 'add' => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    return fx > 0.22 && fx < 0.78 && fy > 0.22 && fy < 0.78 ? 'replace' : 'add';
  };

  // Bandeja: filtro, orden, búsqueda y selección (clic, Ctrl/Cmd + clic, Shift + clic)
  const trayList = useMemo(() => {
    let l = photos;
    if (trayFilter === 'unused') l = l.filter((p) => !inSpreads.has(p.id));
    if (trayFilter === 'used') l = l.filter((p) => inSpreads.has(p.id));
    const q = traySearch.trim().toLowerCase();
    if (q) l = l.filter((p) => (p.name || '').toLowerCase().includes(q));
    return sortPhotos(l, traySort);
  }, [photos, trayFilter, inSpreads, traySearch, traySort]);
  const clickTray = (e: React.MouseEvent, id: string) => {
    setSelCell(null);
    setSelText(null);
    if (e.shiftKey && lastTrayClick.current) {
      const a = trayList.findIndex((p) => p.id === lastTrayClick.current);
      const b = trayList.findIndex((p) => p.id === id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setTraySel(trayList.slice(lo, hi + 1).map((p) => p.id));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) setTraySel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else setTraySel((s) => (s.length === 1 && s[0] === id ? [] : [id]));
    lastTrayClick.current = id;
  };

  // -------------------------------------------------------------------------
  // Datos de la hoja actual
  // -------------------------------------------------------------------------

  const sp = current >= 0 ? design.spreads[current] : undefined;
  const selected = selCell ? design.spreads.find((s) => s.id === selCell.spreadId)?.cells.find((c) => c.photoId === selCell.photoId) : undefined;
  const selectedText = selText && sp ? sp.texts?.find((t) => t.id === selText) : undefined;
  const variantList = useMemo(() => (sp ? spreadVariants(toLayout(sp.photoIds), design.sizeId, spacing) : []), [sp, toLayout, design.sizeId, spacing]);
  const dividers = useMemo(() => (sp && sp.cells.length > 1 ? findDividers(sp.cells) : []), [sp]);

  // -------------------------------------------------------------------------
  // Teclado
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (phase !== 'editor' || showOrder || showSetup) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setTraySel(trayList.map((p) => p.id));
        setLeftOpen(true);
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        setShowKeys((v) => !v);
        return;
      }
      if (e.key === 'ArrowRight') setCurrent((c) => Math.min(sheets - 1, c + 1));
      else if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(COVER, c - 1));
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        cycleLayout(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        cycleLayout(1);
      } else if (e.key === 'Escape') {
        if (preview) setPreview(false);
        setCropMode(false);
        setSelCell(null);
        setSelText(null);
        setTraySel([]);
        setShowKeys(false);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selCell) removePhotos(selCell.spreadId, [selCell.photoId]);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selText && sp) removeText(sp.id, selText);
      else if (e.key.toLowerCase() === 'b' && selCell) toggleBw();
      else if (e.key.toLowerCase() === 'l' && sp) toggleLock(current);
      else if (e.key === 'Enter' && selCell) setCropMode((v) => !v);
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)));
      else if (e.key === '-') setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)));
      else if (e.key === '0') setZoom(1);
      else if (e.key.toLowerCase() === 'f') setPreview((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    setSelCell(null);
    setSelText(null);
    setCropMode(false);
  }, [current]);

  // -------------------------------------------------------------------------
  // Render: doble página
  // -------------------------------------------------------------------------

  const startCropDrag = (e: React.PointerEvent, spreadId: string, cell: AlbumCell, cellAspect: number) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pl = placeImage(cellAspect, photoAspect(photoById.get(cell.photoId)), cell.zoom, cell.panX, cell.panY);
    const sx = e.clientX;
    const sy = e.clientY;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const spanX = 1 - pl.width;
      const spanY = 1 - pl.height;
      updateCell(spreadId, cell.photoId, {
        panX: spanX < -1e-4 ? Math.min(1, Math.max(0, cell.panX + (ev.clientX - sx) / rect.width / spanX)) : 0.5,
        panY: spanY < -1e-4 ? Math.min(1, Math.max(0, cell.panY + (ev.clientY - sy) / rect.height / spanY)) : 0.5,
      });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  /** Arrastrar una separación: las fotos de un lado crecen y las del otro se achican. */
  const startDividerDrag = (e: React.PointerEvent, spread: AlbumSpread, d: Divider, index: number) => {
    if (spread.locked) return lockedToast();
    e.preventDefault();
    e.stopPropagation();
    const box = spreadRef.current?.getBoundingClientRect();
    if (!box) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startCells = spread.cells;
    const sx = e.clientX;
    const sy = e.clientY;
    setUndoStack((u) => [...u.slice(-59), design]);
    setRedoStack([]);
    setDragDivider(index);
    setSelCell(null);
    const move = (ev: PointerEvent) => {
      const delta = d.dir === 'v' ? (ev.clientX - sx) / box.width : (ev.clientY - sy) / box.height;
      const cells = moveDivider(startCells, d, delta);
      setDesign((cur) => ({ ...cur, spreads: cur.spreads.map((s) => (s.id === spread.id ? { ...s, cells, custom: true } : s)) }));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setDragDivider(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const startTextDrag = (e: React.PointerEvent, spread: AlbumSpread, t: SpreadText) => {
    if (spread.locked) return;
    const box = spreadRef.current?.getBoundingClientRect();
    if (!box) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / box.width;
      const dy = (ev.clientY - sy) / box.height;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 0.004) return;
      if (!moved) {
        moved = true;
        setUndoStack((u) => [...u.slice(-59), design]);
      }
      updateText(spread.id, t.id, { x: Math.min(1 - t.w, Math.max(0, t.x + dx)), y: Math.min(0.97, Math.max(0, t.y + dy)) }, false);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const renderSpread = (spread: AlbumSpread, interactive: boolean) => {
    const bg = spread.background || design.background || '#FFFFFF';
    const dark = isDark(bg);
    return (
      <div
        ref={interactive ? spreadRef : undefined}
        className="relative w-full"
        style={{ aspectRatio: `${spreadAspect}`, background: bg, containerType: 'size', boxShadow: interactive ? '0 18px 50px rgba(0,0,0,.55)' : undefined }}
        onDragOver={
          interactive
            ? (e) => {
                if (!isOurDrag(e)) return;
                e.preventDefault();
                if (e.target === e.currentTarget) setHover({ spreadId: spread.id, mode: 'add' });
              }
            : undefined
        }
        onDragLeave={interactive ? (e) => e.target === e.currentTarget && setHover(null) : undefined}
        onDrop={
          interactive
            ? (e) => {
                e.preventDefault();
                const data = readDrag(e);
                endDrag();
                if (data && data.spreadIndex === undefined) addPhotos(spread.id, data.photoIds);
              }
            : undefined
        }
        onClick={
          interactive
            ? (e) => {
                if (e.target !== e.currentTarget) return;
                if (traySel.length) {
                  addPhotos(spread.id, traySel);
                  setTraySel([]);
                } else {
                  setSelCell(null);
                  setSelText(null);
                }
              }
            : undefined
        }
      >
        {spread.cells.map((c) => {
          const photo = photoById.get(c.photoId);
          const cellAspect = (c.w * spreadAspect) / c.h;
          const isSel = interactive && selCell?.spreadId === spread.id && selCell.photoId === c.photoId;
          const isHover = interactive && hover?.spreadId === spread.id && hover.photoId === c.photoId;
          const dpi = interactive ? effectiveDpi(c, design.sizeId, photo?.width, photo?.height) : null;
          return (
            <div
              key={c.photoId}
              className="absolute overflow-hidden"
              style={{
                left: `${c.x * 100}%`,
                top: `${c.y * 100}%`,
                width: `${c.w * 100}%`,
                height: `${c.h * 100}%`,
                background: dark ? '#3A3A3E' : '#D9D9DC',
                outline: isSel ? `2px solid ${ACCENT}` : undefined,
                outlineOffset: -2,
                cursor: interactive ? (spread.locked ? 'default' : isSel && cropMode ? 'move' : 'grab') : undefined,
                zIndex: isSel ? 5 : undefined,
              }}
              draggable={interactive && !spread.locked && !(isSel && cropMode)}
              onDragStart={interactive ? (e) => beginDrag(e, { photoIds: [c.photoId], fromSpreadId: spread.id }) : undefined}
              onDragEnd={interactive ? endDrag : undefined}
              onDragOver={
                interactive
                  ? (e) => {
                      if (!isOurDrag(e)) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const mode = zoneFor(e);
                      if (hover?.photoId !== c.photoId || hover.mode !== mode) setHover({ spreadId: spread.id, photoId: c.photoId, mode });
                    }
                  : undefined
              }
              onDrop={
                interactive
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const data = readDrag(e);
                      const mode = zoneFor(e);
                      endDrag();
                      if (!data || data.spreadIndex !== undefined) return;
                      if (data.fromSpreadId === spread.id || (mode === 'replace' && data.photoIds.length === 1)) replacePhoto(spread.id, c.photoId, data.photoIds[0]);
                      else addPhotos(spread.id, data.photoIds);
                    }
                  : undefined
              }
              onClick={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      setSelText(null);
                      if (traySel.length === 1) {
                        replacePhoto(spread.id, c.photoId, traySel[0]);
                        setTraySel([]);
                        return;
                      }
                      if (traySel.length > 1) {
                        addPhotos(spread.id, traySel);
                        setTraySel([]);
                        return;
                      }
                      if (!isSel) setCropMode(false);
                      setSelCell({ spreadId: spread.id, photoId: c.photoId });
                    }
                  : undefined
              }
              onDoubleClick={
                interactive && !spread.locked
                  ? () => {
                      setSelCell({ spreadId: spread.id, photoId: c.photoId });
                      setCropMode(true);
                    }
                  : undefined
              }
              onPointerDown={isSel && cropMode ? (e) => startCropDrag(e, spread.id, c, cellAspect) : undefined}
              onWheel={
                isSel && cropMode
                  ? (e) => updateCell(spread.id, c.photoId, { zoom: Math.min(3, Math.max(1, c.zoom - e.deltaY * 0.0015)) })
                  : undefined
              }
            >
              <PhotoImg photo={photo} frameAspect={cellAspect} zoom={c.zoom} panX={c.panX} panY={c.panY} thumb={!interactive} bw={c.bw} />
              {isHover && (
                <div
                  className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white pointer-events-none"
                  style={{ background: hover!.mode === 'replace' ? 'rgba(59,139,235,.55)' : 'rgba(0,0,0,.25)', boxShadow: `inset 0 0 0 3px ${ACCENT}` }}
                >
                  {hover!.mode === 'replace' ? 'Reemplazar' : 'Agregar a la página'}
                </div>
              )}
              {dpi !== null && dpi < LOW_DPI && (
                <span
                  className="absolute top-1 left-1 rounded-sm bg-amber-500 text-white p-0.5"
                  title={`Baja resolución (~${Math.round(dpi)} DPI): puede verse borrosa impresa. Probá ponerla más chica.`}
                >
                  <AlertTriangle className="w-3 h-3" />
                </span>
              )}
            </div>
          );
        })}

        {/* Separaciones arrastrables */}
        {interactive &&
          !spread.locked &&
          dividers.map((d, i) => {
            const thick = 10; // zona de agarre en px
            const style: React.CSSProperties =
              d.dir === 'v'
                ? { left: `calc(${(d.pos + d.gap / 2) * 100}% - ${thick / 2}px)`, top: `${d.from * 100}%`, width: thick, height: `${(d.to - d.from) * 100}%`, cursor: 'col-resize' }
                : { top: `calc(${(d.pos + d.gap / 2) * 100}% - ${thick / 2}px)`, left: `${d.from * 100}%`, height: thick, width: `${(d.to - d.from) * 100}%`, cursor: 'row-resize' };
            const on = dragDivider === i;
            return (
              <div
                key={`${d.dir}-${i}`}
                className="absolute z-10 group/div"
                style={style}
                onPointerDown={(e) => startDividerDrag(e, spread, d, i)}
                onClick={(e) => e.stopPropagation()}
                title="Arrastrá para agrandar una foto y achicar la otra"
              >
                <span
                  className={`absolute ${d.dir === 'v' ? 'inset-y-0 left-1/2 -translate-x-1/2 w-[2px]' : 'inset-x-0 top-1/2 -translate-y-1/2 h-[2px]'} rounded transition-opacity ${on ? 'opacity-100' : 'opacity-0 group-hover/div:opacity-100'}`}
                  style={{ background: ACCENT }}
                />
              </div>
            );
          })}

        {/* Textos */}
        {(spread.texts || []).map((t) => {
          const isSel = interactive && selText === t.id;
          return (
            <div
              key={t.id}
              className={`absolute ${interactive ? 'select-none' : 'pointer-events-none'}`}
              style={{
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                width: `${t.w * 100}%`,
                fontFamily: FONT_FAMILY[t.font],
                fontSize: `${t.size * 100}cqh`,
                lineHeight: 1.25,
                textAlign: t.align,
                color: t.color,
                fontStyle: t.italic ? 'italic' : undefined,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                outline: isSel ? `1px dashed ${ACCENT}` : undefined,
                outlineOffset: 2,
                cursor: interactive && !spread.locked ? 'move' : undefined,
                zIndex: 6,
                minHeight: '1em',
              }}
              onPointerDown={interactive ? (e) => startTextDrag(e, spread, t) : undefined}
              onClick={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      setSelCell(null);
                      setSelText(t.id);
                      setRightTab('texto');
                      setRightOpen(true);
                    }
                  : undefined
              }
            >
              {t.text || (interactive ? 'Escribí acá' : '')}
            </div>
          );
        })}

        {interactive && spread.photoIds.length === 0 && !(spread.texts || []).length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center pointer-events-none" style={{ color: dark ? '#8A8A90' : '#9A9AA0' }}>
            <LayoutGrid className="w-7 h-7" />
            <span className="text-sm">Arrastrá fotos desde la bandeja, o seleccionalas y tocá la página</span>
          </div>
        )}
        {interactive && hover?.spreadId === spread.id && !hover.photoId && (
          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 0 3px ${ACCENT}`, background: 'rgba(59,139,235,.08)' }} />
        )}
        {interactive && spread.locked && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold" style={{ background: 'rgba(0,0,0,.6)', color: '#fff' }}>
            <Lock className="w-3 h-3" /> Bloqueada
          </div>
        )}
        <div className="absolute inset-y-0 left-1/2 w-px pointer-events-none" style={{ background: dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)' }} />
      </div>
    );
  };

  const renderCover = (interactive: boolean) => {
    const photo = design.cover.photoId ? photoById.get(design.cover.photoId) : undefined;
    const leather = design.finish === 'foto-tapa-cuero';
    const frameAspect = leather ? spreadAspect / 2 : spreadAspect;
    const title = design.cover.title.trim();
    return (
      <div
        className="relative w-full flex overflow-hidden"
        style={{ aspectRatio: `${spreadAspect}`, containerType: 'inline-size', boxShadow: interactive ? '0 18px 50px rgba(0,0,0,.55)' : undefined }}
        onDragOver={interactive ? (e) => isOurDrag(e) && e.preventDefault() : undefined}
        onDrop={
          interactive
            ? (e) => {
                e.preventDefault();
                const d = readDrag(e);
                endDrag();
                if (d?.photoIds[0]) setCoverPhoto(d.photoIds[0]);
              }
            : undefined
        }
        onClick={
          interactive && traySel.length
            ? () => {
                setCoverPhoto(traySel[0]);
                setTraySel([]);
              }
            : undefined
        }
      >
        {leather && (
          <div className="relative w-1/2 h-full leather-texture" style={{ background: '#111' }}>
            {interactive && <span className="absolute bottom-3 left-3 text-[10px] uppercase tracking-widest text-white/40">Contratapa · cuero negro</span>}
          </div>
        )}
        <div
          className={`relative h-full overflow-hidden ${leather ? 'w-1/2' : 'w-full'}`}
          style={{ background: '#D9D9DC', cursor: interactive && photo ? 'move' : undefined }}
          onPointerDown={
            interactive && photo
              ? (e) => {
                  const el = e.currentTarget as HTMLElement;
                  const r = el.getBoundingClientRect();
                  const pl = placeImage(frameAspect, photoAspect(photo), design.cover.zoom, design.cover.panX, design.cover.panY);
                  const sx = e.clientX;
                  const sy = e.clientY;
                  const p0 = { x: design.cover.panX, y: design.cover.panY };
                  el.setPointerCapture(e.pointerId);
                  const move = (ev: PointerEvent) => {
                    const spanX = 1 - pl.width;
                    const spanY = 1 - pl.height;
                    setDesign((d) => ({
                      ...d,
                      cover: {
                        ...d.cover,
                        panX: spanX < -1e-4 ? Math.min(1, Math.max(0, p0.x + (ev.clientX - sx) / r.width / spanX)) : 0.5,
                        panY: spanY < -1e-4 ? Math.min(1, Math.max(0, p0.y + (ev.clientY - sy) / r.height / spanY)) : 0.5,
                      },
                    }));
                  };
                  const up = () => {
                    el.removeEventListener('pointermove', move);
                    el.removeEventListener('pointerup', up);
                  };
                  el.addEventListener('pointermove', move);
                  el.addEventListener('pointerup', up);
                }
              : undefined
          }
          onWheel={
            interactive && photo
              ? (e) => setDesign((d) => ({ ...d, cover: { ...d.cover, zoom: Math.min(3, Math.max(1, d.cover.zoom - e.deltaY * 0.0015)) } }))
              : undefined
          }
        >
          {photo ? (
            <PhotoImg photo={photo} frameAspect={frameAspect} zoom={design.cover.zoom} panX={design.cover.panX} panY={design.cover.panY} thumb={!interactive} />
          ) : (
            interactive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm" style={{ color: '#6B6B72' }}>
                <ImagePlus className="w-7 h-7" /> Arrastrá la foto de tapa
              </div>
            )
          )}
          {title && (
            <div
              className="absolute pointer-events-none text-white whitespace-nowrap"
              style={{ fontFamily: "'Great Vibes', cursive", fontSize: '5cqw', left: leather ? '8%' : '54%', bottom: '8%', lineHeight: 1, textShadow: '0 1px 6px rgba(0,0,0,.45)' }}
            >
              {title}
            </div>
          )}
        </div>
        {!leather && <div className="absolute inset-y-0 left-1/2 w-px bg-white/30 pointer-events-none" />}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Pantallas previas al editor
  // -------------------------------------------------------------------------

  const formatPicker = (onDone: () => void, doneLabel: string) => (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest mb-3" style={{ color: C.dim }}>Medida</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {FOTOLIBRO_SIZES.map((s) => {
            const active = s.id === design.sizeId;
            const ratio = s.pageWidthCm / s.pageHeightCm;
            const h = ratio >= 1 ? 30 / ratio : 40;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => changeFormat(s.id, design.coverType, design.finish)}
                className="rounded-md p-3 text-left transition-colors"
                style={{ background: active ? '#33333A' : C.panel, boxShadow: active ? `inset 0 0 0 2px ${ACCENT}` : `inset 0 0 0 1px #34343A` }}
              >
                <div className="h-11 flex items-end mb-2">
                  <div className="flex" style={{ height: h }}>
                    <div style={{ width: h * ratio, background: '#8E8E96' }} />
                    <div style={{ width: 1 }} />
                    <div style={{ width: h * ratio, background: '#7A7A82' }} />
                  </div>
                </div>
                <div className="text-sm font-semibold" style={{ color: C.text }}>{s.closedLabel}</div>
                <div className="text-[11px]" style={{ color: C.dim }}>desde {formatPriceARS(s.blanda.sheets7)}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-widest mb-3" style={{ color: C.dim }}>Tapa</div>
        <div className="grid sm:grid-cols-3 gap-2">
          {COVER_OPTIONS.map((o) => {
            const active = o.type === design.coverType && o.finish === design.finish;
            return (
              <button
                key={`${o.type}-${o.finish}`}
                type="button"
                onClick={() => changeFormat(design.sizeId, o.type, o.finish)}
                className="rounded-md p-3 text-left"
                style={{ background: active ? '#33333A' : C.panel, boxShadow: active ? `inset 0 0 0 2px ${ACCENT}` : `inset 0 0 0 1px #34343A` }}
              >
                <div className="text-sm font-semibold" style={{ color: C.text }}>{o.name}</div>
                <div className="text-[11px] mt-1 leading-relaxed" style={{ color: C.dim }}>{o.description}</div>
                <div className="text-[11px] mt-2" style={{ color: C.text }}>
                  {o.type === 'dura' ? `${formatPriceARS(size.dura.price)} · 10 hojas` : `desde ${formatPriceARS(size.blanda.sheets7)} · 7 hojas`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onDone} className="px-6 py-2.5 rounded-md text-sm font-semibold text-white" style={{ background: ACCENT }}>
          {doneLabel}
        </button>
      </div>
    </div>
  );

  const shell = (title: string, subtitle: string | undefined, children: React.ReactNode) => (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <h2 className="text-2xl font-semibold" style={{ color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{title}</h2>
        {subtitle && <p className="text-sm mt-1.5" style={{ color: C.dim }}>{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Editor: barra, bandeja, lienzo, panel derecho, vista general
  // -------------------------------------------------------------------------

  const TL_H = 50;

  const iconBtn = (onClick: () => void, icon: React.ReactNode, label: string, disabled = false, active = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="h-8 min-w-8 px-2 inline-flex items-center justify-center gap-1.5 rounded text-xs disabled:opacity-30 shrink-0"
      style={{ color: C.text, background: active ? '#3A3A40' : 'transparent' }}
      onMouseEnter={(e) => !disabled && ((e.currentTarget as HTMLElement).style.background = '#3A3A40')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = active ? '#3A3A40' : 'transparent')}
    >
      {icon}
    </button>
  );

  const exit = () => {
    if (onExit) onExit(buildProject());
    else onClose();
  };

  const topBar = (
    <div className="h-12 shrink-0 flex items-center gap-1 px-2 sm:px-3 overflow-x-auto overflow-y-visible" style={{ background: C.bar, borderBottom: `1px solid ${C.line}` }}>
      {iconBtn(() => setLeftOpen((v) => !v), <PanelLeft className="w-4 h-4" />, leftOpen ? 'Ocultar la bandeja de fotos' : 'Mostrar la bandeja de fotos', false, leftOpen)}
      <button type="button" onClick={() => setShowSetup(true)} className="flex items-center gap-2 px-2 h-8 rounded text-xs min-w-0 shrink-0" style={{ color: C.text }} title="Cambiar medida o tapa">
        <BookOpen className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
        <span className="truncate hidden md:inline">
          {size.closedLabel} · {COVER_OPTIONS.find((o) => o.type === design.coverType && o.finish === design.finish)?.name}
        </span>
        <Settings2 className="w-3.5 h-3.5 shrink-0" style={{ color: C.dim }} />
      </button>
      <div className="w-px h-5 mx-1 shrink-0" style={{ background: C.line2 }} />
      {iconBtn(undo, <Undo2 className="w-4 h-4" />, 'Deshacer (Ctrl+Z)', !undoStack.length)}
      {iconBtn(redo, <Redo2 className="w-4 h-4" />, 'Rehacer (Ctrl+Shift+Z)', !redoStack.length)}
      <div className="w-px h-5 mx-1 shrink-0" style={{ background: C.line2 }} />
      <div className="flex items-center rounded shrink-0" style={{ background: '#1F1F22' }}>
        {iconBtn(() => cycleLayout(-1), <ChevronLeft className="w-4 h-4" />, 'Diseño anterior (↑)', variantList.length <= 1)}
        <span className="text-[11px] px-1 tabular-nums select-none whitespace-nowrap" style={{ color: variantList.length > 1 ? C.text : C.faint }}>
          Diseño {sp && variantList.length > 0 ? `${(sp.variant % variantList.length) + 1}/${variantList.length}` : '–'}
        </span>
        {iconBtn(() => cycleLayout(1), <ChevronRight className="w-4 h-4" />, 'Diseño siguiente (↓)', variantList.length <= 1)}
      </div>
      {iconBtn(autoBuildAll, <><Sparkles className="w-4 h-4" /><span className="hidden lg:inline">Autodiseño</span></>, 'Diseñar todo el álbum automáticamente')}
      {iconBtn(addText, <Type className="w-4 h-4" />, 'Agregar texto a esta página', current === COVER)}
      <div className="w-px h-5 mx-1 shrink-0" style={{ background: C.line2 }} />
      <div className="hidden sm:flex items-center gap-1 shrink-0" title="Zoom de la página">
        {iconBtn(() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2))), <Minus className="w-3.5 h-3.5" />, 'Alejar (-)')}
        <input type="range" min={0.5} max={2} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-20" style={{ accentColor: ACCENT }} aria-label="Zoom" />
        {iconBtn(() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2))), <Plus className="w-3.5 h-3.5" />, 'Acercar (+)')}
        <button type="button" onClick={() => setZoom(1)} className="text-[11px] tabular-nums w-10 text-left" style={{ color: C.dim }} title="Ajustar (0)">
          {Math.round(zoom * 100)}%
        </button>
      </div>
      {iconBtn(() => setPreview(true), <Expand className="w-4 h-4" />, 'Vista previa a pantalla completa (F)')}
      {iconBtn(() => setShowKeys((v) => !v), <Keyboard className="w-4 h-4" />, 'Atajos de teclado (?)', false, showKeys)}
      <div className="flex-1" />
      <span className="hidden sm:inline text-sm font-semibold tabular-nums mr-2 shrink-0" style={{ color: C.text }}>{formatPriceARS(price)}</span>
      <button type="button" onClick={() => setShowOrder(true)} className="h-8 px-4 rounded inline-flex items-center gap-2 text-xs font-semibold text-white shrink-0" style={{ background: ACCENT }}>
        <ShoppingBag className="w-4 h-4" /> Pedir
      </button>
      {iconBtn(() => setRightOpen((v) => !v), <PanelRight className="w-4 h-4" />, rightOpen ? 'Ocultar el panel de diseño' : 'Mostrar el panel de diseño', false, rightOpen)}
      {iconBtn(exit, onExit ? <ChevronLeft className="w-4 h-4" /> : <X className="w-4 h-4" />, onExit ? 'Volver' : 'Cerrar')}
    </div>
  );

  const trayPanel = (
    <aside
      className="flex flex-col h-full"
      style={{ background: C.tray, borderRight: `1px solid ${C.line}`, width: isWide ? 272 : '100%' }}
      onDragOver={(e) => {
        if (isOurDrag(e) && dragRef.current?.fromSpreadId) e.preventDefault();
      }}
      onDrop={(e) => {
        const d = readDrag(e);
        endDrag();
        if (d?.fromSpreadId) removePhotos(d.fromSpreadId, d.photoIds);
      }}
    >
      <div className="px-3 pt-3 pb-2" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold inline-flex items-center gap-1.5" style={{ color: C.text }}>
            <Images className="w-3.5 h-3.5" style={{ color: ACCENT }} /> Imágenes
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: C.dim }}>
            {photos.length} · {unusedCount} sin usar
          </span>
        </div>
        <div className="flex rounded mt-2 text-[11px] p-0.5" style={{ background: '#242428' }}>
          {(
            [
              ['all', 'Todas'],
              ['unused', 'Sin usar'],
              ['used', 'Usadas'],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setTrayFilter(f)}
              className="flex-1 px-2 py-1 rounded whitespace-nowrap"
              style={{ background: trayFilter === f ? '#3A3A40' : 'transparent', color: trayFilter === f ? C.text : C.dim }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <div className="relative flex-1">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: C.faint }} />
            <input
              value={traySearch}
              onChange={(e) => setTraySearch(e.target.value)}
              placeholder="Buscar por nombre"
              className="w-full h-7 rounded pl-6 pr-2 text-[11px] outline-none"
              style={{ background: '#1F1F22', color: C.text }}
            />
          </div>
          <select
            value={traySort}
            onChange={(e) => setTraySort(e.target.value as TraySort)}
            className="h-7 rounded px-1.5 text-[11px] outline-none"
            style={{ background: '#1F1F22', color: C.text }}
            aria-label="Ordenar"
            title="Ordenar la bandeja"
          >
            <option value="date">Por fecha</option>
            <option value="name">Por nombre</option>
            <option value="orientation">Por orientación</option>
          </select>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input type="range" min={48} max={140} value={trayZoom} onChange={(e) => setTrayZoom(Number(e.target.value))} className="flex-1" style={{ accentColor: ACCENT }} aria-label="Tamaño de las miniaturas" title="Tamaño de las miniaturas" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] h-7 px-2.5 rounded inline-flex items-center gap-1.5 whitespace-nowrap"
            style={{ background: '#2E2E33', color: C.text }}
          >
            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {processing ? `${processing.done}/${processing.total}` : 'Agregar'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2" onClick={(e) => e.target === e.currentTarget && setTraySel([])}>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${trayZoom}px, 1fr))` }}>
          {trayList.map((p) => {
            const count = useCount.get(p.id) || 0;
            const sel = traySel.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                draggable
                onDragStart={(e) => {
                  const ids = sel && traySel.length > 1 ? traySel : [p.id];
                  beginDrag(e, { photoIds: ids }, thumbSrc(p));
                }}
                onDragEnd={endDrag}
                onClick={(e) => clickTray(e, p.id)}
                onDoubleClick={() => sp && addPhotos(sp.id, [p.id])}
                className="relative overflow-hidden rounded-sm"
                style={{ aspectRatio: '1', outline: sel ? `2px solid ${ACCENT}` : undefined, outlineOffset: -2, background: '#121214' }}
                title={`${p.name}${count ? ` · usada ${count} ${count === 1 ? 'vez' : 'veces'}` : ''}`}
              >
                <img src={thumbSrc(p)} alt={p.name} draggable={false} className="w-full h-full object-contain" style={{ opacity: count ? 0.45 : 1 }} />
                {count > 0 && (
                  <span className="absolute top-1 right-1 rounded-full w-4 h-4 text-[9px] font-bold flex items-center justify-center text-white" style={{ background: ACCENT }}>
                    {count > 1 ? count : <Check className="w-2.5 h-2.5" />}
                  </span>
                )}
                {sel && <span className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(59,139,235,.18)' }} />}
              </button>
            );
          })}
        </div>
        {trayList.length === 0 && (
          <div className="text-xs px-2 py-6 text-center" style={{ color: C.faint }}>
            {traySearch ? 'Ninguna foto con ese nombre.' : trayFilter === 'unused' ? 'Ya usaste todas las fotos.' : trayFilter === 'used' ? 'Todavía no usaste ninguna.' : 'Agregá fotos para empezar.'}
          </div>
        )}
      </div>

      <div className="px-3 py-2 flex flex-wrap items-center gap-1.5" style={{ borderTop: `1px solid ${C.line}` }}>
        {traySel.length > 0 ? (
          <>
            <span className="text-[11px] mr-1" style={{ color: C.dim }}>{traySel.length} elegidas</span>
            {sp && current !== COVER && (
              <SmallBtn onClick={() => (addPhotos(sp.id, traySel), setTraySel([]))} title="Agregar a la hoja que estás viendo">
                <Plus className="w-3 h-3" /> A esta hoja
              </SmallBtn>
            )}
            <SmallBtn onClick={() => insertSpread(sheets, traySel)} title="Crear una hoja nueva al final con estas fotos">
              <LayoutGrid className="w-3 h-3" /> Hoja nueva
            </SmallBtn>
            <SmallBtn onClick={() => removeFromTray(traySel)} danger title="Sacar de la bandeja (solo las que no están en el álbum)">
              <Trash2 className="w-3 h-3" />
            </SmallBtn>
          </>
        ) : (
          <>
            {unusedCount > 0 && (
              <SmallBtn onClick={autoFillUnused} title="Ubicar automáticamente las fotos que faltan">
                <Sparkles className="w-3 h-3" /> Ubicar sin usar ({unusedCount})
              </SmallBtn>
            )}
            {!isLoggedIn && onOpenAuth && (
              <button type="button" onClick={onOpenAuth} className="text-[11px] underline" style={{ color: C.warn }}>
                Iniciá sesión para guardar tus fotos en alta
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );

  const bgSwatches = (scope: 'this' | 'all') => {
    const cur = scope === 'this' ? sp?.background || design.background || '#FFFFFF' : design.background || '#FFFFFF';
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {PAGE_BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            type="button"
            title={b.name}
            onClick={() => setBackground(b.color, scope)}
            className="w-6 h-6 rounded-full"
            style={{ background: b.color, boxShadow: cur.toUpperCase() === b.color ? `0 0 0 2px ${C.panel}, 0 0 0 4px ${ACCENT}` : `inset 0 0 0 1px rgba(255,255,255,.15)` }}
          />
        ))}
        <label className="w-6 h-6 rounded-full overflow-hidden relative cursor-pointer" title="Otro color" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15)' }}>
          <input type="color" value={cur.length === 7 ? cur : '#FFFFFF'} onChange={(e) => setBackground(e.target.value.toUpperCase(), scope)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
    );
  };

  const rightPanel = (
    <aside className="flex flex-col h-full" style={{ background: C.panel, borderLeft: `1px solid ${C.line}`, width: isWide ? 288 : '100%' }}>
      <div className="flex shrink-0" style={{ borderBottom: `1px solid ${C.line}` }}>
        {(
          [
            ['disenos', 'Diseños'],
            ['estilo', 'Estilo'],
            ['texto', 'Texto'],
            ['pagina', 'Página'],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setRightTab(t)}
            className="flex-1 h-10 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: rightTab === t ? C.text : C.dim, boxShadow: rightTab === t ? `inset 0 -2px 0 ${ACCENT}` : undefined }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {current === COVER ? (
          <div className="px-3 py-4 text-xs space-y-3" style={{ color: C.dim }}>
            <p>Estás en la tapa. Arrastrá una foto de la bandeja para usarla de portada, movela para encuadrarla y usá la rueda para acercarla.</p>
            <label className="block text-xs" style={{ color: C.text }}>
              <span className="block mb-1" style={{ color: C.dim }}>Título de tapa (opcional)</span>
              <input
                value={design.cover.title}
                maxLength={40}
                onChange={(e) => setDesign((d) => ({ ...d, cover: { ...d.cover, title: e.target.value } }))}
                placeholder="Nuestra boda · 2026"
                className="w-full rounded px-2.5 py-1.5 text-xs outline-none"
                style={{ background: '#1F1F22', color: C.text }}
              />
            </label>
            {design.cover.photoId && (
              <Slider label="Zoom de la foto" min={1} max={3} step={0.01} value={design.cover.zoom} onChange={(v) => setDesign((d) => ({ ...d, cover: { ...d.cover, zoom: v } }))} format={(v) => `${Math.round(v * 100)}%`} />
            )}
          </div>
        ) : !sp ? null : (
          <>
            {rightTab === 'disenos' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-3 rounded px-2.5 py-2" style={{ background: '#2E2E33' }}>
                  <span className="text-xs" style={{ color: C.text }}>Fotos en esta hoja</span>
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={removeLast}
                      disabled={!sp.photoIds.length || !!sp.locked}
                      className="w-7 h-7 rounded inline-flex items-center justify-center disabled:opacity-30"
                      style={{ background: '#3A3A40', color: C.text }}
                      title="Una foto menos (vuelve a la bandeja)"
                      aria-label="Una foto menos"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <b className="w-6 text-center text-sm tabular-nums" style={{ color: C.text }}>{sp.photoIds.length}</b>
                    <button
                      type="button"
                      onClick={addNextUnused}
                      disabled={sp.photoIds.length >= MAX_PHOTOS_PER_PAGE * 2 || !!sp.locked}
                      className="w-7 h-7 rounded inline-flex items-center justify-center disabled:opacity-30"
                      style={{ background: '#3A3A40', color: C.text }}
                      title="Una foto más (la siguiente sin usar)"
                      aria-label="Una foto más"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
                {sp.photoIds.length === 0 ? (
                  <p className="text-xs" style={{ color: C.dim }}>Cuando pongas fotos en esta hoja, acá aparecen todos los diseños posibles para esa cantidad y forma de fotos. Tocá + o arrastrá fotos desde la bandeja.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px]" style={{ color: C.dim }}>
                        {variantList.length} diseños para {sp.photoIds.length} {sp.photoIds.length === 1 ? 'foto' : 'fotos'}
                      </span>
                      {sp.custom && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#3A3A40', color: C.warn }}>Ajustado a mano</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {variantList.map((rects, i) => (
                        <Wireframe key={i} index={i} rects={rects} aspect={spreadAspect} active={!sp.custom && i === sp.variant % variantList.length} onClick={() => setVariant(i)} />
                      ))}
                    </div>
                    <p className="text-[10px] mt-3 leading-snug" style={{ color: C.faint }}>
                      Las fotos quedan en el mismo orden; cambia cómo se reparten. También podés arrastrar las separaciones entre fotos directamente sobre la página.
                    </p>
                  </>
                )}
              </div>
            )}

            {rightTab === 'estilo' && (
              <>
                <Section title="Separación y márgenes">
                  <Slider label="Separación entre fotos" min={0} max={12} value={spacing.gutterMm} unit=" mm" onChange={(v) => setSpacing({ gutterMm: v })} />
                  <Slider label="Margen de la página" min={0} max={25} value={spacing.marginMm} unit=" mm" onChange={(v) => setSpacing({ marginMm: v })} />
                  <Toggle label="Fotos a sangre" hint="Sin margen: las fotos llegan hasta el borde de la hoja." checked={spacing.marginMm === 0} onChange={(v) => setSpacing({ marginMm: v ? 0 : 8 })} />
                  <Toggle label="Fotos a doble página" hint="Permite diseños con una foto panorámica cruzando el lomo." checked={spacing.spanGutter !== false} onChange={(v) => setSpacing({ spanGutter: v })} />
                  <button type="button" onClick={() => setSpacing({ ...DEFAULT_SPACING })} className="text-[11px] underline mt-1" style={{ color: C.dim }}>
                    Volver al estilo HALO (3 mm, a sangre)
                  </button>
                </Section>
                <Section title="Fondo de esta hoja">{bgSwatches('this')}</Section>
                <Section title="Fondo de todo el álbum">
                  {bgSwatches('all')}
                  <p className="text-[10px] mt-2" style={{ color: C.faint }}>Cambia todas las hojas y las que agregues después.</p>
                </Section>
                <Section title="Foto seleccionada">
                  {selected ? (
                    <div className="space-y-2">
                      <Toggle label="Blanco y negro" hint="Atajo: B" checked={!!selected.bw} onChange={() => toggleBw()} />
                      <Slider label="Zoom dentro del marco" min={1} max={3} step={0.01} value={selected.zoom} onChange={(v) => selCell && updateCell(selCell.spreadId, selCell.photoId, { zoom: v })} format={(v) => `${Math.round(v * 100)}%`} />
                      <div className="flex flex-wrap gap-1.5">
                        <SmallBtn onClick={() => setCropMode((v) => !v)} active={cropMode}>
                          Encuadrar
                        </SmallBtn>
                        <SmallBtn onClick={() => selCell && updateCell(selCell.spreadId, selCell.photoId, { zoom: 1, panX: 0.5, panY: 0.5 }, true)}>Centrar</SmallBtn>
                        <SmallBtn onClick={() => selCell && setCoverPhoto(selCell.photoId)}>Usar en tapa</SmallBtn>
                        <SmallBtn onClick={() => selCell && removePhotos(selCell.spreadId, [selCell.photoId])} danger>
                          <Trash2 className="w-3 h-3" /> Quitar
                        </SmallBtn>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px]" style={{ color: C.faint }}>Tocá una foto de la página para encuadrarla o pasarla a blanco y negro.</p>
                  )}
                </Section>
              </>
            )}

            {rightTab === 'texto' && (
              <>
                <Section
                  title="Textos de esta hoja"
                  right={
                    <SmallBtn onClick={addText} disabled={!!sp.locked}>
                      <Plus className="w-3 h-3" /> Agregar
                    </SmallBtn>
                  }
                >
                  {(sp.texts || []).length === 0 ? (
                    <p className="text-[11px]" style={{ color: C.faint }}>Un título, una fecha o una frase. Se imprime tal cual se ve.</p>
                  ) : (
                    <div className="space-y-1">
                      {(sp.texts || []).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelText(t.id)}
                          className="w-full text-left rounded px-2 py-1.5 text-xs truncate"
                          style={{ background: selText === t.id ? '#3A3A40' : '#2E2E33', color: C.text, boxShadow: selText === t.id ? `inset 0 0 0 1px ${ACCENT}` : undefined }}
                        >
                          {t.text.trim() || 'Texto vacío'}
                        </button>
                      ))}
                    </div>
                  )}
                </Section>
                {selectedText && (
                  <Section
                    title="Editar texto"
                    right={
                      <SmallBtn onClick={() => removeText(sp.id, selectedText.id)} danger>
                        <Trash2 className="w-3 h-3" />
                      </SmallBtn>
                    }
                  >
                    <textarea
                      value={selectedText.text}
                      onChange={(e) => updateText(sp.id, selectedText.id, { text: e.target.value }, false)}
                      onBlur={() => setUndoStack((u) => [...u.slice(-59), design])}
                      rows={3}
                      maxLength={300}
                      className="w-full rounded px-2.5 py-2 text-xs outline-none resize-none mb-3"
                      style={{ background: '#1F1F22', color: C.text }}
                      autoFocus
                    />
                    <div className="flex gap-1 mb-3">
                      {(['serif', 'sans', 'script'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => updateText(sp.id, selectedText.id, { font: f })}
                          className="flex-1 h-9 rounded text-sm"
                          style={{ background: selectedText.font === f ? '#3A3A40' : '#2E2E33', color: C.text, fontFamily: FONT_FAMILY[f], boxShadow: selectedText.font === f ? `inset 0 0 0 1px ${ACCENT}` : undefined }}
                          title={FONT_NAME[f]}
                        >
                          Aa
                        </button>
                      ))}
                    </div>
                    <Slider label="Tamaño" min={0.015} max={0.16} step={0.0025} value={selectedText.size} onChange={(v) => updateText(sp.id, selectedText.id, { size: v }, false)} format={(v) => `${Math.round(v * pageMm.h / 10 * 10) / 10} cm`} />
                    <Slider label="Ancho del cuadro" min={0.1} max={1} step={0.01} value={selectedText.w} onChange={(v) => updateText(sp.id, selectedText.id, { w: v, x: Math.min(selectedText.x, 1 - v) }, false)} format={(v) => `${Math.round(v * 100)}%`} />
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex rounded p-0.5" style={{ background: '#1F1F22' }}>
                        {(['left', 'center', 'right'] as const).map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => updateText(sp.id, selectedText.id, { align: a })}
                            className="px-2.5 py-1 rounded text-[11px]"
                            style={{ background: selectedText.align === a ? '#3A3A40' : 'transparent', color: C.text }}
                          >
                            {a === 'left' ? 'Izq.' : a === 'center' ? 'Centro' : 'Der.'}
                          </button>
                        ))}
                      </div>
                      <SmallBtn onClick={() => updateText(sp.id, selectedText.id, { italic: !selectedText.italic })} active={!!selectedText.italic}>
                        <i>Cursiva</i>
                      </SmallBtn>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {['#222222', '#FFFFFF', '#8C6D37', '#9A9AA0', '#B23A3A', '#2F5D8A'].map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => updateText(sp.id, selectedText.id, { color: col })}
                          className="w-6 h-6 rounded-full"
                          style={{ background: col, boxShadow: selectedText.color.toUpperCase() === col.toUpperCase() ? `0 0 0 2px ${C.panel}, 0 0 0 4px ${ACCENT}` : 'inset 0 0 0 1px rgba(255,255,255,.15)' }}
                          aria-label={`Color ${col}`}
                        />
                      ))}
                      <label className="w-6 h-6 rounded-full overflow-hidden relative cursor-pointer" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }} title="Otro color">
                        <input type="color" value={selectedText.color} onChange={(e) => updateText(sp.id, selectedText.id, { color: e.target.value }, false)} className="absolute inset-0 opacity-0 cursor-pointer" />
                      </label>
                    </div>
                    <p className="text-[10px] mt-3" style={{ color: C.faint }}>Arrastrá el texto sobre la página para ubicarlo.</p>
                  </Section>
                )}
              </>
            )}

            {rightTab === 'pagina' && (
              <>
                <Section title={`Hoja ${current + 1} de ${sheets} · páginas ${current * 2 + 1}-${current * 2 + 2}`}>
                  <div className="flex items-center justify-between mb-3 text-xs" style={{ color: C.text }}>
                    <span>Fotos en esta hoja</span>
                    <span className="inline-flex items-center gap-1">
                      <SmallBtn onClick={removeLast} disabled={!sp.photoIds.length || !!sp.locked} title="Una foto menos">
                        <Minus className="w-3 h-3" />
                      </SmallBtn>
                      <b className="w-6 text-center tabular-nums">{sp.photoIds.length}</b>
                      <SmallBtn onClick={addNextUnused} disabled={sp.photoIds.length >= MAX_PHOTOS_PER_PAGE * 2 || !!sp.locked} title="Una foto más (la siguiente sin usar)">
                        <Plus className="w-3 h-3" />
                      </SmallBtn>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    <SmallBtn onClick={() => toggleLock(current)} active={!!sp.locked} full title="Atajo: L">
                      {sp.locked ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />} {sp.locked ? 'Destrabar esta hoja' : 'Bloquear esta hoja'}
                    </SmallBtn>
                    <SmallBtn onClick={() => insertSpread(current + 1)} disabled={sheets >= MAX_SHEETS} full>
                      <Plus className="w-3.5 h-3.5" /> Insertar una hoja después
                    </SmallBtn>
                    <SmallBtn onClick={() => duplicateSpread(current)} disabled={sheets >= MAX_SHEETS} full title="Copia el fondo y los textos; las fotos no se repiten">
                      <Copy className="w-3.5 h-3.5" /> Duplicar hoja (sin las fotos)
                    </SmallBtn>
                    <SmallBtn onClick={() => clearSpread(current)} disabled={!sp.photoIds.length && !(sp.texts || []).length} full>
                      <Eraser className="w-3.5 h-3.5" /> Vaciar hoja
                    </SmallBtn>
                    <SmallBtn onClick={() => deleteSpread(current)} disabled={sheets <= minSheets} danger full>
                      <Trash2 className="w-3.5 h-3.5" /> Quitar hoja
                    </SmallBtn>
                  </div>
                  <p className="text-[10px] mt-3 leading-snug" style={{ color: C.faint }}>
                    Una hoja bloqueada no cambia aunque muevas fotos, cambies la separación o uses el autodiseño. El mínimo son {minSheets} hojas y el máximo {MAX_SHEETS}.
                  </p>
                </Section>
                <Section title="Álbum">
                  <div className="text-xs space-y-1" style={{ color: C.dim }}>
                    <div className="flex justify-between"><span>Medida</span><span style={{ color: C.text }}>{size.closedLabel}</span></div>
                    <div className="flex justify-between"><span>Hojas</span><span style={{ color: C.text }}>{sheets} ({sheets * 2} páginas)</span></div>
                    <div className="flex justify-between"><span>Fotos usadas</span><span style={{ color: C.text }}>{inSpreads.size} de {photos.length}</span></div>
                    <div className="flex justify-between"><span>Hojas vacías</span><span style={{ color: C.text }}>{design.spreads.filter((s) => !s.photoIds.length).length}</span></div>
                  </div>
                  <div className="mt-3">
                    <SmallBtn onClick={() => setShowSetup(true)} full>
                      <Settings2 className="w-3.5 h-3.5" /> Cambiar medida o tapa
                    </SmallBtn>
                  </div>
                </Section>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );

  const canvas = (
    <div
      className="relative flex-1 min-h-0 flex flex-col items-center justify-center px-10 sm:px-16 py-4 overflow-auto"
      style={{ background: C.app }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setSelCell(null);
          setSelText(null);
          setCropMode(false);
        }
      }}
      onDragOver={(e) => isOurDrag(e) && e.preventDefault()}
    >
      <button
        type="button"
        onClick={() => setCurrent((c) => Math.max(COVER, c - 1))}
        disabled={current <= COVER}
        className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 rounded-full disabled:opacity-20 z-20"
        style={{ color: C.text, background: '#2A2A2D' }}
        aria-label="Anterior"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <div className="w-full m-auto" style={{ maxWidth: `min(${zoom * 100}%, calc((100vh - 17rem) * ${spreadAspect} * ${zoom}))` }}>
        {current === COVER ? renderCover(true) : sp ? renderSpread(sp, true) : null}
        <div className="flex justify-between mt-2 text-[11px] select-none" style={{ color: C.faint }}>
          {current === COVER ? (
            <>
              <span>{design.finish === 'foto-tapa-cuero' ? 'Contratapa (cuero)' : 'Contratapa'}</span>
              <span>Tapa</span>
            </>
          ) : (
            <>
              <span>Página {current * 2 + 1}</span>
              <span className="tabular-nums">Hoja {current + 1} / {sheets}</span>
              <span>Página {current * 2 + 2}</span>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCurrent((c) => Math.min(sheets - 1, c + 1))}
        disabled={current >= sheets - 1}
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 rounded-full disabled:opacity-20 z-20"
        style={{ color: C.text, background: '#2A2A2D' }}
        aria-label="Siguiente"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Controles contextuales */}
      {selCell && selected && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-md px-2 py-1.5 shadow-2xl z-20" style={{ background: '#2E2E33' }} onClick={(e) => e.stopPropagation()}>
          {cropMode ? (
            <>
              <span className="text-[11px] px-2" style={{ color: C.dim }}>Arrastrá para encuadrar · rueda para acercar</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={selected.zoom}
                onChange={(e) => updateCell(selCell.spreadId, selCell.photoId, { zoom: Number(e.target.value) })}
                aria-label="Zoom de la foto"
                className="w-28"
                style={{ accentColor: ACCENT }}
              />
              <button type="button" onClick={() => setCropMode(false)} className="text-[11px] px-3 py-1 rounded text-white" style={{ background: ACCENT }}>
                Listo
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setCropMode(true)} className="text-[11px] px-3 py-1 rounded" style={{ color: C.text }}>
                Encuadrar
              </button>
              <button type="button" onClick={toggleBw} className="text-[11px] px-3 py-1 rounded" style={{ color: selected.bw ? ACCENT : C.text }} title="Blanco y negro (B)">
                B/N
              </button>
              <button type="button" onClick={() => setCoverPhoto(selCell.photoId)} className="text-[11px] px-3 py-1 rounded" style={{ color: C.text }}>
                Usar en tapa
              </button>
              <button type="button" onClick={() => removePhotos(selCell.spreadId, [selCell.photoId])} className="text-[11px] px-3 py-1 rounded inline-flex items-center gap-1 text-red-400">
                <Trash2 className="w-3.5 h-3.5" /> Quitar
              </button>
            </>
          )}
        </div>
      )}
      {traySel.length > 0 && current !== COVER && sp && !isWide && (
        <button
          type="button"
          onClick={() => {
            addPhotos(sp.id, traySel);
            setTraySel([]);
          }}
          className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-2xl z-20"
          style={{ background: ACCENT }}
        >
          + Agregar {traySel.length} {traySel.length === 1 ? 'foto' : 'fotos'} a esta hoja
        </button>
      )}
    </div>
  );

  const timeline = (
    <div className="shrink-0 overflow-x-auto overflow-y-hidden" style={{ background: C.panel, borderTop: `1px solid ${C.line}`, scrollbarWidth: 'thin', scrollbarColor: '#4A4A52 transparent' }}>
      <div className="flex items-end gap-1.5 px-3 py-2 w-max">
        <TimelineItem
          active={current === COVER}
          label="Tapa"
          width={spreadAspect * TL_H}
          onClick={() => setCurrent(COVER)}
          highlight={timelineHover === 'cover'}
          onDragOver={(e) => {
            if (!isOurDrag(e)) return;
            e.preventDefault();
            setTimelineHover('cover');
          }}
          onDragLeave={() => setTimelineHover(null)}
          onDrop={(e) => {
            e.preventDefault();
            const d = readDrag(e);
            endDrag();
            if (d?.photoIds[0]) setCoverPhoto(d.photoIds[0]);
          }}
        >
          {renderCover(false)}
        </TimelineItem>
        {design.spreads.map((s, i) => (
          <React.Fragment key={s.id}>
            <InsertGap
              active={timelineHover === `gap-${i}`}
              onDragOver={(e) => {
                if (!isOurDrag(e)) return;
                e.preventDefault();
                setTimelineHover(`gap-${i}`);
              }}
              onDragLeave={() => setTimelineHover(null)}
              onDrop={(e) => {
                e.preventDefault();
                const d = readDrag(e);
                endDrag();
                if (!d) return;
                if (d.spreadIndex !== undefined) moveSpreadTo(d.spreadIndex, d.spreadIndex < i ? i - 1 : i);
                else insertSpread(i, d.photoIds);
              }}
            />
            <TimelineItem
              active={current === i}
              label={`${i * 2 + 1}-${i * 2 + 2}`}
              width={spreadAspect * TL_H}
              onClick={() => setCurrent(i)}
              highlight={timelineHover === s.id}
              draggable
              locked={!!s.locked}
              onDragStart={(e) => {
                const payload: DragPayload = { photoIds: [], spreadIndex: i };
                dragRef.current = payload;
                e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
              }}
              onDragEnd={endDrag}
              onDragOver={(e) => {
                if (!isOurDrag(e)) return;
                e.preventDefault();
                setTimelineHover(s.id);
              }}
              onDragLeave={() => setTimelineHover(null)}
              onDrop={(e) => {
                e.preventDefault();
                const d = readDrag(e);
                endDrag();
                if (!d) return;
                if (d.spreadIndex !== undefined) moveSpreadTo(d.spreadIndex, i);
                else addPhotos(s.id, d.photoIds);
              }}
              onDelete={sheets > minSheets && !s.locked ? () => deleteSpread(i) : undefined}
              warn={s.photoIds.length === 0}
            >
              {renderSpread(s, false)}
            </TimelineItem>
          </React.Fragment>
        ))}
        <InsertGap
          active={timelineHover === 'gap-end'}
          onDragOver={(e) => {
            if (!isOurDrag(e)) return;
            e.preventDefault();
            setTimelineHover('gap-end');
          }}
          onDragLeave={() => setTimelineHover(null)}
          onDrop={(e) => {
            e.preventDefault();
            const d = readDrag(e);
            endDrag();
            if (!d) return;
            if (d.spreadIndex !== undefined) moveSpreadTo(d.spreadIndex, sheets - 1);
            else insertSpread(sheets, d.photoIds);
          }}
        />
        <button
          type="button"
          onClick={() => insertSpread(sheets)}
          disabled={sheets >= MAX_SHEETS}
          className="shrink-0 flex flex-col items-center justify-center gap-1 rounded disabled:opacity-30"
          style={{ width: spreadAspect * TL_H * 0.6, height: TL_H, border: '1px dashed #4A4A52', color: C.dim, marginBottom: 16 }}
          title="Agregar hoja"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="self-center text-[11px] pl-2 whitespace-nowrap" style={{ color: C.faint, marginBottom: 16 }}>
          {sheets} hojas · {sheets * 2} pág.
        </div>
      </div>
    </div>
  );

  const keysHelp = showKeys && (
    <div className="absolute right-3 top-14 z-40 w-72 rounded-md p-4 text-xs shadow-2xl" style={{ background: '#2E2E33', color: C.text, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-2">
        <b>Atajos</b>
        <button type="button" onClick={() => setShowKeys(false)} aria-label="Cerrar">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" style={{ color: C.dim }}>
        {(
          [
            ['← →', 'Hoja anterior / siguiente'],
            ['↑ ↓', 'Otro diseño'],
            ['Supr', 'Quitar la foto o el texto elegido'],
            ['Enter', 'Encuadrar la foto elegida'],
            ['B', 'Blanco y negro'],
            ['L', 'Bloquear / destrabar la hoja'],
            ['F', 'Vista previa'],
            ['+ − 0', 'Zoom'],
            ['Ctrl+Z / Ctrl+Shift+Z', 'Deshacer / rehacer'],
            ['Ctrl+A', 'Elegir todas las fotos de la bandeja'],
            ['Shift / Ctrl + clic', 'Elegir varias fotos'],
            ['Doble clic', 'Encuadrar (en la página) · agregar (en la bandeja)'],
          ] as const
        ).map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="tabular-nums whitespace-nowrap" style={{ color: C.text }}>{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );

  const previewMode = preview && (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: '#0E0E10' }} onClick={() => setPreview(false)}>
      <div className="h-12 shrink-0 flex items-center justify-between px-4 text-xs" style={{ color: C.dim }} onClick={(e) => e.stopPropagation()}>
        <span>{design.cover.title.trim() || 'Mi fotolibro'} · {size.closedLabel}</span>
        <span>{current === COVER ? 'Tapa' : `Hoja ${current + 1} de ${sheets}`} · ← → para pasar · Esc para salir</span>
        <button type="button" onClick={() => setPreview(false)} className="p-1.5 rounded" style={{ color: C.text }} aria-label="Salir de la vista previa">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-16 pb-8" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setCurrent((c) => Math.max(COVER, c - 1))} disabled={current <= COVER} className="absolute left-4 p-2 rounded-full disabled:opacity-20" style={{ color: C.text, background: '#2A2A2D' }} aria-label="Anterior">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-full" style={{ maxWidth: `min(100%, calc((100vh - 8rem) * ${spreadAspect}))` }}>
          {current === COVER ? renderCover(false) : sp ? renderSpread(sp, false) : null}
        </div>
        <button type="button" onClick={() => setCurrent((c) => Math.min(sheets - 1, c + 1))} disabled={current >= sheets - 1} className="absolute right-4 p-2 rounded-full disabled:opacity-20" style={{ color: C.text, background: '#2A2A2D' }} aria-label="Siguiente">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  const renderEditor = () => (
    <>
      {topBar}
      <div className="flex-1 min-h-0 flex relative">
        {leftOpen && (isWide ? trayPanel : <div className="absolute inset-y-0 left-0 z-30 w-[min(92vw,360px)] shadow-2xl">{trayPanel}</div>)}
        <div className="flex-1 min-w-0 flex flex-col">
          {canvas}
          {timeline}
        </div>
        {rightOpen && (isWide ? rightPanel : <div className="absolute inset-y-0 right-0 z-30 w-[min(92vw,340px)] shadow-2xl">{rightPanel}</div>)}
        {!isWide && (leftOpen || rightOpen) && (
          <div
            className="absolute inset-0 z-20"
            style={{ background: 'rgba(0,0,0,.35)' }}
            onClick={() => {
              setLeftOpen(false);
              setRightOpen(false);
            }}
          />
        )}
        {keysHelp}
        {toast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-sm rounded-md px-3 py-2 text-xs shadow-2xl z-40" style={{ background: '#2E2E33', color: C.text }}>
            {toast}
          </div>
        )}
      </div>
      {previewMode}
    </>
  );

  // -------------------------------------------------------------------------
  // Pedido
  // -------------------------------------------------------------------------

  const lowRes = design.spreads.reduce(
    (a, s) =>
      a +
      s.cells.filter((c) => {
        const p = photoById.get(c.photoId);
        const d = effectiveDpi(c, design.sizeId, p?.width, p?.height);
        return d !== null && d < LOW_DPI;
      }).length,
    0
  );
  const emptySpreads = design.spreads.filter((s) => !s.photoIds.length).length;
  const canOrder = !emptySpreads && !!design.cover.photoId && sheets >= minSheets && !pendingUploads && !failedUploads;

  const renderOrder = () => (
    <Modal onClose={() => setShowOrder(false)} title="Pedir fotolibro">
      <div className="grid sm:grid-cols-[1fr_1fr] gap-6">
        <div>
          {renderCover(false)}
          <div className="text-xs mt-3 space-y-1" style={{ color: C.dim }}>
            <div className="flex justify-between"><span>Medida</span><span style={{ color: C.text }}>{size.closedLabel}</span></div>
            <div className="flex justify-between"><span>Hojas</span><span style={{ color: C.text }}>{sheets} ({sheets * 2} páginas)</span></div>
            <div className="flex justify-between"><span>Fotos</span><span style={{ color: C.text }}>{inSpreads.size}</span></div>
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: C.dim }}>Tapa</div>
            <div className="space-y-1.5">
              {COVER_OPTIONS.map((o) => {
                const active = o.type === design.coverType && o.finish === design.finish;
                const disabled = sheets < minSheetsFor(o.type);
                return (
                  <button
                    key={`${o.type}-${o.finish}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => changeFormat(design.sizeId, o.type, o.finish)}
                    className="w-full text-left rounded px-3 py-2 text-xs disabled:opacity-35"
                    style={{ background: active ? '#33333A' : '#26262A', boxShadow: active ? `inset 0 0 0 2px ${ACCENT}` : undefined, color: C.text }}
                  >
                    {o.name}
                    {disabled && <span style={{ color: C.dim }}> · necesita {minSheetsFor(o.type)} hojas</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: C.dim }}>Laminado</div>
            <div className="inline-flex rounded p-0.5" style={{ background: '#26262A' }}>
              {(['brillo', 'mate'] as FotolibroLaminate[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setDesign((d) => ({ ...d, laminate: l }))}
                  className="px-4 py-1.5 rounded text-xs capitalize"
                  style={{ background: design.laminate === l ? ACCENT : 'transparent', color: design.laminate === l ? '#fff' : C.text }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: C.dim }}>Caja contenedora</div>
            {design.coverType === 'dura' ? (
              <div className="text-xs inline-flex items-center gap-2" style={{ color: C.text }}>
                <Package className="w-4 h-4" style={{ color: ACCENT }} /> Incluida con la tapa dura
              </div>
            ) : size.boxPrice ? (
              <label className="text-xs flex items-center gap-2 cursor-pointer" style={{ color: C.text }}>
                <input type="checkbox" checked={design.giftBox} onChange={(e) => setDesign((d) => ({ ...d, giftBox: e.target.checked }))} style={{ accentColor: ACCENT }} />
                Agregar caja (tela / cuero) · {formatPriceARS(size.boxPrice)}
              </label>
            ) : (
              <div className="text-xs" style={{ color: C.dim }}>Para esta medida la caja se cotiza aparte.</div>
            )}
          </div>
          {design.coverType === 'blanda' && sheets > 7 && sheets < 10 && (
            <div className="text-[11px]" style={{ color: C.warn }}>De 8 a 10 hojas se cobra el precio de 10: podés sumar {10 - sheets} sin costo.</div>
          )}
          <ul className="text-[11px] space-y-1">
            {!design.cover.photoId && <li className="text-red-400">Falta la foto de tapa.</li>}
            {emptySpreads > 0 && <li className="text-red-400">Hay {emptySpreads} doble(s) página(s) vacía(s).</li>}
            {pendingUploads > 0 && <li style={{ color: C.dim }}>Guardando fotos originales… ({pendingUploads})</li>}
            {failedUploads > 0 && (
              <li className="text-red-400">
                {failedUploads} foto(s) no se guardaron.{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    uploading.current.clear();
                    setPhotos((prev) => prev.map((p) => (p.uploadStatus === 'error' ? { ...p, uploadStatus: 'pending' } : p)));
                    setRetry((n) => n + 1);
                  }}
                >
                  Reintentar
                </button>
              </li>
            )}
            {lowRes > 0 && <li className="text-amber-400">{lowRes} foto(s) con baja resolución.</li>}
            {unusedCount > 0 && <li style={{ color: C.dim }}>{unusedCount} foto(s) sin usar.</li>}
          </ul>
          <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid #34343A' }}>
            <span className="text-sm" style={{ color: C.dim }}>Total</span>
            <span className="text-lg font-semibold tabular-nums" style={{ color: C.text }}>{formatPriceARS(price)}</span>
          </div>
          <button
            type="button"
            disabled={!canOrder}
            onClick={() => {
              if (!isLoggedIn && onOpenAuth) {
                setToast('Iniciá sesión para que podamos recibir tus fotos originales en alta calidad.');
                onOpenAuth();
                return;
              }
              onAddToCart(buildProject(), price);
            }}
            className="w-full py-2.5 rounded text-sm font-semibold text-white disabled:opacity-35"
            style={{ background: ACCENT }}
          >
            Agregar al carrito
          </button>
          {!isLoggedIn && <div className="text-[11px]" style={{ color: C.dim }}>Para pedirlo hay que iniciar sesión (así recibimos tus fotos en alta).</div>}
        </div>
      </div>
    </Modal>
  );

  // -------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: C.app, color: C.text }} role="dialog" aria-modal="true" aria-label="Editor de fotolibro">
      {phase !== 'editor' && (
        <div className="h-12 shrink-0 flex items-center justify-between px-4" style={{ background: C.bar, borderBottom: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="w-4 h-4" style={{ color: ACCENT }} /> Nuevo fotolibro
          </div>
          {iconBtn(exit, <X className="w-4 h-4" />, 'Cerrar')}
        </div>
      )}

      {phase === 'setup' && shell('Nuevo fotolibro', 'Elegí la medida y la tapa. Lo podés cambiar después.', <>{formatPicker(() => setPhase(photos.length ? 'choose-start' : 'upload'), 'Continuar')}</>)}

      {phase === 'upload' &&
        shell(
          'Agregá tus fotos',
          'Subí todas las fotos que quieras usar. Después las arrastrás a cada página.',
          <>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
              className="rounded-lg flex flex-col items-center justify-center text-center px-6 py-20"
              style={{ border: '2px dashed #3E3E46', background: C.panel }}
            >
              {processing ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: ACCENT }} />
                  <p className="mt-4 text-sm">Preparando fotos… {processing.done} de {processing.total}</p>
                  <div className="w-64 h-1 rounded-full mt-3 overflow-hidden" style={{ background: '#34343A' }}>
                    <div className="h-full transition-all" style={{ width: `${(processing.done / Math.max(1, processing.total)) * 100}%`, background: ACCENT }} />
                  </div>
                </>
              ) : (
                <>
                  <Upload className="w-9 h-9" style={{ color: ACCENT }} />
                  <p className="mt-4">Arrastrá tus fotos acá</p>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4 px-6 py-2.5 rounded-md text-sm font-semibold text-white" style={{ background: ACCENT }}>
                    Elegir fotos
                  </button>
                </>
              )}
            </div>
            <button type="button" onClick={() => setPhase('setup')} className="mt-6 text-xs inline-flex items-center gap-1" style={{ color: C.dim }}>
              <ChevronLeft className="w-4 h-4" /> Volver
            </button>
          </>
        )}

      {phase === 'choose-start' &&
        shell(
          '¿Cómo querés empezar?',
          `${photos.length} fotos listas.`,
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <button type="button" onClick={() => startAlbum('auto')} className="rounded-lg p-6 text-left" style={{ background: C.panel, boxShadow: `inset 0 0 0 2px ${ACCENT}` }}>
                <Sparkles className="w-6 h-6" style={{ color: ACCENT }} />
                <div className="mt-3 font-semibold">Autodiseño</div>
                <div className="text-xs mt-1.5 leading-relaxed" style={{ color: C.dim }}>
                  Ponemos todas las fotos en orden en las páginas. Después cambiás lo que quieras arrastrando.
                </div>
              </button>
              <button type="button" onClick={() => startAlbum('blank')} className="rounded-lg p-6 text-left" style={{ background: C.panel, boxShadow: 'inset 0 0 0 1px #34343A' }}>
                <LayoutGrid className="w-6 h-6" style={{ color: C.dim }} />
                <div className="mt-3 font-semibold">Lo armo yo</div>
                <div className="text-xs mt-1.5 leading-relaxed" style={{ color: C.dim }}>
                  Empezás con páginas vacías y arrastrás las fotos a cada una: se diseñan solas al soltarlas.
                </div>
              </button>
            </div>
          </>
        )}

      {phase === 'editor' && renderEditor()}
      {showOrder && renderOrder()}
      {showSetup && (
        <Modal onClose={() => setShowSetup(false)} title="Medida y tapa">
          {formatPicker(() => setShowSetup(false), 'Listo')}
        </Modal>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
};

// ---------------------------------------------------------------------------

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onClick={onClose}>
    <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg p-5 sm:p-6 shadow-2xl" style={{ background: '#2A2A2D', color: '#E4E4E6' }} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{title}</h3>
        <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/10" aria-label="Cerrar">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const TimelineItem: React.FC<{
  active: boolean;
  label: string;
  width: number;
  onClick: () => void;
  children: React.ReactNode;
  highlight?: boolean;
  warn?: boolean;
  locked?: boolean;
  draggable?: boolean;
  onDelete?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}> = ({ active, label, width, onClick, children, highlight, warn, locked, draggable, onDelete, ...dnd }) => (
  <div className="group relative shrink-0 flex flex-col items-center gap-1" style={{ width }}>
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      {...dnd}
      className="w-full rounded-sm overflow-hidden relative"
      style={{ outline: active ? `2px solid ${ACCENT}` : highlight ? '2px solid #E0B65A' : warn ? '1px dashed #6B6B72' : undefined, outlineOffset: 2 }}
    >
      {children}
      {locked && (
        <span className="absolute top-0.5 right-0.5 rounded-sm p-0.5" style={{ background: 'rgba(0,0,0,.6)', color: '#fff' }}>
          <Lock className="w-2.5 h-2.5" />
        </span>
      )}
    </button>
    <span className="text-[10px] tabular-nums" style={{ color: active ? '#E4E4E6' : '#6B6B72' }}>{label}</span>
    {onDelete && (
      <button
        type="button"
        onClick={onDelete}
        className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 rounded-full items-center justify-center bg-black/80 text-white"
        aria-label="Quitar hoja"
        title="Quitar hoja"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    )}
  </div>
);

const InsertGap: React.FC<{
  active: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}> = ({ active, ...dnd }) => (
  <div
    {...dnd}
    className="shrink-0 self-stretch rounded-sm transition-all"
    style={{ width: active ? 18 : 6, background: active ? ACCENT : 'transparent', marginBottom: 16 }}
    title="Soltá acá para crear una hoja nueva"
  />
);

export default SimpleAlbumEditor;
