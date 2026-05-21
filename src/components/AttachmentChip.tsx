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
    // [P0-4] Folders show the pre-counted entry total (matches what the agent
    // can actually access via list_folder). When the pre-walk hit our 5000-
    // entry cap, append "(N accessible)" so the user knows they only get the
    // first slice — same number `list_folder` will return.
    let label: string;
    if (p.kind === 'folder') {
      if (typeof p.entryCount === 'number') {
        const base = `${icon} ${p.name} · ${t('attach.folderEntries', { n: p.entryCount })}`;
        label = p.truncated
          ? `${base} ${t('attach.folderEntriesTruncated', { n: 200 })}`
          : base;
      } else {
        label = `${icon} ${p.name} ${t('attach.folderItemSuffix')}`;
      }
    } else {
      label = `${icon} ${p.name} · ${formatSize(p.size)}`;
    }
    return (
      <span className="cb-chip">
        {label}
        <button className="cb-chip-x" onClick={props.onRemove} aria-label={t('attach.removeChip')}>×</button>
      </span>
    );
  }
  const attachment = props.attachment;
  // [P1-3] Image chips show a 24px thumbnail. Text chips expose the first
  // 500 chars via the native tooltip so the user can verify what was pasted
  // without expanding anything.
  if (attachment.kind === 'image') {
    return (
      <span className="cb-chip">
        <img
          src={`data:${attachment.mimeType};base64,${attachment.base64}`}
          alt=""
          width={24}
          height={24}
          style={{ borderRadius: 3, objectFit: 'cover', display: 'block' }}
        />
        {t('attach.imageAttached')}
        <button className="cb-chip-x" onClick={props.onRemove} aria-label={t('attach.removeChip')}>×</button>
      </span>
    );
  }
  const preview = `"${attachment.content.slice(0, 28)}${attachment.content.length > 28 ? '…' : ''}"`;
  return (
    <span className="cb-chip" title={attachment.content.slice(0, 500)}>
      {preview}
      <button className="cb-chip-x" onClick={props.onRemove} aria-label={t('attach.removeChip')}>×</button>
    </span>
  );
}
