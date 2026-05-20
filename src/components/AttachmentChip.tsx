import type { Attachment } from '@/state/conversation';
import { useT } from '@/i18n';

interface Props {
  attachment: Attachment;
  onRemove: () => void;
}

export function AttachmentChip({ attachment, onRemove }: Props) {
  const t = useT();
  const label = attachment.kind === 'image'
    ? t('attach.imageAttached')
    : `"${attachment.content.slice(0, 28)}${attachment.content.length > 28 ? '…' : ''}"`;
  return (
    <span className="cb-chip">
      {label}
      <button className="cb-chip-x" onClick={onRemove} aria-label={t('attach.removeChip')}>×</button>
    </span>
  );
}
