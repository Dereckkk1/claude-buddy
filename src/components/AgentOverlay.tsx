import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentEvent } from '@/services/agent';
import { useT } from '@/i18n';

interface Props {
  status: string;
  events: AgentEvent[];
  onStop: () => void;
  /** Current iteration counter rendered as "passo N/MAX" in the header. */
  step?: { count: number; max: number } | null;
  /** Soft "tô meio perdido" cue. Shows an inline redirect input. */
  lostHint?: string | null;
  onRedirect?: (newGoal: string) => void;
}

export function AgentOverlay({ status, events, onStop, step, lostHint, onRedirect }: Props) {
  const t = useT();
  const logRef = useRef<HTMLDivElement>(null);
  const [redirectDraft, setRedirectDraft] = useState('');

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  const submitRedirect = () => {
    const v = redirectDraft.trim();
    if (!v || !onRedirect) return;
    onRedirect(v);
    setRedirectDraft('');
  };

  return (
    <div className="agent-overlay">
      <div className="agent-header">
        <div className="agent-status">
          <span className="agent-spinner"></span>
          <span>{status}</span>
          {step && (
            <span className="agent-step-counter">
              {t('agent.stepCounter', { count: step.count, max: step.max })}
            </span>
          )}
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
                {messageOf(e)}
              </ReactMarkdown>
            </span>
          </div>
        ))}
      </div>
      {lostHint && onRedirect && (
        <div className="agent-redirect">
          <div className="agent-redirect-text">{lostHint}</div>
          <div className="agent-redirect-row">
            <input
              className="agent-redirect-input"
              value={redirectDraft}
              onChange={(e) => setRedirectDraft(e.target.value)}
              placeholder={t('agent.redirectPlaceholder')}
              onKeyDown={(e) => { if (e.key === 'Enter') submitRedirect(); }}
            />
            <button className="cb-btn cb-btn-primary" onClick={submitRedirect}>
              {t('agent.redirect')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function messageOf(e: AgentEvent): string {
  // Both `confirm-start` and the other event variants carry a string message
  // (except `confirm-start`, which only has `goal`). Render a stable message.
  if (e.type === 'confirm-start') return `→ ${e.goal}`;
  return e.message;
}

function iconFor(type: AgentEvent['type']): string {
  switch (type) {
    case 'status': return '·';
    case 'action': return '→';
    case 'thought': return '"';
    case 'done': return '✓';
    case 'error': return '✕';
    case 'lost': return '?';
    case 'confirm-start': return '⚐';
  }
}
