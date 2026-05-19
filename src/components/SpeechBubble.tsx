import type { ReactNode } from 'react';

interface Props {
  title?: string;
  children: ReactNode;
}

export function SpeechBubble({ title, children }: Props) {
  return (
    <div className="bubble">
      {title && <div className="bubble-title">{title}</div>}
      {children}
    </div>
  );
}
