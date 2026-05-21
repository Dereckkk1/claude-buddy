import { app, BrowserWindow, session, screen, dialog } from 'electron';
import path from 'node:path';
import { stat as fsStat, readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises';
import { basename, resolve as resolvePath } from 'node:path';
import { translate } from '../shared/i18n-strings';
import {
  listFolder, readFile as readFileFs, pathIsWithin,
  countFolderEntries, readImageAsAttachment, isSensitiveFolder,
} from './files';
import { runPowerShell } from './shell';
import * as mcp from './mcp';
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
  listAllMemoriesByAgent, duplicateBuiltIn,
} from './agents';
import { captureScreenRegion } from './capture';
import { readClipboard } from './clipboard-watcher';
import { pasteToActiveWindow, captureActiveWindow, registerOwnHwnd, getLastForegroundHwnd, copyFromActiveWindow } from './keyboard';
import {
  getScreenshot, getScreenSize, moveMouse, mouseClick, doubleClick,
  typeText, pressKey, scroll, cursorPosition,
} from './automation';
import { pickAndParseFile } from './file-parser';
import { synthesize, getVoices, defaultVoiceFor, languageOfVoice } from './edge-tts';
import { registerHotkeys, unregisterHotkeys, reregisterHotkey, isAcceleratorInUse } from './hotkeys';
import { createTray, destroyTray, refreshTrayMenu } from './tray';
import { setupAutoUpdater } from './updater';

let mascotWin: BrowserWindow | null = null;
let configWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let attachedScope: string[] = []; // absolute paths the user has explicitly attached
const isDev = !app.isPackaged;
const startHidden = process.argv.includes('--hidden');

