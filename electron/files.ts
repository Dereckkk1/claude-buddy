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
