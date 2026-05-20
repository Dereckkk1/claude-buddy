// Sons gerados via Web Audio API. Sem deps, sem arquivos.
// Vibe 8-bit / chiptune com volume baixo.

let audioCtx: AudioContext | null = null;
let thinkingInterval: number | null = null;
let masterVolume = 0.3;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function setSoundVolume(v: number): void {
  masterVolume = Math.max(0, Math.min(1, v));
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'square', vol = 1): void {
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(masterVolume * vol, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.05);
}

// Sequência de tones em série
function sequence(steps: { freq: number; dur: number; type?: OscillatorType; vol?: number }[], gap = 20): void {
  let delay = 0;
  steps.forEach((s) => {
    setTimeout(() => tone(s.freq, s.dur, s.type ?? 'square', s.vol ?? 1), delay);
    delay += s.dur + gap;
  });
}

// ── eventos ──────────────────────────────────────────────────

export function playWake(): void {
  sequence([{ freq: 523, dur: 60 }, { freq: 659, dur: 100 }], 10); // C5 → E5
}

export function playDone(): void {
  sequence([{ freq: 659, dur: 60 }, { freq: 523, dur: 120 }], 10); // E5 → C5
}

export function playSend(): void {
  tone(784, 60, 'square', 0.7); // G5
}

export function playError(): void {
  sequence([{ freq: 196, dur: 100, type: 'sawtooth', vol: 0.6 }, { freq: 165, dur: 150, type: 'sawtooth', vol: 0.6 }], 15);
}

export function playPasted(): void {
  sequence([{ freq: 523, dur: 50 }, { freq: 659, dur: 50 }, { freq: 784, dur: 80 }], 0);
}

export function playPrint(): void {
  tone(1200, 30, 'sine', 0.8);
  setTimeout(() => tone(800, 40, 'sine', 0.6), 30);
}

// ── thinking loop ────────────────────────────────────────────

export function startThinking(): void {
  if (thinkingInterval !== null) return;
  const play = () => {
    // "tu tu tu" — 3 blips curtos baixos
    tone(440, 40, 'triangle', 0.4); // A4
    setTimeout(() => tone(440, 40, 'triangle', 0.4), 130);
    setTimeout(() => tone(440, 40, 'triangle', 0.4), 260);
  };
  play();
  thinkingInterval = window.setInterval(play, 1100);
}

export function stopThinking(): void {
  if (thinkingInterval !== null) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;
  }
}
