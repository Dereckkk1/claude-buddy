// Multi-agent storage. Built-in + user-defined agents, each with own system prompt and memories.
import Store from 'electron-store';
import { machineIdSync } from 'node-machine-id';

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  systemPrompt: string;
  model: 'auto' | 'haiku' | 'sonnet';
  memories: string[];
  isBuiltIn: boolean;
  sharedMemories?: boolean;
}

interface AgentsSchema {
  agents?: Agent[];
  activeAgentId?: string;
}

const encryptionKey = machineIdSync(true).slice(0, 32);
const agentsStore = new Store<AgentsSchema>({
  name: 'claude-buddy-agents',
  encryptionKey,
  defaults: {},
});

const BUDDY_PROMPT = `Você é o Claude Buddy, um mascote pixel-art que vive na tela do usuário. Responda em PT-BR informal, curto e direto. Markdown OK no chat (negrito, listas, code).`;

const CODE_HELPER_PROMPT = `Você é um assistente de programação. Responda em PT-BR direto. Foco em:
- Explicar código com clareza, exemplos práticos
- Apontar bugs e sugerir fixes
- Trade-offs entre soluções
- Padrões e boas práticas

Use code blocks pra qualquer trecho de código (markdown).`;

const TUTOR_PROMPT = `Você é um tutor de português brasileiro. Foco em:
- Corrigir ortografia, gramática, concordância
- Sugerir melhorias de estilo e clareza
- Explicar regras com exemplos curtos
- Tom didático mas leve`;

const WRITER_PROMPT = `Você é um copywriter / editor profissional. Foco em:
- Escrever emails, textos curtos, posts, copy
- Reescrever pra ficar mais claro, persuasivo ou conciso
- Adaptar tom (formal, casual, técnico)`;

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'buddy',
    name: 'Buddy',
    emoji: '🦀',
    systemPrompt: BUDDY_PROMPT,
    model: 'auto',
    memories: [],
    isBuiltIn: true,
  },
  {
    id: 'code-helper',
    name: 'Code Helper',
    emoji: '💻',
    systemPrompt: CODE_HELPER_PROMPT,
    model: 'auto',
    memories: [],
    isBuiltIn: true,
  },
  {
    id: 'tutor-ptbr',
    name: 'Tutor PT-BR',
    emoji: '📝',
    systemPrompt: TUTOR_PROMPT,
    model: 'haiku',
    memories: [],
    isBuiltIn: true,
  },
  {
    id: 'writer',
    name: 'Escritor',
    emoji: '✍️',
    systemPrompt: WRITER_PROMPT,
    model: 'auto',
    memories: [],
    isBuiltIn: true,
  },
];

export function initAgentsIfNeeded(legacyMemories: string[] = []): void {
  const existing = agentsStore.get('agents');
  if (!existing || existing.length === 0) {
    // First run: seed defaults, migrate legacy memories to Buddy
    const seeded = DEFAULT_AGENTS.map((a) =>
      a.id === 'buddy' ? { ...a, memories: legacyMemories } : a,
    );
    agentsStore.set('agents', seeded);
    agentsStore.set('activeAgentId', 'buddy');
    return;
  }

  // Migration: refresh built-in system prompts when they look outdated.
  // Custom agents and user edits on built-in prompts are preserved unless the
  // prompt still contains the legacy tool instructions block.
  let dirty = false;
  const updated = existing.map((a) => {
    if (!a.isBuiltIn) return a;
    const looksLegacy = a.systemPrompt.includes('read_selection') || a.systemPrompt.includes('edit_in_place') || a.systemPrompt.includes('VOCÊ TEM ACESSO');
    if (!looksLegacy) return a;
    const fresh = DEFAULT_AGENTS.find((d) => d.id === a.id);
    if (!fresh) return a;
    dirty = true;
    return { ...a, systemPrompt: fresh.systemPrompt };
  });
  if (dirty) agentsStore.set('agents', updated);
}

export function listAgents(): Agent[] {
  return agentsStore.get('agents') ?? DEFAULT_AGENTS;
}

export function getActiveAgent(): Agent {
  const id = agentsStore.get('activeAgentId') ?? 'buddy';
  const agents = listAgents();
  const found = agents.find((a) => a.id === id) ?? agents[0];

  // If sharedMemories is on, merge memories from all OTHER agents (dedupe)
  if (found.sharedMemories) {
    const merged = new Set<string>(found.memories);
    for (const a of agents) {
      if (a.id !== found.id) a.memories.forEach((m) => merged.add(m));
    }
    return { ...found, memories: Array.from(merged) };
  }
  return found;
}

export function setActiveAgent(id: string): void {
  agentsStore.set('activeAgentId', id);
}

export function createAgent(input: Omit<Agent, 'id' | 'isBuiltIn' | 'memories'>): Agent {
  const agent: Agent = {
    ...input,
    id: `custom-${Date.now()}`,
    memories: [],
    isBuiltIn: false,
  };
  const agents = listAgents();
  agents.push(agent);
  agentsStore.set('agents', agents);
  return agent;
}

export function updateAgent(id: string, patch: Partial<Omit<Agent, 'id' | 'isBuiltIn'>>): Agent | null {
  const agents = listAgents();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  agents[idx] = { ...agents[idx], ...patch };
  agentsStore.set('agents', agents);
  return agents[idx];
}

export function deleteAgent(id: string): void {
  const agents = listAgents().filter((a) => a.id !== id || a.isBuiltIn);
  agentsStore.set('agents', agents);
  // If the deleted agent was active, switch to Buddy
  if (agentsStore.get('activeAgentId') === id) {
    agentsStore.set('activeAgentId', 'buddy');
  }
}

export function addMemoryToAgent(agentId: string, fact: string): void {
  const agents = listAgents();
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx === -1) return;
  if (!agents[idx].memories.includes(fact)) {
    agents[idx].memories.push(fact);
    if (agents[idx].memories.length > 50) agents[idx].memories = agents[idx].memories.slice(-50);
    agentsStore.set('agents', agents);
  }
}

export function deleteMemoryFromAgent(agentId: string, index: number): void {
  const agents = listAgents();
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx === -1) return;
  agents[idx].memories.splice(index, 1);
  agentsStore.set('agents', agents);
}

export function clearMemoriesForAgent(agentId: string): void {
  const agents = listAgents();
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx === -1) return;
  agents[idx].memories = [];
  agentsStore.set('agents', agents);
}
