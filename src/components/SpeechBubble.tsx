import type { ReactNode } from 'react';
import { useT } from '@/i18n';

interface Props {
  title?: string;
  header?: ReactNode;
  // Extra action buttons rendered between the header content and the × close.
  // Used today for the "export thread as markdown" button.
  headerActions?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
}

export function SpeechBubble({ title, header, headerActions, children, onClose }: Props) {
  const t = useT();
  return (
    <div className="bubble">
      {(header || onClose || headerActions) && (
        <div className="bubble-header">
          {header}
          {headerActions}
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
