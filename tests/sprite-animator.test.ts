import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpriteAnimator, type SpriteSheetDescriptor } from '@/services/sprite-animator';

const descriptor: SpriteSheetDescriptor = {
  states: {
    sleeping: { frames: 4, fps: 2, loop: true, nextState: null },
    waking:   { frames: 8, fps: 13, loop: false, nextState: 'idle' },
    idle:     { frames: 6, fps: 4, loop: true, nextState: null },
    thinking: { frames: 4, fps: 6, loop: true, nextState: null },
    talking:  { frames: 3, fps: 8, loop: true, nextState: null },
  },
};

describe('SpriteAnimator', () => {
  let animator: SpriteAnimator;
  beforeEach(() => {
    animator = new SpriteAnimator(descriptor);
  });

  it('starts in sleeping state at frame 0', () => {
    expect(animator.getState()).toBe('sleeping');
    expect(animator.getFrame()).toBe(0);
  });

  it('advances frames based on elapsed time and fps', () => {
    animator.setState('idle');
    animator.tick(0);
    expect(animator.getFrame()).toBe(0);
    animator.tick(250);
    expect(animator.getFrame()).toBe(1);
    animator.tick(500);
    expect(animator.getFrame()).toBe(2);
  });

  it('loops back to frame 0 after last frame when loop=true', () => {
    animator.setState('sleeping');
    animator.tick(0);
    animator.tick(500);
    animator.tick(1000);
    animator.tick(1500);
    animator.tick(2000);
    expect(animator.getFrame()).toBe(0);
  });

  it('auto-transitions to nextState when one-shot animation ends', () => {
    animator.setState('waking');
    animator.tick(0);
    animator.tick(700);
    expect(animator.getState()).toBe('idle');
  });

  it('resets frame to 0 when state changes', () => {
    animator.setState('idle');
    animator.tick(0);
    animator.tick(250);
    expect(animator.getFrame()).toBe(1);
    animator.setState('thinking');
    expect(animator.getFrame()).toBe(0);
  });

  it('emits onStateChange callback when state changes', () => {
    const cb = vi.fn();
    animator.onStateChange(cb);
    animator.setState('idle');
    expect(cb).toHaveBeenCalledWith('idle', 'sleeping');
  });
});
