import { describe, it, expect } from 'vitest';
import {
  matchesReleasePeriod,
  isCandidateEligible,
  sanitizePreferences
} from '../../src/server/recommendation/filters.js';
import { computeScore, computeActiveWeights } from '../../src/server/recommendation/scoring.js';
import { TitleRecord } from '../../src/types/index.js';

describe('Release Period Hard Filtering & Scoring Absence', () => {
  const currentYear = new Date().getFullYear();

  const createTitleWithDate = (id: string, date: string, year: number): TitleRecord => ({
    source: 'tmdb',
    sourceId: id,
    mediaType: 'movie',
    contentClass: 'movie',
    title: `Film ${year}`,
    originalTitle: `Film ${year}`,
    poster: null,
    backdrop: null,
    releaseDate: date,
    year,
    originalLanguage: 'en',
    genres: ['Drama'],
    genreIds: [18],
    runtime: 100,
    rating: 8.0,
    voteCount: 500,
    ratingScore: 0,
    providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' }],
    overview: ''
  });

  const latestTitle = createTitleWithDate('1', `${currentYear - 1}-06-01`, currentYear - 1);
  const old2020sTitle = createTitleWithDate('2', '2021-03-15', 2021);
  const title2010s = createTitleWithDate('3', '2015-11-20', 2015);
  const title2000s = createTitleWithDate('4', '2005-07-04', 2005);
  const titleBefore2000 = createTitleWithDate('5', '1994-09-23', 1994);

  it('1. should strictly filter release periods (latest, 2020s, 2010s, 2000s, before-2000)', () => {
    // latest = last 3 years
    const latestPrefs = sanitizePreferences({ period: 'latest' });
    expect(matchesReleasePeriod(latestTitle, latestPrefs)).toBe(true);
    expect(matchesReleasePeriod(title2010s, latestPrefs)).toBe(false);

    // 2020s: 2020 - 2029
    const p2020s = sanitizePreferences({ period: '2020s' });
    expect(matchesReleasePeriod(old2020sTitle, p2020s)).toBe(true);
    expect(matchesReleasePeriod(title2010s, p2020s)).toBe(false);

    // 2010s: 2010 - 2019
    const p2010s = sanitizePreferences({ period: '2010s' });
    expect(matchesReleasePeriod(title2010s, p2010s)).toBe(true);
    expect(matchesReleasePeriod(title2000s, p2010s)).toBe(false);

    // 2000s: 2000 - 2009
    const p2000s = sanitizePreferences({ period: '2000s' });
    expect(matchesReleasePeriod(title2000s, p2000s)).toBe(true);
    expect(matchesReleasePeriod(titleBefore2000, p2000s)).toBe(false);

    // before-2000: < 2000
    const pBefore2000 = sanitizePreferences({ period: 'before-2000' });
    expect(matchesReleasePeriod(titleBefore2000, pBefore2000)).toBe(true);
    expect(matchesReleasePeriod(title2000s, pBefore2000)).toBe(false);
  });

  it('2. should enforce explicit customDateRange as hard boundary', () => {
    const customPrefs = sanitizePreferences({
      customDateRange: { start: '2000-01-01', end: '2018-12-31' }
    });

    expect(isCandidateEligible(title2010s, customPrefs)).toBe(true); // 2015 is in range
    expect(isCandidateEligible(title2000s, customPrefs)).toBe(true); // 2005 is in range
    expect(isCandidateEligible(titleBefore2000, customPrefs)).toBe(false); // 1994 is before start
    expect(isCandidateEligible(latestTitle, customPrefs)).toBe(false); // 2025 is after end
  });

  it('3. should verify that Release Period NEVER contributes to scoring weights (0 score contribution)', () => {
    const prefsAll = sanitizePreferences({ period: 'all' });
    const prefs2020s = sanitizePreferences({ period: '2020s' });

    const weights = computeActiveWeights(prefs2020s);
    // There must NOT be any period component in ActiveWeights
    expect('period' in weights.raw).toBe(false);

    // Scoring same title with different period preference should yield identical scores
    const scoredAll = computeScore(old2020sTitle, prefsAll, 7.0);
    const scored2020s = computeScore(old2020sTitle, prefs2020s, 7.0);

    expect(scoredAll.score).toBe(scored2020s.score);
  });
});
