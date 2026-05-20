// Skills que o Claude pode chamar como tools — substituem os toggles manuais.
import { invoke } from './ipc';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const TOOLS: ToolDef[] = [
  {
    name: 'read_selection',
    description:
      'Lê o texto que o usuário tem SELECIONADO em outro aplicativo nesse momento (simula Ctrl+C). Use quando o usuário se referir a "isso", "esse texto", "essa parte" sem ter anexado nada explicitamente — ele provavelmente quer dizer o que está selecionado na janela ativa.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'edit_in_place',
    description:
      'Cola um novo texto NA JANELA ATIVA do usuário, substituindo o que estiver selecionado. Use quando ele pedir pra "corrigir", "reescrever", "traduzir", "deixar mais formal" um texto que ele tem selecionado em outro app — o resultado vai direto pra lá, ele NÃO precisa copiar e colar manual.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'O texto final que vai substituir o que está selecionado.' },
        comment: { type: 'string', description: 'Comentário curto e informal pro chat (1-2 frases) dizendo o que você fez. Ex: "corrigi 3 erros de ortografia"' },
      },
      required: ['text', 'comment'],
    },
  },
  {
    name: 'save_memory',
    description:
      'Salva um fato sobre o usuário pra você lembrar em conversas futuras (ex: "usa Cursor", "trabalha com Python", "prefere respostas curtas"). Use de forma esparsa, só pra fatos realmente úteis. Não salve coisas óbvias ou triviais.',
    input_schema: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'Fato curto sobre o usuário. Ex: "trabalha em Manaus"' } },
      required: ['fact'],
    },
  },
];

export interface ToolResult {
  content: string;
  // Se a tool causou uma side-effect visível na UI (ex: paste), o chat vira "modo confirmação".
  sideEffect?: 'pasted' | 'memory_saved';
  // Se a tool produz texto que o Claude deve usar no contexto da resposta.
  text?: string;
}

// In-memory cache, refreshed at session start
let memoriesCache: string[] = [];

export async function refreshMemoriesCache(): Promise<void> {
  try {
    memoriesCache = await invoke('memories:list');
  } catch {
    memoriesCache = [];
  }
}

export function getMemoriesForPrompt(): string {
  if (memoriesCache.length === 0) return '';
  return `\n\nMEMÓRIAS sobre o usuário (use quando relevante):\n${memoriesCache.map((f) => `- ${f}`).join('\n')}`;
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case 'read_selection': {
      // Simulates Ctrl+C on the previously active window to actually grab the live selection,
      // not just whatever was in the clipboard before.
      const selection = await invoke('keyboard:read-selection');
      if (selection && selection.trim()) {
        return { content: selection, text: selection };
      }
      // Fallback: maybe user copied earlier
      const data = await invoke('clipboard:read');
      if (data?.kind === 'text') {
        return { content: data.content, text: data.content };
      }
      return { content: 'Nenhum texto selecionado na janela ativa.' };
    }
    case 'edit_in_place': {
      const text = String(input.text ?? '');
      if (!text.trim()) return { content: 'edit_in_place: texto vazio, nada feito.' };
      await invoke('keyboard:paste-to-active', text);
      return {
        content: `Colado com sucesso (${text.length} chars).`,
        sideEffect: 'pasted',
      };
    }
    case 'save_memory': {
      const fact = String(input.fact ?? '').trim();
      if (!fact) return { content: 'save_memory: fato vazio.' };
      await invoke('memories:add', fact);
      await refreshMemoriesCache();
      return { content: `Memória salva: "${fact}"`, sideEffect: 'memory_saved' };
    }
    default:
      return { content: `Tool desconhecida: ${name}` };
  }
}

