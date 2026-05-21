import Anthropic from '@anthropic-ai/sdk';
import type { Message, Attachment, AttachedPath } from '@/state/conversation';
import type { AgentDTO, Locale } from '@shared/ipc-types';
import { translate } from '@shared/i18n-strings';
import { invoke } from './ipc';
import { getLocale } from '@/i18n';
import { TOOLS, executeTool, type ToolResult } from './skills';
import { getMCPTools } from './mcp-tools-cache';

const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

// Server-side tool — executed by Anthropic, not by us. We just pass it in `tools`
// and the API handles the search + injects results into the conversation.
const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 3,
} as const;

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

function buildToolInstructions(locale: Locale): string {
  const t = (k: string) => translate(locale, `toolInstructions.${k}`);
  return [
    t('intro'),
    '',
    t('goldenRuleHeader'),
    '',
    t('goldenRuleBody'),
    '',
    t('toolsHeader'),
    '',
    t('tool1'),
    '',
    t('tool2'),
    '',
    t('tool3'),
    '',
    t('tool4'),
    '',
    t('antiHeader'),
    '',
    t('antiBody'),
    '',
    t('closing'),
  ].join('\n');
}

function memoriesBlock(memories: string[], locale: Locale): string {
  if (memories.length === 0) return '';
  const label = translate(locale, 'toolInstructions.memoriesLabel');
  return `${label}\n${memories.map((f) => `- ${f}`).join('\n')}`;
}

function attachedPathsBlock(paths: AttachedPath[]): string {
  if (paths.length === 0) return '';
  const lines = paths.map((p) => `- [${p.kind}] ${p.path}`).join('\n');
  return `\n\nATTACHED PATHS (use list_folder / read_file when relevant):\n${lines}`;
}

function mcpHintBlock(toolCount: number, serverNames: string[]): string {
  if (toolCount === 0) return '';
  return `\n\nMCP TOOLS DISPONÍVEIS: ${toolCount} tools de servers conectados (${serverNames.join(', ')}).\n\nElas aparecem na lista de tools com prefixo <server>_<tool>. USE PROATIVAMENTE quando relevante — NUNCA diga "não tenho acesso a X" sem tentar a tool primeiro. Se o user pergunta algo que parece bater com uma tool MCP, tenta chamá-la. Pra GitHub MCP especificamente: você pode descobrir o username do user via get_me (ou similar) — não pergunte antes de tentar.`;
}

function languageDirective(locale: Locale, respondInUserLanguage: boolean): string {
  // When the user opts out, fall back to the strict locale prompt that pins
  // the response language to the UI locale; otherwise use the "match the
  // user's last message" variant (the new default).
  const key = respondInUserLanguage
    ? 'systemPrompt.respondInLanguage'
    : 'systemPrompt.respondInLocale';
  return translate(locale, key, { locale });
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
  /** Fires each time a web_search server-tool call is initiated (1-based count). */
  onWebSearchUse?: (count: number) => void;
  /** Fires once at the end of the turn with cumulative usage from finalMessage. */
  onUsage?: (usage: { inputTokens: number; outputTokens: number; model: string }) => void;
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
      blocks.push({ type: 'text', text: `[Attached content]\n${a.content}` });
    }
  }
  return blocks;
}

