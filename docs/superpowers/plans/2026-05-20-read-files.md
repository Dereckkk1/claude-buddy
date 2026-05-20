# Read Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `list_folder` and `read_file` tools so the agent can navigate and read user-attached files and folders, with drag-and-drop UX on the mascot bubble.

**Architecture:** Tool-based — agent decides what to read. The renderer keeps a list of `attachedPaths` (persisted between messages until removed); main process enforces a scope guard so the agent can only touch paths the user attached. Image files come back as `tool_result` image blocks (Claude Vision). Hardcoded IGNORE_PATTERNS + `.gitignore` parsing keep agent token usage sane.

**Tech Stack:** TypeScript, Electron 33, React 18, Vite, Anthropic SDK ^0.30.0 (streaming + tool use), vitest, `ignore` (new dep), `pdf-parse` + `mammoth` (already installed).

**Spec:** `docs/superpowers/specs/2026-05-20-read-files-design.md`

---

## Task 1: Add `ignore` dependency and scaffold `electron/files.ts`

**Files:**
- Modify: `package.json` (add `ignore` dep)
- Create: `electron/files.ts`
- Create: `tests/files.test.ts`

- [ ] **Step 1: Install dep**

```bash
npm install ignore
```

Confirm `package.json` now has `"ignore": "^7.x.x"` (or similar) under `dependencies`.

- [ ] **Step 2: Write the failing scaffolding test**

Create `tests/files.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
npx vitest run tests/files.test.ts
```

Expected: FAIL — `Cannot find module '../electron/files'`.

- [ ] **Step 4: Scaffold `electron/files.ts`**

```typescript
// Pure filesystem helpers used by the renderer through IPC. No Electron
// imports — keeps it testable in node directly.
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface FolderEntry {
  name: string;
  type: 'file' | 'folder';
  size: number;       // bytes; 0 for folder
  modified: number;   // ms epoch
}

export interface FolderListing {
  path: string;
  entries: FolderEntry[];
  truncated: boolean;
}

export interface FileContentText {
  path: string;
  kind: 'text';
  text: string;
  bytesRead: number;
  truncated: boolean;
}

export interface FileContentImage {
  path: string;
  kind: 'image';
  base64: string;
  mimeType: string;
  bytesRead: number;
  truncated: boolean;
}

export type FileContent = FileContentText | FileContentImage;

export const IGNORE_PATTERNS: string[] = [
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
  '.next/',
  'target/',
  '__pycache__/',
  '.venv/',
  'venv/',
  '*.lock',
  '*.log',
  '.DS_Store',
  '.env',
  '.env.*',
];

export const LIMITS = {
  maxBytesText:  200 * 1024,         //  200 KB
  maxBytesPdf:    5 * 1024 * 1024,   //    5 MB
  maxBytesDocx:   2 * 1024 * 1024,   //    2 MB
  maxBytesImage:  1 * 1024 * 1024,   //    1 MB
  maxEntries:    200,
  maxRecursionDepth: 5,
} as const;

export async function listFolder(
  _rootPath: string,
  _opts: { recursive?: boolean; maxEntries?: number } = {},
): Promise<FolderListing> {
  void fs; void path;
  throw new Error('not implemented');
}

export async function readFile(
  _filePath: string,
  _opts: { maxBytes?: number } = {},
): Promise<FileContent> {
  throw new Error('not implemented');
}
```

- [ ] **Step 5: Run test, expect PASS, then commit**

```bash
npx vitest run tests/files.test.ts
```

Expected: PASS (2/2).

```bash
git add package.json package-lock.json electron/files.ts tests/files.test.ts
git commit -m "scaffold: electron/files.ts module + ignore dep"
```

---

## Task 2: `listFolder` basic listing + hardcoded ignores (non-recursive)

**Files:**
- Modify: `electron/files.ts` — implement `listFolder` non-recursive
- Modify: `tests/files.test.ts` — add cases

- [ ] **Step 1: Write the failing tests**

Append to `tests/files.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run tests/files.test.ts
```

Expected: 3 new tests fail with `not implemented`.

- [ ] **Step 3: Implement listFolder**

Replace the stub in `electron/files.ts`:

```typescript
import ignore, { Ignore } from 'ignore';

function buildIgnoreMatcher(extra?: string[]): Ignore {
  const ig = ignore();
  ig.add(IGNORE_PATTERNS);
  if (extra && extra.length) ig.add(extra);
  return ig;
}

function matches(ig: Ignore, name: string, isFolder: boolean): boolean {
  // ignore() works on POSIX-style relative paths; folders need trailing /.
  const probe = isFolder ? `${name}/` : name;
  return ig.ignores(probe);
}

export async function listFolder(
  rootPath: string,
  opts: { recursive?: boolean; maxEntries?: number } = {},
): Promise<FolderListing> {
  const maxEntries = opts.maxEntries ?? LIMITS.maxEntries;
  const ig = buildIgnoreMatcher();
  const entries: FolderEntry[] = [];

  const dirents = await fs.readdir(rootPath, { withFileTypes: true });
  for (const d of dirents) {
    if (entries.length >= maxEntries) {
      return { path: rootPath, entries, truncated: true };
    }
    if (matches(ig, d.name, d.isDirectory())) continue;
    const full = path.join(rootPath, d.name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    entries.push({
      name: d.name,
      type: d.isDirectory() ? 'folder' : 'file',
      size: d.isDirectory() ? 0 : stat.size,
      modified: stat.mtimeMs,
    });
  }
  return { path: rootPath, entries, truncated: false };
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npx vitest run tests/files.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/files.ts tests/files.test.ts
git commit -m "feat(files): listFolder basic + hardcoded ignores"
```

---

## Task 3: `listFolder` recursive + maxEntries truncation

**Files:**
- Modify: `electron/files.ts`
- Modify: `tests/files.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/files.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run tests/files.test.ts
```

Expected: 3 new tests fail.

- [ ] **Step 3: Implement recursive listing**

