import Anthropic from '@anthropic-ai/sdk';
import { invoke } from './ipc';

const MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 30;
const COMPUTER_BETA = 'computer-use-2025-11-24';
const COMPUTER_TOOL_TYPE = 'computer_20251124';

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'action'; message: string }
  | { type: 'thought'; message: string }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string };

export interface AgentOptions {
  goal: string;
  onEvent: (e: AgentEvent) => void;
  signal: AbortSignal;
}

const SYSTEM_PROMPT = `Você é o Claude Buddy controlando o computador Windows do usuário pra cumprir um objetivo.

REGRAS:
- Faça screenshot ANTES de qualquer ação, pra ver o estado atual.
- Pense passo a passo. Faça uma ação por vez.
- Se algo não rolar como esperado, faça novo screenshot e adapte.
- Coordenadas no espaço da resolução fornecida (display_width_px × display_height_px).
- Pra atalhos de teclado use a action "key" com nome (ex: "Return", "ctrl+t", "alt+F4").
- Pra digitar texto use a action "type".
- Quando o objetivo estiver cumprido, pare e responda em texto curto descrevendo o que fez.
- Em caso de dúvida ou pedido potencialmente destrutivo, prefira parar e perguntar via texto.
- Comunique em português brasileiro informal.`;

export async function runAgent(opts: AgentOptions): Promise<void> {
  const { goal, onEvent, signal } = opts;

  const apiKey = await invoke('config:get-api-key');
  if (!apiKey) throw new Error('API_KEY_MISSING');

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'anthropic-beta': COMPUTER_BETA },
  });

  const screenSize = await invoke('agent:screen-size');
  const scaleX = screenSize.realWidth / screenSize.scaledWidth;
  const scaleY = screenSize.realHeight / screenSize.scaledHeight;

  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: goal,
  }];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (signal.aborted) {
      onEvent({ type: 'error', message: 'parado pelo usuário' });
      return;
    }

    onEvent({ type: 'status', message: `pensando (passo ${iter + 1})` });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: COMPUTER_TOOL_TYPE,
          name: 'computer',
          display_width_px: screenSize.scaledWidth,
          display_height_px: screenSize.scaledHeight,
        } as never,
      ],
      messages,
    });

    // Surface any text response from the assistant
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        onEvent({ type: 'thought', message: block.text.trim() });
      }
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const finalText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n')
        .trim() || 'pronto!';
      onEvent({ type: 'done', message: finalText });
      return;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      if (signal.aborted) {
        onEvent({ type: 'error', message: 'parado pelo usuário' });
        return;
      }

      const input = block.input as Record<string, unknown>;
      const action = (input.action as string) || 'unknown';
      onEvent({ type: 'action', message: describeAction(action, input) });

      try {
        const result = await executeAction(action, input, { scaleX, scaleY });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.image
            ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: result.image } }]
            : (result.text ?? 'done'),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro desconhecido';
        onEvent({ type: 'error', message: `${action} falhou: ${msg}` });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `error: ${msg}`,
          is_error: true,
        });
      }
    }

    if (toolResults.length === 0) {
      onEvent({ type: 'done', message: 'concluído' });
      return;
    }

    messages.push({ role: 'user', content: toolResults });
  }

  onEvent({ type: 'error', message: `limite de ${MAX_ITERATIONS} passos atingido` });
}

function describeAction(action: string, input: Record<string, unknown>): string {
  const coord = input.coordinate as [number, number] | undefined;
  switch (action) {
    case 'screenshot': return 'capturou tela';
    case 'left_click': return `clicou em (${coord?.[0]}, ${coord?.[1]})`;
    case 'right_click': return `clique direito em (${coord?.[0]}, ${coord?.[1]})`;
    case 'middle_click': return `clique meio em (${coord?.[0]}, ${coord?.[1]})`;
    case 'double_click': return `duplo clique em (${coord?.[0]}, ${coord?.[1]})`;
    case 'mouse_move': return `mouse pra (${coord?.[0]}, ${coord?.[1]})`;
    case 'type': return `digitou "${String(input.text ?? '').slice(0, 40)}"`;
    case 'key': return `tecla: ${input.text}`;
    case 'scroll': return `scroll ${input.scroll_direction} ×${input.scroll_amount ?? 3}`;
    case 'cursor_position': return 'verificou posição do cursor';
    default: return `ação: ${action}`;
  }
}

interface Scale { scaleX: number; scaleY: number }

async function executeAction(
  action: string,
  input: Record<string, unknown>,
  { scaleX, scaleY }: Scale
): Promise<{ image?: string; text?: string }> {
  const coord = (input.coordinate as [number, number] | undefined);
  const realX = coord ? coord[0] * scaleX : 0;
  const realY = coord ? coord[1] * scaleY : 0;

  switch (action) {
    case 'screenshot': {
      const shot = await invoke('agent:screenshot');
      return { image: shot.base64 };
    }
    case 'left_click':
    case 'right_click':
    case 'middle_click': {
      const btn = action === 'left_click' ? 'left' : action === 'right_click' ? 'right' : 'middle';
      await invoke('agent:click', { x: realX, y: realY, button: btn });
      await sleep(300);
      const shot = await invoke('agent:screenshot');
      return { image: shot.base64 };
    }
    case 'double_click': {
      await invoke('agent:double-click', { x: realX, y: realY });
      await sleep(300);
      const shot = await invoke('agent:screenshot');
      return { image: shot.base64 };
    }
    case 'mouse_move': {
      await invoke('agent:move-mouse', { x: realX, y: realY });
      return { text: 'moved' };
    }
    case 'type': {
      await invoke('agent:type', String(input.text ?? ''));
      await sleep(200);
      const shot = await invoke('agent:screenshot');
      return { image: shot.base64 };
    }
    case 'key': {
      await invoke('agent:key', String(input.text ?? ''));
      await sleep(200);
      const shot = await invoke('agent:screenshot');
      return { image: shot.base64 };
    }
    case 'scroll': {
      const direction = (input.scroll_direction as 'up' | 'down') || 'down';
      const amount = (input.scroll_amount as number) || 3;
      await invoke('agent:scroll', { x: realX, y: realY, direction, amount });
      await sleep(200);
      const shot = await invoke('agent:screenshot');
      return { image: shot.base64 };
    }
    case 'cursor_position': {
      const pos = await invoke('agent:cursor-position');
      return { text: `x=${Math.round(pos.x / scaleX)},y=${Math.round(pos.y / scaleY)}` };
    }
    default:
      throw new Error(`ação não suportada: ${action}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
