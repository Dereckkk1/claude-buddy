import { create } from 'zustand';

export type Status = 'idle' | 'thinking' | 'talking' | 'error';

export type Attachment =
  | { kind: 'text'; content: string }
  | { kind: 'image'; mimeType: string; base64: string };

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationState {
  messages: Message[];
  attachments: Attachment[];
  status: Status;
  error: string | null;

  addUserMessage: (text: string) => void;
  beginAssistantMessage: () => void;
  appendAssistantChunk: (chunk: string) => void;
  addAttachment: (a: Attachment) => void;
  removeAttachment: (index: number) => void;
  setStatus: (s: Status) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useConversation = create<ConversationState>((set) => ({
  messages: [],
  attachments: [],
  status: 'idle',
  error: null,

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

  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),

  reset: () => set({ messages: [], attachments: [], status: 'idle', error: null }),
}));
