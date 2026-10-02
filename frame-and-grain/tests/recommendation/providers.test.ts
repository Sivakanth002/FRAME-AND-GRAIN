import { describe, it, expect } from 'vitest';
import {
  matchesProviders,
  isCandidateEligible,
  sanitizePreferences
} from '../../src/server/recommendation/filters.js';
import { TMDBProvidersService } from '../../src/server/tmdb/providers.js';
import { TitleRecord, TMDBWatchProvidersResponse } from '../../src/types/index.js';

describe('Watch Provider and Access Mode Filtering', () => {
  const netflixPrimeTitle: TitleRecord = {
    source: 'tmdb',
    sourceId: '1001',
    mediaType: 'movie',
    contentClass: 'movie',
    title: 'Multi-Streamer Film',
    originalTitle: 'Multi-Streamer Film',
    poster: null,
    backdrop: null,
    releaseDate: '2023-01-01',
    year: 2023,
    originalLanguage: 'en',
    genres: ['Drama'],
    genreIds: [18],
    runtime: 100,
    rating: 8.0,
    voteCount: 500,
    ratingScore: 0,
    providers: [
      { tmdbProviderId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' },
      { tmdbProviderId: 9, name: 'Amazon Prime Video', logoPath: null, type: 'flatrate' }
    ],
    overview: ''
  };

  const netflixOnlyTitle: TitleRecord = {
    ...netflixPrimeTitle,
    sourceId: '1002',
    title: 'Netflix Exclusive',
    providers: [{ tmdbProviderId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' }]
  };

  const rentOnlyTitle: TitleRecord = {
    ...netflixPrimeTitle,
    sourceId: '1003',
    title: 'Rent Only Film',
    providers: [
      { tmdbProviderId: 350, name: 'Apple TV', logoPath: null, type: 'rent' },
      { tmdbProviderId: 9, name: 'Amazon Video', logoPath: null, type: 'buy' }
    ]
  };

  it('1. should enforce provider ANY mode (at least one selected provider matches)', () => {
    // User selected Netflix (8) + Hotstar (122) with ANY mode
    const prefs = sanitizePreferences({
      providerIds: [8, 122],
      providerMode: 'any',
      accessModes: ['flatrate']
    });

    expect(matchesProviders(netflixOnlyTitle, prefs)).toBe(true);
    expect(matchesProviders(netflixPrimeTitle, prefs)).toBe(true);
  });

  it('2. should enforce provider ALL mode (all selected providers must offer the title)', () => {
    // User selected Netflix (8) + Prime (9) with ALL mode
    const prefs = sanitizePreferences({
      providerIds: [8, 9],
      providerMode: 'all',
      accessModes: ['flatrate']
    });

    // Available on both Netflix + Prime -> passes
    expect(matchesProviders(netflixPrimeTitle, prefs)).toBe(true);

    // Available only on Netflix -> fails ALL mode
    expect(matchesProviders(netflixOnlyTitle, prefs)).toBe(false);
  });

  it('3. should enforce provider NONE mode (exclude titles available through selected providers)', () => {
    // User excludes Netflix (8)
    const prefs = sanitizePreferences({
      providerIds: [8],
      providerMode: 'none',
      accessModes: ['flatrate']
    });

    // Contains Netflix -> excluded
    expect(matchesProviders(netflixPrimeTitle, prefs)).toBe(false);
    expect(matchesProviders(netflixOnlyTitle, prefs)).toBe(false);

    // Rent only does not have Netflix flatrate -> passes
    expect(matchesProviders(rentOnlyTitle, prefs)).toBe(true);
  });

  it('4. should enforce provider ANY-PROVIDER mode (any provider in region with matching access mode)', () => {
    const prefs = sanitizePreferences({
      providerMode: 'any-provider',
      accessModes: ['flatrate']
    });

    expect(matchesProviders(netflixOnlyTitle, prefs)).toBe(true);
    expect(matchesProviders(rentOnlyTitle, prefs)).toBe(false); // No flatrate provider
  });

  it('5. should reject titles available only for rent/buy when subscription (flatrate) is required', () => {
    const subPrefs = sanitizePreferences({
      accessModes: ['flatrate']
    });
    expect(isCandidateEligible(rentOnlyTitle, subPrefs)).toBe(false);

    // When rent is allowed
    const rentPrefs = sanitizePreferences({
      accessModes: ['rent'],
      providerIds: [350],
      providerMode: 'any'
    });
    expect(isCandidateEligible(rentOnlyTitle, rentPrefs)).toBe(true);
  });

  it('6. should parse TMDB watch provider response payloads correctly into canonical records', () => {
    const mockTMDBResponse: TMDBWatchProvidersResponse = {
      id: 550,
      results: {
        IN: {
          link: 'https://tmdb.org/watch',
          flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg', display_priority: 1 }],
          rent: [{ provider_id: 350, provider_name: 'Apple TV', logo_path: '/apple.jpg', display_priority: 2 }],
          buy: [{ provider_id: 9, provider_name: 'Amazon Video', logo_path: '/amazon.jpg', display_priority: 3 }]
        }
      }
    };

    const parsed = TMDBProvidersService.parseItemProviders(mockTMDBResponse, 'IN');
    expect(parsed).toHaveLength(3);
    expect(parsed.find((p) => p.type === 'flatrate')?.name).toBe('Netflix');
    expect(parsed.find((p) => p.type === 'rent')?.tmdbProviderId).toBe(350);
    expect(parsed.find((p) => p.type === 'buy')?.logoPath).toContain('https://image.tmdb.org/t/p/w500/amazon.jpg');
  });
});
