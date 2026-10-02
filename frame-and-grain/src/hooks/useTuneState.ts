'use client';
// ============================================================================
// FRAME & GRAIN — useTuneState hook
// Manages complete TUNE question sequence, selections, and chip editing
//
// SEQUENCE:
// format → language → provider → runtime → period → genre → ageGroup → mood → done
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import type { TuneSelections, TuneStep, TuneFormat } from '@/types/ui';

export const QUESTION_SEQUENCE: TuneStep[] = [
  'format',
  'language',
  'provider',
  'runtime',
  'period',
  'genre',
  'ageGroup',
  'mood',
  'done'
];

export interface TuneChip {
  step: TuneStep;
  label: string;
  value: unknown;
}

const TUNE_STORAGE_KEY = 'fg_tune_selections';

export function useTuneState() {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<TuneStep>('format');
  const [selections, setSelections] = useState<TuneSelections>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(TUNE_STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch {}
    }
    return {
      region: 'IN',
      accessModes: ['flatrate'],
      providerMode: 'any',
    };
  });
  const [transitioning, setTransitioning] = useState(false);

  // Sync state changes to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(TUNE_STORAGE_KEY, JSON.stringify(selections));
      } catch {}
    }
  }, [selections]);

  const getChips = useCallback((): TuneChip[] => {
    const chips: TuneChip[] = [];

    if (selections.format && selections.format !== 'all') {
      chips.push({ step: 'format', label: selections.format.toUpperCase(), value: selections.format });
    }

    if (selections.languages && selections.languages.length > 0) {
      const label = selections.languages.map((code) => languageLabel(code)).join(' + ');
      chips.push({ step: 'language', label, value: selections.languages });
    } else if (selections.language && selections.language !== 'all') {
      chips.push({ step: 'language', label: languageLabel(selections.language), value: selections.language });
    }

    if (selections.providerNames?.length) {
      chips.push({ step: 'provider', label: selections.providerNames.join(' + '), value: selections.providerIds });
    }

    if (selections.runtime && selections.runtime !== 'all') {
      chips.push({ step: 'runtime', label: runtimeLabel(selections.runtime), value: selections.runtime });
    }

    if (selections.period && selections.period !== 'all') {
      chips.push({ step: 'period', label: periodLabel(selections.period), value: selections.period });
    }

    if (selections.genreNames?.length) {
      chips.push({ step: 'genre', label: selections.genreNames.join(' + '), value: selections.genreIds });
    }

    if (selections.ageGroup && selections.ageGroup !== 'all') {
      chips.push({ step: 'ageGroup', label: ageGroupLabel(selections.ageGroup), value: selections.ageGroup });
    }

    if (selections.mood && selections.mood !== 'all') {
      chips.push({ step: 'mood', label: moodLabel(selections.mood), value: selections.mood });
    }

    return chips;
  }, [selections]);

  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  const advanceStep = useCallback(() => {
    clearTimer();
    setTransitioning(true);
    transitionTimerRef.current = setTimeout(() => {
      setCurrentStep((step) => {
        const idx = QUESTION_SEQUENCE.indexOf(step);
        return QUESTION_SEQUENCE[Math.min(idx + 1, QUESTION_SEQUENCE.length - 1)];
      });
      setTransitioning(false);
      transitionTimerRef.current = null;
    }, 180);
  }, [clearTimer]);

  const goToStep = useCallback((step: TuneStep) => {
    clearTimer();
    setTransitioning(true);
    transitionTimerRef.current = setTimeout(() => {
      setCurrentStep(step);
      setTransitioning(false);
      transitionTimerRef.current = null;
    }, 180);
  }, [clearTimer]);

  const goBack = useCallback(() => {
    clearTimer();
    setTransitioning(true);
    transitionTimerRef.current = setTimeout(() => {
      setCurrentStep((step) => {
        const idx = QUESTION_SEQUENCE.indexOf(step);
        if (idx > 0) {
          return QUESTION_SEQUENCE[idx - 1];
        }
        return step;
      });
      setTransitioning(false);
      transitionTimerRef.current = null;
    }, 180);
  }, [clearTimer]);

  const setFormat = useCallback((format: TuneFormat | 'all') => {
    setSelections((s) => ({ ...s, format: format === 'all' ? undefined : format }));
    advanceStep();
  }, [advanceStep]);

  const setLanguages = useCallback((codes: string[], names: string[]) => {
    setSelections((s) => ({
      ...s,
      languages: codes.length > 0 ? codes : undefined,
      languageNames: names.length > 0 ? names : undefined,
      language: codes.length === 1 ? codes[0] : (codes.length > 1 ? codes.join(',') : 'all')
    }));
    advanceStep();
  }, [advanceStep]);

  const setLanguage = useCallback((lang: string) => {
    if (lang === 'all' || !lang) {
      setSelections((s) => {
        const next = { ...s };
        delete next.languages;
        delete next.languageNames;
        next.language = 'all';
        return next;
      });
    } else {
      const codes = lang.includes(',') ? lang.split(',') : [lang];
      setSelections((s) => ({
        ...s,
        languages: codes,
        languageNames: codes.map(languageLabel),
        language: lang
      }));
    }
    advanceStep();
  }, [advanceStep]);

  const setProviders = useCallback((ids: number[], names: string[], mode: TuneSelections['providerMode']) => {
    setSelections((s) => ({
      ...s,
      providerIds: ids.length > 0 ? ids : undefined,
      providerNames: names.length > 0 ? names : undefined,
      providerMode: mode
    }));
    advanceStep();
  }, [advanceStep]);

  const setRuntime = useCallback((runtime: string) => {
    setSelections((s) => ({ ...s, runtime: runtime === 'all' ? undefined : runtime }));
    advanceStep();
  }, [advanceStep]);

  const setPeriod = useCallback((period: string) => {
    setSelections((s) => ({ ...s, period: period === 'all' ? undefined : period }));
    advanceStep();
  }, [advanceStep]);

  const setGenres = useCallback((ids: number[], names: string[]) => {
    setSelections((s) => ({
      ...s,
      genreIds: ids.length > 0 ? ids : undefined,
      genreNames: names.length > 0 ? names : undefined
    }));
    advanceStep();
  }, [advanceStep]);

  const setAgeGroup = useCallback((ageGroup: string) => {
    setSelections((s) => ({
      ...s,
      ageGroup: ageGroup === 'all' ? undefined : ageGroup
    }));
    advanceStep();
  }, [advanceStep]);

  const setMood = useCallback((mood: string) => {
    setSelections((s) => ({ ...s, mood: mood === 'all' ? undefined : mood }));
    advanceStep();
  }, [advanceStep]);

  const clearStep = useCallback((step: TuneStep) => {
    setSelections((s) => {
      const next = { ...s };
      if (step === 'format') { delete next.format; }
      if (step === 'language') {
        delete next.languages;
        delete next.languageNames;
        next.language = 'all';
      }
      if (step === 'provider') {
        delete next.providerIds;
        delete next.providerNames;
        next.providerMode = 'any-provider';
      }
      if (step === 'runtime') { delete next.runtime; }
      if (step === 'period') { delete next.period; }
      if (step === 'genre') {
        delete next.genreIds;
        delete next.genreNames;
      }
      if (step === 'ageGroup') { delete next.ageGroup; }
      if (step === 'mood') { delete next.mood; }
      return next;
    });
  }, []);

  const skipStep = useCallback((step: TuneStep) => {
    clearStep(step);
    advanceStep();
  }, [clearStep, advanceStep]);

  const openTune = useCallback((startStep?: TuneStep) => {
    clearTimer();
    setTransitioning(false);
    if (startStep) {
      setCurrentStep(startStep);
    } else {
      setSelections((s) => {
        if (s.format && s.format !== 'all') {
          setCurrentStep('language');
        } else {
          setCurrentStep('format');
        }
        return s;
      });
    }
    setOpen(true);
  }, [clearTimer]);

  const closeTune = useCallback(() => setOpen(false), []);

  const reset = useCallback(() => {
    setSelections({ region: 'IN', accessModes: ['flatrate'], providerMode: 'any' });
    setCurrentStep('format');
  }, []);

  return {
    open,
    openTune,
    closeTune,
    currentStep,
    selections,
    chips: getChips(),
    transitioning,
    setFormat,
    setLanguages,
    setLanguage,
    setProviders,
    setRuntime,
    setPeriod,
    setGenres,
    setAgeGroup,
    setMood,
    clearStep,
    skipStep,
    goToStep,
    goBack,
    reset,
  };
}

