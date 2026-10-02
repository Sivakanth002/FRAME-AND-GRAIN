'use client';
// ============================================================================
// FRAME & GRAIN — Lucky View
// Single film, not a list — with Previous Pick navigation
// ============================================================================

import { useState } from 'react';
import type { TitleRecord } from '@/types/ui';
import { LoadingStrip } from './LoadingStrip';

interface LuckyViewProps {
  pick: TitleRecord | null;
  loading: boolean;
  canGoBack: boolean;
  hasTuneContext: boolean;
  onAnotherFilm: () => void;
  onBack: () => void;
  onClose: () => void;
  onOpenFilm: (film: TitleRecord) => void;
}

export function LuckyView({
  pick, loading, canGoBack, hasTuneContext,
  onAnotherFilm, onBack, onClose, onOpenFilm
}: LuckyViewProps) {
  const [imageError, setImageError] = useState(false);
  return (
    <div
      className="lucky-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={pick ? `Lucky pick: ${pick.title}` : 'Finding a film for you'}
    >
      {/* Close */}
      <button
        className="lucky-btn"
        onClick={onClose}
        aria-label="Close Lucky — return to film field"
        style={{ position: 'absolute', top: 'var(--space-5)', right: 'var(--space-6)', fontSize: 11, letterSpacing: '0.12em' }}
      >
        ✕ CLOSE
      </button>

      {/* Eyebrow */}
      <p className="lucky-eyebrow">
        {hasTuneContext
          ? 'You weren\'t looking for this. But here it is.'
          : 'I\'m feeling lucky.'}
      </p>

      {loading && !pick ? (
        <LoadingStrip />
      ) : pick ? (
        <>
          {/* Poster */}
          <div className="lucky-poster-wrap">
            {pick.poster && !imageError ? (
              <img
                className="lucky-poster"
                src={pick.poster}
                alt={`${pick.title} poster`}
                width={260}
                height={390}
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="lucky-missing-poster">
                <span className="lucky-missing-title">{pick.title}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--color-text-dim)', textTransform: 'uppercase' }}>
                  Poster Unavailable
                </span>
              </div>
            )}
          </div>

          {/* Film meta */}
          <div className="lucky-meta">
            <h2 className="lucky-title">{pick.title}</h2>
            <p className="lucky-subtitle">
              {[pick.year, pick.genres[0], pick.runtime ? `${pick.runtime} min` : null]
                .filter(Boolean).join(' · ')}
            </p>
          </div>

          {/* Controls */}
          <div className="lucky-controls">
            {canGoBack && (
              <button
                className="lucky-btn"
                onClick={onBack}
                aria-label="Back to previous pick"
              >
                ← BACK TO PREVIOUS PICK
              </button>
            )}

            <button
              className="lucky-open-btn"
              onClick={() => onOpenFilm(pick)}
              aria-label={`Open details for ${pick.title}`}
            >
              OPEN FILM
            </button>

            <button
              className="lucky-btn primary"
              onClick={onAnotherFilm}
              disabled={loading}
              aria-label="Show another film"
            >
              ANOTHER FILM →
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state" style={{ position: 'static', padding: 0 }}>
          <p className="empty-state-title">Searching the archive…</p>
          <p className="empty-state-body">
            We&apos;re looking through the collection. This usually takes just a moment.
          </p>
        </div>
      )}

      {loading && pick && <LoadingStrip />}
    </div>
  );
}
