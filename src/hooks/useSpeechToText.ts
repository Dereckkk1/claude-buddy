import { useEffect, useRef, useState } from 'react';

interface SpeechRecognitionAPI {
  start: () => void;
  stop: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionAPI;
    webkitSpeechRecognition?: new () => SpeechRecognitionAPI;
  }
}

export function useSpeechToText(onTranscript: (text: string) => void) {
  const recogRef = useRef<SpeechRecognitionAPI | null>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    console.log('[STT] init — has SpeechRecognition?', !!Ctor);
    if (!Ctor) return;
    setSupported(true);
    const recog = new Ctor();
    recog.lang = 'pt-BR';
    recog.continuous = false;
    recog.interimResults = false;
    recog.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      console.log('[STT] onresult:', transcript);
      onTranscript(transcript);
    };
    recog.onend = () => {
      console.log('[STT] onend');
      setListening(false);
    };
    recog.onerror = (e) => {
      console.error('[STT] error:', e.error, e);
      setListening(false);
    };
    recogRef.current = recog;
  }, [onTranscript]);

  const toggle = () => {
    const recog = recogRef.current;
    console.log('[STT] toggle — listening?', listening, 'has recog?', !!recog);
    if (!recog) return;
    if (listening) {
      recog.stop();
    } else {
      try {
        recog.start();
        setListening(true);
        console.log('[STT] start() called');
      } catch (err) {
        console.error('[STT] start() failed:', err);
      }
    }
  };

  return { listening, supported, toggle };
}