// Display helpers
export function languageLabel(code: string): string {
  const map: Record<string, string> = {
    en: 'ENGLISH',
    hi: 'HINDI',
    ml: 'MALAYALAM',
    ta: 'TAMIL',
    te: 'TELUGU',
    ja: 'JAPANESE',
    ko: 'KOREAN',
    fr: 'FRENCH',
    es: 'SPANISH',
    de: 'GERMAN',
    it: 'ITALIAN',
    pt: 'PORTUGUESE'
  };
  return map[code.toLowerCase()] || code.toUpperCase();
}

export function runtimeLabel(r: string): string {
  const map: Record<string, string> = {
    'under-90': 'UNDER 90 MIN',
    '90-120': '90–120 MIN',
    '120-150': '120–150 MIN',
    '150+': '150+ MIN'
  };
  return map[r] || r;
}

export function periodLabel(p: string): string {
  const map: Record<string, string> = {
    latest: 'LATEST',
    '2020s': '2020s',
    '2010s': '2010s',
    '2000s': '2000s',
    'before-2000': 'BEFORE 2000'
  };
  return map[p] || p.toUpperCase();
}

export function ageGroupLabel(a: string): string {
  const map: Record<string, string> = {
    'under-13': 'UNDER 13',
    '13-17': '13–17',
    '18-24': '18–24',
    '25-34': '25–34',
    '35-44': '35–44',
    '45-54': '45–54',
    '55+': '55+',
    'prefer-not-to-say': 'PREFER NOT TO SAY'
  };
  return map[a] || a.toUpperCase();
}

export function moodLabel(m: string): string {
  const map: Record<string, string> = {
    thrilled: 'THRILLED',
    moved: 'MOVED',
    unsettled: 'UNSETTLED',
    inspired: 'INSPIRED',
    laugh: 'MAKE ME LAUGH',
    think: 'MAKE ME THINK',
    dark: 'SOMETHING DARK',
    relaxed: 'KEEP IT GENTLE'
  };
  return map[m] || m.toUpperCase();
}
