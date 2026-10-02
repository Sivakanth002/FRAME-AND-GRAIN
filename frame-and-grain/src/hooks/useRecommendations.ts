'use client';
// ============================================================================
// FRAME & GRAIN — useRecommendations hook
// Fetches TUNE and Lucky recommendations from the server engine
//
// KEY FEATURES:
// 1. Race condition protection via AbortController + sequence counters
// 2. Full synchronization of multi-language, providers, ageGroup, and mood
// 3. Strict Lucky / TUNE separation
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  TitleRecord,
  RecommendationResult,
  TuneSelections
} from '@/types/ui';

export function useRecommendations(sessionId: string) {
  const [items, setItems] = useState<TitleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [thinPool, setThinPool] = useState(false);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Inflight request cancellation & race condition protection
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const lastSelectionsRef = useRef<TuneSelections>({});

  // Actual title IDs returned by TUNE — used for Lucky/TUNE separation (hard exclusion)
  const tuneShownIdsRef = useRef<string[]>([]);

  // Initialize from sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('fg_tune_shown_ids');
        if (stored) {
          tuneShownIdsRef.current = JSON.parse(stored);
        }
      } catch {}
    }
  }, []);

  const fetchTune = useCallback(async (selections: TuneSelections) => {
    lastSelectionsRef.current = selections;
    const currentReqId = ++requestIdRef.current;

    // Abort any pending fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('mode', 'tune');
      params.set('sessionId', sessionId);

      if (selections.region) params.set('region', selections.region);
      if (selections.format && selections.format !== 'all') params.set('format', selections.format);

      if (selections.languages && selections.languages.length > 0) {
        params.set('languages', selections.languages.join(','));
      } else if (selections.language && selections.language !== 'all') {
        params.set('language', selections.language);
      }

      if (selections.runtime && selections.runtime !== 'all') params.set('runtime', selections.runtime);
      if (selections.period && selections.period !== 'all') params.set('period', selections.period);
      if (selections.genreIds?.length) params.set('genreIds', selections.genreIds.join(','));
      if (selections.ageGroup && selections.ageGroup !== 'all') params.set('ageGroup', selections.ageGroup);
      if (selections.mood && selections.mood !== 'all') params.set('mood', selections.mood);
      if (selections.providerIds?.length) params.set('providerIds', selections.providerIds.join(','));
      if (selections.providerMode) params.set('providerMode', selections.providerMode);
      if (selections.accessModes?.length) params.set('accessModes', selections.accessModes.join(','));

      const res = await fetch(`/api/recommendations?${params.toString()}`, {
        signal: controller.signal
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const json = (await res.json()) as { success: boolean; data: RecommendationResult };
      if (!json.success) throw new Error('Recommendation fetch failed');

      // Ignore if a newer request was dispatched in the meantime
      if (currentReqId !== requestIdRef.current) return;

      const result = json.data;
      setItems(result.items);
      setThinPool(result.thinPool);
      setEligibleCount(result.eligibleCount);

      // Track actual TUNE-shown title IDs
      const updatedShown = [
        ...tuneShownIdsRef.current,
        ...result.items.map((i) => `${i.source}:${i.mediaType}:${i.sourceId}`)
      ].slice(-60);
      tuneShownIdsRef.current = updatedShown;
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('fg_tune_shown_ids', JSON.stringify(updatedShown));
        } catch {}
      }

    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        // Request was aborted by newer fetch — ignore
        return;
      }
      if (currentReqId === requestIdRef.current) {
        setError((err as Error).message);
      }
    } finally {
      if (currentReqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [sessionId]);

  const retry = useCallback(() => {
    fetchTune(lastSelectionsRef.current);
  }, [fetchTune]);

  const getTuneShownIds = useCallback(() => tuneShownIdsRef.current, []);

  return { items, loading, thinPool, eligibleCount, error, fetchTune, retry, getTuneShownIds };
}

