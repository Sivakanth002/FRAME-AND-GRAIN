import { describe, it, expect, beforeEach } from 'vitest';
import { LuckyEngine } from '../../src/server/recommendation/lucky.js';
import { HistoryManager } from '../../src/server/recommendation/history.js';
import { TitleRecord } from '../../src/types/index.js';

describe("Lucky & I Don't Know Discovery Engine", () => {
  let historyManager: HistoryManager;
  let luckyEngine: LuckyEngine;

  // Three candidate films covering different formats/languages/genres
  const filmEn: TitleRecord = {
    source: 'tmdb', sourceId: '1', mediaType: 'movie', contentClass: 'movie',
    title: 'Film One', originalTitle: 'Film One',
    poster: null, backdrop: null, releaseDate: '2022-01-01', year: 2022,
    originalLanguage: 'en', genres: ['Thriller'], genreIds: [53],
    runtime: 100, rating: 8.5, voteCount: 1000, ratingScore: 8.2, score: 90,
    providers: [], overview: ''
  };

  const filmJa: TitleRecord = {
    source: 'tmdb', sourceId: '2', mediaType: 'movie', contentClass: 'movie',
    title: 'Film Two', originalTitle: 'Film Two',
    poster: null, backdrop: null, releaseDate: '2021-01-01', year: 2021,
    originalLanguage: 'ja', genres: ['Animation'], genreIds: [16],
    runtime: 95, rating: 7.8, voteCount: 400, ratingScore: 7.4, score: 60,
    providers: [], overview: ''
  };

  const filmFr: TitleRecord = {
    source: 'tmdb', sourceId: '3', mediaType: 'movie', contentClass: 'movie',
    title: 'Film Three', originalTitle: 'Film Three',
    poster: null, backdrop: null, releaseDate: '2020-01-01', year: 2020,
    originalLanguage: 'fr', genres: ['Comedy'], genreIds: [35],
    runtime: 110, rating: 8.0, voteCount: 600, ratingScore: 7.7, score: 75,
    providers: [], overview: ''
  };

  const candidatePool = [filmEn, filmJa, filmFr];

  beforeEach(() => {
    historyManager = new HistoryManager();
    luckyEngine = new LuckyEngine(historyManager);
  });

  // ── TEST 1: TUNE preferences are soft signals, not hard filters ────────────

  it('1. TUNE preferences do NOT hard-filter the candidate pool', () => {
    // TUNE preference: English Thriller only
    // Pool contains Japanese Animation (filmJa) and French Comedy (filmFr)
    // — Lucky must be able to pick them even though they're outside TUNE preferences.
    let pickedOutsidePreferences = false;
    for (let seed = 0; seed < 50; seed++) {
      const engine = new LuckyEngine(new HistoryManager());
      const { pick } = engine.selectLuckyPick(candidatePool, {
        sessionId: `test-1-${seed}`,
        tunePreferences: { format: 'movie', language: 'en', genreIds: [53] },
        seed
      });
      // filmJa and filmFr are outside TUNE language + genre preferences
      if (pick?.sourceId === '2' || pick?.sourceId === '3') {
        pickedOutsidePreferences = true;
        break;
      }
    }
    expect(pickedOutsidePreferences).toBe(true);
  });

  // ── TEST 2: A film outside TUNE preferences can be selected ───────────────

  it('2. Lucky can select a film outside every TUNE preference dimension', () => {
    // Strong exploitation ratio so preferences dominate — yet filmJa/filmFr must still appear
    let outsideCount = 0;
    for (let seed = 0; seed < 200; seed++) {
      const engine = new LuckyEngine(new HistoryManager());
      const { pick } = engine.selectLuckyPick(candidatePool, {
        sessionId: `test-2-${seed}`,
        tunePreferences: {
          format: 'movie',
          language: 'en',
          genreIds: [53],
          mood: 'thrilled'
        },
        explorationRatio: 0.65, // default
        seed
      });
      if (pick?.sourceId === '2' || pick?.sourceId === '3') outsideCount++;
    }
    // With 65% exploration, outside-prefs picks should be substantial
    expect(outsideCount).toBeGreaterThan(20);
  });

  // ── TEST 3: Actual TUNE-shown IDs are HARD EXCLUDED from Lucky ────────────

  it('3. An actual film presented by TUNE cannot be selected by Lucky', () => {
    // TUNE already showed filmEn ('1') and filmJa ('2') as recommendations
    // Lucky must NEVER pick either of these regardless of preferences or seed
    const tuneShownIds = ['tmdb:movie:1', 'tmdb:movie:2'];

    for (let seed = 0; seed < 100; seed++) {
      const engine = new LuckyEngine(new HistoryManager());
      const { pick } = engine.selectLuckyPick(candidatePool, {
        sessionId: `test-3-${seed}`,
        tuneShownIds,
        seed
      });
      // Must never be a TUNE-shown film
      expect(pick?.sourceId).not.toBe('1');
      expect(pick?.sourceId).not.toBe('2');
      // The only remaining option is filmFr
      expect(pick?.sourceId).toBe('3');
    }
  });

  it('3b. tuneShownIds exclusion works with sourceId format too', () => {
    // Engine adds both key (tmdb:movie:X) and sourceId to exclusion set
    for (let seed = 0; seed < 20; seed++) {
      const engine = new LuckyEngine(new HistoryManager());
      const { pick } = engine.selectLuckyPick(candidatePool, {
        sessionId: `test-3b-${seed}`,
        tuneShownIds: ['1', '2'], // raw sourceIds
        seed
      });
      expect(pick?.sourceId).toBe('3');
    }
  });

  // ── TEST 4: Lucky history cannot repeat ───────────────────────────────────

  it('4. Lucky history picks are hard-excluded — no immediate repetition', () => {
    const sessionId = 'test-4';

    // First Lucky pick — gets recorded in history manager
    const first = luckyEngine.selectLuckyPick(candidatePool, { sessionId, seed: 10 });
    const firstId = first.pick?.sourceId;
    expect(firstId).toBeDefined();

    // Second Lucky call — must produce a different film
    const second = luckyEngine.selectLuckyPick(candidatePool, { sessionId, seed: 10 });
    expect(second.pick?.sourceId).not.toBe(firstId);
    expect(second.sessionHistory.length).toBe(2);
  });

  it('4b. luckyHistoryIds param also hard-excludes on fresh engine instance', () => {
    // Simulates client passing its Lucky history list
    for (let seed = 0; seed < 20; seed++) {
      const engine = new LuckyEngine(new HistoryManager());
      const { pick } = engine.selectLuckyPick(candidatePool, {
        sessionId: `test-4b-${seed}`,
        luckyHistoryIds: ['tmdb:movie:1', 'tmdb:movie:2'],
        seed
      });
      expect(pick?.sourceId).toBe('3');
    }
  });

  // ── TEST 5: Lucky returns exactly one film ─────────────────────────────────

  it('5. Lucky returns exactly one film per call', () => {
    const { pick, sessionHistory } = luckyEngine.selectLuckyPick(candidatePool, {
      sessionId: 'test-5'
    });

    expect(pick).not.toBeNull();
    expect(pick?.sourceId).toBeDefined();
    // Result is a single film (not an array, not null when pool is non-empty)
    expect(typeof pick?.title).toBe('string');
    expect(sessionHistory.length).toBe(1);
  });

  // ── Additional engine correctness tests ───────────────────────────────────

  it('6. Behavioural signals (watched/skipped) update genre affinities', () => {
    const sessionId = 'test-6';
    historyManager.updateProfile(sessionId, filmJa, 'watched');   // Animation +
    historyManager.updateProfile(sessionId, filmEn, 'skipped');   // Thriller -

    const profile = historyManager.getProfile(sessionId);
    expect(profile.genreAffinities[16]).toBeGreaterThan(0);  // Animation
    expect(profile.genreAffinities[53]).toBeLessThan(0);     // Thriller
  });

  it('7. Recency multiplier penalises recently seen titles more than old ones', () => {
    const sessionId = 'test-7';
    const profile = historyManager.getProfile(sessionId);

    profile.recentExposures.set('tmdb:movie:1', Date.now() - 60 * 1000);         // 1 min ago
    const recentMultiplier = historyManager.calculateRecencyMultiplier('tmdb:movie:1', sessionId);

    profile.recentExposures.set('tmdb:movie:2', Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const olderMultiplier = historyManager.calculateRecencyMultiplier('tmdb:movie:2', sessionId);

    expect(recentMultiplier).toBeLessThan(olderMultiplier);
    expect(olderMultiplier).toBeCloseTo(0.95, 1);
  });

  it('8. TUNE preference affinity boosts matching films under high exploitation', () => {
    // Comedy film (filmFr) gets boosted because tunePreferences matches genre 35
    // Under near-full exploitation, it should be selected consistently
    const results: string[] = [];
    for (let seed = 0; seed < 30; seed++) {
      const engine = new LuckyEngine(new HistoryManager());
      const { pick } = engine.selectLuckyPick(candidatePool, {
        sessionId: `test-8-${seed}`,
        tunePreferences: { genreIds: [35] },
        explorationRatio: 0.05, // near-full exploitation
        seed
      });
      if (pick) results.push(pick.sourceId);
    }
    // filmFr (Comedy, genre 35) should dominate under high exploitation
    const filmFrCount = results.filter(id => id === '3').length;
    expect(filmFrCount).toBeGreaterThan(results.length * 0.5);
  });
});
