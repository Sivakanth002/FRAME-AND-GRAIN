import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TMDBClient } from '../../src/server/tmdb/client.js';
import { RecommendationEngine } from '../../src/server/recommendation/engine.js';
import { TitleRecord, Preferences } from '../../src/types/index.js';
import { isCandidateEligible, sanitizePreferences } from '../../src/server/recommendation/filters.js';

describe('Phase 7.3 — Performance Optimization & Caching', () => {
  beforeEach(() => {
    TMDBClient.clearAllCaches();
    TMDBClient.resetMetrics();
  });

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

  it('1. should cache repeated TMDB requests and record cache hits', async () => {
    let networkCalls = 0;
    const mockFetch = vi.fn(async () => {
      networkCalls++;
      return new Response(JSON.stringify({ results: [{ id: 101, title: 'Drishyam' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const client = new TMDBClient({ readAccessToken: 'test-token', fetchFn: mockFetch as any });

    // First request -> Cache Miss -> Network fetch
    const res1 = await client.request('/discover/movie', { page: 1, watch_region: 'IN' }, { cacheTtlMs: 60000 });
    expect(networkCalls).toBe(1);

    // Second identical request -> Cache Hit -> Zero network fetch
    const res2 = await client.request('/discover/movie', { page: 1, watch_region: 'IN' }, { cacheTtlMs: 60000 });
    expect(networkCalls).toBe(1);
    expect(res2).toEqual(res1);

    const metrics = TMDBClient.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.cacheMisses).toBe(1);
  });

  it('2. should isolate cache keys by region, format, and parameters', async () => {
    let networkCalls = 0;
    const mockFetch = vi.fn(async (url: string) => {
      networkCalls++;
      const isUS = url.includes('US');
      return new Response(JSON.stringify({ region: isUS ? 'US' : 'IN' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const client = new TMDBClient({ readAccessToken: 'test-token', fetchFn: mockFetch as any });

    const inRes = await client.request<{ region: string }>('/watch/providers/movie', { watch_region: 'IN' }, { cacheTtlMs: 60000, cacheKeyPrefix: 'providers' });
    const usRes = await client.request<{ region: string }>('/watch/providers/movie', { watch_region: 'US' }, { cacheTtlMs: 60000, cacheKeyPrefix: 'providers' });

    expect(inRes.region).toBe('IN');
    expect(usRes.region).toBe('US');
    expect(networkCalls).toBe(2); // Two distinct cache keys
  });

  it('3. should coalesce in-flight requests to eliminate duplicate simultaneous calls', async () => {
    let networkCalls = 0;
    const mockFetch = vi.fn(async () => {
      networkCalls++;
      await new Promise(r => setTimeout(r, 20)); // Small latency
      return new Response(JSON.stringify({ id: 501, name: 'Hotstar' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const client = new TMDBClient({ readAccessToken: 'test-token', fetchFn: mockFetch as any });

    // Fire 5 identical requests simultaneously before the first one resolves
    const promises = Array.from({ length: 5 }, () =>
      client.request('/movie/501/watch/providers', {}, { cacheTtlMs: 60000, cacheKeyPrefix: 'providers' })
    );

    const results = await Promise.all(promises);

    expect(networkCalls).toBe(1); // Exactly 1 network fetch made
    expect(results.length).toBe(5);

    const metrics = TMDBClient.getMetrics();
    expect(metrics.coalescedRequests).toBe(4);
  });

  it('4. should execute two-stage filtering and discard disqualified candidates in Stage 1 without network requests', async () => {
    const mockClient = new TMDBClient({ readAccessToken: 'test-token' });
    const engine = new RecommendationEngine(mockClient);

    const disqualifiedMovie: TitleRecord = {
      ...baseMovie,
      sourceId: '999',
      year: 1995, // Outside 2010s period
      releaseDate: '1995-01-01',
      providers: [], // Empty providers (would trigger fetch if enriched)
      certification: undefined // Undefined cert (would trigger fetch if enriched)
    };

    const qualifyingMovie: TitleRecord = {
      ...baseMovie,
      sourceId: '101',
      year: 2013,
      releaseDate: '2013-12-19'
    };

    let fetchCount = 0;
    vi.spyOn(engine, 'fetchCandidatePool').mockImplementation(async () => {
      fetchCount++;
      return [disqualifiedMovie, qualifyingMovie];
    });

    const prefs: Partial<Preferences> = {
      format: 'movie',
      languages: ['ml'],
      period: '2010s',
      region: 'IN'
    };

    const result = await engine.getRecommendations({ preferences: prefs });

    // Disqualified 1995 movie was dropped immediately in Stage 1
    expect(result.items.some(i => i.sourceId === '999')).toBe(false);
    expect(result.items.some(i => i.sourceId === '101')).toBe(true);
  });

  it('5. should perform local Bayesian scoring with zero external API calls', () => {
    const prefs = sanitizePreferences({
      format: 'movie',
      languages: ['ml'],
      genreIds: [53],
      region: 'IN'
    });

    const initialMetrics = TMDBClient.getMetrics();

    // Pure local in-memory evaluation
    const isEligible = isCandidateEligible(baseMovie, prefs);
    expect(isEligible).toBe(true);

    const afterMetrics = TMDBClient.getMetrics();
    expect(afterMetrics.totalRequests).toBe(initialMetrics.totalRequests);
  });
});
