// ============================================================================
// FRAME & GRAIN — API: GET /api/providers
// Fetches TMDB watch providers for a region
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { TMDBClient, TMDBConfigurationError, TMDBError } from '@/server/tmdb/client';
import { TMDBProvidersService } from '@/server/tmdb/providers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region') || 'IN';

    const client = new TMDBClient();
    const providersService = new TMDBProvidersService(client);
    const providers = await providersService.getRegionProviders(region);

    return NextResponse.json({
      success: true,
      data: {
        region: region.toUpperCase(),
        providers,
        attribution: 'Watch provider data powered by JustWatch / TMDB'
      }
    });
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
