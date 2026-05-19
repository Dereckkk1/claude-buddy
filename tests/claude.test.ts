import { describe, it, expect } from 'vitest';
import { buildClaudePayload } from '@/services/claude';
import type { Message, Attachment } from '@/state/conversation';

describe('buildClaudePayload', () => {
  it('builds text-only payload from messages', () => {
    const msgs: Message[] = [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'oi!' },
      { role: 'user', content: 'tudo bem?' },
    ];
    const payload = buildClaudePayload(msgs, []);
    expect(payload.model).toBe('claude-haiku-4-5-20251001');
    expect(payload.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'oi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'oi!' }] },
      { role: 'user', content: [{ type: 'text', text: 'tudo bem?' }] },
    ]);
  });

  it('attaches image to the latest user message', () => {
    const msgs: Message[] = [{ role: 'user', content: 'passa a receita' }];
    const atts: Attachment[] = [{ kind: 'image', mimeType: 'image/png', base64: 'BASE64DATA' }];
    const payload = buildClaudePayload(msgs, atts);
    expect(payload.messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'BASE64DATA' } },
      { type: 'text', text: 'passa a receita' },
    ]);
  });

  it('appends text attachments as quoted blocks to the latest user message', () => {
    const msgs: Message[] = [{ role: 'user', content: 'corrige a ortografia' }];
    const atts: Attachment[] = [{ kind: 'text', content: 'foi vc qe esquesseu' }];
    const payload = buildClaudePayload(msgs, atts);
    expect(payload.messages[0].content).toEqual([
      { type: 'text', text: 'corrige a ortografia\n\n---\nTEXTO SELECIONADO:\nfoi vc qe esquesseu' },
    ]);
  });

  it('only attaches to the last user message, not all', () => {
    const msgs: Message[] = [
      { role: 'user', content: 'primeira' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'segunda' },
    ];
    const atts: Attachment[] = [{ kind: 'text', content: 'EXTRA' }];
    const payload = buildClaudePayload(msgs, atts);
    expect(payload.messages[0].content).toEqual([{ type: 'text', text: 'primeira' }]);
    expect(payload.messages[2].content).toEqual([
      { type: 'text', text: 'segunda\n\n---\nTEXTO SELECIONADO:\nEXTRA' },
    ]);
  });
});
