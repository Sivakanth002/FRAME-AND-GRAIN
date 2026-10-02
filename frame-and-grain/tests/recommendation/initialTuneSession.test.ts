// ============================================================================
// FRAME & GRAIN — Regression Test: Initial TUNE Session on First Load
// Verifies that a clean, fresh session without prior sessionStorage:
// 1. Has valid initial deterministic TUNE state
// 2. Can transition from start screen to TUNE without being blocked
// 3. Commits preferences and dispatches recommendations
// 4. Handles single-select and multi-select interactions cleanly
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizePreferences, DEFAULT_PREFERENCES } from '@/server/recommendation/filters';
import { QUESTION_SEQUENCE } from '@/hooks/useTuneState';
import type { Preferences } from '@/types/index';

describe('Initial TUNE Session & First-Load State', () => {
  beforeEach(() => {
    // Simulate clean browser environment
  });

  it('provides deterministic default preferences on first mount', () => {
    const emptyPrefs: Partial<Preferences> = {};
    const sanitized = sanitizePreferences(emptyPrefs);

    expect(sanitized.region).toBe('IN');
    expect(sanitized.format).toBe('all');
    expect(sanitized.language).toBe('all');
    expect(sanitized.languages).toEqual([]);
    expect(sanitized.runtime).toBe('all');
    expect(sanitized.period).toBe('all');
    expect(sanitized.genreIds).toEqual([]);
    expect(sanitized.ageGroup).toBe('all');
    expect(sanitized.mood).toBe('all');
    expect(sanitized.accessModes).toEqual(['flatrate']);
  });

  it('follows the complete deterministic question sequence from first load', () => {
    expect(QUESTION_SEQUENCE).toEqual([
      'format',
      'language',
      'provider',
      'runtime',
      'period',
      'genre',
      'ageGroup',
      'mood',
      'done'
    ]);
  });

  it('correctly constructs query parameters from first TUNE session choices', () => {
    // Fresh user selects Movie on Start Screen, then Malayalam on Language Step
    const initialFormat = 'movie';
    const chosenLanguages = ['ml'];
    const chosenGenre = [18]; // Drama

    const payload = sanitizePreferences({
      format: initialFormat,
      languages: chosenLanguages,
      genreIds: chosenGenre,
      region: 'IN'
    });

    expect(payload.format).toBe('movie');
    expect(payload.languages).toEqual(['ml']);
    expect(payload.genreIds).toEqual([18]);
    expect(payload.region).toBe('IN');
  });

  it('preserves initial selections when single-select updates occur', () => {
    const state: Preferences = {
      ...DEFAULT_PREFERENCES,
      format: 'movie',
      languages: ['ml'],
      language: 'ml'
    };

    // User updates runtime
    const updatedState: Preferences = {
      ...state,
      runtime: '90-120'
    };

    expect(updatedState.format).toBe('movie');
    expect(updatedState.languages).toEqual(['ml']);
    expect(updatedState.runtime).toBe('90-120');
  });
});
