// ============================================================================
// FRAME & GRAIN — TMDB WATCH PROVIDERS SERVICE
// Fetches dynamic watch providers for regions & individual titles from TMDB (JustWatch)
// ============================================================================

import { TMDBClient } from './client';
import {
  TMDBWatchProvidersResponse,
  TMDBWatchProviderInfo,
  WatchProvider,
  MonetizationType
} from '@/types/index';

export const TMDB_IMAGE_BASE_W500 = 'https://image.tmdb.org/t/p/w500';

export interface TMDBProviderListResponse {
  results: TMDBWatchProviderInfo[];
}

export class TMDBProvidersService {
  constructor(private client: TMDBClient) {}

  public async getRegionProviders(region: string): Promise<TMDBWatchProviderInfo[]> {
    const cleanRegion = region.trim().toUpperCase();
    const [movieProvidersRes, tvProvidersRes] = await Promise.all([
      this.client.request<TMDBProviderListResponse>(
        '/watch/providers/movie',
        { watch_region: cleanRegion },
        { cacheTtlMs: 6 * 60 * 60 * 1000, cacheKeyPrefix: 'providers' }
      ),
      this.client.request<TMDBProviderListResponse>(
        '/watch/providers/tv',
        { watch_region: cleanRegion },
        { cacheTtlMs: 6 * 60 * 60 * 1000, cacheKeyPrefix: 'providers' }
      )
    ]);

    const providerMap = new Map<number, TMDBWatchProviderInfo>();

    for (const p of movieProvidersRes.results || []) {
      providerMap.set(p.provider_id, p);
    }
    for (const p of tvProvidersRes.results || []) {
      if (!providerMap.has(p.provider_id)) {
        providerMap.set(p.provider_id, p);
      }
    }

    return Array.from(providerMap.values()).sort(
      (a, b) => a.display_priority - b.display_priority
    );
  }

  public async getMovieWatchProviders(movieId: string | number): Promise<TMDBWatchProvidersResponse> {
    return this.client.request<TMDBWatchProvidersResponse>(
      `/movie/${movieId}/watch/providers`,
      {},
      { cacheTtlMs: 6 * 60 * 60 * 1000, cacheKeyPrefix: 'providers' }
    );
  }

  public async getTVWatchProviders(tvId: string | number): Promise<TMDBWatchProvidersResponse> {
    return this.client.request<TMDBWatchProvidersResponse>(
      `/tv/${tvId}/watch/providers`,
      {},
      { cacheTtlMs: 6 * 60 * 60 * 1000, cacheKeyPrefix: 'providers' }
    );
  }

  public static parseItemProviders(
    providerResponse: TMDBWatchProvidersResponse | null | undefined,
    targetRegion: string
  ): WatchProvider[] {
    if (!providerResponse || !providerResponse.results) return [];
    const regionData = providerResponse.results[targetRegion.toUpperCase()];
    if (!regionData) return [];

    const providers: WatchProvider[] = [];
    const seen = new Set<string>();

    const append = (items: TMDBWatchProviderInfo[] | undefined, type: MonetizationType) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        const key = `${item.provider_id}:${type}`;
        if (!seen.has(key)) {
          seen.add(key);
          providers.push({
            tmdbProviderId: item.provider_id,
            name: item.provider_name,
            logoPath: item.logo_path ? `${TMDB_IMAGE_BASE_W500}${item.logo_path}` : null,
            type
          });
        }
      }
    };

    append(regionData.flatrate, 'flatrate');
    append(regionData.rent, 'rent');
    append(regionData.buy, 'buy');
    append(regionData.free, 'free');
    append(regionData.ads, 'ads');

    return providers;
  }
}
