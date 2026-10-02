// ============================================================================
// FRAME & GRAIN — DETERMINISTIC CERTIFICATION & AUDIENCE CLASSIFICATION
// Normalizes regional certifications, evaluates hard age safety, and
// deterministically classifies audience profiles for soft relevance
// ============================================================================

import {
  TitleRecord,
  ContentCertification,
  AudienceProfile
} from '@/types/index';

// ── REGIONAL NORMALIZATION MAPS ──────────────────────────────────────────────

interface RegionRatingRule {
  minimumAge: number | null;
  confidence: 'verified' | 'unknown';
}

const IN_RATINGS: Record<string, RegionRatingRule> = {
  'U': { minimumAge: 0, confidence: 'verified' },
  'UA': { minimumAge: 0, confidence: 'verified' },
  'U/A': { minimumAge: 0, confidence: 'verified' },
  'UA 7+': { minimumAge: 7, confidence: 'verified' },
  'U/A 7+': { minimumAge: 7, confidence: 'verified' },
  'UA 13+': { minimumAge: 13, confidence: 'verified' },
  'U/A 13+': { minimumAge: 13, confidence: 'verified' },
  'UA 16+': { minimumAge: 16, confidence: 'verified' },
  'U/A 16+': { minimumAge: 16, confidence: 'verified' },
  'A': { minimumAge: 18, confidence: 'verified' },
  'S': { minimumAge: 18, confidence: 'verified' }
};

const US_RATINGS: Record<string, RegionRatingRule> = {
  'G': { minimumAge: 0, confidence: 'verified' },
  'PG': { minimumAge: 8, confidence: 'verified' },
  'PG-13': { minimumAge: 13, confidence: 'verified' },
  'R': { minimumAge: 17, confidence: 'verified' },
  'NC-17': { minimumAge: 18, confidence: 'verified' },
  'TV-Y': { minimumAge: 0, confidence: 'verified' },
  'TV-Y7': { minimumAge: 7, confidence: 'verified' },
  'TV-Y7-FV': { minimumAge: 7, confidence: 'verified' },
  'TV-G': { minimumAge: 0, confidence: 'verified' },
  'TV-PG': { minimumAge: 8, confidence: 'verified' },
  'TV-14': { minimumAge: 14, confidence: 'verified' },
  'TV-MA': { minimumAge: 18, confidence: 'verified' },
  'NR': { minimumAge: null, confidence: 'unknown' },
  'UR': { minimumAge: null, confidence: 'unknown' }
};

const GB_RATINGS: Record<string, RegionRatingRule> = {
  'U': { minimumAge: 0, confidence: 'verified' },
  'UC': { minimumAge: 0, confidence: 'verified' },
  'PG': { minimumAge: 8, confidence: 'verified' },
  '12': { minimumAge: 12, confidence: 'verified' },
  '12A': { minimumAge: 12, confidence: 'verified' },
  '15': { minimumAge: 15, confidence: 'verified' },
  '18': { minimumAge: 18, confidence: 'verified' },
  'R18': { minimumAge: 18, confidence: 'verified' }
};

/**
 * Normalizes raw TMDB certification/rating strings into canonical ContentCertification
 * Regional systems are never conflated or assumed identical.
 */
export function normalizeCertification(
  rawRating: string | null | undefined,
  region: string
): ContentCertification {
  const regionUpper = (region || 'IN').toUpperCase();
  const trimmed = rawRating ? rawRating.trim().toUpperCase() : '';

  if (!trimmed) {
    return {
      region: regionUpper,
      rawRating: '',
      minimumAge: null,
      source: 'tmdb',
      confidence: 'unknown'
    };
  }

  let matchedRule: RegionRatingRule | undefined;

  if (regionUpper === 'IN') {
    matchedRule = IN_RATINGS[trimmed] || IN_RATINGS[trimmed.replace(/\s+/g, '')];
  } else if (regionUpper === 'US') {
    matchedRule = US_RATINGS[trimmed] || US_RATINGS[trimmed.replace(/\s+/g, '')];
  } else if (regionUpper === 'GB') {
    matchedRule = GB_RATINGS[trimmed] || GB_RATINGS[trimmed.replace(/\s+/g, '')];
  }

  // Fallback for known ISO numeric formats (e.g., '18', '16', '13', '12', '7', '0')
  if (!matchedRule) {
    const numMatch = trimmed.match(/^(\d{1,2})\+?$/);
    if (numMatch) {
      const parsedAge = parseInt(numMatch[1], 10);
      if (!isNaN(parsedAge) && parsedAge >= 0 && parsedAge <= 21) {
        matchedRule = { minimumAge: parsedAge, confidence: 'verified' };
      }
    }
  }

  if (matchedRule) {
    return {
      region: regionUpper,
      rawRating: rawRating ? rawRating.trim() : trimmed,
      minimumAge: matchedRule.minimumAge,
      source: 'tmdb',
      confidence: matchedRule.confidence
    };
  }

  return {
    region: regionUpper,
    rawRating: rawRating ? rawRating.trim() : trimmed,
    minimumAge: null,
    source: 'tmdb',
    confidence: 'unknown'
  };
}