export function useLucky(sessionId: string) {
  const [pick, setPick] = useState<TitleRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stackRef = useRef<TitleRecord[]>([]);
  const [stackIndex, setStackIndex] = useState(-1);
  const luckyHistoryRef = useRef<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('fg_lucky_history');
        if (stored) {
          luckyHistoryRef.current = JSON.parse(stored);
        }
      } catch {}
    }
  }, []);

  const fetchLucky = useCallback(async (
    tuneSelections: TuneSelections,
    tuneShownIds: string[] = [],
    customLuckyHistory?: string[]
  ) => {
    const currentReqId = ++requestIdRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const luckyHistory = customLuckyHistory ?? luckyHistoryRef.current;

      const params = new URLSearchParams();
      params.set('mode', 'lucky');
      params.set('sessionId', sessionId);

      if (tuneSelections.region) params.set('region', tuneSelections.region);
      if (tuneSelections.providerIds?.length) params.set('providerIds', tuneSelections.providerIds.join(','));
      if (tuneSelections.providerMode) params.set('providerMode', tuneSelections.providerMode);
      if (tuneSelections.accessModes?.length) params.set('accessModes', tuneSelections.accessModes.join(','));

      // Soft affinity signals
      if (tuneSelections.format && tuneSelections.format !== 'all') params.set('tuneFormat', tuneSelections.format);
      if (tuneSelections.languages && tuneSelections.languages.length > 0) {
        params.set('tuneLanguages', tuneSelections.languages.join(','));
      } else if (tuneSelections.language && tuneSelections.language !== 'all') {
        params.set('tuneLanguage', tuneSelections.language);
      }
      if (tuneSelections.genreIds?.length) params.set('tuneGenreIds', tuneSelections.genreIds.join(','));
      if (tuneSelections.ageGroup && tuneSelections.ageGroup !== 'all') params.set('tuneAgeGroup', tuneSelections.ageGroup);
      if (tuneSelections.mood && tuneSelections.mood !== 'all') params.set('tuneMood', tuneSelections.mood);

      // Hard exclusions
      if (luckyHistory.length) params.set('luckyHistory', luckyHistory.join(','));
      if (tuneShownIds.length) params.set('tuneShownIds', tuneShownIds.join(','));

      const res = await fetch(`/api/recommendations?${params.toString()}`, {
        signal: controller.signal
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const json = (await res.json()) as { success: boolean; data: RecommendationResult };
      if (!json.success) throw new Error('Lucky fetch failed');

      if (currentReqId !== requestIdRef.current) return;

      const result = json.data;
      const newPick = result.luckyPick ?? null;

      if (newPick) {
        const key = `${newPick.source}:${newPick.mediaType}:${newPick.sourceId}`;
        const updatedHistory = [...luckyHistoryRef.current, key];
        luckyHistoryRef.current = updatedHistory;
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('fg_lucky_history', JSON.stringify(updatedHistory));
          } catch {}
        }
        const newStack = [...stackRef.current.slice(0, stackIndex + 1), newPick];
        stackRef.current = newStack;
        setStackIndex(newStack.length - 1);
        setPick(newPick);
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      if (currentReqId === requestIdRef.current) {
        setError((err as Error).message);
      }
    } finally {
      if (currentReqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [sessionId, stackIndex]);

  const goBack = useCallback(() => {
    if (stackIndex > 0) {
      const prev = stackRef.current[stackIndex - 1];
      setStackIndex((i) => i - 1);
      setPick(prev);
    }
  }, [stackIndex]);

  const canGoBack = stackIndex > 0;
  const getLuckyHistory = useCallback(() => luckyHistoryRef.current, []);

  const reset = useCallback(() => {
    stackRef.current = [];
    setStackIndex(-1);
    setPick(null);
  }, []);

  return { pick, loading, error, fetchLucky, goBack, canGoBack, getLuckyHistory, reset };
}
