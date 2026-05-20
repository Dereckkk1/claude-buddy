# MCP Support — Design Spec

**Date:** 2026-05-20
**Project:** Claude Buddy
**Status:** Design approved, ready for implementation plan
**Author:** brainstormed with the user

---

## Problem

Claude Buddy ships with four built-in tools (`read_selection`, `edit_in_place`, `save_memory`, `web_search`) plus the file reading (`list_folder`/`read_file`) and shell (`run_command`) we just added. Every new capability today means coding a new tool from scratch. The community has already built dozens of MCP servers — filesystem, github, slack, postgres, brave-search, fetch, memory, sqlite, etc — that the app can't currently use. Adding MCP support unlocks the entire ecosystem at once, and also signals that we understand and embrace Anthropic's protocol.

## Goal

Let the user configure local MCP servers (stdio transport) via the settings UI. The app spawns enabled servers at startup, discovers their tools, surfaces them to the model under a `<server>_<tool>` prefixed name, and routes invocations transparently. The model treats MCP tools identically to native ones.

## Non-goals (deferred to v2)

- **Resources and prompts** — only tools this iteration. Resources (readonly data endpoints) and prompts (templates) are rarely used in practice and add ~30% of implementation work.
- **SSE / Streamable HTTP transports** — stdio only. Covers 100% of the official `@modelcontextprotocol/server-*` packages.
- **Lazy server startup** — eager startup of enabled servers is mandatory so the model sees all tools upfront. (See Q4 trade-off discussion in the brainstorm notes.)
- **Per-tool permissions** (e.g. GitHub read-only)
- **Auto-discovery / catalog** — no built-in registry of public servers
- **Workspace-scoped configs** — global only
- **Hot-reload** — config changes require app restart (or manual server restart from the UI)
- **Sampling** (server-requested LLM calls back to the client)

---

## User-facing behavior

### Configuration

A new tab **MCP Servers** appears in the Settings window between **Agents** and **Memories**. Empty by default. Two ways to add:

1. **Add server** → form with: name, command, args (one per line or comma-separated), env vars (key + value, value masked like a password with a "show" toggle), enabled checkbox, Save.
2. **Import from JSON** → textarea accepting the de-facto standard format used by Claude Desktop and Cursor:
   ```json
   {
     "mcpServers": {
       "filesystem": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/Users/marke/projects"],
         "env": {}
       }
     }
   }
   ```
   The importer validates, reports `added: N, errors: [...]`, and adds the valid ones. Existing names get a `-2` suffix to avoid collision.

### Status indicators

The server list shows each entry with:
- A **status dot**: ● green (running), ● amber (starting), ● red (crashed), ⊙ gray (disabled)
- The server name, command preview (`npx @modelcontextprotocol/server-filesystem …`), and tool count (`12 tools`)
- A toggle for enabled/disabled
- An **Edit** button and (only when red) a **Restart** button
- Hovering a red dot shows the `errorMessage` as a tooltip

### Agent behavior

When the agent makes a request, every running server's tools are merged into the `tools` array of the Anthropic API call alongside our native tools. Tool names are prefixed with `<server>_` (sanitized snake_case). So a `filesystem` server's `read_file` becomes `filesystem_read_file` to the model. Our native `read_file` (from the file-reading feature) stays as `read_file` — no prefix.

When the agent calls a prefixed tool, the renderer routes the call through `mcp:call-tool` to the main process, which forwards it to the right `MCPClient` via the SDK. The result comes back as the same `ToolResult` shape we already use, so claude.ts doesn't need to know it came from MCP.

If the model tries to call a tool whose server crashed, the tool result is `error: server <name> not running`. The agent responds naturally ("I can't reach the GitHub server right now"). No popup, no chat noise.

---

## Architecture

### Dependencies

- **`@modelcontextprotocol/sdk`** (new runtime dep, npm: `@modelcontextprotocol/sdk`). Handles JSON-RPC, capability negotiation, transport abstraction, tool listing/calling. Vite-electron externalizes it like other Node-only deps.

### Shared types (`shared/mcp-types.ts`, new)

