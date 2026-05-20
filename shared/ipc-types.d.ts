export interface IpcRequests {
    'config:get-api-key': () => string | null;
    'config:set-api-key': (key: string) => void;
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
}
export interface IpcEvents {
    'hotkey:activate': void;
}
export type IpcChannel = keyof IpcRequests;
