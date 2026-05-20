import { describe, it, expect } from 'vitest';
import { IGNORE_PATTERNS, listFolder, readFile } from '../electron/files';

describe('electron/files', () => {
  it('exports IGNORE_PATTERNS as a non-empty list', () => {
    expect(Array.isArray(IGNORE_PATTERNS)).toBe(true);
    expect(IGNORE_PATTERNS.length).toBeGreaterThan(0);
  });

  it('exports listFolder and readFile as async functions', () => {
    expect(typeof listFolder).toBe('function');
    expect(typeof readFile).toBe('function');
  });
});
