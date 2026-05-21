// MCP (Model Context Protocol) client manager.
//
// One module owns the entire lifecycle: config CRUD (persisted in an encrypted
// electron-store), spawning servers via @modelcontextprotocol/sdk's
// StdioClientTransport, listing tools, routing tool calls, and emitting
// state-change events for the UI.
//
// Tools are name-prefixed with the server's sanitized name to avoid conflicts
// and to make routing deterministic (split on first underscore that yields a
// known server name).

import Store from 'electron-store';
import { machineIdSync } from 'node-machine-id';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type {
  MCPServerConfig,
  MCPServerState,
  MCPServerStatus,
  MCPToolDef,
  MCPCallToolResult,
} from '../shared/mcp-types';

// SDK types — imported lazily inside async functions because the package is
// ESM and the bundler may not pre-load it. Concrete imports done via
// `await import(...)` at call time.
type SDKClient = {
  connect: (transport: unknown, options?: { timeout?: number }) => Promise<void>;
  close: () => Promise<void>;
  listTools: () => Promise<{ tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }>;
  callTool: (
    params: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: unknown,
    options?: { timeout?: number; signal?: AbortSignal }
  ) => Promise<{ content?: Array<{ type: string; text?: string }>; isError?: boolean }>;
};

type SDKTransport = {
  onerror?: (err: unknown) => void;
  onclose?: () => void;
  close: () => Promise<void>;
};

// ─── Persistence ────────────────────────────────────────────────────────────

interface MCPSchema {
  configs?: MCPServerConfig[];
}

const encryptionKey = machineIdSync(true).slice(0, 32);
const mcpStore = new Store<MCPSchema>({
  name: 'claude-buddy-mcp',
  encryptionKey,
  defaults: { configs: [] },
});

// ─── In-memory runtime state ────────────────────────────────────────────────

interface RuntimeEntry {
  config: MCPServerConfig;
  client?: SDKClient;
  transport?: SDKTransport;
  state: MCPServerState;
  tools: MCPToolDef[];
}

const runtime = new Map<string, RuntimeEntry>();
const stateListeners = new Set<(states: MCPServerState[]) => void>();

function notifyStates(): void {
  const states = Array.from(runtime.values()).map((e) => e.state);
  stateListeners.forEach((cb) => cb(states));
}

export function onStatesChanged(cb: (states: MCPServerState[]) => void): () => void {
  stateListeners.add(cb);
  return () => { stateListeners.delete(cb); };
}

// ─── Sanitization & name parsing ────────────────────────────────────────────

export function sanitizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'server';
}

/**
 * Pick the server whose prefix is the longest match against the start of
 * `prefixedName` (avoids ambiguity when one prefix is a prefix of another,
 * e.g. "fs" and "filesystem_read").
 */
export function parsePrefixedName(
  prefixedName: string,
  knownPrefixes: string[],
): { serverName: string; originalName: string } | null {
  let best: string | null = null;
  for (const p of knownPrefixes) {
    if (prefixedName === p + '_' + prefixedName.slice(p.length + 1) && (!best || p.length > best.length)) {
      // sanity check: the segment after the prefix exists
      if (prefixedName.length > p.length + 1) best = p;
    }
  }
  if (!best) return null;
  return { serverName: best, originalName: prefixedName.slice(best.length + 1) };
}

// ─── Env var expansion (${HOME}, ${USERPROFILE}) ────────────────────────────

export function expandEnvVars(env: Record<string, string>): Record<string, string> {
  const home = os.homedir();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    out[k] = v
      .replace(/\$\{HOME\}/g, home)
      .replace(/\$\{USERPROFILE\}/g, home);
  }
  return out;
}

// ─── Config CRUD ────────────────────────────────────────────────────────────

function ensureUniquePrefix(prefix: string, excludeId?: string): string {
  const existing = listConfigs()
    .filter((c) => c.id !== excludeId)
    .map((c) => c.prefix);
  if (!existing.includes(prefix)) return prefix;
  for (let i = 2; ; i++) {
    const candidate = `${prefix}_${i}`;
    if (!existing.includes(candidate)) return candidate;
  }
}

export function listConfigs(): MCPServerConfig[] {
  return mcpStore.get('configs') ?? [];
}

export function addConfig(input: Omit<MCPServerConfig, 'id' | 'prefix'>): MCPServerConfig {
  const id = randomUUID();
  const prefix = ensureUniquePrefix(sanitizeName(input.name));
  const config: MCPServerConfig = { ...input, id, prefix };
  const configs = listConfigs();
  configs.push(config);
  mcpStore.set('configs', configs);
  // Initialize runtime entry as 'stopped'
  runtime.set(id, { config, state: stopped(id), tools: [] });
  notifyStates();
  return config;
}

