// Renderer-side bridge for the view_screen tool's one-time consent modal.
// Mirrors the approval pattern from run-command-bridge but is simpler — at
// most one pending consent request exists at a time, and an approval is
// remembered for the session until clearScreenConsent() runs (on sleep).

type Listener = (req: PendingConsent | null) => void;

export interface PendingConsent {
  resolve: (ok: boolean) => void;
}

let consentForSession = false;
let pending: PendingConsent | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const cb of listeners) cb(pending);
}

/** Tool entry point — resolves true if already consented this session. */
export async function requestScreenConsent(): Promise<boolean> {
  if (consentForSession) return true;
  // Coalesce simultaneous tool calls: if a modal is already open, share its
  // outcome instead of stacking up requests.
  if (pending) {
    const existing = pending;
    return new Promise<boolean>((resolve) => {
      const orig = existing.resolve;
      existing.resolve = (ok) => { orig(ok); resolve(ok); };
    });
  }
  return new Promise<boolean>((resolve) => {
    pending = {
      resolve: (ok) => {
        if (ok) consentForSession = true;
        pending = null;
        notify();
        resolve(ok);
      },
    };
    notify();
  });
}

/** Called when the bubble sleeps so consent doesn't outlive the session. */
export function clearScreenConsent(): void {
  consentForSession = false;
  if (pending) {
    pending.resolve(false);
    pending = null;
    notify();
  }
}

export function subscribeScreenConsent(cb: Listener): () => void {
  listeners.add(cb);
  cb(pending);
  return () => { listeners.delete(cb); };
}
