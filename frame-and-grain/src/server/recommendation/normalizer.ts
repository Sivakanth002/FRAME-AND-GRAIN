// ============================================================================
// FRAME & GRAIN — CANONICAL TITLE RECORD NORMALIZER
// Maps raw TMDB API payloads to canonical TitleRecord structures
// ============================================================================

import {
  TitleRecord,
  TMDBRawMovie,
  TMDBRawTV,
  WatchProvider,
  TMDBWatchProvidersResponse
} from '@/types/index';
import { TMDBGenresService } from '@/server/tmdb/genres';
import { TMDBProvidersService, TMDB_IMAGE_BASE_W500 } from '@/server/tmdb/providers';

export const TMDB_IMAGE_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original';

export function isAnime(originalLanguage: string, genreIds: number[]): boolean {
  // Deterministic anime classifier: Japanese original language ('ja') + Animation genre (16)
  const isJapanese = originalLanguage === 'ja' || originalLanguage.toLowerCase() === 'japanese';
  const hasAnimationGenre = Array.isArray(genreIds) && genreIds.includes(16);
  return isJapanese && hasAnimationGenre;
}

export function formatTVEpisodeRuntime(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || minutes <= 0 || isNaN(minutes)) return null;
  return `~${Math.round(minutes)} min/episode`;
}

export function normalizeMovie(raw: TMDBRawMovie): TitleRecord {
  const anime = isAnime(raw.original_language || '', raw.genre_ids || []);
  const year = raw.release_date ? parseInt(raw.release_date.slice(0, 4), 10) : null;
  const genres = (raw.genre_ids || []).map((id) => TMDBGenresService.getGenreName(id, 'movie')).filter(Boolean);

  return {
    source: 'tmdb',
    sourceId: String(raw.id),
    mediaType: 'movie',
    contentClass: anime ? 'anime' : 'movie',

    title: raw.title || raw.original_title || 'Untitled',
    originalTitle: raw.original_title || raw.title || 'Untitled',

    poster: raw.poster_path ? `${TMDB_IMAGE_BASE_W500}${raw.poster_path}` : null,
    backdrop: raw.backdrop_path ? `${TMDB_IMAGE_BASE_ORIGINAL}${raw.backdrop_path}` : null,

    releaseDate: raw.release_date || null,
    year: typeof year === 'number' && Number.isFinite(year) ? year : null,

    originalLanguage: raw.original_language || 'en',

    genres,
    genreIds: raw.genre_ids || [],

    runtime: typeof raw.runtime === 'number' && raw.runtime > 0 ? raw.runtime : null,
    episodeRuntimeFormatted: null,
    episodeCount: null,
    seasonCount: null,
    totalRuntime: typeof raw.runtime === 'number' && raw.runtime > 0 ? raw.runtime : null,

    rating: typeof raw.vote_average === 'number' ? raw.vote_average : 0,
    voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : 0,
    ratingScore: 0,

    providers: [],

    overview: raw.overview || ''
  };
}

export function normalizeTV(raw: TMDBRawTV): TitleRecord {
  const anime = isAnime(raw.original_language || '', raw.genre_ids || []);
  const year = raw.first_air_date ? parseInt(raw.first_air_date.slice(0, 4), 10) : null;
  const genres = (raw.genre_ids || []).map((id) => TMDBGenresService.getGenreName(id, 'tv')).filter(Boolean);

  const episodeMinutes = Array.isArray(raw.episode_run_time) && raw.episode_run_time.length > 0
    ? raw.episode_run_time[0]
    : null;

  const episodeCount = typeof raw.number_of_episodes === 'number' ? raw.number_of_episodes : null;
  const seasonCount = typeof raw.number_of_seasons === 'number' ? raw.number_of_seasons : null;
  const totalRuntime = episodeMinutes && episodeCount ? episodeMinutes * episodeCount : null;

  return {
    source: 'tmdb',
    sourceId: String(raw.id),
    mediaType: 'tv',
    contentClass: anime ? 'anime' : 'series',

    title: raw.name || raw.original_name || 'Untitled',
    originalTitle: raw.original_name || raw.name || 'Untitled',

    poster: raw.poster_path ? `${TMDB_IMAGE_BASE_W500}${raw.poster_path}` : null,
    backdrop: raw.backdrop_path ? `${TMDB_IMAGE_BASE_ORIGINAL}${raw.backdrop_path}` : null,

    releaseDate: raw.first_air_date || null,
    year: typeof year === 'number' && Number.isFinite(year) ? year : null,

    originalLanguage: raw.original_language || 'en',

    genres,
    genreIds: raw.genre_ids || [],

    runtime: episodeMinutes,
    episodeRuntimeFormatted: formatTVEpisodeRuntime(episodeMinutes),
    episodeCount,
    seasonCount,
    totalRuntime,

    rating: typeof raw.vote_average === 'number' ? raw.vote_average : 0,
    voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : 0,
    ratingScore: 0,

    providers: [],

    overview: raw.overview || ''
  };
}

export function attachWatchProviders(
  record: TitleRecord,
  providerResponse: TMDBWatchProvidersResponse | null | undefined,
  targetRegion: string
): TitleRecord {
  const providers = TMDBProvidersService.parseItemProviders(providerResponse, targetRegion);
  return {
    ...record,
    providers
  };
}

export function getTitleKey(record: { source: string; mediaType: string; sourceId: string | number }): string {
  return `${record.source}:${record.mediaType}:${record.sourceId}`;
}
