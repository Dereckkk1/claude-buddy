import { useEffect, useRef, useState } from 'react';
import { SpriteAnimator, type SpriteSheetDescriptor, type SpriteState } from '@/services/sprite-animator';

export function useSpriteAnimation(descriptor: SpriteSheetDescriptor) {
  const animatorRef = useRef<SpriteAnimator | null>(null);
  if (animatorRef.current === null) {
    animatorRef.current = new SpriteAnimator(descriptor);
  }
  const [state, setState] = useState<SpriteState>('sleeping');
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const animator = animatorRef.current!;
    let rafId = 0;
    let alive = true;

    animator.onStateChange((to) => {
      if (alive) setState(to);
    });

    function loop(t: number) {
      if (!alive) return;
      animator.tick(t);
      setFrame(animator.getFrame());
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, []);

  return {
    state,
    frame,
    setState: (s: SpriteState) => animatorRef.current!.setState(s),
  };
}