Replace the `listFolder` body in `electron/files.ts`:

```typescript
export async function listFolder(
  rootPath: string,
  opts: { recursive?: boolean; maxEntries?: number } = {},
): Promise<FolderListing> {
  const maxEntries = opts.maxEntries ?? LIMITS.maxEntries;
  const ig = buildIgnoreMatcher();
  const entries: FolderEntry[] = [];

  async function walk(currentPath: string, relPrefix: string, depth: number): Promise<boolean> {
    // returns false when we hit truncation, true otherwise
    if (depth > LIMITS.maxRecursionDepth) return true;
    const dirents = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const d of dirents) {
      if (entries.length >= maxEntries) return false;
      const rel = relPrefix ? `${relPrefix}/${d.name}` : d.name;
      // Apply ignores against the full relative path so that nested matches work
      if (matches(ig, rel, d.isDirectory())) continue;
      const full = path.join(currentPath, d.name);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      entries.push({
        name: rel,
        type: d.isDirectory() ? 'folder' : 'file',
        size: d.isDirectory() ? 0 : stat.size,
        modified: stat.mtimeMs,
      });
      if (opts.recursive && d.isDirectory()) {
        const keepGoing = await walk(full, rel, depth + 1);
        if (!keepGoing) return false;
      }
    }
    return true;
  }

  const keepGoing = await walk(rootPath, '', 0);
  return { path: rootPath, entries, truncated: !keepGoing };
}
```

Note: also update the existing non-recursive tests if needed — `name` is now relative path. For non-recursive calls, `relPrefix === ''` so names stay as basenames. Check Task 2 tests still pass.

- [ ] **Step 4: Run all tests, expect PASS**

```bash
npx vitest run tests/files.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/files.ts tests/files.test.ts
git commit -m "feat(files): listFolder recursive + maxEntries truncation"
```

---

## Task 4: `listFolder` honors `.gitignore` at root

**Files:**
- Modify: `electron/files.ts`
- Modify: `tests/files.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/files.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run tests/files.test.ts
```

Expected: new test fails (note.bak and secrets/ still listed).

- [ ] **Step 3: Add .gitignore parsing**

In `electron/files.ts`, add a helper and use it in `listFolder`:

```typescript
async function readGitignoreLines(rootPath: string): Promise<string[]> {
  try {
    const text = await fs.readFile(path.join(rootPath, '.gitignore'), 'utf8');
    return text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}
```

Modify the start of `listFolder`:

```typescript
export async function listFolder(
  rootPath: string,
  opts: { recursive?: boolean; maxEntries?: number } = {},
): Promise<FolderListing> {
  const maxEntries = opts.maxEntries ?? LIMITS.maxEntries;
  const giLines = await readGitignoreLines(rootPath);
  const ig = buildIgnoreMatcher(giLines);
  // ...rest unchanged...
```

- [ ] **Step 4: Run, expect PASS**

```bash
npx vitest run tests/files.test.ts
```

Expected: all pass including new .gitignore test.

- [ ] **Step 5: Commit**

```bash
git add electron/files.ts tests/files.test.ts
git commit -m "feat(files): listFolder honors root .gitignore"
```

---

## Task 5: `readFile` for text/code + truncation

**Files:**
- Modify: `electron/files.ts`
- Modify: `tests/files.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/files.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run tests/files.test.ts
```

Expected: 3 tests fail with `not implemented`.

- [ ] **Step 3: Implement text reading + routing skeleton**

Replace the `readFile` stub in `electron/files.ts`:

```typescript
const TEXT_EXTS = new Set([
  'txt','md','json','yaml','yml','toml','xml','csv','log','html','css','scss','sass',
  'js','jsx','ts','tsx','mjs','cjs',
  'py','rb','rs','go','java','kt','swift','c','cc','cpp','h','hpp','cs','php','sh','bash','zsh','ps1',
  'sql','env','ini','conf','dockerfile','gitignore','editorconfig',
]);
const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','webp','bmp']);
const PDF_EXT = 'pdf';
const DOCX_EXT = 'docx';

type Kind = 'text' | 'pdf' | 'docx' | 'image' | 'unsupported';

function routeReader(filePath: string): Kind {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  // Files like "Dockerfile" with no extension still readable as text if the basename hints
  const base = path.basename(filePath).toLowerCase();
  if (!ext && (base === 'dockerfile' || base === 'makefile' || base === 'readme')) return 'text';
  if (TEXT_EXTS.has(ext)) return 'text';
  if (ext === PDF_EXT) return 'pdf';
  if (ext === DOCX_EXT) return 'docx';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return 'unsupported';
}

function truncatedSuffix(totalBytes: number): string {
  return `\n\n[truncated, total ${totalBytes} bytes]`;
}

async function readTextFile(filePath: string, maxBytes: number): Promise<FileContentText> {
  const stat = await fs.stat(filePath);
  const cap = Math.min(stat.size, maxBytes);
  const buf = Buffer.alloc(cap);
  const fh = await fs.open(filePath, 'r');
  try {
    await fh.read(buf, 0, cap, 0);
  } finally {
    await fh.close();
  }
  const truncated = stat.size > cap;
  const text = truncated
    ? buf.toString('utf8') + truncatedSuffix(stat.size)
    : buf.toString('utf8');
  return { path: filePath, kind: 'text', text, bytesRead: cap, truncated };
}

export async function readFile(
  filePath: string,
  opts: { maxBytes?: number } = {},
): Promise<FileContent> {
  const kind = routeReader(filePath);
  if (kind === 'unsupported') {
    throw new Error(`unsupported binary format (${path.extname(filePath) || 'no ext'})`);
  }
  if (kind === 'text') {
    return readTextFile(filePath, opts.maxBytes ?? LIMITS.maxBytesText);
  }
  // pdf/docx/image: stubs filled by Tasks 6/7/8
  throw new Error('not implemented');
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npx vitest run tests/files.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add electron/files.ts tests/files.test.ts
git commit -m "feat(files): readFile text/code + truncation"
```

