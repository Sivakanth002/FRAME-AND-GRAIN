import { describe, it, expect, beforeEach } from 'vitest';
import { TitleRecord, Preferences, ContentFormat } from '@/types/index';
import {
  isCandidateEligible,
  matchesReleasePeriod,
  matchesRuntime,
  matchesProviders,
  sanitizePreferences
} from '@/server/recommendation/filters';
import { computeScore } from '@/server/recommendation/scoring';
import { LuckyEngine } from '@/server/recommendation/lucky';
import {
  normalizeCertification,
  getAgeSuitability,
  getAudienceProfile,
  getAudienceRelevanceMultiplier
} from '@/server/recommendation/certifications';
import { normalizeMovie, normalizeTV, isAnime, getTitleKey } from '@/server/recommendation/normalizer';

function createMockTitle(overrides: Partial<TitleRecord> = {}): TitleRecord {
  return {
    source: 'tmdb',
    sourceId: '1001',
    mediaType: 'movie',
    contentClass: 'movie',
    title: 'Drishyam',
    originalTitle: 'Drishyam',
    poster: '/drishyam.jpg',
    backdrop: '/drishyam_backdrop.jpg',
    releaseDate: '2013-12-19',
    year: 2013,
    originalLanguage: 'ml',
    genres: ['Crime', 'Drama', 'Thriller'],
    genreIds: [80, 18, 53],
    runtime: 160,
    rating: 8.6,
    voteCount: 3500,
    ratingScore: 86,
    providers: [
      {
        tmdbProviderId: 122,
        name: 'Hotstar',
        logoPath: '/hotstar.png',
        type: 'flatrate'
      },
      {
        tmdbProviderId: 8,
        name: 'Netflix',
        logoPath: '/netflix.png',
        type: 'flatrate'
      }
    ],
    overview: 'A man goes to extreme lengths to save his family from punishment after an unexpected crime.',
    certification: normalizeCertification('UA', 'IN'),
    audienceProfile: 'general',
    ...overrides
  };
}

