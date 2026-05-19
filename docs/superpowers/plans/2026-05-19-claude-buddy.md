# Claude Buddy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop pixel-art mascot that lives in the screen corner, sleeps until activated, and answers questions via Claude Haiku 4.5 (text + voice input, image + clipboard context).

**Architecture:** Electron + TypeScript + React. Main process owns OS-touching code (windows, hotkeys, screen capture, storage). Renderer owns UI, sprite animation, and Claude API calls. Single-user, local-only, ephemeral conversation state.

**Tech Stack:** Electron 28+, TypeScript, React 18, Vite, vite-plugin-electron, zustand, @anthropic-ai/sdk, electron-store, vitest, electron-builder.

**Spec:** `docs/superpowers/specs/2026-05-19-claude-buddy-design.md`

---

## File Structure Overview

```
claude-buddy/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── electron-builder.yml
├── .gitignore                (already exists)
├── index.html                (renderer entry HTML)
├── config-window/
│   ├── index.html
│   └── ConfigApp.tsx
├── electron/
│   ├── main.ts
│   ├── window-manager.ts
│   ├── hotkeys.ts
│   ├── capture.ts
│   ├── clipboard-watcher.ts
│   ├── store.ts
│   ├── tray.ts
│   ├── ipc.ts
│   └── preload.ts
├── shared/
│   └── ipc-types.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.css
│   ├── components/
│   │   ├── Mascot.tsx
│   │   ├── SpeechBubble.tsx
│   │   ├── InputPanel.tsx
│   │   ├── AttachmentChip.tsx
│   │   └── ResponseView.tsx
│   ├── hooks/
│   │   ├── useSpriteAnimation.ts
│   │   ├── useSpeechToText.ts
│   │   └── useDrag.ts
│   ├── services/
│   │   ├── claude.ts
│   │   ├── ipc.ts
│   │   └── sprite-animator.ts
│   └── state/
│       └── conversation.ts
├── assets/sprites/
│   ├── placeholder.png       (single-frame placeholder)
│   └── sprites.json          (descriptor for spritesheets)
└── tests/
    ├── sprite-animator.test.ts
    ├── claude.test.ts
    └── conversation.test.ts
```

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: Initialize package.json**

Run in `C:/Users/marke/Desktop/Programas/claude-buddy`:

```bash
npm init -y
```

Then overwrite `package.json` with:

```json
{
  "name": "claude-buddy",
  "version": "0.1.0",
  "description": "Pixel-art desktop mascot powered by Claude",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "preview": "vite preview",
    "package": "npm run build && electron-builder"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vite-plugin-electron": "^0.28.0",
    "vite-plugin-electron-renderer": "^0.14.5",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "electron-store": "^10.0.0",
    "node-machine-id": "^1.1.12",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^5.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: completes without errors, `node_modules/` created.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["src", "shared", "tests", "config-window"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "electron/**/*.ts"]
}
```

- [ ] **Step 5: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main.ts' },
      preload: { input: 'electron/preload.ts' },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
```

- [ ] **Step 6: Create index.html (renderer entry)**

```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude Buddy</title>
  </head>
  <body style="margin:0;padding:0;background:transparent;overflow:hidden">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create src/main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 8: Create src/App.tsx (smoke placeholder)**

```typescript
export default function App() {
  return (
    <div style={{ color: 'white', padding: 20 }}>
      Claude Buddy bootstrapped
    </div>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git init
git add .
git commit -m "chore: bootstrap electron+vite+react+ts project"
```

---

## Task 2: Minimal Electron Main Process

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`

- [ ] **Step 1: Create electron/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_e, ...args) => listener(...args));
  },
  off: (channel: string) => ipcRenderer.removeAllListeners(channel),
});
```

- [ ] **Step 2: Create electron/main.ts (minimal window)**

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

const isDev = !app.isPackaged;

function createMascotWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 300,
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

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createMascotWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: Run dev server to smoke test**

```bash
npm run dev
```

Expected: Electron window opens with a transparent background and the text "Claude Buddy bootstrapped" visible. Close it with Alt+F4 (no title bar).

- [ ] **Step 4: Commit**

```bash
git add electron/ vite.config.ts
git commit -m "feat: minimal electron main process with transparent always-on-top window"
```

---

## Task 3: Position Window in Bottom-Right Corner

**Files:**
- Create: `electron/window-manager.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Create electron/window-manager.ts**

```typescript
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
```

- [ ] **Step 2: Update electron/main.ts to use window-manager**

Replace the contents with:

```typescript
import { app, BrowserWindow } from 'electron';
import { createMascotWindow } from './window-manager';

let mascotWin: BrowserWindow | null = null;
const isDev = !app.isPackaged;

function bootstrap() {
  mascotWin = createMascotWindow();
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mascotWin.loadURL(process.env.VITE_DEV_SERVER_URL);
    mascotWin.webContents.openDevTools({ mode: 'detach' });
  } else {
    mascotWin.loadFile('dist/index.html');
  }
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

Expected: Window appears in bottom-right corner of the primary monitor.

- [ ] **Step 4: Commit**

```bash
git add electron/
git commit -m "feat: position mascot window in bottom-right corner"
```

---

## Task 4: SpriteAnimator (TDD)

**Files:**
- Create: `src/services/sprite-animator.ts`
- Create: `tests/sprite-animator.test.ts`
- Create: `assets/sprites/sprites.json`
- Create: `assets/sprites/placeholder.png` (manual step described below)

- [ ] **Step 1: Configure vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
```

- [ ] **Step 2: Write failing tests in tests/sprite-animator.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpriteAnimator, type SpriteSheetDescriptor } from '@/services/sprite-animator';

const descriptor: SpriteSheetDescriptor = {
  states: {
    sleeping: { frames: 4, fps: 2, loop: true, nextState: null },
    waking:   { frames: 8, fps: 13, loop: false, nextState: 'idle' },
    idle:     { frames: 6, fps: 4, loop: true, nextState: null },
    thinking: { frames: 4, fps: 6, loop: true, nextState: null },
    talking:  { frames: 3, fps: 8, loop: true, nextState: null },
  },
};

describe('SpriteAnimator', () => {
  let animator: SpriteAnimator;
  beforeEach(() => {
    animator = new SpriteAnimator(descriptor);
  });

  it('starts in sleeping state at frame 0', () => {
    expect(animator.getState()).toBe('sleeping');
    expect(animator.getFrame()).toBe(0);
  });

  it('advances frames based on elapsed time and fps', () => {
    animator.setState('idle'); // 4 fps -> 250ms/frame
    animator.tick(0);
    expect(animator.getFrame()).toBe(0);
    animator.tick(250);
    expect(animator.getFrame()).toBe(1);
    animator.tick(500);
    expect(animator.getFrame()).toBe(2);
  });

  it('loops back to frame 0 after last frame when loop=true', () => {
    animator.setState('sleeping'); // 4 frames, 2 fps -> 500ms/frame
    animator.tick(0);
    animator.tick(500); // frame 1
    animator.tick(1000); // frame 2
    animator.tick(1500); // frame 3
    animator.tick(2000); // wraps to frame 0
    expect(animator.getFrame()).toBe(0);
  });

  it('auto-transitions to nextState when one-shot animation ends', () => {
    animator.setState('waking'); // 8 frames, 13 fps -> ~77ms/frame, total ~615ms
    animator.tick(0);
    animator.tick(700);
    expect(animator.getState()).toBe('idle');
  });

  it('resets frame to 0 when state changes', () => {
    animator.setState('idle');
    animator.tick(0);
    animator.tick(250);
    expect(animator.getFrame()).toBe(1);
    animator.setState('thinking');
    expect(animator.getFrame()).toBe(0);
  });

  it('emits onStateChange callback when state changes', () => {
    const cb = vi.fn();
    animator.onStateChange(cb);
    animator.setState('idle');
    expect(cb).toHaveBeenCalledWith('idle', 'sleeping');
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
npm test
```

