export interface AgentDTO {
  id: string;
  name: string;
  emoji: string;
  systemPrompt: string;
  model: 'auto' | 'haiku' | 'sonnet';
  memories: string[];
  isBuiltIn: boolean;
  sharedMemories?: boolean;
}

export type Locale = 'en' | 'pt' | 'es';

export interface AppSettingsDTO {
  autostart: boolean;
  idleTimeoutMs: number;
  hotkey: string;
  ttsEnabled: boolean;
  ttsVoice: string;
  ttsRate: number;
  theme: 'light' | 'dark' | 'auto';
  soundsEnabled: boolean;
  soundsVolume: number;
  locale: Locale;
  userName: string;
  awarenessEnabled: boolean;
}

export interface ActiveAppInfo {
  processName: string;
  windowTitle: string;
}

export interface IpcRequests {
  'config:get-api-key': () => string | null;
  'config:set-api-key': (key: string) => void;
  'memories:list': () => string[];
  'memories:add': (fact: string) => void;
  'memories:delete': (index: number) => void;
  'memories:clear': () => void;
  'agents:list': () => AgentDTO[];
  'agents:get-active': () => AgentDTO;
  'agents:set-active': (id: string) => void;
  'agents:create': (input: Omit<AgentDTO, 'id' | 'isBuiltIn' | 'memories'>) => AgentDTO;
  'agents:update': (params: { id: string; patch: Partial<Omit<AgentDTO, 'id' | 'isBuiltIn'>> }) => AgentDTO | null;
  'agents:delete': (id: string) => void;
  'settings:get': () => AppSettingsDTO;
  'settings:update': (patch: Partial<AppSettingsDTO>) => AppSettingsDTO;
  'settings:open': () => void;
  'tts:synthesize': (params: { text: string; voice: string; rate?: number }) => string;
  'tts:voices': () => { id: string; label: string }[];
  'position:get': () => { x: number; y: number } | null;
  'position:set': (pos: { x: number; y: number }) => void;
  'capture:screen-region': () => { mimeType: string; base64: string } | null;
  'clipboard:read': () =>
    | { kind: 'text'; content: string }
    | { kind: 'image'; mimeType: string; base64: string }
    | null;
  'window:show': () => void;
  'window:hide': () => void;
  'window:get-position': () => { x: number; y: number };
  'window:set-position': (pos: { x: number; y: number }) => void;
  'window:set-size': (size: { w: number; h: number }) => void;
  'keyboard:paste-to-active': (text: string) => void;
  'keyboard:read-selection': () => string | null;
  'keyboard:get-active-app': () => ActiveAppInfo | null;
  'agent:screen-size': () => { realWidth: number; realHeight: number; scaledWidth: number; scaledHeight: number };
  'agent:screenshot': () => { scaledWidth: number; scaledHeight: number; realWidth: number; realHeight: number; base64: string };
  'agent:move-mouse': (params: { x: number; y: number }) => void;
  'agent:click': (params: { x: number; y: number; button: 'left' | 'right' | 'middle' }) => void;
  'agent:double-click': (params: { x: number; y: number }) => void;
  'agent:type': (text: string) => void;
  'agent:key': (key: string) => void;
  'agent:scroll': (params: { x: number; y: number; direction: 'up' | 'down'; amount: number }) => void;
  'agent:cursor-position': () => { x: number; y: number };
  'file:pick-and-parse': () =>
    | { kind: 'text'; content: string }
    | { kind: 'image'; mimeType: string; base64: string }
    | null;
  'files:list-folder': (params: { path: string; recursive?: boolean }) =>
    { ok: true; listing: import('../electron/files').FolderListing } | { ok: false; error: string };
  'files:read-file': (params: { path: string }) =>
    { ok: true; content: import('../electron/files').FileContent } | { ok: false; error: string };
  'files:set-scope': (paths: string[]) => void;
  'files:pick-folder': () => { path: string; name: string; size: number } | null;
  'files:resolve-dropped': (paths: string[]) =>
    Array<{ path: string; kind: 'file' | 'folder'; name: string; size: number }>;
  'shell:run-command': (params: { command: string; cwd?: string; timeoutMs?: number }) =>
    { ok: true; result: import('../electron/shell').RunResult } | { ok: false; error: string };

  // MCP (Model Context Protocol)
  'mcp:list-configs':   () => import('./mcp-types').MCPServerConfig[];
  'mcp:add-config':     (input: Omit<import('./mcp-types').MCPServerConfig, 'id' | 'prefix'>) =>
                          import('./mcp-types').MCPServerConfig;
  'mcp:update-config':  (params: { id: string; patch: Partial<Omit<import('./mcp-types').MCPServerConfig, 'id'>> }) =>
                          import('./mcp-types').MCPServerConfig | null;
  'mcp:delete-config':  (id: string) => void;
  'mcp:import-json':    (rawJson: string) => { added: number; errors: string[] };
  'mcp:list-states':    () => import('./mcp-types').MCPServerState[];
  'mcp:restart-server': (id: string) => Promise<void>;
  'mcp:list-tools':     () => import('./mcp-types').MCPToolDef[];
  'mcp:call-tool':      (params: { prefixedName: string; input: Record<string, unknown> }) =>
                          import('./mcp-types').MCPCallToolResult;
}

export interface IpcEvents {
  'hotkey:activate': void;
  'hotkey:ask-with-selection': void;
}

export type IpcChannel = keyof IpcRequests;
