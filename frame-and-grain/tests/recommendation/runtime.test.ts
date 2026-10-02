import { describe, it, expect } from 'vitest';
import {
  matchesRuntime,
  isCandidateEligible,
  sanitizePreferences
} from '../../src/server/recommendation/filters.js';
import { formatTVEpisodeRuntime } from '../../src/server/recommendation/normalizer.js';
import { TitleRecord } from '../../src/types/index.js';

describe('Runtime Hard Filtering & TV Durations', () => {
  const createTitleWithRuntime = (id: string, runtime: number | null, isTV = false): TitleRecord => ({
    source: 'tmdb',
    sourceId: id,
    mediaType: isTV ? 'tv' : 'movie',
    contentClass: isTV ? 'series' : 'movie',
    title: `Film ${runtime}m`,
    originalTitle: `Film ${runtime}m`,
    poster: null,
    backdrop: null,
    releaseDate: '2023-01-01',
    year: 2023,
    originalLanguage: 'en',
    genres: ['Drama'],
    genreIds: [18],
    runtime,
    episodeRuntimeFormatted: isTV ? formatTVEpisodeRuntime(runtime) : null,
    rating: 7.5,
    voteCount: 500,
    ratingScore: 0,
    providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' }],
    overview: ''
  });

  it('1. should enforce hard runtime buckets correctly', () => {
    const under90 = createTitleWithRuntime('1', 85);
    const mid90_120 = createTitleWithRuntime('2', 105);
    const mid120_150 = createTitleWithRuntime('3', 135);
    const over150 = createTitleWithRuntime('4', 160);

    // under-90: runtime < 90
    expect(matchesRuntime(under90, sanitizePreferences({ runtime: 'under-90' }))).toBe(true);
    expect(matchesRuntime(mid90_120, sanitizePreferences({ runtime: 'under-90' }))).toBe(false);

    // 90-120: 90 <= runtime <= 120
    expect(matchesRuntime(mid90_120, sanitizePreferences({ runtime: '90-120' }))).toBe(true);
    expect(matchesRuntime(under90, sanitizePreferences({ runtime: '90-120' }))).toBe(false);
    expect(matchesRuntime(mid120_150, sanitizePreferences({ runtime: '90-120' }))).toBe(false);

    // 120-150: 120 < runtime <= 150
    expect(matchesRuntime(mid120_150, sanitizePreferences({ runtime: '120-150' }))).toBe(true);
    expect(matchesRuntime(mid90_120, sanitizePreferences({ runtime: '120-150' }))).toBe(false);
    expect(matchesRuntime(over150, sanitizePreferences({ runtime: '120-150' }))).toBe(false);

    // 150+: runtime > 150
    expect(matchesRuntime(over150, sanitizePreferences({ runtime: '150+' }))).toBe(true);
    expect(matchesRuntime(mid120_150, sanitizePreferences({ runtime: '150+' }))).toBe(false);

    // all: no restriction
    expect(matchesRuntime(under90, sanitizePreferences({ runtime: 'all' }))).toBe(true);
    expect(matchesRuntime(over150, sanitizePreferences({ runtime: 'all' }))).toBe(true);
  });

  it('2. should exclude titles with missing runtime (null) when a specific runtime bucket is selected', () => {
    const tvNoRuntime = createTitleWithRuntime('5', null, true);

    // When specific bucket is requested, missing runtime must fail
    expect(matchesRuntime(tvNoRuntime, sanitizePreferences({ runtime: 'under-90' }))).toBe(false);
    expect(matchesRuntime(tvNoRuntime, sanitizePreferences({ runtime: '90-120' }))).toBe(false);
    expect(isCandidateEligible(tvNoRuntime, sanitizePreferences({ runtime: '90-120' }))).toBe(false);

    // When runtime is 'all', missing runtime passes
    expect(matchesRuntime(tvNoRuntime, sanitizePreferences({ runtime: 'all' }))).toBe(true);
    expect(isCandidateEligible(tvNoRuntime, sanitizePreferences({ runtime: 'all' }))).toBe(true);
  });

  it('3. should format TV episode runtimes accurately', () => {
    expect(formatTVEpisodeRuntime(45)).toBe('~45 min/episode');
    expect(formatTVEpisodeRuntime(60)).toBe('~60 min/episode');
    expect(formatTVEpisodeRuntime(null)).toBeNull();
    expect(formatTVEpisodeRuntime(undefined)).toBeNull();
    expect(formatTVEpisodeRuntime(0)).toBeNull();
  });
});
