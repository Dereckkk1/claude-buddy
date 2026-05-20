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

type Entry = PendingApproval & { resolveDecision: (d: ApprovalDecision) => void };

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

export function resolveApproval(id: string, decision: ApprovalDecision): void {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  entry.resolveDecision(decision);
  notifyPending();
  // If the user denied, the executeTool will never fire publishCardResult.
  // Surface the cancellation to any card subscriber right away so the UI
  // can disappear cleanly.
  if (!decision.approved) {
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
  return Array.from(pending.values()).map(({ resolveDecision: _r, ...rest }) => {
    void _r;
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
