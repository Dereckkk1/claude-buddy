import { contextBridge, ipcRenderer } from 'electron';

const api = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_e, ...args) => listener(...args));
  },
  off: (channel: string) => ipcRenderer.removeAllListeners(channel),
};

contextBridge.exposeInMainWorld('electronAPI', api);
