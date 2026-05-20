import type { IpcRequests } from '@shared/ipc-types';

interface ElectronAPI {
  invoke<K extends keyof IpcRequests>(
    channel: K,
    ...args: Parameters<IpcRequests[K]>
  ): Promise<ReturnType<IpcRequests[K]>>;
  on(channel: string, listener: (...args: unknown[]) => void): void;
  off(channel: string): void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export function invoke<K extends keyof IpcRequests>(
  channel: K,
  ...args: Parameters<IpcRequests[K]>
): Promise<ReturnType<IpcRequests[K]>> {
  return window.electronAPI.invoke(channel, ...args);
}

export function on(channel: string, listener: (...args: unknown[]) => void) {
  window.electronAPI.on(channel, listener);
}

export function off(channel: string) {
  window.electronAPI.off(channel);
}
