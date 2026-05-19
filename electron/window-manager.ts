import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

const MASCOT_WIDTH = 400;
const MASCOT_HEIGHT = 300;
const MARGIN = 16;

export function createMascotWindow(savedPosition?: { x: number; y: number }): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workArea;
  const defaultX = display.workArea.x + screenW - MASCOT_WIDTH - MARGIN;
  const defaultY = display.workArea.y + screenH - MASCOT_HEIGHT - MARGIN;

  const win = new BrowserWindow({
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
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
