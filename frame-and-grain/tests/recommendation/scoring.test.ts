import { describe, it, expect } from 'vitest';
import {
  calculateBayesianRating,
  computeActiveWeights,
  computeScore
} from '../../src/server/recommendation/scoring.js';
import { sanitizePreferences } from '../../src/server/recommendation/filters.js';
import { TitleRecord } from '../../src/types/index.js';

describe('Scoring Engine, Bayesian Rating & Weight Renormalization', () => {
  const sampleMovie: TitleRecord = {
    source: 'tmdb',
    sourceId: '2001',
    mediaType: 'movie',
    contentClass: 'movie',
    title: 'Cine Masterpiece',
    originalTitle: 'Cine Masterpiece',
    poster: null,
    backdrop: null,
    releaseDate: '2022-01-01',
    year: 2022,
    originalLanguage: 'en',
    genres: ['Drama'],
    genreIds: [18],
    runtime: 115,
    rating: 8.5,
    voteCount: 1400,
    ratingScore: 0,
    providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' }],
    overview: 'A deep drama about life.'
  };

  it('1. should calculate Bayesian weighted rating correctly: (v / (v + m)) * R + (m / (v + m)) * C', () => {
    const R = 8.5;
    const v = 350;
    const C = 7.0;
    const m = 350;

    // Expected: (350 / 700) * 8.5 + (350 / 700) * 7.0 = 4.25 + 3.5 = 7.75
    const bayesian = calculateBayesianRating(R, v, C, m);
    expect(bayesian).toBeCloseTo(7.75, 4);

    // Large vote count asymptotically approaches raw rating R
    const largeVote = calculateBayesianRating(8.5, 100000, 7.0, 350);
    expect(largeVote).toBeCloseTo(8.5, 1);

    // Low vote count pulled heavily toward candidate pool mean C
    const lowVote = calculateBayesianRating(8.5, 10, 7.0, 350);
    expect(lowVote).toBeCloseTo(7.04, 1);
  });

  it('2. should dynamically renormalize active weights when soft criteria are unavailable', () => {
    // 1. All soft components active: Genre: 25, Rating: 25, Mood: 15, Runtime: 10 (Total = 75)
    const allActivePrefs = sanitizePreferences({
      genreIds: [18],
      mood: 'moved',
      runtime: '90-120'
    });
    const { normalized: normAll } = computeActiveWeights(allActivePrefs);
    const sumAll = normAll.genre + normAll.rating + normAll.mood + normAll.runtime;
    expect(Math.round(sumAll)).toBe(100);
    expect(normAll.genre).toBeCloseTo((25 / 75) * 100, 2);
    expect(normAll.rating).toBeCloseTo((25 / 75) * 100, 2);
    expect(normAll.mood).toBeCloseTo((15 / 75) * 100, 2);
    expect(normAll.runtime).toBeCloseTo((10 / 75) * 100, 2);

    // 2. Only Rating active (all other soft components are 'all' / empty)
    const onlyRatingPrefs = sanitizePreferences({
      genreIds: [],
      mood: 'all',
      runtime: 'all'
    });
    const { normalized: normRating } = computeActiveWeights(onlyRatingPrefs);
    expect(normRating.rating).toBe(100);
    expect(normRating.genre).toBe(0);
    expect(normRating.mood).toBe(0);
    expect(normRating.runtime).toBe(0);
  });

  it('3. should verify language, release period, format never contribute to score', () => {
    const prefs1 = sanitizePreferences({
      language: 'en',
      period: '2020s',
      format: 'movie'
    });
    const prefs2 = sanitizePreferences({
      language: 'all',
      period: 'all',
      format: 'all'
    });

    const score1 = computeScore(sampleMovie, prefs1, 7.0);
    const score2 = computeScore(sampleMovie, prefs2, 7.0);

    expect(score1.score).toBe(score2.score);
  });

  it('4. should generate maximum 3 deterministic reasons based on authentic signals', () => {
    const scored = computeScore(
      sampleMovie,
      sanitizePreferences({ genreIds: [18], mood: 'moved', runtime: '90-120' }),
      7.0
    );

    expect(scored.reasons).toBeDefined();
    expect(scored.reasons!.length).toBeLessThanOrEqual(3);
    expect(scored.reasons!.length).toBeGreaterThan(0);
    // Verified reasons only (no fictional AI hallucinated text)
    expect(scored.reasons!.some((r) => r.includes('audience rating') || r.includes('matches your'))).toBe(true);
  });
});
