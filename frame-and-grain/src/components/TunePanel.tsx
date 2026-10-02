'use client';
// ============================================================================
// FRAME & GRAIN — TUNE Panel
// Complete reachable question flow with multi-language, multi-genre,
// multi-provider, age group, safe back, skip, widen, and chip editing.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import type { TuneStep, TuneSelections, TMDBGenre, TMDBProviderInfo } from '@/types/ui';
import {
  type TuneChip,
  languageLabel,
  runtimeLabel,
  periodLabel,
  ageGroupLabel,
  moodLabel
} from '@/hooks/useTuneState';

interface TunePanelProps {
  open: boolean;
  currentStep: TuneStep;
  selections: TuneSelections;
  chips: TuneChip[];
  transitioning: boolean;
  onClose: () => void;
  onApply: () => void;
  onSetFormat: (f: 'movie' | 'series' | 'anime' | 'all') => void;
  onSetLanguages: (codes: string[], names: string[]) => void;
  onSetLanguage: (l: string) => void;
  onSetRuntime: (r: string) => void;
  onSetPeriod: (p: string) => void;
  onSetGenres: (ids: number[], names: string[]) => void;
  onSetAgeGroup: (a: string) => void;
  onSetMood: (m: string) => void;
  onSetProviders: (ids: number[], names: string[], mode: TuneSelections['providerMode']) => void;
  onClearChip: (step: TuneStep) => void;
  onSkipStep: (step: TuneStep) => void;
  onGoToStep: (step: TuneStep) => void;
  onGoBack: () => void;
}

// Top languages for TMDB discovery
const LANGUAGE_CHOICES = [
  { code: 'en', label: 'ENGLISH' },
  { code: 'hi', label: 'HINDI' },
  { code: 'ml', label: 'MALAYALAM' },
  { code: 'ta', label: 'TAMIL' },
  { code: 'te', label: 'TELUGU' },
  { code: 'ja', label: 'JAPANESE' },
  { code: 'ko', label: 'KOREAN' },
  { code: 'fr', label: 'FRENCH' },
  { code: 'es', label: 'SPANISH' },
  { code: 'de', label: 'GERMAN' },
  { code: 'it', label: 'ITALIAN' },
  { code: 'pt', label: 'PORTUGUESE' },
];

const AGE_GROUP_CHOICES = [
  { value: 'under-13', label: 'UNDER 13' },
  { value: '13-17', label: '13–17' },
  { value: '18-24', label: '18–24' },
  { value: '25-34', label: '25–34' },
  { value: '35-44', label: '35–44' },
  { value: '45-54', label: '45–54' },
  { value: '55+', label: '55+' },
  { value: 'prefer-not-to-say', label: 'PREFER NOT TO SAY' },
];

const MOOD_CHOICES = [
  { value: 'thrilled', label: 'THRILLED' },
  { value: 'moved', label: 'MOVED' },
  { value: 'unsettled', label: 'UNSETTLED' },
  { value: 'inspired', label: 'INSPIRED' },
  { value: 'laugh', label: 'MAKE ME LAUGH' },
  { value: 'think', label: 'MAKE ME THINK' },
  { value: 'dark', label: 'SOMETHING DARK' },
  { value: 'relaxed', label: 'KEEP IT GENTLE' },
];

