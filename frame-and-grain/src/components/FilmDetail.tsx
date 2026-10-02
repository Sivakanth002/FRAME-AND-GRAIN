'use client';
// ============================================================================
// FRAME & GRAIN — Film Detail Overlay
//
// MOBILE: poster fills screen → user swipes/drags up → info sheet reveals
// DESKTOP: side-by-side poster + info column
//
// Interaction states (mobile):
//   POSTER  — full poster, sheet is collapsed (peek strip at bottom)
//   PARTIAL — user dragging
//   SHEET   — info sheet fully revealed, poster visible above it
// ============================================================================

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import type { TitleRecord } from '@/types/ui';

interface FilmDetailProps {
  film: TitleRecord;
  onClose: () => void;
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

function posterUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${TMDB_IMAGE_BASE}/w500${path.startsWith('/') ? path : `/${path}`}`;
}

function logoUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${TMDB_IMAGE_BASE}/w92${path.startsWith('/') ? path : `/${path}`}`;
}

function ratingDisplay(r: number): string {
  return r > 0 ? r.toFixed(1) : '—';
}

function runtimeDisplay(film: TitleRecord): string {
  if (film.mediaType === 'tv') {
    const parts: string[] = [];
    if (film.episodeRuntimeFormatted) parts.push(film.episodeRuntimeFormatted);
    if (film.episodeCount) parts.push(`${film.episodeCount} ep`);
    if (film.seasonCount) parts.push(`${film.seasonCount} season${film.seasonCount > 1 ? 's' : ''}`);
    return parts.length ? parts.join(' · ') : 'Runtime Unavailable';
  }
  return film.runtime ? `${film.runtime} min` : 'Runtime Unavailable';
}

function languageDisplay(code: string): string {
  const map: Record<string, string> = {
    en: 'English', hi: 'Hindi', ml: 'Malayalam', ta: 'Tamil', te: 'Telugu',
    ja: 'Japanese', ko: 'Korean', fr: 'French', es: 'Spanish', de: 'German',
    it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ru: 'Russian', ar: 'Arabic',
  };
  return map[code] || code.toUpperCase();
}

function regionDisplay(code?: string): string {
  const map: Record<string, string> = {
    IN: 'INDIA', US: 'US', GB: 'UK', CA: 'CANADA', AU: 'AUSTRALIA',
    FR: 'FRANCE', DE: 'GERMANY', JP: 'JAPAN', KR: 'KOREA'
  };
  return (code && map[code.toUpperCase()]) || (code ? code.toUpperCase() : 'REGIONAL');
}

