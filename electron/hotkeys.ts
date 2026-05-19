import { globalShortcut, BrowserWindow } from 'electron';

const ACCELERATOR = 'CommandOrControl+Shift+Space';

export function registerHotkeys(getMascotWin: () => BrowserWindow | null) {
  const success = globalShortcut.register(ACCELERATOR, () => {
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
