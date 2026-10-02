// ============================================================================
// FRAME & GRAIN — LUCKY / I DON'T KNOW DISCOVERY ENGINE
// Separate stochastic discovery mechanism with behavioural bias and exploration
//
// HISTORY SEMANTICS:
//   luckyHistoryIds  = title IDs Lucky has shown THIS session → HARD exclusion
//   tuneShownIds     = title IDs TUNE has shown → soft avoidance (weighted penalty)
//   sessionExclusionIds = explicit cross-session exclusions → HARD exclusion
//
// TUNE preferences (format, language, etc.) → soft AFFINITY BIAS only
//   They raise/lower weights; they do NOT filter the candidate pool
// ============================================================================

import { TitleRecord, Preferences, LuckyHistoryEntry } from '@/types/index';
import { getTitleKey } from './normalizer';
import { HistoryManager } from './history';
import {
  getAgeSuitability,
  getAudienceProfile,
  getAudienceRelevanceMultiplier
} from './certifications';

export interface LuckyOptions {
  sessionId?: string;
  region?: string;
  ageGroup?: string;
  tunePreferences?: Partial<Preferences>;
  tuneShownIds?: string[];      // TUNE-shown title IDs — soft avoidance
  /** @deprecated use tuneShownIds */
  tuneHistoryIds?: string[];
  luckyHistoryIds?: string[];   // Lucky-shown title IDs — hard exclusion
  sessionExclusionIds?: string[];
  explorationRatio?: number;
  seed?: number;
}

export class LuckyEngine {
  private historyManager: HistoryManager;

  constructor(historyManager?: HistoryManager) {
    this.historyManager = historyManager || HistoryManager.getInstance();
  }

  public selectLuckyPick(
    eligiblePool: TitleRecord[],
    options: LuckyOptions = {}
  ): { pick: TitleRecord | null; sessionHistory: LuckyHistoryEntry[] } {
    if (!eligiblePool || eligiblePool.length === 0) {
      return { pick: null, sessionHistory: [] };
    }

    const sessionId = options.sessionId || 'anonymous-session';
    const explorationRatio = options.explorationRatio ?? 0.65;
    const region = options.region || 'IN';

    // ── HARD AGE SAFETY FILTER ──────────────────────────────────────────────
    // If age is known from TUNE/session: use it.
    // If no age context exists: apply conservative general-audience safety mode.
    const rawAgeGroup = options.ageGroup || options.tunePreferences?.ageGroup;
    const safetyMode = rawAgeGroup && rawAgeGroup !== 'all' && rawAgeGroup !== 'prefer-not-to-say'
      ? rawAgeGroup
      : 'general-safety';

    const safePool = eligiblePool.filter((item) => {
      const suitability = getAgeSuitability(item, safetyMode, region);
      return suitability === 'safe';
    });

    const activePool = safePool.length > 0 ? safePool : eligiblePool;

    // ── HARD EXCLUSION SET ───────────────────────────────────────────────────
    // Hard-excluded:
    //   1. Lucky session history (titles Lucky already showed this session)
    //   2. TUNE-shown IDs (actual title IDs already presented by TUNE recommendations)
    //   3. Explicit session exclusions
    // NOT hard-excluded: TUNE preferences (format/language/genre/mood)
    const hardExclusionSet = new Set<string>();

    // Lucky session history
    for (const key of options.luckyHistoryIds || []) {
      hardExclusionSet.add(key);
    }
    // Explicit session exclusions
    for (const key of options.sessionExclusionIds || []) {
      hardExclusionSet.add(key);
    }
    // TUNE-shown IDs — titles already presented by TUNE must not appear in Lucky
    for (const key of options.tuneShownIds || []) {
      hardExclusionSet.add(key);
    }
    // Deprecated alias
    for (const key of options.tuneHistoryIds || []) {
      hardExclusionSet.add(key);
    }

    // Add current Lucky session picks (server-side history manager)
    const sessionHistory = this.historyManager.getSessionPicks(sessionId);
    for (const entry of sessionHistory) {
      hardExclusionSet.add(entry.titleKey);
      hardExclusionSet.add(entry.titleRecord.sourceId);
    }

    // ── FILTER: remove all hard exclusions ──────────────────────────────────
    let candidates = activePool.filter((item) => {
      const key = getTitleKey(item);
      return !hardExclusionSet.has(key) && !hardExclusionSet.has(item.sourceId);
    });

    // Fallback: if all candidates are exhausted, ignore Lucky history (keep at least 1 pick)
    if (candidates.length === 0) {
      const lastPickKey = sessionHistory.length > 0 ? sessionHistory[sessionHistory.length - 1].titleKey : null;
      candidates = activePool.filter((item) => getTitleKey(item) !== lastPickKey);
      if (candidates.length === 0) {
        candidates = activePool;
      }
    }

    const selectedPick = this.selectWithAffinityBias(
      candidates,
      options,
      sessionId,
      explorationRatio,
      rawAgeGroup
    );

    this.historyManager.recordLuckyPick(sessionId, selectedPick, 'shown');

    return {
      pick: selectedPick,
      sessionHistory: this.historyManager.getSessionPicks(sessionId)
    };
  }

