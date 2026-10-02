import { describe, it, expect } from 'vitest';
import { isCandidateEligible, sanitizePreferences } from '../../src/server/recommendation/filters.js';
import { computeScore } from '../../src/server/recommendation/scoring.js';
import { TitleRecord } from '../../src/types/index.js';

describe('Genre Qualification and Scoring Engine', () => {
  const horrorThriller: TitleRecord = {
    source: 'tmdb',
    sourceId: '1001',
    mediaType: 'movie',
    contentClass: 'movie',
    title: 'Horror Thriller Film',
    originalTitle: 'Horror Thriller Film',
    poster: null,
    backdrop: null,
    releaseDate: '2023-01-01',
    year: 2023,
    originalLanguage: 'en',
    genres: ['Horror', 'Thriller'],
    genreIds: [27, 53], // 27 = Horror, 53 = Thriller
    runtime: 105,
    rating: 7.8,
    voteCount: 800,
    ratingScore: 0,
    providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' }],
    overview: 'Spooky thriller.'
  };

  const dramaOnly: TitleRecord = {
    ...horrorThriller,
    sourceId: '1002',
    title: 'Drama Only Film',
    genres: ['Drama'],
    genreIds: [18] // 18 = Drama
  };

  const horrorOnly: TitleRecord = {
    ...horrorThriller,
    sourceId: '1003',
    title: 'Horror Only Film',
    genres: ['Horror'],
    genreIds: [27]
  };

  it('1. should qualify when ANY selected genre matches (single genre selected)', () => {
    // User selected Thriller (53)
    const prefs = sanitizePreferences({ genreIds: [53] });

    // Horror+Thriller QUALIFIES
    expect(isCandidateEligible(horrorThriller, prefs)).toBe(true);

    // Drama only does NOT qualify
    expect(isCandidateEligible(dramaOnly, prefs)).toBe(false);
  });

  it('2. should qualify when user selects multiple genres (Horror OR Thriller)', () => {
    // User selected Horror (27) + Thriller (53)
    const prefs = sanitizePreferences({ genreIds: [27, 53] });

    // Horror only qualifies
    expect(isCandidateEligible(horrorOnly, prefs)).toBe(true);

    // Horror + Thriller qualifies
    expect(isCandidateEligible(horrorThriller, prefs)).toBe(true);

    // Drama only does not qualify
    expect(isCandidateEligible(dramaOnly, prefs)).toBe(false);
  });

  it('3. should reward overlap in soft ranking when candidate matches multiple selected genres', () => {
    // User selected Horror (27) + Thriller (53)
    const prefs = sanitizePreferences({ genreIds: [27, 53] });

    // horrorThriller matches 2 of 2 selected genres
    const scoredMulti = computeScore(horrorThriller, prefs, 7.0);

    // horrorOnly matches 1 of 2 selected genres
    const scoredSingle = computeScore(horrorOnly, prefs, 7.0);

    expect(scoredMulti.score).toBeGreaterThan(scoredSingle.score!);
    expect(scoredMulti.reasons?.some((r) => r.includes('matches your'))).toBe(true);
  });

  it('4. should qualify all titles when no genre is selected', () => {
    const prefs = sanitizePreferences({ genreIds: [] });
    expect(isCandidateEligible(horrorThriller, prefs)).toBe(true);
    expect(isCandidateEligible(dramaOnly, prefs)).toBe(true);
  });
});
