import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useT } from '@/i18n';
import { invoke } from '@/services/ipc';

interface Props {
  text: string;
  showActions: boolean;
  onOk: () => void;
  onContinue: () => void;
  onQuickReply?: (text: string) => void;
}

type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'step'; tool: string; inputJson?: unknown }
  | { kind: 'undo_paste'; tool: string; token: string }
  | { kind: 'save_memory_undo'; tool: string; memoryIndex: number; fact: string };

// Matches our streaming markers:
//   - [[step:<tool>]]                          legacy / simple
//   - [[step:<tool>:<base64_json>]]            tool with serialized input args
//   - [[step:edit_in_place_undoable:<uuid>]]   pasted text, undo chip
//   - [[step:save_memory_undo:<base64>]]       memory chip with index+truncated fact
//
// Tool names are restricted to [a-z_] so prefixes like `edit_in_place_undoable`
// match before the rest of the body. Base64 / uuid payloads use [A-Za-z0-9+/=_-].
const STEP_REGEX = /\[\[step:([a-z_]+)(?::([A-Za-z0-9+/=_-]+))?\]\]/g;

function decodeBase64Json(b64: string): unknown {
  try {
    const str = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  STEP_REGEX.lastIndex = 0;
  while ((match = STEP_REGEX.exec(text)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ kind: 'text', content: text.slice(lastIdx, match.index) });
    }
    const tool = match[1];
    const payload = match[2];
    if (tool === 'edit_in_place_undoable' && payload) {
      segments.push({ kind: 'undo_paste', tool, token: payload });
    } else if (tool === 'save_memory_undo' && payload) {
      const decoded = decodeBase64Json(payload) as { index?: number; fact?: string } | null;
      if (decoded && typeof decoded.index === 'number' && typeof decoded.fact === 'string') {
        segments.push({ kind: 'save_memory_undo', tool, memoryIndex: decoded.index, fact: decoded.fact });
      } else {
        segments.push({ kind: 'step', tool: 'save_memory' });
      }
    } else if (payload) {
      // Generic tool-step with input args (used by debug-input view).
      segments.push({ kind: 'step', tool, inputJson: decodeBase64Json(payload) });
    } else {
      segments.push({ kind: 'step', tool });
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    segments.push({ kind: 'text', content: text.slice(lastIdx) });
  }
  return segments;
}

interface StepWithInputProps { tool: string; label: string; input: unknown }
function StepWithInput({ tool, label, input }: StepWithInputProps) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const json = typeof input === 'object' && input !== null ? JSON.stringify(input, null, 2) : String(input ?? '');
  const truncated = json.length > 1000 ? json.slice(0, 1000) + '\n…' : json;
  return (
    <div className="cb-step">
      <span className="cb-step-dot">·</span>
      <span>{label === `steps.${tool}` ? tool : label}</span>
      <button
        type="button"
        className="cb-step-toggle"
        onClick={() => setOpen((v) => !v)}
        title={json}
      >
        {open ? '▴' : '▾'} {t('steps.detailsToggle')}
      </button>
      {open && <pre className="cb-step-input">{truncated}</pre>}
    </div>
  );
}

interface UndoPasteChipProps { token: string }
function UndoPasteChip({ token }: UndoPasteChipProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const label = t('steps.edit_in_place_undoable');
  return (
    <div className="cb-step cb-step-edit-undo">
      <span className="cb-step-dot">·</span>
      <span>{label === 'steps.edit_in_place_undoable' ? 'edited in your window' : label}</span>
      <button
        type="button"
        className="cb-step-action"
        disabled={busy || done}
        onClick={async () => {
          setBusy(true);
          const r = await invoke('automation:undo-paste', token).catch(() => ({ ok: false }));
          setBusy(false);
          if (r?.ok) setDone(true);
        }}
      >
        {done ? '✓' : '↶'} {done ? t('shell.undonePaste') : t('shell.undoPaste')}
      </button>
    </div>
  );
}

interface SaveMemoryChipProps { index: number; fact: string }
function SaveMemoryChip({ index, fact }: SaveMemoryChipProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="cb-step cb-step-save-memory">
      <span className="cb-step-dot">💾</span>
      <span>{t('steps.save_memory_undo', { fact })}</span>
      <button
        type="button"
        className="cb-step-action"
        disabled={busy || done}
        onClick={async () => {
          setBusy(true);
          await invoke('memories:delete', index).catch(() => {});
          setBusy(false);
          setDone(true);
        }}
      >
        {done ? '✓' : '↶'} {done ? t('shell.undoneMemory') : t('shell.undoMemory')}
      </button>
    </div>
  );
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
          if (seg.kind === 'undo_paste') {
            return <UndoPasteChip key={i} token={seg.token} />;
          }
          if (seg.kind === 'save_memory_undo') {
            return <SaveMemoryChip key={i} index={seg.memoryIndex} fact={seg.fact} />;
          }
          // step labels come from the i18n dict (key: steps.<tool>). Falls back
          // to the raw tool name if the dict doesn't have a translation yet.
          const label = t(`steps.${seg.tool}`);
          if (seg.inputJson !== undefined && seg.inputJson !== null) {
            return <StepWithInput key={i} tool={seg.tool} label={label} input={seg.inputJson} />;
          }
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
