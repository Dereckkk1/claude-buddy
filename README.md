# Claude Buddy

A desktop pixel-art mascot powered by Claude. Lives in the corner of your
screen, sleeps until you call it, and quietly does the boring parts of every
text task — reading what you have selected in any other app, replying inline,
pasting back the result, remembering things across sessions, and searching the
web when it needs fresh info.

Built as a personal experiment to see how far the Claude API + a small,
calm desktop UI could go.

![mascot icon](assets/sprites/icon.png)

---

## What it does

- **Wakes on click or global hotkey** (`Ctrl+Shift+Space` by default). Bouncy
  sprite animation, 8-bit sounds, and a single greeting bubble — no chat
  history clutter, no sidebar of past threads.
- **Reads your selection from any other app.** When you ask something vague
  like "fix this" or "which one should I pick?", the agent simulates Ctrl+C
  on the foreground window via a Win32 `AttachThreadInput` trick (bypasses
  the foreground-lock restriction), reads what you had highlighted, and acts
  on it. No more copy-pasting context into a chat.
- **Edits in place.** For rewrite/fix/translate requests, the agent pastes
  the result directly back into your active app — replacing the selection.
  You don't switch windows; the mascot does the round trip.
- **Native web search.** Uses Anthropic's server-side `web_search` tool so
  the agent can pull live info (news, prices, recent docs, versions) up to
  3 times per turn, with citations.
- **Reads files and folders.** Drag any file or folder onto the mascot (or
  attach via the `+` picker) and the agent uses `list_folder` + `read_file`
  tools to navigate and answer about it. Supports text/code, PDF (via the
  serverless `unpdf`), DOCX (via `mammoth`), and images (via Claude Vision).
  Scope-guarded — the agent can only touch paths you explicitly attached.
- **Runs shell commands with HITL approval.** A `run_command` tool lets
  the agent propose PowerShell commands; an inline card with Cancel / Edit
  / Run buttons gates every execution. Result (stdout, stderr, exit code,
  duration) comes back as an expandable card in the bubble.
- **MCP support.** Connect any [Model Context Protocol](https://modelcontextprotocol.io)
  server (filesystem, github, slack, postgres, brave-search, memory, etc).
  Add via form or paste a Claude-Desktop-style JSON config. Tools auto-merge
  into the agent's toolbox with `<server>_<tool>` prefix routing. Stdio
  transport, encrypted env vars, status dots that update live.
- **Multi-agent.** Four built-in personalities (Buddy, Code Helper, Language
  Tutor, Writer) plus user-defined custom agents. Each has its own system
  prompt, memories, and preferred model. Optional memory sharing between
  agents.
- **Persistent memories.** The agent decides when to call `save_memory`
  itself — only stores genuinely useful facts. Memories survive restarts,
  encrypted with a machine-id-derived key.
- **Computer-use Agent Mode.** Toggle the "Modo Agente" button and the
  mascot can actually drive your mouse and keyboard via Anthropic's
  `computer_20251124` tool — open apps, type, click, take screenshots,
  multi-step tasks autonomously.
- **Neural TTS.** Reads responses aloud using Microsoft Edge's neural
  voices (msedge-tts via WebSocket) — 13 voices across English, Portuguese,
  and Spanish. Speed adjustable.
- **Trilingual UI.** Full i18n in English (default), Portuguese (BR), and
  Spanish. The selected language also controls how the agent responds. One
  shared dictionary in `shared/i18n-strings.ts` drives both renderer and main
  process — tray menu, voice labels, built-in agent prompts all relocalize
  on the fly.
- **Light/dark theme**, respects Windows system preference.
- **8-bit sound effects** (wake, send, thinking loop, done, error, paste)
  generated procedurally via Web Audio API.
- **Tray icon** with quick wake / open settings / configure API key / quit.
- **Smart model routing.** Picks Haiku for short questions, Sonnet for
  complex ones based on heuristics on length, keywords, conversation depth,
  and attachment size — keeps cost down without manual switching.

---

## Tech stack

- **Electron 33** + **Vite** + **React 18** + **TypeScript** (strict mode)
- **Anthropic SDK** with streaming tool use and computer-use beta
- **`@modelcontextprotocol/sdk`** for the MCP client (stdio transport)
- **Zustand** for ephemeral conversation state
- **electron-store** with machine-id-derived encryption for persisted secrets
  (API key, agent memories, MCP server env vars)
- **msedge-tts** for neural voices (with `bufferutil` / `utf-8-validate`
  externalized to avoid native rebuilds on Windows)
- **unpdf** + **mammoth** for PDF/DOCX parsing — serverless pdfjs port that
  doesn't need a Web Worker (works in the Electron main process where
  pdf-parse's worker can't be bundled)
