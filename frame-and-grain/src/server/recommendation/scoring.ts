// ============================================================================
// FRAME & GRAIN — NORMAL RECOMMENDATION SCORING ENGINE
// Computes Bayesian rating, normalized active weights, and deterministic reasons
// ============================================================================

import { TitleRecord, Preferences } from '@/types/index';
import {
  getAudienceProfile,
  getAudienceRelevanceMultiplier
} from './certifications';

export interface MoodDefinition {
  label: string;
  genreNames: string[];
  genreIds: number[];
  keywords: string[];
}

export const MOOD_DEFINITIONS: Record<string, MoodDefinition> = {
  thrilled: {
    label: 'Thrilled',
    genreNames: ['Thriller', 'Action', 'Crime', 'Mystery', 'Adventure'],
    genreIds: [53, 28, 80, 9648, 12, 10759],
    keywords: ['thriller', 'heist', 'suspense', 'chase', 'danger', 'tense']
  },
  moved: {
    label: 'Moved',
    genreNames: ['Drama', 'Romance', 'Family', 'History'],
    genreIds: [18, 10749, 10751, 36],
    keywords: ['emotional', 'heart', 'love', 'loss', 'grief', 'journey', 'poignant']
  },
  unsettled: {
    label: 'Unsettled',
    genreNames: ['Horror', 'Thriller', 'Mystery'],
    genreIds: [27, 53, 9648],
    keywords: ['haunting', 'dread', 'dark', 'fear', 'nightmare', 'creepy', 'chilling']
  },
  inspired: {
    label: 'Inspired',
    genreNames: ['Drama', 'Documentary', 'History', 'Music'],
    genreIds: [18, 99, 36, 10402],
    keywords: ['true story', 'triumph', 'overcome', 'courage', 'hero', 'hope']
  },
  laugh: {
    label: 'Make me laugh',
    genreNames: ['Comedy', 'Romance', 'Family', 'Animation'],
    genreIds: [35, 10749, 10751, 16],
    keywords: ['funny', 'hilarious', 'humor', 'satire', 'comedy', 'witty']
  },
  think: {
    label: 'Make me think',
    genreNames: ['Drama', 'Science Fiction', 'Mystery', 'Crime', 'Documentary'],
    genreIds: [18, 878, 9648, 80, 99, 10765],
    keywords: ['philosophy', 'mind', 'puzzle', 'truth', 'investigation', 'moral', 'secret']
  },
  dark: {
    label: 'Something dark',
    genreNames: ['Horror', 'Thriller', 'Crime', 'Drama'],
    genreIds: [27, 53, 80, 18],
    keywords: ['gritty', 'noir', 'murder', 'sinister', 'bleak', 'corruption', 'twisted']
  },
  relaxed: {
    label: 'Keep it gentle',
    genreNames: ['Comedy', 'Family', 'Romance', 'Animation', 'Documentary'],
    genreIds: [35, 10751, 10749, 16, 99],
    keywords: ['gentle', 'warm', 'peaceful', 'sweet', 'cozy', 'comfort', 'lighthearted']
  }
};

export interface ActiveWeights {
  genre: number;
  rating: number;
  mood: number;
  runtime: number;
}

export function computeActiveWeights(preferences: Preferences): {
  raw: ActiveWeights;
  normalized: ActiveWeights;
} {
  const raw: ActiveWeights = {
    genre: preferences.genreIds && preferences.genreIds.length > 0 ? 25 : 0,
    rating: 25,
    mood: preferences.mood && preferences.mood !== 'all' && MOOD_DEFINITIONS[preferences.mood] ? 15 : 0,
    runtime: preferences.runtime && preferences.runtime !== 'all' ? 10 : 0
  };

  const total = raw.genre + raw.rating + raw.mood + raw.runtime;
  const factor = total > 0 ? 100 / total : 1;

  const normalized: ActiveWeights = {
    genre: (raw.genre * factor),
    rating: (raw.rating * factor),
    mood: (raw.mood * factor),
    runtime: (raw.runtime * factor)
  };

  return { raw, normalized };
}

export function calculateBayesianRating(
  rating: number,
  voteCount: number,
  poolMean: number,
  thresholdM = 350
): number {
  if (voteCount + thresholdM <= 0) return rating;
  const weightV = voteCount / (voteCount + thresholdM);
  const weightM = thresholdM / (voteCount + thresholdM);
  return (weightV * rating) + (weightM * poolMean);
}