---

## Task 6: `readFile` for PDF (with fixture)

**Files:**
- Modify: `electron/files.ts`
- Modify: `tests/files.test.ts`
- Create: `tests/fixtures/sample.pdf` (tiny valid PDF, ~1 page hello-world)

- [ ] **Step 1: Add fixture**

Create `tests/fixtures/sample.pdf`. Easiest path:

```bash
mkdir -p tests/fixtures
node -e "
const { writeFileSync } = require('fs');
// Minimal valid PDF (~400 bytes) with text 'Claude Buddy PDF fixture'
const pdf = Buffer.from(
'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 72 720 Td (Claude Buddy PDF fixture) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000056 00000 n \n0000000103 00000 n \n0000000197 00000 n \n0000000287 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n347\n%%EOF', 'utf8');
writeFileSync('tests/fixtures/sample.pdf', pdf);
console.log('wrote', pdf.length, 'bytes');
"
```

If pdf-parse refuses this minimal PDF, swap for any tiny PDF you have (commit as binary).

- [ ] **Step 2: Write the failing test**

Append to `tests/files.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run, expect FAIL**

```bash
npx vitest run tests/files.test.ts
```

Expected: PDF test fails with `not implemented`.

- [ ] **Step 4: Implement PDF reader**

In `electron/files.ts`, add a top-level dynamic import for pdf-parse (it does some weird side-effects on require) and the handler:

```typescript
async function readPdfFile(filePath: string, maxBytes: number): Promise<FileContentText> {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) throw new Error('empty file');
  // pdf-parse expects a Buffer
  const cap = Math.min(stat.size, maxBytes);
  const buf = Buffer.alloc(cap);
  const fh = await fs.open(filePath, 'r');
  try { await fh.read(buf, 0, cap, 0); } finally { await fh.close(); }
  // Dynamic import keeps Vitest happy with pdf-parse's CJS side-effects
  const pdfParseMod = await import('pdf-parse');
  const pdfParse = (pdfParseMod as { default?: typeof pdfParseMod }).default ?? pdfParseMod;
  const parsed = await (pdfParse as (b: Buffer) => Promise<{ text: string }>)(buf);
  const truncated = stat.size > cap;
  const text = truncated ? parsed.text + truncatedSuffix(stat.size) : parsed.text;
  return { path: filePath, kind: 'text', text, bytesRead: cap, truncated };
}
```

Wire it into `readFile`:

```typescript
export async function readFile(
  filePath: string,
  opts: { maxBytes?: number } = {},
): Promise<FileContent> {
  const kind = routeReader(filePath);
  if (kind === 'unsupported') {
    throw new Error(`unsupported binary format (${path.extname(filePath) || 'no ext'})`);
  }
  if (kind === 'text') return readTextFile(filePath, opts.maxBytes ?? LIMITS.maxBytesText);
  if (kind === 'pdf')  return readPdfFile(filePath,  opts.maxBytes ?? LIMITS.maxBytesPdf);
  throw new Error('not implemented'); // docx + image still pending
}
```

- [ ] **Step 5: Run, expect PASS, then commit**

```bash
npx vitest run tests/files.test.ts
```

Expected: PDF test passes.

```bash
git add electron/files.ts tests/files.test.ts tests/fixtures/sample.pdf
git commit -m "feat(files): readFile supports PDF via pdf-parse"
```

---

## Task 7: `readFile` for DOCX (with fixture)

**Files:**
- Modify: `electron/files.ts`
- Modify: `tests/files.test.ts`
- Create: `tests/fixtures/sample.docx` (tiny valid DOCX)

- [ ] **Step 1: Add fixture**

The simplest path: create a tiny .docx in Microsoft Word / LibreOffice with the literal text `Claude Buddy DOCX fixture`. Save as `tests/fixtures/sample.docx`. If unavailable, you can generate one programmatically:

```bash
node -e "
const PizZip = require('pizzip');
"
```

If you don't have a docx generator, ship any 1-line .docx (e.g. open Wordpad, save as docx). The test just needs `mammoth.extractRawText` to return something matching `/Claude Buddy/`.

- [ ] **Step 2: Write the failing test**

Append to `tests/files.test.ts`:

```typescript
describe('readFile docx', () => {
  it('parses a DOCX and returns kind=text with the extracted text', async () => {
    const fixture = resolvePath(__dirname, 'fixtures/sample.docx');
    const out = await readFile(fixture);
    expect(out.kind).toBe('text');
    if (out.kind === 'text') {
      expect(out.text).toMatch(/Claude Buddy/i);
    }
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

```bash
npx vitest run tests/files.test.ts
```

Expected: DOCX test fails.

- [ ] **Step 4: Implement DOCX reader**

In `electron/files.ts`:

```typescript
async function readDocxFile(filePath: string, maxBytes: number): Promise<FileContentText> {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) throw new Error('empty file');
  const cap = Math.min(stat.size, maxBytes);
  const buf = Buffer.alloc(cap);
  const fh = await fs.open(filePath, 'r');
  try { await fh.read(buf, 0, cap, 0); } finally { await fh.close(); }
  const mammothMod = await import('mammoth');
  const mammoth = (mammothMod as { default?: typeof mammothMod }).default ?? mammothMod;
  const result = await (mammoth as { extractRawText: (i: { buffer: Buffer }) => Promise<{ value: string }> })
    .extractRawText({ buffer: buf });
  const truncated = stat.size > cap;
  const text = truncated ? result.value + truncatedSuffix(stat.size) : result.value;
  return { path: filePath, kind: 'text', text, bytesRead: cap, truncated };
}
```

Wire it in:

```typescript
  if (kind === 'docx') return readDocxFile(filePath, opts.maxBytes ?? LIMITS.maxBytesDocx);
```

- [ ] **Step 5: Run, expect PASS, then commit**

```bash
npx vitest run tests/files.test.ts
```

```bash
git add electron/files.ts tests/files.test.ts tests/fixtures/sample.docx
git commit -m "feat(files): readFile supports DOCX via mammoth"
```

---

## Task 8: `readFile` for images (with fixture)

**Files:**
- Modify: `electron/files.ts`
- Modify: `tests/files.test.ts`
- Create: `tests/fixtures/sample.png` (use existing assets/sprites/icon.png as the fixture by copying it)

- [ ] **Step 1: Add fixture**

```bash
cp assets/sprites/icon.png tests/fixtures/sample.png
```

- [ ] **Step 2: Write the failing test**

Append to `tests/files.test.ts`:

```typescript
describe('readFile image', () => {
  it('returns kind=image with base64 + mimeType for a PNG', async () => {
    const fixture = resolvePath(__dirname, 'fixtures/sample.png');
    const out = await readFile(fixture);
    expect(out.kind).toBe('image');
    if (out.kind === 'image') {
      expect(out.mimeType).toBe('image/png');
      expect(out.base64.length).toBeGreaterThan(0);
      // PNG signature in base64 starts with iVBORw0KGgo
      expect(out.base64.startsWith('iVBORw0KGgo')).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

```bash
npx vitest run tests/files.test.ts
```

Expected: image test fails.

- [ ] **Step 4: Implement image reader**

In `electron/files.ts`:

```typescript
const MIME_BY_EXT: Record<string, string> = {
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  bmp:  'image/bmp',
};

async function readImageFile(filePath: string, maxBytes: number): Promise<FileContentImage> {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) throw new Error('empty image');
  if (stat.size > maxBytes) {
    throw new Error(`image too large (${stat.size} bytes, limit ${maxBytes})`);
  }
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return {
    path: filePath,
    kind: 'image',
    base64: buf.toString('base64'),
    mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
    bytesRead: buf.length,
    truncated: false,
  };
}
```

Wire it in:

```typescript
  if (kind === 'image') return readImageFile(filePath, opts.maxBytes ?? LIMITS.maxBytesImage);
```

- [ ] **Step 5: Run, expect PASS, then commit**

```bash
npx vitest run tests/files.test.ts
```

```bash
git add electron/files.ts tests/files.test.ts tests/fixtures/sample.png
git commit -m "feat(files): readFile supports images (base64 for vision)"
```

---

## Task 9: `readFile` unsupported binary error

**Files:**
- Modify: `tests/files.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/files.test.ts`:

```typescript
describe('readFile unsupported', () => {
  it('throws on unknown binary formats', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-bin-'));
    const p = join(root, 'archive.zip');
    writeFileSync(p, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    await expect(readFile(p)).rejects.toThrow(/unsupported binary/i);
  });
});
```

- [ ] **Step 2: Run, expect PASS (already implemented in Task 5)**

```bash
npx vitest run tests/files.test.ts
```

Expected: PASS — the `routeReader` returns `'unsupported'` for `.zip` and `readFile` throws.

- [ ] **Step 3: Commit**

```bash
git add tests/files.test.ts
git commit -m "test(files): cover unsupported binary path"
```

---

## Task 10: IPC types + scope guard helper (with tests) + main handlers

**Files:**
- Modify: `shared/ipc-types.ts`
- Modify: `electron/files.ts` — add `pathIsWithin` pure helper
- Modify: `tests/files.test.ts` — add scope guard tests
- Modify: `electron/main.ts`

- [ ] **Step 1: Add `pathIsWithin` helper to electron/files.ts (testable)**

Add at the bottom of `electron/files.ts`:

```typescript
/**
 * True if `target` resolves to a location equal to or beneath one of `roots`.
 * Compares resolved absolute paths to avoid `..` escapes.
 * Used by the main process to gate filesystem tool calls to user-attached scope.
 */
export function pathIsWithin(target: string, roots: string[]): boolean {
  if (!roots.length) return false;
  const t = path.resolve(target);
  return roots.some(root => {
    const r = path.resolve(root);
    return t === r || t.startsWith(r + path.sep);
  });
}
```

- [ ] **Step 2: Add scope tests to tests/files.test.ts**

Append:

```typescript
import { pathIsWithin } from '../electron/files';
import { sep } from 'node:path';

describe('pathIsWithin (scope guard)', () => {
  it('returns false when roots is empty', () => {
    expect(pathIsWithin('/anywhere', [])).toBe(false);
  });

  it('returns true when target equals a root', () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-scope-'));
    expect(pathIsWithin(root, [root])).toBe(true);
  });

  it('returns true when target is a child of a root', () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-scope-'));
    writeFileSync(join(root, 'a.txt'), '');
    expect(pathIsWithin(join(root, 'a.txt'), [root])).toBe(true);
  });

  it('returns true for nested children', () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-scope-'));
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'b.txt'), '');
    expect(pathIsWithin(join(root, 'sub', 'b.txt'), [root])).toBe(true);
  });

  it('returns false for siblings outside any root', () => {
    const a = mkdtempSync(join(tmpdir(), 'cb-a-'));
    const b = mkdtempSync(join(tmpdir(), 'cb-b-'));
    writeFileSync(join(b, 'leaked.txt'), '');
    expect(pathIsWithin(join(b, 'leaked.txt'), [a])).toBe(false);
  });

  it('does NOT confuse path prefixes (e.g. /foo vs /foobar)', () => {
    // Both folders share a prefix string but are different roots
    const base = mkdtempSync(join(tmpdir(), 'cb-pfx-'));
    const foo = join(base, 'foo');
    const foobar = join(base, 'foobar');
    mkdirSync(foo);
    mkdirSync(foobar);
    writeFileSync(join(foobar, 'x.txt'), '');
    // foobar/x.txt must NOT be considered inside the [foo] scope
    expect(pathIsWithin(join(foobar, 'x.txt'), [foo])).toBe(false);
  });

  it('uses path.sep as boundary', () => {
    // Sanity: trailing separator behavior
    const root = mkdtempSync(join(tmpdir(), 'cb-sep-'));
    expect(pathIsWithin(root + sep, [root])).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests, expect PASS**

```bash
npx vitest run tests/files.test.ts
```

Expected: all `pathIsWithin` cases pass.

- [ ] **Step 4: Extend IPC types**

Edit `shared/ipc-types.ts`. Add these to `IpcRequests`:

```typescript
  'files:list-folder': (params: { path: string; recursive?: boolean }) =>
    { ok: true; listing: import('../electron/files').FolderListing } | { ok: false; error: string };
  'files:read-file': (params: { path: string }) =>
    { ok: true; content: import('../electron/files').FileContent } | { ok: false; error: string };
  'files:set-scope': (paths: string[]) => void;
  'files:pick-folder': () => { path: string; name: string; size: number } | null;
  'files:resolve-dropped': (paths: string[]) =>
    Array<{ path: string; kind: 'file' | 'folder'; name: string; size: number }>;
```

Edit `shared/ipc-types.ts`. Add these to `IpcRequests`:

```typescript
  'files:list-folder': (params: { path: string; recursive?: boolean }) =>
    { ok: true; listing: import('../electron/files').FolderListing } | { ok: false; error: string };
  'files:read-file': (params: { path: string }) =>
    { ok: true; content: import('../electron/files').FileContent } | { ok: false; error: string };
  'files:set-scope': (paths: string[]) => void;
  'files:pick-folder': () => { path: string; name: string; size: number } | null;
  'files:resolve-dropped': (paths: string[]) =>
    Array<{ path: string; kind: 'file' | 'folder'; name: string; size: number }>;
```

- [ ] **Step 5: Add scope state + handlers in `electron/main.ts`**

Near the top, after existing imports:

```typescript
import { dialog } from 'electron';
import { listFolder, readFile as readFileFs, pathIsWithin } from './files';
import { stat as fsStat } from 'node:fs/promises';
import { basename, resolve as resolvePath } from 'node:path';
```

Below other state variables:

```typescript
let attachedScope: string[] = []; // absolute paths the user has explicitly attached
```

In the `registerHandlers({...})` call, add:

```typescript
    'files:set-scope': (paths) => {
      attachedScope = paths.map(p => resolvePath(p));
    },
    'files:list-folder': async ({ path: p, recursive }) => {
      if (!pathIsWithin(p, attachedScope)) return { ok: false, error: `path not in attached scope: ${p}` };
      try {
        const listing = await listFolder(p, { recursive });
        return { ok: true, listing };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'list failed' };
      }
    },
    'files:read-file': async ({ path: p }) => {
      if (!pathIsWithin(p, attachedScope)) return { ok: false, error: `path not in attached scope: ${p}` };
      try {
        const content = await readFileFs(p);
        return { ok: true, content };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'read failed' };
      }
    },
    'files:pick-folder': async () => {
      const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (r.canceled || !r.filePaths[0]) return null;
      const p = r.filePaths[0];
      const s = await fsStat(p).catch(() => null);
      return { path: p, name: basename(p), size: s?.size ?? 0 };
    },
    'files:resolve-dropped': async (paths) => {
      const out = [] as Array<{ path: string; kind: 'file' | 'folder'; name: string; size: number }>;
      for (const p of paths) {
        const s = await fsStat(p).catch(() => null);
        if (!s) continue;
        out.push({
          path: p,
          kind: s.isDirectory() ? 'folder' : 'file',
          name: basename(p),
          size: s.isDirectory() ? 0 : s.size,
        });
      }
      return out;
    },
```

- [ ] **Step 6: Verify TS build passes**

```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 7: Smoke check that the app still starts**

```bash
npm run dev
```

Expected: dev server boots, mascot appears, no console errors related to IPC registration. Close after confirming.

- [ ] **Step 8: Commit**

```bash
git add shared/ipc-types.ts electron/files.ts electron/main.ts tests/files.test.ts
git commit -m "feat(ipc): file scope guard (with tests) + list/read/pick/resolve handlers"
```

---

## Task 11: Conversation store `attachedPaths` + auto scope sync

**Files:**
- Modify: `src/state/conversation.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Extend conversation store**

In `src/state/conversation.ts`, before `interface ConversationState`:

```typescript
export interface AttachedPath {
  id: string;
  path: string;
  kind: 'file' | 'folder';
  name: string;
  size: number;
}
```

In `interface ConversationState`, add:

```typescript
  attachedPaths: AttachedPath[];
  addAttachedPath: (p: AttachedPath) => void;
  removeAttachedPath: (id: string) => void;
```

In the store body:

```typescript
  attachedPaths: [],
  addAttachedPath: (p) => set((s) => ({ attachedPaths: [...s.attachedPaths, p] })),
  removeAttachedPath: (id) =>
    set((s) => ({ attachedPaths: s.attachedPaths.filter((x) => x.id !== id) })),
```

And update `reset` to include `attachedPaths: []`:

```typescript
  reset: () => set({ messages: [], attachments: [], attachedPaths: [], status: 'idle', error: null }),
```

- [ ] **Step 2: Wire scope sync in `src/App.tsx`**

At the top of `App.tsx`, near the other `useEffect`s (after `conv.attachedPaths` becomes available):

```typescript
  useEffect(() => {
    invoke('files:set-scope', conv.attachedPaths.map(p => p.path));
  }, [conv.attachedPaths]);
```

- [ ] **Step 3: Verify TS build passes**

```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Smoke run**

```bash
npm run dev
```

Open devtools, type in renderer console:

```javascript
window.electronAPI.invoke('files:set-scope', ['C:\\test'])
```

Expected: no error. (Will be exercised properly in Task 17.)

- [ ] **Step 5: Commit**

```bash
git add src/state/conversation.ts src/App.tsx
git commit -m "feat(state): attachedPaths in conversation store + scope sync"
```

---

## Task 12: Register `list_folder` and `read_file` tools (with image tool_result)

**Files:**
- Modify: `src/services/skills.ts`

- [ ] **Step 1: Add tool defs**

In `src/services/skills.ts`, push two new entries to `TOOLS`:

```typescript
  {
    name: 'list_folder',
    description:
      'Lista arquivos e subpastas dentro de uma pasta que o usuário anexou. Use ANTES de read_file quando precisar saber o que tem. Já filtra ruído (.git, node_modules, dist, lock files, e .gitignore se existir). Limite: 200 entradas por chamada.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Caminho absoluto da pasta. Deve estar dentro de algo que o usuário anexou.' },
        recursive: { type: 'boolean', description: 'Se true, desce em subpastas até 5 níveis.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description:
      'Lê o conteúdo de um arquivo (texto/código/PDF/DOCX/imagem). Para imagens você recebe um bloco image que pode analisar diretamente. Limites: 200KB texto, 5MB PDF, 2MB DOCX, 1MB imagem — acima disso vem truncado com sufixo.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Caminho absoluto do arquivo. Deve estar dentro do escopo anexado.' },
      },
      required: ['path'],
    },
  },
