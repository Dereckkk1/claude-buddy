// Multi-agent storage. Built-in + user-defined agents, each with own system prompt and memories.
//
// Localization model:
// - Built-in agents have IDs (buddy/code-helper/tutor-ptbr/writer) but their
//   name + systemPrompt are NOT persisted — they're rendered on the fly from
//   the i18n dictionary using the current locale. This means switching the UI
//   language instantly relocalizes built-ins without touching the store.
// - Custom agents are persisted verbatim (whatever the user typed stays).
import Store from 'electron-store';
import { machineIdSync } from 'node-machine-id';
import type { Locale } from '../shared/ipc-types';
import { dict } from '../shared/i18n-strings';
import { getSettings } from './store';

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

// Minimal persisted shape for built-ins — name/prompt are derived per-locale.
interface StoredAgent {
  id: string;
  emoji: string;
  // name/systemPrompt may be present (legacy stores) but are ignored for built-ins
  name?: string;
  systemPrompt?: string;
  model: 'auto' | 'haiku' | 'sonnet';
  memories: string[];
  isBuiltIn: boolean;
  sharedMemories?: boolean;
}

interface AgentsSchema {
  agents?: StoredAgent[];
  activeAgentId?: string;
}

const encryptionKey = machineIdSync(true).slice(0, 32);
const agentsStore = new Store<AgentsSchema>({
  name: 'claude-buddy-agents',
  encryptionKey,
  defaults: {},
});

// Built-in definitions: ID + emoji + i18n key + model. Name/prompt come from
// the dict at read-time.
interface BuiltInDef {
  id: string;
  emoji: string;
  i18nKey: 'buddy' | 'codeHelper' | 'tutor' | 'writer';
  model: 'auto' | 'haiku' | 'sonnet';
}

const BUILT_IN_DEFS: BuiltInDef[] = [
  { id: 'buddy',        emoji: '🦀', i18nKey: 'buddy',      model: 'auto'  },
  { id: 'code-helper',  emoji: '💻', i18nKey: 'codeHelper', model: 'auto'  },
  { id: 'tutor-ptbr',   emoji: '📝', i18nKey: 'tutor',      model: 'haiku' },
  { id: 'writer',       emoji: '✍️', i18nKey: 'writer',     model: 'auto'  },
];

function currentLocale(): Locale {
  try { return getSettings().locale; } catch { return 'en'; }
}

function hydrate(stored: StoredAgent, locale: Locale): Agent {
  if (stored.isBuiltIn) {
    const def = BUILT_IN_DEFS.find((d) => d.id === stored.id);
    if (def) {
      const strings = dict(locale).builtInAgents[def.i18nKey];
      return {
        id: stored.id,
        name: strings.name,
        emoji: stored.emoji || def.emoji,
        systemPrompt: strings.prompt,
        model: stored.model,
        memories: stored.memories,
        isBuiltIn: true,
        sharedMemories: stored.sharedMemories,
      };
    }
  }
  // Custom agent — return as-is, falling back if any field is missing.
  return {
    id: stored.id,
    name: stored.name ?? '(no name)',
    emoji: stored.emoji,
    systemPrompt: stored.systemPrompt ?? '',
    model: stored.model,
    memories: stored.memories,
    isBuiltIn: stored.isBuiltIn,
    sharedMemories: stored.sharedMemories,
  };
}

function seedBuiltIns(legacyMemories: string[] = []): StoredAgent[] {
  return BUILT_IN_DEFS.map((def) => ({
    id: def.id,
    emoji: def.emoji,
    model: def.model,
    memories: def.id === 'buddy' ? legacyMemories : [],
    isBuiltIn: true,
  }));
}

