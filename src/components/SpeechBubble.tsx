import type { ReactNode } from 'react';
import { useT } from '@/i18n';

interface Props {
  title?: string;
  header?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
}

export function SpeechBubble({ title, header, children, onClose }: Props) {
  const t = useT();
  return (
    <div className="bubble">
      {(header || onClose) && (
        <div className="bubble-header">
          {header}
          {onClose && (
            <button className="bubble-close" onClick={onClose} aria-label={t('bubble.close')}>×</button>
          )}
        </div>
      )}
      <div className="bubble-body">
        {title && <div className="bubble-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}
