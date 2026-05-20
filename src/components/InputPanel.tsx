import { useState, useEffect, useRef } from 'react';
import buddyIcon from '../../assets/sprites/icon.png';

interface Props {
  onSubmit: (text: string) => void;
  onAttach: () => void;
  agentMode: boolean;
  onToggleAgent: () => void;
  disabled?: boolean;
}

export function InputPanel({ onSubmit, onAttach, agentMode, onToggleAgent, disabled }: Props) {
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
          placeholder={agentMode ? 'qual o objetivo? (ex: abre a calculadora)' : 'pergunta qualquer coisa...'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          disabled={disabled}
          autoFocus
        />
        <button
          className="cb-btn cb-btn-primary"
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
        >Enviar</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'space-between' }}>
        <button
          className="cb-btn cb-btn-ghost"
          onClick={onAttach}
          disabled={disabled}
          title="anexar imagem, arquivo ou item do clipboard"
        >＋ Anexar</button>
        <button
          className={agentMode ? 'cb-btn cb-btn-primary' : 'cb-btn cb-btn-ghost'}
          onClick={onToggleAgent}
          disabled={disabled}
          title="modo agente — o mascote pilota o computador"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <img
            src={buddyIcon}
            alt=""
            width={18}
            height={24}
            style={{ imageRendering: 'pixelated', display: 'block' }}
          />
          Modo Agente {agentMode ? '✓' : ''}
        </button>
      </div>
    </div>
  );
}