export function initAgentsIfNeeded(legacyMemories: string[] = []): void {
  const existing = agentsStore.get('agents');
  if (!existing || existing.length === 0) {
    agentsStore.set('agents', seedBuiltIns(legacyMemories));
    agentsStore.set('activeAgentId', 'buddy');
    return;
  }

  // Migration: ensure all expected built-ins exist. If a built-in is missing
  // (added in a later version), insert a fresh stored entry. Also strip the
  // legacy name/systemPrompt from built-ins so the i18n dict takes over.
  let dirty = false;
  const byId = new Map(existing.map((a) => [a.id, a] as const));
  for (const def of BUILT_IN_DEFS) {
    if (!byId.has(def.id)) {
      dirty = true;
      byId.set(def.id, {
        id: def.id,
        emoji: def.emoji,
        model: def.model,
        memories: [],
        isBuiltIn: true,
      });
    } else {
      const cur = byId.get(def.id)!;
      if (cur.isBuiltIn && (cur.name || cur.systemPrompt)) {
        // Drop persisted name/prompt — they were stored from an older version.
        dirty = true;
        const { name: _n, systemPrompt: _p, ...rest } = cur;
        void _n; void _p;
        byId.set(def.id, rest);
      }
    }
  }
  if (dirty) agentsStore.set('agents', Array.from(byId.values()));
}

export function listAgents(): Agent[] {
  const locale = currentLocale();
  const stored = agentsStore.get('agents') ?? seedBuiltIns();
  return stored.map((s) => hydrate(s, locale));
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
  const stored: StoredAgent = {
    id: `custom-${Date.now()}`,
    name: input.name,
    emoji: input.emoji,
    systemPrompt: input.systemPrompt,
    model: input.model,
    memories: [],
    isBuiltIn: false,
    sharedMemories: input.sharedMemories,
  };
  const agents = agentsStore.get('agents') ?? seedBuiltIns();
  agents.push(stored);
  agentsStore.set('agents', agents);
  return hydrate(stored, currentLocale());
}

export function updateAgent(id: string, patch: Partial<Omit<Agent, 'id' | 'isBuiltIn'>>): Agent | null {
  const agents = agentsStore.get('agents') ?? seedBuiltIns();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const cur = agents[idx];
  // For built-ins, only allow updating: model, sharedMemories, memories, emoji.
  // Ignore name/systemPrompt patches — they come from the dict.
  if (cur.isBuiltIn) {
    const allowed: Partial<StoredAgent> = {
      model: patch.model ?? cur.model,
      sharedMemories: patch.sharedMemories ?? cur.sharedMemories,
      memories: patch.memories ?? cur.memories,
      emoji: patch.emoji ?? cur.emoji,
    };
    agents[idx] = { ...cur, ...allowed };
  } else {
    agents[idx] = { ...cur, ...patch };
  }
  agentsStore.set('agents', agents);
  return hydrate(agents[idx], currentLocale());
}

export function deleteAgent(id: string): void {
  const agents = (agentsStore.get('agents') ?? seedBuiltIns()).filter((a) => a.id !== id || a.isBuiltIn);
  agentsStore.set('agents', agents);
  // If the deleted agent was active, switch to Buddy
  if (agentsStore.get('activeAgentId') === id) {
    agentsStore.set('activeAgentId', 'buddy');
  }
}

export function addMemoryToAgent(agentId: string, fact: string): void {
  const agents = agentsStore.get('agents') ?? seedBuiltIns();
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx === -1) return;
  if (!agents[idx].memories.includes(fact)) {
    agents[idx].memories.push(fact);
    if (agents[idx].memories.length > 50) agents[idx].memories = agents[idx].memories.slice(-50);
    agentsStore.set('agents', agents);
  }
}

export function deleteMemoryFromAgent(agentId: string, index: number): void {
  const agents = agentsStore.get('agents') ?? seedBuiltIns();
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx === -1) return;
  agents[idx].memories.splice(index, 1);
  agentsStore.set('agents', agents);
}

export function clearMemoriesForAgent(agentId: string): void {
  const agents = agentsStore.get('agents') ?? seedBuiltIns();
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx === -1) return;
  agents[idx].memories = [];
  agentsStore.set('agents', agents);
}