  private selectWithAffinityBias(
    candidates: TitleRecord[],
    options: LuckyOptions,
    sessionId: string,
    explorationRatio: number,
    ageGroup?: string
  ): TitleRecord {
    const profile = this.historyManager.getProfile(sessionId);
    const tunePrefs = options.tunePreferences;

    const weights: number[] = candidates.map((candidate) => {
      const titleKey = getTitleKey(candidate);

      let affinityScore = 1.0;

      // Soft genre affinity boost from TUNE preferences
      if (tunePrefs?.genreIds && tunePrefs.genreIds.length > 0) {
        const matched = candidate.genreIds.some((id) => tunePrefs.genreIds!.includes(id));
        if (matched) affinityScore += 1.5;
      }

      // Soft language affinity — boosts but does NOT exclude other languages
      if (tunePrefs?.language && tunePrefs.language !== 'all') {
        if (candidate.originalLanguage === tunePrefs.language) {
          affinityScore += 1.2;
        }
        // No penalty for other languages — Lucky can surprise
      }

      // Soft format affinity — boosts matching format
      if (tunePrefs?.format && tunePrefs.format !== 'all') {
        if (candidate.contentClass === tunePrefs.format) {
          affinityScore += 0.8;
        }
        // No penalty for other formats — exploration allowed
      }

      // Mood affinity signal
      if (tunePrefs?.mood && tunePrefs.mood !== 'all') {
        affinityScore += 0.8;
      }

      // Soft audience relevance multiplier (Fixes Paw Patrol problem in Lucky)
      const audienceProfile = candidate.audienceProfile || getAudienceProfile(candidate, candidate.certification);
      const audienceMultiplier = getAudienceRelevanceMultiplier(audienceProfile, ageGroup);
      affinityScore *= audienceMultiplier;

      // Profile genre affinities from long-term session
      for (const gid of candidate.genreIds) {
        const delta = profile.genreAffinities[gid] || 0;
        affinityScore += delta * 0.2;
      }

      const recencyMultiplier = this.historyManager.calculateRecencyMultiplier(titleKey, sessionId);

      // 65% pure exploration + 35% affinity bias
      const blendedWeight = (explorationRatio * 1.0) + ((1 - explorationRatio) * Math.max(0.2, affinityScore));
      return Math.max(0.05, blendedWeight * recencyMultiplier * audienceMultiplier);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let cursor = this.getPseudoRandom(options.seed) * totalWeight;

    for (let i = 0; i < candidates.length; i++) {
      cursor -= weights[i];
      if (cursor <= 0) {
        return candidates[i];
      }
    }

    return candidates[0];
  }

  private getPseudoRandom(seed?: number): number {
    if (typeof seed === 'number') {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    }
    return Math.random();
  }
}
