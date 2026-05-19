import Store from 'electron-store';
import { machineIdSync } from 'node-machine-id';

interface Schema {
  apiKey?: string;
  position?: { x: number; y: number };
}

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