export function TunePanel({
  open,
  currentStep,
  selections,
  chips,
  transitioning,
  onClose,
  onApply,
  onSetFormat,
  onSetLanguages,
  onSetRuntime,
  onSetPeriod,
  onSetGenres,
  onSetAgeGroup,
  onSetMood,
  onSetProviders,
  onClearChip,
  onSkipStep,
  onGoToStep,
  onGoBack,
}: TunePanelProps) {
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [providers, setProviders] = useState<TMDBProviderInfo[]>([]);

  // Local state for multi-selects to allow fluid selection before DONE →
  const [selectedLangCodes, setSelectedLangCodes] = useState<string[]>(
    selections.languages || (selections.language && selections.language !== 'all' ? [selections.language] : [])
  );
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>(selections.genreIds || []);
  const [selectedProviderIds, setSelectedProviderIds] = useState<number[]>(selections.providerIds || []);
  const [providerMode, setProviderMode] = useState<TuneSelections['providerMode']>(selections.providerMode || 'any');
  const [widenOpen, setWidenOpen] = useState(false);

  // Sync external selections into local multi-select state
  useEffect(() => {
    if (selections.languages) {
      setSelectedLangCodes(selections.languages);
    } else if (selections.language && selections.language !== 'all') {
      setSelectedLangCodes(selections.language.split(','));
    } else {
      setSelectedLangCodes([]);
    }
    setSelectedGenreIds(selections.genreIds || []);
    setSelectedProviderIds(selections.providerIds || []);
    setProviderMode(selections.providerMode || 'any');
  }, [selections.languages, selections.language, selections.genreIds, selections.providerIds, selections.providerMode]);

  // Fetch genres & providers
  useEffect(() => {
    if (!open) return;
    if (genres.length === 0) {
      fetch('/api/genres')
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setGenres(d.data.genres);
        })
        .catch(() => {});
    }
    if (providers.length === 0) {
      const region = selections.region || 'IN';
      fetch(`/api/providers?region=${region}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setProviders(d.data.providers.slice(0, 24));
        })
        .catch(() => {});
    }
  }, [open, genres.length, providers.length, selections.region]);

  // ── Language Multi-Select Handlers ──────────────────────────────────────────
  const handleLangToggle = useCallback((code: string) => {
    setSelectedLangCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  const handleLangClearAll = useCallback(() => {
    setSelectedLangCodes([]);
  }, []);

  const handleConfirmLanguages = useCallback(() => {
    const names = selectedLangCodes.map(languageLabel);
    onSetLanguages(selectedLangCodes, names);
  }, [selectedLangCodes, onSetLanguages]);

  // ── Genre Multi-Select Handlers ─────────────────────────────────────────────
  const handleGenreToggle = useCallback((id: number) => {
    setSelectedGenreIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }, []);

  const handleConfirmGenres = useCallback(() => {
    const names = genres
      .filter((g) => selectedGenreIds.includes(g.id))
      .map((g) => g.name);
    onSetGenres(selectedGenreIds, names);
  }, [selectedGenreIds, genres, onSetGenres]);

  // ── Provider Multi-Select Handlers ──────────────────────────────────────────
  const handleProviderToggle = useCallback((id: number) => {
    setSelectedProviderIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }, []);

  const handleConfirmProviders = useCallback(() => {
    const names = providers
      .filter((p) => selectedProviderIds.includes(p.provider_id))
      .map((p) => p.provider_name);
    onSetProviders(selectedProviderIds, names, providerMode);
  }, [selectedProviderIds, providers, providerMode, onSetProviders]);

  if (!open) return null;

  return (
    <div
      className="tune-overlay open"
      role="dialog"
      aria-modal="true"
      aria-label="TUNE — refine your film discovery"
    >
      {/* Close button */}
      <button
        className="tune-close"
        onClick={onClose}
        aria-label="Close TUNE"
      >
        ✕ CLOSE
      </button>

      {/* Active Selection Chips */}
      {chips.length > 0 && (
        <div className="tune-chips" role="list" aria-label="Current TUNE selections">
          {chips.map((chip) => (
            <button
              key={chip.step}
              className="tune-chip"
              onClick={() => onGoToStep(chip.step)}
              onKeyDown={(e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  onClearChip(chip.step);
                }
              }}
              aria-label={`${chip.label} — click to edit, Delete to clear`}
              role="listitem"
            >
              {chip.label}
              <span
                className="tune-chip-x"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearChip(chip.step);
                }}
                aria-label={`Remove ${chip.label}`}
                role="button"
                tabIndex={-1}
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Widen View (overrides current question) */}
      {widenOpen ? (
        <WidenPanel
          selections={selections}
          onWiden={(step) => {
            onClearChip(step);
            setWidenOpen(false);
          }}
          onClose={() => setWidenOpen(false)}
        />
      ) : (
        /* Current question view */
        <div
          className={`tune-question${transitioning ? ' exiting' : ''}`}
          role="group"
          aria-label={`TUNE step: ${currentStep}`}
        >
          {currentStep === 'format' && (
            <FormatStep
              onSelect={(v) => {
                onSetFormat(v);
              }}
              current={selections.format}
            />
          )}

          {currentStep === 'language' && (
            <LanguageStep
              selectedCodes={selectedLangCodes}
              onToggle={handleLangToggle}
              onClearAll={handleLangClearAll}
              onConfirm={handleConfirmLanguages}
              onSkip={() => {
                onSkipStep('language');
              }}
            />
          )}

          {currentStep === 'provider' && (
            <ProviderStep
              providers={providers}
              selectedIds={selectedProviderIds}
              providerMode={providerMode}
              onToggle={handleProviderToggle}
              onSetMode={(m) => setProviderMode(m)}
              onConfirm={handleConfirmProviders}
              onSkip={() => {
                onSkipStep('provider');
              }}
            />
          )}

          {currentStep === 'runtime' && (
            <RuntimeStep
              onSelect={(v) => {
                onSetRuntime(v);
              }}
              current={selections.runtime}
            />
          )}

          {currentStep === 'period' && (
            <PeriodStep
              onSelect={(v) => {
                onSetPeriod(v);
              }}
              current={selections.period}
            />
          )}

          {currentStep === 'genre' && (
            <GenreStep
              genres={genres}
              selected={selectedGenreIds}
              onToggle={handleGenreToggle}
              onConfirm={handleConfirmGenres}
              onSkip={() => {
                onSkipStep('genre');
              }}
            />
          )}

          {currentStep === 'ageGroup' && (
            <AgeGroupStep
              onSelect={(v) => {
                onSetAgeGroup(v);
              }}
              current={selections.ageGroup}
            />
          )}

          {currentStep === 'mood' && (
            <MoodStep
              onSelect={(v) => {
                onSetMood(v);
              }}
              current={selections.mood}
            />
          )}

          {currentStep === 'done' && (
            <DoneStep onWiden={() => setWidenOpen(true)} onClose={onClose} />
          )}

          {/* Navigation Controls: BACK / SKIP / WIDEN */}
          {currentStep !== 'done' && (
            <div className="tune-actions">
              <button
                className="tune-action-btn"
                onClick={onGoBack}
                aria-label="Previous question"
              >
                ← BACK
              </button>

              <button
                className="tune-action-btn dim"
                onClick={() => {
                  onSkipStep(currentStep);
                }}
                aria-label="Skip this question"
              >
                SKIP →
              </button>

              <button
                className="tune-action-btn"
                onClick={() => setWidenOpen(true)}
                aria-label="Widen search — relax filters"
              >
                WIDEN
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 1. WHAT ARE WE WATCHING? (Format) ──────────────────────────────────────
function FormatStep({
  onSelect,
  current,
}: {
  onSelect: (v: 'movie' | 'series' | 'anime' | 'all') => void;
  current?: string;
}) {
  return (
    <>
      <h2 className="tune-q-text">What are we watching?</h2>
      <div className="tune-choices">
        {[
          { v: 'movie', l: 'MOVIE' },
          { v: 'series', l: 'SERIES' },
          { v: 'anime', l: 'ANIME' },
          { v: 'all', l: 'ANY FORMAT' },
        ].map(({ v, l }) => (
          <button
            key={v}
            className={`tune-choice${v === 'all' ? ' any' : ''}${current === v ? ' selected' : ''}`}
            onClick={() => onSelect(v as 'movie' | 'series' | 'anime' | 'all')}
            aria-pressed={current === v}
          >
            {l}
          </button>
        ))}
      </div>
    </>
  );
}

// ── 2. WHAT LANGUAGE? (Multi-select) ───────────────────────────────────────
function LanguageStep({
  selectedCodes,
  onToggle,
  onClearAll,
  onConfirm,
  onSkip,
}: {
  selectedCodes: string[];
  onToggle: (code: string) => void;
  onClearAll: () => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const isAny = selectedCodes.length === 0;

  return (
    <>
      <h2 className="tune-q-text">What language?</h2>
      <div className="tune-choices">
        {LANGUAGE_CHOICES.map(({ code, label }) => {
          const isSelected = selectedCodes.includes(code);
          return (
            <button
              key={code}
              className={`tune-choice${isSelected ? ' selected' : ''}`}
              onClick={() => onToggle(code)}
              aria-pressed={isSelected}
            >
              {isSelected ? `${label} ✓` : label}
            </button>
          );
        })}
        <button
          className={`tune-choice any${isAny ? ' selected' : ''}`}
          onClick={onClearAll}
          aria-pressed={isAny}
        >
          {isAny ? 'ANY LANGUAGE ✓' : 'ANY LANGUAGE'}
        </button>
      </div>

      <div className="tune-actions" style={{ marginTop: 'var(--space-6)' }}>
        <button
          className="tune-action-btn primary"
          onClick={onConfirm}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onConfirm();
            }
          }}
          aria-label={selectedCodes.length > 0 ? `Done selecting ${selectedCodes.length} languages` : 'Done with all languages'}
        >
          {selectedCodes.length > 0
            ? `DONE (${selectedCodes.length} SELECTED) →`
            : 'DONE (ANY LANGUAGE) →'}
        </button>
      </div>
    </>
  );
}

// ── 3. WHERE CAN YOU WATCH? (Providers & Access) ───────────────────────────
function ProviderStep({
  providers,
  selectedIds,
  providerMode,
  onToggle,
  onSetMode,
  onConfirm,
  onSkip,
}: {
  providers: TMDBProviderInfo[];
  selectedIds: number[];
  providerMode: TuneSelections['providerMode'];
  onToggle: (id: number) => void;
  onSetMode: (m: TuneSelections['providerMode']) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <h2 className="tune-q-text">Where can you watch?</h2>

      {/* Provider Mode Selection */}
      <div className="tune-choices" style={{ marginBottom: 'var(--space-4)' }}>
        {(
          [
            { v: 'any', l: 'ANY OF THESE' },
            { v: 'all', l: 'ALL OF THESE' },
            { v: 'any-provider', l: 'ANY PROVIDER' },
          ] as { v: TuneSelections['providerMode']; l: string }[]
        ).map(({ v, l }) => (
          <button
            key={v}
            className={`tune-choice${providerMode === v ? ' selected' : ''}`}
            onClick={() => onSetMode(v)}
            aria-pressed={providerMode === v}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Provider List */}
      {providerMode !== 'any-provider' && (
        <div className="tune-choices">
          {providers.slice(0, 18).map((p) => {
            const isSelected = selectedIds.includes(p.provider_id);
            return (
              <button
                key={p.provider_id}
                className={`tune-choice${isSelected ? ' selected' : ''}`}
                onClick={() => onToggle(p.provider_id)}
                aria-pressed={isSelected}
              >
                {isSelected ? `${p.provider_name.toUpperCase()} ✓` : p.provider_name.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}

      <div className="tune-actions" style={{ marginTop: 'var(--space-6)' }}>
        <button
          className="tune-action-btn primary"
          onClick={onConfirm}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onConfirm();
            }
          }}
          aria-label={selectedIds.length > 0 ? `Done selecting ${selectedIds.length} providers` : 'Done with providers'}
        >
          {selectedIds.length > 0
            ? `DONE (${selectedIds.length} SELECTED) →`
            : 'DONE →'}
        </button>
      </div>
    </>
  );
}

// ── 4. HOW MUCH TIME DO YOU HAVE? (Runtime) ────────────────────────────────
function RuntimeStep({
  onSelect,
  current,
}: {
  onSelect: (v: string) => void;
  current?: string;
}) {
  return (
    <>
      <h2 className="tune-q-text">How much time do you have?</h2>
      <div className="tune-choices">
        {[
          { v: 'under-90', l: 'UNDER 90 MIN' },
          { v: '90-120', l: '90–120 MIN' },
          { v: '120-150', l: '120–150 MIN' },
          { v: '150+', l: '150+ MIN' },
          { v: 'all', l: 'ANY RUNTIME' },
        ].map(({ v, l }) => (
          <button
            key={v}
            className={`tune-choice${v === 'all' ? ' any' : ''}${current === v ? ' selected' : ''}`}
            onClick={() => onSelect(v)}
            aria-pressed={current === v}
          >
            {l}
          </button>
        ))}
      </div>
    </>
  );
}

// ── 5. WHEN SHOULD IT BE FROM? (Period) ────────────────────────────────────
function PeriodStep({
  onSelect,
  current,
}: {
  onSelect: (v: string) => void;
  current?: string;
}) {
  return (
    <>
      <h2 className="tune-q-text">When should it be from?</h2>
      <div className="tune-choices">
        {[
          { v: 'latest', l: 'LATEST' },
          { v: '2020s', l: '2020s' },
          { v: '2010s', l: '2010s' },
          { v: '2000s', l: '2000s' },
          { v: 'before-2000', l: 'BEFORE 2000' },
          { v: 'all', l: 'ANY ERA' },
        ].map(({ v, l }) => (
          <button
            key={v}
            className={`tune-choice${v === 'all' ? ' any' : ''}${current === v ? ' selected' : ''}`}
            onClick={() => onSelect(v)}
            aria-pressed={current === v}
          >
            {l}
          </button>
        ))}
      </div>
    </>
  );
}

// ── 6. WHAT KIND OF FILM? (Genre Multi-select) ─────────────────────────────
function GenreStep({
  genres,
  selected,
  onToggle,
  onConfirm,
  onSkip,
}: {
  genres: TMDBGenre[];
  selected: number[];
  onToggle: (id: number) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <h2 className="tune-q-text">What kind of film?</h2>
      <div className="tune-choices">
        {genres.slice(0, 18).map((g) => {
          const isSelected = selected.includes(g.id);
          return (
            <button
              key={g.id}
              className={`tune-choice${isSelected ? ' selected' : ''}`}
              onClick={() => onToggle(g.id)}
              aria-pressed={isSelected}
            >
              {isSelected ? `${g.name.toUpperCase()} ✓` : g.name.toUpperCase()}
            </button>
          );
        })}
      </div>
      <div className="tune-actions" style={{ marginTop: 'var(--space-6)' }}>
        <button
          className="tune-action-btn primary"
          onClick={onConfirm}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onConfirm();
            }
          }}
          aria-label={selected.length > 0 ? `Done selecting ${selected.length} genres` : 'Done with genres'}
        >
          {selected.length > 0
            ? `DONE (${selected.length} GENRES) →`
            : 'DONE (ANY GENRE) →'}
        </button>
      </div>
    </>
  );
}

// ── 7. WHO'S WATCHING? (Age Group) ─────────────────────────────────────────
function AgeGroupStep({
  onSelect,
  current,
}: {
  onSelect: (v: string) => void;
  current?: string;
}) {
  return (
    <>
      <h2 className="tune-q-text">Who&apos;s watching?</h2>
      <div className="tune-choices">
        {AGE_GROUP_CHOICES.map(({ value, label }) => (
          <button
            key={value}
            className={`tune-choice${current === value ? ' selected' : ''}`}
            onClick={() => onSelect(value)}
            aria-pressed={current === value}
          >
            {label}
          </button>
        ))}
        <button
          className={`tune-choice any${!current || current === 'all' ? ' selected' : ''}`}
          onClick={() => onSelect('all')}
          aria-pressed={!current || current === 'all'}
        >
          ANY AUDIENCE
        </button>
      </div>
    </>
  );
}

// ── 8. WHAT SHOULD IT FEEL LIKE? (Mood) ─────────────────────────────────────
function MoodStep({
  onSelect,
  current,
}: {
  onSelect: (v: string) => void;
  current?: string;
}) {
  return (
    <>
      <h2 className="tune-q-text">What should it feel like?</h2>
      <div className="tune-choices">
        {MOOD_CHOICES.map(({ value, label }) => (
          <button
            key={value}
            className={`tune-choice${current === value ? ' selected' : ''}`}
            onClick={() => onSelect(value)}
            aria-pressed={current === value}
          >
            {label}
          </button>
        ))}
        <button
          className={`tune-choice any${!current || current === 'all' ? ' selected' : ''}`}
          onClick={() => onSelect('all')}
          aria-pressed={!current || current === 'all'}
        >
          SURPRISE ME
        </button>
      </div>
    </>
  );
}

// ── 9. DONE STEP ────────────────────────────────────────────────────────────
function DoneStep({
  onWiden,
  onClose,
}: {
  onWiden: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <h2 className="tune-q-text">Your collection is ready.</h2>
      <div className="tune-choices">
        <button className="tune-choice primary" onClick={onClose} style={{ borderColor: 'var(--color-accent)' }}>
          EXPLORE THE FIELD →
        </button>
        <button className="tune-choice any" onClick={onWiden}>
          WIDEN SEARCH
        </button>
      </div>
    </>
  );
}

// ── WIDEN SEARCH MODAL ─────────────────────────────────────────────────────
function WidenPanel({
  selections,
  onWiden,
  onClose,
}: {
  selections: TuneSelections;
  onWiden: (step: TuneStep) => void;
  onClose: () => void;
}) {
  const widenableSteps: Array<{ step: TuneStep; name: string; value: string | null }> = (
    [
      {
        step: 'runtime' as TuneStep,
        name: 'RUNTIME',
        value: selections.runtime && selections.runtime !== 'all' ? runtimeLabel(selections.runtime) : null,
      },
      {
        step: 'period' as TuneStep,
        name: 'RELEASE PERIOD',
        value: selections.period && selections.period !== 'all' ? periodLabel(selections.period) : null,
      },
      {
        step: 'genre' as TuneStep,
        name: 'GENRE',
        value: selections.genreNames?.length ? selections.genreNames.join(', ') : null,
      },
      {
        step: 'mood' as TuneStep,
        name: 'MOOD',
        value: selections.mood && selections.mood !== 'all' ? moodLabel(selections.mood) : null,
      },
    ] as Array<{ step: TuneStep; name: string; value: string | null }>
  ).filter((s) => s.value !== null);

  const lockedSteps = [
    { name: 'REGION', reason: 'LOCKED' },
    { name: 'PROVIDER / ACCESS', reason: 'LOCKED' },
    { name: 'FORMAT', reason: 'LOCKED' },
    { name: 'LANGUAGE', reason: 'LOCKED' },
    { name: 'AGE SAFETY', reason: 'LOCKED' },
  ];

  return (
    <div className="widen-panel">
      <h2 className="widen-title">Widen the search?</h2>
      <p className="widen-subtitle">
        Choose which preferences to relax. Region, provider, format, language, and age safety stay fixed.
      </p>

      <div className="widen-options">
        {widenableSteps.length === 0 && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--color-text-muted)',
              textAlign: 'center',
            }}
          >
            No soft filters are currently active.
          </p>
        )}

        {widenableSteps.map(({ step, name, value }) => (
          <button
            key={step}
            className="widen-option"
            onClick={() => onWiden(step)}
            aria-label={`Remove ${name} filter: ${value}`}
          >
            <span className="widen-option-name">{name}</span>
            <span className="widen-option-value">{value} ×</span>
          </button>
        ))}

        {lockedSteps.map(({ name, reason }) => (
          <div key={name} className="widen-locked" aria-label={`${name} — cannot be relaxed`}>
            <span className="widen-locked-name">{name}</span>
            <span className="widen-locked-badge">{reason}</span>
          </div>
        ))}
      </div>

      <div className="tune-actions" style={{ marginTop: 'var(--space-6)', justifyContent: 'center' }}>
        <button className="tune-action-btn" onClick={onClose}>
          ← BACK
        </button>
      </div>
    </div>
  );
}