```typescript
export interface MCPServerConfig {
  id: string;                            // uuid
  name: string;                          // user-given; lowercased + sanitized for prefix
  command: string;                       // e.g. "npx"
  args: string[];                        // e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
  env: Record<string, string>;           // encrypted at rest by electron-store
  enabled: boolean;
}

export type MCPServerStatus = 'stopped' | 'starting' | 'running' | 'crashed';

export interface MCPServerState {
  id: string;
  status: MCPServerStatus;
  toolCount: number;
  errorMessage?: string;
  lastStartedAt?: number;
}

export interface MCPToolDef {
  serverId: string;
  serverName: string;       // sanitized; same string used in the prefix
  prefixedName: string;     // "<serverName>_<originalName>"
  originalName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPCallToolResult {
  ok: boolean;
  content: string;          // joined text content of the MCP CallToolResult
  error?: string;
}
```

### Main process: `electron/mcp.ts` (new, ~300-400 LOC)

Single module owning the entire MCP lifecycle. Public API:

```typescript
// Config CRUD
export function listConfigs(): MCPServerConfig[];
export function addConfig(input: Omit<MCPServerConfig, 'id'>): MCPServerConfig;
export function updateConfig(id: string, patch: Partial<MCPServerConfig>): MCPServerConfig | null;
export function deleteConfig(id: string): void;
export function importJson(json: string): { added: number; errors: string[] };

// Lifecycle
export function startServer(id: string): Promise<void>;
export function stopServer(id: string): Promise<void>;
export function restartServer(id: string): Promise<void>;
export function startAllEnabled(): Promise<void>;
export function stopAll(): Promise<void>;

// Inspection
export function getStates(): MCPServerState[];
export function listAllTools(): MCPToolDef[];

// Tool execution
export function callTool(prefixedName: string, input: Record<string, unknown>): Promise<MCPCallToolResult>;

// Events (used by main.ts to broadcast to renderer)
export function onStatesChanged(cb: (states: MCPServerState[]) => void): () => void;
```

Internal:
- `Map<id, ClientEntry>` where `ClientEntry = { config, client: Client, transport: StdioClientTransport, state, tools, abort: AbortController }`
- Encrypted `electron-store` instance: `claude-buddy-mcp`
- Name sanitization: lowercase → replace non-`[a-z0-9_]` with `_` → collapse runs of `_` → strip leading/trailing `_`. Example: `"Brave Search"` → `"brave_search"`.
- Env var expansion: `${HOME}` and `${USERPROFILE}` expand to `os.homedir()`. Anything else stays literal (no recursive expansion).
- `startServer`: instantiate `StdioClientTransport({ command, args, env, stderr: 'pipe' })`, create `Client`, await `client.connect(transport)` with 10s timeout, then `client.listTools()`. Each tool is wrapped into an `MCPToolDef`. Save to entry, set status to `running`, emit `onStatesChanged`.
- `stopServer`: `transport.close()` + `client.close()`, kill child if still alive, clear from map (or set to `'stopped'` if we want to preserve crash info — choose `stopped` and clear the entry).
- Child crash detection: listen on `transport.onerror` / process exit code. If exited unexpectedly, status → `crashed` with `errorMessage` from stderr buffer.
- `callTool(prefixedName)`: parse `prefixedName` by splitting on the first `_` matching a known server name. If server not found or not `running`, return `{ ok: false, error: 'server <name> not running' }`. Else `client.callTool({ name: originalName, arguments: input })` with 30s timeout. Convert the SDK's `CallToolResult` (which has `content: Array<TextContent | ImageContent | ...>`) into a single string by joining text-type content blocks. For non-text content this iteration, return a placeholder note `[non-text content from <server>]` (we can handle image content properly later).

### IPC additions (`shared/ipc-types.ts`)

```typescript
'mcp:list-configs':   () => MCPServerConfig[];
'mcp:add-config':     (cfg: Omit<MCPServerConfig, 'id'>) => MCPServerConfig;
'mcp:update-config':  (params: { id: string; patch: Partial<MCPServerConfig> }) => MCPServerConfig | null;
'mcp:delete-config':  (id: string) => void;
'mcp:import-json':    (json: string) => { added: number; errors: string[] };
'mcp:list-states':    () => MCPServerState[];
'mcp:restart-server': (id: string) => Promise<void>;
'mcp:list-tools':     () => MCPToolDef[];
'mcp:call-tool':      (params: { prefixedName: string; input: Record<string, unknown> }) =>
  MCPCallToolResult;
```

Plus an event push: `'mcp:states-changed'` carrying `MCPServerState[]`.