```

- [ ] **Step 2: Add executeTool cases**

In `src/services/skills.ts`, add to the `switch (name)` in `executeTool`:

```typescript
    case 'list_folder': {
      const path = String(input.path ?? '');
      const recursive = Boolean(input.recursive);
      const r = await invoke('files:list-folder', { path, recursive });
      if (!r.ok) return { content: `error: ${r.error}` };
      return { content: JSON.stringify(r.listing) };
    }
    case 'read_file': {
      const path = String(input.path ?? '');
      const r = await invoke('files:read-file', { path });
      if (!r.ok) return { content: `error: ${r.error}` };
      const c = r.content;
      if (c.kind === 'image') {
        // Image result: build a tool_result content array with an image block
        return {
          content: '[image attached]', // fallback for non-image-aware sinks
          imageResult: { base64: c.base64, mimeType: c.mimeType },
        };
      }
      return { content: c.text };
    }
```

- [ ] **Step 3: Extend `ToolResult` to carry an optional image**

Above `executeTool`, modify the interface:

```typescript
export interface ToolResult {
  content: string;
  sideEffect?: 'pasted' | 'memory_saved';
  text?: string;
  imageResult?: { base64: string; mimeType: string };
}
```

- [ ] **Step 4: Build the image-aware `tool_result` in `src/services/claude.ts`**

Find the tool-result push loop in `chatWithSkills`. Replace the existing single-string push with:

```typescript
        try {
          const result = await executeTool(tu.name, tu.input);
          callbacks.onToolResult?.(tu.name, result);
          if (result.imageResult) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: [
                { type: 'image', source: { type: 'base64', media_type: result.imageResult.mimeType, data: result.imageResult.base64 } },
              ],
            } as Anthropic.ToolResultBlockParam);
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: result.content,
            });
          }
        } catch (e) {
          // existing error path...
        }
