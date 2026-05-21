import { create } from 'zustand';

export type Status = 'idle' | 'thinking' | 'talking' | 'error';

export type Attachment =
  | { kind: 'text'; content: string }
  | { kind: 'image'; mimeType: string; base64: string };

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface AttachedPath {
  id: string;
  path: string;
  kind: 'file' | 'folder';
  name: string;
  size: number;
}

interface ConversationState {
  messages: Message[];
  attachments: Attachment[];
  attachedPaths: AttachedPath[];
  status: Status;
  error: string | null;
  // Machine-readable error code (e.g. 'INVALID_API_KEY') — lets the UI decide
  // which contextual actions to surface (e.g. "Open config" button).
  errorCode: string | null;

  addUserMessage: (text: string) => void;
  beginAssistantMessage: () => void;
  appendAssistantChunk: (chunk: string) => void;
  addAttachment: (a: Attachment) => void;
  removeAttachment: (index: number) => void;
  addAttachedPath: (p: AttachedPath) => void;
  removeAttachedPath: (id: string) => void;
  setStatus: (s: Status) => void;
  setError: (e: string | null, code?: string | null) => void;
  reset: () => void;
}

export const useConversation = create<ConversationState>((set) => ({
  messages: [],
  attachments: [],
  attachedPaths: [],
  status: 'idle',
  error: null,
  errorCode: null,

  addUserMessage: (text) =>
    set((s) => ({ messages: [...s.messages, { role: 'user', content: text }] })),

  beginAssistantMessage: () =>
    set((s) => ({ messages: [...s.messages, { role: 'assistant', content: '' }] })),

  appendAssistantChunk: (chunk) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
      }
      return { messages: msgs };
    }),

  addAttachment: (a) => set((s) => ({ attachments: [...s.attachments, a] })),

  removeAttachment: (i) =>
    set((s) => ({ attachments: s.attachments.filter((_, idx) => idx !== i) })),

  addAttachedPath: (p) => set((s) => ({ attachedPaths: [...s.attachedPaths, p] })),

  removeAttachedPath: (id) =>
    set((s) => ({ attachedPaths: s.attachedPaths.filter((x) => x.id !== id) })),

  setStatus: (status) => set({ status }),
  setError: (error, code) => set({ error, errorCode: code ?? null }),

  reset: () => set({ messages: [], attachments: [], attachedPaths: [], status: 'idle', error: null, errorCode: null }),
}));
