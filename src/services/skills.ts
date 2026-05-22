// Skills que o Claude pode chamar como tools — substituem os toggles manuais.
import { invoke } from './ipc';
import { useConversation } from '@/state/conversation';
import { requestApproval, publishCardResult, registerAutoApprovedCard } from './run-command-bridge';
import { requestScreenConsent } from './screen-consent-bridge';
import { getMCPToolNames } from './mcp-tools-cache';

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
  {
    name: 'list_folder',
    description:
      'Lista arquivos e subpastas dentro de uma pasta que o usuário anexou. Use ANTES de read_file quando precisar saber o que tem. Já filtra ruído (.git, node_modules, dist, lock files, e .gitignore se existir). Limite: 200 entradas por chamada.\n\nRetorno: `{ path, entries: [{ name, absolutePath, type, size, modified }] }`. CRÍTICO: quando for chamar read_file depois, passe o campo `absolutePath` (caminho completo tipo "C:\\\\Users\\\\x\\\\foo.txt"), NUNCA o `name` (que é relativo tipo "src/foo.txt"). Passar relativo vai bater no scope guard com erro "path not in attached scope".',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Caminho ABSOLUTO da pasta (tipo "C:\\\\Users\\\\x\\\\projeto"). Pega isso EXATAMENTE como aparece no bloco ATTACHED PATHS do system prompt — não modifica.' },
        recursive: { type: 'boolean', description: 'Se true, desce em subpastas até 5 níveis.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description:
      'Lê o conteúdo de um arquivo (texto/código/PDF/DOCX/imagem). Para imagens você recebe um bloco image que pode analisar diretamente. Limites: 200KB texto, 5MB PDF, 2MB DOCX, 1MB imagem — acima disso vem truncado com sufixo.\n\nUSE SEMPRE caminho ABSOLUTO. Vem do `absolutePath` de cada entry retornada por list_folder, OU direto do bloco ATTACHED PATHS quando é um arquivo (não pasta) que o usuário anexou. Caminhos relativos (sem letra de drive no Windows) NÃO funcionam.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Caminho ABSOLUTO do arquivo (tipo "C:\\\\Users\\\\x\\\\foo.txt"). Use o `absolutePath` retornado por list_folder, ou o path direto do bloco ATTACHED PATHS.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'view_screen',
    description:
      'Olha a JANELA ATIVA do usuário (em foco antes do Buddy) por iniciativa própria. Use proativamente sempre que ver a tela vai te dar contexto pra responder melhor — não espere o usuário pedir explicitamente, na maioria das vezes ele não vai pedir. Exemplos de quando vale a pena olhar: pergunta vaga ou sem contexto suficiente ("o que eu faço aqui?", "me ajuda", "isso tá certo?"), você não tem certeza do que ele tá fazendo, ele descreveu algo de forma ambígua, parece haver um erro/UI/código relevante na frente dele, ou simplesmente conferir antes de chutar. Prefira olhar a pedir esclarecimento — é mais rápido e útil. Na primeira chamada da sessão aparece um modal de permissão; depois é silencioso até o Buddy dormir. Retorna a imagem da janela pra você analisar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'run_command',
    description:
      'Executa um comando PowerShell no Windows do usuário. SEMPRE requer confirmação humana antes de rodar — uma UI inline aparece com o comando proposto + working dir + botões Rodar/Cancelar/Editar. Use pra: instalar deps (npm/pip/cargo), git workflow, listagem de sistema (Get-Process, Get-ChildItem), build/test scripts. NÃO use pra coisas que outras tools cobrem (read_file pra arquivos locais, web_search pra info online).\n\nUse sintaxe PowerShell: Get-ChildItem em vez de ls, Get-Process em vez de ps. Comandos universais (git, npm, node, python, docker) têm sintaxe igual em ambos.\n\nRetorno: JSON string com { stdout, stderr, exitCode, durationMs, timedOut }. exitCode 0 = sucesso. Cancelado pelo user retorna { cancelled: true, reason: "user denied" }.',
    input_schema: {
      type: 'object',
      properties: {
        command:   { type: 'string', description: 'Comando PowerShell completo. Ex: "npm install zustand", "git status", "Get-Process | Sort-Object WS -Descending | Select-Object -First 5"' },
        cwd:       { type: 'string', description: 'Working directory absoluto (opcional). Default: primeira pasta em attachedPaths, fallback home do user.' },
        timeoutMs: { type: 'number', description: 'Timeout em ms (opcional). Default 120000 (2 min), max 600000 (10 min).' },
      },
      required: ['command'],
    },
  },
];

export interface ToolResult {
  content: string;
  // Se a tool causou uma side-effect visível na UI (ex: paste), o chat vira "modo confirmação".
  sideEffect?: 'pasted' | 'memory_saved';
  // Se a tool produz texto que o Claude deve usar no contexto da resposta.
  text?: string;
  // Se a tool retorna uma imagem (ex: read_file de PNG/JPG), o tool_result vira um bloco image.
  imageResult?: { base64: string; mimeType: string };
  // Inline UI marker the streaming layer should splice into the assistant
  // message (after `[[step:<tool>]]` was already emitted). Used by edit_in_place
  // (undo chip) and save_memory (expanded chip with index).
  uiMarker?: string;
}

