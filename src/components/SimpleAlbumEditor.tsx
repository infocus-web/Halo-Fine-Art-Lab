// Editor simple de fotolibros (reemplaza a PhotobookBuilder).
//
// Filosofía SmartAlbums: el sistema diseña, el cliente solo corrige.
//   1. Elegís medida y tapa.
//   2. Subís las fotos → el álbum se arma solo (mosaicos a sangre, separación
//      blanca fina, de 1 a 8 fotos por página).
//   3. Corregís: arrastrar fotos, "Cambiar diseño", encuadrar, quitar/agregar.
//   4. Confirmás laminado, caja y título → carrito.
//
// En celular el arrastre se reemplaza por tocar: tocás una foto de la bandeja
// (o de una página) y después tocás dónde querés ponerla.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Shuffle,
  Trash2,
  Undo2,
  Upload,
  X,
  AlertTriangle,
  Package,
  Move,
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
  LayoutPhoto,
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

type Step = 'start' | 'upload' | 'edit' | 'confirm';

/** Por debajo de esto avisamos que la foto puede verse borrosa impresa. */
const LOW_DPI = 150;
const COVER_INDEX = -1;

function photoAspect(p?: PhotoAsset): number {
  if (!p) return 1.5;
  if (p.width && p.height) return p.width / p.height;
  return p.aspectRatio || 1.5;
}

function displaySrc(p?: PhotoAsset): string {
  if (!p) return '';
  return p.hdDataUrl || p.url || p.thumbnailUrl || '';
}

function thumbSrc(p?: PhotoAsset): string {
  if (!p) return '';
  return p.thumbnailUrl || p.hdDataUrl || p.url || '';
}

function sortPhotos(list: PhotoAsset[]): PhotoAsset[] {
  return [...list].sort((a, b) => {
    const da = a.dateTaken || '';
    const db = b.dateTaken || '';
    if (da !== db) return da < db ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
  });
}

function emptyDesign(sizeId = '30x30', coverType: FotolibroCoverType = 'dura', finish: FotolibroFinish = 'foto-tapa-cuero'): AlbumDesign {
  return {
    version: 1,
    sizeId,
    coverType,
    finish,
    laminate: 'brillo',
    giftBox: false,
    cover: { zoom: 1, panX: 0.5, panY: 0.5, title: '' },
    spreads: [],
  };
}

// ---------------------------------------------------------------------------
// Celda con foto (usada en páginas y tapa)
// ---------------------------------------------------------------------------

interface PhotoFrameProps {
  photo?: PhotoAsset;
  frameAspect: number;
  zoom: number;
  panX: number;
  panY: number;
  src?: string;
}

