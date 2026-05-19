import { useState, useEffect } from 'react';
import { Mascot } from './components/Mascot';
import { SpeechBubble } from './components/SpeechBubble';
import { InputPanel } from './components/InputPanel';
import { ResponseView } from './components/ResponseView';
import { AttachmentChip } from './components/AttachmentChip';
import { useConversation } from './state/conversation';
import { streamClaude } from './services/claude';
import { invoke, on, off } from './services/ipc';
import type { SpriteState } from './services/sprite-animator';
import './App.css';

export default function App() {
  const [state, setState] = useState<SpriteState>('sleeping');
  const [continueCounter, setContinueCounter] = useState(0);
  const conv = useConversation();

  const wake = async () => {
    if (state !== 'sleeping') return;
    setState('waking');
    const data = await invoke('clipboard:read');
    if (data) conv.addAttachment(data);
  };
  const sleep = () => { setState('sleeping'); conv.reset(); setContinueCounter(0); };

  useEffect(() => {
    const handler = () => wake();
    on('hotkey:activate', handler);
    return () => off('hotkey:activate');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const lastAssistant = [...conv.messages].reverse().find(m => m.role === 'assistant');
  const showResponse = !!lastAssistant && continueCounter === 0;
  const showInput = !showResponse && conv.status !== 'thinking';

  const handleSubmit = async (text: string) => {
    setContinueCounter(0);
    conv.addUserMessage(text);
    conv.setStatus('thinking');
    setState('thinking');
    try {
      const snapshotMessages = useConversation.getState().messages;
      const snapshotAttachments = useConversation.getState().attachments;
      conv.beginAssistantMessage();
      conv.setStatus('talking');
      setState('talking');
      for await (const chunk of streamClaude(snapshotMessages, snapshotAttachments)) {
        conv.appendAssistantChunk(chunk);
      }
      while (useConversation.getState().attachments.length > 0) conv.removeAttachment(0);
      conv.setStatus('idle');
      setState('idle');
    } catch (err) {
      const code = err instanceof Error ? err.message : 'UNKNOWN';
      const msg = {
        NETWORK: 'tô offline 😴 confere a internet aí',
        INVALID_API_KEY: 'API key não tá rolando — reabre a config',
        RATE_LIMITED: 'calma aí, muita pergunta junta',
        API_KEY_MISSING: 'API key não configurada',
        UNKNOWN: 'deu ruim aqui, tenta de novo?',
      }[code] || `erro: ${code}`;
      conv.setError(msg);
      conv.setStatus('error');
      setState('idle');
    }
  };

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0, width: 400, height: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      gap: 8, padding: 16,
    }}>
      {state !== 'sleeping' && (
        <SpeechBubble title={lastAssistant ? undefined : 'como posso ajudar?'} onClose={sleep}>
          {showResponse && lastAssistant && (
            <ResponseView
              text={lastAssistant.content}
              showActions={conv.status === 'idle'}
              onOk={sleep}
              onContinue={() => setContinueCounter(c => c + 1)}
            />
          )}
          {showInput && conv.attachments.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {conv.attachments.map((a, i) => (
                <AttachmentChip key={i} attachment={a} onRemove={() => conv.removeAttachment(i)} />
              ))}
            </div>
          )}
          {showInput && (
            <InputPanel
              onSubmit={handleSubmit}
              onCapture={async () => {
                const result = await invoke('capture:screen-region');
                if (result) conv.addAttachment({ kind: 'image', mimeType: result.mimeType, base64: result.base64 });
              }}
              onClipboard={async () => {
                const data = await invoke('clipboard:read');
                if (data) conv.addAttachment(data);
              }}
              onSelectionAttach={async () => {
                const data = await invoke('clipboard:read');
                if (data?.kind === 'text') conv.addAttachment(data);
              }}
              disabled={conv.status === 'thinking' || conv.status === 'talking'}
            />
          )}
          {conv.status === 'thinking' && (
            <div style={{ color: '#666', fontStyle: 'italic', marginTop: 8 }}>pensando...</div>
          )}
          {conv.status === 'error' && conv.error && (
            <div style={{ color: '#c00', marginTop: 8, fontSize: 12 }}>
              {conv.error}
              <button style={{ marginLeft: 8 }} onClick={() => { conv.setError(null); conv.setStatus('idle'); }}>OK</button>
            </div>
          )}
        </SpeechBubble>
      )}
      <Mascot state={state} onClick={wake} />
    </div>
  );
}
