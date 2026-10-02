// ============================================================================
// FRAME & GRAIN — API: GET /api/genres
// Fetches dynamic combined genre mappings from TMDB
// ============================================================================

import { NextResponse } from 'next/server';
import { TMDBClient, TMDBConfigurationError, TMDBError } from '@/server/tmdb/client';
import { TMDBGenresService } from '@/server/tmdb/genres';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = new TMDBClient();
    const genresService = new TMDBGenresService(client);
    const genres = await genresService.getAllCombinedGenres();

    return NextResponse.json({
      success: true,
      data: {
        genres
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