Expected: All tests fail with "Cannot find module '@/services/sprite-animator'".

- [ ] **Step 4: Implement src/services/sprite-animator.ts**

```typescript
export type SpriteState = 'sleeping' | 'waking' | 'idle' | 'thinking' | 'talking';

export interface StateDef {
  frames: number;
  fps: number;
  loop: boolean;
  nextState: SpriteState | null;
}

export interface SpriteSheetDescriptor {
  states: Record<SpriteState, StateDef>;
}

type StateChangeListener = (to: SpriteState, from: SpriteState) => void;

export class SpriteAnimator {
  private state: SpriteState = 'sleeping';
  private frame = 0;
  private stateStartMs = 0;
  private listeners: StateChangeListener[] = [];

  constructor(private descriptor: SpriteSheetDescriptor) {}

  getState(): SpriteState { return this.state; }
  getFrame(): number { return this.frame; }

  setState(next: SpriteState): void {
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    this.frame = 0;
    this.stateStartMs = 0;
    this.listeners.forEach(cb => cb(next, prev));
  }

  onStateChange(cb: StateChangeListener): void {
    this.listeners.push(cb);
  }

  tick(nowMs: number): void {
    const def = this.descriptor.states[this.state];
    if (this.stateStartMs === 0) this.stateStartMs = nowMs;
    const elapsed = nowMs - this.stateStartMs;
    const frameDuration = 1000 / def.fps;
    const rawFrame = Math.floor(elapsed / frameDuration);

    if (def.loop) {
      this.frame = rawFrame % def.frames;
    } else if (rawFrame >= def.frames) {
      if (def.nextState) {
        this.setState(def.nextState);
        this.stateStartMs = nowMs;
      } else {
        this.frame = def.frames - 1;
      }
    } else {
      this.frame = rawFrame;
    }
  }
}
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
npm test
```

Expected: All 6 tests pass.

- [ ] **Step 6: Create assets/sprites/sprites.json**

```json
{
  "sleeping": { "src": "placeholder.png", "frames": 4, "fps": 2, "loop": true, "nextState": null, "frameWidth": 128, "frameHeight": 128 },
  "waking":   { "src": "placeholder.png", "frames": 8, "fps": 13, "loop": false, "nextState": "idle", "frameWidth": 128, "frameHeight": 128 },
  "idle":     { "src": "placeholder.png", "frames": 6, "fps": 4, "loop": true, "nextState": null, "frameWidth": 128, "frameHeight": 128 },
  "thinking": { "src": "placeholder.png", "frames": 4, "fps": 6, "loop": true, "nextState": null, "frameWidth": 128, "frameHeight": 128 },
  "talking":  { "src": "placeholder.png", "frames": 3, "fps": 8, "loop": true, "nextState": null, "frameWidth": 128, "frameHeight": 128 }
}
```

- [ ] **Step 7: Create placeholder PNG (manual)**

Save any 128×128 PNG of a crab (download from Wikimedia or use a 🦀 emoji rendered to PNG) at `assets/sprites/placeholder.png`. For now, all states render the same image — that's fine.

A quick way: open paint, draw an orange square, save as `placeholder.png` 128×128. Real sprites come later.

- [ ] **Step 8: Commit**

```bash
git add src/services/sprite-animator.ts tests/sprite-animator.test.ts assets/ vitest.config.ts
git commit -m "feat: sprite animator with state machine + tests"
```

---

## Task 5: Mascot Component (Canvas Renderer)

**Files:**
- Create: `src/hooks/useSpriteAnimation.ts`
- Create: `src/components/Mascot.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create src/hooks/useSpriteAnimation.ts**

```typescript
import { useEffect, useRef, useState } from 'react';
import { SpriteAnimator, type SpriteSheetDescriptor, type SpriteState } from '@/services/sprite-animator';

export function useSpriteAnimation(descriptor: SpriteSheetDescriptor) {
  const animatorRef = useRef<SpriteAnimator>(new SpriteAnimator(descriptor));
  const [state, setState] = useState<SpriteState>('sleeping');
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const animator = animatorRef.current;
    animator.onStateChange((to) => setState(to));

    let rafId: number;
    function loop(t: number) {
      animator.tick(t);
      setFrame(animator.getFrame());
      setState(animator.getState());
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return {
    state,
    frame,
    setState: (s: SpriteState) => animatorRef.current.setState(s),
  };
}
```

- [ ] **Step 2: Create src/components/Mascot.tsx**

```typescript
import { useEffect, useRef } from 'react';
import { useSpriteAnimation } from '@/hooks/useSpriteAnimation';
import type { SpriteState, SpriteSheetDescriptor } from '@/services/sprite-animator';
import spritesJson from '../../assets/sprites/sprites.json';

const descriptor: SpriteSheetDescriptor = {
  states: Object.fromEntries(
    Object.entries(spritesJson).map(([k, v]) => [k, {
      frames: v.frames, fps: v.fps, loop: v.loop, nextState: v.nextState as SpriteState | null,
    }])
  ) as SpriteSheetDescriptor['states'],
};

const SPRITE_SIZE = 64;
const SOURCE_SIZE = 128;

interface Props {
  state: SpriteState;
  onClick?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export function Mascot({ state, onClick, onMouseDown }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { state: currentState, frame, setState } = useSpriteAnimation(descriptor);

  useEffect(() => {
    setState(state);
  }, [state, setState]);

  useEffect(() => {
    const img = new Image();
    img.src = new URL(`../../assets/sprites/${spritesJson[currentState].src}`, import.meta.url).href;
    img.onload = () => { imgRef.current = img; };
  }, [currentState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    const cfg = spritesJson[currentState];
    const sx = (frame % cfg.frames) * cfg.frameWidth;
    ctx.drawImage(img, sx, 0, cfg.frameWidth, cfg.frameHeight, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
  }, [frame, currentState]);

  return (
    <canvas
      ref={canvasRef}
      width={SPRITE_SIZE}
      height={SPRITE_SIZE}
      onClick={onClick}
      onMouseDown={onMouseDown}
      style={{ cursor: 'pointer', imageRendering: 'pixelated' }}
    />
  );
}
```

- [ ] **Step 3: Update src/App.tsx to show Mascot**

```typescript
import { useState } from 'react';
import { Mascot } from './components/Mascot';
import type { SpriteState } from './services/sprite-animator';

export default function App() {
  const [state, setState] = useState<SpriteState>('sleeping');

  const handleClick = () => {
    if (state === 'sleeping') setState('waking');
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      width: 400,
      height: 300,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      padding: 16,
    }}>
      <Mascot state={state} onClick={handleClick} />
    </div>
  );
}
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Expected: Mascot appears in bottom-right of the window. Clicking it transitions sleeping → waking → idle automatically.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: mascot canvas component with sprite animation"
```

---

## Task 6: Speech Bubble Component

**Files:**
- Create: `src/components/SpeechBubble.tsx`
- Create: `src/App.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create src/App.css**

```css
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; }

.bubble {
  background: #fff;
  color: #1a1a2e;
  border-radius: 16px;
  padding: 12px 14px;
  width: 320px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  position: relative;
  font-size: 14px;
  line-height: 1.4;
}
.bubble::after {
  content: "";
  position: absolute;
  bottom: -10px;
  right: 30px;
  width: 0; height: 0;
  border: 10px solid transparent;
  border-top-color: #fff;
}
.bubble-title {
  color: #ff6b35;
  font-weight: bold;
  margin: 0 0 6px 0;
  font-size: 14px;
}
```

- [ ] **Step 2: Create src/components/SpeechBubble.tsx**

```typescript
import type { ReactNode } from 'react';

interface Props {
  title?: string;
  children: ReactNode;
}

export function SpeechBubble({ title, children }: Props) {
  return (
    <div className="bubble">
      {title && <div className="bubble-title">{title}</div>}
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Update src/App.tsx to show bubble when not sleeping**

```typescript
import { useState } from 'react';
import { Mascot } from './components/Mascot';
import { SpeechBubble } from './components/SpeechBubble';
import type { SpriteState } from './services/sprite-animator';
import './App.css';

export default function App() {
  const [state, setState] = useState<SpriteState>('sleeping');

  const handleClick = () => {
    if (state === 'sleeping') setState('waking');
  };

  const handleOk = () => setState('sleeping');

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0, width: 400, height: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      gap: 8, padding: 16,
    }}>
      {state !== 'sleeping' && (
        <SpeechBubble title="como posso ajudar?">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleOk}>OK</button>
          </div>
        </SpeechBubble>
      )}
      <Mascot state={state} onClick={handleClick} />
    </div>
  );
}
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Expected: Click mascot → bubble appears with "como posso ajudar?" title and OK button. Click OK → bubble disappears, mascot sleeps.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: speech bubble component"
```

---

## Task 7: Conversation State Store (TDD)

**Files:**
- Create: `src/state/conversation.ts`
- Create: `tests/conversation.test.ts`

- [ ] **Step 1: Write failing tests in tests/conversation.test.ts**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useConversation } from '@/state/conversation';

describe('conversation store', () => {
  beforeEach(() => {
    useConversation.getState().reset();
  });

  it('starts with empty messages and no attachments', () => {
    const s = useConversation.getState();
    expect(s.messages).toEqual([]);
    expect(s.attachments).toEqual([]);
    expect(s.status).toBe('idle');
  });

  it('appends a user message', () => {
    useConversation.getState().addUserMessage('hello');
    expect(useConversation.getState().messages).toEqual([
      { role: 'user', content: 'hello' },
    ]);
  });

  it('appends and streams assistant text', () => {
    useConversation.getState().beginAssistantMessage();
    useConversation.getState().appendAssistantChunk('hel');
    useConversation.getState().appendAssistantChunk('lo');
    const msgs = useConversation.getState().messages;
    expect(msgs).toEqual([{ role: 'assistant', content: 'hello' }]);
  });

  it('adds and removes attachments', () => {
    const s = useConversation.getState();
    s.addAttachment({ kind: 'text', content: 'foo' });
    s.addAttachment({ kind: 'image', mimeType: 'image/png', base64: 'abc' });
    expect(s.attachments.length).toBe(0); // getState() is snapshot — use fresh read
    const fresh = useConversation.getState();
    expect(fresh.attachments.length).toBe(2);
    fresh.removeAttachment(0);
    expect(useConversation.getState().attachments.length).toBe(1);
  });

  it('reset clears everything', () => {
    const s = useConversation.getState();
    s.addUserMessage('x');
    s.addAttachment({ kind: 'text', content: 'y' });
    s.setStatus('thinking');
    s.reset();
    const fresh = useConversation.getState();
    expect(fresh.messages).toEqual([]);
    expect(fresh.attachments).toEqual([]);
    expect(fresh.status).toBe('idle');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: tests fail because `@/state/conversation` does not exist.

- [ ] **Step 3: Implement src/state/conversation.ts**

```typescript
import { create } from 'zustand';

