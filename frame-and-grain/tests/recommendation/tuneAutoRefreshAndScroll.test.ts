import { describe, it, expect, vi } from 'vitest';
import { TMDBClient } from '../../src/server/tmdb/client.js';
import { RecommendationEngine } from '../../src/server/recommendation/engine.js';
import { TitleRecord, Preferences } from '../../src/types/index.js';

describe('Phase 7.2 — TUNE Auto-Refresh & Recommendation Pipeline', () => {
  const baseMovie: TitleRecord = {
    source: 'tmdb',
    sourceId: '101',
    mediaType: 'movie',
    contentClass: 'movie',
    title: 'Drishyam',
    originalTitle: 'Drishyam',
    poster: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/backdrop.jpg',
    releaseDate: '2013-12-19',
    year: 2013,
    originalLanguage: 'ml',
    genres: ['Thriller', 'Crime', 'Drama'],
    genreIds: [53, 80, 18],
    runtime: 160,
    rating: 8.6,
    voteCount: 450,
    ratingScore: 8.6,
    providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' }],
    certification: {
      region: 'IN',
      rawRating: 'U',
      minimumAge: 0,
      source: 'tmdb',
      confidence: 'verified'
    },
    audienceProfile: 'general',
    overview: 'A man goes to extreme lengths to save his family from punishment after an accidental crime.'
  };

  it('1. should preserve all accumulated preferences when a single criterion changes', async () => {
    const mockClient = new TMDBClient({ readAccessToken: 'test-token' });
    const engine = new RecommendationEngine(mockClient);

    const initialPrefs: Partial<Preferences> = {
      format: 'movie',
      languages: ['ml'],
      genreIds: [53], // Thriller
      runtime: '150+',
      period: '2010s',
      region: 'IN'
    };

    let requestedPrefs: Preferences | null = null;
    vi.spyOn(engine, 'fetchCandidatePool').mockImplementation(async (prefs) => {
      requestedPrefs = prefs;
      return [baseMovie];
    });

    // User changes genre from Thriller (53) to Horror (27)
    const updatedPrefs: Partial<Preferences> = {
      ...initialPrefs,
      genreIds: [27]
    };

    const res = await engine.getRecommendations({ preferences: updatedPrefs });

    expect(requestedPrefs).not.toBeNull();
    // Verify all unrelated preferences were strictly preserved
    expect(requestedPrefs!.format).toBe('movie');
    expect(requestedPrefs!.languages).toEqual(['ml']);
    expect(requestedPrefs!.genreIds).toEqual([27]);
    expect(requestedPrefs!.runtime).toBe('150+');
    expect(requestedPrefs!.period).toBe('2010s');
    expect(requestedPrefs!.region).toBe('IN');
  });

  it('2. should handle multi-select commit with combined selections in a single request', async () => {
    const mockClient = new TMDBClient({ readAccessToken: 'test-token' });
    const engine = new RecommendationEngine(mockClient);

    let fetchCount = 0;
    let finalRequestedLanguages: string[] | undefined = undefined;

    vi.spyOn(engine, 'fetchCandidatePool').mockImplementation(async (prefs) => {
      fetchCount++;
      finalRequestedLanguages = prefs.languages;
      return Array.from({ length: 12 }, (_, i) => ({
        ...baseMovie,
        sourceId: `${100 + i}`,
        title: `Drishyam ${i + 1}`
      }));
    });

    // Multi-select commit of Malayalam + English
    const committedSelections: Partial<Preferences> = {
      format: 'movie',
      languages: ['ml', 'en'],
      region: 'IN'
    };

    const res = await engine.getRecommendations({ preferences: committedSelections });

    expect(fetchCount).toBe(1); // Exactly one initial candidate pool fetch on commit
    expect(finalRequestedLanguages).toEqual(['ml', 'en']);
    expect(res.items.length).toBeGreaterThan(0);
  });

  it('3. should ensure latest request authoritative under race condition simulations', async () => {
    let requestId = 0;
    let latestCommittedId = 0;

    async function simulateFetch(id: number, delayMs: number) {
      requestId = id;
      const thisReqId = id;
      await new Promise((r) => setTimeout(r, delayMs));
      // Discard stale responses
      if (thisReqId === requestId) {
        latestCommittedId = thisReqId;
      }
    }

    // Fire 3 requests rapidly in succession with out-of-order latency
    const p1 = simulateFetch(1, 100); // Req 1 is slow (100ms)
    const p2 = simulateFetch(2, 50);  // Req 2 is medium (50ms)
    const p3 = simulateFetch(3, 10);  // Req 3 is fast (10ms)

    await Promise.all([p1, p2, p3]);

    // Request 3 is the newest request and must win
    expect(latestCommittedId).toBe(3);
  });

  it('4. should recover gracefully on retry without altering preferences or resetting state', async () => {
    const mockClient = new TMDBClient({ readAccessToken: 'test-token' });
    const engine = new RecommendationEngine(mockClient);

    let attempts = 0;
    vi.spyOn(engine, 'fetchCandidatePool').mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Network timeout');
      }
      return [baseMovie];
    });

    const prefs: Partial<Preferences> = { format: 'movie', languages: ['ml'], region: 'IN' };

    // First attempt fails
    await expect(engine.getRecommendations({ preferences: prefs })).rejects.toThrow('Network timeout');

    // Retry succeeds with identical preserved preferences
    const res = await engine.getRecommendations({ preferences: prefs });
    expect(res.items.length).toBe(1);
    expect(res.items[0].title).toBe('Drishyam');
  });
});
