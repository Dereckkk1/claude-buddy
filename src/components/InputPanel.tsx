import { useState, useEffect, useRef, useMemo } from 'react';
import buddyIcon from '../../assets/sprites/icon.png';
import { useT } from '@/i18n';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import type { Locale } from '@shared/ipc-types';

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const PlusIcon = () => (
  <svg {...ICON_PROPS}><path d="M12 5v14M5 12h14"/></svg>
);
const MicIcon = () => (
  <svg {...ICON_PROPS}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>
);
const ArrowUpIcon = () => (
  <svg {...ICON_PROPS} width="18" height="18" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
);

interface Props {
  onSubmit: (text: string) => void;
  onAttach: () => void;
  agentMode: boolean;
  onToggleAgent: () => void;
  disabled?: boolean;
  /** Past user prompts (chronological). ArrowUp on empty input pulls most recent. */
  lastPrompts?: string[];
  locale?: Locale;
  onSlashCommand?: (cmd: string, args: string) => void;
  /** External seed value (e.g. Ctrl+Shift+A selection). Adopts on change. */
  prefill?: string;
}

const STT_LANG_MAP: Record<Locale, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-ES',
};

// Static catalog of slash commands. Description i18n key resolves at render
// time so the dropdown follows the active locale.
const SLASH_COMMANDS: { cmd: string; descKey: string; takesArg?: boolean }[] = [
  { cmd: '/clear',  descKey: 'slash.clear' },
  { cmd: '/sleep',  descKey: 'slash.sleep' },
  { cmd: '/agent',  descKey: 'slash.agent',  takesArg: true },
  { cmd: '/model',  descKey: 'slash.model',  takesArg: true },
  { cmd: '/memory', descKey: 'slash.memory', takesArg: true },
  { cmd: '/help',   descKey: 'slash.help' },
  { cmd: '/export', descKey: 'slash.export' },
];

