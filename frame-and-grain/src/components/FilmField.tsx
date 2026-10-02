'use client';
// ============================================================================
// FRAME & GRAIN — Film Field
// Dense poster wall with Lens interaction (desktop mouse / mobile touch)
// ============================================================================

import {
  useRef, useEffect, useState, useCallback, useMemo
} from 'react';
import type { TitleRecord, TuneSelections } from '@/types/ui';
import { LoadingStrip } from './LoadingStrip';

interface FilmFieldProps {
  items: TitleRecord[];
  loading: boolean;
  thinPool: boolean;
  eligibleCount: number;
  error?: string | null;
  tuneSelections: TuneSelections;
  onOpenFilm: (film: TitleRecord) => void;
  onOpenTune: () => void;
  onOpenWiden: () => void;
  onRetry?: () => void;
}

// Deterministic offset per film from its sourceId — creates stable subtle variation
function stableOffset(sourceId: string): { dx: number; dy: number; rot: number } {
  const n = parseInt(sourceId, 10) || sourceId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const s1 = Math.sin(n * 2.3) * 0.5 + 0.5;
  const s2 = Math.sin(n * 5.7) * 0.5 + 0.5;
  const s3 = Math.sin(n * 1.1) * 0.5 + 0.5;
  return {
    dx: (s1 - 0.5) * 6,         // ±3px
    dy: (s2 - 0.5) * 5,         // ±2.5px
    rot: (s3 - 0.5) * 1.2       // ±0.6deg
  };
}

// Pad field with ghost tiles when pool is thin
function buildDisplayItems(items: TitleRecord[], thinPool: boolean): Array<{ film: TitleRecord | null; key: string }> {
  const real = items.map(f => ({ film: f, key: `r_${f.source}_${f.mediaType}_${f.sourceId}` }));
  if (!thinPool || items.length >= 10) return real;

  // Fill with abstract ghost tiles (no film identity)
  const ghosts = Array.from({ length: Math.max(0, 40 - items.length) }, (_, i) => ({
    film: null,
    key: `ghost_${i}`
  }));

  return [...real, ...ghosts];
}

