// ============================================================================
// FRAME & GRAIN — API: /api/recommendations
// Handles TUNE and LUCKY recommendation requests with hard filtering & Bayesian scoring
//
// KEY SEPARATION (Lucky vs TUNE):
// TUNE mode  → all preferences are hard TMDB discovery constraints
// Lucky mode → provider/region are hard constraints; format/language/etc are SOFT ONLY
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { TMDBClient, TMDBConfigurationError, TMDBError } from '@/server/tmdb/client';
import { RecommendationEngine } from '@/server/recommendation/engine';
import { RecommendationRequest, Preferences } from '@/types/index';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RecommendationRequest;
    const client = new TMDBClient();
    const engine = new RecommendationEngine(client);

    const result = await engine.getRecommendations(body);

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
        providerAttribution: 'Watch provider availability supplied by JustWatch.'
      }
    });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const mode = searchParams.get('mode') === 'lucky' || searchParams.get('lucky') === 'true' ? 'lucky' : 'tune';
    const region = searchParams.get('region') || 'IN';
    const sessionId = searchParams.get('sessionId') || undefined;

    // Provider/access — applies in both modes (user explicitly chose these)
    const providerIdsParam = searchParams.get('providerIds') || searchParams.get('services');
    const providerIds = providerIdsParam
      ? providerIdsParam.split(',').map((id) => Number(id.trim())).filter((id) => Number.isFinite(id) && id > 0)
      : undefined;
    const accessModesParam = searchParams.get('accessModes');
    const accessModes = accessModesParam
      ? (accessModesParam.split(',').map((m) => m.trim().toLowerCase()) as Preferences['accessModes'])
      : undefined;
    const providerMode = (searchParams.get('providerMode') || 'any') as Preferences['providerMode'];

    // History params
    const tuneShownIdsParam = searchParams.get('tuneShownIds') || searchParams.get('tuneHistory');
    const tuneShownIds = tuneShownIdsParam
      ? tuneShownIdsParam.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;
    const luckyHistoryParam = searchParams.get('luckyHistory');
    const luckyHistory = luckyHistoryParam
      ? luckyHistoryParam.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    let recRequest: RecommendationRequest;

    if (mode === 'lucky') {
      // ── LUCKY MODE ───────────────────────────────────────────────────────────
      // Discovery pool is unconstrained by format/language/runtime/period/genre.
      // TUNE preferences become soft affinity bias only (tunePreferences field).
      // Provider/region context retained (user's explicit streaming context).
      const tuneFormatParam = searchParams.get('tuneFormat');
      const tuneLanguageParam = searchParams.get('tuneLanguages') || searchParams.get('tuneLanguage');
      const tuneGenreIdsParam = searchParams.get('tuneGenreIds');
      const tuneAgeGroupParam = searchParams.get('tuneAgeGroup');
      const tuneMoodParam = searchParams.get('tuneMood');

      const tuneGenreIds = tuneGenreIdsParam
        ? tuneGenreIdsParam.split(',').map(id => Number(id.trim())).filter(id => Number.isFinite(id) && id > 0)
        : undefined;

      const tuneLanguages = tuneLanguageParam && tuneLanguageParam !== 'all'
        ? tuneLanguageParam.split(',').map(l => l.trim().toLowerCase()).filter(Boolean)
        : undefined;

      const tunePreferences: Partial<Preferences> = {};
      if (tuneFormatParam && tuneFormatParam !== 'all') tunePreferences.format = tuneFormatParam as Preferences['format'];
      if (tuneLanguages?.length) {
        tunePreferences.languages = tuneLanguages;
        tunePreferences.language = tuneLanguages[0];
      }
      if (tuneGenreIds?.length) tunePreferences.genreIds = tuneGenreIds;
      if (tuneAgeGroupParam && tuneAgeGroupParam !== 'all') tunePreferences.ageGroup = tuneAgeGroupParam;
      if (tuneMoodParam && tuneMoodParam !== 'all') tunePreferences.mood = tuneMoodParam;

      recRequest = {
        mode: 'lucky',
        sessionId,
        region,
        preferences: {
          region,
          format: 'all',   // No hard format filter for Lucky
          language: 'all', // No hard language filter for Lucky
          languages: [],
          runtime: 'all',  // No hard runtime filter for Lucky
          period: 'all',   // No hard period filter for Lucky
          ageGroup: 'all', // No hard ageGroup filter for Lucky
          mood: 'all',     // No hard mood filter for Lucky
          providerIds,     // Retained — user's streaming context
          providerMode,
          accessModes,
        },
        tunePreferences,   // Soft affinity bias only — does NOT filter pool
        tuneShownIds,      // Actual TUNE-shown title IDs — soft exclusion signal
        luckyHistory,      // Lucky session history — hard exclusion
      };
    } else {
      // ── TUNE MODE ────────────────────────────────────────────────────────────
      // All preferences are hard TMDB discovery constraints.
      const format = (searchParams.get('format') || 'all') as Preferences['format'];
      const languageParam = searchParams.get('languages') || searchParams.get('language') || 'all';
      const languages = languageParam && languageParam !== 'all'
        ? languageParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : [];
      const language = languages.length === 1 ? languages[0] : (languages.length > 1 ? languages.join(',') : 'all');

      const runtime = (searchParams.get('runtime') || 'all') as Preferences['runtime'];
      const period = (searchParams.get('period') || 'all') as Preferences['period'];
      const ageGroup = searchParams.get('ageGroup') || 'all';
      const mood = searchParams.get('mood') || 'all';

      const genreIdsParam = searchParams.get('genreIds') || searchParams.get('genres');
      const genreIds = genreIdsParam
        ? genreIdsParam.split(',').map((id) => Number(id.trim())).filter((id) => Number.isFinite(id) && id > 0)
        : undefined;

      recRequest = {
        mode: 'tune',
        sessionId,
        region,
        preferences: {
          region,
          format,
          language,
          languages,
          runtime,
          period,
          ageGroup,
          mood,
          providerIds,
          providerMode,
          accessModes,
          genreIds,
        },
      };
    }

    const client = new TMDBClient();
    const engine = new RecommendationEngine(client);
    const result = await engine.getRecommendations(recRequest);

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
        providerAttribution: 'Watch provider availability supplied by JustWatch.'
      }
    });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}

function handleApiError(err: unknown) {
  if (err instanceof TMDBConfigurationError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'TMDB_CREDENTIAL_MISSING',
          message: 'TMDB Read Access Token is not configured. Please set TMDB_READ_ACCESS_TOKEN in server environment (.env).'
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
