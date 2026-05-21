// Edge TTS via IPC. Bypassa a Web Speech API ruim do Windows.
import { invoke } from './ipc';

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/\[\[step:[a-z_]+\]\]/g, '')
    .replace(/```[\s\S]*?```/g, '. trecho de código. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    // Remove emojis (BMP + supplementary planes + variation selectors + ZWJ)
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+([.,!?;:])/g, '$1') // tidy punctuation after emoji removal
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

let currentAudio: HTMLAudioElement | null = null;

// Listeners notified whenever the speaking state changes (start/end/stop).
// Subscribers receive `true` when audio starts and `false` when it ends or is
// stopped — lets the UI react reactively without polling isSpeaking().
type SpeechListener = (speaking: boolean) => void;
const speechListeners = new Set<SpeechListener>();
function emitSpeechState(speaking: boolean): void {
  speechListeners.forEach((fn) => {
    try { fn(speaking); } catch { /* ignore listener errors */ }
  });
}

export function onSpeechStateChange(fn: SpeechListener): () => void {
  speechListeners.add(fn);
  return () => { speechListeners.delete(fn); };
}

export async function speak(text: string, voice: string, rate = 1.25): Promise<void> {
  const clean = stripMarkdownForSpeech(text);
  if (!clean) return;
  stop();
  try {
    const base64 = await invoke('tts:synthesize', { text: clean, voice });
    const audio = new Audio(`data:audio/mp3;base64,${base64}`);
    audio.playbackRate = rate;
    currentAudio = audio;
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      emitSpeechState(false);
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      emitSpeechState(false);
    };
    await audio.play();
    emitSpeechState(true);
  } catch (e) {
    console.error('[tts] speak failed:', e);
    emitSpeechState(false);
  }
}

export function stop(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
    emitSpeechState(false);
  }
}

export function isSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}