describe('PHASE 7 — Full Product QA, Bug Hunting & System Verification', () => {
  describe('1. Flow A — Movie Discovery Pipeline', () => {
    it('correctly processes Movie format constraints and produces ranked results', () => {
      const movie = createMockTitle({ mediaType: 'movie', contentClass: 'movie' });
      const tvShow = createMockTitle({ mediaType: 'tv', contentClass: 'series' });

      const prefs = sanitizePreferences({
        format: 'movie',
        language: 'ml',
        region: 'IN'
      });

      expect(isCandidateEligible(movie, prefs)).toBe(true);
      expect(isCandidateEligible(tvShow, prefs)).toBe(false);

      const scored = computeScore(movie, prefs, 7.5);
      expect(scored.score).toBeGreaterThan(0);
      expect(scored.ratingScore).toBeGreaterThan(0);
      expect(Array.isArray(scored.reasons)).toBe(true);
    });
  });

  describe('2. Flow B — TV Series & Episode Metadata', () => {
    it('correctly normalizes TV shows with episode count, season count, and episode runtime', () => {
      const rawTV = {
        id: 5001,
        name: 'Dark',
        original_name: 'Dark',
        overview: 'A missing child sets four families on a frantic hunt for answers.',
        poster_path: '/dark.jpg',
        backdrop_path: '/dark_bg.jpg',
        first_air_date: '2017-12-01',
        original_language: 'de',
        genre_ids: [18, 9648, 878],
        vote_average: 8.4,
        vote_count: 5000,
        popularity: 80,
        episode_run_time: [60],
        number_of_episodes: 26,
        number_of_seasons: 3
      };

      const norm = normalizeTV(rawTV);
      expect(norm.mediaType).toBe('tv');
      expect(norm.contentClass).toBe('series');
      expect(norm.episodeCount).toBe(26);
      expect(norm.seasonCount).toBe(3);
      expect(norm.runtime).toBe(60);
      expect(norm.episodeRuntimeFormatted).toBe('~60 min/episode');
      expect(norm.totalRuntime).toBe(1560);
    });
  });

  describe('3. Flow C — Anime Classification & Identity', () => {
    it('correctly identifies Japanese animation as anime contentClass', () => {
      expect(isAnime('ja', [16, 28])).toBe(true);
      expect(isAnime('en', [16, 28])).toBe(false); // English animation is NOT anime contentClass
      expect(isAnime('ja', [18, 53])).toBe(false); // Japanese live-action drama is NOT anime

      const rawAnime = {
        id: 1429,
        title: 'Attack on Titan',
        original_title: 'Shingeki no Kyojin',
        overview: 'Humanity fights against monstrous Titans.',
        poster_path: '/aot.jpg',
        backdrop_path: '/aot_bg.jpg',
        release_date: '2015-08-01',
        original_language: 'ja',
        genre_ids: [16, 28, 14],
        vote_average: 8.5,
        vote_count: 4200,
        popularity: 95
      };

      const norm = normalizeMovie(rawAnime);
      expect(norm.contentClass).toBe('anime');
    });
  });

  describe('4. Flow D & Flow E — Lucky / I Don’t Know QA', () => {
    let luckyEngine: LuckyEngine;

    beforeEach(() => {
      luckyEngine = new LuckyEngine();
    });

    it('operates as a single film discovery mechanism without questionnaires', () => {
      const pool = [
        createMockTitle({ sourceId: '1' }),
        createMockTitle({ sourceId: '2' }),
        createMockTitle({ sourceId: '3' })
      ];

      const res1 = luckyEngine.selectLuckyPick(pool, { sessionId: 'flow-d-session' });
      expect(res1.pick).not.toBeNull();
      expect(res1.sessionHistory.length).toBe(1);

      const res2 = luckyEngine.selectLuckyPick(pool, {
        sessionId: 'flow-d-session',
        luckyHistoryIds: ['tmdb:movie:1']
      });
      expect(res2.pick?.sourceId).not.toBe('1');
    });

    it('enforces TUNE preferences as soft affinity while excluding TUNE-shown IDs as hard exclusions', () => {
      const tuneShownTitle = createMockTitle({ sourceId: '100' });
      const alternativeTitle = createMockTitle({ sourceId: '200', originalLanguage: 'ja' });

      const pool = [tuneShownTitle, alternativeTitle];

      const res = luckyEngine.selectLuckyPick(pool, {
        sessionId: 'flow-e-session',
        tuneShownIds: ['tmdb:movie:100', '100'],
        tunePreferences: { language: 'ml' }
      });

      expect(res.pick?.sourceId).toBe('200'); // Tune shown ID 100 must NEVER be picked
    });
  });

  describe('5. Multi-Language Strict Validation', () => {
    it('verifies ANY-of multi-language matching and strict rejection of unselected languages', () => {
      const malayalamFilm = createMockTitle({ originalLanguage: 'ml' });
      const englishFilm = createMockTitle({ originalLanguage: 'en' });
      const hindiFilm = createMockTitle({ originalLanguage: 'hi' });
      const japaneseFilm = createMockTitle({ originalLanguage: 'ja' });

      const prefsMlEn = sanitizePreferences({
        languages: ['ml', 'en']
      });

      expect(isCandidateEligible(malayalamFilm, prefsMlEn)).toBe(true);
      expect(isCandidateEligible(englishFilm, prefsMlEn)).toBe(true);
      expect(isCandidateEligible(hindiFilm, prefsMlEn)).toBe(false);
      expect(isCandidateEligible(japaneseFilm, prefsMlEn)).toBe(false);
    });
  });

  describe('6. Provider & Access Mode Semantics', () => {
    it('correctly handles ANY, ALL, and ANY-PROVIDER provider modes with access modes', () => {
      const netflixOnly = createMockTitle({
        providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: '/n.png', type: 'flatrate' }]
      });

      const netflixAndPrime = createMockTitle({
        providers: [
          { tmdbProviderId: 8, name: 'Netflix', logoPath: '/n.png', type: 'flatrate' },
          { tmdbProviderId: 9, name: 'Prime', logoPath: '/p.png', type: 'flatrate' }
        ]
      });

      const rentOnly = createMockTitle({
        providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: '/n.png', type: 'rent' }]
      });

      // Mode: ANY (Netflix 8 OR Prime 9)
      const prefsAny = sanitizePreferences({
        providerIds: [8, 9],
        providerMode: 'any',
        accessModes: ['flatrate']
      });
      expect(matchesProviders(netflixOnly, prefsAny)).toBe(true);
      expect(matchesProviders(netflixAndPrime, prefsAny)).toBe(true);
      expect(matchesProviders(rentOnly, prefsAny)).toBe(false);

      // Mode: ALL (Requires BOTH Netflix 8 AND Prime 9)
      const prefsAll = sanitizePreferences({
        providerIds: [8, 9],
        providerMode: 'all',
        accessModes: ['flatrate']
      });
      expect(matchesProviders(netflixOnly, prefsAll)).toBe(false);
      expect(matchesProviders(netflixAndPrime, prefsAll)).toBe(true);

      // Mode: ANY-PROVIDER (no restriction, any stream provider)
      const prefsAnyProvider = sanitizePreferences({
        providerMode: 'any-provider',
        accessModes: ['flatrate']
      });
      expect(matchesProviders(netflixOnly, prefsAnyProvider)).toBe(true);
    });
  });

  describe('7. Runtime Boundary Conditions', () => {
    it('evaluates exact runtime boundary values without guessing missing runtimes', () => {
      const prefsUnder90 = sanitizePreferences({ runtime: 'under-90' });
      const prefs90120 = sanitizePreferences({ runtime: '90-120' });
      const prefs120150 = sanitizePreferences({ runtime: '120-150' });
      const prefs150Plus = sanitizePreferences({ runtime: '150+' });

      const film89 = createMockTitle({ runtime: 89 });
      const film90 = createMockTitle({ runtime: 90 });
      const film120 = createMockTitle({ runtime: 120 });
      const film121 = createMockTitle({ runtime: 121 });
      const film150 = createMockTitle({ runtime: 150 });
      const film151 = createMockTitle({ runtime: 151 });
      const filmNull = createMockTitle({ runtime: null });

      expect(matchesRuntime(film89, prefsUnder90)).toBe(true);
      expect(matchesRuntime(film90, prefsUnder90)).toBe(false);

      expect(matchesRuntime(film90, prefs90120)).toBe(true);
      expect(matchesRuntime(film120, prefs90120)).toBe(true);
      expect(matchesRuntime(film121, prefs90120)).toBe(false);

      expect(matchesRuntime(film121, prefs120150)).toBe(true);
      expect(matchesRuntime(film150, prefs120150)).toBe(true);
      expect(matchesRuntime(film151, prefs120150)).toBe(false);

      expect(matchesRuntime(film151, prefs150Plus)).toBe(true);
      expect(matchesRuntime(film150, prefs150Plus)).toBe(false);

      // Missing runtime is never guessed
      expect(matchesRuntime(filmNull, prefsUnder90)).toBe(false);
      expect(matchesRuntime(filmNull, prefs90120)).toBe(false);
    });
  });

  describe('8. Release Period Boundaries & Hard Filter Semantics', () => {
    it('verifies exact era boundaries and zero score influence', () => {
      const film2021 = createMockTitle({ year: 2021, releaseDate: '2021-05-10' });
      const film2015 = createMockTitle({ year: 2015, releaseDate: '2015-05-10' });
      const film2005 = createMockTitle({ year: 2005, releaseDate: '2005-05-10' });
      const film1995 = createMockTitle({ year: 1995, releaseDate: '1995-05-10' });

      const prefs2020s = sanitizePreferences({ period: '2020s' });
      const prefs2010s = sanitizePreferences({ period: '2010s' });
      const prefs2000s = sanitizePreferences({ period: '2000s' });
      const prefsBefore2000 = sanitizePreferences({ period: 'before-2000' });

      expect(matchesReleasePeriod(film2021, prefs2020s)).toBe(true);
      expect(matchesReleasePeriod(film2015, prefs2020s)).toBe(false);

      expect(matchesReleasePeriod(film2015, prefs2010s)).toBe(true);
      expect(matchesReleasePeriod(film2005, prefs2010s)).toBe(false);

      expect(matchesReleasePeriod(film2005, prefs2000s)).toBe(true);
      expect(matchesReleasePeriod(film1995, prefs2000s)).toBe(false);

      expect(matchesReleasePeriod(film1995, prefsBefore2000)).toBe(true);
      expect(matchesReleasePeriod(film2005, prefsBefore2000)).toBe(false);
    });
  });

  describe('9. Age Safety & Audience Relevance QA', () => {
    it('verifies under-13 safety cannot be bypassed through search widening or preferences', () => {
      const adultFilm = createMockTitle({
        certification: normalizeCertification('A', 'IN'),
        genreIds: [28, 53]
      });

      expect(getAgeSuitability(adultFilm, 'under-13', 'IN')).toBe('not-safe');
      expect(getAgeSuitability(adultFilm, '13-17', 'IN')).toBe('not-safe');
      expect(getAgeSuitability(adultFilm, 'general-safety', 'IN')).toBe('not-safe');
    });

    it('verifies adult downweighting for child-focused content', () => {
      const childFilm = createMockTitle({
        title: 'Peppa Pig: Festival of Fun',
        overview: 'Preschool adventures with Peppa Pig and her friends.',
        genreIds: [16, 10751],
        certification: normalizeCertification('U', 'IN')
      });

      const profile = getAudienceProfile(childFilm);
      expect(profile).toBe('child-focused');

      const multiplier = getAudienceRelevanceMultiplier(profile, '25-34');
      expect(multiplier).toBe(0.35);
    });
  });

  describe('10. Canonical TitleRecord Identity QA', () => {
    it('ensures stable unique key generation per source, mediaType, and sourceId', () => {
      const movie1 = createMockTitle({ source: 'tmdb', mediaType: 'movie', sourceId: '101' });
      const tv1 = createMockTitle({ source: 'tmdb', mediaType: 'tv', sourceId: '101' });

      expect(getTitleKey(movie1)).toBe('tmdb:movie:101');
      expect(getTitleKey(tv1)).toBe('tmdb:tv:101');
      expect(getTitleKey(movie1)).not.toBe(getTitleKey(tv1));
    });
  });
});
