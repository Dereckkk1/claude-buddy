import Anthropic from '@anthropic-ai/sdk';
import type { Message, Attachment } from '@/state/conversation';
import { invoke } from './ipc';

export const MODEL = 'claude-haiku-4-5-20251001';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ClaudePayload {
  model: string;
  max_tokens: number;
  messages: { role: 'user' | 'assistant'; content: ContentBlock[] }[];
  system?: string;
  stream?: boolean;
}

const SYSTEM_PROMPT = `Você é o Claude Buddy, um mascote desktop fofo em pixel art. Responda em português brasileiro de forma curta, direta e amigável. Quando o usuário anexar uma imagem, analise visualmente. Quando anexar texto, foque na tarefa pedida sobre esse texto.`;

export function buildClaudePayload(messages: Message[], attachments: Attachment[]): ClaudePayload {
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return i;
    return -1;
  })();

  const builtMessages = messages.map((m, i) => {
    if (i !== lastUserIdx || attachments.length === 0) {
      return { role: m.role, content: [{ type: 'text' as const, text: m.content }] };
    }
    const imageBlocks: ContentBlock[] = attachments
      .filter((a): a is Extract<Attachment, { kind: 'image' }> => a.kind === 'image')
      .map((a) => ({ type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.base64 } }));
    const textAttachments = attachments
      .filter((a): a is Extract<Attachment, { kind: 'text' }> => a.kind === 'text')
      .map((a) => a.content);
    const textWithAttachments = textAttachments.length > 0
      ? `${m.content}\n\n---\nTEXTO SELECIONADO:\n${textAttachments.join('\n---\n')}`
      : m.content;
    return { role: m.role, content: [...imageBlocks, { type: 'text' as const, text: textWithAttachments }] };
  });

  return {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: builtMessages,
    stream: true,
  };
}

let cachedClient: Anthropic | null = null;
let cachedKey: string | null = null;

async function getClient(): Promise<Anthropic> {
  const key = await invoke('config:get-api-key');
  if (!key) throw new Error('API_KEY_MISSING');
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  cachedKey = key;
  return cachedClient;
}

export async function* streamClaude(messages: Message[], attachments: Attachment[]): AsyncGenerator<string> {
  let client: Anthropic;
  try {
    client = await getClient();
  } catch (e) {
    if (e instanceof Error && e.message === 'API_KEY_MISSING') throw new Error('API_KEY_MISSING');
    throw e;
  }
  const payload = buildClaudePayload(messages, attachments);
  try {
    const stream = await client.messages.stream({
      model: payload.model,
      max_tokens: payload.max_tokens,
      system: payload.system,
      messages: payload.messages as never,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  } catch (e) {
    console.error('[claude.ts] streamClaude error:', e);
    const err = e as { status?: number; message?: string };
    if (err.status === 401) throw new Error('INVALID_API_KEY');
    if (err.status === 429) throw new Error('RATE_LIMITED');
    if (err.message?.includes('fetch')) throw new Error('NETWORK');
    throw new Error('UNKNOWN');
  }
}
