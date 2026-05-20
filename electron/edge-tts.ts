// Edge TTS — uses Microsoft Edge's free neural voices.
// Quality is way above Windows' built-in Web Speech API.
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { translate } from '../shared/i18n-strings';
import { getSettings } from './store';

interface VoiceDef {
  id: string;
  name: string;
  gender: 'female' | 'male';
  language: 'en' | 'pt' | 'es';
}

// Curated set across the three UI languages. Edge TTS has dozens more — these
// are the natural-sounding neural defaults per locale.
const VOICE_DEFS: VoiceDef[] = [
  // English
  { id: 'en-US-JennyNeural',     name: 'Jenny (US)',    gender: 'female', language: 'en' },
  { id: 'en-US-GuyNeural',       name: 'Guy (US)',      gender: 'male',   language: 'en' },
  { id: 'en-US-AriaNeural',      name: 'Aria (US)',     gender: 'female', language: 'en' },
  { id: 'en-GB-SoniaNeural',     name: 'Sonia (UK)',    gender: 'female', language: 'en' },
  { id: 'en-GB-RyanNeural',      name: 'Ryan (UK)',     gender: 'male',   language: 'en' },
  // Portuguese (BR)
  { id: 'pt-BR-FranciscaNeural', name: 'Francisca',     gender: 'female', language: 'pt' },
  { id: 'pt-BR-AntonioNeural',   name: 'Antônio',       gender: 'male',   language: 'pt' },
  { id: 'pt-BR-ThalitaNeural',   name: 'Thalita',       gender: 'female', language: 'pt' },
  { id: 'pt-BR-DonatoNeural',    name: 'Donato',        gender: 'male',   language: 'pt' },
  // Spanish
  { id: 'es-MX-DaliaNeural',     name: 'Dalia (MX)',    gender: 'female', language: 'es' },
  { id: 'es-MX-JorgeNeural',     name: 'Jorge (MX)',    gender: 'male',   language: 'es' },
  { id: 'es-ES-ElviraNeural',    name: 'Elvira (ES)',   gender: 'female', language: 'es' },
  { id: 'es-ES-AlvaroNeural',    name: 'Álvaro (ES)',   gender: 'male',   language: 'es' },
];

const LANGUAGE_TAGS: Record<'en' | 'pt' | 'es', string> = {
  en: 'EN', pt: 'PT', es: 'ES',
};

// Returns voices labeled in the current UI locale.
// Each label looks like: "[EN] Jenny (US) (female)" — the bracket prefix lets
// the dropdown stay scannable when all languages are listed together.
export function getVoices(): { id: string; label: string }[] {
  const locale = getSettings().locale;
  return VOICE_DEFS.map((v) => ({
    id: v.id,
    label: `[${LANGUAGE_TAGS[v.language]}] ${v.name} (${translate(locale, `voice.${v.gender}`)})`,
  }));
}

// Returns the recommended default voice id for a given UI locale — used when
// the user switches language and the current voice doesn't match it.
export function defaultVoiceFor(locale: 'en' | 'pt' | 'es'): string {
  const v = VOICE_DEFS.find((d) => d.language === locale);
  return v?.id ?? 'en-US-JennyNeural';
}

// Returns the language of a given voice id (useful to detect mismatches).
export function languageOfVoice(voiceId: string): 'en' | 'pt' | 'es' | null {
  return VOICE_DEFS.find((d) => d.id === voiceId)?.language ?? null;
}

const cache = new Map<string, string>();
const MAX_CACHE = 20;

// Rate is applied client-side via audio.playbackRate — no SSML needed.
export async function synthesize(text: string, voice: string): Promise<string> {
  const key = `${voice}::${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    audioStream.on('data', (c: Buffer) => chunks.push(c));
    audioStream.on('close', () => resolve());
    audioStream.on('error', (e: Error) => reject(e));
  });
  const audio = Buffer.concat(chunks);
  const base64 = audio.toString('base64');

  // Simple LRU
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, base64);

  return base64;
}
