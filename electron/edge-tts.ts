// Edge TTS — usa as vozes neurais gratuitas do Microsoft Edge.
// Qualidade muito superior à Web Speech API nativa do Windows.
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const VOICES = [
  { id: 'pt-BR-FranciscaNeural', label: 'Francisca (feminina)' },
  { id: 'pt-BR-AntonioNeural', label: 'Antonio (masculina)' },
  { id: 'pt-BR-ThalitaNeural', label: 'Thalita (feminina)' },
  { id: 'pt-BR-DonatoNeural', label: 'Donato (masculina)' },
];

const cache = new Map<string, string>();
const MAX_CACHE = 20;

// Rate é aplicado no client via audio.playbackRate — não precisa SSML.
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
