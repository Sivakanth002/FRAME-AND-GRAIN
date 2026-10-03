// ============================================================================
// FRAME & GRAIN — TMDB GENRES SERVICE
// Dynamically fetches and caches official TMDB genre mappings for Movies and TV
// ============================================================================

import { TMDBClient } from './client';
import { TMDBGenre, TMDBGenreListResponse } from '@/types/index';

export const STATIC_FALLBACK_MOVIE_GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western'
};

export const STATIC_FALLBACK_TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  10762: 'Kids',
  9648: 'Mystery',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
  37: 'Western'
};

export class TMDBGenresService {
  constructor(private client: TMDBClient) {}

  public async getMovieGenres(): Promise<TMDBGenre[]> {
    const res = await this.client.request<TMDBGenreListResponse>(
      '/genre/movie/list',
      {},
      { cacheTtlMs: 24 * 60 * 60 * 1000, cacheKeyPrefix: 'genres' }
    );
    return res.genres || [];
  }

  public async getTVGenres(): Promise<TMDBGenre[]> {
    const res = await this.client.request<TMDBGenreListResponse>(
      '/genre/tv/list',
      {},
      { cacheTtlMs: 24 * 60 * 60 * 1000, cacheKeyPrefix: 'genres' }
    );
    return res.genres || [];
  }

  public async getAllCombinedGenres(): Promise<TMDBGenre[]> {
    const [movieGenres, tvGenres] = await Promise.all([
      this.getMovieGenres(),
      this.getTVGenres()
    ]);

    const genreMap = new Map<number, string>();
    for (const g of movieGenres) genreMap.set(g.id, g.name);
    for (const g of tvGenres) {
      if (!genreMap.has(g.id)) genreMap.set(g.id, g.name);
    }

    return Array.from(genreMap.entries()).map(([id, name]) => ({ id, name }));
  }

  public static getGenreName(id: number, mediaType: 'movie' | 'tv'): string {
    if (mediaType === 'movie') {
      return STATIC_FALLBACK_MOVIE_GENRES[id] || 'Cinema';
    }
    return STATIC_FALLBACK_TV_GENRES[id] || 'Drama';
  }
}

/**
 * Maps genre IDs to media-specific TMDB genre IDs (Movie <-> TV)
 * and deduplicates the resulting IDs.
 */
export function mapGenresForMediaType(genreIds: number[], mediaType: 'movie' | 'tv'): number[] {
  if (!Array.isArray(genreIds) || genreIds.length === 0) return [];
  const mapped = new Set<number>();

  if (mediaType === 'tv') {
    for (const id of genreIds) {
      if (id === 28 || id === 12) {
        // Action (28) / Adventure (12) -> TV Action & Adventure (10759)
        mapped.add(10759);
      } else if (id === 878 || id === 14) {
        // Science Fiction (878) / Fantasy (14) -> TV Sci-Fi & Fantasy (10765)
        mapped.add(10765);
      } else if (id === 10752) {
        // War (10752) -> TV War & Politics (10768)
        mapped.add(10768);
      } else if (STATIC_FALLBACK_TV_GENRES[id]) {
        mapped.add(id);
      } else if (STATIC_FALLBACK_MOVIE_GENRES[id]) {
        // Keep movie ID if it's a known movie genre (some overlap)
        mapped.add(id);
      }
    }
  } else {
    // movie
    for (const id of genreIds) {
      if (id === 10759) {
        // TV Action & Adventure -> Movie Action (28) + Adventure (12)
        mapped.add(28);
        mapped.add(12);
      } else if (id === 10765) {
        // TV Sci-Fi & Fantasy -> Movie Science Fiction (878) + Fantasy (14)
        mapped.add(878);
        mapped.add(14);
      } else if (id === 10768) {
        // TV War & Politics -> Movie War (10752)
        mapped.add(10752);
      } else if (STATIC_FALLBACK_MOVIE_GENRES[id]) {
        mapped.add(id);
      } else if (STATIC_FALLBACK_TV_GENRES[id]) {
        mapped.add(id);
      }
    }
  }

  return Array.from(mapped);
}

/**
 * Checks if a candidate's genre IDs match selected genre IDs,
 * taking media-specific TMDB genre namespace differences into account.
 */
export function matchesGenreSelection(
  candidateGenreIds: number[],
  candidateMediaType: 'movie' | 'tv',
  selectedGenreIds: number[]
): boolean {
  if (!selectedGenreIds || selectedGenreIds.length === 0) return true;
  if (!candidateGenreIds || candidateGenreIds.length === 0) return false;

  const targetGenreIds = mapGenresForMediaType(selectedGenreIds, candidateMediaType);
  const allTargetIds = new Set([...selectedGenreIds, ...targetGenreIds]);

  return candidateGenreIds.some((id) => allTargetIds.has(id));
}