# Run Command — Design Spec

**Date:** 2026-05-20
**Project:** Claude Buddy
**Status:** Design approved, ready for implementation plan
**Author:** brainstormed with the user

---

## Problem

The mascot can read selections, edit them back, attach files/folders, and search the web — but it cannot actually *do* anything on the user's machine. Common requests like "install zustand here", "run the tests", "what processes are eating memory?", "create a branch and commit this" all require shell access. Without it, the mascot stays in the "read and explain" lane, never crossing into "act on the system."

## Goal

Give the agent a `run_command` tool that executes PowerShell commands with **mandatory human-in-the-loop confirmation** before each execution. The user always sees the exact command before it runs, can edit it if needed, and gets structured output back in the bubble.

## Non-goals

- Other shells (cmd, bash, Git Bash) — PowerShell only this iteration.
- Streaming stdout/stderr in real-time — lump-sum on completion. Adds complexity, defer to v2 if real demand.
- Blocklist of "dangerous" commands — the confirmation UI is the safety. The user always sees the exact command before it runs.
- Auto-approve toggle in settings — explicitly out. Every command requires a click. If we ever add auto-approve, it's its own brainstorm with safety considerations.
- Background long-running processes — every command must complete (or time out) within 10 minutes.

---

## User-facing behavior

### Flow

1. Agent decides to run a command, calls `run_command({ command: "npm install zustand", cwd?, timeoutMs? })`.
2. An **approval card** appears inline in the mascot bubble:
   - Border in `#d97757` (brand orange) so it's instantly distinguishable from a normal message.
   - First line: `📐 wants to run a command` (i18n).
   - Second line: the command in a monospaced inline block with a light gray background.
   - Third line (muted): `cwd: C:\Users\marke\Desktop\projeto` (or "home directory" if no folder is attached).
   - Three buttons: **Cancel** (default keyboard focus, gray), **Edit** (toggles a small editable textarea over the command line), **Run** (orange brand fill).
3. User clicks:
   - **Run** → command executes in the main process, card morphs into a result card.
   - **Cancel** → card disappears, tool result is `{ cancelled: true, reason: 'user denied' }`.
   - **Edit** → textarea appears with the command pre-filled; user edits; clicking **Run** then runs the edited version.
4. While the command runs (typically < 10s, but can be up to 10min for npm installs etc), the card shows a small spinner.
5. On completion, the card becomes a **result card** with:
   - Header: `▶ ran: <command shortened> · 1.2s · exit 0` (green check) or `exit 42` (orange) or `timed out` (red).
   - Collapsed by default; clicking the header expands a `<pre>` block with full stdout (and stderr if non-empty, in red).
   - The expansion state persists during the conversation; closing the bubble clears it.

The agent always sees the structured result and can comment on it in its reply.

### Lifecycle

- Approval cards live in a renderer-side **approval registry** (`Map<id, PendingApproval>`).
- Closing the bubble (sleep/idle/close) clears any pending approvals, resolving them as `{ approved: false }` so the agent's tool call doesn't hang forever.
- Multiple pending approvals are supported (rare — usually one at a time) and rendered in submission order.

---

## Architecture

### New module: `electron/shell.ts`

Pure spawn helper, mirrors the structure of `electron/files.ts`. No Electron imports — testable in node.

```typescript
export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

export async function runPowerShell(
  command: string,
  cwd?: string,           // defaults to os.homedir() inside the function
  timeoutMs?: number,     // defaults to 120_000, capped at 600_000
): Promise<RunResult>;
```

Implementation notes:

- Uses `child_process.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', <base64-utf16le>], { cwd, windowsHide: true })`.
- The `EncodedCommand` form avoids all shell-escape issues (spaces, quotes, multiline) — the same trick we already use in `electron/keyboard.ts`.
- Output: stdout and stderr captured as Buffer arrays, joined and decoded as utf8 on close.
- Timeout: `setTimeout` that `child.kill('SIGTERM')`. The `close` event fires shortly after with `timedOut: true`.
- Returns `{ stdout, stderr, exitCode: code ?? -1, durationMs, timedOut }`.

