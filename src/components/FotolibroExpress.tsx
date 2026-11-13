// FotolibroExpress — la forma más simple de pedir un fotolibro.
//
//   1. Elegí tu fotolibro   (3 opciones listas, un clic)
//   2. Subí tus fotos       (un botón o arrastrar)
//   3. Mirá tu libro        (se arma solo; se puede retocar)
//   4. Pedí                 (brillo/mate, caja, total, al carrito)
//
// Estilo: limpio, blanco, letra grande y textos cortos. Un solo botón
// principal por pantalla. El diseño automático usa src/lib/albumLayout.ts y
// el pedido viaja igual que el del editor anterior (project.album).

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Crop, ImagePlus, Loader2, Minus, Move, Package, Plus, Replace, Shuffle, SlidersHorizontal, Sparkles, Trash2, X, ZoomIn } from 'lucide-react';

// El editor completo (interfaz tipo SmartAlbums) se carga solo si el cliente lo pide.
const SimpleAlbumEditor = lazy(() => import('./SimpleAlbumEditor').then((m) => ({ default: m.SimpleAlbumEditor })));
import { PhotoAsset, PhotobookProject } from '../types';
import {
  FOTOLIBRO_PRESETS,
  FotolibroPreset,
  FotolibroLaminate,
  MAX_PHOTOS_PER_PAGE,
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
  layoutSpread,
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

interface Props {
  onClose: () => void;
  onAddToCart: (project: PhotobookProject, totalPrice: number) => void;
  initialProject?: PhotobookProject | null;
  onOpenAuth?: () => void;
}

type Step = 'elegir' | 'fotos' | 'libro' | 'pedir';
const STEPS: Step[] = ['elegir', 'fotos', 'libro', 'pedir'];
const STEP_LABEL: Record<Step, string> = { elegir: 'Elegí', fotos: 'Subí tus fotos', libro: 'Tu libro', pedir: 'Pedí' };

const FONT = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const INK = '#1F1C18';
const GREY = '#5E554B';
const SOFT = '#F3EEE5';
const LINE = '#E2D9CA';
const BLUE = '#8C6D37'; // dorado Halo (acentos)
const CTA = '#1F1C18'; // botón principal
const COVER = -1;
// Tipografías de los textos del editor completo (misma lista que SimpleAlbumEditor y albumPrintExport)
const TEXT_FONTS = {
  serif: '"Cormorant Garamond", Georgia, serif',
  sans: '"Plus Jakarta Sans", Arial, sans-serif',
  script: '"Great Vibes", cursive',
} as const;

// ---------------------------------------------------------------------------

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

function presetPrice(p: FotolibroPreset): number {
  return priceFotolibro({ sizeId: p.sizeId, coverType: p.coverType, finish: p.finish, sheets: minSheetsFor(p.coverType) }) ?? 0;
}

function designFromPreset(p: FotolibroPreset, prev?: AlbumDesign): AlbumDesign {
  return {
    version: 1,
    sizeId: p.sizeId,
    coverType: p.coverType,
    finish: p.finish,
    laminate: prev?.laminate || 'brillo',
    giftBox: false,
    cover: { zoom: 1, panX: 0.5, panY: 0.5, title: prev?.cover.title || '', photoId: prev?.cover.photoId },
    spreads: [],
    spacing: { ...DEFAULT_SPACING },
  };
}

const Img: React.FC<{ photo?: PhotoAsset; frameAspect: number; zoom?: number; panX?: number; panY?: number; thumb?: boolean }> = ({
  photo,
  frameAspect,
  zoom = 1,
  panX = 0.5,
  panY = 0.5,
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

// Ilustración de un libro (para las tarjetas de la pantalla 1).
const BookArt: React.FC<{ preset: FotolibroPreset; scale: number }> = ({ preset, scale }) => {
  const size = getFotolibroSize(preset.sizeId);
  const ratio = size ? size.pageWidthCm / size.pageHeightCm : 1;
  const h = 150 * scale;
  const w = h * ratio;
  const leather = preset.finish === 'foto-tapa-cuero';
  return (
    <div className="relative" style={{ width: w + 10, height: h + 8 }}>
      {/* hojas */}
      <div className="absolute rounded-[3px]" style={{ left: 8, top: 5, width: w, height: h, background: '#fbfbfb', boxShadow: '0 1px 0 #e5e5e5, 0 2px 0 #eee, 0 3px 0 #e5e5e5' }} />
      {/* tapa */}
      <div
        className="absolute rounded-[3px] overflow-hidden"
        style={{
          left: 0,
          top: 0,
          width: w,
          height: h,
          background: leather ? '#141414' : 'linear-gradient(135deg,#d9c7b0,#a88c6c)',
          boxShadow: '0 18px 30px -12px rgba(0,0,0,.35), 0 4px 10px rgba(0,0,0,.12)',
        }}
      >
        <div
          className="absolute"
          style={
            leather
              ? { left: '14%', right: '14%', top: '14%', bottom: '24%', background: 'linear-gradient(160deg,#b9c8d6 0%,#7d93a8 45%,#4f5f52 46%,#7a8a6a 100%)' }
              : { inset: 0, background: 'linear-gradient(160deg,#c9d6e2 0%,#8fa6bb 50%,#5d6f5c 51%,#8b9b78 100%)' }
          }
        />
        <div className="absolute left-0 top-0 bottom-0" style={{ width: 6, background: 'linear-gradient(90deg,rgba(0,0,0,.25),transparent)' }} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

export const FotolibroExpress: React.FC<Props> = ({ onClose, onAddToCart, initialProject, onOpenAuth }) => {
  const { user, profile, isLoggedIn } = useAuth();
  const userId = user?.id || profile?.id;
  const resume = initialProject?.album?.spreads?.length ? initialProject : null;

  const [projectId] = useState(resume?.id || `proj-${Date.now()}`);
  const [createdAt] = useState(resume?.createdAt || new Date().toISOString());
  const [presetId, setPresetId] = useState<string>(() => {
    const a = resume?.album;
    return FOTOLIBRO_PRESETS.find((p) => p.sizeId === a?.sizeId && p.coverType === a?.coverType)?.id || FOTOLIBRO_PRESETS[1].id;
  });
  const [design, setDesign] = useState<AlbumDesign>(() => resume?.album || designFromPreset(FOTOLIBRO_PRESETS[1]));
  const [photos, setPhotos] = useState<PhotoAsset[]>(() => resume?.photos || []);
  const [step, setStep] = useState<Step>(resume ? 'libro' : 'elegir');
  const [current, setCurrent] = useState(COVER);
  const [selected, setSelected] = useState<string | null>(null);
  /** Selector de fotos: para la tapa, para reemplazar una foto o para sumar fotos a una hoja. */
  const [picker, setPicker] = useState<null | { kind: 'cover' } | { kind: 'replace'; spreadIndex: number; photoId: string } | { kind: 'add'; spreadIndex: number }>(null);
  const [pickSel, setPickSel] = useState<string[]>([]);
  /** Herramienta activa sobre la foto elegida. */
  const [tool, setTool] = useState<null | 'encuadrar' | 'mover'>(null);
  const [showMargins, setShowMargins] = useState(false);
  const dragId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [processing, setProcessing] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const preset = FOTOLIBRO_PRESETS.find((p) => p.id === presetId) || FOTOLIBRO_PRESETS[0];
  const size = getFotolibroSize(design.sizeId);
  const minSheets = minSheetsFor(design.coverType);
  const sheets = design.spreads.length;
  const pageMm = pageSizeMm(design.sizeId);
  const pageAspect = pageMm.w / pageMm.h;
  const spreadAspect = pageAspect * 2;
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

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

  // Arma el libro completo de forma automática.
  const autoBuild = useCallback((list: PhotoAsset[], d: AlbumDesign): AlbumDesign => {
    const lp = sortPhotos(list).map((p) => ({ id: p.id, aspect: photoAspect(p) }));
    const n = suggestedSheets(lp.length, minSheetsFor(d.coverType));
    const cover = d.cover.photoId && list.some((p) => p.id === d.cover.photoId) ? d.cover.photoId : lp[0]?.id;
    return { ...d, spreads: buildSpreads(lp, d.sizeId, n, d.spacing), cover: { ...d.cover, photoId: cover } };
  }, []);

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
      // Si ya estaba armado, se vuelve a armar con todas las fotos.
      if (design.spreads.length) {
        setDesign((d) => autoBuild(merged, d));
        setToast(`Sumamos ${assets.length} fotos a tu libro`);
      }
    } finally {
      setProcessing(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhotoFromList = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));

  // Respaldo de originales en alta (necesita sesión iniciada).
  const uploading = useRef(new Set<string>());
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!isLoggedIn || !userId) return;
    const pending = photos.filter(
      (p) => !p.storagePath && p.uploadStatus !== 'uploaded' && p.uploadStatus !== 'error' && p.url?.startsWith('blob:') && !uploading.current.has(p.id)
    );
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

  const usedIds = useMemo(() => {
    const s = new Set<string>();
    for (const sp of design.spreads) for (const id of sp.photoIds) s.add(id);
    if (design.cover.photoId) s.add(design.cover.photoId);
    return s;
  }, [design.spreads, design.cover.photoId]);
  const usedPhotos = photos.filter((p) => usedIds.has(p.id));
  const pendingUploads = isLoggedIn ? usedPhotos.filter((p) => p.uploadStatus === 'uploading' || p.uploadStatus === 'pending').length : 0;
  const failedUploads = isLoggedIn ? usedPhotos.filter((p) => p.uploadStatus === 'error').length : 0;

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
    if (!design.spreads.length || !photos.length) return;
    const t = setTimeout(() => {
      saveUserProject(userId || 'local-user', buildProject(), price).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [design, photos, userId, price, buildProject]);

  // -------------------------------------------------------------------------
  // Retoques (lo único que se puede tocar en "Tu libro")
  // -------------------------------------------------------------------------

  const otherDesign = (spreadIndex: number) => {
    if (design.spreads[spreadIndex]?.locked) {
      setToast('Esta hoja está bloqueada desde el editor completo');
      return;
    }
    setDesign((d) => {
      const spreads = d.spreads.map((sp, i) => {
        if (i !== spreadIndex) return sp;
        const lp = toLayout(sp.photoIds);
        const variant = sp.variant + 1;
        return { ...sp, variant, cells: layoutSpread(lp, d.sizeId, variant, sp.cells, d.spacing) };
      });
      return { ...d, spreads };
    });
    setSelected(null);
  };

  const removeFromSpread = (spreadIndex: number, photoId: string) => {
    const sp = design.spreads[spreadIndex];
    if (!sp) return;
    if (sp.locked) {
      setToast('Esta hoja está bloqueada desde el editor completo');
      return;
    }
    if (sp.photoIds.length <= 1) {
      setToast('Cada página necesita al menos una foto');
      return;
    }
    setDesign((d) => ({
      ...d,
      spreads: d.spreads.map((s, i) => {
        if (i !== spreadIndex) return s;
        const lp = toLayout(s.photoIds.filter((id) => id !== photoId));
        return { ...s, photoIds: lp.map((p) => p.id), variant: 0, cells: layoutSpread(lp, d.sizeId, 0, s.cells, d.spacing) };
      }),
    }));
    setSelected(null);
  };

  /** Rediagrama una hoja con sus fotos actuales (conserva encuadres). */
  const relayoutSpread = (s: AlbumSpread, d: AlbumDesign, variant = 0): AlbumSpread => {
    const lp = toLayout(s.photoIds);
    return { ...s, photoIds: lp.map((p) => p.id), variant, cells: layoutSpread(lp, d.sizeId, variant, s.cells, d.spacing), custom: false };
  };

  /** Pone `newId` donde estaba `targetId`. Si la nueva ya estaba en otra hoja, se intercambian. */
  const replaceInSpread = (spreadIndex: number, targetId: string, newId: string) => {
    if (targetId === newId) return;
    setDesign((d) => {
      const spreads = d.spreads.map((s) => ({ ...s, photoIds: [...s.photoIds], cells: s.cells.map((c) => ({ ...c })) }));
      const t = spreads[spreadIndex];
      if (!t || t.locked) return d;
      const pos = t.photoIds.indexOf(targetId);
      if (pos < 0) return d;
      const si = spreads.findIndex((s) => s.photoIds.includes(newId));
      if (si >= 0 && spreads[si].locked) return d;
      if (si >= 0) {
        const sp2 = spreads[si];
        const p2 = sp2.photoIds.indexOf(newId);
        sp2.photoIds[p2] = targetId;
        const c2 = sp2.cells.find((c) => c.photoId === newId);
        if (c2) Object.assign(c2, { photoId: targetId, zoom: 1, panX: 0.5, panY: 0.5 });
      }
      t.photoIds[pos] = newId;
      const c1 = t.cells.find((c) => c.photoId === targetId);
      if (c1) Object.assign(c1, { photoId: newId, zoom: 1, panX: 0.5, panY: 0.5 });
      return { ...d, spreads };
    });
    setSelected(null);
    setTool(null);
  };

  /** Intercambia dos fotos de la misma hoja (cada una pasa al lugar de la otra). */
  const swapInSpread = (spreadIndex: number, a: string, b: string) => {
    if (a === b) return;
    setDesign((d) => ({
      ...d,
      spreads: d.spreads.map((s, i) => {
        if (i !== spreadIndex || s.locked) return s;
        const ids = s.photoIds.map((id) => (id === a ? b : id === b ? a : id));
        const cells = s.cells.map((c) => (c.photoId === a ? { ...c, photoId: b, zoom: 1, panX: 0.5, panY: 0.5 } : c.photoId === b ? { ...c, photoId: a, zoom: 1, panX: 0.5, panY: 0.5 } : c));
        return { ...s, photoIds: ids, cells };
      }),
    }));
    setSelected(null);
    setTool(null);
  };

  /** Suma fotos a una hoja (si estaban en otra, se mueven). */
  const addToSpread = (spreadIndex: number, ids: string[]) => {
    const target = design.spreads[spreadIndex];
    if (!target) return;
    if (target.locked) return setToast('Esta hoja está bloqueada desde el editor completo');
    const room = MAX_PHOTOS_PER_PAGE * 2 - target.photoIds.length;
    const take = ids.filter((id) => !target.photoIds.includes(id)).slice(0, Math.max(0, room));
    if (!take.length) return setToast(`Una hoja admite hasta ${MAX_PHOTOS_PER_PAGE * 2} fotos`);
    const set = new Set(take);
    setDesign((d) => ({
      ...d,
      spreads: d.spreads.map((s, i) => {
        if (i === spreadIndex) return relayoutSpread({ ...s, photoIds: [...s.photoIds, ...take] }, d, 0);
        if (!s.locked && s.photoIds.some((id) => set.has(id))) return relayoutSpread({ ...s, photoIds: s.photoIds.filter((id) => !set.has(id)) }, d, 0);
        return s;
      }),
    }));
    setSelected(null);
  };

  /** Una foto más en esta hoja: la siguiente que no está en el libro. */
  const addNextUnused = (spreadIndex: number) => {
    const next = sortPhotos(photos.filter((p) => !usedIds.has(p.id)))[0];
    if (!next) {
      setPicker({ kind: 'add', spreadIndex });
      setPickSel([]);
      return;
    }
    addToSpread(spreadIndex, [next.id]);
  };

  const updateCell = (spreadIndex: number, photoId: string, patch: Partial<AlbumCell>) =>
    setDesign((d) => ({
      ...d,
      spreads: d.spreads.map((s, i) => (i === spreadIndex ? { ...s, cells: s.cells.map((c) => (c.photoId === photoId ? { ...c, ...patch } : c)) } : s)),
    }));

  /** Separación entre fotos y margen de la hoja, para todo el libro. */
  const setSpacing = (patch: Partial<SpacingOptions>) =>
    setDesign((d) => {
      const nd = { ...d, spacing: { ...(d.spacing || DEFAULT_SPACING), ...patch } };
      return { ...nd, spreads: nd.spreads.map((s) => (s.locked ? s : relayoutSpread(s, nd, s.variant))) };
    });

  /** Vuelve a armar todo el libro con todas las fotos, en orden. */
  const rebuildAll = () => {
    if (!window.confirm('¿Rearmar todo el libro automáticamente? Se pierden los cambios que hiciste en las hojas.')) return;
    setDesign((d) => autoBuild(photos, d));
    setSelected(null);
    setTool(null);
    setCurrent(0);
  };

  // Arrastrar una foto sobre otra la intercambia; sobre una miniatura de hoja, la pasa a esa hoja.
  const DRAG = 'application/x-halo-photo';
  const onCellDragStart = (e: React.DragEvent, photoId: string) => {
    dragId.current = photoId;
    e.dataTransfer.setData(DRAG, photoId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const readDragId = (e: React.DragEvent) => e.dataTransfer.getData(DRAG) || dragId.current;
  const endDrag = () => {
    dragId.current = null;
    setDropTarget(null);
  };

  // -------------------------------------------------------------------------
  // Navegación
  // -------------------------------------------------------------------------

  const choosePreset = (p: FotolibroPreset) => {
    setPresetId(p.id);
    const d = designFromPreset(p, design);
    if (photos.length) {
      setDesign(autoBuild(photos, d));
      setCurrent(COVER);
      setStep('libro');
    } else {
      setDesign(d);
      setStep('fotos');
    }
  };

  const goBuild = () => {
    setDesign((d) => autoBuild(photos, d));
    setCurrent(COVER);
    setStep('libro');
  };

  const back = () => {
    const i = STEPS.indexOf(step);
    if (i <= 0) onClose();
    else setStep(STEPS[i - 1]);
  };

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);

  const pages = [COVER, ...design.spreads.map((_, i) => i)];
  const go = (dir: 1 | -1) => {
    setSelected(null);
    setCurrent((c) => {
      const i = pages.indexOf(c) + dir;
      return pages[Math.max(0, Math.min(pages.length - 1, i))];
    });
  };
  useEffect(() => {
    if (step !== 'libro') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (picker || advanced) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') {
        setSelected(null);
        setTool(null);
        setShowMargins(false);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && current !== COVER) removeFromSpread(current, selected);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const order = () => {
    if (!isLoggedIn) {
      setToast('Ingresá a tu cuenta para recibir tus fotos en alta calidad');
      onOpenAuth?.();
      return;
    }
    onAddToCart(buildProject(), price);
  };

  // -------------------------------------------------------------------------
  // Piezas visuales
  // -------------------------------------------------------------------------

  const primary = (label: React.ReactNode, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 px-6 rounded-full text-[16px] font-semibold transition-all active:scale-[.98] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#3D352E] inline-flex items-center justify-center gap-2"
      style={{ background: CTA, color: '#FDFCF9' }}
    >
      {label}
    </button>
  );

  const renderCover = (thumb = false) => {
    const photo = photoById.get(design.cover.photoId || '');
    const leather = design.finish === 'foto-tapa-cuero';
    const title = design.cover.title.trim();
    return (
      <div className="relative w-full h-full overflow-hidden" style={{ background: leather ? '#151515' : '#eee', borderRadius: thumb ? 2 : 4 }}>
        {leather ? (
          <div className="absolute overflow-hidden" style={{ left: '12%', right: '12%', top: '12%', bottom: title ? '26%' : '12%' }}>
            <Img photo={photo} frameAspect={(pageAspect * 0.76) / (title ? 0.62 : 0.76)} thumb={thumb} />
          </div>
        ) : (
          <Img photo={photo} frameAspect={pageAspect} thumb={thumb} />
        )}
        {title && !thumb && (
          <div
            className="absolute left-0 right-0 text-center px-4 truncate"
            style={{
              bottom: leather ? '11%' : '7%',
              color: leather ? '#e8e2d6' : '#fff',
              fontSize: 'clamp(12px, 2.2vw, 22px)',
              letterSpacing: '.04em',
              textShadow: leather ? 'none' : '0 1px 8px rgba(0,0,0,.45)',
            }}
          >
            {title}
          </div>
        )}
        <div className="absolute left-0 top-0 bottom-0" style={{ width: '3%', background: 'linear-gradient(90deg,rgba(0,0,0,.28),transparent)' }} />
      </div>
    );
  };

  /** Encuadrar: arrastrar mueve la foto dentro de su marco (misma cuenta que el archivo de impresión). */
  const startCrop = (e: React.PointerEvent, spreadIndex: number, cell: AlbumCell, cellAspect: number) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pl = placeImage(cellAspect, photoAspect(photoById.get(cell.photoId)), cell.zoom, cell.panX, cell.panY);
    const sx = e.clientX;
    const sy = e.clientY;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const spanX = 1 - pl.width;
      const spanY = 1 - pl.height;
      updateCell(spreadIndex, cell.photoId, {
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

  // Fondo, blanco y negro y textos vienen del editor completo: acá se muestran tal cual (sin editarlos).
  const renderSpread = (sp: AlbumSpread, spreadIndex: number, interactive: boolean, thumb = false) => (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ borderRadius: thumb ? 2 : 4, background: sp.background || design.background || '#FFFFFF', containerType: 'size' }}
      onDragOver={interactive ? (e) => dragId.current && e.preventDefault() : undefined}
      onDrop={
        interactive
          ? (e) => {
              e.preventDefault();
              const id = readDragId(e);
              endDrag();
              if (id && !sp.photoIds.includes(id)) addToSpread(spreadIndex, [id]);
            }
          : undefined
      }
    >
      {sp.cells.map((c) => {
        const frameAspect = (c.w * spreadAspect) / c.h;
        const isSel = interactive && selected === c.photoId;
        const cropping = isSel && tool === 'encuadrar';
        const isDrop = interactive && dropTarget === c.photoId;
        return (
          <div
            key={c.photoId}
            className="absolute overflow-hidden"
            draggable={interactive && !cropping && !sp.locked}
            onDragStart={interactive ? (e) => onCellDragStart(e, c.photoId) : undefined}
            onDragEnd={interactive ? endDrag : undefined}
            onDragOver={
              interactive
                ? (e) => {
                    if (!dragId.current || dragId.current === c.photoId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (dropTarget !== c.photoId) setDropTarget(c.photoId);
                  }
                : undefined
            }
            onDragLeave={interactive ? () => dropTarget === c.photoId && setDropTarget(null) : undefined}
            onDrop={
              interactive
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = readDragId(e);
                    endDrag();
                    if (!id || id === c.photoId) return;
                    if (sp.photoIds.includes(id)) swapInSpread(spreadIndex, c.photoId, id);
                    else replaceInSpread(spreadIndex, c.photoId, id);
                  }
                : undefined
            }
            onClick={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    if (tool === 'mover' && selected && selected !== c.photoId) {
                      swapInSpread(spreadIndex, selected, c.photoId);
                      return;
                    }
                    if (isSel) return;
                    setTool(null);
                    setSelected(c.photoId);
                  }
                : undefined
            }
            onDoubleClick={
              interactive && !sp.locked
                ? () => {
                    setSelected(c.photoId);
                    setTool('encuadrar');
                  }
                : undefined
            }
            onPointerDown={cropping ? (e) => startCrop(e, spreadIndex, c, frameAspect) : undefined}
            onWheel={cropping ? (e) => updateCell(spreadIndex, c.photoId, { zoom: Math.min(3, Math.max(1, c.zoom - e.deltaY * 0.0015)) }) : undefined}
            style={{
              left: `${c.x * 100}%`,
              top: `${c.y * 100}%`,
              width: `${c.w * 100}%`,
              height: `${c.h * 100}%`,
              cursor: interactive ? (cropping ? 'move' : tool === 'mover' ? 'copy' : 'pointer') : 'default',
              outline: isSel ? `3px solid ${BLUE}` : isDrop ? `3px dashed ${BLUE}` : 'none',
              outlineOffset: -3,
              filter: c.bw ? 'grayscale(1)' : undefined,
              zIndex: isSel ? 2 : undefined,
            }}
          >
            <Img photo={photoById.get(c.photoId)} frameAspect={frameAspect} zoom={c.zoom} panX={c.panX} panY={c.panY} thumb={thumb} />
            {isDrop && (
              <div className="absolute inset-0 flex items-center justify-center text-[14px] font-medium text-white pointer-events-none" style={{ background: 'rgba(140,109,55,.45)' }}>
                Soltá para intercambiar
              </div>
            )}
            {cropping && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[12px] text-white pointer-events-none whitespace-nowrap" style={{ background: 'rgba(0,0,0,.55)' }}>
                Arrastrá para encuadrar · rueda para acercar
              </div>
            )}
          </div>
        );
      })}
      {interactive && sp.photoIds.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[16px] text-center px-6" style={{ color: GREY }}>
          Esta hoja está vacía. Tocá «+ foto» para sumarle fotos.
        </div>
      )}
      {(sp.texts || []).map((t) => (
        <div
          key={t.id}
          className="absolute pointer-events-none"
          style={{
            left: `${t.x * 100}%`,
            top: `${t.y * 100}%`,
            width: `${t.w * 100}%`,
            fontFamily: TEXT_FONTS[t.font],
            fontSize: `${t.size * 100}cqh`,
            lineHeight: 1.25,
            textAlign: t.align,
            color: t.color,
            fontStyle: t.italic ? 'italic' : undefined,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {t.text}
        </div>
      ))}
      {sp.locked && interactive && (
        <span className="absolute top-2 left-2 rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: 'rgba(0,0,0,.55)', color: '#fff' }}>
          Hoja bloqueada
        </span>
      )}
      {/* pliegue central */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{ left: '47%', width: '6%', background: 'linear-gradient(90deg,transparent,rgba(0,0,0,.10) 48%,rgba(0,0,0,.16) 50%,rgba(0,0,0,.10) 52%,transparent)' }}
      />
    </div>
  );

  // -------------------------------------------------------------------------
  // Pantallas
  // -------------------------------------------------------------------------

  const screenElegir = (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-center font-semibold leading-tight" style={{ fontFamily: SERIF, fontSize: 'clamp(34px,4.5vw,48px)', color: INK }}>
        Elegí tu fotolibro
      </h1>
      <p className="text-center mt-2 text-[18px]" style={{ color: GREY }}>
        Vos subís las fotos. Nosotros lo armamos y lo imprimimos.
      </p>
      <div className="grid md:grid-cols-3 gap-4 mt-6">
        {FOTOLIBRO_PRESETS.map((p, i) => {
          const s = getFotolibroSize(p.sizeId);
          const min = minSheetsFor(p.coverType);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => choosePreset(p)}
              className="group text-left rounded-2xl p-5 flex flex-col transition-all hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,.25)]"
              style={{ background: SOFT, outline: p.badge ? `2px solid ${BLUE}` : 'none' }}
            >
              <div className="h-5 text-[13px] font-semibold" style={{ color: BLUE }}>
                {p.badge || ''}
              </div>
              <div className="h-[120px] md:h-[170px] flex items-end justify-center">
                <div className="scale-75 md:scale-100 origin-bottom"><BookArt preset={p} scale={0.72 + i * 0.2} /></div>
              </div>
              <div className="mt-4 text-[30px] font-semibold leading-none" style={{ color: INK, fontFamily: SERIF }}>
                {p.name}
              </div>
              <div className="text-[17px] mt-0.5" style={{ color: INK }}>
                {s?.closedLabel} · {p.coverType === 'dura' ? 'Tapa dura' : 'Tapa blanda'}
              </div>
              <p className="text-[16px] mt-2 leading-snug flex-1" style={{ color: GREY }}>
                {p.tagline}
              </p>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[14px]" style={{ color: GREY }}>Desde</div>
                  <div className="text-[22px] font-semibold tabular-nums" style={{ color: INK }}>{formatPriceARS(presetPrice(p))}</div>
                  <div className="text-[14px]" style={{ color: GREY }}>{min * 2} páginas incluidas</div>
                </div>
                <span
                  className="h-10 px-5 rounded-full text-[15px] font-semibold inline-flex items-center transition-colors group-hover:bg-[#3D352E]"
                  style={{ background: CTA, color: '#FDFCF9' }}
                >
                  Elegir
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-1.5 text-[15px]" style={{ color: GREY }}>
        <span className="inline-flex items-center gap-2"><Check className="w-4 h-4" style={{ color: '#1a8f3c' }} /> Papel fotográfico</span>
        <span className="inline-flex items-center gap-2"><Check className="w-4 h-4" style={{ color: '#1a8f3c' }} /> Hojas rígidas que abren planas</span>
        <span className="inline-flex items-center gap-2"><Check className="w-4 h-4" style={{ color: '#1a8f3c' }} /> Lo ves terminado antes de pagar</span>
      </div>
    </div>
  );

  const recommended = `${minSheets * 2 * 2} y ${minSheets * 2 * 5}`;
  const screenFotos = (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28">
      <h1 className="text-center font-semibold leading-tight" style={{ fontFamily: SERIF, fontSize: 'clamp(32px,4.2vw,44px)', color: INK }}>
        Subí tus fotos
      </h1>
      <p className="text-center mt-2 text-[18px]" style={{ color: GREY }}>
        Te recomendamos entre {recommended} fotos. Las ordenamos por fecha.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !processing && fileRef.current?.click()}
        className="mt-6 rounded-2xl cursor-pointer flex flex-col items-center justify-center text-center transition-colors"
        style={{
          minHeight: photos.length ? 120 : 240,
          background: dragOver ? '#EFE4CF' : SOFT,
          border: `2px dashed ${dragOver ? BLUE : LINE}`,
        }}
      >
        {processing ? (
          <>
            <Loader2 className="w-9 h-9 animate-spin" style={{ color: BLUE }} />
            <div className="mt-4 text-[19px] font-medium" style={{ color: INK }}>
              Cargando {processing.done} de {processing.total}…
            </div>
            <div className="mt-3 w-64 h-1.5 rounded-full overflow-hidden" style={{ background: LINE }}>
              <div className="h-full transition-all" style={{ background: BLUE, width: `${(processing.done / Math.max(1, processing.total)) * 100}%` }} />
            </div>
          </>
        ) : (
          <>
            <ImagePlus className="w-10 h-10" style={{ color: BLUE }} />
            <div className="mt-4 text-[21px] font-medium" style={{ color: INK }}>
              {photos.length ? 'Agregar más fotos' : 'Elegí tus fotos'}
            </div>
            <div className="mt-1 text-[15px]" style={{ color: GREY }}>
              o arrastralas acá
            </div>
          </>
        )}
      </div>

      {photos.length > 0 && (
        <>
          <div className="mt-8 flex items-baseline justify-between">
            <div className="text-[19px] font-semibold" style={{ color: INK }}>
              {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
            {photos.map((p) => (
              <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md" style={{ background: SOFT }}>
                <img src={thumbSrc(p)} alt="" className="w-full h-full object-cover" draggable={false} />
                <button
                  type="button"
                  onClick={() => removePhotoFromList(p.id)}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white items-center justify-center hidden group-hover:flex"
                  aria-label="Quitar foto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="fixed bottom-0 left-0 right-0 border-t backdrop-blur-xl" style={{ background: 'rgba(253,252,249,.9)', borderColor: LINE }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="text-[15px]" style={{ color: GREY }}>
            {photos.length < minSheets ? `Necesitás al menos ${minSheets} fotos` : 'Listo. Armamos tu libro en un segundo.'}
          </div>
          {primary('Armar mi libro', goBuild, photos.length < minSheets || !!processing)}
        </div>
      </div>
    </div>
  );

  const onCover = current === COVER;
  const spread = onCover ? undefined : design.spreads[current];
  const pageNumber = pages.indexOf(current);
  const selectedCell = selected && spread ? spread.cells.find((c) => c.photoId === selected) : undefined;
  /** En qué hoja está cada foto (para el selector). */
  const pageOf = useMemo(() => {
    const m = new Map<string, number>();
    design.spreads.forEach((s, i) => s.photoIds.forEach((id) => m.set(id, i)));
    return m;
  }, [design.spreads]);

  /** Botón redondo de herramienta, grande y con ícono. */
  const pill = (label: string, onClick: () => void, icon?: React.ReactNode, active = false, color?: string) => (
    <button
      type="button"
      onClick={onClick}
      className="h-10 px-4 rounded-full text-[15px] font-medium inline-flex items-center gap-2 transition-colors hover:bg-[#EAE2D3]"
      style={{ background: active ? INK : SOFT, color: color || (active ? '#FDFCF9' : INK) }}
    >
      {icon}
      {label}
    </button>
  );

  const screenLibro = (
    <div className="flex flex-col h-full" onClick={() => (setSelected(null), setTool(null))}>
      <div className="text-center pt-4 sm:pt-5 px-4">
        <h1 className="font-semibold leading-tight" style={{ fontFamily: SERIF, fontSize: 'clamp(28px,3.4vw,38px)', color: INK }}>
          Así queda tu libro
        </h1>
        <p className="mt-1.5 text-[17px]" style={{ color: GREY }}>
          Pasá las páginas. Tocá una foto para encuadrarla, cambiarla, moverla o quitarla. Arrastrá una foto sobre otra para intercambiarlas.
        </p>
      </div>

      {/* página grande */}
      <div className="flex-1 min-h-0 flex items-center justify-center gap-2 sm:gap-6 px-2 sm:px-8 py-3">
        <button
          type="button"
          onClick={(e) => (e.stopPropagation(), go(-1))}
          disabled={pageNumber <= 0}
          className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-0 transition-opacity"
          style={{ background: SOFT, color: INK }}
          aria-label="Anterior"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div ref={stageRef} className="h-full w-full flex items-center justify-center min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: 0.18 }}
              className="relative"
              style={{
                ...(() => {
                  const a = onCover ? pageAspect : spreadAspect;
                  const w = Math.min(stage.w, stage.h * a);
                  return { width: w, height: w / a };
                })(),
                boxShadow: '0 30px 60px -25px rgba(0,0,0,.35), 0 8px 20px -8px rgba(0,0,0,.12)',
                borderRadius: 4,
              }}
            >
              {onCover ? renderCover() : spread && renderSpread(spread, current, true)}
            </motion.div>
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={(e) => (e.stopPropagation(), go(1))}
          disabled={pageNumber >= pages.length - 1}
          className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-0 transition-opacity"
          style={{ background: SOFT, color: INK }}
          aria-label="Siguiente"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* herramientas: pocas, grandes y claras; cambian según qué esté elegido */}
      <div className="min-h-12 flex flex-wrap items-center justify-center gap-2 px-4 py-1" onClick={(e) => e.stopPropagation()}>
        {onCover ? (
          <>
            <input
              value={design.cover.title}
              onChange={(e) => setDesign((d) => ({ ...d, cover: { ...d.cover, title: e.target.value.slice(0, 40) } }))}
              placeholder="Título de tapa (opcional)"
              className="h-10 w-56 sm:w-72 rounded-full px-4 text-[15px] outline-none focus:ring-2"
              style={{ background: SOFT, color: INK }}
            />
            {pill('Cambiar foto', () => setPicker({ kind: 'cover' }), <ImagePlus className="w-4 h-4" />)}
          </>
        ) : selected && spread && selectedCell ? (
          tool === 'encuadrar' ? (
            <>
              <span className="text-[15px]" style={{ color: GREY }}>Arrastrá la foto para encuadrarla</span>
              <label className="inline-flex items-center gap-2 text-[14px]" style={{ color: INK }}>
                <ZoomIn className="w-4 h-4" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={selectedCell.zoom}
                  onChange={(e) => updateCell(current, selected, { zoom: Number(e.target.value) })}
                  className="w-32 sm:w-44"
                  style={{ accentColor: BLUE }}
                  aria-label="Zoom"
                />
              </label>
              {pill('Centrar', () => updateCell(current, selected, { zoom: 1, panX: 0.5, panY: 0.5 }))}
              {pill('Listo', () => setTool(null), <Check className="w-4 h-4" />, true)}
            </>
          ) : tool === 'mover' ? (
            <>
              <span className="text-[15px]" style={{ color: GREY }}>Tocá la foto con la que la querés intercambiar</span>
              {pill('Cancelar', () => setTool(null))}
            </>
          ) : (
            <>
              {pill('Encuadrar', () => setTool('encuadrar'), <Crop className="w-4 h-4" />)}
              {pill('Cambiar foto', () => (setPicker({ kind: 'replace', spreadIndex: current, photoId: selected }), setPickSel([])), <Replace className="w-4 h-4" />)}
              {spread.photoIds.length > 1 && pill('Mover', () => setTool('mover'), <Move className="w-4 h-4" />)}
              {pill('Quitar', () => removeFromSpread(current, selected), <Trash2 className="w-4 h-4" />, false, '#d70015')}
              <button type="button" onClick={() => setSelected(null)} className="h-10 px-3 rounded-full text-[15px] font-medium" style={{ color: BLUE }}>
                Listo
              </button>
            </>
          )
        ) : spread ? (
          <>
            {pill('Otro diseño', () => otherDesign(current), <Shuffle className="w-4 h-4" />)}
            <span className="inline-flex items-center h-10 rounded-full px-1.5 gap-1" style={{ background: SOFT }} title="Cuántas fotos van en esta hoja">
              <button
                type="button"
                onClick={() => spread.photoIds.length > 1 && removeFromSpread(current, spread.photoIds[spread.photoIds.length - 1])}
                disabled={spread.photoIds.length <= 1 || !!spread.locked}
                className="w-8 h-8 rounded-full inline-flex items-center justify-center disabled:opacity-30 hover:bg-[#EAE2D3]"
                style={{ color: INK }}
                aria-label="Una foto menos"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-[15px] font-medium tabular-nums px-1" style={{ color: INK }}>
                {spread.photoIds.length} {spread.photoIds.length === 1 ? 'foto' : 'fotos'}
              </span>
              <button
                type="button"
                onClick={() => addNextUnused(current)}
                disabled={spread.photoIds.length >= MAX_PHOTOS_PER_PAGE * 2 || !!spread.locked}
                className="w-8 h-8 rounded-full inline-flex items-center justify-center disabled:opacity-30 hover:bg-[#EAE2D3]"
                style={{ color: INK }}
                aria-label="Una foto más"
              >
                <Plus className="w-4 h-4" />
              </button>
            </span>
            {pill('Márgenes', () => setShowMargins((v) => !v), <SlidersHorizontal className="w-4 h-4" />, showMargins)}
            {pill('Rearmar todo', rebuildAll, <Sparkles className="w-4 h-4" />)}
            <button
              type="button"
              onClick={() => setAdvanced(true)}
              className="h-10 px-3 rounded-full text-[15px] font-medium inline-flex items-center gap-2"
              style={{ color: BLUE }}
              title="Editor completo: bandeja de fotos, todos los diseños, textos, fondos, blanco y negro"
            >
              Editor completo
            </button>
          </>
        ) : null}
      </div>

      {/* márgenes y separación (para todo el libro) */}
      <AnimatePresence>
        {showMargins && !onCover && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mx-auto mb-1 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-2xl px-5 py-3"
            style={{ background: SOFT }}
            onClick={(e) => e.stopPropagation()}
          >
            <label className="inline-flex items-center gap-3 text-[14px]" style={{ color: INK }}>
              Separación
              <input type="range" min={0} max={12} value={design.spacing?.gutterMm ?? DEFAULT_SPACING.gutterMm} onChange={(e) => setSpacing({ gutterMm: Number(e.target.value) })} className="w-28" style={{ accentColor: BLUE }} />
              <span className="tabular-nums w-12" style={{ color: GREY }}>{design.spacing?.gutterMm ?? DEFAULT_SPACING.gutterMm} mm</span>
            </label>
            <label className="inline-flex items-center gap-3 text-[14px]" style={{ color: INK }}>
              Margen
              <input type="range" min={0} max={25} value={design.spacing?.marginMm ?? 0} onChange={(e) => setSpacing({ marginMm: Number(e.target.value) })} className="w-28" style={{ accentColor: BLUE }} />
              <span className="tabular-nums w-12" style={{ color: GREY }}>{design.spacing?.marginMm ?? 0} mm</span>
            </label>
            <button type="button" onClick={() => setSpacing({ ...DEFAULT_SPACING })} className="text-[13px] underline" style={{ color: GREY }}>
              Volver al estilo HALO
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* miniaturas */}
      <div className="px-4 sm:px-8 pt-3 pb-3 overflow-x-auto">
        <div className="flex gap-2.5 w-max mx-auto items-end">
          {pages.map((pg, i) => {
            const active = pg === current;
            const h = 46;
            return (
              <button
                key={pg === COVER ? 'cover' : design.spreads[pg].id}
                type="button"
                onClick={(e) => (e.stopPropagation(), setSelected(null), setTool(null), setCurrent(pg))}
                className="flex flex-col items-center gap-1"
                onDragOver={(e) => {
                  if (!dragId.current) return;
                  e.preventDefault();
                  if (dropTarget !== `pg-${pg}`) setDropTarget(`pg-${pg}`);
                }}
                onDragLeave={() => dropTarget === `pg-${pg}` && setDropTarget(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = readDragId(e);
                  endDrag();
                  if (!id) return;
                  if (pg === COVER) setDesign((d) => ({ ...d, cover: { ...d.cover, photoId: id, zoom: 1, panX: 0.5, panY: 0.5 } }));
                  else addToSpread(pg, [id]);
                }}
                title={pg === COVER ? 'Soltá una foto acá para usarla de tapa' : 'Soltá una foto acá para pasarla a esta hoja'}
              >
                <div
                  className="relative transition-all"
                  style={{
                    height: h,
                    width: h * (pg === COVER ? pageAspect : spreadAspect),
                    outline: active ? `2px solid ${BLUE}` : dropTarget === `pg-${pg}` ? `2px dashed ${BLUE}` : `1px solid ${LINE}`,
                    outlineOffset: active || dropTarget === `pg-${pg}` ? 2 : 0,
                    borderRadius: 2,
                    opacity: active ? 1 : 0.8,
                  }}
                >
                  {pg === COVER ? renderCover(true) : renderSpread(design.spreads[pg], pg, false, true)}
                </div>
                <span className="text-[11px]" style={{ color: active ? INK : GREY }}>
                  {pg === COVER ? 'Tapa' : `${i * 2 - 1}-${i * 2}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t" style={{ borderColor: LINE }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <div className="text-[20px] font-semibold tabular-nums" style={{ color: INK }}>{formatPriceARS(price)}</div>
            <div className="text-[13px]" style={{ color: GREY }}>
              {preset.name} · {sheets * 2} páginas · {usedPhotos.length} fotos
            </div>
          </div>
          {primary('Continuar', () => setStep('pedir'))}
        </div>
      </div>

      {/* selector de fotos: tapa, cambiar una foto o sumar fotos a la hoja */}
      <AnimatePresence>
        {picker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-10 bg-black/40 flex items-end sm:items-center justify-center"
            onClick={() => setPicker(null)}
          >
            <motion.div
              initial={{ y: 30 }}
              animate={{ y: 0 }}
              exit={{ y: 30 }}
              className="bg-white w-full sm:max-w-2xl max-h-[80vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 h-16 shrink-0">
                <div>
                  <div className="text-[19px] font-semibold" style={{ color: INK }}>
                    {picker.kind === 'cover' ? 'Elegí la foto de tapa' : picker.kind === 'replace' ? 'Elegí la foto nueva' : 'Sumá fotos a esta hoja'}
                  </div>
                  <div className="text-[13px]" style={{ color: GREY }}>
                    {picker.kind === 'add' ? 'Tocá las que quieras y después «Agregar».' : 'Las que ya están en el libro se ven más claras: si elegís una, se intercambian.'}
                  </div>
                </div>
                <button type="button" onClick={() => setPicker(null)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: SOFT }} aria-label="Cerrar">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* El scroll va en un contenedor aparte: si la grilla misma es la que se achica, con muchas fotos las filas se aplastan. */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {[...photos]
                  .sort((a, b) => Number(usedIds.has(a.id)) - Number(usedIds.has(b.id)))
                  .map((p) => {
                    const where = pageOf.get(p.id);
                    const used = picker.kind === 'cover' ? design.cover.photoId === p.id : where !== undefined;
                    const chosen = picker.kind === 'add' && pickSel.includes(p.id);
                    const isTarget = picker.kind === 'replace' && p.id === picker.photoId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isTarget}
                        onClick={() => {
                          if (picker.kind === 'cover') {
                            setDesign((d) => ({ ...d, cover: { ...d.cover, photoId: p.id, zoom: 1, panX: 0.5, panY: 0.5 } }));
                            setPicker(null);
                          } else if (picker.kind === 'replace') {
                            replaceInSpread(picker.spreadIndex, picker.photoId, p.id);
                            setPicker(null);
                          } else setPickSel((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]));
                        }}
                        className="relative aspect-square overflow-hidden rounded-md disabled:opacity-40"
                        style={{ outline: chosen || isTarget ? `3px solid ${BLUE}` : 'none', outlineOffset: -3 }}
                      >
                        <img src={thumbSrc(p)} alt="" loading="lazy" className="w-full h-full object-cover" draggable={false} style={{ opacity: used && !isTarget ? 0.45 : 1 }} />
                        {used && where !== undefined && !isTarget && (
                          <span className="absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(0,0,0,.6)', color: '#fff' }}>
                            pág. {where * 2 + 1}-{where * 2 + 2}
                          </span>
                        )}
                        {chosen && (
                          <span className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: BLUE }}>
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {isTarget && <span className="absolute inset-x-0 bottom-1 text-center text-[10px] font-medium text-white">actual</span>}
                      </button>
                    );
                  })}
              </div>
              </div>
              {picker.kind === 'add' && (
                <div className="shrink-0 px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: LINE }}>
                  <span className="text-[14px]" style={{ color: GREY }}>{pickSel.length ? `${pickSel.length} elegidas` : 'Ninguna elegida'}</span>
                  {primary(
                    `Agregar${pickSel.length ? ` ${pickSel.length}` : ''}`,
                    () => {
                      addToSpread(picker.spreadIndex, pickSel);
                      setPicker(null);
                    },
                    !pickSel.length
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const boxAvailable = design.coverType === 'blanda' && !!size?.boxPrice;
  const boxPrice = size?.boxPrice || 0;
  const screenPedir = (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
        <div className="flex justify-center">
          <div
            className="relative w-full max-w-[380px]"
            style={{ aspectRatio: `${pageAspect}`, boxShadow: '0 40px 70px -30px rgba(0,0,0,.45), 0 10px 24px -10px rgba(0,0,0,.15)', borderRadius: 4 }}
          >
            {renderCover()}
          </div>
        </div>

        <div>
          <h1 className="font-semibold leading-tight" style={{ fontFamily: SERIF, fontSize: 'clamp(34px,4vw,46px)', color: INK }}>
            Tu {preset.name}
          </h1>
          <div className="mt-1 text-[17px]" style={{ color: GREY }}>
            {size?.closedLabel} · {design.coverType === 'dura' ? 'Tapa dura' : 'Tapa blanda'} · {sheets * 2} páginas
          </div>

          <div className="mt-6">
            <div className="text-[17px] font-semibold" style={{ color: INK }}>Terminación de las fotos</div>
            <div className="mt-3 inline-flex p-1 rounded-full" style={{ background: SOFT }}>
              {(['brillo', 'mate'] as FotolibroLaminate[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setDesign((d) => ({ ...d, laminate: l }))}
                  className="h-9 px-6 rounded-full text-[16px] font-medium capitalize transition-all"
                  style={{
                    background: design.laminate === l ? '#fff' : 'transparent',
                    color: INK,
                    boxShadow: design.laminate === l ? '0 2px 8px rgba(0,0,0,.12)' : 'none',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {boxAvailable && (
            <button
              type="button"
              onClick={() => setDesign((d) => ({ ...d, giftBox: !d.giftBox }))}
              className="mt-5 w-full text-left rounded-2xl p-4 flex items-center gap-4 transition-all"
              style={{ background: SOFT, outline: design.giftBox ? `2px solid ${BLUE}` : 'none' }}
            >
              <Package className="w-8 h-8 shrink-0" style={{ color: INK }} />
              <div className="flex-1">
                <div className="text-[17px] font-semibold" style={{ color: INK }}>Sumá una caja de regalo</div>
                <div className="text-[15px]" style={{ color: GREY }}>Lo protege y llega listo para regalar · +{formatPriceARS(boxPrice)}</div>
              </div>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                style={{ background: design.giftBox ? BLUE : '#fff', border: design.giftBox ? 'none' : `1.5px solid ${LINE}` }}
              >
                {design.giftBox && <Check className="w-4 h-4 text-white" />}
              </div>
            </button>
          )}
          {design.coverType === 'dura' && (
            <div className="mt-6 text-[15px] inline-flex items-center gap-2" style={{ color: GREY }}>
              <Package className="w-5 h-5" /> Incluye caja de regalo
            </div>
          )}

          <div className="mt-6 pt-5 border-t flex items-baseline justify-between" style={{ borderColor: LINE }}>
            <span className="text-[17px]" style={{ color: INK }}>Total</span>
            <span className="text-[28px] font-semibold tabular-nums" style={{ color: INK }}>{formatPriceARS(price)}</span>
          </div>

          <div className="mt-5">
            {pendingUploads > 0 ? (
              <div className="w-full">
                {primary(
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Guardando tus fotos… {usedPhotos.length - pendingUploads}/{usedPhotos.length}
                  </>,
                  () => {},
                  true
                )}
              </div>
            ) : (
              <div className="[&>button]:w-full">{primary(isLoggedIn ? 'Agregar al carrito' : 'Ingresar y pedir', order, failedUploads > 0)}</div>
            )}
            {failedUploads > 0 && (
              <div className="mt-3 text-[15px]" style={{ color: '#d70015' }}>
                {failedUploads} fotos no se pudieron guardar.{' '}
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
              </div>
            )}
            {!isLoggedIn && (
              <div className="mt-3 text-[14px] text-center" style={{ color: GREY }}>
                Necesitamos tu cuenta para recibir las fotos en alta calidad.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // -------------------------------------------------------------------------

  const stepIndex = STEPS.indexOf(step);
  return (
    <div className="fixed inset-0 z-50 flex flex-col " style={{ fontFamily: FONT, color: INK, background: '#FDFCF9' }} role="dialog" aria-modal="true" aria-label="Pedir fotolibro">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      {/* barra superior */}
      <div className="h-14 shrink-0 flex items-center justify-between px-3 sm:px-5 border-b" style={{ borderColor: LINE }}>
        <button type="button" onClick={back} className="h-9 px-2 rounded-full inline-flex items-center gap-1 text-[15px]" style={{ color: BLUE }}>
          <ArrowLeft className="w-5 h-5" /> <span className="hidden sm:inline">{stepIndex === 0 ? 'Salir' : 'Atrás'}</span>
        </button>
        <div className="flex items-center gap-1.5 sm:gap-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 sm:gap-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold"
                  style={{ background: i <= stepIndex ? INK : SOFT, color: i <= stepIndex ? '#fff' : GREY }}
                >
                  {i < stepIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className="hidden md:inline text-[14px]" style={{ color: i === stepIndex ? INK : GREY, fontWeight: i === stepIndex ? 600 : 400 }}>
                  {STEP_LABEL[s]}
                </span>
              </div>
              {i < STEPS.length - 1 && <div className="w-4 sm:w-8 h-px" style={{ background: LINE }} />}
            </div>
          ))}
        </div>
        <button type="button" onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: SOFT }} aria-label="Cerrar">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className={`flex-1 min-h-0 ${step === 'libro' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {step === 'elegir' && screenElegir}
        {step === 'fotos' && screenFotos}
        {step === 'libro' && screenLibro}
        {step === 'pedir' && screenPedir}
      </div>

      {/* Editor completo (tipo SmartAlbums): se abre sobre este flujo y al volver trae los cambios */}
      {advanced && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: '#1C1C1E' }}><Loader2 className="w-7 h-7 animate-spin text-white/70" /></div>}>
          <SimpleAlbumEditor
            initialProject={buildProject()}
            onClose={() => setAdvanced(false)}
            onExit={(p) => {
              if (p.album) setDesign(p.album);
              setPhotos(p.photos);
              setCurrent((c) => (c === COVER ? COVER : Math.min(c, Math.max(0, (p.album?.spreads.length || 1) - 1))));
              setSelected(null);
              setAdvanced(false);
            }}
            onAddToCart={onAddToCart}
            onOpenAuth={onOpenAuth}
          />
        </Suspense>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 px-5 py-3 rounded-full text-[15px] text-white shadow-xl"
            style={{ background: 'rgba(29,29,31,.92)' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
