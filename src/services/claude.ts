import Anthropic from '@anthropic-ai/sdk';
import type { Message, Attachment } from '@/state/conversation';
import type { AgentDTO } from '@shared/ipc-types';
import { invoke } from './ipc';
import { TOOLS, executeTool, type ToolResult } from './skills';

const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

export function pickModel(messages: Message[], attachments: Attachment[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const totalChars = messages.reduce((s, m) => s + m.content.length, 0);
  if (messages.length >= 6) return SONNET;
  if (totalChars > 2000) return SONNET;
  const bigImage = attachments.some((a) => a.kind === 'image' && a.base64.length > 400_000);
  if (bigImage) return SONNET;
  const heavy = /\b(explica|explique|compara|analisa|por\s*qu[eê]|porque|como\s*funciona|estrat[eé]gia|decis[aã]o|trade.?off|pr[oó]s\s*e\s*contras|arquitetura|refator|debug|investiga)\b/i;
  if (heavy.test(lastUser)) return SONNET;
  if (lastUser.length > 500) return SONNET;
  return HAIKU;
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

const TOOL_INSTRUCTIONS = `Você tem acesso a 3 tools que pode chamar sempre que fizer sentido (mesmo se a personalidade abaixo não mencionar):

1. \`read_selection\`: pega o texto que o usuário tem SELECIONADO em outro app agora. Use quando ele falar "isso", "esse texto", "essa parte", "esse código" SEM ter anexado nada — provavelmente ele quer dizer o que está selecionado na tela.

2. \`edit_in_place\`: substitui a seleção do usuário pelo texto novo (cola direto no app dele). Use quando o pedido for uma EDIÇÃO de texto que está selecionado em outro app: "corrige isso", "reescreve mais formal", "traduz pra inglês", "deixa mais curto". Não devolva o texto no chat — chama essa tool com o resultado, e no comentário diga em 1 frase o que fez.

3. \`save_memory\`: grava 1 fato curto sobre o usuário pra futuras conversas. Use ESPARSAMENTE — só pra coisas relevantes ("usa Cursor", "trabalha com Python", "mora em Manaus", "prefere respostas curtas"). Não salve coisas triviais.

Regras gerais: se o usuário anexou explicitamente algo, use isso. Senão e o pedido fizer referência a algo da tela, chame read_selection primeiro. Pra qualquer edição de texto, prefira edit_in_place em vez de devolver o texto no chat. Markdown OK no chat.`;

function memoriesBlock(memories: string[]): string {
  if (memories.length === 0) return '';
  return `\n\nMEMÓRIAS sobre o usuário (use quando relevante):\n${memories.map((f) => `- ${f}`).join('\n')}`;
}

function modelForAgent(agent: AgentDTO, messages: Message[], attachments: Attachment[]): string {
  if (agent.model === 'haiku') return HAIKU;
  if (agent.model === 'sonnet') return SONNET;
  return pickModel(messages, attachments);
}

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onToolUse?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: ToolResult) => void;
  onModelPicked?: (model: string) => void;
}

function attachmentsToBlocks(attachments: Attachment[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const a of attachments) {
    if (a.kind === 'image') {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: a.mimeType, data: a.base64 },
      });
    } else {
      blocks.push({ type: 'text', text: `[Conteúdo anexado]\n${a.content}` });
    }
  }
  return blocks;
}

function buildInitialMessages(messages: Message[], attachments: Attachment[]): Anthropic.MessageParam[] {
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return i;
    return -1;
  })();

  return messages.map((m, i) => {
    if (i === lastUserIdx && attachments.length > 0) {
      const attBlocks = attachmentsToBlocks(attachments);
      return {
        role: m.role,
        content: [...attBlocks, { type: 'text' as const, text: m.content }],
      };
    }
    return { role: m.role, content: [{ type: 'text' as const, text: m.content }] };
  });
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

export async function chatWithSkills(
  messages: Message[],
  attachments: Attachment[],
  agent: AgentDTO,
  callbacks: StreamCallbacks,
): Promise<void> {
  const client = await getClient();
  const model = modelForAgent(agent, messages, attachments);
  callbacks.onModelPicked?.(model);

  const apiMessages: Anthropic.MessageParam[] = buildInitialMessages(messages, attachments);
  const system = `${TOOL_INSTRUCTIONS}\n\n---\n\n${agent.systemPrompt}${memoriesBlock(agent.memories)}`;

  for (let iter = 0; iter < 6; iter++) {
    try {
      const stream = await client.messages.stream({
        model,
        max_tokens: 1024,
        system,
        tools: TOOLS as never,
        messages: apiMessages as never,
      });

      let textOut = '';
      const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = [];
      let currentToolJson = '';
      let currentTool: { id: string; name: string } | null = null;

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentTool = { id: event.content_block.id, name: event.content_block.name };
            currentToolJson = '';
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            textOut += event.delta.text;
            callbacks.onChunk(event.delta.text);
          } else if (event.delta.type === 'input_json_delta') {
            currentToolJson += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentTool) {
            const input = currentToolJson ? JSON.parse(currentToolJson) : {};
            toolUses.push({ ...currentTool, input });
            currentTool = null;
            currentToolJson = '';
          }
        }
      }

      const final = await stream.finalMessage();
      apiMessages.push({ role: 'assistant', content: final.content });

      if (toolUses.length === 0 || final.stop_reason === 'end_turn') {
        return;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        callbacks.onToolUse?.(tu.name, tu.input);
        try {
          const result = await executeTool(tu.name, tu.input);
          callbacks.onToolResult?.(tu.name, result);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: result.content,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'erro';
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: `error: ${msg}`,
            is_error: true,
          });
        }
      }
      apiMessages.push({ role: 'user', content: toolResults });
    } catch (e) {
      console.error('[claude.ts] chatWithSkills error:', e);
      const err = e as { status?: number; message?: string };
      if (err.status === 401) throw new Error('INVALID_API_KEY');
      if (err.status === 429) throw new Error('RATE_LIMITED');
      if (err.message?.includes('fetch')) throw new Error('NETWORK');
      throw new Error('UNKNOWN');
    }
  }
}