### New module: `src/services/run-command-bridge.ts`

The renderer-side approval registry. The crucial bit that makes `run_command` differ from every other tool: it pauses the agent's stream until the user reacts.

```typescript
export interface PendingApproval {
  id: string;            // uuid
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface ApprovalDecision {
  approved: boolean;
  finalCommand?: string; // present if user edited
  finalCwd?: string;     // present if user edited
}

export function requestApproval(p: Omit<PendingApproval, 'id'>): Promise<ApprovalDecision>;
export function resolveApproval(id: string, decision: ApprovalDecision): void;
export function getPendingApprovals(): PendingApproval[];
export function subscribePendingApprovals(cb: () => void): () => void;
export function usePendingApprovals(): PendingApproval[]; // React hook via useSyncExternalStore
export function clearAllApprovals(): void; // called on bubble close / sleep
```

Internal: `Map<id, PendingApproval & { resolve }>` plus `Set<listener>`. Each `requestApproval` call returns a Promise that's held until `resolveApproval` is called with the matching id; the resolve is stored alongside the entry.

### Tool definition (renderer, `src/services/skills.ts`)

```typescript
{
  name: 'run_command',
  description:
    'Executa um comando PowerShell no Windows do usuário. SEMPRE requer confirmação humana antes de rodar — uma UI inline aparece com o comando proposto + working dir + botões Rodar/Cancelar/Editar. Use pra: instalar deps (npm/pip/cargo), git workflow, listagem de sistema (Get-Process, Get-ChildItem), build/test scripts. NÃO use pra coisas que outras tools cobrem (read_file pra arquivos, web_search pra info online).\n\nUse sintaxe PowerShell: Get-ChildItem em vez de ls, Get-Process em vez de ps, etc. Comandos universais (git, npm, node, python, docker) têm sintaxe igual em ambos.\n\nRetorno: { stdout, stderr, exitCode, durationMs }. exitCode 0 = sucesso. Cancelado pelo user retorna { cancelled: true, reason: "user denied" }.',
  input_schema: {
    type: 'object',
    properties: {
      command:   { type: 'string', description: 'Comando PowerShell completo.' },
      cwd:       { type: 'string', description: 'Working directory absoluto (opcional). Default: primeira pasta em attachedPaths, fallback home do user.' },
      timeoutMs: { type: 'number', description: 'Timeout em ms (opcional). Default 120000 (2 min), max 600000 (10 min).' },
    },
    required: ['command'],
  },
}
```

`executeTool('run_command', input)`:
1. Compute effective `cwd`: explicit `input.cwd` > first folder in `useConversation.getState().attachedPaths` > `undefined` (main will default to home).
2. `const decision = await requestApproval({ command, cwd: effectiveCwd, timeoutMs })`.
3. If `!decision.approved` → return `{ content: JSON.stringify({ cancelled: true, reason: 'user denied' }) }`.
4. Else: `const r = await invoke('shell:run-command', { command: decision.finalCommand ?? command, cwd: decision.finalCwd ?? effectiveCwd, timeoutMs })`.
5. Return `{ content: JSON.stringify(r.result) }` or `{ content: 'error: ' + r.error }`.

### IPC

Add to `shared/ipc-types.ts`:

```typescript
'shell:run-command': (params: { command: string; cwd?: string; timeoutMs?: number }) =>
  { ok: true; result: import('../electron/shell').RunResult } | { ok: false; error: string };
```

Handler in `electron/main.ts` (thin wrapper):

```typescript
'shell:run-command': async ({ command, cwd, timeoutMs }) => {
  try {
    const result = await runPowerShell(command, cwd, timeoutMs);
    return { ok: true, result };
  } catch (e) {
    console.error('[shell] run failed:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'spawn failed' };
  }
}
```

