// ============================================================================
// FRAME & GRAIN — HARD FILTER PIPELINE
// Strict deterministic eligibility filters applied before any scoring
// ============================================================================

import {
  TitleRecord,
  Preferences,
  AccessMode
} from '@/types/index';
import { getAgeSuitability } from './certifications';

export const DEFAULT_PREFERENCES: Preferences = {
  region: 'IN',
  providerIds: [8, 9, 122], // Default Netflix (8), Prime (9), Hotstar (122)
  providerMode: 'any',
  accessModes: ['flatrate'],
  format: 'all',
  language: 'all',
  languages: [],
  runtime: 'all',
  period: 'all',
  genreIds: [],
  ageGroup: 'all',
  mood: 'all'
};

export function sanitizePreferences(input: Partial<Preferences>): Preferences {
  const region = typeof input.region === 'string' && input.region.trim()
    ? input.region.trim().toUpperCase()
    : DEFAULT_PREFERENCES.region;

  const providerIds = Array.isArray(input.providerIds)
    ? input.providerIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : DEFAULT_PREFERENCES.providerIds;

  const validProviderModes = ['any', 'all', 'none', 'any-provider'];
  const providerMode = validProviderModes.includes(input.providerMode as string)
    ? (input.providerMode as Preferences['providerMode'])
    : DEFAULT_PREFERENCES.providerMode;

  const validAccessModes: AccessMode[] = ['flatrate', 'rent', 'buy'];
  const accessModes = Array.isArray(input.accessModes) && input.accessModes.length > 0
    ? input.accessModes.filter((m): m is AccessMode => validAccessModes.includes(m as AccessMode))
    : DEFAULT_PREFERENCES.accessModes;

  const validFormats = ['all', 'movie', 'series', 'anime'];
  const format = validFormats.includes(input.format as string)
    ? (input.format as Preferences['format'])
    : 'all';

  const languages = Array.isArray(input.languages)
    ? input.languages
        .map((l) => String(l).trim().toLowerCase())
        .filter((l) => l && l !== 'all')
    : [];

  const language = typeof input.language === 'string' && input.language.trim()
    ? input.language.trim().toLowerCase()
    : (languages.length > 0 ? languages[0] : 'all');

  const validRuntimes = ['all', 'under-90', '90-120', '120-150', '150+'];
  const runtime = validRuntimes.includes(input.runtime as string)
    ? (input.runtime as Preferences['runtime'])
    : 'all';

  const validPeriods = ['all', 'latest', '2020s', '2010s', '2000s', 'before-2000'];
  const period = validPeriods.includes(input.period as string)
    ? (input.period as Preferences['period'])
    : 'all';

  const customDateRange = input.customDateRange
    ? {
        start: input.customDateRange.start ? String(input.customDateRange.start).trim() : undefined,
        end: input.customDateRange.end ? String(input.customDateRange.end).trim() : undefined
      }
    : undefined;

  const genreIds = Array.isArray(input.genreIds)
    ? input.genreIds.map((g) => Number(g)).filter((g) => Number.isFinite(g) && g > 0)
    : [];

  const ageGroup = typeof input.ageGroup === 'string' && input.ageGroup.trim()
    ? input.ageGroup.trim().toLowerCase()
    : 'all';

  const mood = typeof input.mood === 'string' && input.mood.trim()
    ? input.mood.trim().toLowerCase()
    : 'all';

  return {
    region,
    providerIds,
    providerMode,
    accessModes: accessModes.length > 0 ? accessModes : ['flatrate'],
    format,
    language,
    languages: languages.length > 0 ? languages : (language !== 'all' ? [language] : []),
    runtime,
    period,
    customDateRange,
    genreIds,
    ageGroup,
    mood
  };
}

