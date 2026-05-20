import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;

export function createTray(
  getMascotWin: () => BrowserWindow | null,
  openConfig: () => void,
  openSettings: () => void,
) {
  const iconPath = path.join(__dirname, '../assets/sprites/icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Claude Buddy');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Acordar',
      click: () => {
        const win = getMascotWin();
        if (!win) return;
        if (!win.isVisible()) win.show();
        win.focus();
        win.webContents.send('hotkey:activate');
      },
    },
    { label: 'Settings…', click: openSettings },
    { label: 'Configurar API key', click: openConfig },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}