export function updateConfig(id: string, patch: Partial<Omit<MCPServerConfig, 'id'>>): MCPServerConfig | null {
  const configs = listConfigs();
  const idx = configs.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const merged: MCPServerConfig = { ...configs[idx], ...patch, id };
  if (patch.name) {
    merged.prefix = ensureUniquePrefix(sanitizeName(patch.name), id);
  }
  configs[idx] = merged;
  mcpStore.set('configs', configs);
  const entry = runtime.get(id);
  if (entry) entry.config = merged;
  return merged;
}

export function deleteConfig(id: string): void {
  const configs = listConfigs().filter((c) => c.id !== id);
  mcpStore.set('configs', configs);
  // Stop and remove runtime
  void stopServer(id).catch(() => {});
  runtime.delete(id);
  notifyStates();
}

// ─── JSON import (Claude Desktop / Cursor format) ───────────────────────────

interface ImportShape {
  mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
}

export function importJson(rawJson: string): { added: number; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    return { added: 0, errors: [`parse error: ${e instanceof Error ? e.message : 'invalid JSON'}`] };
  }
  // Accept either { mcpServers: {...} } or a bare {...} as the servers map
  const candidate = parsed as ImportShape;
  const map = candidate.mcpServers ?? (parsed as Record<string, unknown>);
  if (typeof map !== 'object' || map === null) {
    return { added: 0, errors: ['expected object at root or mcpServers key'] };
  }
  let added = 0;
  for (const [name, raw] of Object.entries(map as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) {
      errors.push(`${name}: entry is not an object`);
      continue;
    }
    const entry = raw as { command?: unknown; args?: unknown; env?: unknown };
    if (typeof entry.command !== 'string' || !entry.command) {
      errors.push(`${name}: missing or invalid command`);
      continue;
    }
    const args = Array.isArray(entry.args) ? entry.args.filter((a): a is string => typeof a === 'string') : [];
    const env: Record<string, string> = {};
    if (entry.env && typeof entry.env === 'object') {
      for (const [k, v] of Object.entries(entry.env as Record<string, unknown>)) {
        if (typeof v === 'string') env[k] = v;
      }
    }
    addConfig({ name, command: entry.command, args, env, enabled: true });
    added++;
  }
  return { added, errors };
}

// ─── State helpers ──────────────────────────────────────────────────────────

function stopped(id: string): MCPServerState {
  return { id, status: 'stopped', toolCount: 0 };
}

function setStatus(id: string, status: MCPServerStatus, errorMessage?: string): void {
  const entry = runtime.get(id);
  if (!entry) return;
  entry.state = {
    id,
    status,
    toolCount: entry.tools.length,
    errorMessage,
    lastStartedAt: status === 'starting' || status === 'running' ? Date.now() : entry.state.lastStartedAt,
  };
  notifyStates();
}

export function getStates(): MCPServerState[] {
  // Make sure every config has a runtime entry (could be missing after a fresh app launch)
  for (const cfg of listConfigs()) {
    if (!runtime.has(cfg.id)) {
      runtime.set(cfg.id, { config: cfg, state: stopped(cfg.id), tools: [] });
    }
  }
  return Array.from(runtime.values()).map((e) => e.state);
}