export type Status = 'idle' | 'thinking' | 'talking' | 'error';

export type Attachment =
  | { kind: 'text'; content: string }
  | { kind: 'image'; mimeType: string; base64: string };

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationState {
  messages: Message[];
  attachments: Attachment[];
  status: Status;
  error: string | null;

  addUserMessage: (text: string) => void;
  beginAssistantMessage: () => void;
  appendAssistantChunk: (chunk: string) => void;
  addAttachment: (a: Attachment) => void;
  removeAttachment: (index: number) => void;
  setStatus: (s: Status) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useConversation = create<ConversationState>((set) => ({
  messages: [],
  attachments: [],
  status: 'idle',
  error: null,

  addUserMessage: (text) =>
    set((s) => ({ messages: [...s.messages, { role: 'user', content: text }] })),

  beginAssistantMessage: () =>
    set((s) => ({ messages: [...s.messages, { role: 'assistant', content: '' }] })),

  appendAssistantChunk: (chunk) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
      }
      return { messages: msgs };
    }),

  addAttachment: (a) => set((s) => ({ attachments: [...s.attachments, a] })),

  removeAttachment: (i) =>
    set((s) => ({ attachments: s.attachments.filter((_, idx) => idx !== i) })),

  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),

  reset: () => set({ messages: [], attachments: [], status: 'idle', error: null }),
}));
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test
```

Expected: all 5 conversation tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/state tests/conversation.test.ts
git commit -m "feat: ephemeral conversation store with zustand"
```

---

## Task 8: IPC Type Contract

**Files:**
- Create: `shared/ipc-types.ts`
- Create: `electron/ipc.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Create shared/ipc-types.ts**

```typescript
export interface IpcRequests {
  'config:get-api-key': () => string | null;
  'config:set-api-key': (key: string) => void;
  'position:get': () => { x: number; y: number } | null;
  'position:set': (pos: { x: number; y: number }) => void;
  'capture:screen-region': () => { mimeType: string; base64: string } | null;
  'clipboard:read': () => { kind: 'text'; content: string } | { kind: 'image'; mimeType: string; base64: string } | null;
  'window:show': () => void;
  'window:hide': () => void;
}

export interface IpcEvents {
  'hotkey:activate': void;
}

export type IpcChannel = keyof IpcRequests;
```

- [ ] **Step 2: Create electron/ipc.ts (stub registrations)**

```typescript
import { ipcMain } from 'electron';
import type { IpcRequests } from '../shared/ipc-types';

type Handlers = { [K in keyof IpcRequests]: (...args: Parameters<IpcRequests[K]>) => ReturnType<IpcRequests[K]> | Promise<ReturnType<IpcRequests[K]>> };

export function registerHandlers(handlers: Partial<Handlers>) {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_e, ...args) => (handler as (...a: unknown[]) => unknown)(...args));
  }
}
```

- [ ] **Step 3: Update electron/preload.ts with typed bridge**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRequests } from '../shared/ipc-types';

const api = {
  invoke: <K extends keyof IpcRequests>(channel: K, ...args: Parameters<IpcRequests[K]>): Promise<ReturnType<IpcRequests[K]>> =>
    ipcRenderer.invoke(channel, ...args) as Promise<ReturnType<IpcRequests[K]>>,
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_e, ...args) => listener(...args));
  },
  off: (channel: string) => ipcRenderer.removeAllListeners(channel),
};

contextBridge.exposeInMainWorld('electronAPI', api);

declare global {
  interface Window {
    electronAPI: typeof api;
  }
}
```

- [ ] **Step 4: Create src/services/ipc.ts (renderer wrapper)**

```typescript
import type { IpcRequests } from '@shared/ipc-types';

export function invoke<K extends keyof IpcRequests>(
  channel: K,
  ...args: Parameters<IpcRequests[K]>
): Promise<ReturnType<IpcRequests[K]>> {
  return window.electronAPI.invoke(channel, ...args);
}

export function on(channel: string, listener: (...args: unknown[]) => void) {
  window.electronAPI.on(channel, listener);
}

export function off(channel: string) {
  window.electronAPI.off(channel);
}
```

- [ ] **Step 5: Wire registerHandlers in electron/main.ts with a stub**

Replace `electron/main.ts` contents with:

