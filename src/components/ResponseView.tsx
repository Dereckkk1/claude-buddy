import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
// Syntax highlight theme. We load github-dark by default — App.css applies a
// light-theme override using rules that target `:root[data-theme="light"]`
// so the same tokenization works on both themes without runtime CSS swapping.
import 'highlight.js/styles/github-dark.css';
import { useT } from '@/i18n';
import { playPasted } from '@/services/sounds';

interface Props {
  text: string;
  showActions: boolean;
  onOk: () => void;
  onContinue: () => void;
  onQuickReply?: (text: string) => void;
  onRegenerate?: () => void;
  /** When true, the small copy/pasted blip plays on successful copy actions. */
  soundsEnabled?: boolean;
}

type Segment = { kind: 'text'; content: string } | { kind: 'step'; tool: string };

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\[\[step:([a-z_]+)\]\]/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ kind: 'text', content: text.slice(lastIdx, match.index) });
    }
    segments.push({ kind: 'step', tool: match[1] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    segments.push({ kind: 'text', content: text.slice(lastIdx) });
  }
  return segments;
}

/**
 * Tiny "⧉ / ✓" copy button — used both on the whole response and inside each
 * code block. Falls back to a no-op if clipboard access fails (eg. permissions
 * denied in some sandbox), so the UI never throws at the user.
 */
function CopyButton({
  getText, soundsEnabled, className, style,
}: {
  getText: () => string;
  soundsEnabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <button
      type="button"
      className={className}
      style={style}
      title={copied ? t('response.copied') : t('response.copy')}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(getText());
          setCopied(true);
          if (soundsEnabled) playPasted();
          if (timer.current) clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1500);
        } catch (err) {
          console.warn('[copy] clipboard write failed:', err);
        }
      }}
    >{copied ? '✓' : '⧉'}</button>
  );
}

export function ResponseView({ text, showActions, onOk, onContinue, onQuickReply, onRegenerate, soundsEnabled }: Props) {
  const t = useT();
  const segments = parseSegments(text);
  const quickReplies = [
    { label: t('response.explainMore'), send: t('response.quickReplyExplain') },
    { label: t('response.giveExample'), send: t('response.quickReplyExample') },
    { label: t('response.summarize'), send: t('response.quickReplySummarize') },
  ];

  // Strip the [[step:...]] markers when measuring length for "short factual
  // response" detection — those markers add ~15 chars each but aren't visible.
  const visibleText = text.replace(/\[\[step:[a-z_]+\]\]/g, '').trim();
  // Heuristic: a short factual reply (< 200 chars) probably doesn't need
  // "explica/exemplo/resume" follow-ups — they'd be redundant noise.
  const showQuickReplies = visibleText.length >= 200;

  return (
    <div>
      <div className="cb-markdown" style={{ position: 'relative' }}>
        {/* Full-response copy button — hover-reveals in the top right corner. */}
        <CopyButton
          getText={() => visibleText}
          soundsEnabled={soundsEnabled}
          className="cb-copy-btn cb-copy-btn-response"
        />
        {segments.map((seg, i) => {
          if (seg.kind === 'text') {
            const trimmed = seg.content.trim();
            if (!trimmed) return null;
            return (
              <ReactMarkdown
                key={i}
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  // Custom `pre` wrapper so we can layer a floating copy button
                  // onto every fenced code block. We render the children inside
                  // a positioned container and pull the raw text out for copy.
                  pre: ({ children }) => {
                    // ReactMarkdown nests <code> inside <pre>. Walk children to
                    // pull out the raw text content for the copy action.
                    const extractText = (node: ReactNode): string => {
                      if (typeof node === 'string') return node;
                      if (typeof node === 'number') return String(node);
                      if (Array.isArray(node)) return node.map(extractText).join('');
                      if (node && typeof node === 'object' && 'props' in node) {
                        const props = (node as { props?: { children?: ReactNode } }).props;
                        return extractText(props?.children ?? null);
                      }
                      return '';
                    };
                    const codeText = extractText(children);
                    return (
                      <div className="cb-code-wrap">
                        <CopyButton
                          getText={() => codeText}
                          soundsEnabled={soundsEnabled}
                          className="cb-copy-btn cb-copy-btn-code"
                        />
                        <pre>{children}</pre>
                      </div>
                    );
                  },
                }}
              >
                {trimmed}
              </ReactMarkdown>
            );
          }
          // step labels come from the i18n dict (key: steps.<tool>). Falls back
          // to the raw tool name if the dict doesn't have a translation yet.
          const label = t(`steps.${seg.tool}`);
          return (
            <div key={i} className="cb-step">
              <span className="cb-step-dot">·</span>
              <span>{label === `steps.${seg.tool}` ? seg.tool : label}</span>
            </div>
          );
        })}
      </div>
      {showActions && onQuickReply && showQuickReplies && (
        <div className="cb-quick-replies">
          {quickReplies.map((qr) => (
            <button key={qr.label} className="cb-quick-reply" onClick={() => onQuickReply(qr.send)}>
              {qr.label}
            </button>
          ))}
          {onRegenerate && (
            <button
              key="regenerate"
              className="cb-quick-reply"
              onClick={onRegenerate}
              title={t('response.quickReplyRegenerate')}
            >{t('response.regenerate')}</button>
          )}
        </div>
      )}
      {showActions && !showQuickReplies && onRegenerate && (
        // Short answers skip the explain/example/summarize set, but regenerate
        // is still useful — keep it visible as a lone chip.
        <div className="cb-quick-replies">
          <button
            className="cb-quick-reply"
            onClick={onRegenerate}
            title={t('response.quickReplyRegenerate')}
          >{t('response.regenerate')}</button>
        </div>
      )}
      {showActions && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="cb-btn cb-btn-secondary" onClick={onContinue}>{t('response.continue')}</button>
          <button className="cb-btn cb-btn-primary" onClick={onOk}>{t('response.ok')}</button>
        </div>
      )}
    </div>
  );
}
