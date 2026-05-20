// Shared types for the MCP (Model Context Protocol) integration.
// Used by main process (electron/mcp.ts), renderer (mcp-tools-cache.ts), and
// the settings UI (MCPTab.tsx). Keep this file free of runtime imports —
// other tsconfigs include it from both Node and browser-ish builds.

export interface MCPServerConfig {
  id: string;
  // User-given. Lowercased + sanitized to snake_case for tool prefixing.
  name: string;
  // Sanitized version that becomes the tool prefix (e.g. "Brave Search" → "brave_search").
  prefix: string;
  command: string;
  args: string[];
  // Env vars passed to the spawned child process. Encrypted at rest by electron-store.
  // Supports ${HOME} and ${USERPROFILE} expansion.
  env: Record<string, string>;
  enabled: boolean;
}

export type MCPServerStatus = 'stopped' | 'starting' | 'running' | 'crashed';

export interface MCPServerState {
  id: string;
  status: MCPServerStatus;
  // Number of tools advertised by the server when running. 0 otherwise.
  toolCount: number;
  // Populated when status === 'crashed'. Suitable for tooltip display.
  errorMessage?: string;
  // ms epoch of the last successful (or attempted) start.
  lastStartedAt?: number;
}

export interface MCPToolDef {
  serverId: string;
  serverName: string;   // already-sanitized prefix, e.g. "filesystem"
  prefixedName: string; // <serverName>_<originalName>, what the model sees
  originalName: string; // raw name from the server (passed back on callTool)
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPCallToolResult {
  ok: boolean;
  // Joined text content of the SDK's CallToolResult.content[]. For non-text
  // content blocks we append a "[+ N non-text items]" suffix. Empty string on
  // error or fully-empty result.
  content: string;
  error?: string;
}
