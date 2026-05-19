import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRequests } from '../shared/ipc-types';

const api = {
  invoke: <K extends keyof IpcRequests>(
    channel: K,
    ...args: Parameters<IpcRequests[K]>
  ): Promise<ReturnType<IpcRequests[K]>> =>
    ipcRenderer.invoke(channel, ...args) as Promise<ReturnType<IpcRequests[K]>>,
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_e, ...args) => listener(...args));
  },
  off: (channel: string) => ipcRenderer.removeAllListeners(channel),
};

contextBridge.exposeInMainWorld('electronAPI', api);

declare global {
  interface Window {
    electronAPI: typeof api;
  }
}