### UI: `src/components/CommandApprovalCard.tsx` (new)

Renders one approval. Two states:

- **Pending state** (default): shows the command, cwd, three buttons (Cancel / Edit / Run). Edit toggles a `<textarea>` for the command. Run is disabled when the (possibly edited) command is empty/whitespace.
- **Running state** (after Run is clicked): replaces the buttons with a spinner + "running…" text. The card is the same DOM node — just rerenders.
- **Result state** (after the command finishes): shows the header line (`▶ ran: <truncated command> · 1.2s · exit 0`), with expandable stdout/stderr. The result state is owned by the card itself via local React state — once the approval is resolved, the approval entry is gone from the registry, but the card keeps rendering its result.

Visual style follows `product-ui-style`:
- Card: near-white fill (`#ffffff`), 2px solid `#d97757` (orange brand) for pending, 1px solid `#e8e6dc` for result-state, large radius (`14-16px`), generous padding.
- Command block: `JetBrains Mono`, light gray bg (`#f5f4ee`), small radius, padding.
- Buttons follow existing `cb-btn` variants (`cb-btn-primary` for Run = orange, `cb-btn-secondary` for Cancel = neutral).
- Result expand: tiny chevron rotates, `<pre>` slides in with `max-height` transition.

### UI integration (`src/App.tsx`)

```typescript
const approvals = usePendingApprovals();

// inside the bubble JSX, between ResponseView and InputPanel:
{showInput && approvals.map(a => (
  <CommandApprovalCard
    key={a.id}
    approval={a}
    onResolve={(decision) => resolveApproval(a.id, decision)}
  />
))}
```

The card itself, after resolving, holds onto the result locally until the bubble unmounts (sleep/close clears via `conv.reset()` and the cards go with it).

The `sleep()` function additionally calls `clearAllApprovals()` to drop pending approvals — this prevents the agent's tool call from hanging forever if the user closes the bubble mid-approval.

### Step label

`run_command: 'ran command'` / `'rodou comando'` / `'ejecutó comando'` in `shared/i18n-strings.ts`. Shows in the assistant message stream when the model dispatches the tool, same as other tools.

---

## Error handling

| Condition | Behavior |
|---|---|
| User clicks Cancel | tool_result: `{ cancelled: true, reason: 'user denied' }` (string) |
| User closes the bubble while approval is pending | All pending approvals auto-resolve as `{ approved: false }`. Agent sees `{ cancelled: true, reason: 'bubble closed' }` |
| `timeoutMs` exceeds 600_000 | Silently capped at 600_000 |
| Command is empty after edit | Run button disabled — can't submit. No error needed |
| `cwd` doesn't exist | `spawn` fails, main returns `{ ok: false, error: 'ENOENT ...' }` |
| `powershell.exe` not on PATH | Same — spawn fails with descriptive error |
| Command exits non-zero | Returned normally — `exitCode: <n>` in the result. Not an error from the IPC layer's perspective |
| Command times out | Returned normally — `timedOut: true, exitCode: -1` |
| Stdout/stderr exceeds memory | Not bounded explicitly this iteration. Trust 10-min timeout to cap; if real issue surfaces, add a buffer ceiling |

---

## Testing

### Unit (`tests/shell.test.ts`)

