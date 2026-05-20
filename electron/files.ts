// Pure filesystem helpers used by the renderer through IPC. No Electron
// imports — keeps it testable in node directly.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ignore, { Ignore } from 'ignore';

export interface FolderEntry {
  name: string;            // path relative to the listing root (e.g. "src/index.ts")
  absolutePath: string;    // canonical absolute path — pass this to read_file
  type: 'file' | 'folder';
  size: number;            // bytes; 0 for folder
  modified: number;        // ms epoch
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
  'package-lock.json',
  'pnpm-lock.yaml',
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

async function readGitignoreLines(rootPath: string): Promise<string[]> {
  try {
    const text = await fs.readFile(path.join(rootPath, '.gitignore'), 'utf8');
    return text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

export async function listFolder(
  rootPath: string,
  opts: { recursive?: boolean; maxEntries?: number } = {},
): Promise<FolderListing> {
  const maxEntries = opts.maxEntries ?? LIMITS.maxEntries;
  const giLines = await readGitignoreLines(rootPath);
  const ig = buildIgnoreMatcher(giLines);
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
        absolutePath: path.resolve(full),
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
  return { path: path.resolve(rootPath), entries, truncated: !keepGoing };
}

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

async function readPdfFile(filePath: string, maxBytes: number): Promise<FileContentText> {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) throw new Error('empty file');
  // pdf-parse expects a Buffer/Uint8Array via the `data` LoadParameter
  const cap = Math.min(stat.size, maxBytes);
  const buf = Buffer.alloc(cap);
  const fh = await fs.open(filePath, 'r');
  try { await fh.read(buf, 0, cap, 0); } finally { await fh.close(); }
  // Dynamic import keeps Vitest happy with pdf-parse's CJS side-effects.
  // pdf-parse v2 ships a `PDFParse` class; instantiate with `{ data: Uint8Array }`
  // and call `getText()`.
  const pdfParseMod = await import('pdf-parse');
  const { PDFParse } = pdfParseMod as unknown as {
    PDFParse: new (opts: { data: Uint8Array }) => { getText(): Promise<{ text: string }> };
  };
  const parser = new PDFParse({ data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) });
  const parsed = await parser.getText();
  const truncated = stat.size > cap;
  const text = truncated ? parsed.text + truncatedSuffix(stat.size) : parsed.text;
  return { path: filePath, kind: 'text', text, bytesRead: cap, truncated };
}

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

async function readDocxFile(filePath: string, maxBytes: number): Promise<FileContentText> {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) throw new Error('empty file');
  const cap = Math.min(stat.size, maxBytes);
  const buf = Buffer.alloc(cap);
  const fh = await fs.open(filePath, 'r');
  try { await fh.read(buf, 0, cap, 0); } finally { await fh.close(); }
  const mammothMod = await import('mammoth');
  const mammoth = (mammothMod as unknown as { default?: typeof mammothMod }).default ?? mammothMod;
  const result = await (mammoth as { extractRawText: (i: { buffer: Buffer }) => Promise<{ value: string }> })
    .extractRawText({ buffer: buf });
  const truncated = stat.size > cap;
  const text = truncated ? result.value + truncatedSuffix(stat.size) : result.value;
  return { path: filePath, kind: 'text', text, bytesRead: cap, truncated };
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
  if (kind === 'text') return readTextFile(filePath, opts.maxBytes ?? LIMITS.maxBytesText);
  if (kind === 'pdf')  return readPdfFile(filePath,  opts.maxBytes ?? LIMITS.maxBytesPdf);
  if (kind === 'docx') return readDocxFile(filePath, opts.maxBytes ?? LIMITS.maxBytesDocx);
  if (kind === 'image') return readImageFile(filePath, opts.maxBytes ?? LIMITS.maxBytesImage);
  throw new Error('not implemented');
}

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
