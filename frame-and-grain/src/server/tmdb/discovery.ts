// ============================================================================
// FRAME & GRAIN — TMDB DISCOVERY SERVICE
// Pushes hard filter constraints into TMDB /discover endpoints
// ============================================================================

import { TMDBClient } from './client';
import {
  Preferences,
  TMDBDiscoverResponse,
  TMDBRawMovie,
  TMDBRawTV,
  TMDBVideo
} from '@/types/index';
import { mapGenresForMediaType } from './genres';

export class TMDBDiscoveryService {
  constructor(private client: TMDBClient) {}

  public async discoverMovies(
    prefs: Preferences,
    page = 1
  ): Promise<TMDBDiscoverResponse<TMDBRawMovie>> {
    const params = this.buildMovieDiscoveryParams(prefs, page);
    return this.client.request<TMDBDiscoverResponse<TMDBRawMovie>>(
      '/discover/movie',
      params,
      { cacheTtlMs: 15 * 60 * 1000, cacheKeyPrefix: 'discover_movie' }
    );
  }

  public async discoverTV(
    prefs: Preferences,
    page = 1
  ): Promise<TMDBDiscoverResponse<TMDBRawTV>> {
    const params = this.buildTVDiscoveryParams(prefs, page);
    return this.client.request<TMDBDiscoverResponse<TMDBRawTV>>(
      '/discover/tv',
      params,
      { cacheTtlMs: 15 * 60 * 1000, cacheKeyPrefix: 'discover_tv' }
    );
  }

  public async getMovieDetail(id: string | number): Promise<TMDBRawMovie> {
    return this.client.request<TMDBRawMovie>(
      `/movie/${id}`,
      {},
      { cacheTtlMs: 2 * 60 * 60 * 1000, cacheKeyPrefix: 'title' }
    );
  }

  public async getTVDetail(id: string | number): Promise<TMDBRawTV> {
    return this.client.request<TMDBRawTV>(
      `/tv/${id}`,
      {},
      { cacheTtlMs: 2 * 60 * 60 * 1000, cacheKeyPrefix: 'title' }
    );
  }

  public async getMovieVideos(id: string | number): Promise<{ results: TMDBVideo[] }> {
    return this.client.request<{ results: TMDBVideo[] }>(
      `/movie/${id}/videos`,
      { language: 'en-US' },
      { cacheTtlMs: 24 * 60 * 60 * 1000, cacheKeyPrefix: 'video' }
    );
  }

  public async getTVVideos(id: string | number): Promise<{ results: TMDBVideo[] }> {
    return this.client.request<{ results: TMDBVideo[] }>(
      `/tv/${id}/videos`,
      { language: 'en-US' },
      { cacheTtlMs: 24 * 60 * 60 * 1000, cacheKeyPrefix: 'video' }
    );
  }

  private buildMovieDiscoveryParams(
    prefs: Preferences,
    page: number
  ): Record<string, string | number | boolean | undefined> {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      sort_by: 'popularity.desc',
      include_adult: false
    };

    if (prefs.region) {
      params.watch_region = prefs.region;
    }

    if (prefs.accessModes && prefs.accessModes.length > 0) {
      params.with_watch_monetization_types = prefs.accessModes.join('|');
    }

    if (prefs.providerIds && prefs.providerIds.length > 0 && prefs.providerMode === 'any') {
      params.with_watch_providers = prefs.providerIds.join('|');
    } else if (prefs.providerIds && prefs.providerIds.length > 0 && prefs.providerMode === 'all') {
      params.with_watch_providers = prefs.providerIds.join(',');
    }

    if (prefs.languages && prefs.languages.length > 0) {
      params.with_original_language = prefs.languages.join('|');
    } else if (prefs.language && prefs.language !== 'all') {
      params.with_original_language = prefs.language.includes(',')
        ? prefs.language.split(',').map((l) => l.trim()).join('|')
        : prefs.language;
    }

    if (prefs.genreIds && prefs.genreIds.length > 0) {
      const movieGenreIds = mapGenresForMediaType(prefs.genreIds, 'movie');
      if (movieGenreIds.length > 0) {
        params.with_genres = movieGenreIds.join('|');
      }
    }