const PhotoFrame: React.FC<PhotoFrameProps> = ({ photo, frameAspect, zoom, panX, panY, src }) => {
  if (!photo) return null;
  const place = placeImage(frameAspect, photoAspect(photo), zoom, panX, panY);
  return (
    <img
      src={src || displaySrc(photo)}
      alt=""
      draggable={false}
      className="absolute max-w-none select-none pointer-events-none"
      style={{
        width: `${place.width * 100}%`,
        height: `${place.height * 100}%`,
        left: `${place.left * 100}%`,
        top: `${place.top * 100}%`,
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export const SimpleAlbumEditor: React.FC<SimpleAlbumEditorProps> = ({ onClose, onAddToCart, initialProject, onOpenAuth }) => {
  const { user, profile, isLoggedIn } = useAuth();
  const userId = user?.id || profile?.id;

  const [projectId] = useState<string>(initialProject?.id || `proj-${Date.now()}`);
  const [createdAt] = useState<string>(initialProject?.createdAt || new Date().toISOString());
  const [design, setDesign] = useState<AlbumDesign>(() => initialProject?.album || emptyDesign());
  const [photos, setPhotos] = useState<PhotoAsset[]>(() => initialProject?.photos || []);
  const [step, setStep] = useState<Step>(() => (initialProject?.album?.spreads?.length ? 'edit' : 'start'));
  const [current, setCurrent] = useState<number>(0);
  const [selected, setSelected] = useState<{ spreadId: string; photoId: string } | null>(null);
  const [picked, setPicked] = useState<{ photoId: string; fromSpreadId?: string } | null>(null);
  const [history, setHistory] = useState<AlbumDesign[]>([]);
  const [processing, setProcessing] = useState<{ done: number; total: number } | null>(null);
  const [dragOverSpread, setDragOverSpread] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bloquear el scroll de la página de fondo mientras el editor está abierto.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const photoById = useMemo(() => {
    const m = new Map<string, PhotoAsset>();
    for (const p of photos) m.set(p.id, p);
    return m;
  }, [photos]);

  const size = getFotolibroSize(design.sizeId) || FOTOLIBRO_SIZES[0];
  const pageMm = pageSizeMm(design.sizeId);
  const spreadAspect = (pageMm.w * 2) / pageMm.h;
  const sheets = design.spreads.length;
  const minSheets = minSheetsFor(design.coverType);

  const usedIds = useMemo(() => {
    const s = new Set<string>();
    for (const sp of design.spreads) for (const id of sp.photoIds) s.add(id);
    return s;
  }, [design.spreads]);
  const unusedPhotos = photos.filter((p) => !usedIds.has(p.id));

  const price = useMemo(
    () =>
      priceFotolibro({
        sizeId: design.sizeId,
        coverType: design.coverType,
        finish: design.finish,
        sheets: Math.max(sheets, minSheets),
        giftBox: design.giftBox,
      }) ?? 0,
    [design.sizeId, design.coverType, design.finish, design.giftBox, sheets, minSheets]
  );

  const toLayoutPhotos = useCallback(
    (ids: string[]): LayoutPhoto[] => ids.filter((id) => photoById.has(id)).map((id) => ({ id, aspect: photoAspect(photoById.get(id)) })),
    [photoById]
  );

  const relayout = useCallback(
    (sp: AlbumSpread, sizeId: string, variant = sp.variant): AlbumSpread => {
      const lp = toLayoutPhotos(sp.photoIds);
      return { ...sp, photoIds: lp.map((p) => p.id), variant, cells: layoutSpread(lp, sizeId, variant, sp.cells) };
    },
    [toLayoutPhotos]
  );

  /** Cambia el diseño guardando el estado anterior para "Deshacer". */
  const commit = useCallback((updater: (d: AlbumDesign) => AlbumDesign) => {
    setDesign((prev) => {
      const next = updater(prev);
      if (next !== prev) setHistory((h) => [...h.slice(-29), prev]);
      return next;
    });
  }, []);

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setDesign(h[h.length - 1]);
      return h.slice(0, -1);
    });
    setSelected(null);
    setPicked(null);
  };

  // -------------------------------------------------------------------------
  // Fotos: subir, respaldar originales
  // -------------------------------------------------------------------------

  const handleFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (files.length === 0) return;
    setProcessing({ done: 0, total: files.length });
    try {
      const assets = await batchProcessPhotoFiles(files, { maxDimension: 380, quality: 0.8 }, (done, total) =>
        setProcessing({ done, total })
      );
      const withState: PhotoAsset[] = assets.map((a) => ({ ...a, uploadStatus: 'pending' as const }));
      const merged = sortPhotos([...photos, ...withState]);
      setPhotos(merged);
      if (step === 'upload' || design.spreads.length === 0) {
        // Primera carga: se arma el álbum completo solo.
        const lp = merged.map((p) => ({ id: p.id, aspect: photoAspect(p) }));
        const nSheets = suggestedSheets(lp.length, minSheetsFor(design.coverType));
        setDesign((d) => ({
          ...d,
          spreads: buildSpreads(lp, d.sizeId, nSheets),
          cover: { ...d.cover, photoId: d.cover.photoId || merged[0]?.id },
        }));
        setHistory([]);
        setCurrent(0);
        setStep('edit');
      } else {
        setNotice(`${withState.length} fotos nuevas en la bandeja. Arrastralas a una página o usá "Agregar las fotos sin usar".`);
      }
    } finally {
      setProcessing(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Respaldo de originales en alta resolución (solo con sesión iniciada).
  const uploadingRef = useRef(new Set<string>());
  const [uploadRetry, setUploadRetry] = useState(0);
  useEffect(() => {
    if (!isLoggedIn || !userId) return;
    const pending = photos.filter(
      (p) => (p.uploadStatus === 'pending' || p.uploadStatus === 'skipped' || !p.uploadStatus) && !p.storagePath && p.url?.startsWith('blob:') && !uploadingRef.current.has(p.id)
    );
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const p of pending) {
        if (cancelled) break;
        uploadingRef.current.add(p.id);
        setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, uploadStatus: 'uploading' } : x)));
        try {
          const blob = await fetch(p.url).then((r) => r.blob());
          const file = new File([blob], p.name || `${p.id}.jpg`, { type: blob.type || 'image/jpeg' });
          const { storagePath, error } = await uploadOriginalPhoto(userId, projectId, p.id, file);
          setPhotos((prev) =>
            prev.map((x) => (x.id === p.id ? { ...x, storagePath: storagePath || undefined, uploadStatus: error ? 'error' : 'uploaded' } : x))
          );
        } catch {
          setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, uploadStatus: 'error' } : x)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, userId, photos.length, uploadRetry]);

  // Sin sesión no se sube nada (se pide iniciar sesión al confirmar).
  const pendingUploads = isLoggedIn ? photos.filter((p) => p.uploadStatus === 'uploading' || p.uploadStatus === 'pending').length : 0;
  const failedUploads = isLoggedIn ? photos.filter((p) => p.uploadStatus === 'error' && usedIds.has(p.id)).length : 0;
  const retryUploads = () => {
    uploadingRef.current.clear();
    setPhotos((prev) => prev.map((p) => (p.uploadStatus === 'error' ? { ...p, uploadStatus: 'pending' } : p)));
    setUploadRetry((n) => n + 1);
  };

  // -------------------------------------------------------------------------
  // Guardado automático
  // -------------------------------------------------------------------------

  const buildProject = useCallback((): PhotobookProject => {
    const title = design.cover.title.trim() || 'Mi fotolibro';
    return {
      id: projectId,
      title,
      formatId: design.sizeId,
      // Campos heredados del editor anterior (los usan listados viejos).
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
    };
  }, [design, photos, projectId, createdAt]);

  useEffect(() => {
    if (step !== 'edit' && step !== 'confirm') return;
    if (photos.length === 0) return;
    const t = setTimeout(() => {
      saveUserProject(userId || 'local-user', buildProject(), price).catch((e) => console.warn('Guardado automático:', e));
    }, 1500);
    return () => clearTimeout(t);
  }, [design, photos, step, userId, price, buildProject]);

  // -------------------------------------------------------------------------
  // Operaciones sobre el álbum
  // -------------------------------------------------------------------------

  const findSpreadOf = (d: AlbumDesign, photoId: string) => d.spreads.findIndex((s) => s.photoIds.includes(photoId));

  /** Poner `photoId` en el lugar de `targetId` (intercambia si ya estaba en el álbum). */
  const placeOnPhoto = (targetSpreadId: string, targetId: string, photoId: string) => {
    if (targetId === photoId) return;
    commit((d) => {
      const spreads = d.spreads.map((s) => ({ ...s, photoIds: [...s.photoIds] }));
      const ti = spreads.findIndex((s) => s.id === targetSpreadId);
      if (ti < 0) return d;
      const tPos = spreads[ti].photoIds.indexOf(targetId);
      if (tPos < 0) return d;
      const si = spreads.findIndex((s) => s.photoIds.includes(photoId));
      if (si >= 0) {
        const sPos = spreads[si].photoIds.indexOf(photoId);
        spreads[si].photoIds[sPos] = targetId;
      }
      spreads[ti].photoIds[tPos] = photoId;
      const touched = new Set([ti, si]);
      return { ...d, spreads: spreads.map((s, i) => (touched.has(i) ? relayout(s, d.sizeId) : s)) };
    });
  };

  /** Agregar una foto a una doble página (la saca de donde estaba). */
  const addToSpread = (spreadId: string, photoId: string) => {
    commit((d) => {
      const ti = d.spreads.findIndex((s) => s.id === spreadId);
      if (ti < 0) return d;
      if (d.spreads[ti].photoIds.includes(photoId)) return d;
      if (d.spreads[ti].photoIds.length >= MAX_PHOTOS_PER_PAGE * 2) {
        setNotice(`Cada doble página admite hasta ${MAX_PHOTOS_PER_PAGE * 2} fotos (${MAX_PHOTOS_PER_PAGE} por página).`);
        return d;
      }
      const si = findSpreadOf(d, photoId);
      const spreads = d.spreads.map((s, i) => {
        if (i === ti) return relayout({ ...s, photoIds: [...s.photoIds, photoId] }, d.sizeId, 0);
        if (i === si) return relayout({ ...s, photoIds: s.photoIds.filter((id) => id !== photoId) }, d.sizeId, 0);
        return s;
      });
      return { ...d, spreads };
    });
  };

  const removeFromAlbum = (spreadId: string, photoId: string) => {
    commit((d) => ({
      ...d,
      spreads: d.spreads.map((s) => (s.id === spreadId ? relayout({ ...s, photoIds: s.photoIds.filter((id) => id !== photoId) }, d.sizeId, 0) : s)),
    }));
    setSelected(null);
  };

  const cycleLayout = (spreadId: string, dir = 1) => {
    commit((d) => ({
      ...d,
      spreads: d.spreads.map((s) => {
        if (s.id !== spreadId) return s;
        const n = countSpreadVariants(toLayoutPhotos(s.photoIds), d.sizeId);
        if (n <= 1) return s;
        return relayout(s, d.sizeId, (s.variant + dir + n) % n);
      }),
    }));
  };

  const addSpreadAfter = (index: number) => {
    if (sheets >= MAX_SHEETS) {
      setNotice(`El máximo es ${MAX_SHEETS} hojas.`);
      return;
    }
    commit((d) => {
      const spreads = [...d.spreads];
      spreads.splice(index + 1, 0, { id: newSpreadId(), photoIds: [], variant: 0, cells: [] });
      return { ...d, spreads };
    });
    setCurrent(index + 1);
  };

  const deleteSpread = (index: number) => {
    if (sheets <= minSheets) {
      setNotice(`Este fotolibro lleva como mínimo ${minSheets} hojas.`);
      return;
    }
    commit((d) => ({ ...d, spreads: d.spreads.filter((_, i) => i !== index) }));
    setCurrent((c) => Math.max(0, Math.min(c, sheets - 2)));
    setSelected(null);
  };

  const moveSpread = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= sheets) return;
    commit((d) => {
      const spreads = [...d.spreads];
      const [sp] = spreads.splice(index, 1);
      spreads.splice(to, 0, sp);
      return { ...d, spreads };
    });
    setCurrent(to);
  };

  /** Coloca las fotos sin usar en dobles páginas nuevas al final. */
  const appendUnused = () => {
    if (unusedPhotos.length === 0) return;
    const lp = unusedPhotos.map((p) => ({ id: p.id, aspect: photoAspect(p) }));
    const extraSheets = Math.max(1, Math.ceil(lp.length / 6));
    const room = MAX_SHEETS - sheets;
    if (room <= 0) {
      setNotice(`Ya llegaste al máximo de ${MAX_SHEETS} hojas.`);
      return;
    }
    commit((d) => {
      // Primero se llenan las dobles páginas vacías.
      const spreads = [...d.spreads];
      let rest = [...lp];
      for (let i = 0; i < spreads.length && rest.length > 0; i++) {
        if (spreads[i].photoIds.length === 0) {
          const take = rest.splice(0, 6);
          spreads[i] = relayout({ ...spreads[i], photoIds: take.map((p) => p.id) }, d.sizeId, 0);
        }
      }
      if (rest.length > 0) {
        const n = Math.min(room, Math.max(1, Math.ceil(rest.length / 6)), extraSheets);
        spreads.push(...buildSpreads(rest, d.sizeId, Math.max(n, Math.ceil(rest.length / (MAX_PHOTOS_PER_PAGE * 2)))));
      }
      return { ...d, spreads: spreads.slice(0, MAX_SHEETS) };
    });
  };

  /** Vuelve a armar todo el álbum desde cero con todas las fotos. */
  const rebuildAll = () => {
    if (!window.confirm('¿Volver a armar todo el álbum automáticamente? Se pierden los cambios que hiciste a mano (podés deshacerlo).')) return;
    const lp = sortPhotos(photos).map((p) => ({ id: p.id, aspect: photoAspect(p) }));
    commit((d) => ({ ...d, spreads: buildSpreads(lp, d.sizeId, suggestedSheets(lp.length, minSheetsFor(d.coverType))) }));
    setCurrent(0);
  };

  const updateCell = (spreadId: string, photoId: string, patch: Partial<AlbumCell>) => {
    setDesign((d) => ({
      ...d,
      spreads: d.spreads.map((s) =>
        s.id === spreadId ? { ...s, cells: s.cells.map((c) => (c.photoId === photoId ? { ...c, ...patch } : c)) } : s
      ),
    }));
  };

  const setCoverPhoto = (photoId: string) => {
    commit((d) => ({ ...d, cover: { ...d.cover, photoId, zoom: 1, panX: 0.5, panY: 0.5 } }));
  };

  // -------------------------------------------------------------------------
  // Interacción: arrastrar (desktop) y tocar (celular)
  // -------------------------------------------------------------------------

  const DRAG_TYPE = 'application/x-halo-photo';

  const onDragStartPhoto = (e: React.DragEvent, photoId: string, fromSpreadId?: string) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ photoId, fromSpreadId }));
    e.dataTransfer.setData('text/plain', photoId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const readDrag = (e: React.DragEvent): { photoId: string; fromSpreadId?: string } | null => {
    try {
      const raw = e.dataTransfer.getData(DRAG_TYPE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const handleCellTap = (spreadId: string, photoId: string) => {
    if (picked) {
      if (picked.photoId !== photoId) placeOnPhoto(spreadId, photoId, picked.photoId);
      setPicked(null);
      setSelected(null);
      return;
    }
    if (selected && selected.spreadId === spreadId && selected.photoId === photoId) return;
    setSelected({ spreadId, photoId });
  };

  // -------------------------------------------------------------------------
  // Render: pasos
  // -------------------------------------------------------------------------

  const steps: { id: Step; label: string }[] = [
    { id: 'start', label: 'Medida' },
    { id: 'upload', label: 'Fotos' },
    { id: 'edit', label: 'Diseño' },
    { id: 'confirm', label: 'Confirmar' },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  const header = (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 border-b border-[#E6DFD2] bg-[#FDFCF9] shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <BookOpen className="w-5 h-5 text-[#8C6D37] shrink-0" />
        <span className="font-serif-luxury text-lg sm:text-xl text-[#1F1C18] truncate">Tu fotolibro</span>
      </div>
      <ol className="hidden md:flex items-center gap-1 text-xs">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1">
            <span
              className={`px-2.5 py-1 rounded-full ${
                i === stepIndex ? 'bg-[#1F1C18] text-white' : i < stepIndex ? 'text-[#1F1C18]' : 'text-[#A39A8B]'
              }`}
            >
              {i + 1}. {s.label}
            </span>
            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-[#C9C0B0]" />}
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        {(step === 'edit' || step === 'confirm') && (
          <span className="text-sm font-semibold text-[#1F1C18] tabular-nums">{formatPriceARS(price)}</span>
        )}
        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-[#F1ECE2]" aria-label="Cerrar editor">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  // --- Paso 1: medida y tapa ------------------------------------------------
  const renderStart = () => (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h2 className="font-serif-luxury text-3xl sm:text-4xl text-[#1F1C18]">Elegí la medida</h2>
        <p className="text-sm text-[#6B6255] mt-2">Hojas rígidas que se abren planas. Podés cambiar la cantidad de hojas después.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
          {FOTOLIBRO_SIZES.map((s) => {
            const active = s.id === design.sizeId;
            const ratio = s.pageWidthCm / s.pageHeightCm;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setDesign((d) => ({ ...d, sizeId: s.id }))}
                className={`relative text-left rounded-xl border p-3 transition-colors ${
                  active ? 'border-[#1F1C18] bg-white ring-1 ring-[#1F1C18]' : 'border-[#E6DFD2] bg-white/60 hover:border-[#B9AE9B]'
                }`}
              >
                {s.popular && (
                  <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wider bg-[#C5A059] text-white px-1.5 py-0.5 rounded">Más vendido</span>
                )}
                <div className="h-16 flex items-end mb-3">
                  <div className="flex shadow-sm" style={{ height: ratio >= 1 ? 40 / ratio : 56, }}>
                    <div className="bg-[#D8CFBF] border-r border-white" style={{ width: (ratio >= 1 ? 40 / ratio : 56) * ratio }} />
                    <div className="bg-[#CFC5B3]" style={{ width: (ratio >= 1 ? 40 / ratio : 56) * ratio }} />
                  </div>
                </div>
                <div className="text-sm font-semibold text-[#1F1C18]">{s.closedLabel}</div>
                <div className="text-xs text-[#857B6C]">abierto {s.openLabel}</div>
                <div className="text-xs text-[#1F1C18] mt-1">desde {formatPriceARS(s.blanda.sheets7)}</div>
              </button>
            );
          })}
        </div>

        <h2 className="font-serif-luxury text-3xl sm:text-4xl text-[#1F1C18] mt-10">Elegí la tapa</h2>
        <div className="grid sm:grid-cols-3 gap-3 mt-6">
          {COVER_OPTIONS.map((o) => {
            const active = o.type === design.coverType && o.finish === design.finish;
            const p = o.type === 'dura' ? size.dura.price : size.blanda.sheets7;
            return (
              <button
                key={`${o.type}-${o.finish}`}
                type="button"
                onClick={() => setDesign((d) => ({ ...d, coverType: o.type, finish: o.finish }))}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  active ? 'border-[#1F1C18] bg-white ring-1 ring-[#1F1C18]' : 'border-[#E6DFD2] bg-white/60 hover:border-[#B9AE9B]'
                }`}
              >
                <div className="flex h-14 mb-3 rounded overflow-hidden w-28 shadow-sm">
                  {o.finish === 'foto-tapa-cuero' ? (
                    <>
                      <div className="w-1/2 bg-[#141414] leather-texture" />
                      <div className="w-1/2 bg-gradient-to-br from-[#C9B79A] to-[#7D6A50]" />
                    </>
                  ) : (
                    <div className="w-full bg-gradient-to-r from-[#7D6A50] via-[#C9B79A] to-[#7D6A50]" />
                  )}
                </div>
                <div className="text-sm font-semibold text-[#1F1C18]">{o.name}</div>
                <div className="text-xs text-[#6B6255] mt-1 leading-relaxed">{o.description}</div>
                <div className="text-xs text-[#1F1C18] mt-2">
                  {o.type === 'dura' ? `${formatPriceARS(p)} · 10 hojas` : `desde ${formatPriceARS(p)} · 7 hojas`}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end mt-10">
          <button
            type="button"
            onClick={() => {
              if (photos.length > 0 && design.spreads.length === 0) {
                // Proyecto viejo con fotos: se arma directamente.
                const lp = sortPhotos(photos).map((p) => ({ id: p.id, aspect: photoAspect(p) }));
                setDesign((d) => ({
                  ...d,
                  spreads: buildSpreads(lp, d.sizeId, suggestedSheets(lp.length, minSheetsFor(d.coverType))),
                  cover: { ...d.cover, photoId: d.cover.photoId || lp[0]?.id },
                }));
                setStep('edit');
              } else if (design.spreads.length > 0) {
                // Cambió la medida: se rediagraman las mismas páginas.
                setDesign((d) => ({ ...d, spreads: d.spreads.map((s) => relayout(s, d.sizeId, 0)) }));
                setStep('edit');
              } else {
                setStep('upload');
              }
            }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#1F1C18] text-white text-sm font-semibold hover:bg-[#3D352E]"
          >
            Continuar <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  // --- Paso 2: subir fotos -------------------------------------------------
  const renderUpload = () => (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <h2 className="font-serif-luxury text-3xl sm:text-4xl text-[#1F1C18]">Subí tus fotos</h2>
        <p className="text-sm text-[#6B6255] mt-2">
          Elegí todas las fotos que quieras en el álbum. Las ordenamos por fecha y armamos el diseño por vos; después lo podés corregir.
        </p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
          className="mt-8 rounded-2xl border-2 border-dashed border-[#CFC5B3] bg-white/70 flex flex-col items-center justify-center text-center px-6 py-16"
        >
          {processing ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-[#8C6D37]" />
              <p className="mt-4 text-sm text-[#1F1C18]">
                Preparando fotos… {processing.done} de {processing.total}
              </p>
              <div className="w-64 h-1.5 bg-[#EFE9DE] rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-[#1F1C18] transition-all" style={{ width: `${(processing.done / Math.max(1, processing.total)) * 100}%` }} />
              </div>
            </>
          ) : (
            <>
              <Upload className="w-9 h-9 text-[#8C6D37]" />
              <p className="mt-4 text-base text-[#1F1C18]">Arrastrá tus fotos acá</p>
              <p className="text-xs text-[#857B6C] mt-1">o</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 px-6 py-3 rounded-full bg-[#1F1C18] text-white text-sm font-semibold hover:bg-[#3D352E]"
              >
                Elegir fotos
              </button>
              <p className="text-xs text-[#857B6C] mt-4">
                Ideal: entre {minSheets * 4} y {minSheets * 12} fotos para {minSheets} hojas (se agregan hojas si subís más).
              </p>
            </>
          )}
        </div>
        <div className="flex justify-between mt-8">
          <button type="button" onClick={() => setStep('start')} className="inline-flex items-center gap-2 text-sm text-[#6B6255] hover:text-[#1F1C18]">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
        </div>
      </div>
    </div>
  );

  // --- Doble página --------------------------------------------------------
  const renderSpread = (sp: AlbumSpread, interactive: boolean) => {
    const dropProps = interactive
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (e.dataTransfer.types.includes(DRAG_TYPE)) {
              e.preventDefault();
              setDragOverSpread(sp.id);
            }
          },
          onDragLeave: () => setDragOverSpread((v) => (v === sp.id ? null : v)),
        }
      : {};
    return (
      <div
        className="relative w-full bg-white shadow-[0_10px_40px_-12px_rgba(31,28,24,0.35)]"
        style={{ aspectRatio: `${spreadAspect}` }}
        {...dropProps}
      >
        {sp.cells.map((c) => {
          const photo = photoById.get(c.photoId);
          const cellAspect = (c.w * spreadAspect) / c.h;
          const isSel = interactive && selected?.spreadId === sp.id && selected.photoId === c.photoId;
          const isPicked = interactive && picked?.photoId === c.photoId;
          const dpi = effectiveDpi(c, design.sizeId, photo?.width, photo?.height);
          return (
            <div
              key={c.photoId}
              className={`absolute overflow-hidden bg-[#EFE9DE] ${interactive ? 'cursor-pointer' : ''} ${
                isSel ? 'ring-2 ring-[#C5A059] ring-inset z-10' : ''
              } ${isPicked ? 'opacity-50' : ''}`}
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }}
              draggable={interactive && !isSel}
              onDragStart={interactive ? (e) => onDragStartPhoto(e, c.photoId, sp.id) : undefined}
              onDragOver={interactive ? (e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault() : undefined}
              onDrop={
                interactive
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverSpread(null);
                      const data = readDrag(e);
                      if (data) placeOnPhoto(sp.id, c.photoId, data.photoId);
                    }
                  : undefined
              }
              onClick={interactive ? () => handleCellTap(sp.id, c.photoId) : undefined}
              onPointerDown={isSel ? (e) => startPan(e, sp.id, c, cellAspect) : undefined}
            >
              <PhotoFrame photo={photo} frameAspect={cellAspect} zoom={c.zoom} panX={c.panX} panY={c.panY} src={interactive ? undefined : thumbSrc(photo)} />
              {interactive && dpi !== null && dpi < LOW_DPI && (
                <span
                  className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-amber-500/95 text-white text-[10px] px-1.5 py-0.5"
                  title={`Esta foto queda a unos ${Math.round(dpi)} DPI: puede verse borrosa impresa. Probá ponerla más chica.`}
                >
                  <AlertTriangle className="w-3 h-3" /> <span className="hidden sm:inline">Baja resolución</span>
                </span>
              )}
              {isSel && (
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-black/60 text-white text-[10px] px-2 py-0.5 pointer-events-none whitespace-nowrap">
                  <Move className="w-3 h-3" /> Arrastrá para encuadrar
                </span>
              )}
            </div>
          );
        })}
        {sp.photoIds.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-sm text-[#A39A8B] border-2 border-dashed border-[#E6DFD2]">
            {interactive ? 'Página vacía: arrastrá o tocá fotos de la bandeja para agregarlas' : ''}
          </div>
        )}
        {/* pliegue central */}
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/10 pointer-events-none" />
        {interactive && dragOverSpread === sp.id && (
          <div
            className="absolute inset-x-0 -top-11 h-10 rounded-lg bg-[#1F1C18] text-white text-xs flex items-center justify-center gap-2 z-20"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverSpread(null);
              const data = readDrag(e);
              if (data) addToSpread(sp.id, data.photoId);
            }}
          >
            <Plus className="w-4 h-4" /> Soltá acá para agregarla a esta doble página
          </div>
        )}
      </div>
    );
  };

  // Encuadre arrastrando dentro del marco seleccionado.
  const panState = useRef<{ startX: number; startY: number; panX: number; panY: number; rectW: number; rectH: number; place: ReturnType<typeof placeImage> } | null>(null);
  const startPan = (e: React.PointerEvent, spreadId: string, cell: AlbumCell, cellAspect: number) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const photo = photoById.get(cell.photoId);
    panState.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: cell.panX,
      panY: cell.panY,
      rectW: rect.width,
      rectH: rect.height,
      place: placeImage(cellAspect, photoAspect(photo), cell.zoom, cell.panX, cell.panY),
    };
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const st = panState.current;
      if (!st) return;
      const dx = (ev.clientX - st.startX) / st.rectW;
      const dy = (ev.clientY - st.startY) / st.rectH;
      const spanX = 1 - st.place.width;
      const spanY = 1 - st.place.height;
      const panX = spanX < -0.0001 ? Math.min(1, Math.max(0, st.panX + dx / spanX)) : 0.5;
      const panY = spanY < -0.0001 ? Math.min(1, Math.max(0, st.panY + dy / spanY)) : 0.5;
      updateCell(spreadId, cell.photoId, { panX, panY });
    };
    const up = () => {
      panState.current = null;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // --- Tapa ----------------------------------------------------------------
  const renderCover = (interactive: boolean) => {
    const photo = design.cover.photoId ? photoById.get(design.cover.photoId) : undefined;
    const leather = design.finish === 'foto-tapa-cuero';
    const frameAspect = leather ? spreadAspect / 2 : spreadAspect;
    const title = design.cover.title.trim();
    return (
      <div
        className="relative w-full flex shadow-[0_10px_40px_-12px_rgba(31,28,24,0.35)] overflow-hidden rounded-[3px]"
        style={{ aspectRatio: `${spreadAspect}`, containerType: 'inline-size' }}
        onDragOver={interactive ? (e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault() : undefined}
        onDrop={
          interactive
            ? (e) => {
                e.preventDefault();
                const data = readDrag(e);
                if (data) setCoverPhoto(data.photoId);
              }
            : undefined
        }
        onClick={
          interactive && picked
            ? () => {
                setCoverPhoto(picked.photoId);
                setPicked(null);
              }
            : undefined
        }
      >
        {leather && (
          <div className="relative w-1/2 h-full bg-[#121212] leather-texture">
            {interactive && <span className="absolute bottom-3 left-3 text-[10px] uppercase tracking-widest text-white/40">Contratapa · cuero negro</span>}
          </div>
        )}
        <div
          className={`relative h-full overflow-hidden bg-[#EFE9DE] ${leather ? 'w-1/2' : 'w-full'}`}
          onPointerDown={
            interactive && photo
              ? (e) => {
                  const el = e.currentTarget as HTMLElement;
                  const rect = el.getBoundingClientRect();
                  const place = placeImage(frameAspect, photoAspect(photo), design.cover.zoom, design.cover.panX, design.cover.panY);
                  const sx = e.clientX;
                  const sy = e.clientY;
                  const p0 = { x: design.cover.panX, y: design.cover.panY };
                  el.setPointerCapture(e.pointerId);
                  const move = (ev: PointerEvent) => {
                    const dx = (ev.clientX - sx) / rect.width;
                    const dy = (ev.clientY - sy) / rect.height;
                    const spanX = 1 - place.width;
                    const spanY = 1 - place.height;
                    setDesign((d) => ({
                      ...d,
                      cover: {
                        ...d.cover,
                        panX: spanX < -0.0001 ? Math.min(1, Math.max(0, p0.x + dx / spanX)) : 0.5,
                        panY: spanY < -0.0001 ? Math.min(1, Math.max(0, p0.y + dy / spanY)) : 0.5,
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
        >
          {photo ? (
            <PhotoFrame
              photo={photo}
              frameAspect={frameAspect}
              zoom={design.cover.zoom}
              panX={design.cover.panX}
              panY={design.cover.panY}
              src={interactive ? undefined : thumbSrc(photo)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[#A39A8B] text-center px-6">
              {interactive ? 'Arrastrá o tocá una foto para la tapa' : ''}
            </div>
          )}
          {title && (
            <div
              className="absolute pointer-events-none text-white"
              style={{
                fontFamily: "'Great Vibes', cursive",
                // Proporcional al ancho de la tapa abierta (igual en pantalla e impresión).
                fontSize: '5cqw',
                left: leather ? '8%' : '54%',
                bottom: '8%',
                textShadow: '0 1px 6px rgba(0,0,0,0.45)',
                lineHeight: 1,
              }}
            >
              {title}
            </div>
          )}
        </div>
        {!leather && <div className="absolute inset-y-0 left-1/2 w-px bg-white/30 pointer-events-none" />}
        {!leather && interactive && (
          <>
            <span className="absolute top-2 left-3 text-[10px] uppercase tracking-widest text-white/80 drop-shadow">Contratapa</span>
            <span className="absolute top-2 left-[calc(50%+12px)] text-[10px] uppercase tracking-widest text-white/80 drop-shadow">Tapa</span>
          </>
        )}
      </div>
    );
  };

  // --- Paso 3: editor -------------------------------------------------------
  const currentSpread = current >= 0 ? design.spreads[current] : undefined;
  const selectedCell = selected ? design.spreads.find((s) => s.id === selected.spreadId)?.cells.find((c) => c.photoId === selected.photoId) : undefined;

  const goTo = (i: number) => {
    setCurrent(Math.max(COVER_INDEX, Math.min(sheets - 1, i)));
    setSelected(null);
  };

  useEffect(() => {
    if (step !== 'edit') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') goTo(current + 1);
      if (e.key === 'ArrowLeft') goTo(current - 1);
      if (e.key === 'Escape') {
        setSelected(null);
        setPicked(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) removeFromAlbum(selected.spreadId, selected.photoId);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const renderEditor = () => (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      {/* Área principal */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Barra de acciones */}
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2.5 border-b border-[#E6DFD2] bg-[#FDFCF9]">
          <span className="text-sm font-semibold text-[#1F1C18] mr-2 min-w-[7rem]">
            {current === COVER_INDEX ? 'Tapa' : `Doble página ${current + 1} de ${sheets}`}
          </span>
          {currentSpread && (
            <>
              <ToolbarButton
                onClick={() => cycleLayout(currentSpread.id)}
                disabled={currentSpread.photoIds.length < 2}
                icon={<Shuffle className="w-4 h-4" />}
                label="Cambiar diseño"
                primary
              />
              <ToolbarButton onClick={() => addSpreadAfter(current)} icon={<Plus className="w-4 h-4" />} label="Agregar hoja" />
              <ToolbarButton onClick={() => deleteSpread(current)} disabled={sheets <= minSheets} icon={<Minus className="w-4 h-4" />} label="Quitar hoja" />
              <ToolbarButton onClick={() => moveSpread(current, -1)} disabled={current === 0} icon={<ChevronLeft className="w-4 h-4" />} label="Mover" compact />
              <ToolbarButton onClick={() => moveSpread(current, 1)} disabled={current >= sheets - 1} icon={<ChevronRight className="w-4 h-4" />} label="Mover" compact />
            </>
          )}
          <div className="flex-1" />
          <ToolbarButton onClick={undo} disabled={history.length === 0} icon={<Undo2 className="w-4 h-4" />} label="Deshacer" />
          <ToolbarButton onClick={rebuildAll} icon={<RefreshCw className="w-4 h-4" />} label="Rearmar todo" />
        </div>

        {/* Vista grande */}
        <div
          className="relative flex-1 min-h-[260px] bg-[#F1ECE2] flex items-center justify-center px-10 sm:px-16 py-12 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelected(null);
            }
          }}
        >
          <button
            type="button"
            onClick={() => goTo(current - 1)}
            disabled={current <= COVER_INDEX}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white shadow hover:bg-[#FDFCF9] disabled:opacity-30"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-full" style={{ maxWidth: `min(100%, calc((100vh - 21rem) * ${spreadAspect}))` }}>
            {current === COVER_INDEX ? renderCover(true) : currentSpread ? renderSpread(currentSpread, true) : null}
          </div>
          <button
            type="button"
            onClick={() => goTo(current + 1)}
            disabled={current >= sheets - 1}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white shadow hover:bg-[#FDFCF9] disabled:opacity-30"
            aria-label="Siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Controles de la foto seleccionada */}
          {selected && selectedCell && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white rounded-full shadow-lg px-4 py-2 z-30">
              <span className="text-xs text-[#6B6255] hidden sm:inline">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={selectedCell.zoom}
                onChange={(e) => updateCell(selected.spreadId, selected.photoId, { zoom: Number(e.target.value) })}
                className="w-28 accent-[#1F1C18]"
                aria-label="Zoom de la foto"
              />
              <button
                type="button"
                onClick={() => setPicked({ photoId: selected.photoId, fromSpreadId: selected.spreadId })}
                className="text-xs px-2.5 py-1 rounded-full hover:bg-[#F1ECE2]"
                title="Tocá después otra foto para intercambiarlas, o una página para moverla"
              >
                Mover
              </button>
              <button
                type="button"
                onClick={() => removeFromAlbum(selected.spreadId, selected.photoId)}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Quitar
              </button>
              <button type="button" onClick={() => setSelected(null)} className="text-xs px-2.5 py-1 rounded-full bg-[#1F1C18] text-white">
                Listo
              </button>
            </div>
          )}
          {current === COVER_INDEX && design.cover.photoId && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white rounded-full shadow-lg px-4 py-2 z-30">
              <span className="text-xs text-[#6B6255]">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={design.cover.zoom}
                onChange={(e) => setDesign((d) => ({ ...d, cover: { ...d.cover, zoom: Number(e.target.value) } }))}
                className="w-28 accent-[#1F1C18]"
                aria-label="Zoom de la tapa"
              />
            </div>
          )}

          {picked && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#1F1C18] text-white rounded-full px-4 py-2 text-xs z-30 shadow-lg">
              <span>Tocá una foto para intercambiarla</span>
              {currentSpread && !currentSpread.photoIds.includes(picked.photoId) && (
                <button
                  type="button"
                  onClick={() => {
                    addToSpread(currentSpread.id, picked.photoId);
                    setPicked(null);
                    setSelected(null);
                  }}
                  className="px-2.5 py-1 rounded-full bg-white text-[#1F1C18] font-semibold"
                >
                  + Agregar a esta doble página
                </button>
              )}
              <button type="button" onClick={() => setPicked(null)} className="p-1 rounded-full hover:bg-white/10" aria-label="Cancelar">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {notice && (
            <div className="absolute top-3 right-3 max-w-xs bg-white text-[#1F1C18] rounded-lg shadow-lg px-3 py-2 text-xs z-30">{notice}</div>
          )}
        </div>

        {current === COVER_INDEX && (
          <div className="px-4 sm:px-6 py-3 border-t border-[#E6DFD2] bg-[#FDFCF9] flex flex-wrap items-center gap-3">
            <label htmlFor="cover-title" className="text-sm text-[#1F1C18]">
              Título de tapa
            </label>
            <input
              id="cover-title"
              value={design.cover.title}
              maxLength={40}
              onChange={(e) => setDesign((d) => ({ ...d, cover: { ...d.cover, title: e.target.value } }))}
              placeholder="Ej.: Sofía & Martín · 2026 (opcional)"
              className="flex-1 min-w-[12rem] max-w-md rounded-lg border border-[#E6DFD2] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F1C18]"
            />
            <span className="text-xs text-[#857B6C]">Arrastrá una foto de la bandeja sobre la tapa para cambiarla.</span>
          </div>
        )}

        {/* Tira de páginas */}
        <div className="shrink-0 border-t border-[#E6DFD2] bg-[#FDFCF9] px-3 py-3 overflow-x-auto">
          <div className="flex gap-3 w-max">
            <ThumbButton active={current === COVER_INDEX} label="Tapa" onClick={() => goTo(COVER_INDEX)} width={(spreadAspect * 44)}>
              {renderCover(false)}
            </ThumbButton>
            {design.spreads.map((sp, i) => (
              <ThumbButton
                key={sp.id}
                active={current === i}
                label={`${i * 2 + 1}-${i * 2 + 2}`}
                onClick={() => goTo(i)}
                width={spreadAspect * 44}
                onDropPhoto={(e) => {
                  const data = readDrag(e);
                  if (data) addToSpread(sp.id, data.photoId);
                }}
              >
                {renderSpread(sp, false)}
              </ThumbButton>
            ))}
            <button
              type="button"
              onClick={() => addSpreadAfter(sheets - 1)}
              disabled={sheets >= MAX_SHEETS}
              className="shrink-0 h-[44px] mt-0 px-3 rounded border border-dashed border-[#CFC5B3] text-xs text-[#6B6255] hover:border-[#1F1C18] disabled:opacity-40"
              style={{ width: spreadAspect * 44 }}
            >
              + Hoja
            </button>
          </div>
        </div>
      </div>

      {/* Bandeja de fotos */}
      <aside className="lg:w-72 xl:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-[#E6DFD2] bg-white flex flex-col min-h-0 max-h-[36vh] lg:max-h-none">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-[#1F1C18]">Tus fotos</div>
            <div className="text-xs text-[#857B6C]">
              {photos.length} en total · {unusedPhotos.length} sin usar
            </div>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#E6DFD2] hover:border-[#1F1C18]"
          >
            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {processing ? `${processing.done}/${processing.total}` : 'Subir más'}
          </button>
        </div>
        {unusedPhotos.length > 0 && (
          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={appendUnused}
              className="w-full text-xs px-3 py-2 rounded-lg bg-[#F1ECE2] text-[#1F1C18] hover:bg-[#E9E1D2]"
            >
              Agregar las {unusedPhotos.length} fotos sin usar al álbum
            </button>
          </div>
        )}
        {!isLoggedIn && (
          <div className="mx-4 mb-2 rounded-lg bg-[#FBF6EA] border border-[#EADBB5] px-3 py-2 text-xs text-[#6B5527]">
            Iniciá sesión para guardar tus fotos originales en alta calidad y no perder el proyecto.
            {onOpenAuth && (
              <button type="button" onClick={onOpenAuth} className="ml-1 underline font-semibold">
                Iniciar sesión
              </button>
            )}
          </div>
        )}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-4 pb-4"
          onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault()}
          onDrop={(e) => {
            // Soltar una foto de una página en la bandeja = quitarla del álbum.
            const data = readDrag(e);
            if (data?.fromSpreadId) removeFromAlbum(data.fromSpreadId, data.photoId);
          }}
        >
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-3 gap-1.5">
            {[...unusedPhotos, ...photos.filter((p) => usedIds.has(p.id))].map((p) => {
              const used = usedIds.has(p.id);
              const isPicked = picked?.photoId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  draggable
                  onDragStart={(e) => onDragStartPhoto(e, p.id)}
                  onClick={() => {
                    if (current === COVER_INDEX) {
                      setCoverPhoto(p.id);
                      return;
                    }
                    setSelected(null);
                    setPicked(isPicked ? null : { photoId: p.id });
                  }}
                  className={`relative aspect-square overflow-hidden rounded bg-[#EFE9DE] ${isPicked ? 'ring-2 ring-[#C5A059]' : ''}`}
                  title={p.name}
                >
                  <img src={thumbSrc(p)} alt={p.name} className={`w-full h-full object-cover ${used ? 'opacity-45' : ''}`} draggable={false} />
                  {used && (
                    <span className="absolute bottom-0.5 right-0.5 bg-white/90 rounded-full p-0.5">
                      <Check className="w-2.5 h-2.5 text-[#1F1C18]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-4 border-t border-[#E6DFD2]">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setPicked(null);
              setStep('confirm');
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#1F1C18] text-white text-sm font-semibold hover:bg-[#3D352E]"
          >
            Terminé el diseño <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </div>
  );

  // --- Paso 4: confirmar ----------------------------------------------------
  const lowResCount = design.spreads.reduce(
    (acc, sp) =>
      acc +
      sp.cells.filter((c) => {
        const p = photoById.get(c.photoId);
        const dpi = effectiveDpi(c, design.sizeId, p?.width, p?.height);
        return dpi !== null && dpi < LOW_DPI;
      }).length,
    0
  );
  const emptySpreads = design.spreads.filter((s) => s.photoIds.length === 0).length;
  const billedSheets = Math.max(sheets, minSheets);
  const canOrder = emptySpreads === 0 && !!design.cover.photoId && sheets >= minSheets && pendingUploads === 0 && failedUploads === 0;

  const renderConfirm = () => (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 grid lg:grid-cols-[1.2fr_1fr] gap-10">
        <div>
          <h2 className="font-serif-luxury text-3xl sm:text-4xl text-[#1F1C18]">Último paso</h2>
          <p className="text-sm text-[#6B6255] mt-2">Revisá las terminaciones y agregalo al carrito.</p>
          <div className="mt-6">{renderCover(false)}</div>
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {design.spreads.slice(0, 8).map((sp) => (
              <div key={sp.id}>{renderSpread(sp, false)}</div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-[#1F1C18]">Tapa</h3>
            <div className="mt-2 grid gap-2">
              {COVER_OPTIONS.map((o) => {
                const active = o.type === design.coverType && o.finish === design.finish;
                const disabled = sheets < minSheetsFor(o.type);
                return (
                  <button
                    key={`${o.type}-${o.finish}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => setDesign((d) => ({ ...d, coverType: o.type, finish: o.finish }))}
                    className={`text-left rounded-lg border px-3 py-2.5 text-sm ${
                      active ? 'border-[#1F1C18] ring-1 ring-[#1F1C18] bg-white' : 'border-[#E6DFD2] bg-white/60 hover:border-[#B9AE9B]'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <div className="font-semibold text-[#1F1C18]">{o.name}</div>
                    <div className="text-xs text-[#6B6255]">
                      {disabled ? `Necesita al menos ${minSheetsFor(o.type)} hojas (tenés ${sheets}).` : o.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-[#1F1C18]">Laminado</h3>
            <div className="mt-2 inline-flex rounded-full border border-[#E6DFD2] p-1 bg-white">
              {(['brillo', 'mate'] as FotolibroLaminate[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setDesign((d) => ({ ...d, laminate: l }))}
                  className={`px-5 py-1.5 rounded-full text-sm capitalize ${design.laminate === l ? 'bg-[#1F1C18] text-white' : 'text-[#1F1C18]'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-[#1F1C18]">Caja contenedora</h3>
            {design.coverType === 'dura' ? (
              <p className="mt-2 text-sm text-[#1F1C18] inline-flex items-center gap-2">
                <Package className="w-4 h-4 text-[#8C6D37]" /> Incluida con la tapa dura.
              </p>
            ) : size.boxPrice ? (
              <label className="mt-2 flex items-center gap-3 text-sm text-[#1F1C18] cursor-pointer">
                <input
                  type="checkbox"
                  checked={design.giftBox}
                  onChange={(e) => setDesign((d) => ({ ...d, giftBox: e.target.checked }))}
                  className="w-4 h-4 accent-[#1F1C18]"
                />
                Agregar caja (tela / cuero) · {formatPriceARS(size.boxPrice)}
              </label>
            ) : (
              <p className="mt-2 text-sm text-[#6B6255]">Para esta medida la caja se cotiza aparte. Consultanos.</p>
            )}
          </section>

          <section className="rounded-xl bg-white border border-[#E6DFD2] p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6B6255]">Medida</span>
              <span className="text-[#1F1C18]">{size.closedLabel}</span>
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[#6B6255]">Hojas</span>
              <span className="text-[#1F1C18]">
                {sheets} hojas · {sheets * 2} páginas
              </span>
            </div>
            {design.coverType === 'blanda' && sheets > 7 && sheets < 10 && (
              <p className="text-xs text-[#8C6D37] mt-1.5">En tapa blanda, de 8 a 10 hojas se cobra el precio de 10 hojas: podés sumar {10 - sheets} sin costo.</p>
            )}
            <div className="flex justify-between mt-1.5">
              <span className="text-[#6B6255]">Fotos</span>
              <span className="text-[#1F1C18]">{usedIds.size}</span>
            </div>
            <div className="flex justify-between mt-3 pt-3 border-t border-[#EFE9DE] text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatPriceARS(price)}</span>
            </div>
          </section>

          {(lowResCount > 0 || unusedPhotos.length > 0 || emptySpreads > 0 || !design.cover.photoId || pendingUploads > 0 || failedUploads > 0) && (
            <ul className="space-y-1.5 text-xs">
              {!design.cover.photoId && <li className="text-red-700">Falta elegir la foto de tapa.</li>}
              {emptySpreads > 0 && <li className="text-red-700">Hay {emptySpreads} doble(s) página(s) vacía(s): agregales fotos o quitalas.</li>}
              {pendingUploads > 0 && <li className="text-[#6B6255]">Guardando tus fotos originales… ({pendingUploads} pendientes)</li>}
              {failedUploads > 0 && (
                <li className="text-red-700">
                  {failedUploads} foto(s) no se pudieron guardar.{' '}
                  <button type="button" onClick={retryUploads} className="underline font-semibold">
                    Reintentar
                  </button>
                </li>
              )}
              {lowResCount > 0 && <li className="text-amber-700">{lowResCount} foto(s) con baja resolución: pueden verse borrosas impresas.</li>}
              {unusedPhotos.length > 0 && <li className="text-[#6B6255]">{unusedPhotos.length} foto(s) subidas no están en el álbum.</li>}
            </ul>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setStep('edit')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-[#E6DFD2] text-sm hover:border-[#1F1C18]"
            >
              <ArrowLeft className="w-4 h-4" /> Volver al diseño
            </button>
            <button
              type="button"
              disabled={!canOrder}
              onClick={() => {
                if (!isLoggedIn && onOpenAuth) {
                  // Sin sesión, las fotos en alta no llegan al laboratorio.
                  setNotice('Iniciá sesión para que podamos recibir tus fotos originales en alta calidad.');
                  onOpenAuth();
                  return;
                }
                const project = buildProject();
                onAddToCart({ ...project, album: { ...design, spreads: design.spreads } }, price);
              }}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#1F1C18] text-white text-sm font-semibold hover:bg-[#3D352E] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Agregar al carrito · {formatPriceARS(price)}
            </button>
          </div>
          {!isLoggedIn && <p className="text-xs text-[#857B6C]">Para pedirlo vas a tener que iniciar sesión (así recibimos tus fotos en alta).</p>}
          {notice && step === 'confirm' && <p className="text-xs text-[#8C6D37]">{notice}</p>}
          <p className="text-xs text-[#A39A8B]">Facturamos {billedSheets} hojas. Producción: 15 a 20 días hábiles desde la aprobación.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#F8F6F0] flex flex-col text-[#1F1C18]" role="dialog" aria-modal="true" aria-label="Editor de fotolibro">
      {header}
      {step === 'start' && renderStart()}
      {step === 'upload' && renderUpload()}
      {step === 'edit' && renderEditor()}
      {step === 'confirm' && renderConfirm()}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Piezas chicas
// ---------------------------------------------------------------------------

const ToolbarButton: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  compact?: boolean;
}> = ({ onClick, icon, label, disabled, primary, compact }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className={`inline-flex items-center gap-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
      compact ? 'p-1.5' : 'px-3 py-1.5'
    } ${primary ? 'bg-[#1F1C18] text-white hover:bg-[#3D352E]' : 'border border-[#E6DFD2] bg-white hover:border-[#1F1C18]'}`}
  >
    {icon}
    {!compact && <span className="hidden sm:inline">{label}</span>}
  </button>
);

const ThumbButton: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
  width: number;
  children: React.ReactNode;
  onDropPhoto?: (e: React.DragEvent) => void;
}> = ({ active, label, onClick, width, children, onDropPhoto }) => {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDropPhoto ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={
        onDropPhoto
          ? (e) => {
              e.preventDefault();
              setOver(false);
              onDropPhoto(e);
            }
          : undefined
      }
      className="shrink-0 flex flex-col items-center gap-1"
      style={{ width }}
    >
      <div className={`w-full rounded-sm ${active ? 'ring-2 ring-[#1F1C18] ring-offset-2' : over ? 'ring-2 ring-[#C5A059] ring-offset-2' : ''}`}>{children}</div>
      <span className={`text-[10px] ${active ? 'text-[#1F1C18] font-semibold' : 'text-[#857B6C]'}`}>{label}</span>
    </button>
  );
};

export default SimpleAlbumEditor;
