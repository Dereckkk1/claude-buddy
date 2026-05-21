// Local cache of MCP tools advertised by the main process.
//
// Why a cache instead of awaiting `mcp:list-tools` on every request:
//   - claude.ts builds the `tools` array for every API call. Making that
//     async-on-every-turn means the IPC roundtrip blocks each request start.
//   - skills.ts.executeTool routes unknown tool names. It needs a synchronous
//     way to decide "is this an MCP tool?" without an IPC call per tool use.
//
// The cache is rehydrated once at app boot (initMCPCache) and refreshed
// every time the main process broadcasts `mcp:states-changed`.

import { useEffect, useState } from 'react';
import { invoke, on } from './ipc';
import type { MCPToolDef, MCPServerState } from '@shared/mcp-types';

let toolsCache: MCPToolDef[] = [];
let statesCache: MCPServerState[] = [];
const stateListeners = new Set<(s: MCPServerState[]) => void>();

export function getMCPTools(): MCPToolDef[] {
  return toolsCache;
}

export function getMCPToolNames(): Set<string> {
  return new Set(toolsCache.map((t) => t.prefixedName));
}

export function getMCPStates(): MCPServerState[] {
  return statesCache;
}

/**
 * IDs of MCP servers that crashed. Used by the chat bubble to surface a
 * dismissable banner so users notice when configured servers fail to start.
 */
export function getCrashedServers(): string[] {
  return statesCache.filter((s) => s.status === 'crashed').map((s) => s.id);
}

async function refresh(): Promise<void> {
  try {
    const [tools, states] = await Promise.all([
      invoke('mcp:list-tools'),
      invoke('mcp:list-states'),
    ]);
    toolsCache = tools;
    statesCache = states;
    stateListeners.forEach((cb) => cb(states));
  } catch (e) {
    // First few calls may race with main-process startup; safe to ignore.
    void e;
  }
}

/**
 * Call once at app boot (before first render that depends on MCP tools).
 * Subscribes to `mcp:states-changed` from main and refreshes the caches.
 */
export async function initMCPCache(): Promise<void> {
  await refresh();
  on('mcp:states-changed', () => {
    void refresh();
  });
}

/**
 * React hook exposing the latest server states. Used by the settings UI to
 * render status dots without polling.
 */
export function useMCPStates(): MCPServerState[] {
  const [states, setStates] = useState<MCPServerState[]>(statesCache);
  useEffect(() => {
    const cb = (s: MCPServerState[]) => setStates(s);
    stateListeners.add(cb);
    // Trigger a refresh on mount so the hook gets initial state even if the
    // cache hasn't been hydrated yet (e.g. settings opened before any chat).
    void refresh();
    return () => { stateListeners.delete(cb); };
  }, []);
  return states;
}
