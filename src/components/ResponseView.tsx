import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  text: string;
  showActions: boolean;
  onOk: () => void;
  onContinue: () => void;
  onQuickReply?: (text: string) => void;
}

const QUICK_REPLIES = [
  { label: 'explica melhor', send: 'explica melhor isso' },
  { label: 'dá um exemplo', send: 'me dá um exemplo prático' },
  { label: 'resume', send: 'resume em 1 frase' },
];

// Hardcoded labels — economiza tokens (não pede pro Claude gerar)
const STEP_LABELS: Record<string, string> = {
  read_selection: 'leu o que você selecionou',
  edit_in_place: 'editou na sua janela',
  save_memory: 'salvou na memória',
  screenshot: 'tirou print da tela',
  attached_image: 'leu a imagem',
  attached_file: 'leu o arquivo',
};

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
  const segments = parseSegments(text);

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
          const label = STEP_LABELS[seg.tool] ?? seg.tool;
          return (
            <div key={i} className="cb-step">
              <span className="cb-step-dot">·</span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
      {showActions && onQuickReply && (
        <div className="cb-quick-replies">
          {QUICK_REPLIES.map((qr) => (
            <button key={qr.label} className="cb-quick-reply" onClick={() => onQuickReply(qr.send)}>
              {qr.label}
            </button>
          ))}
        </div>
      )}
      {showActions && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="cb-btn cb-btn-secondary" onClick={onContinue}>Continuar</button>
          <button className="cb-btn cb-btn-primary" onClick={onOk}>OK</button>
        </div>
      )}
    </div>
  );
}
