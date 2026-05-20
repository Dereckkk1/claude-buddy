import { app, BrowserWindow, session, screen } from 'electron';
import path from 'node:path';
import { createMascotWindow } from './window-manager';
import { registerHandlers } from './ipc';
import {
  getApiKey, setApiKey, getPosition, setPosition,
  listMemories, addMemory, deleteMemory, clearMemories,
  getSettings, updateSettings,
} from './store';
import {
  initAgentsIfNeeded, listAgents, getActiveAgent, setActiveAgent,
  createAgent, updateAgent, deleteAgent,
  addMemoryToAgent, deleteMemoryFromAgent, clearMemoriesForAgent,
} from './agents';
import { captureScreenRegion } from './capture';
import { readClipboard } from './clipboard-watcher';
import { pasteToActiveWindow, captureActiveWindow, registerOwnHwnd, getLastForegroundHwnd, copyFromActiveWindow } from './keyboard';
import {
  getScreenshot, getScreenSize, moveMouse, mouseClick, doubleClick,
  typeText, pressKey, scroll, cursorPosition,
} from './automation';
import { pickAndParseFile } from './file-parser';
import { synthesize, VOICES } from './edge-tts';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { createTray, destroyTray } from './tray';
import { setupAutoUpdater } from './updater';

let mascotWin: BrowserWindow | null = null;
let configWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
const isDev = !app.isPackaged;
const startHidden = process.argv.includes('--hidden');

function createConfigWindow(): BrowserWindow {
  if (configWin) { configWin.focus(); return configWin; }
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
  configWin = win;
  win.on('closed', () => { configWin = null; });
  return win;
}

