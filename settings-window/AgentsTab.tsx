import { useEffect, useState } from 'react';
import { invoke } from '../src/services/ipc';
import type { AgentDTO } from '@shared/ipc-types';

type Mode = { kind: 'list' } | { kind: 'edit'; agent: AgentDTO } | { kind: 'new' };

const EMPTY: Omit<AgentDTO, 'id' | 'isBuiltIn' | 'memories'> = {
  name: '',
  emoji: '🤖',
  systemPrompt: '',
  model: 'auto',
  sharedMemories: false,
};

export function AgentsTab() {
  const [agents, setAgents] = useState<AgentDTO[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  const refresh = async () => setAgents(await invoke('agents:list'));
  useEffect(() => { refresh(); }, []);

  if (mode.kind === 'new' || mode.kind === 'edit') {
    return (
      <AgentEditor
        initial={mode.kind === 'edit' ? mode.agent : null}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={async () => { await refresh(); setMode({ kind: 'list' }); }}
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Agentes</h2>
        <button className="cb-btn-primary" onClick={() => setMode({ kind: 'new' })}>＋ Novo agente</button>
      </div>
      <p className="settings-help-top">
        Cada agente tem seu próprio system prompt, memórias e modelo. Trocar de agente é como trocar de "personalidade".
      </p>
      <ul className="agent-list">
        {agents.map((a) => (
          <li key={a.id}>
            <span className="agent-list-emoji">{a.emoji}</span>
            <div className="agent-list-info">
              <div className="agent-list-name">{a.name} {a.isBuiltIn && <span className="agent-list-tag">built-in</span>}</div>
              <div className="agent-list-meta">{a.memories.length} memórias · modelo: {a.model}</div>
            </div>
            <button className="agent-list-action" onClick={() => setMode({ kind: 'edit', agent: a })}>editar</button>
          </li>
        ))}
      </ul>
    </>
  );
}

interface EditorProps {
  initial: AgentDTO | null;
  onCancel: () => void;
  onSaved: () => void;
}

function AgentEditor({ initial, onCancel, onSaved }: EditorProps) {
  const [form, setForm] = useState(() =>
    initial ? {
      name: initial.name,
      emoji: initial.emoji,
      systemPrompt: initial.systemPrompt,
      model: initial.model,
      sharedMemories: initial.sharedMemories ?? false,
    } : EMPTY,
  );
  const [saving, setSaving] = useState(false);

  const isBuiltIn = initial?.isBuiltIn ?? false;

  const save = async () => {
    if (!form.name.trim()) { alert('Dá um nome pro agente'); return; }
    if (!form.systemPrompt.trim()) { alert('System prompt vazio'); return; }
    setSaving(true);
    try {
      if (initial) {
        await invoke('agents:update', { id: initial.id, patch: form });
      } else {
        await invoke('agents:create', form);
      }
      onSaved();
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!initial || initial.isBuiltIn) return;
    if (!confirm(`Apagar "${initial.name}"?`)) return;
    await invoke('agents:delete', initial.id);
    onSaved();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>{initial ? 'Editar agente' : 'Novo agente'}</h2>
        <button className="cb-btn-ghost-settings" onClick={onCancel}>← voltar</button>
      </div>

      <div className="form-row">
        <label>Emoji</label>
        <input
          type="text"
          value={form.emoji}
          onChange={(e) => setForm({ ...form, emoji: e.target.value.slice(0, 2) })}
          maxLength={2}
          style={{ width: 50, textAlign: 'center', fontSize: 18 }}
        />
      </div>

      <div className="form-row">
        <label>Nome</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="ex: SQL Helper"
          style={{ width: 280 }}
        />
      </div>

      <div className="form-row">
        <label>Modelo</label>
        <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value as 'auto' | 'haiku' | 'sonnet' })}>
          <option value="auto">Auto (escolhe pela pergunta)</option>
          <option value="haiku">Haiku — rápido e barato</option>
          <option value="sonnet">Sonnet — mais inteligente</option>
        </select>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-label">Memórias compartilhadas</div>
          <div className="setting-help">Esse agente também acessa as memórias dos outros.</div>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={form.sharedMemories}
            onChange={(e) => setForm({ ...form, sharedMemories: e.target.checked })}
          />
          <span></span>
        </label>
      </div>

      <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <label style={{ marginBottom: 4 }}>System prompt</label>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          rows={12}
          placeholder="Você é um assistente especialista em..."
        />
        {isBuiltIn && (
          <div className="settings-help" style={{ marginTop: 4 }}>
            Agente built-in — mudanças ficam salvas. Pra reverter ao original, apague o app e reinstale.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <div>
          {initial && !isBuiltIn && (
            <button className="danger-btn" onClick={remove}>Apagar agente</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="cb-btn-ghost-settings" onClick={onCancel}>Cancelar</button>
          <button className="cb-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </>
  );
}
