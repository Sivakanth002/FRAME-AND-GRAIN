import { describe, it, expect, vi } from 'vitest';
import { RecommendationEngine } from '../../src/server/recommendation/engine';
import { TMDBClient } from '../../src/server/tmdb/client';
import { isCandidateEligible, sanitizePreferences } from '../../src/server/recommendation/filters';
import { TitleRecord } from '../../src/types/index';

describe('Live Discovery Integration & Experience Refinement (Phase 5)', () => {
  const mockClient = new TMDBClient({ readAccessToken: 'test-access-token' });
  const engine = new RecommendationEngine(mockClient);

  const sampleMalayalamThriller: TitleRecord = {
    source: 'tmdb',
    sourceId: '501',
    mediaType: 'movie',
    contentClass: 'movie',
    title: 'Drishyam',
    originalTitle: 'Drishyam',
    poster: 'https://image.tmdb.org/t/p/w500/drishyam.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/drishyam_bg.jpg',
    releaseDate: '2013-12-19',
    year: 2013,
    originalLanguage: 'ml',
    genres: ['Crime', 'Drama', 'Thriller'],
    genreIds: [80, 18, 53],
    runtime: 160,
    rating: 8.3,
    voteCount: 450,
    ratingScore: 0,
    providers: [
      { tmdbProviderId: 122, name: 'Hotstar', logoPath: '/hotstar.jpg', type: 'flatrate' }
    ],
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

  const sampleEnglishDrama: TitleRecord = {
    source: 'tmdb',
    sourceId: '601',
    mediaType: 'movie',
    contentClass: 'movie',
    title: 'The Social Network',
    originalTitle: 'The Social Network',
    poster: 'https://image.tmdb.org/t/p/w500/social.jpg',
    backdrop: null,
    releaseDate: '2010-10-01',
    year: 2010,
    originalLanguage: 'en',
    genres: ['Drama'],
    genreIds: [18],
    runtime: 120,
    rating: 7.8,
    voteCount: 12000,
    ratingScore: 0,
    providers: [
      { tmdbProviderId: 8, name: 'Netflix', logoPath: '/netflix.jpg', type: 'flatrate' }
    ],
    certification: {
      region: 'IN',
      rawRating: 'UA',
      minimumAge: 12,
      source: 'tmdb',
      confidence: 'verified'
    },
    audienceProfile: 'general',
    overview: 'The founding of Facebook.'
  };

  it('1. should qualify genuine Malayalam thriller in 2010s for India region', () => {
    const prefs = sanitizePreferences({
      region: 'IN',
      language: 'ml',
      format: 'movie',
      genreIds: [53], // Thriller
      period: '2010s',
      providerIds: [122],
      providerMode: 'any',
      accessModes: ['flatrate']
    });

    expect(isCandidateEligible(sampleMalayalamThriller, prefs)).toBe(true);
    expect(isCandidateEligible(sampleEnglishDrama, prefs)).toBe(false); // Wrong language & genre
  });

  it('2. should qualify Malayalam OR English when multi-language is selected', () => {
    const multiLangPrefs = sanitizePreferences({
      region: 'IN',
      languages: ['ml', 'en'],
      format: 'movie',
      period: '2010s'
    });

    expect(isCandidateEligible(sampleMalayalamThriller, multiLangPrefs)).toBe(true);
    expect(isCandidateEligible(sampleEnglishDrama, multiLangPrefs)).toBe(true);
  });

  it('3. should verify TUNE recommendations exclude TUNE-presented IDs in Lucky mode', async () => {
    vi.spyOn(engine, 'fetchCandidatePool').mockResolvedValue([
      sampleMalayalamThriller,
      sampleEnglishDrama
    ]);

    // 1. Fetch TUNE recommendations
    const tuneResult = await engine.getRecommendations({
      mode: 'tune',
      preferences: { format: 'movie' }
    });

    expect(tuneResult.items.length).toBeGreaterThan(0);
    const shownTuneId = `${sampleMalayalamThriller.source}:${sampleMalayalamThriller.mediaType}:${sampleMalayalamThriller.sourceId}`;

    // 2. Fetch Lucky with shownTuneId as tuneShownIds
    const luckyPick = engine.getLuckyPick([sampleMalayalamThriller, sampleEnglishDrama], {
      tuneHistoryIds: [shownTuneId]
    });

    // Lucky must pick sampleEnglishDrama, not the shown Malayalam thriller
    expect(luckyPick).not.toBeNull();
    expect(luckyPick?.sourceId).toBe('601');
    expect(luckyPick?.sourceId).not.toBe('501');
  });

  it('4. should ensure release period and language have zero scoring weight in ranked results', async () => {
    const prefsLatest = sanitizePreferences({ period: 'latest', language: 'en' });
    const prefs2010s = sanitizePreferences({ period: '2010s', language: 'ml' });

    // Scoring sampleEnglishDrama with both preference sets
    const { computeScore } = await import('../../src/server/recommendation/scoring');
    const score1 = computeScore(sampleEnglishDrama, prefsLatest, 7.5);
    const score2 = computeScore(sampleEnglishDrama, prefs2010s, 7.5);

    expect(score1.score).toBe(score2.score);
  });
});