export function isCandidateEligible(candidate: TitleRecord, prefs: Preferences): boolean {
  // 1. Format Filter
  if (prefs.format === 'movie') {
    if (candidate.mediaType !== 'movie') return false;
  } else if (prefs.format === 'series') {
    if (candidate.mediaType !== 'tv' || candidate.contentClass === 'anime') return false;
  } else if (prefs.format === 'anime') {
    if (candidate.contentClass !== 'anime') return false;
  }

  // 2. Language Filter (Strict canonical TMDB original-language match with ANY-of multi-language semantics)
  if (prefs.languages && prefs.languages.length > 0) {
    const candidateLang = candidate.originalLanguage.toLowerCase();
    const matchesAnyLang = prefs.languages.some((l) => l.toLowerCase() === candidateLang);
    if (!matchesAnyLang) {
      return false;
    }
  } else if (prefs.language && prefs.language !== 'all') {
    if (candidate.originalLanguage.toLowerCase() !== prefs.language.toLowerCase()) {
      return false;
    }
  }

  // 3. Release Period Filter
  if (!matchesReleasePeriod(candidate, prefs)) {
    return false;
  }

  // 4. Runtime Filter
  if (!matchesRuntime(candidate, prefs)) {
    return false;
  }

  // 5. Genre Hard Filter (ANY selected genre is sufficient)
  if (prefs.genreIds && prefs.genreIds.length > 0) {
    const hasAnyGenreMatch = candidate.genreIds.some((id) => prefs.genreIds.includes(id));
    if (!hasAnyGenreMatch) {
      return false;
    }
  }

  // 6. Provider and Access Mode Filter
  if (!matchesProviders(candidate, prefs)) {
    return false;
  }

  // 7. Age Safety / Maturity Suitability Hard Filter
  if (prefs.ageGroup && prefs.ageGroup !== 'all') {
    const suitability = getAgeSuitability(candidate, prefs.ageGroup, prefs.region);
    if (suitability === 'not-safe') {
      return false;
    }
  }

  return true;
}

export function matchesReleasePeriod(candidate: TitleRecord, prefs: Preferences): boolean {
  if (prefs.period === 'all' && !prefs.customDateRange) return true;

  const releaseDate = candidate.releaseDate;
  const year = candidate.year;

  // Custom Date Range boundary
  if (prefs.customDateRange) {
    if (prefs.customDateRange.start && releaseDate && releaseDate < prefs.customDateRange.start) {
      return false;
    }
    if (prefs.customDateRange.end && releaseDate && releaseDate > prefs.customDateRange.end) {
      return false;
    }
    if (!releaseDate && year) {
      const yearStart = prefs.customDateRange.start ? parseInt(prefs.customDateRange.start.slice(0, 4), 10) : null;
      const yearEnd = prefs.customDateRange.end ? parseInt(prefs.customDateRange.end.slice(0, 4), 10) : null;
      if (yearStart && year < yearStart) return false;
      if (yearEnd && year > yearEnd) return false;
    }
    return true;
  }

  if (year === null && releaseDate === null) return false;

  const currentYear = new Date().getFullYear();

  switch (prefs.period) {
    case 'latest': {
      if (releaseDate) {
        const dateObj = new Date(releaseDate);
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
        return dateObj >= threeYearsAgo;
      }
      return year !== null && year >= currentYear - 3;
    }
    case '2020s':
      return year !== null && year >= 2020 && year <= 2029;
    case '2010s':
      return year !== null && year >= 2010 && year <= 2019;
    case '2000s':
      return year !== null && year >= 2000 && year <= 2009;
    case 'before-2000':
      return year !== null && year < 2000;
    case 'all':
    default:
      return true;
  }
}

export function matchesRuntime(candidate: TitleRecord, prefs: Preferences): boolean {
  if (prefs.runtime === 'all') return true;

  if (candidate.runtime === null || candidate.runtime <= 0) return false;

  const runtime = candidate.runtime;

  switch (prefs.runtime) {
    case 'under-90':
      return runtime < 90;
    case '90-120':
      return runtime >= 90 && runtime <= 120;
    case '120-150':
      return runtime > 120 && runtime <= 150;
    case '150+':
      return runtime > 150;
    default:
      return true;
  }
}

export function matchesProviders(candidate: TitleRecord, prefs: Preferences): boolean {
  const matchingAccessProviders = candidate.providers.filter((p) =>
    prefs.accessModes.includes(p.type as AccessMode)
  );

  const availableProviderIds = new Set(matchingAccessProviders.map((p) => p.tmdbProviderId));

  switch (prefs.providerMode) {
    case 'any-provider':
      return matchingAccessProviders.length > 0;

    case 'none':
      if (prefs.providerIds.length === 0) return true;
      return !prefs.providerIds.some((id) => availableProviderIds.has(id));

    case 'all':
      if (prefs.providerIds.length === 0) return matchingAccessProviders.length > 0;
      return prefs.providerIds.every((id) => availableProviderIds.has(id));

    case 'any':
    default:
      if (prefs.providerIds.length === 0) return matchingAccessProviders.length > 0;
      return prefs.providerIds.some((id) => availableProviderIds.has(id));
  }
}