```

- [ ] **Step 5: Verify TS build passes, commit**

```bash
npx tsc -b
```

```bash
git add src/services/skills.ts src/services/claude.ts
git commit -m "feat(tools): register list_folder + read_file (with image tool_result)"
```

---

## Task 13: Inject `ATTACHED PATHS` block into system prompt

**Files:**
- Modify: `src/services/claude.ts`

- [ ] **Step 1: Add helper + thread `attachedPaths` through `chatWithSkills`**

In `src/services/claude.ts`, add near the other helpers:

```typescript
import type { AttachedPath } from '@/state/conversation';

function attachedPathsBlock(paths: AttachedPath[]): string {
  if (paths.length === 0) return '';
  const lines = paths.map(p => `- [${p.kind}] ${p.path}`).join('\n');
  return `\n\nATTACHED PATHS (use list_folder / read_file when relevant):\n${lines}`;
}
```

Modify the `chatWithSkills` signature to accept `attachedPaths`:

```typescript
export async function chatWithSkills(
  messages: Message[],
  attachments: Attachment[],
  agent: AgentDTO,
  callbacks: StreamCallbacks,
  attachedPaths: AttachedPath[] = [],
): Promise<void> {
```

And add the block to the `system` assembly:

```typescript
  const system = [
    buildToolInstructions(locale),
    '---',
    languageDirective(locale),
    '---',
    agent.systemPrompt,
    memoriesBlock(agent.memories, locale),
    attachedPathsBlock(attachedPaths),
  ].join('\n\n');
```

- [ ] **Step 2: Pass `attachedPaths` from the caller in `src/App.tsx`**

Find the `chatWithSkills(...)` call in `handleSubmit`. Add the snapshot + pass:

```typescript
      const snapshotMessages = useConversation.getState().messages;
      const snapshotAttachments = useConversation.getState().attachments;
      const snapshotAttachedPaths = useConversation.getState().attachedPaths;
      if (!activeAgent) throw new Error('UNKNOWN');
      await chatWithSkills(snapshotMessages, snapshotAttachments, activeAgent, {
        // existing callbacks
      }, snapshotAttachedPaths);
```

- [ ] **Step 3: Verify TS build passes**

```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Smoke check**

```bash
npm run dev
```

Open mascot, send "hi" (no attachment). Verify normal response (the block injection should only kick in when paths exist — empty case returns `''`).

- [ ] **Step 5: Commit**

```bash
git add src/services/claude.ts src/App.tsx
git commit -m "feat(claude): inject ATTACHED PATHS block into system prompt"
```

---

## Task 14: i18n strings for folder picker, drop overlay, step labels

**Files:**
- Modify: `shared/i18n-strings.ts`

- [ ] **Step 1: Add keys to EN**

In the `EN` const, extend `attach` and `steps`:

```typescript
  attach: {
    // ...existing keys...
    folder: 'Folder',
    folderSub: 'attach a whole folder for the agent to read',
    dropHere: 'Drop to attach',
    folderItemSuffix: '(folder)',
  },
  steps: {
    // ...existing keys...
    list_folder: 'listed folder',
    read_file: 'read file',
  },
```

- [ ] **Step 2: Add same keys to PT (Brazilian PT)**

```typescript
  attach: {
    // ...
    folder: 'Pasta',
    folderSub: 'anexa uma pasta inteira pro agente ler',
    dropHere: 'Solte aqui',
    folderItemSuffix: '(pasta)',
  },
  steps: {
    // ...
    list_folder: 'listou a pasta',
    read_file: 'leu o arquivo',
  },
```

- [ ] **Step 3: Add same keys to ES**

```typescript
  attach: {
    // ...
    folder: 'Carpeta',
    folderSub: 'adjunta una carpeta entera para que el agente lea',
    dropHere: 'Suelta aquí',
    folderItemSuffix: '(carpeta)',
  },
  steps: {
    // ...
    list_folder: 'listó la carpeta',
    read_file: 'leyó el archivo',
  },
```

- [ ] **Step 4: Verify TS build passes**

```bash
npx tsc -b
```

Expected: no errors (the `StringDict = typeof EN` type will enforce the same keys in PT/ES).

- [ ] **Step 5: Commit**

```bash
git add shared/i18n-strings.ts
git commit -m "feat(i18n): strings for folder attach + drop overlay + steps"
```

---

## Task 15: AttachPicker — add "Pasta" option

**Files:**
- Modify: `src/components/AttachPicker.tsx`

- [ ] **Step 1: Add the option and handler**

In `src/components/AttachPicker.tsx`, add a new handler and a new button. Full updated component (keep existing structure, only add the folder button and handler):

```typescript
  const handleFolder = async () => {
    const r = await invoke('files:pick-folder');
    if (!r) return;
    onAttachPath({ kind: 'folder', path: r.path, name: r.name, size: r.size });
  };
```

Note: `onAttach` (existing) is for `Attachment` (file content). For paths we need a new prop. Add to `Props`:

```typescript
interface Props {
  onAttach: (a: Attachment) => void;
  onAttachPath: (p: { kind: 'file' | 'folder'; path: string; name: string; size: number }) => void;
  onClose: () => void;
}
```

Add the new button below the existing "Arquivo" button in the picker JSX:

```tsx
          <button className="attach-option" onClick={handleFolder}>
            <span className="attach-option-icon">📁</span>
            <div>
              <div className="attach-option-title">{t('attach.folder')}</div>
              <div className="attach-option-sub">{t('attach.folderSub')}</div>
            </div>
          </button>
```

- [ ] **Step 2: Wire the prop in `src/App.tsx`**

Find the `<AttachPicker .../>` usage and add `onAttachPath`:

```tsx
            <AttachPicker
              onClose={() => setShowAttachPicker(false)}
              onAttach={(a) => { conv.addAttachment(a); setShowAttachPicker(false); }}
              onAttachPath={(p) => {
                conv.addAttachedPath({ ...p, id: crypto.randomUUID() });
                setShowAttachPicker(false);
              }}
            />
```

- [ ] **Step 3: Verify TS build passes**

```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Smoke check**

```bash
npm run dev
```

Open mascot, click `+`, click "Pasta", pick a small folder. Picker closes (chip appears in next task).

- [ ] **Step 5: Commit**

```bash
git add src/components/AttachPicker.tsx src/App.tsx
git commit -m "feat(ui): AttachPicker 'Pasta' option opens folder dialog"
```

---

## Task 16: AttachmentChip — path variant

**Files:**
- Modify: `src/components/AttachmentChip.tsx`
- Modify: `src/App.tsx` (render attached path chips)

- [ ] **Step 1: Extend the chip component**

Replace `src/components/AttachmentChip.tsx` content with:

```typescript
import type { Attachment } from '@/state/conversation';
import type { AttachedPath } from '@/state/conversation';
import { useT } from '@/i18n';

interface AttachmentProps {
  attachment: Attachment;
  onRemove: () => void;
}

interface PathProps {
  attachedPath: AttachedPath;
  onRemove: () => void;
}

type Props = AttachmentProps | PathProps;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function AttachmentChip(props: Props) {
  const t = useT();
  if ('attachedPath' in props) {
    const p = props.attachedPath;
    const icon = p.kind === 'folder' ? '📁' : '📄';
    const label = p.kind === 'folder'
      ? `${icon} ${p.name} ${t('attach.folderItemSuffix')}`
      : `${icon} ${p.name} · ${formatSize(p.size)}`;
    return (
      <span className="cb-chip">
        {label}
        <button className="cb-chip-x" onClick={props.onRemove} aria-label={t('attach.removeChip')}>×</button>
      </span>
    );
  }
  const attachment = props.attachment;
  const label = attachment.kind === 'image'
    ? t('attach.imageAttached')
    : `"${attachment.content.slice(0, 28)}${attachment.content.length > 28 ? '…' : ''}"`;
  return (
    <span className="cb-chip">
      {label}
      <button className="cb-chip-x" onClick={props.onRemove} aria-label={t('attach.removeChip')}>×</button>
    </span>
  );
}
```

- [ ] **Step 2: Render path chips in App.tsx**

In `src/App.tsx`, near the existing attachments-rendering block, add a sibling block:

```tsx
          {showInput && conv.attachedPaths.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {conv.attachedPaths.map((p) => (
                <AttachmentChip key={p.id} attachedPath={p} onRemove={() => conv.removeAttachedPath(p.id)} />
              ))}
            </div>
          )}
