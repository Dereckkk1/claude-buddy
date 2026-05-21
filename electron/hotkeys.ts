import { globalShortcut, BrowserWindow, screen } from 'electron';
import { captureActiveWindow } from './keyboard';

const ACCELERATOR_WAKE = 'CommandOrControl+Shift+Space';
const ACCELERATOR_ASK_SEL = 'CommandOrControl+Shift+A';

const MARGIN = 12;

// Multi-monitor: when the hotkey fires, recalculate the display under the
// cursor and reposition the mascot to its bottom-right corner. Keeps the
// experience consistent when the user moves to a different screen.
function moveToActiveDisplay(win: BrowserWindow) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const [w, h] = win.getSize();
  const { x: minX, y: minY, width: dW, height: dH } = display.workArea;
  const x = minX + dW - w - MARGIN;
  const y = minY + dH - h - MARGIN;
  win.setBounds({ x, y, width: w, height: h });
}

export function registerHotkeys(getMascotWin: () => BrowserWindow | null) {
  const wakeOk = globalShortcut.register(ACCELERATOR_WAKE, () => {
    // Fire capture in the background — polling will also have done it.
    captureActiveWindow();
    const win = getMascotWin();
    if (!win) return;
    moveToActiveDisplay(win);
    if (!win.isVisible()) win.show();
    win.focus();
    win.webContents.send('hotkey:activate');
  });
  if (!wakeOk) console.error('failed to register hotkey', ACCELERATOR_WAKE);

  // Second shortcut: wake + immediately pull the selection from the previously
  // active app and feed it into the input. The capture call here is critical
  // because the user may have just selected text and then hit the shortcut.
  const askOk = globalShortcut.register(ACCELERATOR_ASK_SEL, async () => {
    // Wait for the foreground capture to finish so getLastForegroundHwnd is
    // correct when the renderer asks for the selection.
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
