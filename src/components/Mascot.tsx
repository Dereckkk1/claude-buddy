import { useEffect, useRef, useState } from 'react';
import { useSpriteAnimation } from '@/hooks/useSpriteAnimation';
import { renderCrab } from '@/services/crab-renderer';
import type { SpriteState, SpriteSheetDescriptor } from '@/services/sprite-animator';

const descriptor: SpriteSheetDescriptor = {
  states: {
    sleeping: { frames: 3, fps: 1.5, loop: true, nextState: null },
    waking:   { frames: 8, fps: 10, loop: false, nextState: 'idle' },
    idle:     { frames: 2, fps: 1.7, loop: true, nextState: null },
    thinking: { frames: 4, fps: 6, loop: true, nextState: null },
    talking:  { frames: 3, fps: 8, loop: true, nextState: null },
  },
};

const GRID_W = 18;
const GRID_H = 10;
const SCALE = 7; // 18*7 = 126px wide (with claws), 10*7 = 70px tall

interface Props {
  state: SpriteState;
  onClick?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export function Mascot({ state, onClick, onMouseDown }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state: currentState, frame, setState } = useSpriteAnimation(descriptor);
  // Hint at the affordance: 'grab' invites drag, 'grabbing' confirms it.
  // Falls back to 'pointer' for the sleeping/click-to-wake case.
  const [dragging, setDragging] = useState(false);

  useEffect(() => { setState(state); }, [state, setState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    renderCrab({ ctx, size: { w: GRID_W, h: GRID_H }, scale: SCALE, state: currentState, frame });
  }, [frame, currentState]);

  // Listen on window for mouseup so we always release the grabbing cursor —
  // even if the user drags outside the canvas and releases there.
  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [dragging]);

  return (
    <canvas
      ref={canvasRef}
      width={(GRID_W * SCALE) + 50}
      height={GRID_H * SCALE}
      onClick={onClick}
      onMouseDown={(e) => {
        setDragging(true);
        onMouseDown?.(e);
      }}
      style={{
        cursor: dragging ? 'grabbing' : 'grab',
        imageRendering: 'pixelated',
        filter: 'drop-shadow(0 6px 14px rgba(204,120,92,0.4))',
        display: 'block',
      }}
    />
  );
}
