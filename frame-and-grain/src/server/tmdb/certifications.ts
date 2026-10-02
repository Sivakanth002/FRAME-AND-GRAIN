// ============================================================================
// FRAME & GRAIN — TMDB CERTIFICATIONS & RATINGS SERVICE
// Fetches real region-specific release date certifications (movies)
// and content ratings (TV) from TMDB API
// ============================================================================

import { TMDBClient } from './client';

export interface TMDBMovieReleaseDateItem {
  certification: string;
  descriptors?: string[];
  iso_639_1?: string;
  note?: string;
  release_date: string;
  type: number; // 1: Premiere, 2: Theatrical (limited), 3: Theatrical, 4: Digital, 5: Physical, 6: TV
}

export interface TMDBMovieReleaseDatesResult {
  iso_3166_1: string;
  release_dates: TMDBMovieReleaseDateItem[];
}

export interface TMDBMovieReleaseDatesResponse {
  id: number;
  results: TMDBMovieReleaseDatesResult[];
}

export interface TMDBTVContentRatingsResult {
  descriptors?: string[];
  iso_3166_1: string;
  rating: string;
}

export interface TMDBTVContentRatingsResponse {
  id: number;
  results: TMDBTVContentRatingsResult[];
}

export class TMDBCertificationService {
  constructor(private client: TMDBClient) {}

  /**
   * Fetches regional release date certifications for a movie
   */
  public async getMovieReleaseDates(movieId: string | number): Promise<TMDBMovieReleaseDatesResponse> {
    return this.client.request<TMDBMovieReleaseDatesResponse>(
      `movie/${movieId}/release_dates`,
      {},
      {
        cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
        cacheKeyPrefix: 'title'
      }
    );
  }

  /**
   * Fetches regional content ratings for a TV series
   */
  public async getTVContentRatings(tvId: string | number): Promise<TMDBTVContentRatingsResponse> {
    return this.client.request<TMDBTVContentRatingsResponse>(
      `tv/${tvId}/content_ratings`,
      {},
      {
        cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
        cacheKeyPrefix: 'title'
      }
    );
  }

  /**
   * Extracts the raw certification string for a given movie and region.
   * Priority: Theatrical (3) > Digital (4) > Physical (5) > Any non-empty certification.
   * Never leaks one region's certification into another region.
   */
  public extractMovieCertification(
    response: TMDBMovieReleaseDatesResponse | null | undefined,
    targetRegion: string
  ): string | null {
    if (!response || !Array.isArray(response.results)) return null;

    const regionUpper = targetRegion.toUpperCase();
    const regionEntry = response.results.find(
      (r) => r.iso_3166_1 && r.iso_3166_1.toUpperCase() === regionUpper
    );

    if (!regionEntry || !Array.isArray(regionEntry.release_dates)) return null;

    // Filter release dates with non-empty certification
    const validCerts = regionEntry.release_dates.filter(
      (d) => d.certification && d.certification.trim().length > 0
    );

    if (validCerts.length === 0) return null;

    // Prioritize standard theatrical (3), digital (4), physical (5)
    const preferred = validCerts.find((d) => d.type === 3) ||
      validCerts.find((d) => d.type === 4) ||
      validCerts.find((d) => d.type === 5) ||
      validCerts[0];

    return preferred.certification.trim();
  }

  /**
   * Extracts the raw rating string for a given TV series and region.
   * Never leaks one region's certification into another region.
   */
  public extractTVContentRating(
    response: TMDBTVContentRatingsResponse | null | undefined,
    targetRegion: string
  ): string | null {
    if (!response || !Array.isArray(response.results)) return null;

    const regionUpper = targetRegion.toUpperCase();
    const regionEntry = response.results.find(
      (r) => r.iso_3166_1 && r.iso_3166_1.toUpperCase() === regionUpper
    );

    if (!regionEntry || !regionEntry.rating || !regionEntry.rating.trim()) return null;

    return regionEntry.rating.trim();
  }
}