export function computeScore(
  candidate: TitleRecord,
  preferences: Preferences,
  poolMean = 7.0,
  thresholdM = 350
): TitleRecord {
  const { normalized } = computeActiveWeights(preferences);
  const bayesianRating = calculateBayesianRating(
    candidate.rating,
    candidate.voteCount,
    poolMean,
    thresholdM
  );
  const reasons: string[] = [];

  // 1. Genre Score (0 - 100)
  let genreScore = 0;
  if (preferences.genreIds && preferences.genreIds.length > 0) {
    const matchedGenreIds = candidate.genreIds.filter((id) => preferences.genreIds.includes(id));
    if (matchedGenreIds.length > 0) {
      const matchRatio = matchedGenreIds.length / preferences.genreIds.length;
      genreScore = Math.min(100, Math.round(60 + 40 * matchRatio));

      const matchedNames = candidate.genres.filter((_g, i) =>
        matchedGenreIds.includes(candidate.genreIds[i])
      );
      const label = matchedNames.length > 0 ? matchedNames.join(' & ') : 'genre';
      reasons.push(`matches your ${label.toLowerCase()} preference`);
    }
  }

  // 2. Rating Quality Score (0 - 100)
  const ratingScore = Math.min(100, Math.max(0, (bayesianRating / 10) * 100));
  if (bayesianRating >= 7.5 && candidate.voteCount >= 100) {
    const kVotes = candidate.voteCount >= 1000
      ? `${Math.round(candidate.voteCount / 1000)}k+`
      : `${candidate.voteCount}`;
    reasons.push(`strong ${candidate.rating.toFixed(1)}/10 audience rating (${kVotes} votes)`);
  }

  // 3. Mood Score (0 - 100)
  let moodScore = 0;
  if (preferences.mood && preferences.mood !== 'all' && MOOD_DEFINITIONS[preferences.mood]) {
    const moodDef = MOOD_DEFINITIONS[preferences.mood];
    const hasGenreOverlap = candidate.genreIds.some((id) => moodDef.genreIds.includes(id)) ||
      candidate.genres.some((g) => moodDef.genreNames.includes(g));

    const overviewLower = (candidate.overview || '').toLowerCase();
    const hasKeywordMatch = moodDef.keywords.some((kw) => overviewLower.includes(kw));

    if (hasGenreOverlap) {
      moodScore = 100;
      reasons.push(`fits the ${moodDef.label.toLowerCase()} mood you chose`);
    } else if (hasKeywordMatch) {
      moodScore = 75;
      reasons.push(`complements the ${moodDef.label.toLowerCase()} mood`);
    } else {
      moodScore = 20;
    }
  }

  // 4. Runtime Score (0 - 100)
  let runtimeScore = 0;
  if (preferences.runtime && preferences.runtime !== 'all' && candidate.runtime !== null) {
    runtimeScore = 100;
    if (candidate.contentClass === 'series' && candidate.episodeRuntimeFormatted) {
      reasons.push(`fits your time (${candidate.episodeRuntimeFormatted})`);
    } else if (candidate.runtime) {
      const hours = Math.floor(candidate.runtime / 60);
      const mins = candidate.runtime % 60;
      const formatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      reasons.push(`fits your time (${formatted})`);
    }
  }

  // 5. Audience Relevance (Soft Multiplier & Neutral Reason)
  let relevanceMultiplier = 1.0;
  if (preferences.ageGroup && preferences.ageGroup !== 'all') {
    const profile = candidate.audienceProfile || getAudienceProfile(candidate, candidate.certification);
    relevanceMultiplier = getAudienceRelevanceMultiplier(profile, preferences.ageGroup);

    if (relevanceMultiplier > 1.0) {
      reasons.push('Fits your selected audience profile.');
    }
  }

  // Composite Score
  const rawComposite =
    (genreScore * normalized.genre / 100) +
    (ratingScore * normalized.rating / 100) +
    (moodScore * normalized.mood / 100) +
    (runtimeScore * normalized.runtime / 100);

  const compositeScore = rawComposite * relevanceMultiplier;

  if (reasons.length === 0) {
    reasons.push('curated for your current preferences');
  }

  return {
    ...candidate,
    ratingScore: Math.round(bayesianRating * 100) / 100,
    score: Math.round(compositeScore * 10) / 10,
    reasons: reasons.slice(0, 3)
  };
}
