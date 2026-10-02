// ============================================================================
// FRAME & GRAIN — API: GET /api/title/[mediaType]/[id]
// Fetches normalized TitleRecord for a specific movie or TV show by TMDB ID
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { TMDBClient, TMDBConfigurationError, TMDBError } from '@/server/tmdb/client';
import { TMDBDiscoveryService } from '@/server/tmdb/discovery';
import { TMDBProvidersService } from '@/server/tmdb/providers';
import { TMDBCertificationService } from '@/server/tmdb/certifications';
import {
  normalizeMovie,
  normalizeTV,
  attachWatchProviders
} from '@/server/recommendation/normalizer';
import {
  normalizeCertification,
  getAudienceProfile
} from '@/server/recommendation/certifications';
import type { TMDBVideo } from '@/types/index';

function pickTrailer(videos: TMDBVideo[]): string | null {
  const trailer = videos.find(
    v => v.site === 'YouTube' && v.type === 'Trailer' && v.official
  ) ?? videos.find(
    v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
  );
  return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
}

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mediaType: string; id: string }> }
) {
  try {
    const { mediaType, id } = await context.params;
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region') || 'IN';

    if (!['movie', 'tv'].includes(mediaType)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_MEDIA_TYPE',
            message: "mediaType must be either 'movie' or 'tv'."
          }
        },
        { status: 400 }
      );
    }

    if (!id || !/^\d+$/.test(id)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_ID',
            message: 'Title ID must be a positive numeric identifier.'
          }
        },
        { status: 400 }
      );
    }

    const cleanRegion = /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : 'IN';

    const client = new TMDBClient();
    const discovery = new TMDBDiscoveryService(client);
    const providers = new TMDBProvidersService(client);
    const certService = new TMDBCertificationService(client);

    if (mediaType === 'movie') {
      const [rawMovie, providerRes, videoRes, relDates] = await Promise.all([
        discovery.getMovieDetail(id),
        providers.getMovieWatchProviders(id).catch(() => null),
        discovery.getMovieVideos(id).catch(() => null),
        certService.getMovieReleaseDates(id).catch(() => null)
      ]);
      const normalized = normalizeMovie(rawMovie);
      const enriched = attachWatchProviders(normalized, providerRes, cleanRegion);
      const rawCert = certService.extractMovieCertification(relDates, cleanRegion);
      const certification = normalizeCertification(rawCert, cleanRegion);
      const audienceProfile = getAudienceProfile(enriched, certification);
      const trailer = pickTrailer(videoRes?.results ?? []);

      return NextResponse.json({
        success: true,
        data: {
          ...enriched,
          certification,
          audienceProfile,
          trailerUrl: trailer
        }
      });
    } else {
      const [rawTV, providerRes, videoRes, tvRatings] = await Promise.all([
        discovery.getTVDetail(id),
        providers.getTVWatchProviders(id).catch(() => null),
        discovery.getTVVideos(id).catch(() => null),
        certService.getTVContentRatings(id).catch(() => null)
      ]);
      const normalized = normalizeTV(rawTV);
      const enriched = attachWatchProviders(normalized, providerRes, cleanRegion);
      const rawCert = certService.extractTVContentRating(tvRatings, cleanRegion);
      const certification = normalizeCertification(rawCert, cleanRegion);
      const audienceProfile = getAudienceProfile(enriched, certification);
      const trailer = pickTrailer(videoRes?.results ?? []);

      return NextResponse.json({
        success: true,
        data: {
          ...enriched,
          certification,
          audienceProfile,
          trailerUrl: trailer
        }
      });
    }
  } catch (err: unknown) {
    if (err instanceof TMDBConfigurationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TMDB_CREDENTIAL_MISSING',
            message: 'TMDB API credential is not configured. Please set TMDB_READ_ACCESS_TOKEN in server environment.'
          }
        },
        { status: 503 }
      );
    }

    if (err instanceof TMDBError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: err.code || 'TMDB_API_ERROR',
            message: err.message,
            details: err.details
          }
        },
        { status: err.statusCode || 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: (err as Error).message || 'Unexpected server error.'
        }
      },
      { status: 500 }
    );
  }
}