// ── AGE SUITABILITY POLICY (HARD ELIGIBILITY FILTER) ──────────────────────────

export type AgeSuitabilityResult = 'safe' | 'not-safe' | 'unknown';

export const ADULT_AGE_GROUPS = new Set(['18-24', '25-34', '35-44', '45-54', '55+']);

/**
 * Deterministic age suitability validator.
 * Returns 'safe' or 'not-safe'.
 */
export function getAgeSuitability(
  title: TitleRecord,
  ageGroup: string | undefined,
  _region = 'IN'
): AgeSuitabilityResult {
  const normalizedAgeGroup = (ageGroup || 'all').toLowerCase().trim();

  // 1. Adult Viewers (18-24, 25-34, 35-44, 45-54, 55+)
  if (ADULT_AGE_GROUPS.has(normalizedAgeGroup)) {
    return 'safe';
  }

  const cert = title.certification;
  const rawRatingUpper = cert?.rawRating?.toUpperCase() || '';
  const minAge = cert?.minimumAge ?? null;

  // 2. Under 13 (UNDER 13)
  if (normalizedAgeGroup === 'under-13') {
    // Verified regional certification check
    if (cert && cert.confidence === 'verified' && minAge !== null) {
      if (minAge <= 12) return 'safe';
      return 'not-safe';
    }

    // Check known mature rating indicators
    if (
      rawRatingUpper === 'A' ||
      rawRatingUpper === 'S' ||
      rawRatingUpper === 'R' ||
      rawRatingUpper === 'NC-17' ||
      rawRatingUpper === '18+' ||
      rawRatingUpper === '18' ||
      rawRatingUpper === '16+' ||
      rawRatingUpper === '16' ||
      rawRatingUpper === '15' ||
      rawRatingUpper === 'TV-MA' ||
      rawRatingUpper === 'TV-14' ||
      rawRatingUpper === 'PG-13' ||
      rawRatingUpper === 'UA 13+' ||
      rawRatingUpper === 'UA 16+'
    ) {
      return 'not-safe';
    }

    // Check known kids/family rating indicators
    if (
      rawRatingUpper === 'U' ||
      rawRatingUpper === 'G' ||
      rawRatingUpper === 'TV-Y' ||
      rawRatingUpper === 'TV-G' ||
      rawRatingUpper === 'UA' ||
      rawRatingUpper === 'PG'
    ) {
      return 'safe';
    }

    // Conservative handling when certification is unavailable/unknown:
    // Exclude mature genres (Horror: 27, Crime: 80, War: 10752, Thriller: 53)
    const hasMatureGenre = title.genreIds.some((g) => [27, 80, 10752, 53].includes(g));
    if (hasMatureGenre) {
      return 'not-safe';
    }

    // Allow Animation (16), Kids (10762), or Family (10751) if no mature genres present
    const isSafeFamilyContent = title.genreIds.some((g) => [16, 10762, 10751].includes(g));
    if (isSafeFamilyContent) {
      return 'safe';
    }

    // Default conservative exclusion for under-13 when safety cannot be established
    return 'not-safe';
  }

  // 3. Teens (13–17)
  if (normalizedAgeGroup === '13-17') {
    // Verified regional certification check
    if (cert && cert.confidence === 'verified' && minAge !== null) {
      if (minAge <= 17) return 'safe';
      return 'not-safe';
    }

    // Exclude strictly 18+/adult equivalents
    if (
      rawRatingUpper === 'A' ||
      rawRatingUpper === 'S' ||
      rawRatingUpper === 'NC-17' ||
      rawRatingUpper === '18+' ||
      rawRatingUpper === '18' ||
      rawRatingUpper === 'R18' ||
      rawRatingUpper === 'TV-MA'
    ) {
      return 'not-safe';
    }

    // Conservative check when certification is unknown
    const hasExtremeMatureSignals =
      title.genreIds.includes(27) && title.genreIds.includes(80); // Horror + Crime combination
    if (hasExtremeMatureSignals) {
      return 'not-safe';
    }

    return 'safe';
  }

  // 4. General-Audience Safety Mode (Lucky without explicit age context)
  if (normalizedAgeGroup === 'general-safety') {
    if (cert && cert.confidence === 'verified' && minAge !== null) {
      if (minAge >= 18) return 'not-safe';
      return 'safe';
    }

    if (
      rawRatingUpper === 'A' ||
      rawRatingUpper === 'S' ||
      rawRatingUpper === 'NC-17' ||
      rawRatingUpper === '18+' ||
      rawRatingUpper === '18' ||
      rawRatingUpper === 'R18' ||
      rawRatingUpper === 'TV-MA'
    ) {
      return 'not-safe';
    }

    return 'safe';
  }

  // 5. Prefer Not to Say / All (TUNE context)
  return 'safe';
}

// ── AUDIENCE PROFILE CLASSIFIER (DETERMINISTIC) ──────────────────────────────

