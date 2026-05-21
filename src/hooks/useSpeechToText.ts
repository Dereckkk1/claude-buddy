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

/**
 * Web Speech API wrapper. `lang` is a BCP-47 tag (e.g. 'pt-BR', 'en-US', 'es-ES').
 *
 * The hook recreates the underlying recognizer whenever `lang` changes so the
 * language switch in settings is reflected immediately on the next toggle.
 */
export function useSpeechToText(onTranscript: (text: string) => void, lang: string = 'en-US') {
  const recogRef = useRef<SpeechRecognitionAPI | null>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    console.log('[STT] init — has SpeechRecognition?', !!Ctor, 'lang:', lang);
    if (!Ctor) return;
    setSupported(true);
    const recog = new Ctor();
    recog.lang = lang;
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
  }, [onTranscript, lang]);

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