```typescript
import { app, BrowserWindow } from 'electron';
import { createMascotWindow } from './window-manager';
import { registerHandlers } from './ipc';

let mascotWin: BrowserWindow | null = null;
const isDev = !app.isPackaged;

function bootstrap() {
  registerHandlers({
    'window:show': () => { mascotWin?.show(); },
    'window:hide': () => { mascotWin?.hide(); },
  });

  mascotWin = createMascotWindow();
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mascotWin.loadURL(process.env.VITE_DEV_SERVER_URL);
    mascotWin.webContents.openDevTools({ mode: 'detach' });
  } else {
    mascotWin.loadFile('dist/index.html');
  }
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 6: Smoke test**

```bash
npm run dev
```

Expected: no errors in console, mascot still renders.

- [ ] **Step 7: Commit**

```bash
git add electron/ shared/ src/services/ipc.ts
git commit -m "feat: typed IPC contract main<->renderer"
```

---

## Task 9: Persistent Store (electron-store)

**Files:**
- Create: `electron/store.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Create electron/store.ts**

```typescript
import Store from 'electron-store';
import { machineIdSync } from 'node-machine-id';

interface Schema {
  apiKey?: string;
  position?: { x: number; y: number };
}

const encryptionKey = machineIdSync(true).slice(0, 32);

export const store = new Store<Schema>({
  name: 'claude-buddy',
  encryptionKey,
  defaults: {},
});

export function getApiKey(): string | null {
  return store.get('apiKey') ?? null;
}

export function setApiKey(key: string): void {
  store.set('apiKey', key);
}

export function getPosition(): { x: number; y: number } | null {
  return store.get('position') ?? null;
}

export function setPosition(pos: { x: number; y: number }): void {
  store.set('position', pos);
}
```

- [ ] **Step 2: Wire store handlers in electron/main.ts**

Replace `registerHandlers({...})` block with:

```typescript
import { getApiKey, setApiKey, getPosition, setPosition } from './store';

// ... inside bootstrap():
registerHandlers({
  'config:get-api-key': () => getApiKey(),
  'config:set-api-key': (key) => setApiKey(key),
  'position:get': () => getPosition(),
  'position:set': (pos) => setPosition(pos),
  'window:show': () => { mascotWin?.show(); },
  'window:hide': () => { mascotWin?.hide(); },
});
```

Also update `createMascotWindow()` call to pass saved position:

```typescript
const savedPos = getPosition() ?? undefined;
mascotWin = createMascotWindow(savedPos);
```

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

Expected: no errors. Verify file `%APPDATA%/claude-buddy/config.json` was created.

- [ ] **Step 4: Commit**

```bash
git add electron/
git commit -m "feat: encrypted electron-store for api key and window position"
```

---

## Task 10: API Key Config Window

**Files:**
- Create: `config-window/index.html`
- Create: `config-window/ConfigApp.tsx`
- Create: `config-window/main.tsx`
- Modify: `electron/main.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Update vite.config.ts to add second renderer entry**

Replace `vite.config.ts` with:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main.ts' },
      preload: { input: 'electron/preload.ts' },
      renderer: {},
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        config: path.resolve(__dirname, 'config-window/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
```

- [ ] **Step 2: Create config-window/index.html**

```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Claude Buddy — Config</title>
    <style>
      body { font-family: 'Segoe UI', system-ui; background: #1a1a2e; color: #fff; padding: 24px; margin: 0; }
      h1 { color: #ff6b35; margin-top: 0; font-size: 18px; }
      input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #444; background: #222; color: #fff; font-family: monospace; }
      button { background: #ff6b35; color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 12px; }
      a { color: #ff6b35; }
      .small { font-size: 12px; color: #aaa; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create config-window/main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigApp } from './ConfigApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigApp />
  </React.StrictMode>
);
```

- [ ] **Step 4: Create config-window/ConfigApp.tsx**

```typescript
import { useState } from 'react';
import { invoke } from '../src/services/ipc';

export function ConfigApp() {
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!key.startsWith('sk-ant-')) {
      alert('Essa key não parece válida (deve começar com sk-ant-)');
      return;
    }
    setSaving(true);
    await invoke('config:set-api-key', key);
    window.close();
  };

  return (
    <div>
      <h1>Configura a API key do Claude</h1>
      <p className="small">
        Pega uma key em <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">console.anthropic.com</a> (settings → API keys).
      </p>
      <input
        type="password"
        placeholder="sk-ant-..."
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <button onClick={handleSave} disabled={saving || !key}>
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Modify electron/main.ts to open config on first run**

Add at the top:

```typescript
import path from 'node:path';
```

Add this function above `bootstrap()`:

```typescript
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
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}/config-window/`);
  } else {
    win.loadFile('dist/config-window/index.html');
  }
  return win;
}
```

Modify `bootstrap()` to check API key first:

```typescript
function bootstrap() {
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
  });

  if (!getApiKey()) {
    createConfigWindow();
  } else {
    startMascot();
  }
}

function startMascot() {
  const savedPos = getPosition() ?? undefined;
  mascotWin = createMascotWindow(savedPos);
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mascotWin.loadURL(process.env.VITE_DEV_SERVER_URL);
    mascotWin.webContents.openDevTools({ mode: 'detach' });
  } else {
    mascotWin.loadFile('dist/index.html');
  }
}
```

- [ ] **Step 6: Smoke test (clean state)**

Delete `%APPDATA%/claude-buddy/config.json` if it exists, then:

```bash
npm run dev
```

Expected: config window opens first. Enter a fake key like `sk-ant-test123`, click Save — window closes, mascot appears.

- [ ] **Step 7: Commit**

```bash
git add config-window/ electron/ vite.config.ts
git commit -m "feat: first-run api key config window"
```

---

## Task 11: Claude API Service (TDD)

**Files:**
- Create: `src/services/claude.ts`
- Create: `tests/claude.test.ts`

- [ ] **Step 1: Write failing tests in tests/claude.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { buildClaudePayload } from '@/services/claude';
import type { Message, Attachment } from '@/state/conversation';