```

- [ ] **Step 3: Verify TS build passes**

```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Smoke check**

```bash
npm run dev
```

Open mascot, `+` → "Pasta", pick a folder. Chip with 📁 should appear. Click `×`, chip disappears.

- [ ] **Step 5: Commit**

```bash
git add src/components/AttachmentChip.tsx src/App.tsx
git commit -m "feat(ui): AttachmentChip path variant + render attached paths"
```

---

## Task 17: App.tsx — drag overlay + drop handler + CSS

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add state + drag handlers in App.tsx**

In `src/App.tsx`, near the other `useState`s:

```typescript
  const [isDraggingOver, setIsDraggingOver] = useState(false);
```

Find the outermost `<div style={{ position: 'fixed', inset: 0, ... }}>` and add drag handlers:

```tsx
    <div
      style={{ /* existing */ }}
      onDragOver={(e) => {
        if (state === 'sleeping' || agentRunning) return;
        e.preventDefault();
        if (!isDraggingOver) setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        // only clear when leaving the actual container (not bubbling from child)
        if (e.currentTarget === e.target) setIsDraggingOver(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (state === 'sleeping' || agentRunning) return;
        const files = Array.from(e.dataTransfer.files);
        if (!files.length) return;
        // webUtils is exposed via the existing preload
        const { webUtils } = await import('electron');
        const paths = files.map((f) => webUtils.getPathForFile(f)).filter(Boolean);
        const resolved = await invoke('files:resolve-dropped', paths);
        for (const r of resolved) {
          conv.addAttachedPath({ id: crypto.randomUUID(), ...r });
        }
      }}
    >
```

