export interface IpcRequests {
  'config:get-api-key': () => string | null;
  'config:set-api-key': (key: string) => void;
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
}

export interface IpcEvents {
  'hotkey:activate': void;
}

export type IpcChannel = keyof IpcRequests;
