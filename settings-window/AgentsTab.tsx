import { useEffect, useState } from 'react';
import { invoke } from '../src/services/ipc';
import { useT } from '../src/i18n';
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
  const t = useT();
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
        <h2 style={{ margin: 0 }}>{t('settings.agents.heading')}</h2>
        <button className="cb-btn-primary" onClick={() => setMode({ kind: 'new' })}>{t('settings.agents.new')}</button>
      </div>
      <p className="settings-help-top">{t('settings.agents.help')}</p>
      <ul className="agent-list">
        {agents.map((a) => (
          <li key={a.id}>
            <span className="agent-list-emoji">{a.emoji}</span>
            <div className="agent-list-info">
              <div className="agent-list-name">
                {a.name} {a.isBuiltIn && <span className="agent-list-tag">{t('settings.agents.builtInTag')}</span>}
              </div>
              <div className="agent-list-meta">{t('settings.agents.memoriesCount', { n: a.memories.length, model: a.model })}</div>
            </div>
            <button className="agent-list-action" onClick={() => setMode({ kind: 'edit', agent: a })}>{t('settings.agents.edit')}</button>
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
  const t = useT();
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
    if (!form.name.trim()) { alert(t('settings.agents.needName')); return; }
    if (!form.systemPrompt.trim()) { alert(t('settings.agents.needPrompt')); return; }
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
    if (!confirm(t('settings.agents.confirmDelete', { name: initial.name }))) return;
    await invoke('agents:delete', initial.id);
    onSaved();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>{initial ? t('settings.agents.editAgent') : t('settings.agents.newAgent')}</h2>
        <button className="cb-btn-ghost-settings" onClick={onCancel}>{t('settings.agents.back')}</button>
      </div>

      <div className="form-row">
        <label>{t('settings.agents.emoji')}</label>
        <input
          type="text"
          value={form.emoji}
          onChange={(e) => setForm({ ...form, emoji: e.target.value.slice(0, 2) })}
          maxLength={2}
          style={{ width: 50, textAlign: 'center', fontSize: 18 }}
        />
      </div>

      <div className="form-row">
        <label>{t('settings.agents.name')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t('settings.agents.namePlaceholder')}
          style={{ width: 280 }}
          disabled={isBuiltIn}
        />
      </div>

      <div className="form-row">
        <label>{t('settings.agents.model')}</label>
        <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value as 'auto' | 'haiku' | 'sonnet' })}>
          <option value="auto">{t('settings.agents.modelAuto')}</option>
          <option value="haiku">{t('settings.agents.modelHaiku')}</option>
          <option value="sonnet">{t('settings.agents.modelSonnet')}</option>
        </select>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-label">{t('settings.agents.sharedMemories')}</div>
          <div className="setting-help">{t('settings.agents.sharedMemoriesHelp')}</div>
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
        <label style={{ marginBottom: 4 }}>{t('settings.agents.systemPrompt')}</label>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          rows={12}
          placeholder={t('settings.agents.systemPromptPlaceholder')}
          disabled={isBuiltIn}
        />
        {isBuiltIn && (
          <div className="settings-help" style={{ marginTop: 4 }}>
            {t('settings.agents.builtInNotice')}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <div>
          {initial && !isBuiltIn && (
            <button className="danger-btn" onClick={remove}>{t('settings.agents.delete')}</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="cb-btn-ghost-settings" onClick={onCancel}>{t('settings.agents.cancel')}</button>
          <button className="cb-btn-primary" onClick={save} disabled={saving}>
            {saving ? t('settings.agents.saving') : t('settings.agents.save')}
          </button>
        </div>
      </div>
    </>
  );
}