function createConfigWindow(): BrowserWindow {
  if (configWin) { configWin.focus(); return configWin; }
  const win = new BrowserWindow({
    width: 480,
    height: 320,
    resizable: false,
    title: 'Claude Buddy — Config',
    icon: path.join(__dirname, '../assets/sprites/icon.png'),
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
    icon: path.join(__dirname, '../assets/sprites/icon.png'),
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

  registerHotkeys(() => mascotWin, getSettings().hotkey);
  createTray(() => mascotWin, () => createConfigWindow(), () => createSettingsWindow());

  // Poll foreground every 1.5s as a safety net.
  setInterval(() => { captureActiveWindow(); }, 1500);
}

function bootstrap() {
  // Migrate legacy memories into the Buddy agent on first run
  initAgentsIfNeeded(listMemories());

  // MCP: kick off enabled servers in background (don't block bootstrap).
  // UI will see them flip from 'starting' to 'running' as they handshake.
  void mcp.startAllEnabled().catch((e) => console.error('[mcp] startAllEnabled:', e));
  // Broadcast MCP state changes to the mascot renderer so the tools cache
  // and the settings UI stay in sync without polling.
  mcp.onStatesChanged((states) => {
    mascotWin?.webContents.send('mcp:states-changed', states);
    settingsWin?.webContents.send('mcp:states-changed', states);
  });

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
    'files:set-scope': (paths) => {
      attachedScope = paths.map(p => resolvePath(p));
    },
    'files:list-folder': async ({ path: p, recursive }) => {
      if (!pathIsWithin(p, attachedScope)) {
        console.warn('[files] list-folder rejected (scope):', p, 'scope:', attachedScope);
        return { ok: false, error: `path not in attached scope: ${p}` };
      }
      try {
        const listing = await listFolder(p, { recursive });
        return { ok: true, listing };
      } catch (e) {
        console.error('[files] list-folder failed:', p, e);
        return { ok: false, error: e instanceof Error ? e.message : 'list failed' };
      }
    },
    'files:read-file': async ({ path: p }) => {
      if (!pathIsWithin(p, attachedScope)) {
        console.warn('[files] read-file rejected (scope):', p, 'scope:', attachedScope);
        return { ok: false, error: `path not in attached scope: ${p}` };
      }
      try {
        const content = await readFileFs(p);
        return { ok: true, content };
      } catch (e) {
        console.error('[files] read-file failed:', p, e);
        return { ok: false, error: e instanceof Error ? e.message : 'read failed' };
      }
    },
    'files:pick-folder': async () => {
      const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (r.canceled || !r.filePaths[0]) return null;
      const p = r.filePaths[0];
      const s = await fsStat(p).catch(() => null);
      const { entryCount, truncated } = await countFolderEntries(p).catch(() => ({ entryCount: 0, truncated: false }));
      const sensitive = isSensitiveFolder(p);
      return {
        path: p,
        name: basename(p),
        size: s?.size ?? 0,
        entryCount,
        truncated,
        sensitive,
      };
    },
    'files:read-image-as-attachment': async (filePath: string) => {
      try {
        return await readImageAsAttachment(filePath);
      } catch (e) {
        console.error('[files] read-image-as-attachment failed:', filePath, e);
        return null;
      }
    },
    'mcp:list-configs':   () => mcp.listConfigs(),
    'mcp:add-config':     (input) => mcp.addConfig(input),
    'mcp:update-config':  ({ id, patch }) => mcp.updateConfig(id, patch),
    'mcp:delete-config':  (id) => mcp.deleteConfig(id),
    'mcp:import-json':    (rawJson) => mcp.importJson(rawJson),
    'mcp:list-states':    () => mcp.getStates(),
    'mcp:restart-server': async (id) => { await mcp.restartServer(id); },
    'mcp:list-tools':     () => mcp.listAllTools(),
    'mcp:call-tool':      async ({ prefixedName, input }) => mcp.callTool(prefixedName, input),
    'mcp:test':           async (config) => mcp.testConfig(config),
    'mcp:get-stderr':     (id) => mcp.getServerErrorInfo(id),
    'shell:run-command': async ({ command, cwd, timeoutMs }) => {
      try {
        const result = await runPowerShell(command, cwd, timeoutMs);
        return { ok: true, result };
      } catch (e) {
        console.error('[shell] run failed:', e);
        return { ok: false, error: e instanceof Error ? e.message : 'spawn failed' };
      }
    },
    'files:resolve-dropped': async (paths) => {
      const out = [] as Array<{
        path: string; kind: 'file' | 'folder'; name: string; size: number;
        entryCount?: number; truncated?: boolean;
      }>;
      for (const p of paths) {
        const s = await fsStat(p).catch(() => null);
        if (!s) continue;
        if (s.isDirectory()) {
          const { entryCount, truncated } = await countFolderEntries(p).catch(() => ({ entryCount: 0, truncated: false }));
          out.push({
            path: p,
            kind: 'folder',
            name: basename(p),
            size: 0,
            entryCount,
            truncated,
          });
        } else {
          out.push({
            path: p,
            kind: 'file',
            name: basename(p),
            size: s.size,
          });
        }
      }
      return out;
    },
    'memories:list': () => getActiveAgent().memories,
    'memories:list-all': () => listAllMemoriesByAgent(),
    'memories:add': (fact) => addMemoryToAgent(getActiveAgent().id, fact),
    'memories:delete': (i) => deleteMemoryFromAgent(getActiveAgent().id, i),
    'memories:delete-by-index': ({ agentId, index }) => deleteMemoryFromAgent(agentId, index),
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
    'agents:duplicate-builtin': (agentId) => duplicateBuiltIn(agentId),
    'settings:get': () => getSettings(),
    'settings:update': (patch) => {
      // If the locale is changing AND the current voice belongs to a different
      // language, auto-switch the voice to the new locale's default. Without
      // this, switching UI to EN leaves the TTS reading English text with a
      // Portuguese accent (technically works, sounds odd).
      if (patch.locale) {
        const cur = getSettings();
        if (languageOfVoice(cur.ttsVoice) !== patch.locale) {
          patch = { ...patch, ttsVoice: defaultVoiceFor(patch.locale) };
        }
      }
      const next = updateSettings(patch);
      if ('autostart' in patch) {
        app.setLoginItemSettings({ openAtLogin: next.autostart, args: ['--hidden'] });
      }
      // Broadcast to every open renderer so all UIs (mascot + settings window)
      // stay in sync — i18n strings re-translate as soon as the locale lands.
      const broadcast = (channel: string, payload: unknown) => {
        mascotWin?.webContents.send(channel, payload);
        settingsWin?.webContents.send(channel, payload);
      };
      broadcast('settings:changed', next);
      // Locale changes also relocalize built-in agents (names + prompts come
      // from the i18n dict) and the tray context menu. Push a fresh active
      // agent and rebuild the tray so everything follows the new language.
      if ('locale' in patch) {
        broadcast('agents:changed', getActiveAgent());
        refreshTrayMenu();
      }
      // Hotkey change → reregister the global shortcut without restarting.
      if ('hotkey' in patch && typeof patch.hotkey === 'string') {
        const ok = reregisterHotkey(patch.hotkey);
        if (!ok) console.warn('[main] hotkey reregister failed for', patch.hotkey);
      }
      return next;
    },
    'settings:open': () => { createSettingsWindow(); },
    'settings:export': async () => {
      try {
        const r = await dialog.showSaveDialog({
          title: 'Export Claude Buddy settings',
          defaultPath: `claude-buddy-settings-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (r.canceled || !r.filePath) return { ok: false };
        const settings = getSettings();
        const agents = listAgents();
        const mcpConfigs = mcp.listConfigs();
        // Strip env vars (may contain secrets) but keep command + args so users
        // can transplant configs and re-fill env on the new machine.
        const exportObj = {
          version: '1.0',
          exportedAt: Date.now(),
          settings,
          agents,
          mcp: mcpConfigs.map((c) => ({
            name: c.name,
            command: c.command,
            args: c.args,
            enabled: c.enabled,
          })),
        };
        await fsWriteFile(r.filePath, JSON.stringify(exportObj, null, 2), 'utf8');
        return { ok: true, path: r.filePath };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'export failed' };
      }
    },
    'settings:import': async () => {
      try {
        const r = await dialog.showOpenDialog({
          title: 'Import Claude Buddy settings',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile'],
        });
        if (r.canceled || !r.filePaths[0]) return { ok: false };
        const raw = await fsReadFile(r.filePaths[0], 'utf8');
        const parsed = JSON.parse(raw) as {
          settings?: Partial<ReturnType<typeof getSettings>>;
          agents?: Array<{ name: string; emoji: string; systemPrompt: string; model: 'auto' | 'haiku' | 'sonnet'; isBuiltIn?: boolean; sharedMemories?: boolean }>;
          mcp?: Array<{ name: string; command: string; args: string[]; enabled: boolean }>;
        };
        // Merge settings (keep apiKey-bearing concerns out — settings has no apiKey)
        if (parsed.settings) {
          updateSettings(parsed.settings);
        }
        // Add CUSTOM agents only — never overwrite built-ins
        if (Array.isArray(parsed.agents)) {
          for (const a of parsed.agents) {
            if (a.isBuiltIn) continue;
            createAgent({
              name: a.name,
              emoji: a.emoji,
              systemPrompt: a.systemPrompt,
              model: a.model,
              sharedMemories: a.sharedMemories,
            });
          }
        }
        // Add MCP configs with empty env (user must re-fill secrets)
        if (Array.isArray(parsed.mcp)) {
          for (const c of parsed.mcp) {
            mcp.addConfig({
              name: c.name,
              command: c.command,
              args: c.args,
              env: {},
              enabled: false, // start disabled — env is empty, user reviews first
            });
          }
        }
        // Broadcast fresh state so UIs reflect the import
        mascotWin?.webContents.send('agents:changed', getActiveAgent());
        mascotWin?.webContents.send('settings:changed', getSettings());
        settingsWin?.webContents.send('settings:changed', getSettings());
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'import failed' };
      }
    },
    'hotkey:test': (combo) => {
      try {
        // Empty / obviously invalid accelerators fail registration too.
        if (!combo || combo.trim().length === 0) return { ok: false, reason: 'invalid' };
        const inUse = isAcceleratorInUse(combo);
        // The current hotkey IS registered by us — that's not a conflict.
        if (inUse && combo !== getSettings().hotkey) {
          return { ok: false, reason: 'in-use' };
        }
        return { ok: true };
      } catch {
        return { ok: false, reason: 'invalid' };
      }
    },
    'tts:synthesize': ({ text, voice }) => synthesize(text, voice),
    'tts:voices': () => getVoices(),
    'tts:preview': async ({ voice }) => {
      // Pull a localized one-liner so the preview matches the chosen voice's
      // language reasonably (the voice may not match the UI locale, but it's
      // the cleanest default we can give without a per-voice phrase table).
      const phrase = translate(getSettings().locale, 'settings.ttsPreviewPhrase');
      return synthesize(phrase, voice);
    },
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

app.on('will-quit', (event) => {
  // Give MCP servers up to 3s to shut down cleanly
  event.preventDefault();
  const cleanup = (async () => {
    try {
      await Promise.race([
        mcp.stopAll(),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    } catch { /* swallow */ }
    unregisterHotkeys();
    destroyTray();
    app.exit(0);
  });
  void cleanup();
});
