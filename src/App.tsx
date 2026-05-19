import { useState } from 'react';
import { Mascot } from './components/Mascot';
import { SpeechBubble } from './components/SpeechBubble';
import type { SpriteState } from './services/sprite-animator';
import './App.css';

export default function App() {
  const [state, setState] = useState<SpriteState>('sleeping');

  const handleClick = () => {
    if (state === 'sleeping') setState('waking');
  };

  const handleOk = () => setState('sleeping');

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0, width: 400, height: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      gap: 8, padding: 16,
    }}>
      {state !== 'sleeping' && (
        <SpeechBubble title="como posso ajudar?">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleOk}>OK</button>
          </div>
        </SpeechBubble>
      )}
      <Mascot state={state} onClick={handleClick} />
    </div>
  );
}
