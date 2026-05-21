import { globalShortcut, BrowserWindow } from 'electron';
import { captureActiveWindow } from './keyboard';

const ACCELERATOR = 'CommandOrControl+Shift+Space';
// Global panic key for computer-use agent: aborts the running agent loop in
// the renderer. Chosen to be muscle-memorable from "force quit" combos.
const PANIC_ACCELERATOR = 'CommandOrControl+Shift+Escape';

export function registerHotkeys(getMascotWin: () => BrowserWindow | null) {
  const success = globalShortcut.register(ACCELERATOR, () => {
    // Fire capture in the background — polling will also have done it.
    captureActiveWindow();
    const win = getMascotWin();
    if (!win) return;
    if (!win.isVisible()) win.show();
    win.focus();
    win.webContents.send('hotkey:activate');
  });

  if (!success) console.error('failed to register hotkey', ACCELERATOR);

  const panicSuccess = globalShortcut.register(PANIC_ACCELERATOR, () => {
    const win = getMascotWin();
    if (!win) return;
    // Renderer owns the AbortController; we just signal it.
    win.webContents.send('agent:panic');
  });
  if (!panicSuccess) console.error('failed to register panic hotkey', PANIC_ACCELERATOR);
}

export function unregisterHotkeys() {
  globalShortcut.unregisterAll();
}