export function FilmDetail({ film, onClose }: FilmDetailProps) {
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const dialogId = useId();

  // Mobile sheet state
  // 'poster' = sheet collapsed, 'sheet' = sheet expanded
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragDelta, setDragDelta] = useState(0); // px: negative = dragging up

  const touchStartY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useRef(false);

  // Detect reduced motion preference
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Keyboard: Escape to close, browser back via popstate
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onPopState() {
      onClose();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPopState);
    // Push a history state so browser back button works
    history.pushState({ filmDetail: true }, '');
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPopState);
    };
  }, [onClose]);

  // Fetch trailer
  useEffect(() => {
    const { mediaType, sourceId } = film;
    fetch(`/api/title/${mediaType}/${sourceId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.trailerUrl) setTrailerUrl(d.data.trailerUrl);
      })
      .catch(() => {});
  }, [film]);

  // ── Touch handlers for mobile sheet ───────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setDragging(true);
    setDragDelta(0);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    // Constrain: dragging up (negative dy) opens sheet, dragging down closes it
    if (!sheetOpen && dy > 0) return; // prevent dragging down when already collapsed
    if (sheetOpen && dy < 0) return;  // prevent over-dragging up when open
    setDragDelta(dy);
    e.preventDefault();
  }, [sheetOpen]);

  const onTouchEnd = useCallback(() => {
    setDragging(false);
    // Threshold: 80px swipe commits the transition
    if (!sheetOpen && dragDelta < -80) {
      setSheetOpen(true);
    } else if (sheetOpen && dragDelta > 80) {
      setSheetOpen(false);
    }
    setDragDelta(0);
  }, [sheetOpen, dragDelta]);

  // ── Pointer drag handlers (mouse, for desktop touch simulation) ────────────
  const dragStartY = useRef(0);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dy = e.clientY - dragStartY.current;
    if (!sheetOpen && dy > 0) return;
    if (sheetOpen && dy < 0) return;
    setDragDelta(dy);
  }, [dragging, sheetOpen]);

  const onPointerUp = useCallback(() => {
    setDragging(false);
    if (!sheetOpen && dragDelta < -80) setSheetOpen(true);
    else if (sheetOpen && dragDelta > 80) setSheetOpen(false);
    setDragDelta(0);
  }, [sheetOpen, dragDelta]);

  // Sheet transform: sheetOpen=false → peek at bottom (show ~70px of sheet)
  // sheetOpen=true → full sheet occupies bottom 65% of screen
  const PEEK_HEIGHT = 72; // px visible when collapsed

  function getSheetTranslateY(): string {
    const baseY = sheetOpen ? 0 : `calc(100% - ${PEEK_HEIGHT}px)`;
    if (dragging && dragDelta !== 0) {
      return `calc(${sheetOpen ? 0 : 100}% - ${sheetOpen ? 0 : PEEK_HEIGHT}px + ${dragDelta}px)`;
    }
    return baseY as string;
  }

  const flatrate = film.providers?.filter(p => p.type === 'flatrate') ?? [];
  const rent = film.providers?.filter(p => p.type === 'rent') ?? [];
  const posterSrc = posterUrl(film.poster);

  // ── Info content (shared between mobile sheet and desktop column) ──────────
  const InfoContent = () => (
    <div className="detail-info-col" id={`${dialogId}-info`}>
      <h1 className="detail-title">{film.title}</h1>

      <div className="detail-meta-row" aria-label="Film details">
        {film.year && (
          <div className="detail-meta-item">
            <span className="detail-meta-label">Year</span>
            <span className="detail-meta-value">{film.year}</span>
          </div>
        )}
        <div className="detail-meta-item">
          <span className="detail-meta-label">Language</span>
          <span className="detail-meta-value">{languageDisplay(film.originalLanguage)}</span>
        </div>
        <div className="detail-meta-item">
          <span className="detail-meta-label">Runtime</span>
          <span className="detail-meta-value">{runtimeDisplay(film)}</span>
        </div>
        {film.rating > 0 && (
          <div className="detail-meta-item">
            <span className="detail-meta-label">Rating</span>
            <div>
              <span className="detail-rating">{ratingDisplay(film.rating)}</span>
              <span className="detail-rating-sub"> / 10 · {film.voteCount.toLocaleString()} votes</span>
            </div>
          </div>
        )}
        <div className="detail-meta-item">
          <span className="detail-meta-label">Format</span>
          <span className="detail-meta-value" style={{ textTransform: 'capitalize' }}>
            {film.contentClass}
          </span>
        </div>
        <div className="detail-meta-item">
          <span className="detail-meta-label">Certification</span>
          <span className="detail-meta-value">
            {film.certification?.confidence === 'verified' && film.certification.rawRating
              ? `${regionDisplay(film.certification.region)} · ${film.certification.rawRating}`
              : 'Certification Unavailable'}
          </span>
        </div>
      </div>

      {film.genres.length > 0 && (
        <div className="detail-section">
          <span className="detail-section-label">Genre</span>
          <div className="detail-genres" role="list">
            {film.genres.map(g => (
              <span key={g} className="detail-genre-tag" role="listitem">{g}</span>
            ))}
          </div>
        </div>
      )}

      {film.overview && (
        <div className="detail-section">
          <span className="detail-section-label">About</span>
          <p className="detail-overview">{film.overview}</p>
        </div>
      )}

      {film.reasons && film.reasons.length > 0 && (
        <div className="detail-section">
          <span className="detail-section-label">Why it found you</span>
          <div className="detail-reasons" role="list" aria-label="Reasons this film was recommended">
            {film.reasons.map((r, i) => (
              <div key={i} className="detail-reason" role="listitem">{r}</div>
            ))}
          </div>
        </div>
      )}

      {flatrate.length > 0 && (
        <div className="detail-section">
          <span className="detail-section-label">Stream</span>
          <div className="detail-providers" role="list">
            {flatrate.map(p => (
              <div key={p.tmdbProviderId} className="detail-provider" role="listitem">
                {p.logoPath && (
                  <img className="detail-provider-logo" src={logoUrl(p.logoPath) ?? ''} alt="" width={28} height={28} />
                )}
                <div>
                  <div className="detail-provider-name">{p.name}</div>
                  <div className="detail-provider-type">STREAM</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rent.length > 0 && (
        <div className="detail-section">
          <span className="detail-section-label">Rent</span>
          <div className="detail-providers" role="list">
            {rent.map(p => (
              <div key={p.tmdbProviderId} className="detail-provider" role="listitem">
                {p.logoPath && (
                  <img className="detail-provider-logo" src={logoUrl(p.logoPath) ?? ''} alt="" width={28} height={28} />
                )}
                <div>
                  <div className="detail-provider-name">{p.name}</div>
                  <div className="detail-provider-type">RENT</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {trailerUrl && (
        <div className="detail-section">
          <a
            className="detail-watch-link"
            href={trailerUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Watch trailer for ${film.title} on YouTube`}
          >
            ▶ WATCH TRAILER
          </a>
        </div>
      )}

      <p className="detail-attribution">
        Film data from{' '}
        <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">
          TMDB
        </a>. Provider data by JustWatch.
      </p>
    </div>
  );

  return (
    <div
      className="detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Film details: ${film.title}`}
      aria-describedby={`${dialogId}-info`}
    >
      {/* ── CLOSE button — always visible ── */}
      <button
        className="detail-close"
        onClick={onClose}
        aria-label="Close film details"
        autoFocus
      >
        ✕ CLOSE
      </button>

      {/* ── DESKTOP LAYOUT ──────────────────────────────────────────────────── */}
      <div className="detail-layout detail-desktop-only">
        <div className="detail-poster-col">
          {posterSrc && !imageError ? (
            <img
              className="detail-poster"
              src={posterSrc}
              alt={`${film.title} poster`}
              width={340}
              height={510}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="detail-missing-poster" aria-label={`${film.title} — poster unavailable`}>
              <span className="detail-missing-title">{film.title}</span>
              <span className="detail-missing-label">Poster Unavailable</span>
            </div>
          )}
        </div>
        <InfoContent />
      </div>

      {/* ── MOBILE LAYOUT ───────────────────────────────────────────────────── */}
      <div className="detail-mobile-only">
        {/* Poster fills screen */}
        <div
          className="detail-mobile-poster-wrap"
          aria-label={`${film.title} — swipe up for details`}
        >
          {posterSrc && !imageError ? (
            <img
              className="detail-mobile-poster"
              src={posterSrc}
              alt={`${film.title} poster`}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="detail-missing-poster detail-mobile-missing">
              <span className="detail-missing-title">{film.title}</span>
            </div>
          )}
        </div>

        {/* Swipe-up info sheet */}
        <div
          ref={sheetRef}
          className={`detail-mobile-sheet${sheetOpen ? ' open' : ''}${dragging ? ' dragging' : ''}`}
          style={{
            transform: `translateY(${getSheetTranslateY()})`,
            transition: (dragging || prefersReducedMotion.current) ? 'none' : 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
          role="region"
          aria-label="Film information"
          aria-expanded={sheetOpen}
        >
          {/* Drag handle — tap or drag to toggle */}
          <button
            className="detail-sheet-handle"
            onClick={() => setSheetOpen(o => !o)}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            aria-label={sheetOpen ? 'Collapse film details' : 'Expand film details — or swipe up'}
          >
            <span className="detail-sheet-handle-bar" aria-hidden="true" />
            {!sheetOpen && (
              <span className="detail-sheet-peek-title" aria-hidden="true">
                {film.title}
                {film.year ? ` · ${film.year}` : ''}
              </span>
            )}
          </button>

          {/* Info content inside sheet */}
          <div className="detail-sheet-content" aria-hidden={!sheetOpen}>
            <InfoContent />
          </div>
        </div>
      </div>
    </div>
  );
}
