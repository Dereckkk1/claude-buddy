import type { Attachment, AttachedPath } from '@/state/conversation';
import { useT } from '@/i18n';

interface AttachmentProps {
  attachment: Attachment;
  onRemove: () => void;
}

interface PathProps {
  attachedPath: AttachedPath;
  onRemove: () => void;
}

type Props = AttachmentProps | PathProps;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function AttachmentChip(props: Props) {
  const t = useT();
  if ('attachedPath' in props) {
    const p = props.attachedPath;
    const icon = p.kind === 'folder' ? '📁' : '📄';
    const label = p.kind === 'folder'
      ? `${icon} ${p.name} ${t('attach.folderItemSuffix')}`
      : `${icon} ${p.name} · ${formatSize(p.size)}`;
    return (
      <span className="cb-chip">
        {label}
        <button className="cb-chip-x" onClick={props.onRemove} aria-label={t('attach.removeChip')}>×</button>
      </span>
    );
  }
  const attachment = props.attachment;
  const label = attachment.kind === 'image'
    ? t('attach.imageAttached')
    : `"${attachment.content.slice(0, 28)}${attachment.content.length > 28 ? '…' : ''}"`;
  return (
    <span className="cb-chip">
      {label}
      <button className="cb-chip-x" onClick={props.onRemove} aria-label={t('attach.removeChip')}>×</button>
    </span>
  );
}
