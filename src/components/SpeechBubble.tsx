import type { ReactNode } from 'react';

interface Props {
  title?: string;
  children: ReactNode;
  onClose?: () => void;
}

export function SpeechBubble({ title, children, onClose }: Props) {
  return (
    <div className="bubble">
      {onClose && (
        <button
          onClick={onClose}
          aria-label="fechar"
          style={{
            position: 'absolute', top: 6, right: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#999', fontSize: 16, lineHeight: 1, padding: 2,
          }}
        >✕</button>
      )}
      {title && <div className="bubble-title">{title}</div>}
      {children}
    </div>
  );
}
