// Renderer-side approval registry for the run_command tool.
//
// Bridges the tool execution (which is `await`-ed by the agent's stream loop)
// with the React UI (which needs to render a card and dispatch on click).
//
// Two channels:
//  1. Approval: agent → user (decision: run / cancel / edit).
//  2. Result: executeTool → card (the actual RunResult after IPC completes,
//     so the card can render the result-state without doing its own IPC and
//     duplicating execution).

import { useSyncExternalStore } from 'react';
import type { RunResult } from '../../electron/shell';

export interface PendingApproval {
  id: string;
  command: string;
  cwd?: string;
  timeoutMs?: number;
  /** Allowlist hit — the card should render as 'running' from the start. */
  autoApproved?: boolean;
}

export interface ApprovalDecision {
  approved: boolean;
  finalCommand?: string;
  finalCwd?: string;
}

// What the card observes after the executeTool finishes the IPC. null means
// the agent's tool call was cancelled (user denied or bubble closed).
export type CardResult =
  | { kind: 'ok'; result: RunResult }
  | { kind: 'error'; error: string }
  | { kind: 'cancelled' };

type Entry = PendingApproval & { resolveDecision: (d: ApprovalDecision) => void; resolved?: boolean };

// Note on lifetime: cards stay in `pending` even AFTER the user resolves their
// approval (or the entry is auto-approved). This lets CommandApprovalCard render
// its internal running/result state without being unmounted by the parent's
// `approvals.map(...)` re-render. The map is cleared en-masse on bubble close
// via clearAllApprovals().
const pending = new Map<string, Entry>();
const pendingListeners = new Set<() => void>();
const resultListeners = new Map<string, (r: CardResult) => void>();

function notifyPending(): void {
  pendingListeners.forEach((cb) => cb());
}

export function requestApproval(
  p: Omit<PendingApproval, 'id'>,
): { id: string; decision: Promise<ApprovalDecision> } {
  const id = crypto.randomUUID();
  const decision = new Promise<ApprovalDecision>((resolve) => {
    pending.set(id, { ...p, id, resolveDecision: resolve });
    notifyPending();
  });
  return { id, decision };
}

/**
 * Register a card that bypassed approval (allowlist match). The card renders
 * straight in 'running' state and listens for the result like any other.
 */
export function registerAutoApprovedCard(
  p: Omit<PendingApproval, 'id' | 'autoApproved'>,
): string {
  const id = crypto.randomUUID();
  pending.set(id, {
    ...p,
    id,
    autoApproved: true,
    resolved: true, // no decision to await
    // No-op resolver — no user decision is awaited.
    resolveDecision: () => {},
  });
  notifyPending();
  return id;
}

export function resolveApproval(id: string, decision: ApprovalDecision): void {
  const entry = pending.get(id);
  if (!entry || entry.resolved) return;
  entry.resolved = true;
  entry.resolveDecision(decision);
  // Don't delete from `pending` — keeping the entry there means the card
  // stays mounted to render its running/result state. See `clearAllApprovals`.
  if (!decision.approved) {
    // If the user denied, no IPC runs → no publishCardResult will come.
    resultListeners.get(id)?.({ kind: 'cancelled' });
    resultListeners.delete(id);
  }
}

export function publishCardResult(id: string, result: CardResult): void {
  resultListeners.get(id)?.(result);
  resultListeners.delete(id);
}

export function subscribeCardResult(id: string, cb: (r: CardResult) => void): () => void {
  resultListeners.set(id, cb);
  return () => {
    // Only delete if it's still our listener (don't clobber a later subscribe)
    if (resultListeners.get(id) === cb) resultListeners.delete(id);
  };
}

export function clearAllApprovals(): void {
  if (pending.size === 0 && resultListeners.size === 0) return;
  for (const entry of pending.values()) {
    entry.resolveDecision({ approved: false });
  }
  pending.clear();
  for (const [id, cb] of resultListeners) {
    cb({ kind: 'cancelled' });
    void id;
  }
  resultListeners.clear();
  notifyPending();
}

export function getPendingApprovals(): PendingApproval[] {
  return Array.from(pending.values()).map(({ resolveDecision: _r, resolved: _x, ...rest }) => {
    void _r; void _x;
    return rest;
  });
}

export function subscribePendingApprovals(cb: () => void): () => void {
  pendingListeners.add(cb);
  return () => { pendingListeners.delete(cb); };
}

// React hook — re-renders consumers whenever pending changes.
let snapshot: PendingApproval[] = [];
function getSnapshot(): PendingApproval[] {
  const fresh = getPendingApprovals();
  if (
    snapshot.length === fresh.length &&
    snapshot.every((s, i) => s.id === fresh[i].id)
  ) {
    return snapshot;
  }
  snapshot = fresh;
  return snapshot;
}

export function usePendingApprovals(): PendingApproval[] {
  return useSyncExternalStore(subscribePendingApprovals, getSnapshot, getSnapshot);
}
