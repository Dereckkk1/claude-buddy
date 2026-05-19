export type SpriteState = 'sleeping' | 'waking' | 'idle' | 'thinking' | 'talking';

export interface StateDef {
  frames: number;
  fps: number;
  loop: boolean;
  nextState: SpriteState | null;
}

export interface SpriteSheetDescriptor {
  states: Record<SpriteState, StateDef>;
}

type StateChangeListener = (to: SpriteState, from: SpriteState) => void;

export class SpriteAnimator {
  private state: SpriteState = 'sleeping';
  private frame = 0;
  private stateStartMs: number | null = null;
  private listeners: StateChangeListener[] = [];

  constructor(private descriptor: SpriteSheetDescriptor) {}

  getState(): SpriteState { return this.state; }
  getFrame(): number { return this.frame; }

  setState(next: SpriteState): void {
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    this.frame = 0;
    this.stateStartMs = null;
    this.listeners.forEach(cb => cb(next, prev));
  }

  onStateChange(cb: StateChangeListener): void {
    this.listeners.push(cb);
  }

  tick(nowMs: number): void {
    const def = this.descriptor.states[this.state];
    if (this.stateStartMs === null) this.stateStartMs = nowMs;
    const elapsed = nowMs - this.stateStartMs;
    const frameDuration = 1000 / def.fps;
    const rawFrame = Math.floor(elapsed / frameDuration);

    if (def.loop) {
      this.frame = rawFrame % def.frames;
    } else if (rawFrame >= def.frames) {
      if (def.nextState) {
        this.setState(def.nextState);
        this.stateStartMs = nowMs;
      } else {
        this.frame = def.frames - 1;
      }
    } else {
      this.frame = rawFrame;
    }
  }
}
