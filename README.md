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
  history clutter, no sidebar of past threads. First wake after a brief sleep
  preserves the previous conversation (5 min window); longer breaks start
  fresh. The mascot itself never disappears — even while sleeping the sprite
  stays in the corner.
- **Reads your selection from any other app.** When you ask something vague
  like "fix this" or "which one should I pick?", the agent simulates Ctrl+C
  on the foreground window via a Win32 `AttachThreadInput` trick (bypasses
  the foreground-lock restriction), reads what you had highlighted, and acts
  on it. No more copy-pasting context into a chat. A second hotkey
  (`Ctrl+Shift+A`) wakes the mascot AND pulls the current selection straight
  into the input as a quoted prefix — one shortcut for "ask Buddy about this".
- **Edits in place.** For rewrite/fix/translate requests, the agent pastes
  the result directly back into your active app — replacing the selection.
  You don't switch windows; the mascot does the round trip. The previous
  clipboard contents are snapshotted before the paste, so an `↶ desfazer cola`
  chip in the response can re-paste the original if the edit was wrong.
- **Voice input (STT).** A `🎤` button next to the input pipes Web Speech
  Recognition straight into the prompt field — `en-US` / `pt-BR` / `es-ES`
  matched to the UI locale. The mascot animates as `talking` while listening.
- **Slash commands.** Type `/` in the input to open an autocomplete dropdown:
  `/clear` (reset conversation), `/sleep`, `/agent <name>` (fuzzy match by
  name), `/model haiku|sonnet` (per-turn override of the smart router),
  `/memory <fact>` (force save), `/help`, `/export` (copy thread as markdown).
- **Active-app awareness.** When enabled, the foreground app's process name
  and window title are passed to the system prompt so Buddy knows whether
  you're in Slack, VS Code, Outlook, etc. — useful when the question is vague.
  Privacy-preserving: title only, never the page content.
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
  / Run buttons gates every execution. Destructive patterns (`Remove-Item`,
  `rm -rf`, `format`, `reg delete`, `Stop-Computer`, etc.) paint the card
  red with an explicit "RUN (destructive!)" label. A per-pattern allowlist
  checkbox ("always allow `npm test*`") removes friction in dev loops.
  While running, the card shows live elapsed time + a `+1 min` extend
  button + a `Kill` button. Result (stdout, stderr, exit code, duration)
  comes back as an expandable card in the bubble.
- **MCP support.** Connect any [Model Context Protocol](https://modelcontextprotocol.io)
  server (filesystem, github, slack, postgres, brave-search, memory, etc).
  Add via form or paste a Claude-Desktop-style JSON config. Tools auto-merge
  into the agent's toolbox with `<server>_<tool>` prefix routing. Stdio
  transport, encrypted env vars, status pills (running/starting/crashed/
  stopped) with text+icon+color so it's color-blind safe. Each server card
  has a `Test connection` button (full handshake before saving) and a
  `View logs` modal that exposes stderr + curated hints for common errors
  (ENOENT, handshake timeout). When a server crashes mid-session a banner
  in the bubble surfaces the failure and its tools are auto-filtered out.
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
  multi-step tasks autonomously. Safety rails: a **pre-flight modal**
  (default-focus Cancel) confirms the goal before the first action of any
  turn; the overlay header shows live `step N/30`; around step 25 the agent
  emits a "lost?" cue with an inline redirect input; and `Ctrl+Shift+Esc`
  is a global **panic key** that aborts the loop from any focused app.
- **Extended thinking.** For heavy questions (>500 chars or deep-dive
  keywords like "explain in detail", "passo a passo") the API call flips
  on `thinking: { enabled, budget_tokens: 4000 }`; the bubble label changes
  to "thinking deeper…" so you know.
- **Markdown export.** A `↗` button in the bubble header copies the
  current conversation as a clean `**Q:** … **A:** …` markdown blob to the
  clipboard. Also available via `/export`.
- **Mascot reacts to outcomes.** Two extra sprite states — `happy` (more
  saturated palette + tiny hop) on tool success / `playDone`, and
  `confused` (desaturated + blinking `?`) on errors. Same pixel-art grid,
  no sprite-sheet bloat.
- **First-run onboarding.** Detects the OS locale (`pt`/`es`/`en`) on
  first boot so brazilians/hispanos don't get an English-only experience.
  After the API key is saved the mascot wakes straight into a welcome
  bubble explaining the hotkey. The first 5 wakes rotate a tip-of-the-day
  (`drag a folder`, `agent mode drives your PC`, `screenshot a region`,
  `MCP servers`). The mascot sprite uses `cursor: grab` and shows a brief
  "drag to move" hint on the first two sessions.
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
  Tooltip updates with the mascot's current state (sleeping / idle /
  thinking / error). When autostart is hidden, a once-per-day native
  Windows toast reminds you the app is running.
