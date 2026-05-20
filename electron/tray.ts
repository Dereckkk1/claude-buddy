import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';
import { translate } from '../shared/i18n-strings';
import { getSettings } from './store';

let tray: Tray | null = null;
// Cached callbacks so refreshTrayMenu() can rebuild the menu using the
// current locale without the caller having to pass them in again.
let cachedGetMascotWin: (() => BrowserWindow | null) | null = null;
let cachedOpenConfig: (() => void) | null = null;
let cachedOpenSettings: (() => void) | null = null;

function buildMenu(): Menu {
  const locale = getSettings().locale;
  const t = (key: string) => translate(locale, `tray.${key}`);
  return Menu.buildFromTemplate([
    {
      label: t('wake'),
      click: () => {
        const win = cachedGetMascotWin?.();
        if (!win) return;
        if (!win.isVisible()) win.show();
        win.focus();
        win.webContents.send('hotkey:activate');
      },
    },
    { label: t('settings'), click: () => cachedOpenSettings?.() },
    { label: t('configKey'), click: () => cachedOpenConfig?.() },
    { type: 'separator' },
    { label: t('quit'), click: () => app.quit() },
  ]);
}

export function createTray(
  getMascotWin: () => BrowserWindow | null,
  openConfig: () => void,
  openSettings: () => void,
) {
  cachedGetMascotWin = getMascotWin;
  cachedOpenConfig = openConfig;
  cachedOpenSettings = openSettings;

  const iconPath = path.join(__dirname, '../assets/sprites/icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Claude Buddy');
  tray.setContextMenu(buildMenu());
}

// Rebuild the menu with the current locale. Call this when settings.locale
// changes so the tray strings update without a relaunch.
export function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(buildMenu());
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}
