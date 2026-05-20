import { dialog } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type ParsedAttachment =
  | { kind: 'text'; content: string }
  | { kind: 'image'; mimeType: string; base64: string }
  | null;

const TEXT_EXTS = ['.txt', '.md', '.json', '.csv', '.log', '.yaml', '.yml', '.xml', '.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.sh', '.ps1', '.sql'];
const IMAGE_EXTS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export async function pickAndParseFile(): Promise<ParsedAttachment> {
  const result = await dialog.showOpenDialog({
    title: 'Anexar arquivo',
    properties: ['openFile'],
    filters: [
      { name: 'Tudo suportado', extensions: ['pdf', 'docx', 'md', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'csv', 'json'] },
      { name: 'Documentos', extensions: ['pdf', 'docx', 'md', 'txt'] },
      { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      { name: 'Dados', extensions: ['csv', 'json', 'xml', 'yaml', 'yml'] },
      { name: 'Código', extensions: ['js', 'ts', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'html', 'css'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return parseFile(result.filePaths[0]);
}

export async function parseFile(filePath: string): Promise<ParsedAttachment> {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  // Image
  if (ext in IMAGE_EXTS) {
    const buf = await fs.readFile(filePath);
    return { kind: 'image', mimeType: IMAGE_EXTS[ext], base64: buf.toString('base64') };
  }

  // PDF
  if (ext === '.pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{ text: string }>;
      const buf = await fs.readFile(filePath);
      const parsed = await pdfParse(buf);
      return { kind: 'text', content: `[PDF: ${fileName}]\n\n${parsed.text.trim()}` };
    } catch (e) {
      console.error('[file-parser] pdf failed:', e);
      return { kind: 'text', content: `[PDF: ${fileName}] (não consegui extrair texto)` };
    }
  }

  // DOCX
  if (ext === '.docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return { kind: 'text', content: `[DOCX: ${fileName}]\n\n${result.value.trim()}` };
    } catch (e) {
      console.error('[file-parser] docx failed:', e);
      return { kind: 'text', content: `[DOCX: ${fileName}] (não consegui extrair texto)` };
    }
  }

  // Text-like
  if (TEXT_EXTS.includes(ext) || ext === '') {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // Cap at 200KB of text to keep tokens reasonable
      const truncated = content.length > 200_000 ? content.slice(0, 200_000) + '\n\n[...truncado]' : content;
      return { kind: 'text', content: `[${fileName}]\n\n${truncated}` };
    } catch (e) {
      console.error('[file-parser] text read failed:', e);
      return null;
    }
  }

  // Unknown — try as text anyway
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { kind: 'text', content: `[${fileName}]\n\n${content.slice(0, 100_000)}` };
  } catch {
    return { kind: 'text', content: `[${fileName}] (formato não suportado)` };
  }
}
