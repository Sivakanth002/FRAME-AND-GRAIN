import { describe, it, expect, beforeEach } from 'vitest';
import { TitleRecord, Preferences, ContentCertification } from '@/types/index';
import {
  normalizeCertification,
  getAgeSuitability,
  getAudienceProfile,
  getAudienceRelevanceMultiplier
} from '@/server/recommendation/certifications';
import { TMDBCertificationService } from '@/server/tmdb/certifications';
import { TMDBClient } from '@/server/tmdb/client';
import { isCandidateEligible } from '@/server/recommendation/filters';
import { computeScore } from '@/server/recommendation/scoring';
import { LuckyEngine } from '@/server/recommendation/lucky';

function mockTitle(overrides: Partial<TitleRecord> = {}): TitleRecord {
  return {
    source: 'tmdb',
    sourceId: '101',
    mediaType: 'movie',
    contentClass: 'movie',
    title: 'Sample Film',
    originalTitle: 'Sample Film',
    poster: '/poster.jpg',
    backdrop: '/backdrop.jpg',
    releaseDate: '2023-01-01',
    year: 2023,
    originalLanguage: 'en',
    genres: ['Action', 'Thriller'],
    genreIds: [28, 53],
    runtime: 110,
    rating: 7.8,
    voteCount: 1200,
    ratingScore: 78,
    providers: [
      {
        tmdbProviderId: 8,
        name: 'Netflix',
        logoPath: '/netflix.png',
        type: 'flatrate'
      }
    ],
    overview: 'A high-stakes suspense thriller following an undercover agent.',
    ...overrides
  };
}

