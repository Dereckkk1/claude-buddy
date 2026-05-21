import Store from 'electron-store';
import { machineIdSync } from 'node-machine-id';

interface Schema {
  apiKey?: string;
  position?: { x: number; y: number };
  memories?: string[];
  settings?: AppSettings;
  hasSeenIntro?: boolean;
  wakeCount?: number;
  lastBootNotificationDate?: string; // ISO date (YYYY-MM-DD)
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

// True only the very first time the app boots (before any settings have been
// persisted). Used to seed defaults from the OS (e.g. detected locale).
export function isFirstBoot(): boolean {
  return !store.has('settings');
}

export function hasSeenIntro(): boolean {
  return store.get('hasSeenIntro') ?? false;
}

export function markIntroSeen(): void {
  store.set('hasSeenIntro', true);
}

export function getWakeCount(): number {
  return store.get('wakeCount') ?? 0;
}

export function bumpWakeCount(): number {
  const next = (store.get('wakeCount') ?? 0) + 1;
  store.set('wakeCount', next);
  return next;
}

export function getLastBootNotificationDate(): string | null {
  return store.get('lastBootNotificationDate') ?? null;
}

export function setLastBootNotificationDate(iso: string): void {
  store.set('lastBootNotificationDate', iso);
}
