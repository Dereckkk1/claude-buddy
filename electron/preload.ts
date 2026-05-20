import { contextBridge, ipcRenderer, webUtils } from 'electron';
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

// Expose the path-from-File helper so drag-drop handlers can resolve dropped
// items to absolute paths (webUtils is not directly available in a sandboxed
// renderer).
const fileBridge = {
  getPathForFile: (f: File) => webUtils.getPathForFile(f),
};
contextBridge.exposeInMainWorld('fileBridge', fileBridge);

declare global {
  interface Window {
    electronAPI: typeof api;
    fileBridge: typeof fileBridge;
  }
}
