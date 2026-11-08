// Editor de fotolibros para clientes, con la forma de trabajar de SmartAlbums.
//
//   ┌──────────────────── barra superior ─────────────────────┐
//   │                 doble página grande                      │
//   │ ─────────── línea de tiempo de dobles páginas ────────── │
//   │ ─────────── tira de fotos (bandeja) ──────────────────── │
//   └──────────────────────────────────────────────────────────┘
//
// - Arrastrás una o varias fotos de la tira a una doble página y se diagrama
//   al instante (motor en src/lib/albumLayout.ts).
// - Soltar en el centro de una foto la reemplaza; en el resto de la página,
//   la agrega. Arrastrar una foto de la página a otra la intercambia; a la
//   tira, la quita; a una miniatura de la línea de tiempo, la mueve allá.
// - "Diseño ‹ ›" (o ↑ ↓) recorre las alternativas. Separación y margen
//   ajustables. Doble clic en una foto para encuadrarla (arrastrar + rueda).
// - Armado automático opcional de todo el álbum.
// En celular el arrastre se reemplaza por tocar.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Package,
  Plus,
  Redo2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
  Settings2,
  ShoppingBag,
  LayoutGrid,
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
  LayoutPhoto,
  SpacingOptions,
  buildSpreads,
  countSpreadVariants,
  effectiveDpi,
  layoutSpread,
  newSpreadId,
  pageSizeMm,
  placeImage,
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
}

type Phase = 'setup' | 'upload' | 'choose-start' | 'editor';

const LOW_DPI = 150;
const COVER = -1;
const DRAG_TYPE = 'application/x-halo-photos';
const ACCENT = '#3B8BEB';

// Paleta oscura tipo SmartAlbums
const C = {
  app: '#1C1C1E',
  bar: '#2A2A2D',
  panel: '#232326',
  tray: '#19191B',
  line: '#0F0F10',
  text: '#E4E4E6',
  dim: '#9A9AA0',
  faint: '#6B6B72',
};

function photoAspect(p?: PhotoAsset): number {
  if (!p) return 1.5;
  if (p.width && p.height) return p.width / p.height;
  return p.aspectRatio || 1.5;
}
const displaySrc = (p?: PhotoAsset) => (p ? p.hdDataUrl || p.url || p.thumbnailUrl || '' : '');
const thumbSrc = (p?: PhotoAsset) => (p ? p.thumbnailUrl || p.hdDataUrl || p.url || '' : '');

