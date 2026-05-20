// Pure filesystem helpers used by the renderer through IPC. No Electron
// imports — keeps it testable in node directly.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ignore, { Ignore } from 'ignore';

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

export async function readFile(
  _filePath: string,
  _opts: { maxBytes?: number } = {},
): Promise<FileContent> {
  throw new Error('not implemented');
}
