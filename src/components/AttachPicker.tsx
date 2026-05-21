import { useEffect, useState } from 'react';
import { invoke } from '@/services/ipc';
import { playPrint } from '@/services/sounds';
import { useT } from '@/i18n';
import type { Attachment } from '@/state/conversation';

interface Props {
  onAttach: (a: Attachment) => void;
  onAttachPath: (p: {
    kind: 'file' | 'folder';
    path: string;
    name: string;
    size: number;
    entryCount?: number;
    truncated?: boolean;
  }) => void;
  onClose: () => void;
}

interface ClipboardItem {
  kind: 'text' | 'image';
  preview: string;
  data: Attachment;
}

export function AttachPicker({ onAttach, onAttachPath, onClose }: Props) {
  const t = useT();
  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>([]);
  const [showClipboard, setShowClipboard] = useState(false);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const handleScreenshot = async () => {
    playPrint();
    const result = await invoke('capture:screen-region');
    if (result) onAttach({ kind: 'image', mimeType: result.mimeType, base64: result.base64 });
  };

  const handleClipboardOpen = async () => {
    const data = await invoke('clipboard:read');
    const items: ClipboardItem[] = [];
    if (data?.kind === 'text') {
      items.push({
        kind: 'text',
        preview: data.content.slice(0, 60) + (data.content.length > 60 ? '…' : ''),
        data,
      });
    } else if (data?.kind === 'image') {
      items.push({
        kind: 'image',
        preview: t('attach.imageSize', { kb: Math.round(data.base64.length * 0.75 / 1024) }),
        data,
      });
    }
    setClipboardItems(items);
    setShowClipboard(true);
  };

  const handleFile = async () => {
    const result = await invoke('file:pick-and-parse');
    if (!result) return;
    // [P0-3] Size-cap rejections come back as `{ error: <i18n-key> }`.
    // Show the user the localized reason instead of silently dropping the
    // attempt (which is what the old `if (result) ...` branch did).
    if ('error' in result) {
      alert(t(result.error));
      return;
    }
    onAttach(result);
  };

  const handleFolder = async () => {
    const r = await invoke('files:pick-folder');
    if (!r) return;
    // [P2-2] Warn before attaching a sensitive folder (home, Desktop, .ssh,
    // .aws, Documents, Downloads). The agent gets read access to everything
    // inside, so we want an explicit "yes" rather than a silent attach.
    if (r.sensitive) {
      const ok = window.confirm(t('attach.sensitiveWarning', { name: r.name }));
      if (!ok) return;
    }
    onAttachPath({
      kind: 'folder',
      path: r.path,
      name: r.name,
      size: r.size,
      entryCount: r.entryCount,
      truncated: r.truncated,
    });
  };

  return (
    <div className="attach-picker">
      {!showClipboard ? (
        <>
          <button className="attach-option" onClick={handleScreenshot}>
            <span className="attach-option-icon">▣</span>
            <div>
              <div className="attach-option-title">{t('attach.screenshot')}</div>
              <div className="attach-option-sub">{t('attach.screenshotSub')}</div>
            </div>
          </button>
          <button className="attach-option" onClick={handleClipboardOpen}>
            <span className="attach-option-icon">▤</span>
            <div>
              <div className="attach-option-title">{t('attach.clipboard')}</div>
              <div className="attach-option-sub">{t('attach.clipboardSub')}</div>
            </div>
          </button>
          <button className="attach-option" onClick={handleFile}>
            <span className="attach-option-icon">▢</span>
            <div>
              <div className="attach-option-title">{t('attach.file')}</div>
              <div className="attach-option-sub">{t('attach.fileSub')}</div>
            </div>
          </button>
          <button className="attach-option" onClick={handleFolder}>
            <span className="attach-option-icon">📁</span>
            <div>
              <div className="attach-option-title">{t('attach.folder')}</div>
              <div className="attach-option-sub">{t('attach.folderSub')}</div>
            </div>
          </button>
        </>
      ) : clipboardItems.length === 0 ? (
        // [P2-1] Empty clipboard is a dead-end if we just say "empty".
        // Give them an inline CTA to the screenshot flow (which is the
        // most common "I want to attach something visual" path).
        <div style={{ padding: '12px', color: 'var(--ink-soft)', fontSize: 12 }}>
          <div style={{ marginBottom: 8 }}>{t('attach.emptyRich')}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="cb-btn cb-btn-secondary"
              onClick={() => { setShowClipboard(false); handleScreenshot(); }}
            >
              {t('attach.emptyShootCta')}
            </button>
            <button className="cb-btn cb-btn-ghost" onClick={() => setShowClipboard(false)}>{t('attach.back')}</button>
          </div>
        </div>
      ) : (
        <>
          {clipboardItems.map((item, i) => (
            <button key={i} className="attach-option" onClick={() => onAttach(item.data)}>
              <span className="attach-option-icon">{item.kind === 'image' ? '▣' : '“'}</span>
              <div>
                <div className="attach-option-title">{item.kind === 'image' ? t('attach.imageItem') : t('attach.textItem')}</div>
                <div className="attach-option-sub">{item.preview}</div>
              </div>
            </button>
          ))}
          <button className="cb-btn cb-btn-ghost" style={{ marginTop: 6 }} onClick={() => setShowClipboard(false)}>{t('attach.back')}</button>
        </>
      )}
    </div>
  );
}
