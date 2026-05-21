import { useState, useEffect, useRef, useMemo } from 'react';
import buddyIcon from '../../assets/sprites/icon.png';
import { useT } from '@/i18n';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import type { Locale } from '@shared/ipc-types';

interface Props {
  onSubmit: (text: string) => void;
  onAttach: () => void;
  agentMode: boolean;
  onToggleAgent: () => void;
  disabled?: boolean;
  locale?: Locale;
  onSlashCommand?: (cmd: string, args: string) => void;
  // External seed value (e.g. when Ctrl+Shift+A pulls a selection in). When
  // it changes, the input adopts the new value and refocuses.
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
  onSubmit, onAttach, agentMode, onToggleAgent, disabled, locale = 'en', onSlashCommand, prefill,
}: Props) {
  const t = useT();
  const [text, setText] = useState('');
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
        // If user has only typed the command (no arg), autocomplete instead of
        // submitting — feels more natural for commands that need arguments.
        const def = SLASH_COMMANDS.find((c) => c.cmd === slashFilter);
        if (def?.takesArg && !text.includes(' ')) {
          e.preventDefault();
          completeSlash(def.cmd);
          return;
        }
      }
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
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
        <input
          ref={inputRef}
          className="cb-input"
          placeholder={agentMode ? t('input.placeholderAgent') : t('input.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          autoFocus
        />
        <button
          className="cb-btn-send"
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          aria-label={t('input.send')}
          title={t('input.send')}
        >↑</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="cb-btn cb-btn-ghost"
            onClick={onAttach}
            disabled={disabled}
            title={t('input.attachTitle')}
          >＋ {t('input.attach')}</button>
          {stt.supported && (
            <button
              className={stt.listening ? 'cb-btn cb-btn-primary' : 'cb-btn cb-btn-ghost'}
              onClick={stt.toggle}
              disabled={disabled}
              title={stt.listening ? t('input.voiceListening') : t('input.voice')}
              aria-pressed={stt.listening}
            >🎤 {stt.listening ? t('input.voiceListening') : t('input.voice')}</button>
          )}
        </div>
        <button
          className={agentMode ? 'cb-btn cb-btn-primary' : 'cb-btn cb-btn-ghost'}
          onClick={onToggleAgent}
          disabled={disabled}
          title={t('input.agentModeTitle')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <img
            src={buddyIcon}
            alt=""
            width={18}
            height={24}
            style={{ imageRendering: 'pixelated', display: 'block' }}
          />
          {t('input.agentMode')} {agentMode ? '✓' : ''}
        </button>
      </div>
    </div>
  );
}
