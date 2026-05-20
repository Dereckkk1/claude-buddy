import { useEffect, useRef } from 'react';
import type { AgentEvent } from '@/services/agent';

interface Props {
  status: string;
  events: AgentEvent[];
  onStop: () => void;
}

export function AgentOverlay({ status, events, onStop }: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  return (
    <div className="agent-overlay">
      <div className="agent-header">
        <div className="agent-status">
          <span className="agent-spinner"></span>
          <span>{status}</span>
        </div>
        <button className="cb-btn cb-btn-stop" onClick={onStop}>parar</button>
      </div>
      <div className="agent-log" ref={logRef}>
        {events.map((e, i) => (
          <div key={i} className={`agent-log-row agent-log-${e.type}`}>
            {iconFor(e.type)} {e.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function iconFor(type: AgentEvent['type']): string {
  switch (type) {
    case 'status': return '·';
    case 'action': return '→';
    case 'thought': return '"';
    case 'done': return '✓';
    case 'error': return '✕';
  }
}
