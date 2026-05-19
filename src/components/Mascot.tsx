import { useEffect, useRef } from 'react';
import { useSpriteAnimation } from '@/hooks/useSpriteAnimation';
import type { SpriteState, SpriteSheetDescriptor } from '@/services/sprite-animator';
import spritesJson from '../../assets/sprites/sprites.json';

type SpritesConfig = Record<SpriteState, {
  src: string;
  frames: number;
  fps: number;
  loop: boolean;
  nextState: SpriteState | null;
  frameWidth: number;
  frameHeight: number;
}>;

const sprites = spritesJson as SpritesConfig;

const descriptor: SpriteSheetDescriptor = {
  states: Object.fromEntries(
    Object.entries(sprites).map(([k, v]) => [k, {
      frames: v.frames, fps: v.fps, loop: v.loop, nextState: v.nextState,
    }])
  ) as SpriteSheetDescriptor['states'],
};

const SPRITE_SIZE = 64;

interface Props {
  state: SpriteState;
  onClick?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export function Mascot({ state, onClick, onMouseDown }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { state: currentState, frame, setState } = useSpriteAnimation(descriptor);

  useEffect(() => {
    setState(state);
  }, [state, setState]);

  useEffect(() => {
    const img = new Image();
    img.src = new URL(`../../assets/sprites/${sprites[currentState].src}`, import.meta.url).href;
    img.onload = () => { imgRef.current = img; };
  }, [currentState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    const cfg = sprites[currentState];
    const sx = (frame % cfg.frames) * cfg.frameWidth;
    ctx.drawImage(img, sx, 0, cfg.frameWidth, cfg.frameHeight, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
  }, [frame, currentState]);

  return (
    <canvas
      ref={canvasRef}
      width={SPRITE_SIZE}
      height={SPRITE_SIZE}
      onClick={onClick}
      onMouseDown={onMouseDown}
      style={{ cursor: 'pointer', imageRendering: 'pixelated' }}
    />
  );
}
