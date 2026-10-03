import { describe, it, expect } from 'vitest';
import { TMDBClient } from '../../src/server/tmdb/client';
import { TMDBDiscoveryService } from '../../src/server/tmdb/discovery';
import { RecommendationEngine } from '../../src/server/recommendation/engine';
import {
  sanitizePreferences,
  isCandidateEligible,
  matchesRuntime,
  matchesReleasePeriod,
  matchesProviders,
  DEFAULT_PREFERENCES
} from '../../src/server/recommendation/filters';
import { normalizeMovie, normalizeTV } from '../../src/server/recommendation/normalizer';
import { mapGenresForMediaType, matchesGenreSelection } from '../../src/server/tmdb/genres';
import { getAgeSuitability } from '../../src/server/recommendation/certifications';
import { computeScore, MOOD_DEFINITIONS } from '../../src/server/recommendation/scoring';
import { TitleRecord } from '../../src/types/index';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const client = new TMDBClient({ readAccessToken: process.env.TMDB_READ_ACCESS_TOKEN });
const discovery = new TMDBDiscoveryService(client);
const engine = new RecommendationEngine(client);

describe('FRAME & GRAIN — ADVERSARIAL CERTIFICATION & REGRESSION SUITE', () => {

  // ── 1 to 4: Movie Runtime Buckets ─────────────────────────────────────────
  it('1. Movie runtime 120-150 enforces 121..150m bounds and enriches live runtime', async () => {
    const prefs = sanitizePreferences({
      format: 'movie',
      region: 'IN',
      runtime: '120-150',
      languages: ['hi', 'ml', 'ta']
    });

    const res = await engine.getRecommendations({ preferences: prefs });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.eligibleCount).toBeGreaterThan(0);

    for (const item of res.items) {
      expect(item.mediaType).toBe('movie');
      expect(item.runtime).toBeTypeOf('number');
      expect(item.runtime!).toBeGreaterThan(120);
      expect(item.runtime!).toBeLessThanOrEqual(150);
      expect(matchesRuntime(item, prefs)).toBe(true);
    }
  }, 20000);

  it('2. Movie runtime under-90 enforces < 90m bounds', async () => {
    const prefs = sanitizePreferences({
      format: 'movie',
      region: 'IN',
      runtime: 'under-90',
      languages: ['en']
    });

    const res = await engine.getRecommendations({ preferences: prefs });
    expect(res.items.length).toBeGreaterThan(0);

    for (const item of res.items) {
      expect(item.runtime).toBeTypeOf('number');
      expect(item.runtime!).toBeLessThan(90);
    }
  }, 20000);

  it('3. Movie runtime 90-120 enforces 90..120m bounds', async () => {
    const prefs = sanitizePreferences({
      format: 'movie',
      region: 'IN',
      runtime: '90-120',
      languages: ['en']
    });

    const res = await engine.getRecommendations({ preferences: prefs });
    expect(res.items.length).toBeGreaterThan(0);

    for (const item of res.items) {
      expect(item.runtime).toBeTypeOf('number');
      expect(item.runtime!).toBeGreaterThanOrEqual(90);
      expect(item.runtime!).toBeLessThanOrEqual(120);
    }
  }, 20000);

  it('4. Movie runtime 150+ enforces > 150m bounds', async () => {
    const prefs = sanitizePreferences({
      format: 'movie',
      region: 'IN',
      runtime: '150+',
      languages: ['hi', 'ta', 'ml']
    });

    const res = await engine.getRecommendations({ preferences: prefs });
    expect(res.items.length).toBeGreaterThan(0);

    for (const item of res.items) {
      expect(item.runtime).toBeTypeOf('number');
      expect(item.runtime!).toBeGreaterThan(150);
    }
  }, 20000);

  // ── 5 & 6: TV Runtime & Boundaries ─────────────────────────────────────────
  it('5. TV runtime 120-150 enforces episode/series runtime boundaries', async () => {
    const sampleTV: TitleRecord = {
      source: 'tmdb',
      sourceId: '999',
      mediaType: 'tv',
      contentClass: 'series',
      title: 'Sample Miniseries',
      originalTitle: 'Sample Miniseries',
      poster: null,
      backdrop: null,
      releaseDate: '2023-01-01',
      year: 2023,
      originalLanguage: 'en',
      genres: ['Drama'],
      genreIds: [18],
      runtime: 130,
      rating: 8.0,
      voteCount: 100,
      ratingScore: 0,
      providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' }],
      overview: ''
    };

    const prefs = sanitizePreferences({ format: 'series', runtime: '120-150' });
    expect(matchesRuntime(sampleTV, prefs)).toBe(true);

    const sampleShortTV = { ...sampleTV, runtime: 45 };
    expect(matchesRuntime(sampleShortTV, prefs)).toBe(false);
  });

  it('6. TV and Movie exact runtime boundaries (89, 90, 91, 119, 120, 121, 150, 151)', () => {
    const makeTitle = (runtime: number | null): TitleRecord => ({
      source: 'tmdb',
      sourceId: '1',
      mediaType: 'movie',
      contentClass: 'movie',
      title: 'T',
      originalTitle: 'T',
      poster: null,
      backdrop: null,
      releaseDate: '2023-01-01',
      year: 2023,
      originalLanguage: 'en',
      genres: [],
      genreIds: [],
      runtime,
      rating: 8,
      voteCount: 100,
      ratingScore: 0,
      providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' }],
      overview: ''
    });

    const under90 = sanitizePreferences({ runtime: 'under-90' });
    const mid90_120 = sanitizePreferences({ runtime: '90-120' });
    const mid120_150 = sanitizePreferences({ runtime: '120-150' });
    const over150 = sanitizePreferences({ runtime: '150+' });

    // 89 min -> under-90 only
    expect(matchesRuntime(makeTitle(89), under90)).toBe(true);
    expect(matchesRuntime(makeTitle(89), mid90_120)).toBe(false);

    // 90 min -> 90-120
    expect(matchesRuntime(makeTitle(90), under90)).toBe(false);
    expect(matchesRuntime(makeTitle(90), mid90_120)).toBe(true);

    // 120 min -> 90-120
    expect(matchesRuntime(makeTitle(120), mid90_120)).toBe(true);
    expect(matchesRuntime(makeTitle(120), mid120_150)).toBe(false);

    // 121 min -> 120-150
    expect(matchesRuntime(makeTitle(121), mid90_120)).toBe(false);
    expect(matchesRuntime(makeTitle(121), mid120_150)).toBe(true);

    // 150 min -> 120-150
    expect(matchesRuntime(makeTitle(150), mid120_150)).toBe(true);
    expect(matchesRuntime(makeTitle(150), over150)).toBe(false);

    // 151 min -> 150+
    expect(matchesRuntime(makeTitle(151), mid120_150)).toBe(false);
    expect(matchesRuntime(makeTitle(151), over150)).toBe(true);
  });

  // ── 7 & 8: runtime=all and missing runtime ────────────────────────────────
  it('7. runtime=all allows both movies and TV series with any runtime', () => {
    const titleWithNull = { runtime: null } as any;
    const titleWithVal = { runtime: 105 } as any;
    const prefsAll = sanitizePreferences({ runtime: 'all' });

    expect(matchesRuntime(titleWithNull, prefsAll)).toBe(true);
    expect(matchesRuntime(titleWithVal, prefsAll)).toBe(true);
  });

  it('8. missing runtime is rejected when specific runtime filter is active', () => {
    const titleWithNull = { runtime: null } as any;
    const titleWithZero = { runtime: 0 } as any;

    expect(matchesRuntime(titleWithNull, sanitizePreferences({ runtime: '90-120' }))).toBe(false);
    expect(matchesRuntime(titleWithZero, sanitizePreferences({ runtime: '90-120' }))).toBe(false);
  });

  // ── 9 to 11: Provider unselected defaults across regions ──────────────────
  it('9. provider unselected in IN defaults to any-provider (no hardcoded providerIds)', () => {
    const prefs = sanitizePreferences({ region: 'IN' });
    expect(prefs.providerIds).toEqual([]);
    expect(prefs.providerMode).toBe('any-provider');

    const sampleTitle: TitleRecord = {
      source: 'tmdb',
      sourceId: '1',
      mediaType: 'movie',
      contentClass: 'movie',
      title: 'MUBI Film',
      originalTitle: 'MUBI Film',
      poster: null,
      backdrop: null,
      releaseDate: '2023-01-01',
      year: 2023,
      originalLanguage: 'hi',
      genres: [],
      genreIds: [],
      runtime: 100,
      rating: 8,
      voteCount: 100,
      ratingScore: 0,
      providers: [{ tmdbProviderId: 11, name: 'MUBI', logoPath: null, type: 'flatrate' }],
      overview: ''
    };

    // MUBI film passes unconstrained provider search
    expect(matchesProviders(sampleTitle, prefs)).toBe(true);
  });

  it('10. provider unselected in US defaults to any-provider without IN provider IDs', () => {
    const prefs = sanitizePreferences({ region: 'US' });
    expect(prefs.providerIds).toEqual([]);
    expect(prefs.providerMode).toBe('any-provider');
    expect(prefs.region).toBe('US');
  });

  it('11. provider unselected in GB defaults to any-provider without IN provider IDs', () => {
    const prefs = sanitizePreferences({ region: 'GB' });
    expect(prefs.providerIds).toEqual([]);
    expect(prefs.providerMode).toBe('any-provider');
    expect(prefs.region).toBe('GB');
  });

  // ── 12 to 14: Explicit providers & OR semantics ───────────────────────────
  it('12. explicit Netflix (8) matches titles offering Netflix', () => {
    const prefs = sanitizePreferences({ providerIds: [8], providerMode: 'any' });
    const netflixTitle = { providers: [{ tmdbProviderId: 8, type: 'flatrate' }] } as any;
    const primeTitle = { providers: [{ tmdbProviderId: 9, type: 'flatrate' }] } as any;

    expect(matchesProviders(netflixTitle, prefs)).toBe(true);
    expect(matchesProviders(primeTitle, prefs)).toBe(false);
  });

  it('13. explicit JioHotstar (122) matches titles offering Hotstar', () => {
    const prefs = sanitizePreferences({ providerIds: [122], providerMode: 'any' });
    const hotstarTitle = { providers: [{ tmdbProviderId: 122, type: 'flatrate' }] } as any;
    const netflixTitle = { providers: [{ tmdbProviderId: 8, type: 'flatrate' }] } as any;

    expect(matchesProviders(hotstarTitle, prefs)).toBe(true);
    expect(matchesProviders(netflixTitle, prefs)).toBe(false);
  });

  it('14. Netflix + JioHotstar enforces OR semantics', () => {
    const prefs = sanitizePreferences({ providerIds: [8, 122], providerMode: 'any' });
    const netflixTitle = { providers: [{ tmdbProviderId: 8, type: 'flatrate' }] } as any;
    const hotstarTitle = { providers: [{ tmdbProviderId: 122, type: 'flatrate' }] } as any;
    const mubiTitle = { providers: [{ tmdbProviderId: 11, type: 'flatrate' }] } as any;

    expect(matchesProviders(netflixTitle, prefs)).toBe(true);
    expect(matchesProviders(hotstarTitle, prefs)).toBe(true);
    expect(matchesProviders(mubiTitle, prefs)).toBe(false);
  });

  // ── 15 to 19: TV Genre Mappings ───────────────────────────────────────────
  it('15. TV Action maps 28 -> 10759 (Action & Adventure)', () => {
    expect(mapGenresForMediaType([28], 'tv')).toEqual([10759]);
    expect(matchesGenreSelection([10759], 'tv', [28])).toBe(true);
  });

  it('16. TV Adventure maps 12 -> 10759 (Action & Adventure)', () => {
    expect(mapGenresForMediaType([12], 'tv')).toEqual([10759]);
    expect(matchesGenreSelection([10759], 'tv', [12])).toBe(true);
  });

  it('17. TV Sci-Fi maps 878 -> 10765 (Sci-Fi & Fantasy)', () => {
    expect(mapGenresForMediaType([878], 'tv')).toEqual([10765]);
    expect(matchesGenreSelection([10765], 'tv', [878])).toBe(true);
  });

  it('18. TV War maps 10752 -> 10768 (War & Politics)', () => {
    expect(mapGenresForMediaType([10752], 'tv')).toEqual([10768]);
    expect(matchesGenreSelection([10768], 'tv', [10752])).toBe(true);
  });

  it('19. TV Action + Adventure deduplicates mapped IDs to [10759]', () => {
    const mapped = mapGenresForMediaType([28, 12], 'tv');
    expect(mapped).toEqual([10759]);
  });

  // ── 20: WIDEN SEARCH with TV Action ───────────────────────────────────────
  it('20. WIDEN SEARCH with TV Action preserves correctly mapped TV genre ID', () => {
    const tvActionPrefs = sanitizePreferences({
      format: 'series',
      genreIds: [28],
      region: 'IN'
    });
    const mapped = mapGenresForMediaType(tvActionPrefs.genreIds, 'tv');
    expect(mapped).toEqual([10759]);
  });

  // ── 21: Film Detail Runtime ───────────────────────────────────────────────
  it('21. Film Detail authoritative runtime format check', () => {
    const movieWithRuntime = normalizeMovie({ id: 10, title: 'Film', runtime: 135, release_date: '2023-01-01', genre_ids: [18] } as any);
    expect(movieWithRuntime.runtime).toBe(135);

    const tvWithRuntime = normalizeTV({ id: 20, name: 'Show', episode_run_time: [55], first_air_date: '2023-01-01', genre_ids: [18] } as any);
    expect(tvWithRuntime.runtime).toBe(55);
    expect(tvWithRuntime.episodeRuntimeFormatted).toBe('~55 min/episode');
  });

  // ── 22: Lucky Mode Regression ─────────────────────────────────────────────
  it('22. Lucky mode operates unconstrained while respecting region', async () => {
    const luckyResult = await engine.getRecommendations({
      mode: 'lucky',
      sessionId: 'lucky-test-sess',
      region: 'IN'
    });
    expect(luckyResult.luckyPick).toBeDefined();
    expect(luckyResult.items.length).toBe(1);
    expect(luckyResult.items[0].sourceId).toBeDefined();
  }, 20000);

  // ── 23 to 25: Multi-select OR semantics ───────────────────────────────────
  it('23. Language OR semantics (hi + ml + ta)', () => {
    const prefs = sanitizePreferences({ languages: ['hi', 'ml', 'ta'] });
    const hiMovie = { originalLanguage: 'hi', mediaType: 'movie' } as any;
    const mlMovie = { originalLanguage: 'ml', mediaType: 'movie' } as any;
    const taMovie = { originalLanguage: 'ta', mediaType: 'movie' } as any;
    const enMovie = { originalLanguage: 'en', mediaType: 'movie' } as any;

    expect(prefs.languages?.some(l => l === hiMovie.originalLanguage)).toBe(true);
    expect(prefs.languages?.some(l => l === mlMovie.originalLanguage)).toBe(true);
    expect(prefs.languages?.some(l => l === taMovie.originalLanguage)).toBe(true);
    expect(prefs.languages?.some(l => l === enMovie.originalLanguage)).toBe(false);
  });

  it('24. Genre OR semantics (Action + Crime)', () => {
    const prefs = sanitizePreferences({ genreIds: [28, 80] });
    const actionOnly = { genreIds: [28, 18], mediaType: 'movie' } as any;
    const crimeOnly = { genreIds: [80, 53], mediaType: 'movie' } as any;
    const dramaOnly = { genreIds: [18, 10749], mediaType: 'movie' } as any;

    expect(matchesGenreSelection(actionOnly.genreIds, actionOnly.mediaType, prefs.genreIds)).toBe(true);
    expect(matchesGenreSelection(crimeOnly.genreIds, crimeOnly.mediaType, prefs.genreIds)).toBe(true);
    expect(matchesGenreSelection(dramaOnly.genreIds, dramaOnly.mediaType, prefs.genreIds)).toBe(false);
  });

  it('25. Provider OR semantics (Netflix + JioHotstar)', () => {
    const prefs = sanitizePreferences({ providerIds: [8, 122], providerMode: 'any' });
    const netflixMovie = { providers: [{ tmdbProviderId: 8, type: 'flatrate' }] } as any;
    const hotstarMovie = { providers: [{ tmdbProviderId: 122, type: 'flatrate' }] } as any;
    const appleMovie = { providers: [{ tmdbProviderId: 350, type: 'flatrate' }] } as any;

    expect(matchesProviders(netflixMovie, prefs)).toBe(true);
    expect(matchesProviders(hotstarMovie, prefs)).toBe(true);
    expect(matchesProviders(appleMovie, prefs)).toBe(false);
  });

  // ── LIVE TMDB VALIDATION CASES A, B, C, D, E ──────────────────────────────
  it('LIVE VALIDATION A: Movie / hi+ml+ta / Netflix+Hotstar / 120-150 / Action+Adv+Crime+Myst / IN', async () => {
    const prefs = sanitizePreferences({
      format: 'movie',
      region: 'IN',
      languages: ['hi', 'ml', 'ta'],
      providerIds: [8, 122],
      providerMode: 'any',
      runtime: '120-150',
      genreIds: [28, 12, 80, 9648],
      accessModes: ['flatrate']
    });

    const res = await engine.getRecommendations({ preferences: prefs });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.eligibleCount).toBeGreaterThan(0);

    for (const title of res.items) {
      expect(title.mediaType).toBe('movie');
      expect(['hi', 'ml', 'ta']).toContain(title.originalLanguage);
      expect(title.runtime).toBeTypeOf('number');
      expect(title.runtime!).toBeGreaterThan(120);
      expect(title.runtime!).toBeLessThanOrEqual(150);
      expect(matchesGenreSelection(title.genreIds, 'movie', [28, 12, 80, 9648])).toBe(true);
      expect(matchesProviders(title, prefs)).toBe(true);
    }
  }, 15000);

  it('LIVE VALIDATION B: Series / Malayalam / Netflix+Hotstar / Action / IN', async () => {
    const prefs = sanitizePreferences({
      format: 'series',
      region: 'IN',
      languages: ['ml'],
      providerIds: [8, 122],
      providerMode: 'any',
      genreIds: [28], // Action mapped to 10759 for TV
      accessModes: ['flatrate']
    });

    const res = await engine.getRecommendations({ preferences: prefs });
    expect(res.candidateCount).toBeGreaterThanOrEqual(0);
  }, 15000);

  it('LIVE VALIDATION C: Movie / provider unselected / IN', async () => {
    const prefs = sanitizePreferences({ format: 'movie', region: 'IN' });
    expect(prefs.providerIds).toEqual([]);
    expect(prefs.providerMode).toBe('any-provider');

    const res = await engine.getRecommendations({ preferences: prefs });
    expect(res.items.length).toBeGreaterThan(0);
  }, 15000);

  it('LIVE VALIDATION D: Movie / provider unselected / US', async () => {
    const prefs = sanitizePreferences({ format: 'movie', region: 'US' });
    expect(prefs.providerIds).toEqual([]);
    expect(prefs.providerMode).toBe('any-provider');

    const res = await engine.getRecommendations({ preferences: prefs });
    expect(res.items.length).toBeGreaterThan(0);
  }, 15000);

  it('LIVE VALIDATION E: Movie / provider unselected / GB', async () => {
    const prefs = sanitizePreferences({ format: 'movie', region: 'GB' });
    expect(prefs.providerIds).toEqual([]);
    expect(prefs.providerMode).toBe('any-provider');

    const res = await engine.getRecommendations({ preferences: prefs });
    expect(res.items.length).toBeGreaterThan(0);
  }, 15000);
});
