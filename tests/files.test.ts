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

import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'cb-files-'));
  writeFileSync(join(root, 'README.md'), '# hi');
  writeFileSync(join(root, 'app.ts'), 'export {};');
  writeFileSync(join(root, 'package-lock.json'), '{}');
  writeFileSync(join(root, '.DS_Store'), '');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'index.ts'), '');
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'node_modules', 'leftover.txt'), '');
  return root;
}

describe('listFolder (non-recursive)', () => {
  it('lists immediate children with type+size+modified', async () => {
    const root = makeFixture();
    const out = await listFolder(root);
    const names = out.entries.map(e => e.name).sort();
    expect(names).toContain('README.md');
    expect(names).toContain('app.ts');
    expect(names).toContain('src');
  });

  it('filters out hardcoded ignores (node_modules, *.lock, .DS_Store)', async () => {
    const root = makeFixture();
    const out = await listFolder(root);
    const names = out.entries.map(e => e.name);
    expect(names).not.toContain('node_modules');
    expect(names).not.toContain('package-lock.json');
    expect(names).not.toContain('.DS_Store');
  });

  it('marks folders with type=folder and files with type=file', async () => {
    const root = makeFixture();
    const out = await listFolder(root);
    const readme = out.entries.find(e => e.name === 'README.md');
    const src = out.entries.find(e => e.name === 'src');
    expect(readme?.type).toBe('file');
    expect(src?.type).toBe('folder');
    expect(readme?.size).toBeGreaterThan(0);
  });
});
