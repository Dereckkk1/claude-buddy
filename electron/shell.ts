// PowerShell command execution for the run_command tool.
// Pure spawn wrapper — no Electron imports, testable in node directly.
//
// Uses -EncodedCommand (UTF-16LE → base64) to avoid every shell-escape edge
// case (spaces, quotes, multiline, special chars). Same trick keyboard.ts uses.

import { spawn } from 'node:child_process';
import os from 'node:os';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

const MAX_TIMEOUT = 600_000;
const DEFAULT_TIMEOUT = 120_000;

export async function runPowerShell(
  command: string,
  cwd?: string,
  timeoutMs?: number,
): Promise<RunResult> {
  const cappedTimeout = Math.min(timeoutMs ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);
  const effectiveCwd = cwd ?? os.homedir();
  const encoded = Buffer.from(command, 'utf16le').toString('base64');
  const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded];
  const start = Date.now();

  return new Promise<RunResult>((resolve, reject) => {
    let child;
    try {
      child = spawn('powershell.exe', args, { cwd: effectiveCwd, windowsHide: true });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, cappedTimeout);

    child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
        timedOut,
      });
    });
  });
}