**Important:** `webUtils` is in `electron/renderer` — in a sandboxed renderer, the path-extracting helper must be exposed via the preload. Check `electron/preload.ts`: if `webUtils.getPathForFile` is NOT exposed, modify the preload to expose it:

```typescript
// electron/preload.ts (add near the existing exposeInMainWorld block)
import { contextBridge, webUtils } from 'electron';
contextBridge.exposeInMainWorld('fileBridge', {
  getPathForFile: (f: File) => webUtils.getPathForFile(f),
});
```

Then in the App.tsx handler, replace `webUtils.getPathForFile(f)` with `(window as any).fileBridge.getPathForFile(f)`.

(Verify the existing preload at `electron/preload.ts` before deciding which path to take. If `webUtils` is already exposed under a different name, reuse it.)

- [ ] **Step 2: Add the overlay element**

Inside the outermost div, before the `<Mascot ... />`, conditionally render:

```tsx
      {isDraggingOver && (
        <div className="cb-drop-overlay">
          <div className="cb-drop-overlay-inner">{t('attach.dropHere')}</div>
        </div>
      )}
```

- [ ] **Step 3: Add CSS in `src/App.css`**

Append:

```css
.cb-drop-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 9999;
  background: rgba(250, 249, 245, 0.6);
}

.cb-drop-overlay-inner {
  padding: 18px 28px;
  border: 2px dashed var(--accent, #d97757);
  border-radius: 20px;
  background: #ffffff;
  font-family: "Tiempos Headline", "Lora", Georgia, serif;
  font-size: 18px;
  color: var(--ink, #141413);
}
```

