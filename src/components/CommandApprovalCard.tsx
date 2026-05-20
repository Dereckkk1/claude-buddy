// Inline approval card for the run_command tool.
//
// State machine: pending → (Run) → running → result | (Cancel) → cancelled.
// The card does NOT do IPC itself — the executeTool in skills.ts runs the
// command and publishes the result via publishCardResult. This card just
// subscribes via subscribeCardResult and renders whichever stage it's in.
//
// Cancelled cards self-unmount (return null). Result cards stick around
// until the bubble itself unmounts (sleep/close).

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';
import {
  subscribeCardResult,
  type PendingApproval,
  type ApprovalDecision,
  type CardResult,
} from '@/services/run-command-bridge';
import type { RunResult } from '../../electron/shell';

interface Props {
  approval: PendingApproval;
  onResolve: (decision: ApprovalDecision) => void;
}

type CardState =
  | { kind: 'pending' }
  | { kind: 'running'; command: string; cwd?: string }
  | { kind: 'result';  command: string; cwd?: string; result: RunResult }
  | { kind: 'cancelled' };

function shortenCmd(cmd: string, maxLen = 80): string {
  const oneLine = cmd.split('\n')[0];
  return oneLine.length > maxLen ? oneLine.slice(0, maxLen - 1) + '…' : oneLine;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`;
}

export function CommandApprovalCard({ approval, onResolve }: Props) {
  const t = useT();
  const [state, setState] = useState<CardState>({ kind: 'pending' });
  const [editing, setEditing] = useState(false);
  const [draftCmd, setDraftCmd] = useState(approval.command);
  // cwd is not editable in this iteration — comes from explicit input.cwd or
  // the first attached folder. Add a cwd input later if real demand.
  const draftCwd = approval.cwd ?? '';
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  // Subscribe to whatever the executeTool publishes for this approval id.
  // The same channel delivers errors and cancellations — we translate them
  // into the local card state.
  useEffect(() => {
    return subscribeCardResult(approval.id, (r: CardResult) => {
      if (r.kind === 'cancelled') {
        setState({ kind: 'cancelled' });
      } else if (r.kind === 'error') {
        setState((prev) => {
          const command = prev.kind === 'running' || prev.kind === 'result' ? prev.command : draftCmd;
          const cwd = prev.kind === 'running' || prev.kind === 'result' ? prev.cwd : draftCwd || undefined;
          return {
            kind: 'result',
            command,
            cwd,
            result: { stdout: '', stderr: r.error, exitCode: -1, durationMs: 0, timedOut: false },
          };
        });
      } else {
        setState((prev) => {
          const command = prev.kind === 'running' || prev.kind === 'result' ? prev.command : draftCmd;
          const cwd = prev.kind === 'running' || prev.kind === 'result' ? prev.cwd : draftCwd || undefined;
          return { kind: 'result', command, cwd, result: r.result };
        });
      }
    });
  }, [approval.id, draftCmd, draftCwd]);

  const handleCancel = () => {
    onResolve({ approved: false });
    // subscribeCardResult will also fire 'cancelled' but setting state here
    // makes the UI feel snappy and prevents any flicker.
    setState({ kind: 'cancelled' });
  };

  const handleRun = () => {
    const finalCommand = draftCmd.trim();
    const finalCwd = draftCwd.trim() || undefined;
    if (!finalCommand) return;
    onResolve({ approved: true, finalCommand, finalCwd });
    setState({ kind: 'running', command: finalCommand, cwd: finalCwd });
  };

  if (state.kind === 'cancelled') return null;

  // ── Pending: show command + cwd + 3 buttons ──────────────────────────────
  if (state.kind === 'pending') {
    return (
      <div className="cb-cmd-card cb-cmd-card-pending">
        <div className="cb-cmd-card-header">
          <span className="cb-cmd-card-icon">▶</span>
          <span>{t('shell.wantsToRun')}</span>
        </div>
        {editing ? (
          <textarea
            ref={textareaRef}
            className="cb-cmd-card-edit"
            value={draftCmd}
            onChange={(e) => setDraftCmd(e.target.value)}
            rows={Math.min(8, Math.max(2, draftCmd.split('\n').length))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <pre className="cb-cmd-card-code">{draftCmd}</pre>
        )}
        <div className="cb-cmd-card-cwd">
          {t('shell.cwdLabel')}: <code>{draftCwd || t('shell.homeDir')}</code>
        </div>
        <div className="cb-cmd-card-actions">
          <button className="cb-btn cb-btn-secondary" onClick={handleCancel} autoFocus>
            {t('shell.cancel')}
          </button>
          <button className="cb-btn cb-btn-ghost" onClick={() => setEditing((v) => !v)}>
            {t('shell.edit')}
          </button>
          <button
            className="cb-btn cb-btn-primary"
            onClick={handleRun}
            disabled={!draftCmd.trim()}
          >
            {t('shell.run')}
          </button>
        </div>
      </div>
    );
  }

  // ── Running: spinner ──────────────────────────────────────────────────────
  if (state.kind === 'running') {
    return (
      <div className="cb-cmd-card cb-cmd-card-running">
        <div className="cb-cmd-card-header">
          <span className="cb-cmd-card-spinner" aria-hidden />
          <span>{t('shell.running')}</span>
          <code className="cb-cmd-card-cmd-inline">{shortenCmd(state.command)}</code>
        </div>
      </div>
    );
  }

  // ── Result: header + expandable output ────────────────────────────────────
  const { result, command } = state;
  const success = !result.timedOut && result.exitCode === 0;
  const statusDot = success ? '✓' : result.timedOut ? '⏱' : '✕';
  const statusClass = success ? 'cb-cmd-card-ok' : 'cb-cmd-card-err';
  const exitText = result.timedOut
    ? t('shell.timedOut')
    : `${t('shell.exitCode')} ${result.exitCode}`;
  const hasOutput = !!(result.stdout.trim() || result.stderr.trim());

  return (
    <div className={`cb-cmd-card cb-cmd-card-result ${statusClass}`}>
      <button
        className="cb-cmd-card-header cb-cmd-card-header-button"
        onClick={() => setExpanded((v) => !v)}
        disabled={!hasOutput}
      >
        <span className="cb-cmd-card-icon">{statusDot}</span>
        <span>{t('shell.ran')}:</span>
        <code className="cb-cmd-card-cmd-inline">{shortenCmd(command)}</code>
        <span className="cb-cmd-card-meta">
          · {formatDuration(result.durationMs)} · {exitText}
        </span>
        {hasOutput && (
          <span className="cb-cmd-card-toggle">{expanded ? '▴' : '▾'}</span>
        )}
      </button>
      {expanded && hasOutput && (
        <div className="cb-cmd-card-output">
          {result.stdout && <pre className="cb-cmd-card-stdout">{result.stdout}</pre>}
          {result.stderr && <pre className="cb-cmd-card-stderr">{result.stderr}</pre>}
        </div>
      )}
    </div>
  );
}
