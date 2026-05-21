import { useState, useEffect, useRef } from 'react';
import buddyIcon from '../../assets/sprites/icon.png';
import { useT } from '@/i18n';

interface Props {
  onSubmit: (text: string) => void;
  onAttach: () => void;
  agentMode: boolean;
  onToggleAgent: () => void;
  disabled?: boolean;
  /**
   * Past user prompts in chronological order. ArrowUp on an empty input pulls
   * the most recent one; consecutive ArrowUps walk further back (terminal-style).
   * ArrowDown walks forward; reaching the bottom clears the input.
   */
  lastPrompts?: string[];
}

export function InputPanel({ onSubmit, onAttach, agentMode, onToggleAgent, disabled, lastPrompts = [] }: Props) {
  const t = useT();
  const [text, setText] = useState('');
  // `historyIdx` is the offset from the END of `lastPrompts` (1 = most recent).
  // -1 means "not browsing history" — typing resets it.
  const [historyIdx, setHistoryIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSubmit(text);
    setText('');
    setHistoryIdx(-1);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
        <input
          ref={inputRef}
          className="cb-input"
          placeholder={agentMode ? t('input.placeholderAgent') : t('input.placeholder')}
          value={text}
          onChange={(e) => { setText(e.target.value); setHistoryIdx(-1); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { handleSubmit(); return; }
            // Terminal-style history navigation. Only pull from history when the
            // input is empty OR we're already browsing — otherwise we'd clobber
            // a draft the user is typing.
            if (e.key === 'ArrowUp' && lastPrompts.length > 0) {
              if (text === '' || historyIdx > 0) {
                e.preventDefault();
                const nextIdx = Math.min(historyIdx + 1, lastPrompts.length);
                const item = lastPrompts[lastPrompts.length - nextIdx];
                if (item !== undefined) {
                  setHistoryIdx(nextIdx);
                  setText(item);
                }
              }
            } else if (e.key === 'ArrowDown' && historyIdx > 0) {
              e.preventDefault();
              const nextIdx = historyIdx - 1;
              if (nextIdx <= 0) {
                setHistoryIdx(-1);
                setText('');
              } else {
                setHistoryIdx(nextIdx);
                setText(lastPrompts[lastPrompts.length - nextIdx]);
              }
            }
          }}
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
        <button
          className="cb-btn cb-btn-ghost"
          onClick={onAttach}
          disabled={disabled}
          title={t('input.attachTitle')}
        >＋ {t('input.attach')}</button>
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
