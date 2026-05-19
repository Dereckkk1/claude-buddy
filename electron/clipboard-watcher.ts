import { clipboard } from 'electron';

export type ClipboardData =
  | { kind: 'text'; content: string }
  | { kind: 'image'; mimeType: string; base64: string }
  | null;

export function readClipboard(): ClipboardData {
  const image = clipboard.readImage();
  if (!image.isEmpty()) {
    const png = image.toPNG();
    return { kind: 'image', mimeType: 'image/png', base64: png.toString('base64') };
  }
  const text = clipboard.readText();
  if (text.trim().length > 0) return { kind: 'text', content: text };
  return null;
}
