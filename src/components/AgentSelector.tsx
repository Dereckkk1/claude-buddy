import { useEffect, useRef, useState } from 'react';
import { invoke } from '@/services/ipc';
import { useT } from '@/i18n';
import type { AgentDTO } from '@shared/ipc-types';

interface Props {
  active: AgentDTO | null;
  onChange: (a: AgentDTO) => void;
  /**
   * If true, switching agents shows a confirm() — OK keeps the current
   * conversation, Cancel resets via `onResetConversation`. If false (or
   * absent), switches happen silently.
   */
  hasActiveConversation?: boolean;
  /** Called when the user opts to start a new conversation after switching. */
  onResetConversation?: () => void;
  /**
   * Adds a subtle pulse to the dropdown caret to nudge first-time users
   * toward the agent switcher. Used only in the first couple of sessions.
   */
  pulseHint?: boolean;
}

export function AgentSelector({ active, onChange, hasActiveConversation, onResetConversation, pulseHint }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<AgentDTO[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) invoke('agents:list').then(setAgents);
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!active) return null;

  const handlePick = async (a: AgentDTO) => {
    // No-op when picking the same agent
    if (a.id === active.id) { setOpen(false); return; }
    // Only prompt when there's an in-flight conversation. The native confirm()
    // is intentional: it's the cheapest way to surface a clear 2-way decision
    // without introducing a new modal component.
    if (hasActiveConversation) {
      const keepConv = confirm(t('agents.switchConfirm', { newAgent: a.name }));
      await invoke('agents:set-active', a.id);
      if (!keepConv) {
        // User chose "new conversation"
        onResetConversation?.();
      }
      onChange(a);
      setOpen(false);
      return;
    }
    await invoke('agents:set-active', a.id);
    onChange(a);
    setOpen(false);
  };

  return (
    <div className="agent-selector" ref={rootRef}>
      <button
        className="agent-selector-trigger"
        onClick={() => setOpen((v) => !v)}
        title={t('agents.switchTooltip')}
      >
        <span>{active.emoji}</span>
        <span className="agent-selector-name">{active.name}</span>
        <span className={`agent-selector-caret${pulseHint ? ' pulse' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="agent-selector-menu">
          {agents.map((a) => (
            <button
              key={a.id}
              className={`agent-selector-item ${a.id === active.id ? 'active' : ''}`}
              onClick={() => handlePick(a)}
            >
              <span>{a.emoji}</span>
              <span>{a.name}</span>
              {a.isBuiltIn ? null : <span className="agent-selector-tag">{t('bubble.customTag')}</span>}
            </button>
          ))}
          <div className="agent-selector-sep" />
          <button
            className="agent-selector-item agent-selector-manage"
            onClick={async () => { await invoke('settings:open'); setOpen(false); }}
          >
            {t('bubble.manageAgents')}
          </button>
        </div>
      )}
    </div>
  );
}
