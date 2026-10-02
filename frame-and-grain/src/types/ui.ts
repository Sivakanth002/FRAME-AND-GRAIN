// ============================================================================
// FRAME & GRAIN — APP STATE TYPES
// Shared UI-layer types (not duplicating server engine types)
// ============================================================================

export type AppView = 'start' | 'field' | 'lucky' | 'about';

export type TuneFormat = 'movie' | 'series' | 'anime' | 'all';

export interface TuneSelections {
  format?: TuneFormat;
  language?: string;      // ISO 639-1 code or 'all'
  languages?: string[];   // Multi-select ISO 639-1 codes
  languageNames?: string[]; // Display labels
  runtime?: string;       // 'all' | 'under-90' | '90-120' | '120-150' | '150+'
  period?: string;        // 'all' | 'latest' | '2020s' | '2010s' | '2000s' | 'before-2000'
  genreIds?: number[];
  genreNames?: string[];  // display labels
  ageGroup?: string;      // 'under-13' | '13-17' | '18-24' | '25-34' | '35-44' | '45-54' | '55+' | 'prefer-not-to-say'
  mood?: string;
  providerIds?: number[];
  providerNames?: string[]; // display labels
  providerMode?: 'any' | 'all' | 'none' | 'any-provider';
  accessModes?: ('flatrate' | 'rent' | 'buy')[];
  region?: string;
}

export type TuneStep =
  | 'format'
  | 'language'
  | 'provider'
  | 'runtime'
  | 'period'
  | 'genre'
  | 'ageGroup'
  | 'mood'
  | 'done';

export interface ContentCertification {
  region: string;
  rawRating: string;
  minimumAge: number | null;
  source: 'tmdb';
  confidence: 'verified' | 'unknown';
}

export type AudienceProfile =
  | 'child-focused'
  | 'family-general'
  | 'teen-general'
  | 'general'
  | 'mature'
  | 'unknown';

export interface TitleRecord {
  source: 'tmdb';
  sourceId: string;
  mediaType: 'movie' | 'tv';
  contentClass: 'movie' | 'series' | 'anime';
  title: string;
  originalTitle: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string | null;
  year: number | null;
  originalLanguage: string;
  genres: string[];
  genreIds: number[];
  runtime: number | null;
  episodeRuntimeFormatted?: string | null;
  episodeCount?: number | null;
  seasonCount?: number | null;
  totalRuntime?: number | null;
  rating: number;
  voteCount: number;
  ratingScore: number;
  providers: WatchProvider[];
  overview: string;
  certification?: ContentCertification;
  audienceProfile?: AudienceProfile;
  score?: number;
  reasons?: string[];
}

export interface WatchProvider {
  tmdbProviderId: number;
  name: string;
  logoPath: string | null;
  type: 'flatrate' | 'rent' | 'buy' | 'free' | 'ads';
}

export interface RecommendationResult {
  items: TitleRecord[];
  thinPool: boolean;
  eligibleCount: number;
  candidateCount: number;
  expanded: boolean;
  meanRating: number;
  luckyPick?: TitleRecord | null;
  luckyHistory?: Array<{
    titleKey: string;
    titleRecord: TitleRecord;
    action?: string;
    timestamp: number;
  }>;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBProviderInfo {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
}