function createSettingsWindow(): BrowserWindow {
  if (settingsWin) { settingsWin.focus(); return settingsWin; }
  const win = new BrowserWindow({
    width: 760,
    height: 540,
    title: 'Claude Buddy — Settings',
    resizable: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}settings-window/index.html`);
  } else {
    win.loadFile('dist/settings-window/index.html');
  }
  settingsWin = win;
  win.on('closed', () => { settingsWin = null; });
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
  if (startHidden) mascotWin.hide();

  // Auto-updater (only effective in packaged builds with a publish provider configured)
  if (!isDev) setupAutoUpdater(() => mascotWin);

  // Track our own window handle so we never paste into ourselves
  const buf = mascotWin.getNativeWindowHandle();
  // hwnd is the first uint pointer-sized integer in the buffer
  const ownHwnd = process.arch === 'x64' ? buf.readBigUInt64LE(0).toString() : buf.readUInt32LE(0).toString();
  registerOwnHwnd(ownHwnd);
  console.log('[main] registered own mascot hwnd:', ownHwnd);

  // Capture target window whenever we lose focus (user clicked elsewhere)
  mascotWin.on('blur', () => {
    setTimeout(() => { captureActiveWindow(); }, 80);
  });

  registerHotkeys(() => mascotWin);
  createTray(() => mascotWin, () => createConfigWindow(), () => createSettingsWindow());

  // Poll foreground every 1.5s as a safety net.
  setInterval(() => { captureActiveWindow(); }, 1500);
}

function bootstrap() {
  // Migrate legacy memories into the Buddy agent on first run
  initAgentsIfNeeded(listMemories());

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'midi', 'audioCapture'];
    callback(allowed.includes(permission));
  });

  app.setLoginItemSettings({
    openAtLogin: true,
    args: ['--hidden'],
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
    'window:set-position': (pos) => {
      if (!mascotWin) return;
      const [w, h] = mascotWin.getSize();
      const display = screen.getDisplayNearestPoint({ x: pos.x, y: pos.y });
      const { x: minX, y: minY, width: dW, height: dH } = display.workArea;
      const clampedX = Math.max(minX, Math.min(minX + dW - w, pos.x));
      const clampedY = Math.max(minY, Math.min(minY + dH - h, pos.y));
      mascotWin.setPosition(clampedX, clampedY);
    },
    'window:set-size': (size) => {
      if (!mascotWin) return;
      const [curX, curY] = mascotWin.getPosition();
      const [curW, curH] = mascotWin.getSize();
      // Anchor bottom-right corner: shift x/y so the bottom-right stays put.
      let newX = curX + (curW - size.w);
      let newY = curY + (curH - size.h);
      // Clamp to the display containing the window
      const display = screen.getDisplayNearestPoint({ x: curX, y: curY });
      const { x: minX, y: minY, width: dW, height: dH } = display.workArea;
      newX = Math.max(minX, Math.min(minX + dW - size.w, newX));
      newY = Math.max(minY, Math.min(minY + dH - size.h, newY));
      mascotWin.setBounds({ x: newX, y: newY, width: size.w, height: size.h });
    },
    'capture:screen-region': async () => {
      mascotWin?.hide();
      await new Promise((r) => setTimeout(r, 150));
      const result = await captureScreenRegion();
      mascotWin?.show();
      return result;
    },
    'clipboard:read': () => readClipboard(),
    'agent:screen-size': () => getScreenSize(),
    'agent:screenshot': () => getScreenshot(),
    'agent:move-mouse': ({ x, y }) => moveMouse(x, y),
    'agent:click': ({ x, y, button }) => mouseClick(x, y, button),
    'agent:double-click': ({ x, y }) => doubleClick(x, y),
    'agent:type': (text) => typeText(text),
    'agent:key': (key) => pressKey(key),
    'agent:scroll': ({ x, y, direction, amount }) => scroll(x, y, direction, amount),
    'agent:cursor-position': () => cursorPosition(),
    'file:pick-and-parse': () => pickAndParseFile(),
    'memories:list': () => getActiveAgent().memories,
    'memories:add': (fact) => addMemoryToAgent(getActiveAgent().id, fact),
    'memories:delete': (i) => deleteMemoryFromAgent(getActiveAgent().id, i),
    'memories:clear': () => clearMemoriesForAgent(getActiveAgent().id),
    'agents:list': () => listAgents(),
    'agents:get-active': () => getActiveAgent(),
    'agents:set-active': (id) => {
      setActiveAgent(id);
      mascotWin?.webContents.send('agents:changed', getActiveAgent());
    },
    'agents:create': (input) => createAgent(input),
    'agents:update': ({ id, patch }) => updateAgent(id, patch),
    'agents:delete': (id) => deleteAgent(id),
    'settings:get': () => getSettings(),
    'settings:update': (patch) => {
      const next = updateSettings(patch);
      if ('autostart' in patch) {
        app.setLoginItemSettings({ openAtLogin: next.autostart, args: ['--hidden'] });
      }
      // Broadcast to mascot window so its local state stays in sync
      mascotWin?.webContents.send('settings:changed', next);
      return next;
    },
    'settings:open': () => { createSettingsWindow(); },
    'tts:synthesize': ({ text, voice }) => synthesize(text, voice),
    'tts:voices': () => VOICES,
    'keyboard:read-selection': async () => {
      console.log('[main] read-selection invoked, lastFg:', getLastForegroundHwnd());
      mascotWin?.blur();
      await new Promise((r) => setTimeout(r, 80));
      const result = await copyFromActiveWindow();
      console.log('[main] read-selection result length:', result?.length ?? 'null');
      return result;
    },
    'keyboard:paste-to-active': async (text) => {
      const target = getLastForegroundHwnd();
      console.log('[main] paste requested, target hwnd:', target);
      if (target === '0') {
        console.warn('[main] no target hwnd captured — paste will fail');
      }
      mascotWin?.blur();
      try {
        await pasteToActiveWindow(text);
      } catch (e) {
        console.error('[main] paste failed:', e);
      }
    },
  });

  if (!getApiKey()) {
    createConfigWindow();
  } else {
    startMascot();
  }
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // Keep app alive (tray remains)
});

app.on('will-quit', () => {
  unregisterHotkeys();
  destroyTray();
});
