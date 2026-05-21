import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

export const MASCOT_COLLAPSED = { w: 200, h: 110 };
export const MASCOT_EXPANDED = { w: 560, h: 380 };
const MARGIN = 12;

export function createMascotWindow(savedPosition?: { x: number; y: number }): BrowserWindow {
  // Pick whichever display the cursor is on so multi-monitor users don't end
  // up with the mascot landing on the wrong screen on first launch.
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { width: screenW, height: screenH } = display.workArea;
  const defaultX = display.workArea.x + screenW - MASCOT_COLLAPSED.w - MARGIN;
  const defaultY = display.workArea.y + screenH - MASCOT_COLLAPSED.h - MARGIN;

  const win = new BrowserWindow({
    width: MASCOT_COLLAPSED.w,
    height: MASCOT_COLLAPSED.h,
    x: savedPosition?.x ?? defaultX,
    y: savedPosition?.y ?? defaultY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  return win;
}
