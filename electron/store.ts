import Store from 'electron-store';
import { machineIdSync } from 'node-machine-id';

interface Schema {
  apiKey?: string;
  position?: { x: number; y: number };
  memories?: string[];
  settings?: AppSettings;
  runCommandAllowlist?: string[];
}

export type Locale = 'en' | 'pt' | 'es';

export interface AppSettings {
  autostart: boolean;
  idleTimeoutMs: number;
  hotkey: string;
  ttsEnabled: boolean;
  ttsVoice: string;
  ttsRate: number;
  theme: 'light' | 'dark' | 'auto';
  soundsEnabled: boolean;
  soundsVolume: number;
  locale: Locale;
  // When true (default), agent responds in the language of the user's most
  // recent message. When false, always responds in the UI locale.
  respondInUserLanguage: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  autostart: true,
  idleTimeoutMs: 30_000,
  hotkey: 'CommandOrControl+Shift+Space',
  ttsEnabled: false,
  ttsVoice: 'en-US-JennyNeural',
  ttsRate: 1.25,
  theme: 'auto',
  soundsEnabled: true,
  soundsVolume: 0.1,
  locale: 'en',
  respondInUserLanguage: true,
};

const encryptionKey = machineIdSync(true).slice(0, 32);

export const store = new Store<Schema>({
  name: 'claude-buddy',
  encryptionKey,
  defaults: {},
});

export function getApiKey(): string | null {
  return store.get('apiKey') ?? null;
}

export function setApiKey(key: string): void {
  store.set('apiKey', key);
}

export function getPosition(): { x: number; y: number } | null {
  return store.get('position') ?? null;
}

export function setPosition(pos: { x: number; y: number }): void {
  store.set('position', pos);
}

export function listMemories(): string[] {
  return store.get('memories') ?? [];
}

export function addMemory(fact: string): void {
  const list = store.get('memories') ?? [];
  if (!list.includes(fact)) {
    list.push(fact);
    if (list.length > 50) list.shift();
    store.set('memories', list);
  }
}

export function deleteMemory(index: number): void {
  const list = store.get('memories') ?? [];
  list.splice(index, 1);
  store.set('memories', list);
}

export function clearMemories(): void {
  store.set('memories', []);
}

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...(store.get('settings') ?? {}) };
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const cur = getSettings();
  const next = { ...cur, ...patch };
  store.set('settings', next);
  return next;
}

// ─── run_command allowlist ──────────────────────────────────────────────────
// Persists user-approved "always allow" patterns. Pattern grammar is simple:
//   - first token (no whitespace), optionally suffixed with `*` for wildcard.
//   - matching is case-insensitive against the first token of the command.
//
// Example: pattern "npm test*" matches "npm test", "npm test:ci", but NOT
// "npm install". A bare pattern "git" matches only "git" exactly.

export function listRunCommandAllowlist(): string[] {
  return store.get('runCommandAllowlist') ?? [];
}

export function addRunCommandPattern(pattern: string): string[] {
  const trimmed = pattern.trim();
  if (!trimmed) return listRunCommandAllowlist();
  const list = listRunCommandAllowlist();
  if (!list.includes(trimmed)) {
    list.push(trimmed);
    if (list.length > 200) list.shift();
    store.set('runCommandAllowlist', list);
  }
  return list;
}

export function matchesRunCommandAllowlist(command: string): boolean {
  const list = listRunCommandAllowlist();
  if (list.length === 0) return false;
  const firstToken = command.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!firstToken) return false;
  for (const pat of list) {
    const p = pat.trim().toLowerCase();
    if (!p) continue;
    if (p.endsWith('*')) {
      const head = p.slice(0, -1).trim();
      if (!head) continue;
      // "npm test*" → match if command starts with "npm test" (token-aware).
      const headTokens = head.split(/\s+/);
      const cmdTokens = command.trim().toLowerCase().split(/\s+/);
      if (cmdTokens.length < headTokens.length) continue;
      let ok = true;
      for (let i = 0; i < headTokens.length; i++) {
        if (i === headTokens.length - 1) {
          if (!cmdTokens[i].startsWith(headTokens[i])) { ok = false; break; }
        } else {
          if (cmdTokens[i] !== headTokens[i]) { ok = false; break; }
        }
      }
      if (ok) return true;
    } else {
      if (firstToken === p) return true;
    }
  }
  return false;
}