### Main process integration (`electron/main.ts`)

- Import: `import * as mcp from './mcp';`
- In `bootstrap()`, after `initAgentsIfNeeded`, call `mcp.startAllEnabled()` (don't await — let it run in background; UI shows starting → running as servers come up).
- In `app.on('will-quit')`, before `unregisterHotkeys()`, call `await mcp.stopAll()` with a 5s timeout to avoid hanging the quit.
- Hook `mcp.onStatesChanged` to broadcast on the mascot window.
- Register the 9 new IPC handlers above (all thin wrappers around the `mcp.*` exports).

### Renderer integration

**`src/services/claude.ts`** — extend the tools array:

```typescript
const mcpTools = await invoke('mcp:list-tools');
const tools = [
  ...TOOLS,
  WEB_SEARCH_TOOL,
  ...mcpTools.map(t => ({
    name: t.prefixedName,
    description: t.description,
    input_schema: t.inputSchema,
  })),
];
```

**`src/services/skills.ts`** — add a fallback to `executeTool`. Maintain a `mcpToolNames: Set<string>` cache populated from `mcp:list-tools` and refreshed on `mcp:states-changed`:

```typescript
default: {
  if (mcpToolNames.has(name)) {
    const r = await invoke('mcp:call-tool', { prefixedName: name, input });
    if (r.ok) return { content: r.content };
    return { content: `error: ${r.error ?? 'unknown error'}` };
  }
  return { content: `Tool desconhecida: ${name}` };
}
```

The cache subscription lives in a small helper (`src/services/mcp-tools-cache.ts`) initialized at app boot from `src/main.tsx`. Same module exposes a `useMCPStates()` React hook for the settings UI to consume.

### Settings UI: `settings-window/MCPTab.tsx` (new)

Mirrors the structure of `AgentsTab.tsx`:

- List mode by default. Header has "+ Add server" (primary button) and "Import from JSON" (ghost button).
- Each server row: status dot + name (bold) + meta line (`12 tools · npx @modelcontextprotocol/server-filesystem`) + enabled toggle on the right + Edit button + Restart button (only when crashed).
- Editor form for new/edit: name, command, args (one per line in a textarea, joined/split on save), env vars (table-like list with add/remove rows, value field is `type=password` with eye toggle), enabled checkbox, Save / Cancel / Delete (only on edit, only for non-default).
- Import modal: textarea with placeholder showing the expected JSON shape, Validate button shows preview (count + errors), Import button commits.
- Status dot color comes from `useMCPStates()`. The hook re-renders on `mcp:states-changed`.

A new entry in the settings sidebar between Agents and Memories: `t('settings.sidebar.mcp')` = "MCP Servers" / "Servidores MCP" / "Servidores MCP".

### i18n strings to add

New section `settings.mcp.*` in EN/PT/ES:
- `heading`, `addServer`, `importJson`, `name`, `command`, `args`, `envVars`, `envKey`, `envValue`, `enabled`, `restart`, `edit`, `delete`, `cancel`, `save`, `noServers`, `toolsCount`, `confirmDelete`, `jsonHeading`, `jsonPlaceholder`, `jsonValidate`, `jsonAdded`, `jsonErrors`, `statusRunning`, `statusStarting`, `statusCrashed`, `statusStopped`, `eyeShow`, `eyeHide`.

Plus `settings.sidebar.mcp`.

---

## Error handling

| Condition | Behavior |
|---|---|
| `command` not on PATH (ENOENT) | `state.status = 'crashed'`, `errorMessage = 'command not found: <cmd>'` |
| Spawn succeeds but no JSON-RPC handshake within 10s | Kill process, `crashed` with timeout error |
| Server crashes during runtime | Exit listener flips status to `crashed`, tools disappear from `listAllTools` |
| `callTool` to a non-running server | Returns `{ ok: false, error: 'server <name> not running' }` |
| `callTool` exceeds 30s | Abort signal kills the in-flight RPC, returns `{ ok: false, error: 'tool timed out (30s)' }` |
| Tool schema malformed | Skip that tool when building `MCPToolDef[]`, log warning, other tools from same server still work |
| Server emits non-text content | Joined text contents only, append `[+ <n> non-text items]` if there were any |
| JSON import malformed | Returns `errors: ['parse error: ...']`, nothing added |
| JSON import has individual invalid entries | Adds the valid ones, returns `errors` per failed entry |
| Two configs with the same sanitized name | Second one is auto-renamed by appending `-2`, `-3` etc on add/import |
| Env var with `${UNDEFINED_VAR}` | Stays literal — no error |

---

## Testing

### Unit (`tests/mcp.test.ts`)

Tests target the pure functions exposed by `electron/mcp.ts` without spawning real servers. Mock the SDK Client.

- `sanitizeName('Brave Search')` → `'brave_search'`; `'GitHub-Helper'` → `'github_helper'`; `'__weird__name__'` → `'weird_name'`
- Name collision on add: adding two servers both sanitizing to `foo` → second becomes `foo-2`
- `parsePrefixedName('filesystem_read_file', knownServers: ['filesystem'])` → `{ serverName: 'filesystem', originalName: 'read_file' }`
- `parsePrefixedName('filesystem_read_file', knownServers: ['fs', 'filesystem_read'])` → matches the longest server name prefix (`'filesystem_read'`)
- `expandEnvVars({ FOO: '${HOME}/x' })` → `{ FOO: '<homedir>/x' }`
- JSON import: valid Claude-Desktop-shaped JSON → returns `added: N`, `errors: []`. Malformed → `added: 0, errors: ['...']`. Mix of valid + invalid → returns the count of valid plus an entry-level error message for each bad one.
- Tool result content joining: SDK CallToolResult with two TextContent and one ImageContent → joined text is the two strings concatenated, plus `[+ 1 non-text item]` suffix

### Integration (manual smoke after impl)

- Add a server with command `npx -y @modelcontextprotocol/server-filesystem <tmpdir>`. Status flips green within a few seconds. Tools appear in the model's view.
- Chat: "list the files in the attached folder using the filesystem MCP server" → model calls `filesystem_list_directory` or similar → result shows.
- Disable the server in settings → tools disappear from the next API call.
- Restart it → tools reappear.
- Kill the underlying process externally (`taskkill /im node.exe /f` on the right pid) → status flips red within a few seconds → tooltip shows error.
- Click Restart → status flips amber → green.
- Import a JSON config copied verbatim from a Claude Desktop config → both servers added, both start.
- Add a server with a deliberately wrong command → status stays red, errorMessage useful.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Eager startup makes app boot slow with many configured servers | Servers spawn in parallel; UI shows "starting" status; user sees app come up immediately. Workaround if it ever becomes a real issue: defer startup until first chat ("warm-eager"). |
| Compromised server (or malicious config) executes arbitrary code | User has to deliberately add the command — equivalent trust to running `npm install`. Document this risk in the README. No sandbox in v1. |
| Env vars leak via app logs | Never log env contents in main or renderer. The encrypted store is the only persistence path. Password-masked input. |
| Token exfiltration via a server that calls home | Trust boundary as above. The app forwards env to the server we trust. |
| User pastes JSON with an unknown shape (Cursor / Claude Code variants) | Parser is liberal: accepts both `{ mcpServers: {...} }` and a bare `{...}` root. Returns descriptive errors for unrecognized fields. |
| Two tools, same server, same name (server bug) | Skip duplicates on `listTools`, log warning. |
| Server stdout pollutes logs | Suppress stdout entirely (SDK consumes it via transport). Stderr only surfaces on crash via the errorMessage field. |
| `npx` first-run downloads slow the spawn | Inherent — `npx` will cache after first call. We do not pre-install. |

---

## Open questions

None — design fully scoped via the brainstorm.

---

## Estimated implementation size

- New code: ~900-1100 LOC
  - `electron/mcp.ts` ~350
  - `settings-window/MCPTab.tsx` ~300
  - `shared/mcp-types.ts` ~50
  - `src/services/mcp-tools-cache.ts` ~80
  - i18n strings ~150
  - tests ~150
- Modified code: ~200 LOC
  - `electron/main.ts` (handlers + startup wiring) ~80
  - `shared/ipc-types.ts` ~25
  - `src/services/claude.ts` ~10
  - `src/services/skills.ts` ~20
  - `settings-window/SettingsApp.tsx` (new tab routing) ~30
  - `src/main.tsx` (cache init) ~5
  - `package.json` ~5
- New dep: `@modelcontextprotocol/sdk`

Net: 1-2 working sessions. The biggest unknown is debugging the first end-to-end spawn — once one server starts cleanly, the pattern is established.
