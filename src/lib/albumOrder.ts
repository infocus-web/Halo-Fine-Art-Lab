// Lo que viaja con el pedido de un fotolibro del editor simple: la
// diagramación completa (celdas, encuadres) + dónde está cada foto original
// en Supabase Storage. Con esto el laboratorio puede generar los archivos de
// impresión (ver albumPrintExport.ts) sin depender del navegador del cliente.

import type { PhotobookProject } from '../types';
import type { AlbumDesign } from './albumLayout';

export interface AlbumLabPhoto {
  id: string;
  name: string;
  storagePath?: string;
  width?: number;
  height?: number;
}

export interface AlbumLabLayout {
  version: 1;
  sizeId: string;
  coverType: AlbumDesign['coverType'];
  finish: AlbumDesign['finish'];
  laminate: AlbumDesign['laminate'];
  giftBox: boolean;
  sheets: number;
  cover: AlbumDesign['cover'];
  spreads: { cells: AlbumDesign['spreads'][number]['cells'] }[];
  photos: AlbumLabPhoto[];
}

export function buildAlbumLabLayout(project: PhotobookProject): AlbumLabLayout | undefined {
  const album = project.album;
  if (!album) return undefined;
  const used = new Set<string>();
  for (const sp of album.spreads) for (const c of sp.cells) used.add(c.photoId);
  if (album.cover.photoId) used.add(album.cover.photoId);
  return {
    version: 1,
    sizeId: album.sizeId,
    coverType: album.coverType,
    finish: album.finish,
    laminate: album.laminate,
    giftBox: album.coverType === 'dura' ? true : album.giftBox,
    sheets: album.spreads.length,
    cover: album.cover,
    spreads: album.spreads.map((s) => ({ cells: s.cells })),
    photos: project.photos
      .filter((p) => used.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, storagePath: p.storagePath, width: p.width, height: p.height })),
  };
}