- **`ignore`** for `.gitignore`-aware folder listing
- **Pure 2D canvas pixel-art renderer** (no sprite sheet — every frame is
  drawn procedurally from a 18×10 grid, scales perfectly on hi-DPI)
- **Zero-dep PNG encoder** (`scripts/generate-icon.mjs`) — generates the app
  icon from the same sprite logic, no native image deps required
- **NSIS installer** via electron-builder, auto-updater wiring ready

---

## Architecture highlights

A few things in the codebase that were fun to figure out and might be worth
a reviewer's time:

- **`electron/keyboard.ts`** — the Win32 keyboard read/paste implementation.
  Uses PowerShell `EncodedCommand` with `AttachThreadInput` so the mascot
  can read selections and paste into apps it doesn't own, without the
  Windows foreground-lock blocking SendKeys.
- **`electron/mcp.ts`** — the entire MCP client lifecycle in one module.
  Eager startup, encrypted config store, prefix-based tool routing
  (`<server>_<tool>`), 60s handshake timeout (because `npx -y` cold start
  can take 30s+), and stderr captured into the crashed-state error message
  for one-glance debugging.
- **`src/services/mcp-tools-cache.ts`** — bridge between main and renderer.
  Synchronous cache (so `claude.ts` can build the API call's tools array
  without awaiting IPC every turn) + React hook for the settings UI that
  re-renders on `mcp:states-changed` events.
- **`src/services/run-command-bridge.ts`** — dual-channel approval registry
  for the shell tool. The agent's `executeTool` blocks on a Promise until
  the user clicks a card; meanwhile the card subscribes to a separate
  result channel so the executor (not the card) owns the IPC and there's
  no duplicate execution.
- **`src/services/claude.ts`** — the streaming chat loop with multi-turn
  tool use. Handles client-side tools, server-side tools (`web_search`),
  and prefixed MCP tools in the same loop. Layers the system prompt with
  per-locale tool instructions + language directive + agent prompt +
  memories + attached paths + MCP hint block.
- **`shared/i18n-strings.ts`** — single dictionary that powers UI strings,
  tray menu, voice labels, and built-in agent prompts across both renderer
  and main process. Built-ins derive name + prompt from the dict at read
  time so a language switch instantly relocalizes everything without a
  store migration.
- **`src/services/crab-renderer.ts`** — the sprite renderer. State machine
  with frames per state (sleeping/waking/idle/thinking/talking), drawn pixel
  by pixel onto a canvas. The same logic powers the static app icon via
  `scripts/generate-icon.mjs`.
- **`electron/agents.ts`** — multi-agent store with a "stored agent" vs
  "hydrated agent" split: built-ins store only emoji/model/memories;
  name/prompt come from the i18n dict; custom agents store everything
  verbatim. Migration drops legacy persisted built-in prompts on load.

---

## Running locally

Requires Node 22+, Windows 10/11 (the keyboard automation is Win32-specific).

```bash
git clone https://github.com/Dereckkk1/claude-buddy.git
cd claude-buddy
npm install
npm run dev        # vite dev + electron
```

On first run, paste your Anthropic API key into the config window. It's
encrypted at rest with a key derived from your machine ID.

To build a Windows installer:

```bash
npm run package    # produces release/Claude Buddy Setup 0.2.0.exe
```

---

## Why I built this

I wanted to feel the difference between a chat-app shaped around the model
(open a tab, paste context, copy result) and an OS-shaped tool that just
*is there* on the screen and acts where the work already is. Most of the
fun was in the small UX glue: the mascot waking up, the agent figuring out
on its own that "fix this" means it should go look at the foreground window
selection, the edit landing back inside the original app so you never
break flow.

The project is open source under the MIT License. Bug reports, PRs, and
ideas welcome.
