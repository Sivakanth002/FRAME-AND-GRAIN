// ============================================================================
// FRAME & GRAIN — TMDB API CLIENT
// Resilient, rate-limited, cached server-side client for TMDB v3/v4 API
// ============================================================================

export class TMDBError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'TMDBError';
  }
}

export class TMDBConfigurationError extends TMDBError {
  constructor(
    message = 'TMDB Read Access Token is not configured. Please set TMDB_READ_ACCESS_TOKEN in server environment (.env).'
  ) {
    super(message, 503, 'TMDB_CONFIG_MISSING');
    this.name = 'TMDBConfigurationError';
  }
}

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export interface TMDBClientConfig {
  readAccessToken?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface TMDBClientMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  coalescedRequests: number;
}

// Global shared caches across TMDBClient instances
const sharedProviderCache = new MemoryCache(); // 6 hours
const sharedGenreCache = new MemoryCache();    // 24 hours
const sharedDiscoveryCache = new MemoryCache(); // 15 minutes
const sharedTitleCache = new MemoryCache();     // 12 hours
const sharedInFlightRequests = new Map<string, Promise<unknown>>();

// Global metrics
const metrics: TMDBClientMetrics = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  coalescedRequests: 0
};

export class TMDBClient {
  private readAccessToken?: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(config: TMDBClientConfig = {}) {
    this.readAccessToken = config.readAccessToken || process.env.TMDB_READ_ACCESS_TOKEN;
    this.baseUrl = (config.baseUrl || 'https://api.themoviedb.org/3').replace(/\/+$/, '');
    this.fetchFn = config.fetchFn || globalThis.fetch;
  }

  public static getMetrics(): TMDBClientMetrics {
    return { ...metrics };
  }

  public static resetMetrics(): void {
    metrics.totalRequests = 0;
    metrics.cacheHits = 0;
    metrics.cacheMisses = 0;
    metrics.coalescedRequests = 0;
  }

  public static clearAllCaches(): void {
    sharedProviderCache.clear();
    sharedGenreCache.clear();
    sharedDiscoveryCache.clear();
    sharedTitleCache.clear();
    sharedInFlightRequests.clear();
  }

  public hasCredentials(): boolean {
    return Boolean(this.readAccessToken && this.readAccessToken.trim().length > 0);
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.readAccessToken}`,
      'Content-Type': 'application/json;charset=utf-8'
    };
  }

  public async request<T>(
    endpoint: string,
    queryParams: Record<string, string | number | boolean | undefined> = {},
    options: {
      cacheTtlMs?: number;
      cacheKeyPrefix?: string;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    if (!this.hasCredentials()) {
      throw new TMDBConfigurationError();
    }

    metrics.totalRequests++;

    const cleanParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null && value !== '') {
        cleanParams[key] = String(value);
      }
    }

    const searchParams = new URLSearchParams(cleanParams);
    const sortedQuery = searchParams.toString();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}${sortedQuery ? `?${sortedQuery}` : ''}`;
    const cacheKey = `${options.cacheKeyPrefix || 'tmdb'}:${cleanEndpoint}:${sortedQuery}`;

    // 1. Check shared in-memory caches
    if (options.cacheTtlMs && options.cacheTtlMs > 0) {
      let cached: T | null = null;
      if (options.cacheKeyPrefix === 'providers') {
        cached = sharedProviderCache.get<T>(cacheKey);
      } else if (options.cacheKeyPrefix === 'genres') {
        cached = sharedGenreCache.get<T>(cacheKey);
      } else if (options.cacheKeyPrefix === 'title') {
        cached = sharedTitleCache.get<T>(cacheKey);
      } else {
        cached = sharedDiscoveryCache.get<T>(cacheKey);
      }
      if (cached !== null) {
        metrics.cacheHits++;
        return cached;
      }
    }

    metrics.cacheMisses++;

    // 2. In-flight request coalescing / deduplication
    if (sharedInFlightRequests.has(cacheKey)) {
      metrics.coalescedRequests++;
      return sharedInFlightRequests.get(cacheKey) as Promise<T>;
    }

    // 3. Dispatch new network request wrapped in in-flight registry
    const fetchPromise = (async (): Promise<T> => {
      const maxRetries = options.maxRetries ?? 3;
      let attempt = 0;

      while (attempt <= maxRetries) {
        attempt++;
        try {
          const response = await this.fetchFn(url, {
            method: 'GET',
            headers: this.getAuthHeaders()
          });

          // 429 Rate Limiting with Retry-After header and jittered exponential backoff
          if (response.status === 429) {
            if (attempt > maxRetries) {
              throw new TMDBError(
                'TMDB rate limit exceeded (429) - retries exhausted',
                429,
                'TMDB_RATE_LIMIT'
              );
            }
            const retryHeader = response.headers.get('Retry-After');
            const retrySec = retryHeader ? parseFloat(retryHeader) : 1;
            const waitMs = Math.min(
              6000,
              (Number.isFinite(retrySec) ? retrySec * 1000 : 1000) + Math.random() * 250
            );
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }

          if (response.status === 401) {
            throw new TMDBError(
              'TMDB authentication failed (401). Invalid or missing Read Access Token.',
              401,
              'TMDB_UNAUTHORIZED'
            );
          }

          if (response.status === 403) {
            throw new TMDBError(
              'TMDB access forbidden (403). Ensure token has adequate permissions.',
              403,
              'TMDB_FORBIDDEN'
            );
          }

          if (response.status === 404) {
            throw new TMDBError(
              `TMDB resource not found (404): ${cleanEndpoint}`,
              404,
              'TMDB_NOT_FOUND'
            );
          }

          if (!response.ok) {
            let errorDetails: unknown = null;
            try {
              errorDetails = await response.json();
            } catch {
              // Ignore json parse error
            }
            throw new TMDBError(
              `TMDB API error HTTP ${response.status}: ${response.statusText}`,
              response.status,
              'TMDB_API_ERROR',
              errorDetails
            );
          }

          const data = (await response.json()) as T;

          // Store in shared cache
          if (options.cacheTtlMs && options.cacheTtlMs > 0) {
            if (options.cacheKeyPrefix === 'providers') {
              sharedProviderCache.set(cacheKey, data, options.cacheTtlMs);
            } else if (options.cacheKeyPrefix === 'genres') {
              sharedGenreCache.set(cacheKey, data, options.cacheTtlMs);
            } else if (options.cacheKeyPrefix === 'title') {
              sharedTitleCache.set(cacheKey, data, options.cacheTtlMs);
            } else {
              sharedDiscoveryCache.set(cacheKey, data, options.cacheTtlMs);
            }
          }

          return data;
        } catch (err: unknown) {
          if (err instanceof TMDBError) throw err;
          if (attempt > maxRetries) {
            throw new TMDBError(
              `Network error communicating with TMDB: ${(err as Error).message}`,
              503,
              'TMDB_NETWORK_ERROR'
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 200 * Math.pow(2, attempt) + Math.random() * 100));
        }
      }

      throw new TMDBError('TMDB request failed unexpectedly', 500, 'TMDB_UNKNOWN_FAILURE');
    })();

    sharedInFlightRequests.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      sharedInFlightRequests.delete(cacheKey);
    }
  }
}
