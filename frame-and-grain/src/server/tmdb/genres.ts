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
