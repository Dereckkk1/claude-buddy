import { globalShortcut, BrowserWindow, screen } from 'electron';
import { captureActiveWindow } from './keyboard';

const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+Space';
const ACCELERATOR_ASK_SEL = 'CommandOrControl+Shift+A';
// Global panic key for computer-use agent: aborts the running agent loop in
// the renderer. Muscle-memorable from "force quit" combos.
const PANIC_ACCELERATOR = 'CommandOrControl+Shift+Escape';

const MARGIN = 12;

let currentGetWin: (() => BrowserWindow | null) | null = null;
let currentAccelerator: string = DEFAULT_ACCELERATOR;

// Multi-monitor: recalc display under cursor, reposition mascot to its
// bottom-right corner. Keeps UX consistent when user moves between screens.
function moveToActiveDisplay(win: BrowserWindow) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const [w, h] = win.getSize();
  const { x: minX, y: minY, width: dW, height: dH } = display.workArea;
  const x = minX + dW - w - MARGIN;
  const y = minY + dH - h - MARGIN;
  win.setBounds({ x, y, width: w, height: h });
}

function registerWakeShortcut(accelerator: string, getMascotWin: () => BrowserWindow | null): boolean {
  return globalShortcut.register(accelerator, () => {
    captureActiveWindow();
    const win = getMascotWin();
    if (!win) return;
    moveToActiveDisplay(win);
    if (!win.isVisible()) win.show();
    win.focus();
    win.webContents.send('hotkey:activate');
  });
}

export function registerHotkeys(getMascotWin: () => BrowserWindow | null, accelerator?: string) {
  currentGetWin = getMascotWin;
  if (accelerator) currentAccelerator = accelerator;

  const wakeOk = registerWakeShortcut(currentAccelerator, getMascotWin);
  if (!wakeOk) console.error('failed to register hotkey', currentAccelerator);

  const panicOk = globalShortcut.register(PANIC_ACCELERATOR, () => {
    const win = getMascotWin();
    if (!win) return;
    // Renderer owns the AbortController; we just signal it.
    win.webContents.send('agent:panic');
  });
  if (!panicOk) console.error('failed to register panic hotkey', PANIC_ACCELERATOR);

  // Second shortcut: wake + immediately pull the selection from the previously
  // active app and feed it into the input.
  const askOk = globalShortcut.register(ACCELERATOR_ASK_SEL, async () => {
    await captureActiveWindow();
    const win = getMascotWin();
    if (!win) return;
    moveToActiveDisplay(win);
    if (!win.isVisible()) win.show();
    win.focus();
    win.webContents.send('hotkey:ask-with-selection');
  });
  if (!askOk) console.error('failed to register hotkey', ACCELERATOR_ASK_SEL);
}

export function unregisterHotkeys() {
  globalShortcut.unregisterAll();
}

/**
 * Reregister the global wake hotkey with a new accelerator. Returns true on
 * success. If the new accelerator is already taken by another process,
 * returns false AND restores the previous accelerator.
 */
export function reregisterHotkey(newAccelerator: string): boolean {
  if (!currentGetWin) return false;
  const prev = currentAccelerator;
  globalShortcut.unregisterAll();
  try {
    const ok = registerWakeShortcut(newAccelerator, currentGetWin);
    if (ok) {
      currentAccelerator = newAccelerator;
      // Re-register the secondary shortcuts too — they were wiped by unregisterAll.
      globalShortcut.register(PANIC_ACCELERATOR, () => {
        currentGetWin?.()?.webContents.send('agent:panic');
      });
      globalShortcut.register(ACCELERATOR_ASK_SEL, async () => {
        await captureActiveWindow();
        const win = currentGetWin?.();
        if (!win) return;
        moveToActiveDisplay(win);
        if (!win.isVisible()) win.show();
        win.focus();
        win.webContents.send('hotkey:ask-with-selection');
      });
      return true;
    }
  } catch (e) {
    console.error('[hotkeys] reregister failed:', e);
  }
  // Failed — restore previous
  try {
    registerWakeShortcut(prev, currentGetWin);
    currentAccelerator = prev;
  } catch { /* swallow */ }
  return false;
}

/**
 * Returns whether a given accelerator is already registered by ANY app.
 * Used by the hotkey editor's conflict check.
 */
export function isAcceleratorInUse(accelerator: string): boolean {
  try {
    return globalShortcut.isRegistered(accelerator);
  } catch {
    return false;
  }
}