- `runPowerShell('Write-Output hi')` returns `stdout` matching `/hi/`, `exitCode: 0`, `durationMs > 0`, `timedOut: false`.
- `runPowerShell('exit 42')` returns `exitCode: 42`.
- `runPowerShell('Get-Location', '<tmpdir>')` returns a stdout that includes the tmpdir path (cwd honored).
- `runPowerShell('Start-Sleep 10', undefined, 500)` returns `timedOut: true`, `exitCode: -1`, `durationMs >= 500 && < 2000` (allowing for kill latency).
- `runPowerShell` writes to stderr: `runPowerShell('Write-Error nope')` returns non-empty `stderr` (and exitCode 0 in PowerShell — Write-Error doesn't change exit code by default, document this).

### Unit (`tests/run-command-bridge.test.ts`)

- `requestApproval` returns a pending Promise; `getPendingApprovals()` shows the entry.
- `resolveApproval(id, {approved:true, finalCommand:'foo'})` resolves the promise with that decision; the entry leaves `getPendingApprovals()`.
- `resolveApproval` on an unknown id is a no-op (doesn't throw).
- `subscribePendingApprovals` fires the listener on add and on resolve.
- `clearAllApprovals()` resolves every pending as `{approved:false}` and empties the registry.
- Two independent `requestApproval` calls produce independent promises with distinct ids.

### Smoke (manual, after impl)

- Type "qual é a versão do node?" → agent proposes `node --version` → click Run → see version in expanded card.
- Type "instala zustand aqui" (with claude-buddy folder attached) → agent proposes `npm install zustand` → click Edit → change to `npm install zustand@5.0.0` → click Run → npm runs, expandable shows output, exit 0.
- Type "lista os 5 processos que mais consomem ram" → agent proposes `Get-Process | Sort-Object WS -Descending | Select-Object -First 5` → Run → table in stdout.
- Click Cancel on any proposal → agent says it was cancelled, asks what to do instead.
- Long command: type "espera 3 segundos e diz oi" → agent proposes `Start-Sleep 3; echo hi` → spinner visible for 3s → result.
- Close bubble while approval pending → reopen, see no leftover card. Agent (if it remembers context) acknowledges that the request was abandoned.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| User clicks Run on a dangerous command by accident | Cancel is keyboard-default. The card is large, command is monospace and clearly visible. Editing nudges the user to actually read what's there. We do not auto-focus Run. |
| Agent burns time proposing trivial commands the user would prefer to type themselves | Tool description discourages overuse: "NÃO use pra coisas que outras tools cobrem." Acceptable risk — user can just say "para com isso, executa direto." |
| Command produces enormous output (Get-ChildItem on /Users recursive) | 10-min timeout caps duration. If memory becomes an issue in practice, add a buffer ceiling in v2. |
| Approval Promise leaks if app reloads mid-await | The renderer state isn't persisted; on reload the in-memory map is empty. The agent's HTTP request will hang on the Anthropic side until the original abort/timeout. Acceptable for dev iteration; in packaged build, the user clicking sleep clears it. |
| Some PowerShell commands hang on stdin (`Read-Host`) | We pass `-NonInteractive` to spawn, which makes such commands fail immediately rather than hang. |
| Encoding issues with non-ASCII stdout (e.g. `ç`, `é`) | PowerShell defaults to UTF-16 internally; `-EncodedCommand` is the input encoding only. Output decoding uses utf8 — if real garbling appears, add `[Console]::OutputEncoding = [Text.Encoding]::UTF8;` as a one-time prefix to every command. |

---

## Out of scope (deferred to v2 if real demand)

- Streaming stdout/stderr to the UI in real-time
- Auto-approve toggle in settings
- Blocklist / whitelist of commands
- Multiple shells (cmd, bash, git-bash)
- Background processes (`Start-Job`, daemonized)
- Output truncation/pagination for huge stdout
- Configurable per-agent permissions (Buddy can't run shell, Code Helper can)
- Recording history of executed commands in memories

---

## Open questions

None — design fully nailed down via brainstorming.

---

## Estimated implementation size

- New code: ~500-700 LOC (mostly `electron/shell.ts`, `run-command-bridge.ts`, `CommandApprovalCard.tsx`, tests)
- Modified code: ~150 LOC (skills.ts case, IPC types, main handler, App.tsx integration, i18n, sleep clears approvals)
- Tests: ~250 LOC
- New dependencies: none — `child_process` and React internals only

Net: 1 working session if focused.