    // Release Period
    this.applyReleasePeriodParams(params, prefs, 'movie');

    // Runtime
    this.applyRuntimeParams(params, prefs);

    // Regional certification bounds
    if (prefs.ageGroup === 'under-13' && prefs.region) {
      params.certification_country = prefs.region;
      if (prefs.region.toUpperCase() === 'US') {
        params['certification.lte'] = 'PG';
      } else if (prefs.region.toUpperCase() === 'IN') {
        params['certification.lte'] = 'UA';
      } else if (prefs.region.toUpperCase() === 'GB') {
        params['certification.lte'] = 'PG';
      }
    }

    return params;
  }

  private buildTVDiscoveryParams(
    prefs: Preferences,
    page: number
  ): Record<string, string | number | boolean | undefined> {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      sort_by: 'popularity.desc',
      include_adult: false
    };

    if (prefs.region) {
      params.watch_region = prefs.region;
    }

    if (prefs.accessModes && prefs.accessModes.length > 0) {
      params.with_watch_monetization_types = prefs.accessModes.join('|');
    }

    if (prefs.providerIds && prefs.providerIds.length > 0 && prefs.providerMode === 'any') {
      params.with_watch_providers = prefs.providerIds.join('|');
    } else if (prefs.providerIds && prefs.providerIds.length > 0 && prefs.providerMode === 'all') {
      params.with_watch_providers = prefs.providerIds.join(',');
    }

    if (prefs.languages && prefs.languages.length > 0) {
      params.with_original_language = prefs.languages.join('|');
    } else if (prefs.language && prefs.language !== 'all') {
      params.with_original_language = prefs.language.includes(',')
        ? prefs.language.split(',').map((l) => l.trim()).join('|')
        : prefs.language;
    }

    if (prefs.genreIds && prefs.genreIds.length > 0) {
      const tvGenreIds = mapGenresForMediaType(prefs.genreIds, 'tv');
      if (tvGenreIds.length > 0) {
        params.with_genres = tvGenreIds.join('|');
      }
    }

    // Release Period
    this.applyReleasePeriodParams(params, prefs, 'tv');

    // Runtime
    this.applyRuntimeParams(params, prefs);

    return params;
  }

  private applyReleasePeriodParams(
    params: Record<string, string | number | boolean | undefined>,
    prefs: Preferences,
    mediaType: 'movie' | 'tv'
  ): void {
    const dateKeyGte = mediaType === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
    const dateKeyLte = mediaType === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';

    if (prefs.customDateRange) {
      if (prefs.customDateRange.start) params[dateKeyGte] = prefs.customDateRange.start;
      if (prefs.customDateRange.end) params[dateKeyLte] = prefs.customDateRange.end;
      return;
    }

    const currentYear = new Date().getFullYear();

    switch (prefs.period) {
      case 'latest': {
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(currentYear - 3);
        params[dateKeyGte] = threeYearsAgo.toISOString().slice(0, 10);
        break;
      }
      case '2020s':
        params[dateKeyGte] = '2020-01-01';
        params[dateKeyLte] = '2029-12-31';
        break;
      case '2010s':
        params[dateKeyGte] = '2010-01-01';
        params[dateKeyLte] = '2019-12-31';
        break;
      case '2000s':
        params[dateKeyGte] = '2000-01-01';
        params[dateKeyLte] = '2009-12-31';
        break;
      case 'before-2000':
        params[dateKeyLte] = '1999-12-31';
        break;
      case 'all':
      default:
        break;
    }
  }

  private applyRuntimeParams(
    params: Record<string, string | number | boolean | undefined>,
    prefs: Preferences
  ): void {
    switch (prefs.runtime) {
      case 'under-90':
        params['with_runtime.lte'] = 89;
        break;
      case '90-120':
        params['with_runtime.gte'] = 90;
        params['with_runtime.lte'] = 120;
        break;
      case '120-150':
        params['with_runtime.gte'] = 121;
        params['with_runtime.lte'] = 150;
        break;
      case '150+':
        params['with_runtime.gte'] = 151;
        break;
      case 'all':
      default:
        break;
    }
  }
}
