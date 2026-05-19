import { ipcMain } from 'electron';
import type { IpcRequests } from '../shared/ipc-types';

type Handlers = {
  [K in keyof IpcRequests]: (...args: Parameters<IpcRequests[K]>) =>
    | ReturnType<IpcRequests[K]>
    | Promise<ReturnType<IpcRequests[K]>>;
};

export function registerHandlers(handlers: Partial<Handlers>) {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_e, ...args) =>
      (handler as (...a: unknown[]) => unknown)(...args)
    );
  }
}
