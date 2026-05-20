import { useState, useEffect, useRef } from 'react';
import buddyIcon from '../../assets/sprites/icon.png';
import { useT } from '@/i18n';

interface Props {
  onSubmit: (text: string) => void;
  onAttach: () => void;
  agentMode: boolean;
  onToggleAgent: () => void;
  disabled?: boolean;
}

export function InputPanel({ onSubmit, onAttach, agentMode, onToggleAgent, disabled }: Props) {
  const t = useT();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSubmit(text);
    setText('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
        <input
          ref={inputRef}
          className="cb-input"
          placeholder={agentMode ? t('input.placeholderAgent') : t('input.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
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
