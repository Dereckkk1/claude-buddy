import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentEvent } from '@/services/agent';
import { useT } from '@/i18n';

interface Props {
  status: string;
  events: AgentEvent[];
  onStop: () => void;
}

export function AgentOverlay({ status, events, onStop }: Props) {
  const t = useT();
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
        <button className="cb-btn cb-btn-stop" onClick={onStop}>{t('agent.stop')}</button>
      </div>
      <div className="agent-log" ref={logRef}>
        {events.map((e, i) => (
          <div key={i} className={`agent-log-row agent-log-${e.type}`}>
            <span className="agent-log-icon">{iconFor(e.type)}</span>
            <span className="agent-log-msg">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                // Inline-only — no <p>/<h1>/etc wrapping. Each log row is a single
                // line; let bold/italic/code render but skip block-level wrapping.
                components={{
                  p: ({ children }) => <>{children}</>,
                  h1: ({ children }) => <strong>{children}</strong>,
                  h2: ({ children }) => <strong>{children}</strong>,
                  h3: ({ children }) => <strong>{children}</strong>,
                  ul: ({ children }) => <>{children}</>,
                  li: ({ children }) => <>{children}</>,
                }}
              >
                {e.message}
              </ReactMarkdown>
            </span>
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
