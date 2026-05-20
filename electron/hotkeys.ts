import { globalShortcut, BrowserWindow } from 'electron';
import { captureActiveWindow } from './keyboard';

const ACCELERATOR = 'CommandOrControl+Shift+Space';

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
}

export function unregisterHotkeys() {
  globalShortcut.unregisterAll();
}
