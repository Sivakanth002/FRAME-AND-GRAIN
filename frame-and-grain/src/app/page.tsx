'use client';
// ============================================================================
// FRAME & GRAIN — Main Application Shell
// Orchestrates all views: Start → Field (TUNE/Lucky) → Detail → About
// ============================================================================

import { useState, useEffect, useCallback, useId, useRef } from 'react';
import type { AppView, TitleRecord, TuneSelections } from '@/types/ui';
import { useRecommendations, useLucky } from '@/hooks/useRecommendations';
import { useTuneState } from '@/hooks/useTuneState';
import { Navigation } from '@/components/Navigation';
import { StartScreen } from '@/components/StartScreen';
import { FilmField } from '@/components/FilmField';
import { TunePanel } from '@/components/TunePanel';
import { LuckyView } from '@/components/LuckyView';
import { FilmDetail } from '@/components/FilmDetail';
import { AboutPanel } from '@/components/AboutPanel';

// Generate a stable session ID for this browser session
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = sessionStorage.getItem('fg_session');
  if (!id) {
    id = `fg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('fg_session', id);
  }
  return id;
}

export default function HomePage() {
  const [sessionId] = useState<string>(() => getSessionId());
  const [view, setView] = useState<AppView>('start');
  const [startExiting, setStartExiting] = useState(false);

  // Film detail state
  const [detailFilm, setDetailFilm] = useState<TitleRecord | null>(null);

  // About panel
  const [showAbout, setShowAbout] = useState(false);

  // Lucky mode active
  const [luckyMode, setLuckyMode] = useState(false);

  // Initialize session & rehydrate active view on reload
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedView = sessionStorage.getItem('fg_view');
      if (savedView === 'field') {
        setView('field');
      }
    }
  }, []);

  // ── TUNE state ─────────────────────────────────────────────────────────────
  const tune = useTuneState();

  // ── Recommendations (TUNE) ─────────────────────────────────────────────────
  const recs = useRecommendations(sessionId);

  // ── Lucky ──────────────────────────────────────────────────────────────────
  const lucky = useLucky(sessionId);

  // ── Start screen selection ─────────────────────────────────────────────────
  const handleStartChoice = useCallback((choice: 'movie' | 'series' | 'anime' | 'idk') => {
    setStartExiting(true);

    setTimeout(() => {
      setView('field');
      setStartExiting(false);
      if (typeof window !== 'undefined') sessionStorage.setItem('fg_view', 'field');

      if (choice === 'idk') {
        // I Don't Know → DO NOT ENTER TUNE, enter Lucky directly
        setLuckyMode(true);
        tune.closeTune();
        lucky.reset();
        lucky.fetchLucky({}, [], []);
      } else {
        // Format pre-selected → TUNE starts directly from language step
        const format = choice as 'movie' | 'series' | 'anime';
        tune.setFormat(format);
        setLuckyMode(false);
        // Open TUNE starting on language step
        tune.openTune('language');
      }
    }, 480);
  }, [lucky, tune]);

  // ── Auto-fetch recommendations when TUNE selections change ─────────────────
  const { fetchTune } = recs;
  useEffect(() => {
    if (view === 'field' && !luckyMode) {
      fetchTune({
        ...tune.selections,
        region: tune.selections.region || 'IN',
        accessModes: tune.selections.accessModes || ['flatrate'],
        providerMode: tune.selections.providerMode || 'any',
      });
    }
  }, [tune.selections, view, luckyMode, fetchTune]);

  // ── Explicit TUNE apply / refresh ──────────────────────────────────────────
  const handleTuneApply = useCallback(() => {
    fetchTune({
      ...tune.selections,
      region: tune.selections.region || 'IN',
      accessModes: tune.selections.accessModes || ['flatrate'],
      providerMode: tune.selections.providerMode || 'any',
    });
  }, [fetchTune, tune.selections]);

  // ── Lucky navigation ───────────────────────────────────────────────────────
  const handleAnotherFilm = useCallback(() => {
    lucky.fetchLucky(tune.selections, recs.getTuneShownIds());
  }, [lucky, tune.selections, recs]);

  // ── Film open/close ────────────────────────────────────────────────────────
  const openDetail = useCallback((film: TitleRecord) => {
    setDetailFilm(film);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailFilm(null);
  }, []);

  // ── Nav: TUNE ──────────────────────────────────────────────────────────────
  const handleNavTune = useCallback(() => {
    setLuckyMode(false);
    setShowAbout(false);
    if (typeof window !== 'undefined') sessionStorage.setItem('fg_view', 'field');
    if (view === 'start') {
      setStartExiting(true);
      setTimeout(() => {
        setView('field');
        setStartExiting(false);
        tune.openTune();
      }, 480);
    } else {
      tune.openTune();
    }
  }, [view, tune]);

  // ── Nav: LUCKY ─────────────────────────────────────────────────────────────
  const handleNavLucky = useCallback(() => {
    setShowAbout(false);
    tune.closeTune();
    setLuckyMode(true);
    if (typeof window !== 'undefined') sessionStorage.setItem('fg_view', 'field');
    if (view === 'start') {
      setStartExiting(true);
      setTimeout(() => {
        setView('field');
        setStartExiting(false);
        lucky.reset();
        lucky.fetchLucky(tune.selections, recs.getTuneShownIds());
      }, 480);
    } else {
      lucky.reset();
      lucky.fetchLucky(tune.selections, recs.getTuneShownIds());
    }
  }, [view, tune, lucky, recs]);

  // ── Nav: ABOUT ─────────────────────────────────────────────────────────────
  const handleNavAbout = useCallback(() => {
    tune.closeTune();
    setShowAbout(true);
  }, [tune]);

  // ── Nav: LOGO → home ──────────────────────────────────────────────────────
  const handleNavLogo = useCallback(() => {
    tune.closeTune();
    setDetailFilm(null);
    setShowAbout(false);
    setStartExiting(false);
    if (view === 'field') {
      setLuckyMode(false);
    } else {
      if (typeof window !== 'undefined') sessionStorage.removeItem('fg_view');
      setView('start');
    }
  }, [view, tune]);

  // ── Keyboard: Esc ─────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (detailFilm) { closeDetail(); return; }
        if (tune.open) { tune.closeTune(); return; }
        if (showAbout) { setShowAbout(false); return; }
        if (luckyMode) { setLuckyMode(false); return; }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailFilm, tune.open, showAbout, luckyMode, closeDetail, tune]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const inField = view === 'field';
  const blurField = tune.open || showAbout || !!detailFilm;

  return (
    <>
      {/* Navigation — always visible */}
      <Navigation
        onLogo={handleNavLogo}
        onTune={handleNavTune}
        onLucky={handleNavLucky}
        onAbout={handleNavAbout}
        tuneActive={tune.open}
        luckyActive={luckyMode}
      />

      {/* Start Screen */}
      {view === 'start' && (
        <StartScreen
          exiting={startExiting}
          onChoice={handleStartChoice}
        />
      )}

      {/* Film Field — mounted once we leave start */}
      {inField && (
        <div
          className={`field-wrapper${blurField ? ' blurred' : ''}`}
          aria-label="Film collection"
        >
          {!luckyMode && (
            <FilmField
              items={recs.items}
              loading={recs.loading}
              thinPool={recs.thinPool}
              eligibleCount={recs.eligibleCount}
              error={recs.error}
              tuneSelections={tune.selections}
              onOpenFilm={openDetail}
              onOpenTune={tune.openTune}
              onOpenWiden={() => tune.openTune()} // widen is a TUNE step
              onRetry={recs.retry}
            />
          )}
        </div>
      )}

      {/* TUNE Panel — overlays the blurred field */}
      {inField && (
        <TunePanel
          open={tune.open}
          currentStep={tune.currentStep}
          selections={tune.selections}
          chips={tune.chips}
          transitioning={tune.transitioning}
          onClose={tune.closeTune}
          onApply={handleTuneApply}
          onSetFormat={tune.setFormat}
          onSetLanguages={tune.setLanguages}
          onSetLanguage={tune.setLanguage}
          onSetRuntime={tune.setRuntime}
          onSetPeriod={tune.setPeriod}
          onSetGenres={tune.setGenres}
          onSetAgeGroup={tune.setAgeGroup}
          onSetMood={tune.setMood}
          onSetProviders={tune.setProviders}
          onClearChip={tune.clearStep}
          onSkipStep={tune.skipStep}
          onGoToStep={tune.goToStep}
          onGoBack={tune.goBack}
        />
      )}

      {/* Lucky View — replaces film field */}
      {inField && luckyMode && (
        <LuckyView
          pick={lucky.pick}
          loading={lucky.loading}
          canGoBack={lucky.canGoBack}
          hasTuneContext={Object.keys(tune.selections).length > 2}
          onAnotherFilm={handleAnotherFilm}
          onBack={lucky.goBack}
          onClose={() => { setLuckyMode(false); lucky.reset(); }}
          onOpenFilm={openDetail}
        />
      )}

      {/* Film Detail Overlay */}
      {detailFilm && (
        <FilmDetail
          film={detailFilm}
          onClose={closeDetail}
        />
      )}

      {/* About Panel */}
      {showAbout && (
        <AboutPanel onClose={() => setShowAbout(false)} />
      )}
    </>
  );
}
