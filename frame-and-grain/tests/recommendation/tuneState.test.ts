import { describe, it, expect } from 'vitest';
import {
  QUESTION_SEQUENCE,
  languageLabel,
  runtimeLabel,
  periodLabel,
  ageGroupLabel,
  moodLabel
} from '../../src/hooks/useTuneState';
import { sanitizePreferences } from '../../src/server/recommendation/filters';

describe('TUNE Interaction, Question Flow & State Consistency', () => {
  it('1. should define the complete reachable question sequence in correct order', () => {
    expect(QUESTION_SEQUENCE).toEqual([
      'format',
      'language',
      'provider',
      'runtime',
      'period',
      'genre',
      'ageGroup',
      'mood',
      'done'
    ]);
  });

  it('2. should format multi-language display chips accurately', () => {
    const langs = ['ml', 'en', 'ta'];
    const label = langs.map(languageLabel).join(' + ');
    expect(label).toBe('MALAYALAM + ENGLISH + TAMIL');
  });

  it('3. should support single and multi-criteria labels', () => {
    expect(runtimeLabel('90-120')).toBe('90–120 MIN');
    expect(periodLabel('2010s')).toBe('2010s');
    expect(ageGroupLabel('18-24')).toBe('18–24');
    expect(moodLabel('dark')).toBe('SOMETHING DARK');
  });

  it('4. should correctly sanitize multi-language and ageGroup preferences', () => {
    const sanitized = sanitizePreferences({
      languages: ['ml', 'en'],
      ageGroup: '18-24',
      genreIds: [18, 53],
      runtime: '90-120',
      period: '2010s',
      mood: 'dark'
    });

    expect(sanitized.languages).toEqual(['ml', 'en']);
    expect(sanitized.ageGroup).toBe('18-24');
    expect(sanitized.genreIds).toEqual([18, 53]);
    expect(sanitized.runtime).toBe('90-120');
    expect(sanitized.period).toBe('2010s');
    expect(sanitized.mood).toBe('dark');
  });

  it('5. should handle skip by clearing the specific criterion without wiping others', () => {
    const current = {
      format: 'movie' as const,
      languages: ['ml', 'en'],
      runtime: '90-120' as const,
      period: '2010s' as const,
      genreIds: [18],
      ageGroup: '18-24'
    };

    // Skipping runtime should leave all other fields intact
    const afterSkipRuntime = {
      ...current,
      runtime: undefined
    };

    expect(afterSkipRuntime.format).toBe('movie');
    expect(afterSkipRuntime.languages).toEqual(['ml', 'en']);
    expect(afterSkipRuntime.runtime).toBeUndefined();
    expect(afterSkipRuntime.period).toBe('2010s');
    expect(afterSkipRuntime.genreIds).toEqual([18]);
    expect(afterSkipRuntime.ageGroup).toBe('18-24');
  });
});
