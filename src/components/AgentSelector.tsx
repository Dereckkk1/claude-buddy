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
        <span className="agent-selector-emoji">{active.emoji}</span>
        <span className="agent-selector-name">{active.name}</span>
        <svg
          className={`agent-selector-caret${pulseHint ? ' pulse' : ''}`}
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        ><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="agent-selector-menu">
          {agents.map((a) => {
            const isActive = a.id === active.id;
            return (
              <button
                key={a.id}
                className={`agent-selector-item${isActive ? ' is-active' : ''}`}
                onClick={() => handlePick(a)}
              >
                <span className="agent-selector-emoji">{a.emoji}</span>
                <span className="agent-selector-label">{a.name}</span>
                {!a.isBuiltIn && (
                  <span className="agent-selector-tag">{t('bubble.customTag')}</span>
                )}
                {isActive && (
                  <svg
                    className="agent-selector-check"
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  ><path d="M20 6 9 17l-5-5"/></svg>
                )}
              </button>
            );
          })}
          <div className="agent-selector-sep" />
          <button
            className="agent-selector-item agent-selector-manage"
            onClick={async () => { await invoke('settings:open'); setOpen(false); }}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            ><path d="M12 5v14M5 12h14"/></svg>
            <span className="agent-selector-label">{t('bubble.manageAgents')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
