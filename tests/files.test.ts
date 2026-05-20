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

describe('listFolder recursive + limits', () => {
  it('lists subfolder entries recursively when opts.recursive=true', async () => {
    const root = makeFixture();
    const out = await listFolder(root, { recursive: true });
    const names = out.entries.map(e => e.name);
    // `src/` should be present AND its child `index.ts` should appear with a path-like name
    expect(names.some(n => n === 'src/index.ts')).toBe(true);
  });

  it('stops at maxRecursionDepth', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-deep-'));
    // build a 7-deep chain a/b/c/d/e/f/g with a file at every level
    let cur = root;
    for (const seg of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      cur = join(cur, seg);
      mkdirSync(cur);
      writeFileSync(join(cur, 'leaf.txt'), seg);
    }
    const out = await listFolder(root, { recursive: true });
    const names = out.entries.map(e => e.name);
    // depth 5 max → a/leaf.txt..e/leaf.txt allowed, f/g leaf NOT
    expect(names).toContain('a/b/c/d/e/leaf.txt');
    expect(names).not.toContain('a/b/c/d/e/f/leaf.txt');
  });

  it('truncates at maxEntries and sets truncated=true', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-many-'));
    for (let i = 0; i < 250; i++) writeFileSync(join(root, `f${i}.txt`), '');
    const out = await listFolder(root, { maxEntries: 100 });
    expect(out.entries.length).toBe(100);
    expect(out.truncated).toBe(true);
  });
});

describe('listFolder .gitignore', () => {
  it('respects .gitignore at the root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-gi-'));
    writeFileSync(join(root, '.gitignore'), 'secrets/\n*.bak\n');
    writeFileSync(join(root, 'README.md'), '');
    writeFileSync(join(root, 'note.bak'), '');
    mkdirSync(join(root, 'secrets'));
    writeFileSync(join(root, 'secrets', 'key.txt'), '');
    const out = await listFolder(root, { recursive: true });
    const names = out.entries.map(e => e.name);
    expect(names).toContain('README.md');
    expect(names).not.toContain('note.bak');
    expect(names).not.toContain('secrets');
    expect(names).not.toContain('secrets/key.txt');
  });
});

describe('readFile text', () => {
  it('reads a small text file as kind=text', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-rf-'));
    const p = join(root, 'note.md');
    writeFileSync(p, '# hello\nworld');
    const out = await readFile(p);
    expect(out.kind).toBe('text');
    if (out.kind === 'text') {
      expect(out.text).toContain('hello');
      expect(out.bytesRead).toBe(13);
      expect(out.truncated).toBe(false);
    }
  });

  it('truncates text larger than maxBytesText with a suffix', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-big-'));
    const p = join(root, 'big.txt');
    const big = 'x'.repeat(300 * 1024); // 300KB > 200KB default
    writeFileSync(p, big);
    const out = await readFile(p);
    if (out.kind !== 'text') throw new Error('expected text');
    expect(out.truncated).toBe(true);
    expect(out.bytesRead).toBeLessThan(big.length);
    expect(out.text.endsWith('[truncated, total 307200 bytes]')).toBe(true);
  });

  it('accepts an explicit maxBytes override', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-mb-'));
    const p = join(root, 'short.txt');
    writeFileSync(p, '0123456789');
    const out = await readFile(p, { maxBytes: 4 });
    if (out.kind !== 'text') throw new Error('expected text');
    expect(out.text.startsWith('0123')).toBe(true);
    expect(out.truncated).toBe(true);
  });
});

import { resolve as resolvePath } from 'node:path';

describe('readFile pdf', () => {
  it('parses a PDF and returns kind=text with the extracted text', async () => {
    const fixture = resolvePath(__dirname, 'fixtures/sample.pdf');
    const out = await readFile(fixture);
    expect(out.kind).toBe('text');
    if (out.kind === 'text') {
      expect(out.text).toMatch(/Claude Buddy PDF fixture/i);
    }
  });
});
