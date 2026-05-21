import { globalShortcut, BrowserWindow } from 'electron';
import { captureActiveWindow } from './keyboard';

const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+Space';
// Global panic key for computer-use agent: aborts the running agent loop in
// the renderer. Chosen to be muscle-memorable from "force quit" combos.
const PANIC_ACCELERATOR = 'CommandOrControl+Shift+Escape';

let currentGetWin: (() => BrowserWindow | null) | null = null;
let currentAccelerator: string = DEFAULT_ACCELERATOR;

export function registerHotkeys(getMascotWin: () => BrowserWindow | null, accelerator?: string) {
  currentGetWin = getMascotWin;
  if (accelerator) currentAccelerator = accelerator;
  const success = globalShortcut.register(currentAccelerator, () => {
    // Fire capture in the background — polling will also have done it.
    captureActiveWindow();
    const win = getMascotWin();
    if (!win) return;
    if (!win.isVisible()) win.show();
    win.focus();
    win.webContents.send('hotkey:activate');
  });

  if (!success) console.error('failed to register hotkey', currentAccelerator);

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

/**
 * Reregister the global hotkey with a new accelerator. Returns true on success.
 * If the new accelerator is already taken by another process, returns false
 * AND restores the previous accelerator (so the app remains usable).
 */
export function reregisterHotkey(newAccelerator: string): boolean {
  if (!currentGetWin) return false;
  const prev = currentAccelerator;
  globalShortcut.unregisterAll();
  try {
    const ok = globalShortcut.register(newAccelerator, () => {
      captureActiveWindow();
      const win = currentGetWin?.();
      if (!win) return;
      if (!win.isVisible()) win.show();
      win.focus();
      win.webContents.send('hotkey:activate');
    });
    if (ok) {
      currentAccelerator = newAccelerator;
      return true;
    }
  } catch (e) {
    console.error('[hotkeys] reregister failed:', e);
  }
  // Failed — restore previous
  try {
    globalShortcut.register(prev, () => {
      captureActiveWindow();
      const win = currentGetWin?.();
      if (!win) return;
      if (!win.isVisible()) win.show();
      win.focus();
      win.webContents.send('hotkey:activate');
    });
    currentAccelerator = prev;
  } catch { /* swallow */ }
  return false;
}

/**
 * Returns whether a given accelerator is already registered by ANY app (this
 * one or another). Used by the hotkey editor's conflict check.
 */
export function isAcceleratorInUse(accelerator: string): boolean {
  try {
    return globalShortcut.isRegistered(accelerator);
  } catch {
    return false;
  }
}
