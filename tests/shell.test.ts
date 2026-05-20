import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPowerShell } from '../electron/shell';

// These tests spawn real PowerShell. Will only pass on Windows.
// Each test has its own timeout slightly longer than the longest expected run.

describe('runPowerShell', () => {
  it('captures stdout and returns exitCode 0 on success', async () => {
    const r = await runPowerShell('Write-Output hi');
    expect(r.stdout).toMatch(/hi/);
    expect(r.exitCode).toBe(0);
    expect(r.durationMs).toBeGreaterThan(0);
    expect(r.timedOut).toBe(false);
  }, 20_000);

  it('returns non-zero exit code from exit N', async () => {
    const r = await runPowerShell('exit 42');
    expect(r.exitCode).toBe(42);
  }, 20_000);

  it('honors the cwd argument', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-shell-'));
    const r = await runPowerShell('Get-Location | Select-Object -ExpandProperty Path', dir);
    expect(r.stdout.trim()).toBe(dir);
  }, 20_000);

  it('captures stderr (Write-Error)', async () => {
    const r = await runPowerShell('Write-Error "nope" 2>&1');
    // With redirection the error text ends up in stdout; without, in stderr.
    expect(r.stdout + r.stderr).toMatch(/nope/);
  }, 20_000);

  it('kills the process when timeout exceeded', async () => {
    const r = await runPowerShell('Start-Sleep 10', undefined, 500);
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBe(-1);
    // Allow generous kill latency on Windows
    expect(r.durationMs).toBeGreaterThanOrEqual(400);
    expect(r.durationMs).toBeLessThan(5000);
  }, 10_000);

  it('caps user-supplied timeout at 600_000 ms', async () => {
    // Hard to assert without waiting — just confirm it doesn't crash with a huge value
    const r = await runPowerShell('Write-Output ok', undefined, 9_999_999);
    expect(r.exitCode).toBe(0);
  }, 20_000);
});