export function FilmField({
  items, loading, thinPool, eligibleCount, error,
  onOpenFilm, onOpenTune, onOpenWiden, onRetry
}: FilmFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lensRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  const touchRef = useRef({ x: -9999, y: -9999, dragging: false });

  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [keyboardIdx, setKeyboardIdx] = useState<number>(-1);
  const [hasPointer, setHasPointer] = useState(true);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const handleImageError = useCallback((imgKey: string) => {
    setFailedImages((prev) => new Set(prev).add(imgKey));
  }, []);

  const displayItems = useMemo(
    () => buildDisplayItems(items, thinPool),
    [items, thinPool]
  );

  // Detect touch-only device
  useEffect(() => {
    const mq = window.matchMedia('(hover: none)');
    setHasPointer(!mq.matches);
    const handler = (e: MediaQueryListEvent) => setHasPointer(!e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Lens rAF loop ──────────────────────────────────────────────────────────
  const updateLens = useCallback(() => {
    const lensEl = lensRef.current;
    if (!lensEl) return;

    const lx = mouseRef.current.active ? mouseRef.current.x : touchRef.current.x;
    const ly = mouseRef.current.active ? mouseRef.current.y : touchRef.current.y;

    if (mouseRef.current.active) {
      lensEl.style.left = `${lx}px`;
      lensEl.style.top = `${ly}px`;
      lensEl.style.opacity = '1';
    }

    // LENS_RADIUS in px — matches CSS var --lens-radius default
    const LENS_RADIUS = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--lens-radius') || '180'
    );

    let closestKey: string | null = null;
    let closestDist = Infinity;

    tileRefs.current.forEach((el, key) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(lx - cx, ly - cy);
      const intensity = Math.max(0, 1 - dist / LENS_RADIUS);

      // Neighbor border response
      if (intensity > 0 && intensity < 0.7) {
        el.classList.add('neighbor');
        el.classList.remove('focused');
      } else if (intensity <= 0) {
        el.classList.remove('neighbor', 'focused');
      }

      if (dist < closestDist) {
        closestDist = dist;
        closestKey = key;
      }
    });

    // Only focus if close enough
    const FOCUS_THRESHOLD = LENS_RADIUS * 0.55;
    if (closestDist <= FOCUS_THRESHOLD && closestKey) {
      if (closestKey !== focusedKey) {
        setFocusedKey(closestKey);
      }
      // Apply focused class directly for speed
      tileRefs.current.forEach((el, key) => {
        if (key === closestKey) {
          el.classList.add('focused');
          el.classList.remove('neighbor');
        }
      });
      lensEl.classList.add('active');
    } else {
      if (focusedKey) setFocusedKey(null);
      tileRefs.current.forEach(el => el.classList.remove('focused'));
      lensEl.classList.remove('active');
    }

    rafRef.current = requestAnimationFrame(updateLens);
  }, [focusedKey]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(updateLens);
    return () => cancelAnimationFrame(rafRef.current);
  }, [updateLens]);

  // ── Mouse events ───────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
    touchRef.current.dragging = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.active = false;
    if (lensRef.current) lensRef.current.style.opacity = '0';
    setFocusedKey(null);
    tileRefs.current.forEach(el => el.classList.remove('focused', 'neighbor'));
  }, []);

  const touchStartPos = useRef({ x: 0, y: 0 });

  // ── Touch events (mobile Lens + scroll) ────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartPos.current = { x: t.clientX, y: t.clientY };
    touchRef.current = { x: t.clientX, y: t.clientY, dragging: false };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - touchStartPos.current.x);
    const dy = Math.abs(t.clientY - touchStartPos.current.y);
    if (dx > 8 || dy > 8) {
      touchRef.current = { x: t.clientX, y: t.clientY, dragging: true };
    } else {
      touchRef.current = { x: t.clientX, y: t.clientY, dragging: false };
    }
    mouseRef.current.active = false;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // If it was a drag/scroll gesture, do not trigger film open
    if (touchRef.current.dragging) {
      touchRef.current.dragging = false;
      return;
    }
    // Treat as click/tap on focused item
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const tile = el?.closest('[data-tile-key]') as HTMLElement | null;
    if (tile) {
      const key = tile.dataset.tileKey;
      const entry = [...tileRefs.current.entries()].find(([k]) => k === key);
      if (entry) {
        const film = displayItems.find(d => d.key === key)?.film;
        if (film) onOpenFilm(film);
      }
    }
  }, [displayItems, onOpenFilm]);

  // ── Click on tile ──────────────────────────────────────────────────────────
  const handleTileClick = useCallback((film: TitleRecord | null) => {
    if (film) onOpenFilm(film);
  }, [onOpenFilm]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const realItems = displayItems.filter(d => d.film !== null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (realItems.length === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setKeyboardIdx(i => Math.min(i + 1, realItems.length - 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setKeyboardIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const film = realItems[keyboardIdx]?.film;
      if (film) onOpenFilm(film);
    } else if (e.key === 'Tab') {
      // Allow normal tab through tiles
    }
  }, [realItems, keyboardIdx, onOpenFilm]);

  // Register tile ref
  const registerRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) tileRefs.current.set(key, el);
    else tileRefs.current.delete(key);
  }, []);

  return (
    <>
      {/* Lens cursor (desktop only) */}
      {hasPointer && (
        <div
          ref={lensRef}
          className="lens-cursor"
          aria-hidden="true"
          style={{ opacity: 0, left: '-100px', top: '-100px' }}
        />
      )}

      <div
        ref={fieldRef}
        className={`film-field${loading ? ' is-loading' : ''}`}
        role="list"
        aria-label="Film collection — move your cursor to explore"
        tabIndex={0}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
      >
        {displayItems.map(({ film, key }, idx) => {
          const offset = film ? stableOffset(film.sourceId) : { dx: 0, dy: 0, rot: 0 };
          const isKeyFocused = film !== null && realItems[keyboardIdx]?.key === key;

          return (
            <div
              key={key}
              ref={el => registerRef(key, el)}
              data-tile-key={key}
              className={`poster-tile${isKeyFocused ? ' keyboard-focused' : ''}${!film ? ' ghost' : ''}`}
              style={{
                '--tile-dx': `${offset.dx}px`,
                '--tile-dy': `${offset.dy}px`,
                '--tile-rot': `${offset.rot}deg`,
                // Stronger candidates placed with slightly tighter stagger
                order: film ? idx : 999 + idx,
                opacity: film ? 1 : 0.12,
                pointerEvents: film ? 'auto' : 'none'
              } as React.CSSProperties}
              role={film ? 'listitem' : 'presentation'}
              aria-label={film ? `${film.title}${film.year ? `, ${film.year}` : ''}` : undefined}
              tabIndex={film ? 0 : -1}
              onClick={() => handleTileClick(film)}
              onFocus={() => setKeyboardIdx(realItems.findIndex(r => r.key === key))}
            >
              {film ? (
                <>
                  {film.poster && !failedImages.has(key) ? (
                    <img
                      className="poster-img"
                      src={film.poster}
                      alt={`${film.title} poster`}
                      loading={idx < 20 ? 'eager' : 'lazy'}
                      decoding="async"
                      draggable={false}
                      onError={() => handleImageError(key)}
                    />
                  ) : (
                    <div className="poster-missing" aria-label={`${film.title} — poster unavailable`}>
                      <span className="poster-missing-title">{film.title}</span>
                      <span className="poster-missing-label">Poster Unavailable</span>
                    </div>
                  )}
                  <div className="poster-label" aria-hidden="true">
                    <div className="poster-label-title">{film.title}</div>
                    {film.year && <div className="poster-label-year">{film.year}</div>}
                  </div>
                </>
              ) : (
                // Ghost tile — no film identity revealed
                <div className="poster-missing" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>

      {/* Loading indicator */}
      {loading && <LoadingStrip />}

      {/* Thin pool notice */}
      {thinPool && !loading && items.length > 0 && (
        <div
          className="thin-pool-notice"
          role="status"
          aria-live="polite"
          aria-label={`${eligibleCount} films match your criteria`}
        >
          <div className="thin-pool-count">{eligibleCount} film{eligibleCount !== 1 ? 's' : ''} fit your criteria.</div>
          <div className="thin-pool-message">
            We couldn&apos;t find more without loosening your preferences.
          </div>
          <button
            className="thin-pool-widen"
            onClick={onOpenWiden}
            aria-label="Widen the search — relax some filters"
          >
            WIDEN THE SEARCH →
          </button>
        </div>
      )}

      {/* Error state */}
      {error && !loading && items.length === 0 && (
        <div className="empty-state" role="alert">
          <p className="empty-state-title">The film field lost focus.</p>
          <p className="empty-state-body">
            We couldn&apos;t reach the archive right now. Your preferences are saved.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
            {onRetry && (
              <button className="thin-pool-widen" onClick={onRetry}>
                RETRY ↺
              </button>
            )}
            <button className="thin-pool-widen" onClick={onOpenWiden}>
              WIDEN SEARCH →
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state" role="status">
          <p className="empty-state-title">No films found.</p>
          <p className="empty-state-body">
            Your current filters are very specific. Try widening your search.
          </p>
          <button className="thin-pool-widen" onClick={onOpenWiden}>
            WIDEN THE SEARCH →
          </button>
        </div>
      )}
    </>
  );
}
