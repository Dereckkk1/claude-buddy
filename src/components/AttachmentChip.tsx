import type { Attachment } from '@/state/conversation';

interface Props {
  attachment: Attachment;
  onRemove: () => void;
}

export function AttachmentChip({ attachment, onRemove }: Props) {
  const label = attachment.kind === 'image'
    ? '📷 imagem anexada'
    : `✂️ ${attachment.content.slice(0, 30)}${attachment.content.length > 30 ? '…' : ''}`;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: '#fff3e0', border: '1px solid #ff6b35', borderRadius: 6,
      padding: '4px 8px', fontSize: 12, marginTop: 6, marginRight: 4,
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b35', padding: 0 }}
      >✕</button>
    </span>
  );
}
