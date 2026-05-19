import { useState } from 'react';

interface Props {
  onSubmit: (text: string) => void;
  onCapture: () => void;
  onClipboard: () => void;
  onSelectionAttach: () => void;
  disabled?: boolean;
}

export function InputPanel({ onSubmit, onCapture, onClipboard, onSelectionAttach, disabled }: Props) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSubmit(text);
    setText('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <input
          style={{ flex: 1, padding: 6, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
          placeholder="digita aqui..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          disabled={disabled}
        />
        <button onClick={handleSubmit} disabled={disabled || !text.trim()}>➤</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <button style={btnStyle} onClick={onCapture} disabled={disabled}>📷 print</button>
        <button style={btnStyle} onClick={onSelectionAttach} disabled={disabled}>✂️ seleção</button>
        <button style={btnStyle} onClick={onClipboard} disabled={disabled}>📋 clipboard</button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#f0f0f0',
  border: 'none',
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};
