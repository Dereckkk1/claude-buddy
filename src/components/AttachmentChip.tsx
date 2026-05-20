import type { Attachment } from '@/state/conversation';

interface Props {
  attachment: Attachment;
  onRemove: () => void;
}

export function AttachmentChip({ attachment, onRemove }: Props) {
  const label = attachment.kind === 'image'
    ? 'imagem anexada'
    : `"${attachment.content.slice(0, 28)}${attachment.content.length > 28 ? '…' : ''}"`;
  return (
    <span className="cb-chip">
      {label}
      <button className="cb-chip-x" onClick={onRemove} aria-label="remover">×</button>
    </span>
  );
}
