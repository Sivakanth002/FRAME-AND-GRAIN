// ============================================================================
// FRAME & GRAIN — CORE RECOMMENDATION ENGINE ORCHESTRATOR
// Coordinates TMDB candidate discovery, bounded expansion, hard filtering,
// Bayesian scoring & ranking, and stochastic Lucky discovery
// ============================================================================

import {
  Preferences,
  TitleRecord,
  RecommendationRequest,
  RecommendationResult
} from '@/types/index';
import { TMDBClient } from '@/server/tmdb/client';
import { TMDBDiscoveryService } from '@/server/tmdb/discovery';
import { TMDBProvidersService } from '@/server/tmdb/providers';
import { TMDBCertificationService } from '@/server/tmdb/certifications';
import {
  normalizeMovie,
  normalizeTV,
  attachWatchProviders,
  getTitleKey
} from './normalizer';
import {
  sanitizePreferences,
  isCandidateEligible,
  matchesReleasePeriod,
  matchesRuntime
} from './filters';
import { computeScore } from './scoring';
import {
  normalizeCertification,
  getAudienceProfile
} from './certifications';
import { LuckyEngine } from './lucky';
import { HistoryManager } from './history';

export class RecommendationEngine {
  private discoveryService: TMDBDiscoveryService;
  private providersService: TMDBProvidersService;
  private certificationsService: TMDBCertificationService;
  private luckyEngine: LuckyEngine;
  private historyManager: HistoryManager;

  constructor(private tmdbClient: TMDBClient) {
    this.discoveryService = new TMDBDiscoveryService(tmdbClient);
    this.providersService = new TMDBProvidersService(tmdbClient);
    this.certificationsService = new TMDBCertificationService(tmdbClient);
    this.historyManager = HistoryManager.getInstance();
    this.luckyEngine = new LuckyEngine(this.historyManager);
  }

  public async getRecommendations(request: RecommendationRequest = {}): Promise<RecommendationResult> {
    const prefs = sanitizePreferences(request.preferences || {});
    const mode = request.mode || 'tune';
    const sessionId = request.sessionId || 'default-session';

    // 1. Initial Retrieval: Fetch ~60 unique candidates (Pages 1..3)
    const initialCandidates = await this.fetchCandidatePool(prefs, 1, 3);

    // 2. Filter Eligible Candidates from Initial Pool
    let eligible = await this.filterAndEnrichCandidates(initialCandidates, prefs);
    let expanded = false;
    let candidatePoolSize = initialCandidates.length;

    // 3. Thin-Pool Bounded Expansion:
    // If eligible candidates < 10, perform ONE bounded expansion up to ~120 unique candidates total (Pages 4..6)
    if (eligible.length < 10) {
      const expansionCandidates = await this.fetchCandidatePool(prefs, 4, 6);

      const existingKeys = new Set(initialCandidates.map(getTitleKey));
      const newUniqueCandidates = expansionCandidates.filter((c) => !existingKeys.has(getTitleKey(c)));

      if (newUniqueCandidates.length > 0) {
        expanded = true;
        candidatePoolSize += newUniqueCandidates.length;
        const additionalEligible = await this.filterAndEnrichCandidates(newUniqueCandidates, prefs);
        eligible = [...eligible, ...additionalEligible];
      }
    }

    // 4. Calculate Pool Mean Rating
    const poolMean = eligible.length > 0
      ? eligible.reduce((sum, item) => sum + item.rating, 0) / eligible.length
      : 7.0;

    // 5. Mode-Specific Routing
    let rankedItems: TitleRecord[] = [];
    let luckyPick: TitleRecord | null = null;

    if (mode === 'lucky') {
      const luckyResult = this.luckyEngine.selectLuckyPick(eligible, {
        sessionId,
        region: prefs.region,
        ageGroup: request.tunePreferences?.ageGroup ?? request.preferences?.ageGroup,
        tunePreferences: request.tunePreferences ?? request.preferences,
        tuneShownIds: request.tuneShownIds ?? request.tuneHistory,
        luckyHistoryIds: request.luckyHistory,
        sessionExclusionIds: request.sessionExclusions
      });
      luckyPick = luckyResult.pick;
      if (luckyPick) {
        const scoredPick = computeScore(luckyPick, prefs, poolMean);
        luckyPick = scoredPick;
        rankedItems = [scoredPick];
      }
    } else {
      rankedItems = eligible
        .map((item) => computeScore(item, prefs, poolMean))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.ratingScore - a.ratingScore);
    }