describe('Phase 6.5 — Age Suitability & Audience Relevance Pass', () => {
  describe('1. Regional Certification Normalization', () => {
    it('correctly normalizes Indian CBFC certifications', () => {
      const certU = normalizeCertification('U', 'IN');
      expect(certU.minimumAge).toBe(0);
      expect(certU.confidence).toBe('verified');
      expect(certU.region).toBe('IN');

      const certUA = normalizeCertification('UA 13+', 'IN');
      expect(certUA.minimumAge).toBe(13);
      expect(certUA.confidence).toBe('verified');

      const certA = normalizeCertification('A', 'IN');
      expect(certA.minimumAge).toBe(18);
      expect(certA.confidence).toBe('verified');
    });

    it('correctly normalizes US MPAA and TV ratings', () => {
      const certPG = normalizeCertification('PG', 'US');
      expect(certPG.minimumAge).toBe(8);
      expect(certPG.confidence).toBe('verified');

      const certPG13 = normalizeCertification('PG-13', 'US');
      expect(certPG13.minimumAge).toBe(13);

      const certR = normalizeCertification('R', 'US');
      expect(certR.minimumAge).toBe(17);

      const certTVMA = normalizeCertification('TV-MA', 'US');
      expect(certTVMA.minimumAge).toBe(18);
    });

    it('correctly normalizes UK BBFC ratings', () => {
      const cert12A = normalizeCertification('12A', 'GB');
      expect(cert12A.minimumAge).toBe(12);

      const cert15 = normalizeCertification('15', 'GB');
      expect(cert15.minimumAge).toBe(15);

      const cert18 = normalizeCertification('18', 'GB');
      expect(cert18.minimumAge).toBe(18);
    });

    it('does not leak one region certification into another region', () => {
      const tmdbService = new TMDBCertificationService(new TMDBClient());
      const mockRelDates = {
        id: 101,
        results: [
          {
            iso_3166_1: 'IN',
            release_dates: [{ certification: 'A', type: 3, release_date: '2023-01-01' }]
          },
          {
            iso_3166_1: 'US',
            release_dates: [{ certification: 'PG-13', type: 3, release_date: '2023-01-01' }]
          }
        ]
      };

      const certIN = tmdbService.extractMovieCertification(mockRelDates, 'IN');
      const certUS = tmdbService.extractMovieCertification(mockRelDates, 'US');
      const certGB = tmdbService.extractMovieCertification(mockRelDates, 'GB');

      expect(certIN).toBe('A');
      expect(certUS).toBe('PG-13');
      expect(certGB).toBeNull();
    });

    it('handles unknown or unavailable ratings without inventing values', () => {
      const unknownCert = normalizeCertification(null, 'IN');
      expect(unknownCert.minimumAge).toBeNull();
      expect(unknownCert.confidence).toBe('unknown');
      expect(unknownCert.rawRating).toBe('');
    });
  });

  describe('2. Hard Age Safety Eligibility Filter', () => {
    it('excludes clearly mature certification for under-13 viewers', () => {
      const matureMovie = mockTitle({
        certification: normalizeCertification('A', 'IN'),
        genreIds: [28, 53]
      });
      expect(getAgeSuitability(matureMovie, 'under-13', 'IN')).toBe('not-safe');

      const pg13Movie = mockTitle({
        certification: normalizeCertification('PG-13', 'US'),
        genreIds: [28, 878]
      });
      expect(getAgeSuitability(pg13Movie, 'under-13', 'US')).toBe('not-safe');
    });

    it('allows verified under-13 appropriate titles for under-13 viewers', () => {
      const kidsMovie = mockTitle({
        certification: normalizeCertification('U', 'IN'),
        genreIds: [16, 10751]
      });
      expect(getAgeSuitability(kidsMovie, 'under-13', 'IN')).toBe('safe');

      const gMovie = mockTitle({
        certification: normalizeCertification('G', 'US'),
        genreIds: [16, 35]
      });
      expect(getAgeSuitability(gMovie, 'under-13', 'US')).toBe('safe');
    });

    it('excludes 18+ content for 13–17 teen viewers', () => {
      const adultFilm = mockTitle({
        certification: normalizeCertification('A', 'IN')
      });
      expect(getAgeSuitability(adultFilm, '13-17', 'IN')).toBe('not-safe');

      const tvmaShow = mockTitle({
        certification: normalizeCertification('TV-MA', 'US')
      });
      expect(getAgeSuitability(tvmaShow, '13-17', 'US')).toBe('not-safe');
    });

    it('allows teen-appropriate content for 13–17 viewers', () => {
      const teenFilm = mockTitle({
        certification: normalizeCertification('UA 13+', 'IN')
      });
      expect(getAgeSuitability(teenFilm, '13-17', 'IN')).toBe('safe');

      const pg13Film = mockTitle({
        certification: normalizeCertification('PG-13', 'US')
      });
      expect(getAgeSuitability(pg13Film, '13-17', 'US')).toBe('safe');
    });

    it('allows all maturity levels for adult viewers (18-24, 25-34, 35-44, 45-54, 55+)', () => {
      const adultFilm = mockTitle({
        certification: normalizeCertification('A', 'IN')
      });
      expect(getAgeSuitability(adultFilm, '18-24', 'IN')).toBe('safe');
      expect(getAgeSuitability(adultFilm, '25-34', 'IN')).toBe('safe');
      expect(getAgeSuitability(adultFilm, '55+', 'IN')).toBe('safe');
    });

    it('conservatively handles unknown certification for minor viewers', () => {
      const unknownMature = mockTitle({
        certification: normalizeCertification(null, 'IN'),
        genreIds: [27, 53] // Horror + Thriller
      });
      expect(getAgeSuitability(unknownMature, 'under-13', 'IN')).toBe('not-safe');

      const unknownFamily = mockTitle({
        certification: normalizeCertification(null, 'IN'),
        genreIds: [16, 10751] // Animation + Family, no mature genres
      });
      expect(getAgeSuitability(unknownFamily, 'under-13', 'IN')).toBe('safe');
    });

    it('integrates cleanly into isCandidateEligible hard filter pipeline', () => {
      const matureFilm = mockTitle({
        certification: normalizeCertification('A', 'IN'),
        genreIds: [53]
      });

      const prefsUnder13: Preferences = {
        region: 'IN',
        providerIds: [8],
        providerMode: 'any',
        accessModes: ['flatrate'],
        format: 'all',
        language: 'all',
        runtime: 'all',
        period: 'all',
        genreIds: [53],
        ageGroup: 'under-13',
        mood: 'all'
      };

      expect(isCandidateEligible(matureFilm, prefsUnder13)).toBe(false);

      const prefsAdult: Preferences = {
        ...prefsUnder13,
        ageGroup: '25-34'
      };
      expect(isCandidateEligible(matureFilm, prefsAdult)).toBe(true);
    });
  });

  describe('3. Audience Profile Classifier & Soft Relevance (Paw Patrol Problem)', () => {
    it('classifies preschool and child-focused titles as child-focused', () => {
      const pawPatrol = mockTitle({
        title: 'PAW Patrol: The Mighty Movie',
        overview: 'A magical meteor crash lands in Adventure City, giving the PAW Patrol pups superpowers.',
        genreIds: [16, 10751],
        runtime: 88,
        certification: normalizeCertification('U', 'IN')
      });
      expect(getAudienceProfile(pawPatrol)).toBe('child-focused');
    });

    it('does NOT classify mature animation or anime as child-focused', () => {
      const animeFilm = mockTitle({
        title: 'Spirited Away',
        contentClass: 'anime',
        originalLanguage: 'ja',
        genreIds: [16, 14, 12],
        overview: 'A 10-year-old girl wanders into a world ruled by gods and spirits.',
        runtime: 125,
        certification: normalizeCertification('U', 'IN')
      });
      expect(getAudienceProfile(animeFilm)).not.toBe('child-focused');

      const akira = mockTitle({
        title: 'Akira',
        contentClass: 'anime',
        originalLanguage: 'ja',
        genreIds: [16, 878, 28],
        overview: 'In Neo-Tokyo, a biker gang member undergoes a terrifying psychic evolution.',
        runtime: 124,
        certification: normalizeCertification('A', 'IN')
      });
      expect(getAudienceProfile(akira)).toBe('mature');
    });

    it('applies strong soft relevance penalty for adult viewers viewing child-focused titles', () => {
      const multiplierAdult = getAudienceRelevanceMultiplier('child-focused', '25-34');
      expect(multiplierAdult).toBe(0.35);

      const multiplierAdultGeneral = getAudienceRelevanceMultiplier('general', '25-34');
      expect(multiplierAdultGeneral).toBe(1.0);
    });

    it('boosts child-focused titles for under-13 viewers', () => {
      const multiplierChild = getAudienceRelevanceMultiplier('child-focused', 'under-13');
      expect(multiplierChild).toBeGreaterThan(1.0);
    });

    it('includes neutral explanation in TUNE scoring reasons without creepy phrasing', () => {
      const familyTitle = mockTitle({
        certification: normalizeCertification('U', 'IN'),
        genreIds: [16, 10751],
        overview: 'A delightful preschool story.'
      });

      const prefs: Preferences = {
        region: 'IN',
        providerIds: [8],
        providerMode: 'any',
        accessModes: ['flatrate'],
        format: 'all',
        language: 'all',
        runtime: 'all',
        period: 'all',
        genreIds: [],
        ageGroup: 'under-13',
        mood: 'all'
      };

      const scored = computeScore(familyTitle, prefs);
      expect(scored.reasons).toContain('Fits your selected audience profile.');
      expect(scored.reasons?.some((r) => r.includes('for your age'))).toBe(false);
    });
  });

  describe('4. Lucky / I Don’t Know Age & Audience Integration', () => {
    let luckyEngine: LuckyEngine;

    beforeEach(() => {
      luckyEngine = new LuckyEngine();
    });

    it('applies conservative general-audience safety when no age context is provided', () => {
      const matureFilm = mockTitle({
        sourceId: '999',
        certification: normalizeCertification('A', 'IN'),
        genreIds: [53, 27]
      });

      const generalFilm = mockTitle({
        sourceId: '100',
        certification: normalizeCertification('UA 13+', 'IN'),
        genreIds: [28, 878]
      });

      const pool = [matureFilm, generalFilm];
      const result = luckyEngine.selectLuckyPick(pool, {
        sessionId: 'test-session-lucky-safe'
      });

      expect(result.pick).not.toBeNull();
      expect(result.pick?.sourceId).toBe('100'); // Mature film excluded by default safe mode
    });

    it('applies hard safety and soft audience bias when age context is known', () => {
      const childTitle = mockTitle({
        sourceId: '201',
        title: 'Paw Patrol',
        overview: 'Paw patrol toddler rescue.',
        genreIds: [16, 10751],
        certification: normalizeCertification('U', 'IN')
      });

      const adultThriller = mockTitle({
        sourceId: '202',
        title: 'Mindhunter',
        overview: 'A deep investigative psychological thriller.',
        genreIds: [53, 80],
        certification: normalizeCertification('A', 'IN')
      });

      // Under-13: adult thriller is hard excluded
      const resultUnder13 = luckyEngine.selectLuckyPick([childTitle, adultThriller], {
        sessionId: 'test-session-u13',
        ageGroup: 'under-13',
        region: 'IN'
      });
      expect(resultUnder13.pick?.sourceId).toBe('201');

      // Adult 25-34: adult thriller is eligible; child title has soft downweight
      const resultAdult = luckyEngine.selectLuckyPick([childTitle, adultThriller], {
        sessionId: 'test-session-adult',
        ageGroup: '25-34',
        region: 'IN',
        seed: 42
      });
      expect(resultAdult.pick).not.toBeNull();
    });
  });
});
