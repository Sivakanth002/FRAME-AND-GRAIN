// ============================================================================
// FRAME & GRAIN — HISTORY & EXCLUSION MANAGER
// Manages session history, Lucky pick stacks, recency-aware avoidance & exclusions
// ============================================================================

import { TitleRecord, LuckyHistoryEntry } from '@/types/index';
import { getTitleKey } from './normalizer';

export interface BehaviouralProfile {
  genreAffinities: Record<number, number>;
  languageAffinities: Record<string, number>;
  watchedTitles: Set<string>;
  skippedTitles: Set<string>;
  recentExposures: Map<string, number>;
}

export class HistoryManager {
  private static instance: HistoryManager;
  private sessionPicks = new Map<string, LuckyHistoryEntry[]>();
  private profiles = new Map<string, BehaviouralProfile>();

  public static getInstance(): HistoryManager {
    if (!HistoryManager.instance) {
      HistoryManager.instance = new HistoryManager();
    }
    return HistoryManager.instance;
  }

  public getSessionPicks(sessionId: string): LuckyHistoryEntry[] {
    return this.sessionPicks.get(sessionId) || [];
  }

  public recordLuckyPick(
    sessionId: string,
    title: TitleRecord,
    action: 'shown' | 'skipped' | 'watched' | 'saved' = 'shown'
  ): void {
    const picks = this.getSessionPicks(sessionId);
    const titleKey = getTitleKey(title);
    const entry: LuckyHistoryEntry = {
      titleKey,
      titleRecord: title,
      action,
      timestamp: Date.now()
    };
    this.sessionPicks.set(sessionId, [...picks, entry]);

    this.updateProfile(sessionId, title, action);
  }

  public getProfile(sessionId: string): BehaviouralProfile {
    let profile = this.profiles.get(sessionId);
    if (!profile) {
      profile = {
        genreAffinities: {},
        languageAffinities: {},
        watchedTitles: new Set(),
        skippedTitles: new Set(),
        recentExposures: new Map()
      };
      this.profiles.set(sessionId, profile);
    }
    return profile;
  }

  public updateProfile(
    sessionId: string,
    title: TitleRecord,
    action: 'shown' | 'skipped' | 'watched' | 'saved'
  ): void {
    const profile = this.getProfile(sessionId);
    const titleKey = getTitleKey(title);

    profile.recentExposures.set(titleKey, Date.now());

    const weightDelta = action === 'watched' || action === 'saved'
      ? 2.0
      : action === 'skipped'
      ? -0.5
      : 0.1;

    for (const genreId of title.genreIds) {
      profile.genreAffinities[genreId] = (profile.genreAffinities[genreId] || 0) + weightDelta;
    }

    if (title.originalLanguage) {
      const lang = title.originalLanguage.toLowerCase();
      profile.languageAffinities[lang] = (profile.languageAffinities[lang] || 0) + weightDelta;
    }

    if (action === 'watched' || action === 'saved') {
      profile.watchedTitles.add(titleKey);
    } else if (action === 'skipped') {
      profile.skippedTitles.add(titleKey);
    }
  }

  public calculateRecencyMultiplier(titleKey: string, sessionId: string): number {
    const profile = this.getProfile(sessionId);
    const lastShown = profile.recentExposures.get(titleKey);
    if (!lastShown) return 1.0;

    const ageMs = Date.now() - lastShown;
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    if (ageMs < 10 * 60 * 1000) {
      return 0.05;
    } else if (ageMs < oneHour) {
      return 0.3;
    } else if (ageMs < oneDay) {
      return 0.7;
    }
    return 0.95;
  }
}