export function listAllTools(): MCPToolDef[] {
  const all: MCPToolDef[] = [];
  for (const entry of runtime.values()) {
    if (entry.state.status === 'running') all.push(...entry.tools);
  }
  return all;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

export async function startServer(id: string): Promise<void> {
  const entry = runtime.get(id) ?? (() => {
    const cfg = listConfigs().find((c) => c.id === id);
    if (!cfg) throw new Error('config not found');
    const e: RuntimeEntry = { config: cfg, state: stopped(id), tools: [] };
    runtime.set(id, e);
    return e;
  })();

  if (entry.state.status === 'running' || entry.state.status === 'starting') return;
  setStatus(id, 'starting');
  console.log(`[mcp] starting ${entry.config.name} (${entry.config.command} ${entry.config.args.join(' ')})`);

  try {
    const { Client } = (await import('@modelcontextprotocol/sdk/client/index.js')) as typeof import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = (await import('@modelcontextprotocol/sdk/client/stdio.js')) as typeof import('@modelcontextprotocol/sdk/client/stdio.js');

    const expandedEnv = expandEnvVars(entry.config.env);
    // Merge a sane base env so commands like `npx` resolve via PATH. We have
    // to be careful: in packaged Electron, process.env may have very few
    // entries on macOS/Linux but PATH is critical for command resolution.
    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter((p): p is [string, string] => typeof p[1] === 'string'),
      ),
      ...expandedEnv,
    };

    const transport = new StdioClientTransport({
      command: entry.config.command,
      args: entry.config.args,
      env,
      stderr: 'pipe',
    }) as unknown as SDKTransport;

    const client = new Client({ name: 'claude-buddy', version: '0.4.0' }) as unknown as SDKClient;

    // Capture stderr for the crash message — useful when handshake fails
    // because of an exit before the JSON-RPC is even established.
    let stderrBuffer = '';
    const transportInternal = transport as unknown as { stderr?: NodeJS.ReadableStream };
    if (transportInternal.stderr && typeof transportInternal.stderr.on === 'function') {
      transportInternal.stderr.on('data', (chunk: Buffer | string) => {
        stderrBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (stderrBuffer.length > 8000) stderrBuffer = stderrBuffer.slice(-8000);
      });
    }

    transport.onerror = (err: unknown) => {
      const e = runtime.get(id);
      if (!e) return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mcp] ${entry.config.name} transport error:`, msg, stderrBuffer ? `\nstderr: ${stderrBuffer}` : '');
      e.tools = [];
      setStatus(id, 'crashed', `${msg}${stderrBuffer ? '\n— stderr —\n' + stderrBuffer : ''}`);
    };
    transport.onclose = () => {
      const e = runtime.get(id);
      if (!e) return;
      if (e.state.status === 'running' || e.state.status === 'starting') {
        console.error(`[mcp] ${entry.config.name} process exited`, stderrBuffer ? `\nstderr: ${stderrBuffer}` : '');
        e.tools = [];
        setStatus(id, 'crashed', `process exited unexpectedly${stderrBuffer ? '\n— stderr —\n' + stderrBuffer : ''}`);
      }
    };

    // Handshake. First-run npx can take 30s+ to download the package, so
    // give it 60s before bailing.
    console.log(`[mcp] ${entry.config.name} connecting…`);
    await client.connect(transport, { timeout: 60_000 });
    console.log(`[mcp] ${entry.config.name} connected, listing tools…`);

    const listed = await client.listTools();
    const tools: MCPToolDef[] = [];
    const seenNames = new Set<string>();
    for (const t of listed.tools ?? []) {
      if (!t.name || seenNames.has(t.name)) continue;
      seenNames.add(t.name);
      tools.push({
        serverId: id,
        serverName: entry.config.prefix,
        prefixedName: `${entry.config.prefix}_${t.name}`,
        originalName: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
      });
    }
    entry.client = client;
    entry.transport = transport;
    entry.tools = tools;
    console.log(`[mcp] ${entry.config.name} running — ${tools.length} tools: ${tools.map(t => t.originalName).join(', ')}`);
    setStatus(id, 'running');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error && e.stack ? e.stack : '';
    console.error(`[mcp] ${entry.config.name} startServer FAILED:`, msg);
    if (stack) console.error(stack);
    entry.client = undefined;
    entry.transport = undefined;
    entry.tools = [];
    setStatus(id, 'crashed', msg);
  }
}

export async function stopServer(id: string): Promise<void> {
  const entry = runtime.get(id);
  if (!entry) return;
  const wasRunning = entry.state.status === 'running' || entry.state.status === 'starting';
  try {
    if (entry.client) await entry.client.close().catch(() => {});
  } catch { /* swallow */ }
  try {
    if (entry.transport) await entry.transport.close().catch(() => {});
  } catch { /* swallow */ }
  entry.client = undefined;
  entry.transport = undefined;
  entry.tools = [];
  if (wasRunning) setStatus(id, 'stopped');
}

export async function restartServer(id: string): Promise<void> {
  await stopServer(id);
  await startServer(id);
}

export async function startAllEnabled(): Promise<void> {
  const configs = listConfigs();
  // Hydrate runtime for every config so the UI can show 'stopped' for disabled ones
  for (const cfg of configs) {
    if (!runtime.has(cfg.id)) {
      runtime.set(cfg.id, { config: cfg, state: stopped(cfg.id), tools: [] });
    }
  }
  notifyStates();
  await Promise.all(
    configs.filter((c) => c.enabled).map((c) => startServer(c.id).catch(() => {})),
  );
}

export async function stopAll(): Promise<void> {
  await Promise.all(Array.from(runtime.keys()).map((id) => stopServer(id).catch(() => {})));
}

/**
 * Test a server config without persisting it. Spawns the process, performs the
 * MCP handshake, lists tools, then shuts down. Useful for the "Test connection"
 * button in the settings UI. Has its own 30s timeout to avoid hanging the UI.
 */
export async function testConfig(input: Omit<MCPServerConfig, 'id' | 'prefix'>): Promise<{ ok: boolean; error?: string; tools?: string[] }> {
  let transport: SDKTransport | undefined;
  let client: SDKClient | undefined;
  let stderrBuffer = '';
  try {
    const { Client } = (await import('@modelcontextprotocol/sdk/client/index.js')) as typeof import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = (await import('@modelcontextprotocol/sdk/client/stdio.js')) as typeof import('@modelcontextprotocol/sdk/client/stdio.js');

    const expandedEnv = expandEnvVars(input.env ?? {});
    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter((p): p is [string, string] => typeof p[1] === 'string'),
      ),
      ...expandedEnv,
    };

    transport = new StdioClientTransport({
      command: input.command,
      args: input.args,
      env,
      stderr: 'pipe',
    }) as unknown as SDKTransport;

    const transportInternal = transport as unknown as { stderr?: NodeJS.ReadableStream };
    if (transportInternal.stderr && typeof transportInternal.stderr.on === 'function') {
      transportInternal.stderr.on('data', (chunk: Buffer | string) => {
        stderrBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (stderrBuffer.length > 4000) stderrBuffer = stderrBuffer.slice(-4000);
      });
    }

    client = new Client({ name: 'claude-buddy-test', version: '0.4.0' }) as unknown as SDKClient;
    await client.connect(transport, { timeout: 30_000 });
    const listed = await client.listTools();
    const tools = (listed.tools ?? []).map((t) => t.name);
    return { ok: true, tools };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: stderrBuffer ? `${msg}\n— stderr —\n${stderrBuffer}` : msg };
  } finally {
    try { if (client) await client.close().catch(() => {}); } catch { /* swallow */ }
    try { if (transport) await transport.close().catch(() => {}); } catch { /* swallow */ }
  }
}

/**
 * Returns the last known error message + stderr for a given server. Used by
 * the "View logs" button when a server is in `crashed` state.
 */
export function getServerErrorInfo(id: string): { errorMessage?: string; stderr?: string } {
  const entry = runtime.get(id);
  if (!entry) return {};
  // The errorMessage in state already contains the joined stderr; we surface
  // the whole thing so the UI can show it as-is.
  return { errorMessage: entry.state.errorMessage };
}

// ─── Tool execution ─────────────────────────────────────────────────────────

export async function callTool(
  prefixedName: string,
  input: Record<string, unknown>,
): Promise<MCPCallToolResult> {
  const knownPrefixes = Array.from(runtime.values())
    .filter((e) => e.state.status === 'running')
    .map((e) => e.config.prefix);
  const parsed = parsePrefixedName(prefixedName, knownPrefixes);
  if (!parsed) {
    return { ok: false, content: '', error: `unknown MCP tool: ${prefixedName}` };
  }
  const entry = Array.from(runtime.values()).find((e) => e.config.prefix === parsed.serverName);
  if (!entry || entry.state.status !== 'running' || !entry.client) {
    return { ok: false, content: '', error: `server ${parsed.serverName} not running` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const result = await entry.client.callTool(
      { name: parsed.originalName, arguments: input },
      undefined,
      { timeout: 30_000, signal: controller.signal },
    );
    clearTimeout(timer);
    const text = joinTextContent(result.content);
    // When the server reports an error, its `content` carries the human-
    // readable explanation. Surface it as `error` (not `content`) so the
    // renderer's `error: ${r.error}` formatting works correctly.
    if (result.isError) {
      console.warn(`[mcp] ${parsed.serverName}.${parsed.originalName} returned error:`, text);
      return { ok: false, content: '', error: text || 'tool reported error' };
    }
    return { ok: true, content: text };
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : 'tool call failed';
    console.error(`[mcp] ${parsed.serverName}.${parsed.originalName} threw:`, msg);
    return { ok: false, content: '', error: msg };
  }
}

function joinTextContent(content?: Array<{ type: string; text?: string }>): string {
  if (!content || content.length === 0) return '';
  const textParts: string[] = [];
  let nonTextCount = 0;
  for (const c of content) {
    if (c.type === 'text' && typeof c.text === 'string') textParts.push(c.text);
    else nonTextCount++;
  }
  let joined = textParts.join('\n');
  if (nonTextCount > 0) {
    joined += (joined ? '\n' : '') + `[+ ${nonTextCount} non-text item${nonTextCount > 1 ? 's' : ''}]`;
  }
  return joined;
}