const TODDLER_PRESCHOOL_KEYWORDS = [
  'paw patrol',
  'cocomelon',
  'peppa pig',
  'mickey mouse clubhouse',
  'sesame street',
  'toddler',
  'preschool',
  'nursery rhyme',
  'dora the explorer',
  'bluey',
  'thomas & friends',
  'thomas and friends',
  'teletubbies',
  'barney'
];

/**
 * Deterministically classifies content into broad audience profiles.
 * Animation alone != child-focused.
 * Anime alone != child-focused.
 * Family alone != child-focused.
 */
export function getAudienceProfile(
  title: TitleRecord,
  cert?: ContentCertification
): AudienceProfile {
  const rawRatingUpper = cert?.rawRating?.toUpperCase() || title.certification?.rawRating?.toUpperCase() || '';
  const minAge = cert?.minimumAge ?? title.certification?.minimumAge ?? null;
  const overviewLower = (title.overview || '').toLowerCase();
  const titleLower = (title.title || '').toLowerCase();

  // 1. Mature Check
  if (
    (minAge !== null && minAge >= 18) ||
    ['A', 'S', 'NC-17', '18', '18+', 'R18', 'TV-MA'].includes(rawRatingUpper)
  ) {
    return 'mature';
  }

  // 2. Child-Focused Check (Fixes the Paw Patrol problem)
  // Must NOT have mature genres: Crime (80), Horror (27), War (10752), Thriller (53)
  const hasMatureGenre = title.genreIds.some((g) => [80, 27, 10752, 53].includes(g));

  if (!hasMatureGenre) {
    // Explicit toddler/preschool signal in title or overview
    const hasPreschoolKeyword = TODDLER_PRESCHOOL_KEYWORDS.some(
      (kw) => overviewLower.includes(kw) || titleLower.includes(kw)
    );
    if (hasPreschoolKeyword) {
      return 'child-focused';
    }

    // Kids TV genre (10762)
    if (title.genreIds.includes(10762)) {
      return 'child-focused';
    }

    // Family (10751) + Animation (16) with low age rating and short runtime
    const isFamilyAndAnimation = title.genreIds.includes(10751) && title.genreIds.includes(16);
    const isVeryYoungRating = ['TV-Y', 'TV-Y7', 'G', 'U'].includes(rawRatingUpper);
    const isShortFormat = title.runtime !== null && title.runtime <= 90;

    if (isFamilyAndAnimation && (isVeryYoungRating || isShortFormat)) {
      // If it's anime, do not classify as child-focused unless preschool keywords match
      if (title.contentClass !== 'anime') {
        return 'child-focused';
      }
    }
  }

  // 3. Family / General Check
  if (
    title.genreIds.includes(10751) ||
    ['G', 'TV-G', 'U', 'PG', 'TV-PG'].includes(rawRatingUpper)
  ) {
    return 'family-general';
  }

  // 4. Teen / General Check
  if (
    (minAge !== null && minAge >= 12 && minAge <= 17) ||
    ['PG-13', '12', '12A', '14', 'TV-14', 'UA 13+', 'UA 16+'].includes(rawRatingUpper)
  ) {
    return 'teen-general';
  }

  // 5. Mature by genre combination
  if (title.genreIds.includes(27) || (title.genreIds.includes(80) && rawRatingUpper === 'R')) {
    return 'mature';
  }

  // 6. Default General
  if (title.genreIds.length > 0 || overviewLower.length > 0) {
    return 'general';
  }

  return 'unknown';
}

// ── AUDIENCE RELEVANCE MULTIPLIER (SOFT SIGNAL) ──────────────────────────────

/**
 * Returns a soft multiplier based on audience profile and viewer age group.
 * Safe does NOT mean Good Match.
 * For adults: child-focused content is downweighted (~0.35x) so it doesn't crowd out adult films.
 * For under-13: child-focused/family content is boosted.
 */
export function getAudienceRelevanceMultiplier(
  profile: AudienceProfile,
  ageGroup: string | undefined
): number {
  const normalizedAgeGroup = (ageGroup || 'all').toLowerCase().trim();

  // Adult Viewers (18-24, 25-34, 35-44, 45-54, 55+)
  if (ADULT_AGE_GROUPS.has(normalizedAgeGroup)) {
    if (profile === 'child-focused') {
      return 0.35; // Strong downweighting
    }
    return 1.0;
  }

  // Under 13
  if (normalizedAgeGroup === 'under-13') {
    switch (profile) {
      case 'child-focused':
        return 1.30;
      case 'family-general':
        return 1.15;
      case 'teen-general':
        return 0.90;
      case 'general':
        return 1.00;
      case 'mature':
        return 0.10;
      default:
        return 1.00;
    }
  }

  // 13–17
  if (normalizedAgeGroup === '13-17') {
    switch (profile) {
      case 'child-focused':
        return 0.60;
      case 'teen-general':
        return 1.25;
      case 'family-general':
        return 1.00;
      case 'general':
        return 1.00;
      case 'mature':
        return 0.10;
      default:
        return 1.00;
    }
  }

  // Prefer Not to Say / All
  return 1.0;
}
