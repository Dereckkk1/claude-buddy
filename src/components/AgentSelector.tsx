import { useEffect, useRef, useState } from 'react';
import { invoke } from '@/services/ipc';
import type { AgentDTO } from '@shared/ipc-types';

interface Props {
  active: AgentDTO | null;
  onChange: (a: AgentDTO) => void;
}

export function AgentSelector({ active, onChange }: Props) {
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

  return (
    <div className="agent-selector" ref={rootRef}>
      <button className="agent-selector-trigger" onClick={() => setOpen((v) => !v)}>
        <span>{active.emoji}</span>
        <span className="agent-selector-name">{active.name}</span>
        <span className="agent-selector-caret">▾</span>
      </button>
      {open && (
        <div className="agent-selector-menu">
          {agents.map((a) => (
            <button
              key={a.id}
              className={`agent-selector-item ${a.id === active.id ? 'active' : ''}`}
              onClick={async () => {
                await invoke('agents:set-active', a.id);
                onChange(a);
                setOpen(false);
              }}
            >
              <span>{a.emoji}</span>
              <span>{a.name}</span>
              {a.isBuiltIn ? null : <span className="agent-selector-tag">custom</span>}
            </button>
          ))}
          <div className="agent-selector-sep" />
          <button
            className="agent-selector-item agent-selector-manage"
            onClick={async () => { await invoke('settings:open'); setOpen(false); }}
          >
            ＋ Gerenciar agentes…
          </button>
        </div>
      )}
    </div>
  );
}
