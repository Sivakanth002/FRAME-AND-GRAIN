// ============================================================================
// FRAME & GRAIN — CANONICAL TYPE DEFINITIONS (Phase 2 Specification)
// ============================================================================

export type MediaType = 'movie' | 'tv';

export type ContentClass = 'movie' | 'series' | 'anime';

export type MonetizationType = 'flatrate' | 'rent' | 'buy' | 'free' | 'ads';

export type ProviderMode = 'any' | 'all' | 'none' | 'any-provider';

export type AccessMode = 'flatrate' | 'rent' | 'buy';

export type ContentFormat = 'all' | 'movie' | 'series' | 'anime';

export type RuntimeOption = 'all' | 'under-90' | '90-120' | '120-150' | '150+';

export type PeriodOption = 'all' | 'latest' | '2020s' | '2010s' | '2000s' | 'before-2000';

export interface DateRange {
  start?: string; // YYYY-MM-DD
  end?: string;   // YYYY-MM-DD
}

export type MoodOption =
  | 'all'
  | 'thrilled'
  | 'moved'
  | 'unsettled'
  | 'inspired'
  | 'laugh'
  | 'think'
  | 'dark'
  | 'relaxed'
  | string;

export interface WatchProvider {
  tmdbProviderId: number;
  name: string;
  logoPath: string | null;
  type: MonetizationType;
}

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
  mediaType: MediaType;
  contentClass: ContentClass;

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

  externalIds?: {
    imdbId?: string | null;
    tvdbId?: number | null;
  };

  certification?: ContentCertification;
  audienceProfile?: AudienceProfile;

  score?: number;
  reasons?: string[];
}

export interface Preferences {
  region: string;

  providerIds: number[];
  providerMode: ProviderMode;

  accessModes: AccessMode[];

  format: ContentFormat;

  language: string | 'all';
  languages?: string[];

  runtime: RuntimeOption;

  period: PeriodOption;

  customDateRange?: DateRange;

  genreIds: number[];

  ageGroup?: string;

  mood: MoodOption;
}

// Telemetry & Behavioural Event Types
export type EventType =
  | 'TUNE_SELECTED'
  | 'TUNE_CHANGED'
  | 'TITLE_SHOWN'
  | 'TITLE_OPENED'
  | 'TITLE_SKIPPED'
  | 'ANOTHER_FILM'
  | 'ILL_WATCH_THIS'
  | 'TITLE_SAVED'
  | 'LUCKY_SELECTED';

export interface TelemetryEvent {
  id: string;
  sessionId: string;
  type: EventType;
  timestamp: number;
  titleKey?: string; // e.g., tmdb:movie:123
  metadata?: Record<string, unknown>;
}

export interface LuckyHistoryEntry {
  titleKey: string; // tmdb:movie:123
  titleRecord: TitleRecord;
  action?: 'shown' | 'skipped' | 'watched' | 'saved';
  timestamp: number;
}

export interface LuckySessionState {
  sessionId: string;
  picks: LuckyHistoryEntry[]; // Ordered sequence for navigation (C -> B -> A)
  currentIndex: number;
}

export interface RecommendationRequest {
  mode?: 'tune' | 'lucky';
  preferences?: Partial<Preferences>;
  /** Soft affinity signals for Lucky mode — does NOT hard-filter the pool */
  tunePreferences?: Partial<Preferences>;
  /** Actual title IDs shown by TUNE recommendations — soft exclusion signal for Lucky */
  tuneShownIds?: string[];
  /** Title IDs shown by Lucky this session — hard exclusion */
  luckyHistory?: string[];
  /** @deprecated use tuneShownIds */
  tuneHistory?: string[];
  sessionExclusions?: string[];
  sessionId?: string;
  region?: string;
}

export interface RecommendationResult {
  items: TitleRecord[];
  thinPool: boolean;
  eligibleCount: number;
  candidateCount: number;
  expanded: boolean;
  meanRating: number;
  luckyPick?: TitleRecord | null;
  luckyHistory?: LuckyHistoryEntry[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Raw TMDB API Response Shapes
export interface TMDBRawMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  original_language: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  runtime?: number;
}

export interface TMDBRawTV {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date?: string;
  original_language: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  episode_run_time?: number[];
  number_of_episodes?: number;
  number_of_seasons?: number;
}

export interface TMDBDiscoverResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TMDBWatchProviderInfo {
  logo_path: string | null;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface TMDBWatchProviderItemResponse {
  link?: string;
  flatrate?: TMDBWatchProviderInfo[];
  rent?: TMDBWatchProviderInfo[];
  buy?: TMDBWatchProviderInfo[];
  free?: TMDBWatchProviderInfo[];
  ads?: TMDBWatchProviderInfo[];
}

export interface TMDBWatchProvidersResponse {
  id: number;
  results: Record<string, TMDBWatchProviderItemResponse>;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBGenreListResponse {
  genres: TMDBGenre[];
}

export interface TMDBVideo {
  id: string;
  key: string;        // YouTube video key
  site: string;       // 'YouTube' | 'Vimeo'
  type: string;       // 'Trailer' | 'Teaser' | 'Clip' | ...
  official: boolean;
  published_at: string;
}
