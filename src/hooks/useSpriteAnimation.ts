import { useEffect, useRef, useState } from 'react';
import { SpriteAnimator, type SpriteSheetDescriptor, type SpriteState } from '@/services/sprite-animator';

export function useSpriteAnimation(descriptor: SpriteSheetDescriptor) {
  const animatorRef = useRef<SpriteAnimator>(new SpriteAnimator(descriptor));
  const [state, setState] = useState<SpriteState>('sleeping');
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const animator = animatorRef.current;
    animator.onStateChange((to) => setState(to));

    let rafId: number;
    function loop(t: number) {
      animator.tick(t);
      setFrame(animator.getFrame());
      setState(animator.getState());
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return {
    state,
    frame,
    setState: (s: SpriteState) => animatorRef.current.setState(s),
  };
}