- **Smart model routing.** Picks Haiku for short questions, Sonnet for
  complex ones based on heuristics on length, keywords, conversation depth,
  and attachment size — keeps cost down without manual switching. The
  per-turn model + cumulative session tokens + estimated USD cost are
  shown as a small footer chip (`✦ sonnet · web 2/3 · 1.2k tok · $0.012`).
- **Stop streaming + retry.** Mid-response, a small `◼` cancels the
  ongoing call (proper `AbortSignal` propagation, no wasted tokens). A
  `↻ refazer` quick-reply pops the last turn and re-runs the same
  question. Transient errors (`NETWORK`, `RATE_LIMITED`, `UNKNOWN`) get a
  `↻ tentar de novo` button; auth errors (`INVALID_API_KEY`) get an
  `Open config` button instead of generic OK.
- **Copy + syntax highlight.** Each code block gets a hover `⧉` copy
  button and a tiny `⧉` exists for the whole response. Markdown rendered
  via `rehype-highlight` (github-dark, with a light-theme override).
- **Conversation niceties.** The previous user question is shown above
  each response (truncated, tooltip-full). `Continue` collapses the prior
  answer into a one-line `↳ resposta anterior · expand` strip instead of
  hiding it. `↑` in an empty input scrolls through your prompt history
  (terminal-style). `Esc` and click-outside the bubble both close it.
- **Citations.** Web-search results from the server-side tool surface as
  a clickable `**Fontes:**` list at the end of the response.
- **save_memory transparency.** When the agent saves a memory, the chip
  shows the fact verbatim with an `↶ esquecer` button that deletes it
  inline — no need to open Settings.
- **Rich attachments.** Drag images straight onto the mascot to inline
  them as base64 (≤5MB) instead of via path scope. Folders get pre-counted
  ("📁 src · 1247 arquivos · 200 acessíveis"). The 5/30/15 MB caps (image/
  PDF/DOCX) get a localized toast instead of a silent failure. Sensitive
  folders (home, `.ssh`, `.aws`, Documents) require explicit confirmation.
- **Personalization.** Optional `userName` field in Settings → General;
  when set, greetings interpolate it ("Bom dia, Dereck!") and the system
  prompt mentions it sparingly. Settings → Agents has a "Duplicate as
  custom" button on every built-in so you can fork its prompt cleanly.
- **Customizable hotkey + import/export.** Hotkey is rebindable via a
  capture-keys widget with conflict detection (`globalShortcut.isRegistered`).
  Settings → About has Export / Import buttons that round-trip the full
  config (agents, MCP configs sans secrets, settings) as a JSON file so
  you can carry it across machines (the per-machine encrypted store
  otherwise locks it to the original PC).
- **Multi-monitor aware.** On hotkey wake, the mascot snaps to the bottom-
  right of whichever display the cursor is on.

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

> **Gotcha:** if you have `ELECTRON_RUN_AS_NODE=1` set in your shell (some
> tools set it globally), Electron boots as plain Node — `app`,
> `BrowserWindow`, etc. become undefined and the app crashes at startup
> with cryptic errors. Run `unset ELECTRON_RUN_AS_NODE` (bash/zsh) or
> `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction Ignore` (PowerShell)
> before `npm run dev`.

To build a Windows installer:

```bash
npm run package    # produces release/Claude Buddy Setup <version>.exe
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
