import { describe, it, expect, beforeEach } from 'vitest';
import { useConversation } from '@/state/conversation';

describe('conversation store', () => {
  beforeEach(() => {
    useConversation.getState().reset();
  });

  it('starts with empty messages and no attachments', () => {
    const s = useConversation.getState();
    expect(s.messages).toEqual([]);
    expect(s.attachments).toEqual([]);
    expect(s.status).toBe('idle');
  });

  it('appends a user message', () => {
    useConversation.getState().addUserMessage('hello');
    expect(useConversation.getState().messages).toEqual([
      { role: 'user', content: 'hello' },
    ]);
  });

  it('appends and streams assistant text', () => {
    useConversation.getState().beginAssistantMessage();
    useConversation.getState().appendAssistantChunk('hel');
    useConversation.getState().appendAssistantChunk('lo');
    const msgs = useConversation.getState().messages;
    expect(msgs).toEqual([{ role: 'assistant', content: 'hello' }]);
  });

  it('adds and removes attachments', () => {
    const s = useConversation.getState();
    s.addAttachment({ kind: 'text', content: 'foo' });
    s.addAttachment({ kind: 'image', mimeType: 'image/png', base64: 'abc' });
    const fresh = useConversation.getState();
    expect(fresh.attachments.length).toBe(2);
    fresh.removeAttachment(0);
    expect(useConversation.getState().attachments.length).toBe(1);
  });

  it('reset clears everything', () => {
    const s = useConversation.getState();
    s.addUserMessage('x');
    s.addAttachment({ kind: 'text', content: 'y' });
    s.setStatus('thinking');
    s.reset();
    const fresh = useConversation.getState();
    expect(fresh.messages).toEqual([]);
    expect(fresh.attachments).toEqual([]);
    expect(fresh.status).toBe('idle');
  });
});
