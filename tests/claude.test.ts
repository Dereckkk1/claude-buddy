import { describe, it, expect } from 'vitest';
import { pickModel } from '@/services/claude';
import type { Message, Attachment } from '@/state/conversation';

describe('pickModel', () => {
  it('picks haiku for simple short prompts', () => {
    const msgs: Message[] = [{ role: 'user', content: 'oi' }];
    expect(pickModel(msgs, [])).toContain('haiku');
  });

  it('picks sonnet when prompt has deep reasoning keywords', () => {
    const msgs: Message[] = [{ role: 'user', content: 'explica como funciona o React' }];
    expect(pickModel(msgs, [])).toContain('sonnet');
  });

  it('picks sonnet for long prompts', () => {
    const msgs: Message[] = [{ role: 'user', content: 'a'.repeat(600) }];
    expect(pickModel(msgs, [])).toContain('sonnet');
  });

  it('picks sonnet for multi-turn conversations', () => {
    const msgs: Message[] = Array.from({ length: 7 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: 'msg',
    }));
    expect(pickModel(msgs, [])).toContain('sonnet');
  });

  it('picks sonnet when image is large', () => {
    const msgs: Message[] = [{ role: 'user', content: 'o que é isso?' }];
    const atts: Attachment[] = [{ kind: 'image', mimeType: 'image/png', base64: 'x'.repeat(500_000) }];
    expect(pickModel(msgs, atts)).toContain('sonnet');
  });
});