export function InputPanel({
  onSubmit, onAttach, agentMode, onToggleAgent, disabled,
  lastPrompts = [], locale = 'en', onSlashCommand, prefill,
}: Props) {
  const t = useT();
  const [text, setText] = useState('');
  // `historyIdx` is the offset from the END of `lastPrompts` (1 = most recent).
  // -1 means "not browsing history" — typing resets it.
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Adopt external prefill (e.g. selection captured via Ctrl+Shift+A). We use
  // a ref-keyed effect so the same value triggers only once — re-rendering
  // with the same prefill should NOT clobber what the user typed afterwards.
  const lastPrefillRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prefill !== undefined && prefill !== lastPrefillRef.current) {
      lastPrefillRef.current = prefill;
      setText(prefill);
      // After paint, place the caret at the end so the user can continue typing.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        const len = prefill.length;
        try { inputRef.current?.setSelectionRange(len, len); } catch { /* swallow */ }
      });
    }
  }, [prefill]);

  // Voice-to-text — pipes recognized text straight into the input field so the
  // user can edit/append before hitting send.
  const sttLang = STT_LANG_MAP[locale];
  const stt = useSpeechToText((transcript) => {
    setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
  }, sttLang);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  // Detect "/cmd…" at the start of the input and surface a matching menu.
  // We split on the first space so the user can type an argument and still
  // see the originating command highlighted.
  const slashOpen = text.startsWith('/');
  const slashFilter = useMemo(() => {
    if (!slashOpen) return '';
    const firstSpace = text.indexOf(' ');
    return firstSpace === -1 ? text : text.slice(0, firstSpace);
  }, [text, slashOpen]);

  const slashMatches = useMemo(() => {
    if (!slashOpen) return [];
    return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(slashFilter));
  }, [slashFilter, slashOpen]);

  useEffect(() => { setHighlight(0); }, [slashFilter]);

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    // Slash-prefixed input is intercepted: the dispatcher in App decides what
    // to do (clear, sleep, switch agent, etc.) instead of sending to the API.
    if (slashOpen && onSlashCommand) {
      const firstSpace = text.indexOf(' ');
      const cmd = firstSpace === -1 ? text.trim() : text.slice(0, firstSpace).trim();
      const args = firstSpace === -1 ? '' : text.slice(firstSpace + 1).trim();
      // Only treat as a slash command if it's a recognized one — otherwise
      // pass it through as a normal message (the user probably meant "/path").
      if (SLASH_COMMANDS.some((c) => c.cmd === cmd)) {
        onSlashCommand(cmd, args);
        setText('');
        return;
      }
    }
    onSubmit(text);
    setText('');
    setHistoryIdx(-1);
  };

  const completeSlash = (cmd: string) => {
    const def = SLASH_COMMANDS.find((c) => c.cmd === cmd);
    setText(def?.takesArg ? `${cmd} ` : cmd);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (slashOpen && slashMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % slashMatches.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight((h) => (h - 1 + slashMatches.length) % slashMatches.length); return; }
      if (e.key === 'Tab')       { e.preventDefault(); completeSlash(slashMatches[highlight].cmd); return; }
      if (e.key === 'Enter') {
        // Command-only (no arg yet): autocomplete instead of submitting.
        const def = SLASH_COMMANDS.find((c) => c.cmd === slashFilter);
        if (def?.takesArg && !text.includes(' ')) {
          e.preventDefault();
          completeSlash(def.cmd);
          return;
        }
      }
    }
    // Terminal-style prompt history (only when slash menu is closed and input
    // is empty OR already browsing — don't clobber a fresh draft).
    if (!slashOpen && e.key === 'ArrowUp' && lastPrompts.length > 0) {
      if (text === '' || historyIdx > 0) {
        e.preventDefault();
        const nextIdx = Math.min(historyIdx + 1, lastPrompts.length);
        const item = lastPrompts[lastPrompts.length - nextIdx];
        if (item !== undefined) {
          setHistoryIdx(nextIdx);
          setText(item);
        }
        return;
      }
    }
    if (!slashOpen && e.key === 'ArrowDown' && historyIdx > 0) {
      e.preventDefault();
      const nextIdx = historyIdx - 1;
      if (nextIdx <= 0) {
        setHistoryIdx(-1);
        setText('');
      } else {
        setHistoryIdx(nextIdx);
        setText(lastPrompts[lastPrompts.length - nextIdx]);
      }
      return;
    }
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div>
      {slashOpen && slashMatches.length > 0 && (
        <div className="cb-slash-menu" style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 4,
          marginBottom: 6,
          boxShadow: 'var(--shadow)',
          maxHeight: 180,
          overflowY: 'auto',
        }}>
          {slashMatches.map((m, i) => (
            <button
              key={m.cmd}
              onMouseDown={(e) => { e.preventDefault(); completeSlash(m.cmd); }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: 'flex',
                width: '100%',
                gap: 8,
                alignItems: 'center',
                padding: '6px 10px',
                background: i === highlight ? 'var(--bg-ghost-hover)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--ink)',
                fontSize: 12,
              }}
            >
              <code style={{ fontFamily: 'SF Mono, Menlo, monospace', color: 'var(--clay)', minWidth: 64 }}>{m.cmd}</code>
              <span style={{ color: 'var(--ink-soft)' }}>{t(m.descKey)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="cb-composer">
        <input
          ref={inputRef}
          className="cb-composer-input"
          placeholder={agentMode ? t('input.placeholderAgent') : t('input.placeholder')}
          value={text}
          onChange={(e) => { setText(e.target.value); setHistoryIdx(-1); }}
          onKeyDown={onKeyDown}
          disabled={disabled}
          autoFocus
        />
        <div className="cb-composer-actions">
          <div className="cb-composer-actions-left">
            <button
              className="cb-icon-btn"
              onClick={onAttach}
              disabled={disabled}
              aria-label={t('input.attachTitle')}
              title={t('input.attachTitle')}
            ><PlusIcon /></button>
          </div>
          <div className="cb-composer-actions-right">
            <button
              className={`cb-agent-toggle${agentMode ? ' is-on' : ''}`}
              onClick={onToggleAgent}
              disabled={disabled}
              aria-pressed={agentMode}
              title={t('input.agentModeTitle')}
            >
              <img
                src={buddyIcon}
                alt=""
                width={14}
                height={18}
                style={{ imageRendering: 'pixelated', display: 'block' }}
              />
              <span>{t('input.agentMode')}</span>
            </button>
            {stt.supported && (
              <button
                className={`cb-icon-btn${stt.listening ? ' is-active' : ''}`}
                onClick={stt.toggle}
                disabled={disabled}
                title={stt.listening ? t('input.voiceListening') : t('input.voice')}
                aria-pressed={stt.listening}
                aria-label={t('input.voice')}
              ><MicIcon /></button>
            )}
            <button
              className="cb-btn-send"
              onClick={handleSubmit}
              disabled={disabled || !text.trim()}
              aria-label={t('input.send')}
              title={t('input.send')}
            ><ArrowUpIcon /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