- [ ] **Step 4: Smoke check**

```bash
npm run dev
```

Open mascot. Drag a file from File Explorer onto the bubble. Overlay should appear while dragging, disappear on drop, chip should appear. Drop a folder — chip with 📁.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.css electron/preload.ts
git commit -m "feat(ui): drag-and-drop attach for files and folders"
```

---

## Task 18: ResponseView — step labels for list_folder and read_file

**Files:**
- Modify: `src/components/ResponseView.tsx`

- [ ] **Step 1: Confirm dict lookup picks up new keys**

`ResponseView.tsx` already builds step labels with `t(\`steps.${seg.tool}\`)` and falls back to the raw tool name if the key is missing. Task 14 already added the keys, so this should "just work."

Open `src/components/ResponseView.tsx` and confirm the lookup is in place. No code changes expected if it is.

- [ ] **Step 2: Smoke check**

```bash
npm run dev
```

Attach a small folder, ask "list this folder." Verify a step row appears with "listed folder" / "leu o arquivo" depending on locale.

- [ ] **Step 3: Commit (no-op safety)**

If you needed to add anything, commit. Otherwise skip:

```bash
git add src/components/ResponseView.tsx
git commit -m "feat(ui): step labels for list_folder/read_file (i18n already wired)" --allow-empty
```

---

## Task 19: Smoke checklist + final commit

**Files:** none modified; manual verification + tag.

- [ ] **Step 1: Run the full unit suite**

```bash
npm run test
```

Expected: all `tests/files.test.ts` cases pass.

- [ ] **Step 2: Build production bundle to confirm nothing broke**

```bash
npm run build
```

Expected: clean tsc + vite build, no warnings about missing keys/types.

- [ ] **Step 3: Manual smoke run**

```bash
npm run dev
```

For each item, perform the action and tick when it works:

- [ ] Drop the entire `claude-buddy` repo on the bubble → "explain this project" → agent calls `list_folder` (recursive), reads README.md + package.json, gives a coherent answer. Steps visible.
- [ ] Drop a single PDF (any) → "summarize" → answer mentions actual content.
- [ ] Drop a single PNG → "what's in this image" → vision works (e.g. for the icon, agent describes a coral pixel-art creature).
- [ ] Attach a folder, ask 3 sequential questions about it without re-attaching → chip stays, agent keeps context.
- [ ] Click `×` on the chip → chip gone, next question must NOT reference the previous folder, attempting `read_file` on the removed path returns "path not in attached scope."
- [ ] Drop something **while mascote is sleeping** → no-op (overlay shouldn't appear).
- [ ] Drop a file with Unicode name (e.g. `relatório.txt`) → works.

- [ ] **Step 4: Update package.json version**

Bump to `0.3.0` to mark this feature release:

```bash
npm version minor --no-git-tag-version
```

(Verifies `package.json` and `package-lock.json` now say `0.3.0`.)

- [ ] **Step 5: Final commit + push**

```bash
git add package.json package-lock.json
git commit -m "chore: bump v0.3.0 — read files/folders feature"
git push
```

---

## Done

After Task 19, the `read_files` feature is shipped. Next planned spec (per top-level brainstorm): `shell` (run_command tool with confirmation), then `MCP` support. Those are separate brainstorm → spec → plan cycles.