// Module-local registry mapping undo tokens → original clipboard text. Lives
// in the renderer because the IPC roundtrip to read the clipboard happens
// from here; the main process keeps its own registry for the actual undo
// dispatch (so we don't ship the original text through IPC twice).

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
      // Snapshot whatever the user had in the clipboard before we clobber it.
      // null means "nothing useful to undo to" — we still proceed, just no chip.
      let original: string | null = null;
      try { original = await invoke('clipboard:read-text-for-undo'); } catch { /* swallow */ }
      await invoke('keyboard:paste-to-active', text);
      let uiMarker: string | undefined;
      if (original != null) {
        const token = crypto.randomUUID();
        // Stash on the main side so the IPC undo handler can find the text.
        // We send the original through a dedicated channel so this module never
        // has to store sensitive clipboard content in renderer memory.
        try {
          await invoke('automation:register-undo-paste', { token, original });
          uiMarker = `[[step:edit_in_place_undoable:${token}]]`;
        } catch { /* swallow: chip just won't show */ }
      }
      return {
        content: `Colado com sucesso (${text.length} chars).`,
        sideEffect: 'pasted',
        uiMarker,
      };
    }
    case 'save_memory': {
      const fact = String(input.fact ?? '').trim();
      if (!fact) return { content: 'save_memory: fato vazio.' };
      await invoke('memories:add', fact);
      await refreshMemoriesCache();
      // The new index is the last position. Renderer-side cache was just
      // refreshed so length matches the underlying store.
      const newIndex = Math.max(0, memoriesCache.length - 1);
      // Truncate for the chip; full fact stays in memory store.
      const truncated = fact.length > 80 ? fact.slice(0, 79) + '…' : fact;
      // Base64-encode to avoid `]]` collisions inside the fact text.
      const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ index: newIndex, fact: truncated }))));
      return {
        content: `Memória salva: "${fact}"`,
        sideEffect: 'memory_saved',
        uiMarker: `[[step:save_memory_undo:${payload}]]`,
      };
    }
    case 'list_folder': {
      const path = String(input.path ?? '');
      const recursive = Boolean(input.recursive);
      const r = await invoke('files:list-folder', { path, recursive });
      if (!r.ok) return { content: `error: ${r.error}` };
      return { content: JSON.stringify(r.listing) };
    }
    case 'read_file': {
      const path = String(input.path ?? '');
      const r = await invoke('files:read-file', { path });
      if (!r.ok) return { content: `error: ${r.error}` };
      const c = r.content;
      if (c.kind === 'image') {
        // Image result: build a tool_result content array with an image block
        return {
          content: '[image attached]', // fallback for non-image-aware sinks
          imageResult: { base64: c.base64, mimeType: c.mimeType },
        };
      }
      return { content: c.text };
    }
    case 'view_screen': {
      const ok = await requestScreenConsent();
      if (!ok) return { content: 'view_screen: user declined screen access' };
      const shot = await invoke('capture:active-window');
      if (!shot) return { content: 'view_screen: no active window to capture' };
      return {
        content: '[active window captured]',
        imageResult: { base64: shot.base64, mimeType: shot.mimeType },
      };
    }
    case 'run_command': {
      const command = String(input.command ?? '').trim();
      if (!command) return { content: 'error: empty command' };
      const explicitCwd = input.cwd ? String(input.cwd) : undefined;
      const timeoutMs = typeof input.timeoutMs === 'number' ? input.timeoutMs : undefined;
      // Cwd resolution: explicit > first attached folder > undefined (main → home)
      const attachedFolder = useConversation.getState().attachedPaths.find((p) => p.kind === 'folder');
      const effectiveCwd = explicitCwd ?? attachedFolder?.path;

      // Persisted allowlist: skip the human-in-the-loop card if the user has
      // previously said "always allow" for this pattern. Card still mounts in
      // 'running' state via registerAutoApprovedCard so the run is observable.
      let id: string;
      let finalCommand = command;
      let finalCwd = effectiveCwd;
      let isAllowlisted = false;
      try {
        isAllowlisted = await invoke('shell:allowlist-match', command);
      } catch { /* swallow: treat as not allowlisted */ }
      if (isAllowlisted) {
        id = registerAutoApprovedCard({ command, cwd: effectiveCwd, timeoutMs });
      } else {
        const { id: approvalId, decision: decisionPromise } =
          requestApproval({ command, cwd: effectiveCwd, timeoutMs });
        const decision = await decisionPromise;
        if (!decision.approved) {
          // resolveApproval already emitted 'cancelled' to the card. Just tell the agent.
          return { content: JSON.stringify({ cancelled: true, reason: 'user denied' }) };
        }
        id = approvalId;
        finalCommand = decision.finalCommand ?? command;
        finalCwd = decision.finalCwd ?? effectiveCwd;
      }
      // The card uses the same id as the runId so the renderer can kill/extend
      // by referring to a single handle.
      const r = await invoke('shell:run-command', {
        command: finalCommand,
        cwd: finalCwd,
        timeoutMs,
        runId: id,
      });
      if (!r.ok) {
        publishCardResult(id, { kind: 'error', error: r.error });
        return { content: `error: ${r.error}` };
      }
      publishCardResult(id, { kind: 'ok', result: r.result });
      return { content: JSON.stringify(r.result) };
    }
    default: {
      // MCP tool? Route through the main process. Cache tells us if this
      // prefixed name belongs to a running MCP server.
      if (getMCPToolNames().has(name)) {
        const r = await invoke('mcp:call-tool', { prefixedName: name, input });
        if (r.ok) return { content: r.content };
        return { content: `error: ${r.error ?? 'unknown MCP error'}` };
      }
      return { content: `Tool desconhecida: ${name}` };
    }
  }
}

