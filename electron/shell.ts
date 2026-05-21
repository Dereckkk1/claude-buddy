// PowerShell command execution for the run_command tool.
// Pure spawn wrapper — no Electron imports, testable in node directly.
//
// Uses -EncodedCommand (UTF-16LE → base64) to avoid every shell-escape edge
// case (spaces, quotes, multiline, special chars). Same trick keyboard.ts uses.

import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  cancelled?: boolean;
}

const MAX_TIMEOUT = 600_000;
const DEFAULT_TIMEOUT = 120_000;

// Registry of in-flight commands keyed by an externally supplied id. Lets the
// renderer kill (CommandApprovalCard "Matar processo") or extend the timeout
// of a specific running command without exposing process handles.
interface Live {
  child: ChildProcess;
  timer: NodeJS.Timeout;
  cancelled: boolean;
  expiresAt: number; // ms timestamp when timer fires
}
const live = new Map<string, Live>();

export function killCommand(id: string): boolean {
  const entry = live.get(id);
  if (!entry) return false;
  entry.cancelled = true;
  try { entry.child.kill('SIGTERM'); } catch { /* swallow */ }
  return true;
}

export function extendTimeout(id: string, deltaMs: number): boolean {
  const entry = live.get(id);
  if (!entry) return false;
  clearTimeout(entry.timer);
  const remaining = Math.max(1000, entry.expiresAt - Date.now()) + deltaMs;
  entry.expiresAt = Date.now() + remaining;
  entry.timer = setTimeout(() => {
    try { entry.child.kill('SIGTERM'); } catch { /* swallow */ }
  }, remaining);
  return true;
}

export async function runPowerShell(
  command: string,
  cwd?: string,
  timeoutMs?: number,
  runId?: string,
): Promise<RunResult> {
  const cappedTimeout = Math.min(timeoutMs ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);
  const effectiveCwd = cwd ?? os.homedir();
  const encoded = Buffer.from(command, 'utf16le').toString('base64');
  const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded];
  const start = Date.now();

  return new Promise<RunResult>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn('powershell.exe', args, { cwd: effectiveCwd, windowsHide: true });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const expiresAt = Date.now() + cappedTimeout;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* swallow */ }
    }, cappedTimeout);

    const entry: Live = { child, timer, cancelled: false, expiresAt };
    if (runId) live.set(runId, entry);

    child.stdout?.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));

    child.on('error', (err) => {
      clearTimeout(entry.timer);
      if (runId) live.delete(runId);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(entry.timer);
      if (runId) live.delete(runId);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
        timedOut,
        cancelled: entry.cancelled || undefined,
      });
    });
  });
}
