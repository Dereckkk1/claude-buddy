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
    'agents:update': (params: {
        id: string;
        patch: Partial<Omit<AgentDTO, 'id' | 'isBuiltIn'>>;
    }) => AgentDTO | null;
    'agents:delete': (id: string) => void;
    'settings:get': () => AppSettingsDTO;
    'settings:update': (patch: Partial<AppSettingsDTO>) => AppSettingsDTO;
    'settings:open': () => void;
    'tts:synthesize': (params: {
        text: string;
        voice: string;
        rate?: number;
    }) => string;
    'tts:voices': () => {
        id: string;
        label: string;
    }[];
    'position:get': () => {
        x: number;
        y: number;
    } | null;
    'position:set': (pos: {
        x: number;
        y: number;
    }) => void;
    'capture:screen-region': () => {
        mimeType: string;
        base64: string;
    } | null;
    'clipboard:read': () => {
        kind: 'text';
        content: string;
    } | {
        kind: 'image';
        mimeType: string;
        base64: string;
    } | null;
    'window:show': () => void;
    'window:hide': () => void;
    'window:get-position': () => {
        x: number;
        y: number;
    };
    'window:set-position': (pos: {
        x: number;
        y: number;
    }) => void;
    'window:set-size': (size: {
        w: number;
        h: number;
    }) => void;
    'keyboard:paste-to-active': (text: string) => void;
    'keyboard:read-selection': () => string | null;
    'agent:screen-size': () => {
        realWidth: number;
        realHeight: number;
        scaledWidth: number;
        scaledHeight: number;
    };
    'agent:screenshot': () => {
        scaledWidth: number;
        scaledHeight: number;
        realWidth: number;
        realHeight: number;
        base64: string;
    };
    'agent:move-mouse': (params: {
        x: number;
        y: number;
    }) => void;
    'agent:click': (params: {
        x: number;
        y: number;
        button: 'left' | 'right' | 'middle';
    }) => void;
    'agent:double-click': (params: {
        x: number;
        y: number;
    }) => void;
    'agent:type': (text: string) => void;
    'agent:key': (key: string) => void;
    'agent:scroll': (params: {
        x: number;
        y: number;
        direction: 'up' | 'down';
        amount: number;
    }) => void;
    'agent:cursor-position': () => {
        x: number;
        y: number;
    };
    'file:pick-and-parse': () => {
        kind: 'text';
        content: string;
    } | {
        kind: 'image';
        mimeType: string;
        base64: string;
    } | null;
}
export interface IpcEvents {
    'hotkey:activate': void;
}
export type IpcChannel = keyof IpcRequests;
