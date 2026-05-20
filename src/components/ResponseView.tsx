import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useT } from '@/i18n';

interface Props {
  text: string;
  showActions: boolean;
  onOk: () => void;
  onContinue: () => void;
  onQuickReply?: (text: string) => void;
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

export function ResponseView({ text, showActions, onOk, onContinue, onQuickReply }: Props) {
  const t = useT();
  const segments = parseSegments(text);
  const quickReplies = [
    { label: t('response.explainMore'), send: t('response.quickReplyExplain') },
    { label: t('response.giveExample'), send: t('response.quickReplyExample') },
    { label: t('response.summarize'), send: t('response.quickReplySummarize') },
  ];

  return (
    <div>
      <div className="cb-markdown">
        {segments.map((seg, i) => {
          if (seg.kind === 'text') {
            const trimmed = seg.content.trim();
            if (!trimmed) return null;
            return (
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
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
      {showActions && onQuickReply && (
        <div className="cb-quick-replies">
          {quickReplies.map((qr) => (
            <button key={qr.label} className="cb-quick-reply" onClick={() => onQuickReply(qr.send)}>
              {qr.label}
            </button>
          ))}
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
