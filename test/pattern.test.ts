import { describe, expect, it } from 'vitest';
import { matchesAny, patternToRegExp } from '../src/lib/pattern.js';

describe('repository patterns', () => {
  it('matches recursive patterns at the root and below it', () => {
    const pattern = patternToRegExp('**/migrations/**');
    expect(pattern.test('migrations/001.sql')).toBe(true);
    expect(pattern.test('src/db/migrations/001.sql')).toBe(true);
    expect(pattern.test('src/db/query.sql')).toBe(false);
  });

  it('keeps a single star inside one path segment', () => {
    expect(matchesAny('src/a.ts', ['src/*.ts'])).toBe(true);
    expect(matchesAny('src/nested/a.ts', ['src/*.ts'])).toBe(false);
  });

  it('matches root lockfiles with an optional recursive prefix', () => {
    expect(matchesAny('package-lock.json', ['**/*lock*'])).toBe(true);
  });
});