function sortPhotos(list: PhotoAsset[]): PhotoAsset[] {
  return [...list].sort((a, b) => {
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
  };
}

interface DragPayload {
  photoIds: string[];
  fromSpreadId?: string;
}

// ---------------------------------------------------------------------------

const PhotoImg: React.FC<{ photo?: PhotoAsset; frameAspect: number; zoom: number; panX: number; panY: number; thumb?: boolean }> = ({
  photo,
  frameAspect,
  zoom,
  panX,
  panY,
  thumb,
}) => {
  if (!photo) return null;
  const pl = placeImage(frameAspect, photoAspect(photo), zoom, panX, panY);
  return (
    <img
      src={thumb ? thumbSrc(photo) : displaySrc(photo)}
      alt=""
      draggable={false}
      className="absolute max-w-none select-none pointer-events-none"
      style={{ width: `${pl.width * 100}%`, height: `${pl.height * 100}%`, left: `${pl.left * 100}%`, top: `${pl.top * 100}%` }}
    />
  );
};

export const SimpleAlbumEditor: React.FC<SimpleAlbumEditorProps> = ({ onClose, onAddToCart, initialProject, onOpenAuth }) => {
  const { user, profile, isLoggedIn } = useAuth();
  const userId = user?.id || profile?.id;

  const [projectId] = useState(initialProject?.id || `proj-${Date.now()}`);
  const [createdAt] = useState(initialProject?.createdAt || new Date().toISOString());
  const [design, setDesign] = useState<AlbumDesign>(() => {
    const d = initialProject?.album || emptyDesign();
    return { ...d, spacing: d.spacing || { ...DEFAULT_SPACING } };
  });
  const [photos, setPhotos] = useState<PhotoAsset[]>(() => initialProject?.photos || []);
  const [phase, setPhase] = useState<Phase>(() =>
    initialProject?.album?.spreads?.length ? 'editor' : initialProject?.photos?.length ? 'choose-start' : 'setup'
  );
  const [current, setCurrent] = useState(0);
  const [undoStack, setUndoStack] = useState<AlbumDesign[]>([]);
  const [redoStack, setRedoStack] = useState<AlbumDesign[]>([]);
  const [trayFilter, setTrayFilter] = useState<'all' | 'unused'>('all');
  const [traySel, setTraySel] = useState<string[]>([]);
  const lastTrayClick = useRef<string | null>(null);
  const [selCell, setSelCell] = useState<{ spreadId: string; photoId: string } | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [hover, setHover] = useState<{ spreadId: string; photoId?: string; mode: 'replace' | 'add' } | null>(null);
  const [timelineHover, setTimelineHover] = useState<string | null>(null);
  const [processing, setProcessing] = useState<{ done: number; total: number } | null>(null);
  const [showSpacing, setShowSpacing] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragPayload | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
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
      return { ...sp, photoIds: lp.map((p) => p.id), variant, cells: layoutSpread(lp, d.sizeId, variant, sp.cells, d.spacing) };
    },
    [toLayout]
  );

  const commit = useCallback((fn: (d: AlbumDesign) => AlbumDesign) => {
    setDesign((prev) => {
      const next = fn(prev);
      if (next !== prev) {
        setUndoStack((u) => [...u.slice(-49), prev]);
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
      else setToast(`${assets.length} fotos nuevas en la tira de abajo.`);
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
    setCurrent(mode === 'auto' ? 0 : 0);
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
  // Operaciones
  // -------------------------------------------------------------------------

  /** Agrega fotos a una doble página (sacándolas de donde estuvieran). */
  const addPhotos = (spreadId: string, ids: string[]) => {
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
          if (s.photoIds.some((id) => takeSet.has(id))) return relayout({ ...s, photoIds: s.photoIds.filter((id) => !takeSet.has(id)) }, d, 0);
          return s;
        }),
      };
    });
  };

  /** Pone `photoId` en el lugar de `targetId` (intercambia si ya estaba en el álbum). */
  const replacePhoto = (spreadId: string, targetId: string, photoId: string) => {
    if (targetId === photoId) return;
    commit((d) => {
      const spreads = d.spreads.map((s) => ({ ...s, photoIds: [...s.photoIds] }));
      const ti = spreads.findIndex((s) => s.id === spreadId);
      if (ti < 0) return d;
      const tPos = spreads[ti].photoIds.indexOf(targetId);
      if (tPos < 0) return d;
      const si = spreads.findIndex((s) => s.photoIds.includes(photoId));
      if (si >= 0) spreads[si].photoIds[spreads[si].photoIds.indexOf(photoId)] = targetId;
      spreads[ti].photoIds[tPos] = photoId;
      return { ...d, spreads: spreads.map((s, i) => (i === ti || i === si ? relayout(s, d) : s)) };
    });
  };

  const removePhotos = (spreadId: string, ids: string[]) => {
    const set = new Set(ids);
    commit((d) => ({ ...d, spreads: d.spreads.map((s) => (s.id === spreadId ? relayout({ ...s, photoIds: s.photoIds.filter((id) => !set.has(id)) }, d, 0) : s)) }));
    setSelCell(null);
    setCropMode(false);
  };

  const cycleLayout = (dir: 1 | -1) => {
    const sp = design.spreads[current];
    if (!sp) return;
    const n = countSpreadVariants(toLayout(sp.photoIds), design.sizeId, spacing);
    if (n <= 1) return;
    commit((d) => ({ ...d, spreads: d.spreads.map((s) => (s.id === sp.id ? relayout(s, d, (s.variant + dir + n) % n) : s)) }));
  };

  const insertSpread = (at: number, ids: string[] = []) => {
    if (sheets >= MAX_SHEETS) {
      setToast(`El máximo es ${MAX_SHEETS} hojas.`);
      return;
    }
    commit((d) => {
      const set = new Set(ids);
      const cleaned = d.spreads.map((s) => (s.photoIds.some((id) => set.has(id)) ? relayout({ ...s, photoIds: s.photoIds.filter((id) => !set.has(id)) }, d, 0) : s));
      const fresh = relayout({ id: newSpreadId(), photoIds: ids.slice(0, MAX_PHOTOS_PER_PAGE * 2), variant: 0, cells: [] }, d, 0);
      cleaned.splice(at, 0, fresh);
      return { ...d, spreads: cleaned };
    });
    setCurrent(at);
  };

  const deleteSpread = (i: number) => {
    if (sheets <= minSheets) {
      setToast(`Este fotolibro lleva como mínimo ${minSheets} hojas.`);
      return;
    }
    commit((d) => ({ ...d, spreads: d.spreads.filter((_, k) => k !== i) }));
    setCurrent((c) => Math.max(0, Math.min(c, sheets - 2)));
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
    if (design.spreads.some((s) => s.photoIds.length) && !window.confirm('¿Armar todo el álbum automáticamente? Se reemplaza el diseño actual (podés deshacerlo).')) return;
    const lp = sortPhotos(photos).map((p) => ({ id: p.id, aspect: photoAspect(p) }));
    commit((d) => ({
      ...d,
      spreads: buildSpreads(lp, d.sizeId, suggestedSheets(lp.length, minSheetsFor(d.coverType)), d.spacing),
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
        if (!spreads[i].photoIds.length) spreads[i] = relayout({ ...spreads[i], photoIds: rest.splice(0, 6).map((p) => p.id) }, d, 0);
      }
      if (rest.length) {
        const room = MAX_SHEETS - spreads.length;
        const n = Math.min(room, Math.max(Math.ceil(rest.length / 6), Math.ceil(rest.length / (MAX_PHOTOS_PER_PAGE * 2))));
        if (n > 0) spreads.push(...buildSpreads(rest, d.sizeId, n, d.spacing));
      }
      return { ...d, spreads };
    });
  };

  const setSpacing = (patch: Partial<SpacingOptions>) => {
    setDesign((d) => {
      const nd = { ...d, spacing: { ...(d.spacing || DEFAULT_SPACING), ...patch } };
      return { ...nd, spreads: nd.spreads.map((s) => relayout(s, nd)) };
    });
  };

  const changeFormat = (sizeId: string, coverType: FotolibroCoverType, finish: FotolibroFinish) => {
    commit((d) => {
      const nd = { ...d, sizeId, coverType, finish };
      let spreads = nd.spreads.map((s) => relayout(s, nd));
      const min = minSheetsFor(coverType);
      while (phase === 'editor' && spreads.length < min) spreads = [...spreads, { id: newSpreadId(), photoIds: [], variant: 0, cells: [] }];
      return { ...nd, spreads };
    });
  };

  const updateCell = (spreadId: string, photoId: string, patch: Partial<AlbumCell>) =>
    setDesign((d) => ({
      ...d,
      spreads: d.spreads.map((s) => (s.id === spreadId ? { ...s, cells: s.cells.map((c) => (c.photoId === photoId ? { ...c, ...patch } : c)) } : s)),
    }));

  const setCoverPhoto = (photoId: string) => commit((d) => ({ ...d, cover: { ...d.cover, photoId, zoom: 1, panX: 0.5, panY: 0.5 } }));

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
    // Si se arrastró desde la tira, la selección ya se usó.
    if (dragRef.current && !dragRef.current.fromSpreadId) setTraySel([]);
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

  // Selección en la tira: clic, Ctrl/Cmd + clic, Shift + clic
  const trayList = useMemo(() => (trayFilter === 'unused' ? photos.filter((p) => !inSpreads.has(p.id)) : photos), [photos, trayFilter, inSpreads]);
  const clickTray = (e: React.MouseEvent, id: string) => {
    setSelCell(null);
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
  // Teclado
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (phase !== 'editor' || showOrder || showSetup) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
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
        setCropMode(false);
        setSelCell(null);
        setTraySel([]);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selCell) removePhotos(selCell.spreadId, [selCell.photoId]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    setSelCell(null);
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

  const renderSpread = (sp: AlbumSpread, interactive: boolean) => (
    <div
      className="relative w-full bg-white"
      style={{ aspectRatio: `${spreadAspect}`, boxShadow: interactive ? '0 18px 50px rgba(0,0,0,.55)' : undefined }}
      onDragOver={
        interactive
          ? (e) => {
              if (!isOurDrag(e)) return;
              e.preventDefault();
              if (e.target === e.currentTarget) setHover({ spreadId: sp.id, mode: 'add' });
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
              if (data) addPhotos(sp.id, data.photoIds);
            }
          : undefined
      }
      onClick={
        interactive
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (traySel.length) {
                addPhotos(sp.id, traySel);
                setTraySel([]);
              } else setSelCell(null);
            }
          : undefined
      }
    >
      {sp.cells.map((c) => {
        const photo = photoById.get(c.photoId);
        const cellAspect = (c.w * spreadAspect) / c.h;
        const isSel = interactive && selCell?.spreadId === sp.id && selCell.photoId === c.photoId;
        const isHover = interactive && hover?.spreadId === sp.id && hover.photoId === c.photoId;
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
              background: '#D9D9DC',
              outline: isSel ? `2px solid ${ACCENT}` : undefined,
              outlineOffset: -2,
              cursor: interactive ? (isSel && cropMode ? 'move' : 'grab') : undefined,
              zIndex: isSel ? 5 : undefined,
            }}
            draggable={interactive && !(isSel && cropMode)}
            onDragStart={interactive ? (e) => beginDrag(e, { photoIds: [c.photoId], fromSpreadId: sp.id }) : undefined}
            onDragEnd={interactive ? endDrag : undefined}
            onDragOver={
              interactive
                ? (e) => {
                    if (!isOurDrag(e)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const mode = zoneFor(e);
                    if (hover?.photoId !== c.photoId || hover.mode !== mode) setHover({ spreadId: sp.id, photoId: c.photoId, mode });
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
                    if (!data) return;
                    if (data.fromSpreadId === sp.id || (mode === 'replace' && data.photoIds.length === 1)) replacePhoto(sp.id, c.photoId, data.photoIds[0]);
                    else addPhotos(sp.id, data.photoIds);
                  }
                : undefined
            }
            onClick={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    if (traySel.length === 1) {
                      replacePhoto(sp.id, c.photoId, traySel[0]);
                      setTraySel([]);
                      return;
                    }
                    if (traySel.length > 1) {
                      addPhotos(sp.id, traySel);
                      setTraySel([]);
                      return;
                    }
                    if (!isSel) setCropMode(false);
                    setSelCell({ spreadId: sp.id, photoId: c.photoId });
                  }
                : undefined
            }
            onDoubleClick={
              interactive
                ? () => {
                    setSelCell({ spreadId: sp.id, photoId: c.photoId });
                    setCropMode(true);
                  }
                : undefined
            }
            onPointerDown={isSel && cropMode ? (e) => startCropDrag(e, sp.id, c, cellAspect) : undefined}
            onWheel={
              isSel && cropMode
                ? (e) => updateCell(sp.id, c.photoId, { zoom: Math.min(3, Math.max(1, c.zoom - e.deltaY * 0.0015)) })
                : undefined
            }
          >
            <PhotoImg photo={photo} frameAspect={cellAspect} zoom={c.zoom} panX={c.panX} panY={c.panY} thumb={!interactive} />
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
      {interactive && sp.photoIds.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center pointer-events-none" style={{ color: '#9A9AA0' }}>
          <LayoutGrid className="w-7 h-7" />
          <span className="text-sm">Arrastrá fotos desde la tira de abajo</span>
        </div>
      )}
      {interactive && hover?.spreadId === sp.id && !hover.photoId && (
        <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 0 3px ${ACCENT}`, background: 'rgba(59,139,235,.08)' }} />
      )}
      <div className="absolute inset-y-0 left-1/2 w-px pointer-events-none" style={{ background: 'rgba(0,0,0,.12)' }} />
    </div>
  );

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
  // Editor
  // -------------------------------------------------------------------------

  const sp = current >= 0 ? design.spreads[current] : undefined;
  const selected = selCell ? design.spreads.find((s) => s.id === selCell.spreadId)?.cells.find((c) => c.photoId === selCell.photoId) : undefined;
  const variants = sp ? countSpreadVariants(toLayout(sp.photoIds), design.sizeId, spacing) : 0;
  const TL_H = 54;

  const iconBtn = (onClick: () => void, icon: React.ReactNode, label: string, disabled = false, active = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="h-8 min-w-8 px-2 inline-flex items-center justify-center gap-1.5 rounded text-xs disabled:opacity-30"
      style={{ color: C.text, background: active ? '#3A3A40' : 'transparent' }}
      onMouseEnter={(e) => !disabled && ((e.currentTarget as HTMLElement).style.background = '#3A3A40')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = active ? '#3A3A40' : 'transparent')}
    >
      {icon}
    </button>
  );

  const renderEditor = () => (
    <>
      {/* Barra superior */}
      <div className="h-12 shrink-0 flex items-center gap-1 px-2 sm:px-3 overflow-x-auto overflow-y-visible" style={{ background: C.bar, borderBottom: `1px solid ${C.line}` }}>
        <button type="button" onClick={() => setShowSetup(true)} className="flex items-center gap-2 px-2 h-8 rounded text-xs min-w-0" style={{ color: C.text }} title="Cambiar medida o tapa">
          <BookOpen className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
          <span className="truncate hidden sm:inline">
            {size.closedLabel} · {COVER_OPTIONS.find((o) => o.type === design.coverType && o.finish === design.finish)?.name}
          </span>
          <Settings2 className="w-3.5 h-3.5 shrink-0" style={{ color: C.dim }} />
        </button>
        <div className="w-px h-5 mx-1" style={{ background: '#3A3A40' }} />
        {iconBtn(undo, <Undo2 className="w-4 h-4" />, 'Deshacer (Ctrl+Z)', !undoStack.length)}
        {iconBtn(redo, <Redo2 className="w-4 h-4" />, 'Rehacer (Ctrl+Shift+Z)', !redoStack.length)}
        <div className="w-px h-5 mx-1" style={{ background: '#3A3A40' }} />
        <div className="flex items-center rounded" style={{ background: '#1F1F22' }}>
          {iconBtn(() => cycleLayout(-1), <ChevronLeft className="w-4 h-4" />, 'Diseño anterior (↑)', variants <= 1)}
          <span className="text-[11px] px-1 tabular-nums select-none whitespace-nowrap" style={{ color: variants > 1 ? C.text : C.faint }}>
            Diseño {sp && variants > 0 ? `${(sp.variant % variants) + 1}/${variants}` : ''}
          </span>
          {iconBtn(() => cycleLayout(1), <ChevronRight className="w-4 h-4" />, 'Diseño siguiente (↓)', variants <= 1)}
        </div>
        <div className="relative">
          {iconBtn(() => setShowSpacing((v) => !v), <SlidersHorizontal className="w-4 h-4" />, 'Separación y margen', false, showSpacing)}
          {showSpacing && (
            <div className="fixed left-2 top-14 z-50 w-64 rounded-md p-4 space-y-4 shadow-2xl" style={{ background: '#2E2E33', border: `1px solid ${C.line}` }}>
              {(
                [
                  { key: 'gutterMm', label: 'Separación', min: 0, max: 12 },
                  { key: 'marginMm', label: 'Margen', min: 0, max: 25 },
                ] as const
              ).map((f) => (
                <label key={f.key} className="block text-xs" style={{ color: C.text }}>
                  <div className="flex justify-between mb-1.5">
                    <span>{f.label}</span>
                    <span className="tabular-nums" style={{ color: C.dim }}>{spacing[f.key]} mm</span>
                  </div>
                  <input
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={1}
                    value={spacing[f.key]}
                    onChange={(e) => setSpacing({ [f.key]: Number(e.target.value) })}
                    className="w-full"
                    style={{ accentColor: ACCENT }}
                  />
                </label>
              ))}
              <button type="button" onClick={() => setSpacing({ ...DEFAULT_SPACING })} className="text-[11px] underline" style={{ color: C.dim }}>
                Volver al estilo HALO (3 mm, a sangre)
              </button>
            </div>
          )}
        </div>
        {iconBtn(autoBuildAll, <><Sparkles className="w-4 h-4" /><span className="hidden md:inline">Armado automático</span></>, 'Armar todo el álbum automáticamente')}
        <div className="flex-1" />
        <span className="hidden sm:inline text-sm font-semibold tabular-nums mr-2" style={{ color: C.text }}>{formatPriceARS(price)}</span>
        <button type="button" onClick={() => setShowOrder(true)} className="h-8 px-4 rounded inline-flex items-center gap-2 text-xs font-semibold text-white" style={{ background: ACCENT }}>
          <ShoppingBag className="w-4 h-4" /> Pedir
        </button>
        {iconBtn(onClose, <X className="w-4 h-4" />, 'Cerrar')}
      </div>

      {/* Lienzo */}
      <div
        className="relative flex-1 min-h-0 flex flex-col items-center justify-center px-12 sm:px-20 py-6"
        style={{ background: C.app }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelCell(null);
            setCropMode(false);
          }
        }}
        onDragOver={(e) => isOurDrag(e) && e.preventDefault()}
      >
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.max(COVER, c - 1))}
          disabled={current <= COVER}
          className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 p-2 rounded-full disabled:opacity-20"
          style={{ color: C.text, background: '#2A2A2D' }}
          aria-label="Anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-full" style={{ maxWidth: `min(100%, calc((100vh - 25rem) * ${spreadAspect}))` }}>
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
                <span>Página {current * 2 + 2}</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.min(sheets - 1, c + 1))}
          disabled={current >= sheets - 1}
          className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 p-2 rounded-full disabled:opacity-20"
          style={{ color: C.text, background: '#2A2A2D' }}
          aria-label="Siguiente"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Controles contextuales */}
        {current === COVER && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-md px-3 py-2 shadow-2xl" style={{ background: '#2E2E33' }}>
            <input
              value={design.cover.title}
              maxLength={40}
              onChange={(e) => setDesign((d) => ({ ...d, cover: { ...d.cover, title: e.target.value } }))}
              placeholder="Título de tapa (opcional)"
              aria-label="Título de tapa"
              className="w-56 rounded px-2.5 py-1.5 text-xs outline-none"
              style={{ background: '#1F1F22', color: C.text }}
            />
            {design.cover.photoId && (
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={design.cover.zoom}
                onChange={(e) => setDesign((d) => ({ ...d, cover: { ...d.cover, zoom: Number(e.target.value) } }))}
                aria-label="Zoom de la tapa"
                className="w-24"
                style={{ accentColor: ACCENT }}
              />
            )}
          </div>
        )}
        {selCell && selected && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-md px-2 py-1.5 shadow-2xl" style={{ background: '#2E2E33' }}>
            {cropMode ? (
              <>
                <span className="text-[11px] px-2" style={{ color: C.dim }}>Arrastrá para encuadrar</span>
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
        {traySel.length > 0 && current !== COVER && sp && (
          <button
            type="button"
            onClick={() => {
              addPhotos(sp.id, traySel);
              setTraySel([]);
            }}
            className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-2xl"
            style={{ background: ACCENT }}
          >
            + Agregar {traySel.length} {traySel.length === 1 ? 'foto' : 'fotos'} a esta doble página
          </button>
        )}
        {toast && (
          <div className="absolute top-3 right-3 max-w-xs rounded-md px-3 py-2 text-xs shadow-2xl" style={{ background: '#2E2E33', color: C.text }}>
            {toast}
          </div>
        )}
      </div>

      {/* Línea de tiempo de dobles páginas */}
      <div className="shrink-0 overflow-x-auto overflow-y-hidden" style={{ background: C.panel, borderTop: `1px solid ${C.line}` }}>
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
                  if ((d as any).spreadIndex !== undefined) moveSpreadTo((d as any).spreadIndex, (d as any).spreadIndex < i ? i - 1 : i);
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
                onDragStart={(e) => {
                  const payload = { photoIds: [], spreadIndex: i } as any;
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
                  const d = readDrag(e) as any;
                  endDrag();
                  if (!d) return;
                  if (d.spreadIndex !== undefined) moveSpreadTo(d.spreadIndex, i);
                  else addPhotos(s.id, d.photoIds);
                }}
                onDelete={sheets > minSheets ? () => deleteSpread(i) : undefined}
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
              const d = readDrag(e) as any;
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
            style={{ width: spreadAspect * TL_H * 0.6, height: TL_H, border: '1px dashed #4A4A52', color: C.dim }}
            title="Agregar hoja"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="self-center text-[11px] pl-2 whitespace-nowrap" style={{ color: C.faint }}>
            {sheets} hojas · {sheets * 2} pág.
          </div>
        </div>
      </div>

      {/* Tira de fotos */}
      <div
        className="shrink-0 flex flex-col"
        style={{ background: C.tray, borderTop: `1px solid ${C.line}`, height: 168 }}
        onDragOver={(e) => {
          if (isOurDrag(e) && dragRef.current?.fromSpreadId) e.preventDefault();
        }}
        onDrop={(e) => {
          const d = readDrag(e);
          endDrag();
          if (d?.fromSpreadId) removePhotos(d.fromSpreadId, d.photoIds);
        }}
      >
        <div className="flex items-center gap-2 px-3 h-9 shrink-0" style={{ color: C.dim }}>
          <span className="text-xs font-semibold" style={{ color: C.text }}>Fotos</span>
          <span className="hidden sm:inline text-[11px] whitespace-nowrap">
            {photos.length} · {unusedCount} sin usar{traySel.length ? ` · ${traySel.length} seleccionadas` : ''}
          </span>
          <div className="flex rounded ml-2 text-[11px]" style={{ background: '#242428' }}>
            {(['all', 'unused'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setTrayFilter(f)}
                className="px-2.5 py-1 rounded whitespace-nowrap"
                style={{ background: trayFilter === f ? '#3A3A40' : 'transparent', color: trayFilter === f ? C.text : C.dim }}
              >
                {f === 'all' ? 'Todas' : 'Sin usar'}
              </button>
            ))}
          </div>
          {unusedCount > 0 && (
            <button type="button" onClick={autoFillUnused} className="text-[11px] px-2.5 py-1 rounded inline-flex items-center gap-1 whitespace-nowrap" style={{ background: '#242428', color: C.text }}>
              <Sparkles className="w-3 h-3" /> Ubicar sin usar
            </button>
          )}
          <div className="flex-1" />
          {!isLoggedIn && onOpenAuth && (
            <button type="button" onClick={onOpenAuth} className="hidden md:inline text-[11px] underline" style={{ color: '#E0B65A' }}>
              Iniciá sesión para guardar tus fotos en alta
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] px-2.5 py-1 rounded inline-flex items-center gap-1.5 whitespace-nowrap"
            style={{ background: '#242428', color: C.text }}
          >
            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {processing ? `${processing.done}/${processing.total}` : 'Agregar fotos'}
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-3 pb-2">
          <div className="flex gap-1.5 h-full items-stretch w-max">
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
                  className="relative h-full shrink-0 overflow-hidden rounded-sm"
                  style={{ aspectRatio: `${Math.max(0.66, Math.min(1.6, photoAspect(p)))}`, outline: sel ? `2px solid ${ACCENT}` : undefined, outlineOffset: -2 }}
                  title={p.name}
                >
                  <img src={thumbSrc(p)} alt={p.name} draggable={false} className="w-full h-full object-cover" style={{ opacity: count ? 0.45 : 1 }} />
                  {count > 0 && (
                    <span className="absolute top-1 right-1 rounded-full w-4 h-4 text-[9px] font-bold flex items-center justify-center text-white" style={{ background: ACCENT }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            {trayList.length === 0 && (
              <div className="self-center text-xs px-4" style={{ color: C.faint }}>
                {trayFilter === 'unused' ? 'Ya usaste todas las fotos.' : 'Agregá fotos para empezar.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  // -------------------------------------------------------------------------
  // Pedido
  // -------------------------------------------------------------------------

  const lowRes = design.spreads.reduce(
    (a, s) => a + s.cells.filter((c) => {
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
            <div className="text-[11px]" style={{ color: '#E0B65A' }}>De 8 a 10 hojas se cobra el precio de 10: podés sumar {10 - sheets} sin costo.</div>
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
          {iconBtn(onClose, <X className="w-4 h-4" />, 'Cerrar')}
        </div>
      )}

      {phase === 'setup' && shell("Nuevo fotolibro", "Elegí la medida y la tapa. Lo podés cambiar después.", <>
          {formatPicker(() => setPhase(photos.length ? 'choose-start' : 'upload'), 'Continuar')}
        </>)}

      {phase === 'upload' && shell("Agregá tus fotos", "Subí todas las fotos que quieras usar. Después las arrastrás a cada página.", <>
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
        </>)}

      {phase === 'choose-start' && shell("¿Cómo querés empezar?", `${photos.length} fotos listas.`, <>
          <div className="grid sm:grid-cols-2 gap-3">
            <button type="button" onClick={() => startAlbum('auto')} className="rounded-lg p-6 text-left" style={{ background: C.panel, boxShadow: `inset 0 0 0 2px ${ACCENT}` }}>
              <Sparkles className="w-6 h-6" style={{ color: ACCENT }} />
              <div className="mt-3 font-semibold">Armado automático</div>
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
        </>)}

      {phase === 'editor' && renderEditor()}
      {showOrder && renderOrder()}
      {showSetup && (
        <Modal onClose={() => setShowSetup(false)} title="Medida y tapa">
          {formatPicker(() => setShowSetup(false), 'Listo')}
        </Modal>
      )}
      {showSpacing && <div className="fixed inset-0 z-40" onClick={() => setShowSpacing(false)} />}

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
  draggable?: boolean;
  onDelete?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}> = ({ active, label, width, onClick, children, highlight, warn, draggable, onDelete, ...dnd }) => (
  <div className="group relative shrink-0 flex flex-col items-center gap-1" style={{ width }}>
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      {...dnd}
      className="w-full rounded-sm overflow-hidden"
      style={{ outline: active ? `2px solid ${ACCENT}` : highlight ? '2px solid #E0B65A' : warn ? '1px dashed #6B6B72' : undefined, outlineOffset: 2 }}
    >
      {children}
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
