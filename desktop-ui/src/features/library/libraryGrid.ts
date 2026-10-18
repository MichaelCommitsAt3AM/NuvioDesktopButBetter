import { useEffect, useState, type RefObject } from 'react';

/** Port of `core/ui/PosterGridSizing.kt` so the library grid uses the same column counts as Kotlin. */

const POSTER_GRID_MIN_COLUMNS = 3;
const POSTER_GRID_SPACING = 12;
const POSTER_GRID_HORIZONTAL_PADDING = 16;
const STANDARD_DESKTOP_ASPECT_RATIO = 16 / 9;
const ULTRAWIDE_DESKTOP_ASPECT_RATIO = 32 / 9;
const DESKTOP_CATALOG_POSTER_SCALE = 1.4;

export function posterGridColumnCountForWidth(width: number): number {
  if (width >= 1400) return 7;
  if (width >= 1200) return 6;
  if (width >= 1000) return 5;
  if (width >= 840) return 4;
  return POSTER_GRID_MIN_COLUMNS;
}

export function catalogPosterBaseWidthDp(basePosterWidthDp: number): number {
  return Math.round(basePosterWidthDp * DESKTOP_CATALOG_POSTER_SCALE);
}

export function ultrawideViewportProgress(width: number, height: number): number {
  if (!(height > 0)) return 0;
  const aspectRatio = width / height;
  return Math.min(1, Math.max(0, (aspectRatio - STANDARD_DESKTOP_ASPECT_RATIO) / (ULTRAWIDE_DESKTOP_ASPECT_RATIO - STANDARD_DESKTOP_ASPECT_RATIO)));
}

export function posterGridColumnCountForViewport(width: number, height: number, basePosterWidthDp: number): number {
  const widthColumns = posterGridColumnCountForWidth(width);
  const progress = ultrawideViewportProgress(width, height);
  if (progress <= 0) return widthColumns;

  const referenceWidth = Math.min(width, height * STANDARD_DESKTOP_ASPECT_RATIO);
  const referenceColumns = posterGridColumnCountForWidth(referenceWidth);
  const referenceAvailableWidth = Math.max(referenceWidth - POSTER_GRID_HORIZONTAL_PADDING * 2, 0);
  const referencePosterWidth = (referenceAvailableWidth - POSTER_GRID_SPACING * (referenceColumns - 1)) / referenceColumns;
  const sharedPosterWidth = catalogPosterBaseWidthDp(basePosterWidthDp);
  const targetPosterWidth = referencePosterWidth + (sharedPosterWidth - referencePosterWidth) * progress;
  const availableWidth = Math.max(width - POSTER_GRID_HORIZONTAL_PADDING * 2, 0);
  const responsiveColumns = Math.max(POSTER_GRID_MIN_COLUMNS, Math.round((availableWidth + POSTER_GRID_SPACING) / (targetPosterWidth + POSTER_GRID_SPACING)));
  return Math.max(widthColumns, responsiveColumns);
}

/** Tracks the grid's own width and maps it to Kotlin's breakpoint column count. */
export function useLibraryGridColumns(ref: RefObject<HTMLElement | null>, basePosterWidthDp: number, enabled = true): number {
  const [columns, setColumns] = useState(() => posterGridColumnCountForViewport(window.innerWidth, window.innerHeight, basePosterWidthDp));
  useEffect(() => {
    if (!enabled) return;
    const element = ref.current;
    if (!element) return;
    const update = () => setColumns(posterGridColumnCountForViewport(element.clientWidth, window.innerHeight, basePosterWidthDp));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [ref, basePosterWidthDp, enabled]);
  return columns;
}