    return {
      items: rankedItems,
      thinPool: eligible.length < 10,
      eligibleCount: eligible.length,
      candidateCount: candidatePoolSize,
      expanded,
      meanRating: Math.round(poolMean * 10) / 10,
      luckyPick,
      luckyHistory: this.historyManager.getSessionPicks(sessionId)
    };
  }

  public getLuckyPick(
    items: TitleRecord[],
    options: {
      sessionId?: string;
      region?: string;
      ageGroup?: string;
      tunePreferences?: Partial<Preferences>;
      tuneHistoryIds?: string[];
      luckyHistoryIds?: string[];
      sessionExclusionIds?: string[];
      seed?: number;
    } = {}
  ): TitleRecord | null {
    const result = this.luckyEngine.selectLuckyPick(items, options);
    return result.pick;
  }

  public async fetchCandidatePool(
    prefs: Preferences,
    startPage: number,
    endPage: number
  ): Promise<TitleRecord[]> {
    const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

    const pageResults = await Promise.all(
      pages.map(async (page) => {
        const pageItems: TitleRecord[] = [];

        if (prefs.format === 'movie') {
          const res = await this.discoveryService.discoverMovies(prefs, page);
          for (const raw of res.results || []) {
            pageItems.push(normalizeMovie(raw));
          }
        } else if (prefs.format === 'series') {
          const res = await this.discoveryService.discoverTV(prefs, page);
          for (const raw of res.results || []) {
            pageItems.push(normalizeTV(raw));
          }
        } else if (prefs.format === 'anime') {
          const animePrefs: Preferences = {
            ...prefs,
            genreIds: [16],
            language: 'ja'
          };
          const [movieRes, tvRes] = await Promise.all([
            this.discoveryService.discoverMovies(animePrefs, page),
            this.discoveryService.discoverTV(animePrefs, page)
          ]);
          for (const raw of movieRes.results || []) {
            const norm = normalizeMovie(raw);
            if (norm.contentClass === 'anime') pageItems.push(norm);
          }
          for (const raw of tvRes.results || []) {
            const norm = normalizeTV(raw);
            if (norm.contentClass === 'anime') pageItems.push(norm);
          }
        } else {
          const [movieRes, tvRes] = await Promise.all([
            this.discoveryService.discoverMovies(prefs, page),
            this.discoveryService.discoverTV(prefs, page)
          ]);
          for (const raw of movieRes.results || []) {
            pageItems.push(normalizeMovie(raw));
          }
          for (const raw of tvRes.results || []) {
            pageItems.push(normalizeTV(raw));
          }
        }

        return pageItems;
      })
    );

    const candidatesMap = new Map<string, TitleRecord>();
    for (const items of pageResults) {
      for (const item of items) {
        candidatesMap.set(getTitleKey(item), item);
      }
    }

    return Array.from(candidatesMap.values());
  }

  private async filterAndEnrichCandidates(
    candidates: TitleRecord[],
    prefs: Preferences
  ): Promise<TitleRecord[]> {
    // ── STAGE 1: Immediate local hard filtering on raw metadata (0 network requests) ──
    const stage1Survivors: TitleRecord[] = [];

    for (const candidate of candidates) {
      // 1. Format check
      if (prefs.format === 'movie' && candidate.mediaType !== 'movie') continue;
      if (prefs.format === 'series' && (candidate.mediaType !== 'tv' || candidate.contentClass === 'anime')) continue;
      if (prefs.format === 'anime' && candidate.contentClass !== 'anime') continue;

      // 2. Language check
      if (prefs.languages && prefs.languages.length > 0) {
        const candidateLang = candidate.originalLanguage.toLowerCase();
        if (!prefs.languages.some((l) => l.toLowerCase() === candidateLang)) {
          continue;
        }
      } else if (prefs.language && prefs.language !== 'all') {
        if (candidate.originalLanguage.toLowerCase() !== prefs.language.toLowerCase()) {
          continue;
        }
      }

      // 3. Release period check
      if (!matchesReleasePeriod(candidate, prefs)) {
        continue;
      }

      // 4. Runtime check (if known on candidate record)
      if (candidate.runtime !== null && candidate.runtime > 0) {
        if (!matchesRuntime(candidate, prefs)) {
          continue;
        }
      }

      // 5. Genre check (ANY selected genre qualifies)
      if (prefs.genreIds && prefs.genreIds.length > 0) {
        const hasGenreMatch = prefs.genreIds.some((gid) => candidate.genreIds.includes(gid));
        if (!hasGenreMatch) continue;
      }

      stage1Survivors.push(candidate);
    }

    if (stage1Survivors.length === 0) return [];

    // ── STAGE 2: Controlled parallel enrichment for Stage 1 survivors only ──
    const CONCURRENCY_LIMIT = 8;
    const eligible: TitleRecord[] = [];

    const enrichCandidate = async (candidate: TitleRecord): Promise<TitleRecord | null> => {
      let candidateWithProviders = candidate;

      const needsProviders = candidate.providers.length === 0;
      const needsCert = !candidate.certification;

      // Parallelize provider and certification requests for this candidate
      const providerPromise = needsProviders
        ? (candidate.mediaType === 'movie'
            ? this.providersService.getMovieWatchProviders(candidate.sourceId)
            : this.providersService.getTVWatchProviders(candidate.sourceId)
          ).catch(() => null)
        : Promise.resolve(null);

      const certPromise = needsCert
        ? (candidate.mediaType === 'movie'
            ? this.certificationsService.getMovieReleaseDates(candidate.sourceId)
            : this.certificationsService.getTVContentRatings(candidate.sourceId)
          ).catch(() => null)
        : Promise.resolve(null);

      const [providerRes, certRes] = await Promise.all([providerPromise, certPromise]);

      if (providerRes) {
        candidateWithProviders = attachWatchProviders(candidate, providerRes, prefs.region);
      }

      let candidateEnriched = candidateWithProviders;
      if (needsCert) {
        let rawCert: string | null = null;
        if (certRes) {
          if (candidate.mediaType === 'movie') {
            rawCert = this.certificationsService.extractMovieCertification(certRes as any, prefs.region);
          } else {
            rawCert = this.certificationsService.extractTVContentRating(certRes as any, prefs.region);
          }
        }
        const cert = normalizeCertification(rawCert, prefs.region);
        const audienceProfile = getAudienceProfile(candidateEnriched, cert);
        candidateEnriched = {
          ...candidateEnriched,
          certification: cert,
          audienceProfile
        };
      }

      if (isCandidateEligible(candidateEnriched, prefs)) {
        return candidateEnriched;
      }
      return null;
    };

    // Execute survivor batch with concurrency limit
    for (let i = 0; i < stage1Survivors.length; i += CONCURRENCY_LIMIT) {
      const chunk = stage1Survivors.slice(i, i + CONCURRENCY_LIMIT);
      const chunkResults = await Promise.all(chunk.map(enrichCandidate));
      for (const item of chunkResults) {
        if (item) eligible.push(item);
      }
    }

    return eligible;
  }
}
