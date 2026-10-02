import { describe, it, expect, vi } from 'vitest';
import {
  isCandidateEligible,
  sanitizePreferences,
  DEFAULT_PREFERENCES
} from '../../src/server/recommendation/filters.js';
import {
  isAnime,
  normalizeMovie,
  normalizeTV,
  getTitleKey
} from '../../src/server/recommendation/normalizer.js';
import { RecommendationEngine } from '../../src/server/recommendation/engine.js';
import { TMDBClient } from '../../src/server/tmdb/client.js';
import { TitleRecord } from '../../src/types/index.js';

describe('Hard Filters & Identity Pipeline', () => {
  const baseMovie: TitleRecord = {
    source: 'tmdb',
    sourceId: '101',
    mediaType: 'movie',
    contentClass: 'movie',
    title: 'The Great Story',
    originalTitle: 'The Great Story',
    poster: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/backdrop.jpg',
    releaseDate: '2023-05-15',
    year: 2023,
    originalLanguage: 'en',
    genres: ['Drama', 'Thriller'],
    genreIds: [18, 53],
    runtime: 110,
    rating: 8.1,
    voteCount: 1200,
    ratingScore: 0,
    providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' }],
    certification: {
      region: 'IN',
      rawRating: 'U',
      minimumAge: 0,
      source: 'tmdb',
      confidence: 'verified'
    },
    audienceProfile: 'general',
    overview: 'A thrilling drama.'
  };

  const baseTV: TitleRecord = {
    ...baseMovie,
    sourceId: '201',
    mediaType: 'tv',
    contentClass: 'series',
    title: 'Mystery Series',
    runtime: 45,
    episodeRuntimeFormatted: '~45 min/episode'
  };

  const baseAnime: TitleRecord = {
    ...baseMovie,
    sourceId: '301',
    mediaType: 'tv',
    contentClass: 'anime',
    title: 'Attack on Titan',
    originalLanguage: 'ja',
    genres: ['Animation', 'Action'],
    genreIds: [16, 28]
  };

  it('1. should strictly enforce movie vs series vs anime format filtering', () => {
    const moviePrefs = sanitizePreferences({ format: 'movie' });
    expect(isCandidateEligible(baseMovie, moviePrefs)).toBe(true);
    expect(isCandidateEligible(baseTV, moviePrefs)).toBe(false);
    expect(isCandidateEligible(baseAnime, moviePrefs)).toBe(false);

    const seriesPrefs = sanitizePreferences({ format: 'series' });
    expect(isCandidateEligible(baseMovie, seriesPrefs)).toBe(false);
    expect(isCandidateEligible(baseTV, seriesPrefs)).toBe(true);
    expect(isCandidateEligible(baseAnime, seriesPrefs)).toBe(false); // Series must not be anime

    const animePrefs = sanitizePreferences({ format: 'anime' });
    expect(isCandidateEligible(baseMovie, animePrefs)).toBe(false);
    expect(isCandidateEligible(baseTV, animePrefs)).toBe(false);
    expect(isCandidateEligible(baseAnime, animePrefs)).toBe(true);

    const allPrefs = sanitizePreferences({ format: 'all' });
    expect(isCandidateEligible(baseMovie, allPrefs)).toBe(true);
    expect(isCandidateEligible(baseTV, allPrefs)).toBe(true);
    expect(isCandidateEligible(baseAnime, allPrefs)).toBe(true);
  });

  it('2. should deterministically classify anime using Japanese language + Animation genre (16)', () => {
    expect(isAnime('ja', [16, 28])).toBe(true);
    expect(isAnime('Japanese', [16])).toBe(true);
    expect(isAnime('en', [16, 28])).toBe(false); // English animation is not anime
    expect(isAnime('ja', [18, 53])).toBe(false); // Japanese live action is not anime
    expect(isAnime('fr', [16])).toBe(false);
  });

  it('3. should enforce strict canonical original language matching with multi-language support', () => {
    const mlPrefs = sanitizePreferences({ language: 'ml' });
    const mlMovie: TitleRecord = { ...baseMovie, originalLanguage: 'ml' };
    const enMovie: TitleRecord = { ...baseMovie, originalLanguage: 'en' };
    const taMovie: TitleRecord = { ...baseMovie, originalLanguage: 'ta' };
    const hiMovie: TitleRecord = { ...baseMovie, originalLanguage: 'hi' };

    expect(isCandidateEligible(mlMovie, mlPrefs)).toBe(true);
    expect(isCandidateEligible(enMovie, mlPrefs)).toBe(false);

    // Multi-language selection: Malayalam + English + Tamil qualifies titles in any of these languages
    const multiLangPrefs = sanitizePreferences({ languages: ['ml', 'en', 'ta'] });
    expect(isCandidateEligible(mlMovie, multiLangPrefs)).toBe(true);
    expect(isCandidateEligible(enMovie, multiLangPrefs)).toBe(true);
    expect(isCandidateEligible(taMovie, multiLangPrefs)).toBe(true);
    expect(isCandidateEligible(hiMovie, multiLangPrefs)).toBe(false);

    const allPrefs = sanitizePreferences({ language: 'all' });
    expect(isCandidateEligible(mlMovie, allPrefs)).toBe(true);
    expect(isCandidateEligible(enMovie, allPrefs)).toBe(true);
  });

  it('3b. should accept ageGroup as broad personalization signal without failing eligibility', () => {
    const agePrefs = sanitizePreferences({ ageGroup: '18-24' });
    expect(agePrefs.ageGroup).toBe('18-24');
    expect(isCandidateEligible(baseMovie, agePrefs)).toBe(true);
  });

  it('4. should preserve atomic title identity and never borrow posters or metadata', () => {
    const rawNoPoster = {
      id: 9999,
      title: 'Indie Feature',
      original_title: 'Indie Feature',
      overview: 'No poster art.',
      poster_path: null,
      backdrop_path: null,
      original_language: 'en',
      genre_ids: [18],
      vote_average: 7.0,
      vote_count: 50,
      popularity: 10
    };

    const normalized = normalizeMovie(rawNoPoster);
    expect(normalized.source).toBe('tmdb');
    expect(normalized.sourceId).toBe('9999');
    expect(getTitleKey(normalized)).toBe('tmdb:movie:9999');
    expect(normalized.poster).toBeNull();
    expect(normalized.backdrop).toBeNull();
  });

  it('5. should handle thin-pool threshold (<10) with one bounded expansion toward ~120 candidates', async () => {
    const mockClient = new TMDBClient({ readAccessToken: 'test-token' });
    const engine = new RecommendationEngine(mockClient);

    let fetchCount = 0;
    vi.spyOn(engine, 'fetchCandidatePool').mockImplementation(async (_prefs, startPage) => {
      fetchCount++;
      if (startPage === 1) {
        // Initial pool (pages 1..3) returns 2 eligible items
        return [
          { ...baseMovie, sourceId: '1' },
          { ...baseMovie, sourceId: '2' }
        ];
      } else {
        // Expansion pool (pages 4..6) returns 2 more items
        return [
          { ...baseMovie, sourceId: '3' },
          { ...baseMovie, sourceId: '4' }
        ];
      }
    });

    const result = await engine.getRecommendations({
      preferences: { format: 'movie' }
    });

    expect(fetchCount).toBe(2); // Exactly one bounded expansion
    expect(result.expanded).toBe(true);
    expect(result.eligibleCount).toBe(4);
    expect(result.thinPool).toBe(true); // <10 eligible candidates remaining
  });
});
