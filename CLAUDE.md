# Claude Buddy — Working Notes

A desktop pixel-art mascot powered by Claude. Lives in the corner of the screen, wakes on `Ctrl+Shift+Space`, reads selected text from any other app via Win32, edits in place, runs MCP tools, drives the mouse with computer-use. Electron 33 + Vite + React 18 + TypeScript (strict).

> **Windows-only** for now — the keyboard/clipboard automation depends on Win32 `AttachThreadInput` + PowerShell `EncodedCommand`. macOS/Linux would compile but the "read selection" + "paste back" tools would no-op.

---

## Hard constraints — DO NOT BREAK

These are sacred. Multiple agents have already been told this explicitly:

1. **The mascot sprite NEVER disappears.** Even when state is `sleeping`, the canvas keeps rendering the sprite in the corner (with Z's blinking). `window:set-size` shrinks the window to `COLLAPSED` (200×110) but never hides it. **No** `BrowserWindow.hide()` on sleep. The whole product identity is "buddy in the corner of your screen", not "popup that disappears."
2. **The pixel-art identity stays compact.** The bubble caps at 560×380 (or 800×380 when the attach picker is open). New features must be one-tap and discoverable — not a toolbar. Stop / Copy / Retry / Export buttons exist but are small, contextual, hover-revealed where possible.
3. **HITL gates stay on user actions with non-trivial consequences.** `run_command` always shows a card; `edit_in_place` snapshots clipboard for undo; computer-use shows a pre-flight modal on first action; destructive shell patterns paint the card red. Don't bypass these for "convenience."

---

## Architecture at a glance

```
electron/         main process (Node + Electron API)
  main.ts         bootstrap, IPC handler registry, window factories
  store.ts        AppSettings + memories + onboarding flags (lazy-init Store)
  agents.ts       multi-agent CRUD + built-ins hydration (lazy-init Store)
  mcp.ts          MCP client lifecycle, stdio transport (lazy-init Store)
  keyboard.ts     Win32 selection read + paste-back via PowerShell
  hotkeys.ts      Ctrl+Shift+Space (wake), Ctrl+Shift+A (ask-w-selection),
                  Ctrl+Shift+Esc (computer-use panic key)
  shell.ts        runPowerShell + killCommand + extendTimeout registry
  files.ts        folder listing (.gitignore-aware), image base64 read,
                  sensitive folder detection
  capture.ts      screen-region screenshot overlay
  automation.ts   mouse/keyboard for computer-use tool
  tray.ts         tray icon + dynamic state tooltip
  edge-tts.ts     msedge-tts WebSocket bridge
  file-parser.ts  PDF (unpdf) / DOCX (mammoth) / image parsing
  ipc.ts          tiny invoke→handler dispatch helper
  preload.ts      contextBridge surface for renderer
  window-manager.ts mascot window factory + multi-monitor positioning
  updater.ts      electron-updater wiring (only effective in packaged)

src/              renderer (React)
  App.tsx         orchestrator: sleep/wake state machine, idle timeout,
                  preflight modal, MCP banner, stream abort, slash dispatcher
  components/
    Mascot.tsx          canvas + sprite renderer + drag handle
    SpeechBubble.tsx    bubble shell (header, body, close, ↗ export button)
    InputPanel.tsx      input, mic 🎤 (STT), slash autocomplete, ↑ history
    ResponseView.tsx    markdown render (rehype-highlight), copy button,
                        regenerate, undo chips (edit_in_place, save_memory),
                        step-with-input details toggle
    CommandApprovalCard.tsx  pending/running/result states + kill + extend
    AgentOverlay.tsx    computer-use UI + step counter + lost-redirect
    AgentSelector.tsx   dropdown switcher with conversation-continuity confirm
    AttachPicker.tsx    screenshot/clipboard/file/folder picker
    AttachmentChip.tsx  ephemeral vs persistent chips with thumbnails
  services/
    claude.ts           chat loop, model picker, extended thinking, citations
    agent.ts            computer-use agent loop with preflight + step events
    skills.ts           tool dispatcher + TOOLS definitions (the agent's API)
    crab-renderer.ts    procedural sprite renderer (no sprite sheet)
    sprite-animator.ts  state machine (sleeping/waking/idle/thinking/talking/
                        happy/confused) + frame timing
    greetings.ts        contextual greeting picker w/ recentReturn + userName
    sounds.ts           Web Audio procedural 8-bit fx
    tts.ts              audio playback wrapper, isSpeaking subscription
    ipc.ts              renderer-side typed `invoke()` + on/off events
    mcp-tools-cache.ts  synchronous cache for chat-time tool list +
                        getCrashedServers()
    run-command-bridge.ts pending approval registry, card result pub/sub
  state/
    conversation.ts     Zustand store (messages, attachments, error, errorCode)
  hooks/
    useDrag.ts          mascot drag positioning + electron-store persistence
    useTheme.ts         light/dark/auto with prefers-color-scheme listener
    useSpriteAnimation.ts requestAnimationFrame loop for frame switching
    useSpeechToText.ts  Web Speech Recognition wrapper, lang param

shared/           cross-process — IMPORTED BY BOTH MAIN AND RENDERER
  i18n-strings.ts   EN/PT/ES dict; type StringDict = typeof EN
  ipc-types.ts      IpcRequests interface (channel → params/return contract)
  mcp-types.ts     MCP server config + tool def DTOs

config-window/    standalone API-key entry window
settings-window/  standalone settings window (5 tabs)
tests/            vitest specs (mostly main-process modules)
assets/sprites/   icon.png + generator script
```

---

## Conventions worth remembering

### Lazy-init of `electron-store` instances

**Critical.** `electron-store` v10 reads `app.getPath('userData')` inside its constructor, which requires the Electron `app` module to be ready. Creating `new Store(...)` at module top-level explodes with `"Please specify the projectName option."` when imported before `app.whenReady()`.

Pattern (used in `store.ts`, `agents.ts`, `mcp.ts`):

```ts
let _store: Store<Schema> | null = null;
function s(): Store<Schema> {
  if (!_store) _store = new Store<Schema>({ name: '...', encryptionKey, defaults: {} });
  return _store;
}
export function initStore(): void { s(); }   // bootstrap() calls this
// Every helper goes through s().get(...) / s().set(...) — never the bare instance.
```

`bootstrap()` in `main.ts` calls `initStore()` / `initAgentsStore()` / `mcp.initMcpStore()` after `app.whenReady`. **Do not add `new Store(...)` at module top-level.**

### i18n is single-source-of-truth typed

- `shared/i18n-strings.ts` exports `EN` (full English dict) and `PT`/`ES` typed as `StringDict = typeof EN`.
- TypeScript enforces that PT/ES have every key EN has. Adding a new string = add to EN first, then PT and ES will be type-errors until filled in.
- Renderer + main both use `translate(locale, key, vars?)` (main) or `t(key)` from `useT()` (renderer).
- Built-in agent names/prompts live in the dict (`builtInAgents.buddy.prompt` etc.) and are hydrated at read time — that's why language switching reloads everything without store migration.

### IPC contract

- All channels declared in `shared/ipc-types.ts` (`IpcRequests` interface, keyed by channel string → function signature).
- Main registers via `registerHandlers({ 'channel:name': (params) => ... })` in `main.ts`.
- Renderer calls `invoke('channel:name', params)` from `src/services/ipc.ts`. Types are inferred automatically.
- **Both `ipc-types.ts` AND `ipc-types.d.ts` exist in the repo** — the `.d.ts` is auto-regenerated by `tsc -b`. If you add a channel to the `.ts` and forget to rebuild, the `.d.ts` will be stale and the renderer's `invoke()` will reject the channel with a type error. Run `npx tsc -b` to sync.

### Tools system

Tools the agent can call (`src/services/skills.ts`):

| Name | Run-side | Notes |
|---|---|---|
| `read_selection` | main (IPC) | Win32 AttachThreadInput + SendKeys ^C |
| `edit_in_place` | main (IPC) | Snapshots clipboard pre-paste → undo chip token |
| `read_file` | main (IPC) | Scope-guarded to attachedPaths |
| `list_folder` | main (IPC) | Scope-guarded, .gitignore-aware, capped at 200 entries |
| `screenshot_region` | main (IPC) | Returns base64 PNG |
| `save_memory` | local | Surfaces undo chip + index for future deletion |
| `run_command` | renderer-gated | HITL approval card; allowlist can auto-approve |
| `web_search` | server-side | Anthropic's tool, 3 uses/turn, citations captured |
| `computer_*` (computer-use beta) | main (IPC) | Only in Agent Mode |
| MCP tools | main → MCP server | Prefixed `<server>_<tool>`, filtered to running servers |

### Sleep / wake semantics

- `sleep()` (manual close or idle timeout) — aborts in-flight stream, sets `state='sleeping'`, marks `lastSleepRef = Date.now()`, **does NOT** call `conv.reset()`.
- `wake()` — if `Date.now() - lastActiveRef > 5min`, resets the conversation; otherwise preserves it. If `lastSleepRef` is within 2min, greeting comes from the `recentReturn` pool ("voltou rápido!").
- `IDLE_TIMEOUT_MS = 90s`, configurable via settings (15s–5min).

### Tool-result chips with structured payloads

The agent emits `[[step:<tool>]]` markers into the response stream that `ResponseView` parses. Some have structured payloads (base64-encoded JSON because `]]` would collide):

- `[[step:<tool>:<base64-json>]]` — args of any tool, opens `▾ detalhes`
- `[[step:edit_in_place_undoable:<uuid>]]` — undo button calls `automation:undo-paste(token)`
- `[[step:save_memory_undo:<base64>]]` — `{ index, fact_truncated }` → `↶ esquecer` button

Adding a new structured step: extend the parser in `ResponseView.tsx` and emit from `App.tsx`'s `onToolUse` callback.

---

## Dev workflow

```bash
# Make sure ELECTRON_RUN_AS_NODE is NOT set in your env — it makes Electron
# run as plain Node and breaks everything with cryptic undefined errors.
unset ELECTRON_RUN_AS_NODE              # bash/zsh
Remove-Item Env:ELECTRON_RUN_AS_NODE    # PowerShell

npm run dev                # vite dev server + electron main process
npx tsc --noEmit           # type check (no emit)
npx tsc -b                 # build & refresh stale .d.ts/.js
npx vitest run             # tests (~675 specs across worktrees too)
npm run package            # NSIS installer → release/Claude Buddy Setup X.exe
```

API key goes through the config window on first launch (saved encrypted via machine-id-derived key in `electron-store`).

---

## Gotchas / known traps

1. **`ELECTRON_RUN_AS_NODE=1`** — see above. Symptom: `Cannot read properties of undefined (reading 'isPackaged')` or `Please specify the projectName option.` at boot.
2. **Stale `*.js` next to `*.ts` in `electron/` and `shared/`** — the `.js` files are committed (tsc build outputs). After editing a `.ts`, run `npx tsc -b` or the bundle will use the stale `.js`. Symptom: `"X is not exported by Y.js"` at vite build time.
3. **Win32-only paths** — `keyboard.ts`, parts of `automation.ts`, NSIS installer. Don't expect mac/linux dev to work end-to-end. The renderer/most services do work cross-platform.
4. **electron-builder code signing** — no cert is configured; installers are unsigned. SmartScreen will flag on first run. Fine for personal use, terrible for distribution. Add `cscLink`/`cscKeyPassword` to electron-builder.yml if a cert ever appears.
5. **`unpdf` for PDF parsing** — chosen over `pdf-parse` because `pdf-parse`'s pdfjs worker can't be bundled into the Electron main process. If you change the PDF library, check that it works without a Web Worker.
6. **MCP cold start** — `npx -y @some/server` can take 30-60s on first launch (downloading the package). The handshake timeout in `mcp.ts` is set to 60s for this reason. Status dot stays `starting` during the download.
7. **MSEdge TTS dependencies** — `bufferutil` and `utf-8-validate` are externalized in `vite.config.ts`. Don't try to bundle them; they're native modules that break Windows builds.
8. **The 3 encrypted stores** — `claude-buddy.json` (settings/memories/onboarding), `claude-buddy-agents.json` (multi-agent), `claude-buddy-mcp.json` (MCP configs). Each has its own encryption key derived from `machine-id`. **Stores are machine-bound** — copying the JSON to another machine won't decrypt. Settings → About → Export/Import is the migration path.

---

## What changed recently (2026-05-21)

A multi-agent swarm UX audit landed (commits `8c2d192..5ea16bc` on `main`), adding ~73 distinct improvements across 6 domains. The 6 source worktrees are in `.claude/worktrees/agent-*` (gitignored locally) if you need to inspect any individual agent's reasoning.

Major additions, by domain:

- **Onboarding**: OS locale auto-detect, welcome bubble after API key save, tip-of-the-day rotating, tray tooltip per state, daily boot notification when `--hidden`, drag-hint, mascot `cursor: grab`.
- **Conversation flow**: stop streaming (`AbortSignal`), retry/regenerate, `↑` prompt history, Esc/click-outside close, user-question above response, `Continue` collapse strip, syntax-highlighted code with copy buttons, contextual quick replies (hidden when response is short).
- **Attachments**: drag-images-as-base64 path, 5MB/30MB/15MB caps, folder pre-counting, sensitive folder warning, thumbnails in chips, screenshot ESC hint.
- **Tools & HITL**: destructive command red card, persistent allowlist, kill + extend on running cards, sleep aborts stream, save_memory undo chip, web search citations, MCP crashed banner + filter, step counter for agent loop, cost meter.
- **Settings**: hotkey rebind with conflict detection, memories grouped by agent + undo, MCP test + logs modal, export/import, TTS preview, respondInUserLanguage toggle.
- **Slash + STT + extras**: 7 slash commands with autocomplete, Web Speech STT wired to InputPanel, `Ctrl+Shift+A` ask-with-selection, active app awareness in system prompt, mascot `happy`/`confused` sprite states, user name personalization, multi-monitor cursor-aware positioning, extended thinking auto for heavy queries, markdown export from bubble header.

Plus a `fix(electron-store)` for the lazy-init pattern documented above — that one's NOT a feature, it's required for the app to boot at all on freshly-built bundles.

---

## When you need to add something new

- **New IPC channel**: declare in `shared/ipc-types.ts` (`IpcRequests`), register handler in `main.ts:registerHandlers({...})`, call via `invoke('channel', params)` in renderer. `npx tsc -b` after to refresh `.d.ts`.
- **New tool the agent can call**: define in `src/services/skills.ts` (both `TOOLS` array for API + `executeTool` switch case for dispatch). Add `steps.<name>` to i18n dict for the chip label.
- **New i18n string**: add to EN first in `shared/i18n-strings.ts`, then TypeScript will fail until PT and ES match.
- **New mascot sprite state**: extend `SpriteState` union in `src/services/sprite-animator.ts`, add frame logic in `src/services/crab-renderer.ts`. Use `flashState('happy', 800)` to flash a state and revert.
- **New settings option**: add field to `AppSettings` interface in `electron/store.ts` (with default), surface in `settings-window/SettingsApp.tsx` general/agents/mcp tab, plumb through `chatWithSkills`/`runAgent` if it affects the model call.
- **New MCP server type**: nothing to do — the existing form/JSON-paste covers any stdio MCP.

---

## Things I tend to forget

- `getActiveAgent()` is **lazy-hydrated** from `agents.ts:hydrate()` because built-ins read name/prompt from the live i18n dict (so language switches relocalize without store migration). Calling `agentsStore().get('agents')` returns *stored* shape, not hydrated.
- The MCP tools-cache (`src/services/mcp-tools-cache.ts`) is a **renderer-side synchronous mirror** of main-process state, updated via the `mcp:states-changed` IPC event. `claude.ts` reads it synchronously to build the API call's `tools` array — without this cache, every turn would await IPC.
- `App.tsx`'s `pickGreeting()` is called with `{ recentReturn, userName }` — the function strips `{userName}` placeholders gracefully when the name is empty, so the same greeting line works for everyone.
- `dist-electron/main.js` is the actual entry point (per `package.json:main`). It re-requires `./main-<hash>.js` (the bundled output). If you see stack traces pointing into `main-<hash>.js`, that's the bundle, not the source — go to `electron/main.ts`.
- `useConversation.getState()` (without React subscribe) is used a lot in callbacks to read the *current* state at the moment of execution (vs the captured-at-render snapshot). Don't try to "fix" this to `conv.messages` — you'll capture stale state.