describe('buildClaudePayload', () => {
  it('builds text-only payload from messages', () => {
    const msgs: Message[] = [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'oi!' },
      { role: 'user', content: 'tudo bem?' },
    ];
    const payload = buildClaudePayload(msgs, []);
    expect(payload.model).toBe('claude-haiku-4-5-20251001');
    expect(payload.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'oi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'oi!' }] },
      { role: 'user', content: [{ type: 'text', text: 'tudo bem?' }] },
    ]);
  });

  it('attaches image to the latest user message', () => {
    const msgs: Message[] = [{ role: 'user', content: 'passa a receita' }];
    const atts: Attachment[] = [{ kind: 'image', mimeType: 'image/png', base64: 'BASE64DATA' }];
    const payload = buildClaudePayload(msgs, atts);
    expect(payload.messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'BASE64DATA' } },
      { type: 'text', text: 'passa a receita' },
    ]);
  });

  it('appends text attachments as quoted blocks to the latest user message', () => {
    const msgs: Message[] = [{ role: 'user', content: 'corrige a ortografia' }];
    const atts: Attachment[] = [{ kind: 'text', content: 'foi vc qe esquesseu' }];
    const payload = buildClaudePayload(msgs, atts);
    expect(payload.messages[0].content).toEqual([
      { type: 'text', text: 'corrige a ortografia\n\n---\nTEXTO SELECIONADO:\nfoi vc qe esquesseu' },
    ]);
  });

  it('only attaches to the last user message, not all', () => {
    const msgs: Message[] = [
      { role: 'user', content: 'primeira' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'segunda' },
    ];
    const atts: Attachment[] = [{ kind: 'text', content: 'EXTRA' }];
    const payload = buildClaudePayload(msgs, atts);
    expect(payload.messages[0].content).toEqual([{ type: 'text', text: 'primeira' }]);
    expect(payload.messages[2].content).toEqual([
      { type: 'text', text: 'segunda\n\n---\nTEXTO SELECIONADO:\nEXTRA' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: tests fail because module doesn't exist.

- [ ] **Step 3: Implement src/services/claude.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { Message, Attachment } from '@/state/conversation';
import { invoke } from './ipc';

export const MODEL = 'claude-haiku-4-5-20251001';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ClaudePayload {
  model: string;
  max_tokens: number;
  messages: { role: 'user' | 'assistant'; content: ContentBlock[] }[];
  system?: string;
  stream?: boolean;
}

const SYSTEM_PROMPT = `Você é o Claude Buddy, um mascote desktop fofo em pixel art. Responda em português brasileiro de forma curta, direta e amigável. Quando o usuário anexar uma imagem, analise visualmente. Quando anexar texto, foque na tarefa pedida sobre esse texto.`;

export function buildClaudePayload(messages: Message[], attachments: Attachment[]): ClaudePayload {
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return i;
    return -1;
  })();

  const builtMessages = messages.map((m, i) => {
    if (i !== lastUserIdx || attachments.length === 0) {
      return { role: m.role, content: [{ type: 'text' as const, text: m.content }] };
    }
    const imageBlocks: ContentBlock[] = attachments
      .filter((a): a is Extract<Attachment, { kind: 'image' }> => a.kind === 'image')
      .map((a) => ({ type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.base64 } }));
    const textAttachments = attachments
      .filter((a): a is Extract<Attachment, { kind: 'text' }> => a.kind === 'text')
      .map((a) => a.content);
    const textWithAttachments = textAttachments.length > 0
      ? `${m.content}\n\n---\nTEXTO SELECIONADO:\n${textAttachments.join('\n---\n')}`
      : m.content;
    return { role: m.role, content: [...imageBlocks, { type: 'text' as const, text: textWithAttachments }] };
  });

  return {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: builtMessages,
    stream: true,
  };
}

let cachedClient: Anthropic | null = null;
let cachedKey: string | null = null;

async function getClient(): Promise<Anthropic> {
  const key = await invoke('config:get-api-key');
  if (!key) throw new Error('API_KEY_MISSING');
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  cachedKey = key;
  return cachedClient;
}

export async function* streamClaude(messages: Message[], attachments: Attachment[]): AsyncGenerator<string> {
  const client = await getClient();
  const payload = buildClaudePayload(messages, attachments);
  const stream = await client.messages.stream({
    model: payload.model,
    max_tokens: payload.max_tokens,
    system: payload.system,
    messages: payload.messages as never,
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test
```

Expected: all 4 buildClaudePayload tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/claude.ts tests/claude.test.ts
git commit -m "feat: claude api client with payload builder + streaming"
```

---

## Task 12: Input Panel + End-to-End Text Flow

**Files:**
- Create: `src/components/InputPanel.tsx`
- Create: `src/components/ResponseView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create src/components/InputPanel.tsx**

```typescript
import { useState } from 'react';

interface Props {
  onSubmit: (text: string) => void;
  onCapture: () => void;
  onClipboard: () => void;
  onSelectionAttach: () => void;
  disabled?: boolean;
}

export function InputPanel({ onSubmit, onCapture, onClipboard, onSelectionAttach, disabled }: Props) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSubmit(text);
    setText('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <input
          style={{ flex: 1, padding: 6, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
          placeholder="digita aqui..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          disabled={disabled}
        />
        <button onClick={handleSubmit} disabled={disabled || !text.trim()}>➤</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <button style={btnStyle} onClick={onCapture} disabled={disabled}>📷 print</button>
        <button style={btnStyle} onClick={onSelectionAttach} disabled={disabled}>✂️ seleção</button>
        <button style={btnStyle} onClick={onClipboard} disabled={disabled}>📋 clipboard</button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#f0f0f0',
  border: 'none',
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};
```

- [ ] **Step 2: Create src/components/ResponseView.tsx**

```typescript
interface Props {
  text: string;
  showActions: boolean;
  onOk: () => void;
  onContinue: () => void;
}

export function ResponseView({ text, showActions, onOk, onContinue }: Props) {
  return (
    <div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.4 }}>{text}</div>
      {showActions && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            onClick={onContinue}
            style={{ background: '#fff', color: '#ff6b35', border: '1px solid #ff6b35', padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}
          >Continuar</button>
          <button
            onClick={onOk}
            style={{ background: '#ff6b35', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
          >OK</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire end-to-end flow in src/App.tsx**

Replace `src/App.tsx` with:

```typescript
import { useState } from 'react';
import { Mascot } from './components/Mascot';
import { SpeechBubble } from './components/SpeechBubble';
import { InputPanel } from './components/InputPanel';
import { ResponseView } from './components/ResponseView';
import { useConversation } from './state/conversation';
import { streamClaude } from './services/claude';
import type { SpriteState } from './services/sprite-animator';
import './App.css';

export default function App() {
  const [state, setState] = useState<SpriteState>('sleeping');
  const [continueCounter, setContinueCounter] = useState(0);
  const conv = useConversation();

  const wake = () => { if (state === 'sleeping') setState('waking'); };
  const sleep = () => { setState('sleeping'); conv.reset(); setContinueCounter(0); };

  const lastAssistant = [...conv.messages].reverse().find(m => m.role === 'assistant');
  const showResponse = !!lastAssistant && continueCounter === 0;
  const showInput = !showResponse && conv.status !== 'thinking';

  const handleSubmit = async (text: string) => {
    setContinueCounter(0);
    conv.addUserMessage(text);
    conv.setStatus('thinking');
    setState('thinking');
    try {
      conv.beginAssistantMessage();
      conv.setStatus('talking');
      setState('talking');
      for await (const chunk of streamClaude(useConversation.getState().messages, useConversation.getState().attachments)) {
        conv.appendAssistantChunk(chunk);
      }
      while (useConversation.getState().attachments.length > 0) conv.removeAttachment(0);
      conv.setStatus('idle');
      setState('idle');
    } catch (err) {
      conv.setError(err instanceof Error ? err.message : 'erro desconhecido');
      conv.setStatus('error');
      setState('idle');
    }
  };

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0, width: 400, height: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      gap: 8, padding: 16,
    }}>
      {state !== 'sleeping' && (
        <SpeechBubble title={lastAssistant ? undefined : 'como posso ajudar?'}>
          {showResponse && lastAssistant && (
            <ResponseView
              text={lastAssistant.content}
              showActions={conv.status === 'idle'}
              onOk={sleep}
              onContinue={() => setContinueCounter(c => c + 1)}
            />
          )}
          {showInput && (
            <InputPanel
              onSubmit={handleSubmit}
              onCapture={() => {}}
              onClipboard={() => {}}
              onSelectionAttach={() => {}}
              disabled={conv.status === 'thinking' || conv.status === 'talking'}
            />
          )}
          {conv.status === 'thinking' && (
            <div style={{ color: '#666', fontStyle: 'italic', marginTop: 8 }}>pensando...</div>
          )}
          {conv.status === 'error' && conv.error && (
            <div style={{ color: '#c00', marginTop: 8, fontSize: 12 }}>
              deu ruim: {conv.error}
              <button style={{ marginLeft: 8 }} onClick={() => { conv.setError(null); conv.setStatus('idle'); }}>OK</button>
            </div>
          )}
        </SpeechBubble>
      )}
      <Mascot state={state} onClick={wake} />
    </div>
  );
}
```

- [ ] **Step 4: Smoke test the end-to-end text flow**

Set a real API key via the config window (delete `%APPDATA%/claude-buddy/config.json` if needed and restart).

```bash
npm run dev
```

Expected: Click mascot → bubble opens → type "oi, tudo bem?" → Enter → sprite changes to thinking → text streams in → after stream, [OK] / [Continuar] appear. Click Continuar → input panel reappears. Click OK → mascot sleeps.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: end-to-end text conversation with Claude streaming"
```

---

## Task 13: Screen Capture (Region Selection)

**Files:**
- Create: `electron/capture.ts`
- Modify: `electron/main.ts`
- Modify: `src/App.tsx`
- Create: `src/components/AttachmentChip.tsx`

- [ ] **Step 1: Create electron/capture.ts**

```typescript
import { BrowserWindow, desktopCapturer, screen } from 'electron';

export async function captureScreenRegion(): Promise<{ mimeType: string; base64: string } | null> {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });
  const fullScreen = sources[0]?.thumbnail;
  if (!fullScreen) return null;
  const fullDataUrl = fullScreen.toDataURL();

  const overlay = new BrowserWindow({
    width, height, x: display.bounds.x, y: display.bounds.y,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    fullscreen: true, hasShadow: false, resizable: false,
    webPreferences: { contextIsolation: false, nodeIntegration: true },
  });

  const html = `
    <html>
    <body style="margin:0;cursor:crosshair;background:rgba(0,0,0,0.3);overflow:hidden">
      <img id="bg" src="${fullDataUrl}" style="position:absolute;inset:0;width:100%;height:100%;opacity:0.35;pointer-events:none">
      <div id="sel" style="position:absolute;border:2px solid #ff6b35;background:rgba(255,107,53,0.15);display:none"></div>
      <script>
        const { ipcRenderer } = require('electron');
        let startX, startY, isDown = false;
        const sel = document.getElementById('sel');
        document.addEventListener('mousedown', e => {
          isDown = true; startX = e.clientX; startY = e.clientY;
          sel.style.left = startX+'px'; sel.style.top = startY+'px';
          sel.style.width = '0px'; sel.style.height = '0px'; sel.style.display = 'block';
        });
        document.addEventListener('mousemove', e => {
          if (!isDown) return;
          const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
          const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
          sel.style.left = x+'px'; sel.style.top = y+'px';
          sel.style.width = w+'px'; sel.style.height = h+'px';
        });
        document.addEventListener('mouseup', e => {
          if (!isDown) return; isDown = false;
          const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
          const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
          if (w < 8 || h < 8) { window.close(); return; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const img = document.getElementById('bg');
          const tmp = new Image();
          tmp.onload = () => {
            const sx = x * (tmp.naturalWidth / window.innerWidth);
            const sy = y * (tmp.naturalHeight / window.innerHeight);
            const sw = w * (tmp.naturalWidth / window.innerWidth);
            const sh = h * (tmp.naturalHeight / window.innerHeight);
            canvas.getContext('2d').drawImage(tmp, sx, sy, sw, sh, 0, 0, w, h);
            const data = canvas.toDataURL('image/png').split(',')[1];
            ipcRenderer.send('capture:result', { mimeType: 'image/png', base64: data });
          };
          tmp.src = img.src;
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') { ipcRenderer.send('capture:result', null); } });
      </script>
    </body>
    </html>
  `;

  overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  return new Promise((resolve) => {
    const { ipcMain } = require('electron');
    const handler = (_e: unknown, data: { mimeType: string; base64: string } | null) => {
      ipcMain.removeListener('capture:result', handler);
      overlay.close();
      resolve(data);
    };
    ipcMain.on('capture:result', handler);
  });
}
```

NOTE: nodeIntegration is enabled only for this overlay (it loads a `data:` URL whose content we control 100%, so there's no XSS risk).

- [ ] **Step 2: Wire capture in electron/main.ts**

Add to imports:

```typescript
import { captureScreenRegion } from './capture';
```

Add to handlers:

```typescript
'capture:screen-region': () => captureScreenRegion(),
```

Important: hide mascot window before capture so it's not in the screenshot:

```typescript
'capture:screen-region': async () => {
  mascotWin?.hide();
  await new Promise(r => setTimeout(r, 100));
  const result = await captureScreenRegion();
  mascotWin?.show();
  return result;
},
```

- [ ] **Step 3: Create src/components/AttachmentChip.tsx**

```typescript
import type { Attachment } from '@/state/conversation';

interface Props {
  attachment: Attachment;
  onRemove: () => void;
}

export function AttachmentChip({ attachment, onRemove }: Props) {
  const label = attachment.kind === 'image' ? '📷 imagem anexada' : `✂️ ${attachment.content.slice(0, 30)}${attachment.content.length > 30 ? '…' : ''}`;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: '#fff3e0', border: '1px solid #ff6b35', borderRadius: 6,
      padding: '4px 8px', fontSize: 12, marginTop: 6, marginRight: 4,
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b35', padding: 0 }}
      >✕</button>
    </span>
  );
}
```

- [ ] **Step 4: Wire capture in src/App.tsx**

Add import:

```typescript
import { AttachmentChip } from './components/AttachmentChip';
import { invoke } from './services/ipc';
```

Replace `onCapture={() => {}}` with:

```typescript
onCapture={async () => {
  const result = await invoke('capture:screen-region');
  if (result) conv.addAttachment({ kind: 'image', mimeType: result.mimeType, base64: result.base64 });
}}
```

Render attachments above the InputPanel:

```typescript
{showInput && conv.attachments.length > 0 && (
  <div style={{ marginTop: 6 }}>
    {conv.attachments.map((a, i) => (
      <AttachmentChip key={i} attachment={a} onRemove={() => conv.removeAttachment(i)} />
    ))}
  </div>
)}
```

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Expected: click mascot → bubble opens → click 📷 print → screen dims, drag region → release → bubble shows "📷 imagem anexada" chip. Type "descreve essa imagem" → submit → Claude responds describing it.

- [ ] **Step 6: Commit**

```bash
git add electron/capture.ts electron/main.ts src/
git commit -m "feat: screen region capture with vision attachment"
```

---

## Task 14: Clipboard + Selection Attachment

**Files:**
- Create: `electron/clipboard-watcher.ts`
- Modify: `electron/main.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create electron/clipboard-watcher.ts**

```typescript
import { clipboard } from 'electron';

export type ClipboardData =
  | { kind: 'text'; content: string }
  | { kind: 'image'; mimeType: string; base64: string }
  | null;

export function readClipboard(): ClipboardData {
  const image = clipboard.readImage();
  if (!image.isEmpty()) {
    const png = image.toPNG();
    return { kind: 'image', mimeType: 'image/png', base64: png.toString('base64') };
  }
  const text = clipboard.readText();
  if (text.trim().length > 0) return { kind: 'text', content: text };
  return null;
}
```

- [ ] **Step 2: Wire handler in electron/main.ts**

Add to imports:

```typescript
import { readClipboard } from './clipboard-watcher';
```

Add to handlers:

```typescript
'clipboard:read': () => readClipboard(),
```

- [ ] **Step 3: Wire clipboard buttons in src/App.tsx**

Replace `onClipboard` and `onSelectionAttach` (semantics: both read clipboard, but "seleção" is conceptual UX — same implementation):

```typescript
onClipboard={async () => {
  const data = await invoke('clipboard:read');
  if (data) conv.addAttachment(data);
}}
onSelectionAttach={async () => {
  const data = await invoke('clipboard:read');
  if (data?.kind === 'text') conv.addAttachment(data);
}}
```

- [ ] **Step 4: Auto-attach clipboard on wake**

Modify `wake` in `src/App.tsx`:

```typescript
const wake = async () => {
  if (state !== 'sleeping') return;
  setState('waking');
  const data = await invoke('clipboard:read');
  if (data) conv.addAttachment(data);
};
```

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Expected: copy some text from notepad (Ctrl+C) → click mascot → it wakes up with the text already chipped. Click ✕ to remove. Click 📋 again to re-attach.

- [ ] **Step 6: Commit**

```bash
git add electron/clipboard-watcher.ts electron/main.ts src/App.tsx
git commit -m "feat: clipboard auto-attach on wake + manual buttons"
```

---

## Task 15: Global Hotkey

**Files:**
- Create: `electron/hotkeys.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Create electron/hotkeys.ts**

```typescript
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
```

- [ ] **Step 2: Wire in electron/main.ts**

Add imports:

```typescript
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
```

In `startMascot()`, after creating `mascotWin`:

```typescript
registerHotkeys(() => mascotWin);
```

Add cleanup:

```typescript
app.on('will-quit', () => {
  unregisterHotkeys();
});
```

- [ ] **Step 3: Listen for hotkey in renderer (src/App.tsx)**

Add to imports:

```typescript
import { useEffect } from 'react';
import { on, off } from './services/ipc';
```

Add inside `App()`:

```typescript
useEffect(() => {
  const handler = () => wake();
  on('hotkey:activate', handler);
  return () => off('hotkey:activate');
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [state]);
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Expected: with mascot dormindo, press `Ctrl+Shift+Space` from any app → mascot wakes up.

- [ ] **Step 5: Commit**

```bash
git add electron/hotkeys.ts electron/main.ts src/App.tsx
git commit -m "feat: global hotkey Ctrl+Shift+Space to wake mascot"
```

---

## Task 16: Voice Input (Web Speech API)

**Files:**
- Create: `src/hooks/useSpeechToText.ts`
- Modify: `src/components/InputPanel.tsx`

- [ ] **Step 1: Create src/hooks/useSpeechToText.ts**

```typescript
import { useEffect, useRef, useState } from 'react';

interface SpeechRecognitionAPI {
  start: () => void;
  stop: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionAPI;
    webkitSpeechRecognition?: new () => SpeechRecognitionAPI;
  }
}

export function useSpeechToText(onTranscript: (text: string) => void) {
  const recogRef = useRef<SpeechRecognitionAPI | null>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    setSupported(true);
    const recog = new Ctor();
    recog.lang = 'pt-BR';
    recog.continuous = false;
    recog.interimResults = false;
    recog.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
    };
    recog.onend = () => setListening(false);
    recog.onerror = (e) => {
      console.error('STT error:', e.error);
      setListening(false);
    };
    recogRef.current = recog;
  }, [onTranscript]);

  const toggle = () => {
    const recog = recogRef.current;
    if (!recog) return;
    if (listening) recog.stop();
    else { recog.start(); setListening(true); }
  };

  return { listening, supported, toggle };
}
```

- [ ] **Step 2: Update src/components/InputPanel.tsx to use STT**

Replace the file:

```typescript
import { useState } from 'react';
import { useSpeechToText } from '@/hooks/useSpeechToText';

interface Props {
  onSubmit: (text: string) => void;
  onCapture: () => void;
  onClipboard: () => void;
  onSelectionAttach: () => void;
  disabled?: boolean;
}

export function InputPanel({ onSubmit, onCapture, onClipboard, onSelectionAttach, disabled }: Props) {
  const [text, setText] = useState('');
  const { listening, supported, toggle } = useSpeechToText((transcript) => {
    setText((prev) => (prev ? prev + ' ' : '') + transcript);
  });

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSubmit(text);
    setText('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <input
          style={{ flex: 1, padding: 6, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
          placeholder="digita aqui..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          disabled={disabled}
        />
        <button
          onClick={toggle}
          disabled={disabled || !supported}
          title={supported ? 'falar' : 'STT não suportado'}
          style={{ background: listening ? '#ff6b35' : '#f0f0f0', color: listening ? '#fff' : '#000' }}
        >🎤</button>
        <button onClick={handleSubmit} disabled={disabled || !text.trim()}>➤</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <button style={btnStyle} onClick={onCapture} disabled={disabled}>📷 print</button>
        <button style={btnStyle} onClick={onSelectionAttach} disabled={disabled}>✂️ seleção</button>
        <button style={btnStyle} onClick={onClipboard} disabled={disabled}>📋 clipboard</button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#f0f0f0',
  border: 'none',
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};
```

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

Expected: click mascot → click 🎤 → permission prompt → say "oi tudo bem" → text appears in input → submit.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: voice input via web speech api (pt-BR)"
```

---

## Task 17: Drag-to-Move + Persisted Position

**Files:**
- Create: `src/hooks/useDrag.ts`
- Modify: `src/components/Mascot.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create src/hooks/useDrag.ts**

```typescript
import { useEffect, useRef } from 'react';
import { invoke } from '@/services/ipc';

export function useDrag() {
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startWin = useRef({ x: 0, y: 0 });

  const onMouseDown = async (e: React.MouseEvent) => {
    dragging.current = true;
    startPos.current = { x: e.screenX, y: e.screenY };
    const pos = await invoke('window:get-position');
    startWin.current = pos;
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.screenX - startPos.current.x;
      const dy = e.screenY - startPos.current.y;
      invoke('window:set-position', { x: startWin.current.x + dx, y: startWin.current.y + dy });
    };
    const onUp = async () => {
      if (!dragging.current) return;
      dragging.current = false;
      const pos = await invoke('window:get-position');
      invoke('position:set', pos);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return { onMouseDown };
}
```

- [ ] **Step 2: Add new IPC channels in shared/ipc-types.ts**

Add to `IpcRequests`:

```typescript
'window:get-position': () => { x: number; y: number };
'window:set-position': (pos: { x: number; y: number }) => void;
```

- [ ] **Step 3: Implement handlers in electron/main.ts**

Add to handlers:

```typescript
'window:get-position': () => {
  const [x, y] = mascotWin?.getPosition() ?? [0, 0];
  return { x, y };
},
'window:set-position': (pos) => {
  mascotWin?.setPosition(pos.x, pos.y);
},
```

- [ ] **Step 4: Wire drag in Mascot component**

In `src/App.tsx` import and use the hook:

```typescript
import { useDrag } from './hooks/useDrag';
// inside App():
const drag = useDrag();
// pass to <Mascot ... onMouseDown={drag.onMouseDown} />
```

Mascot already accepts `onMouseDown` prop.

CAVEAT: clicking also fires `onMouseDown`. To distinguish click from drag, in `useDrag` track if movement was tiny — if so, don't persist. Add to `onUp`:

```typescript
const onUp = async () => {
  if (!dragging.current) return;
  dragging.current = false;
  const pos = await invoke('window:get-position');
  const dist = Math.hypot(pos.x - startWin.current.x, pos.y - startWin.current.y);
  if (dist > 4) invoke('position:set', pos); // only save if it was actually a drag
};
```

The `onClick` still fires normally for short drags — that's the wake behavior.

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Expected: drag mascot around the screen → release → restart app (`Ctrl+C` then `npm run dev` again) → mascot reopens at the saved position.

- [ ] **Step 6: Commit**

```bash
git add src/ shared/ electron/main.ts
git commit -m "feat: drag-to-move mascot with persisted position"
```

---

## Task 18: Sleep Timeout

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add inactivity-timeout effect in src/App.tsx**

After the existing `useEffect` for hotkey, add:

```typescript
useEffect(() => {
  if (state === 'sleeping') return;
  let timer = setTimeout(handleTimeout, 30_000);
  const reset = () => { clearTimeout(timer); timer = setTimeout(handleTimeout, 30_000); };
  const handleTimeout = () => {
    if (conv.status === 'thinking' || conv.status === 'talking') {
      timer = setTimeout(handleTimeout, 30_000); // postpone if mid-stream
      return;
    }
    setState('sleeping');
    conv.reset();
    setContinueCounter(0);
  };
  window.addEventListener('mousemove', reset);
  window.addEventListener('keydown', reset);
  window.addEventListener('click', reset);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('mousemove', reset);
    window.removeEventListener('keydown', reset);
    window.removeEventListener('click', reset);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [state, conv.status]);
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev
```

Expected: wake the mascot, then don't touch it. After 30s, mascot goes to sleep.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: 30s inactivity timeout returns mascot to sleep"
```

---

## Task 19: System Tray + Error Refinements

**Files:**
- Create: `electron/tray.ts`
- Modify: `electron/main.ts`
- Modify: `src/services/claude.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create electron/tray.ts**

```typescript
import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;

export function createTray(getMascotWin: () => BrowserWindow | null, openConfig: () => void) {
  const iconPath = path.join(__dirname, '../assets/sprites/placeholder.png');
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
```

- [ ] **Step 2: Wire tray in electron/main.ts**

Add imports:

```typescript
import { createTray, destroyTray } from './tray';
```

In `startMascot()` after registerHotkeys:

```typescript
createTray(() => mascotWin, () => createConfigWindow());
```

In `will-quit`:

```typescript
destroyTray();
```

- [ ] **Step 3: Improve error mapping in src/services/claude.ts**

At the bottom of `streamClaude`, wrap the loop:

```typescript
export async function* streamClaude(messages: Message[], attachments: Attachment[]): AsyncGenerator<string> {
  let client: Anthropic;
  try {
    client = await getClient();
  } catch (e) {
    if (e instanceof Error && e.message === 'API_KEY_MISSING') throw new Error('API_KEY_MISSING');
    throw e;
  }
  const payload = buildClaudePayload(messages, attachments);
  try {
    const stream = await client.messages.stream({
      model: payload.model,
      max_tokens: payload.max_tokens,
      system: payload.system,
      messages: payload.messages as never,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  } catch (e) {
    const err = e as { status?: number; message?: string };
    if (err.status === 401) throw new Error('INVALID_API_KEY');
    if (err.status === 429) throw new Error('RATE_LIMITED');
    if (err.message?.includes('fetch')) throw new Error('NETWORK');
    throw new Error('UNKNOWN');
  }
}
```

- [ ] **Step 4: Map errors to friendly messages in src/App.tsx**

Replace the `setError` line in `handleSubmit`'s catch:

```typescript
} catch (err) {
  const code = err instanceof Error ? err.message : 'UNKNOWN';
  const msg = {
    NETWORK: 'tô offline 😴 confere a internet aí',
    INVALID_API_KEY: 'API key não tá rolando — abre o tray pra reconfigurar',
    RATE_LIMITED: 'calma aí, muita pergunta junta',
    API_KEY_MISSING: 'API key não configurada — abre o tray pra adicionar',
    UNKNOWN: 'deu ruim aqui, tenta de novo?',
  }[code] || `erro: ${code}`;
  conv.setError(msg);
  conv.setStatus('error');
  setState('idle');
}
```

- [ ] **Step 5: Smoke test errors**

Temporarily wreck the API key in the config to test INVALID_API_KEY, then disable network to test NETWORK.

```bash
npm run dev
```

- [ ] **Step 6: Commit**

```bash
git add electron/ src/
git commit -m "feat: system tray + friendly error messages"
```

---

## Task 20: Autostart on Boot

**Files:**
- Modify: `electron/main.ts`
- Create: setting in config window (optional toggle — skipped to keep scope tight)

- [ ] **Step 1: Add autostart on boot in electron/main.ts**

In `bootstrap()` after `app.whenReady()`:

```typescript
app.setLoginItemSettings({
  openAtLogin: true,
  args: ['--hidden'],
});
```

- [ ] **Step 2: Honor `--hidden` flag (start with window hidden, only tray visible)**

In `startMascot()`:

```typescript
const startHidden = process.argv.includes('--hidden');
// ... after loadURL/loadFile:
if (startHidden) mascotWin.hide();
```

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

Open Windows Task Manager → Startup tab → verify "Electron" (or "Claude Buddy" after packaging) is enabled.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat: autostart on Windows boot, hidden by default"
```

---

## Task 21: Packaging (electron-builder)

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json` (build target)

- [ ] **Step 1: Create electron-builder.yml**

```yaml
appId: com.dereck.claudebuddy
productName: Claude Buddy
directories:
  output: release
files:
  - dist/**/*
  - dist-electron/**/*
  - assets/**/*
  - package.json
extraResources:
  - from: assets/sprites
    to: sprites
win:
  target:
    - target: nsis
      arch: [x64]
  icon: assets/sprites/placeholder.png
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Claude Buddy
```

- [ ] **Step 2: Build**

```bash
npm run package
```

Expected: `release/Claude Buddy Setup 0.1.0.exe` is created.

- [ ] **Step 3: Smoke test installer**

Run the installer, install to default location, launch from Start menu. Verify:
- Config window opens on first launch.
- Mascot appears bottom-right after key is saved.
- Hotkey works.
- App restarts after reboot (tray icon visible).

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml package.json
git commit -m "chore: package as Windows installer via electron-builder"
```

---

## Task 22: Replace Placeholder Sprites (manual asset task)

This task is mostly **out of code** — it's about producing the real pixel-art sprites.

- [ ] **Step 1: Use PixelLab.ai to generate sprites**

Recommended prompts (one per state):

| State | Prompt |
|---|---|
| sleeping | `cute orange crab mascot sleeping, side view, 4-frame breathing animation, "Zzz" floating up, pixel art, 128x128, 16-color palette` |
| waking  | `cute orange crab mascot waking up, stretching pincers, opening eyes, 8-frame animation one-shot, pixel art, 128x128` |
| idle    | `cute orange crab mascot standing still, looking around, 6-frame loop with blinks and pincer twitches, pixel art, 128x128` |
| thinking| `cute orange crab mascot scratching head with one pincer, thoughtful expression, 4-frame loop, pixel art, 128x128` |
| talking | `cute orange crab mascot speaking, opening and closing mouth, gesticulating with pincers, 3-frame loop, pixel art, 128x128` |

Save each as a horizontal spritesheet PNG in `assets/sprites/`:
- `sleeping.png` (4 frames wide → 512×128)
- `waking.png` (8 frames wide → 1024×128)
- `idle.png` (6 frames wide → 768×128)
- `thinking.png` (4 frames wide → 512×128)
- `talking.png` (3 frames wide → 384×128)

- [ ] **Step 2: Update assets/sprites/sprites.json**

```json
{
  "sleeping": { "src": "sleeping.png", "frames": 4, "fps": 2, "loop": true, "nextState": null, "frameWidth": 128, "frameHeight": 128 },
  "waking":   { "src": "waking.png", "frames": 8, "fps": 13, "loop": false, "nextState": "idle", "frameWidth": 128, "frameHeight": 128 },
  "idle":     { "src": "idle.png", "frames": 6, "fps": 4, "loop": true, "nextState": null, "frameWidth": 128, "frameHeight": 128 },
  "thinking": { "src": "thinking.png", "frames": 4, "fps": 6, "loop": true, "nextState": null, "frameWidth": 128, "frameHeight": 128 },
  "talking":  { "src": "talking.png", "frames": 3, "fps": 8, "loop": true, "nextState": null, "frameWidth": 128, "frameHeight": 128 }
}
```

- [ ] **Step 3: Replace tray icon**

Use a 16×16 crop of `idle.png` (frame 0) as `assets/sprites/tray-icon.png`. Update `electron/tray.ts` to use it instead of `placeholder.png`.

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Expected: mascot now animates with proper sprites in each state. Re-package and verify in the installer build too.

- [ ] **Step 5: Commit**

```bash
git add assets/
git commit -m "chore: replace placeholders with PixelLab-generated sprites"
```

---

## Done

At this point the app:
- Runs at boot, hidden in tray.
- Mascot sits in bottom-right (or saved position), drag-to-move.
- Wakes on click or `Ctrl+Shift+Space`.
- Accepts text input + voice (Web Speech API).
- Attaches screen capture, clipboard image/text automatically or manually.
- Streams Claude Haiku 4.5 responses with vision.
- [OK]/[Continuar] flow, ephemeral multi-turn, 30s timeout.
- Friendly error states for offline / bad key / rate limit.
- Distributable as `.exe` installer.

Out of scope (future fase 2): TTS, persistent memory, history view, Ollama local model, macOS/Linux.