function buildInitialMessages(messages: Message[], attachments: Attachment[]): Anthropic.MessageParam[] {
  // SDK types want a string union for media_type — we trust the runtime values.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      } as Anthropic.MessageParam;
    }
    return { role: m.role, content: [{ type: 'text' as const, text: m.content }] } as Anthropic.MessageParam;
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
  attachedPaths: AttachedPath[] = [],
  signal?: AbortSignal,
): Promise<void> {
  const client = await getClient();
  const model = modelForAgent(agent, messages, attachments);
  callbacks.onModelPicked?.(model);

  const apiMessages: Anthropic.MessageParam[] = buildInitialMessages(messages, attachments);
  const locale = getLocale();
  const mcpTools = getMCPTools();
  const mcpServerNames = Array.from(new Set(mcpTools.map((t) => t.serverName)));
  // Read once for this turn — avoids an extra round trip on each call.
  let respondInUserLanguage = true;
  try {
    const settings = await invoke('settings:get');
    respondInUserLanguage = settings.respondInUserLanguage ?? true;
  } catch { /* default to true */ }
  const system = [
    buildToolInstructions(locale),
    '---',
    languageDirective(locale, respondInUserLanguage),
    '---',
    agent.systemPrompt,
    memoriesBlock(agent.memories, locale),
    attachedPathsBlock(attachedPaths),
    mcpHintBlock(mcpTools.length, mcpServerNames),
  ].join('\n\n');

  // Web-search citations accumulated across all loop iterations for this turn.
  // Rendered at the very end as a "Fontes:" block appended via onChunk.
  const citationsForTurn: Array<{ url: string; title: string }> = [];
  let webSearchCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let iter = 0; iter < 6; iter++) {
    if (signal?.aborted) return;
    try {
      // Merge native tools + web_search (server-side) + any MCP tools that
      // are currently advertised by running servers. Reusing mcpTools from
      // the outer scope so we don't list the cache twice per request.
      const mcpToolDefs = mcpTools.map((t) => ({
        name: t.prefixedName,
        description: t.description,
        input_schema: t.inputSchema,
      }));
      const stream = await client.messages.stream({
        model,
        max_tokens: 1024,
        system,
        tools: [...TOOLS, WEB_SEARCH_TOOL, ...mcpToolDefs] as never,
        messages: apiMessages as never,
      });

      let textOut = '';
      const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = [];
      let currentToolJson = '';
      let currentTool: { id: string; name: string } | null = null;

      for await (const event of stream) {
        if (signal?.aborted) {
          // Best effort — server may keep sending events briefly, but we ignore them.
          break;
        }
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentTool = { id: event.content_block.id, name: event.content_block.name };
            currentToolJson = '';
          } else if ((event.content_block as unknown as { type: string }).type === 'server_tool_use') {
            // Server-side tool (web_search): Anthropic executes it. We only fire
            // the UI indicator — no local execution, no tool_result to push back.
            const block = event.content_block as unknown as { name: string };
            callbacks.onToolUse?.(block.name, {});
            if (block.name === 'web_search') {
              webSearchCount++;
              callbacks.onWebSearchUse?.(webSearchCount);
            }
          } else if ((event.content_block as unknown as { type: string }).type === 'web_search_tool_result') {
            // Inline citations come attached to text deltas later — here we just
            // pluck any URL/title pairs from the result block (SDK shape varies).
            const block = event.content_block as unknown as {
              content?: Array<{ type?: string; url?: string; title?: string }>;
            };
            if (Array.isArray(block.content)) {
              for (const c of block.content) {
                if (c && typeof c.url === 'string' && c.url) {
                  citationsForTurn.push({ url: c.url, title: c.title || c.url });
                }
              }
            }
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            textOut += event.delta.text;
            callbacks.onChunk(event.delta.text);
            // Some SDK versions attach `citation` to text_delta; capture if present.
            const cd = event.delta as unknown as {
              citation?: { url?: string; title?: string };
            };
            if (cd.citation && typeof cd.citation.url === 'string' && cd.citation.url) {
              citationsForTurn.push({ url: cd.citation.url, title: cd.citation.title || cd.citation.url });
            }
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
      if (final.usage) {
        totalInputTokens += final.usage.input_tokens ?? 0;
        totalOutputTokens += final.usage.output_tokens ?? 0;
      }

      if (toolUses.length === 0 || final.stop_reason === 'end_turn') {
        emitCitationsAndUsage(callbacks, citationsForTurn, totalInputTokens, totalOutputTokens, model);
        return;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        if (signal?.aborted) return;
        callbacks.onToolUse?.(tu.name, tu.input);
        try {
          const result = await executeTool(tu.name, tu.input);
          callbacks.onToolResult?.(tu.name, result);
          // Stream the per-tool UI marker (e.g. undo chip for edit_in_place,
          // expanded chip for save_memory) into the assistant message.
          if (result.uiMarker) callbacks.onChunk(`\n\n${result.uiMarker}\n\n`);
          if (result.imageResult) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: [
                { type: 'image', source: { type: 'base64', media_type: result.imageResult.mimeType, data: result.imageResult.base64 } },
              ],
            } as Anthropic.ToolResultBlockParam);
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: result.content,
            });
          }
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
  emitCitationsAndUsage(callbacks, citationsForTurn, totalInputTokens, totalOutputTokens, model);
}

function emitCitationsAndUsage(
  callbacks: StreamCallbacks,
  citations: Array<{ url: string; title: string }>,
  inputTokens: number,
  outputTokens: number,
  model: string,
): void {
  // De-dup citations by URL (preserve insertion order).
  const seen = new Set<string>();
  const unique: Array<{ url: string; title: string }> = [];
  for (const c of citations) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    unique.push(c);
  }
  if (unique.length > 0) {
    const lines = unique.map((c, i) => `${i + 1}. [${c.title}](${c.url})`).join('\n');
    callbacks.onChunk(`\n\n**Fontes:**\n${lines}\n`);
  }
  if (inputTokens > 0 || outputTokens > 0) {
    callbacks.onUsage?.({ inputTokens, outputTokens, model });
  }
}
