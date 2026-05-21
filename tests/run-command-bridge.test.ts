import { describe, it, expect, beforeEach } from 'vitest';
import {
  requestApproval,
  resolveApproval,
  getPendingApprovals,
  subscribePendingApprovals,
  publishCardResult,
  subscribeCardResult,
  clearAllApprovals,
  type CardResult,
} from '../src/services/run-command-bridge';

beforeEach(() => {
  clearAllApprovals();
});

describe('run-command-bridge — approvals', () => {
  it('requestApproval registers a pending entry and returns its id', () => {
    const { id, decision } = requestApproval({ command: 'echo hi' });
    expect(id).toBeDefined();
    expect(decision).toBeInstanceOf(Promise);
    const pending = getPendingApprovals();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(id);
    expect(pending[0].command).toBe('echo hi');
  });

  it('resolveApproval resolves the decision promise but keeps the entry mounted', async () => {
    // Entries stay in `pending` after resolution so the card can transition
    // from pending → running → result without being unmounted. Removal
    // happens en-masse via clearAllApprovals when the bubble closes.
    const { id, decision } = requestApproval({ command: 'echo hi' });
    resolveApproval(id, { approved: true, finalCommand: 'echo edited' });
    const d = await decision;
    expect(d.approved).toBe(true);
    expect(d.finalCommand).toBe('echo edited');
    expect(getPendingApprovals().length).toBe(1);
  });

  it('resolveApproval called twice on the same id only fires once', async () => {
    const { id, decision } = requestApproval({ command: 'echo hi' });
    resolveApproval(id, { approved: true });
    // Second call must NOT re-resolve (would replace the value the consumer
    // already awaited and could double-fire cancelled events).
    resolveApproval(id, { approved: false });
    const d = await decision;
    expect(d.approved).toBe(true);
  });

  it('resolveApproval on an unknown id is a no-op', () => {
    expect(() => resolveApproval('bogus-id', { approved: true })).not.toThrow();
  });

  it('subscribePendingApprovals fires on add (resolve does NOT mutate the list)', () => {
    let count = 0;
    const unsub = subscribePendingApprovals(() => { count++; });
    const { id } = requestApproval({ command: 'a' });
    expect(count).toBe(1);
    // resolve no longer removes the entry → no notification
    resolveApproval(id, { approved: false });
    expect(count).toBe(1);
    unsub();
  });

  it('clearAllApprovals resolves every pending as denied and empties the registry', async () => {
    const a = requestApproval({ command: 'a' });
    const b = requestApproval({ command: 'b' });
    expect(getPendingApprovals().length).toBe(2);
    clearAllApprovals();
    expect(getPendingApprovals().length).toBe(0);
    expect((await a.decision).approved).toBe(false);
    expect((await b.decision).approved).toBe(false);
  });

  it('multiple independent requests have distinct ids', () => {
    const a = requestApproval({ command: 'a' });
    const b = requestApproval({ command: 'b' });
    expect(a.id).not.toBe(b.id);
    expect(getPendingApprovals().length).toBe(2);
  });
});

describe('run-command-bridge — card results', () => {
  it('publishCardResult delivers to subscriber and unregisters', () => {
    const id = 'test-1';
    const seen: CardResult[] = [];
    subscribeCardResult(id, (r) => seen.push(r));
    publishCardResult(id, { kind: 'ok', result: { stdout: 'hi', stderr: '', exitCode: 0, durationMs: 10, timedOut: false } });
    expect(seen.length).toBe(1);
    expect(seen[0].kind).toBe('ok');
    // Second publish is dropped (listener was removed on first delivery)
    publishCardResult(id, { kind: 'cancelled' });
    expect(seen.length).toBe(1);
  });

  it('denying an approval auto-emits cancelled to any card subscriber', () => {
    const { id } = requestApproval({ command: 'a' });
    const seen: CardResult[] = [];
    subscribeCardResult(id, (r) => seen.push(r));
    resolveApproval(id, { approved: false });
    expect(seen.length).toBe(1);
    expect(seen[0].kind).toBe('cancelled');
  });

  it('subscribeCardResult unsubscribe stops delivery', () => {
    const id = 'test-2';
    const seen: CardResult[] = [];
    const unsub = subscribeCardResult(id, (r) => seen.push(r));
    unsub();
    publishCardResult(id, { kind: 'cancelled' });
    expect(seen.length).toBe(0);
  });

  it('clearAllApprovals emits cancelled to all card subscribers', () => {
    const seen: CardResult[] = [];
    subscribeCardResult('a', (r) => seen.push(r));
    subscribeCardResult('b', (r) => seen.push(r));
    clearAllApprovals();
    expect(seen.length).toBe(2);
    expect(seen.every((s) => s.kind === 'cancelled')).toBe(true);
  });
});
