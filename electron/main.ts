import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { createMascotWindow } from './window-manager';
import { registerHandlers } from './ipc';
import { getApiKey, setApiKey, getPosition, setPosition } from './store';
import { captureScreenRegion } from './capture';
import { readClipboard } from './clipboard-watcher';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';

let mascotWin: BrowserWindow | null = null;
let configWin: BrowserWindow | null = null;
const isDev = !app.isPackaged;

function createConfigWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 320,
    resizable: false,
    title: 'Claude Buddy — Config',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}config-window/index.html`);
  } else {
    win.loadFile('dist/config-window/index.html');
  }
  return win;
}

function startMascot() {
  if (mascotWin) return;
  const savedPos = getPosition() ?? undefined;
  mascotWin = createMascotWindow(savedPos);
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mascotWin.loadURL(process.env.VITE_DEV_SERVER_URL);
    mascotWin.webContents.openDevTools({ mode: 'detach' });
  } else {
    mascotWin.loadFile('dist/index.html');
  }
  mascotWin.on('closed', () => { mascotWin = null; });
  registerHotkeys(() => mascotWin);
}

function bootstrap() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'midi', 'audioCapture'];
    callback(allowed.includes(permission));
  });

  registerHandlers({
    'config:get-api-key': () => getApiKey(),
    'config:set-api-key': (key) => {
      setApiKey(key);
      if (!mascotWin) startMascot();
    },
    'position:get': () => getPosition(),
    'position:set': (pos) => setPosition(pos),
    'window:show': () => { mascotWin?.show(); },
    'window:hide': () => { mascotWin?.hide(); },
    'window:get-position': () => {
      const [x, y] = mascotWin?.getPosition() ?? [0, 0];
      return { x, y };
    },
    'window:set-position': (pos) => { mascotWin?.setPosition(pos.x, pos.y); },
    'capture:screen-region': async () => {
      mascotWin?.hide();
      await new Promise((r) => setTimeout(r, 150));
      const result = await captureScreenRegion();
      mascotWin?.show();
      return result;
    },
    'clipboard:read': () => readClipboard(),
  });

  if (!getApiKey()) {
    configWin = createConfigWindow();
    configWin.on('closed', () => { configWin = null; });
  } else {
    startMascot();
  }
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  unregisterHotkeys();
});
