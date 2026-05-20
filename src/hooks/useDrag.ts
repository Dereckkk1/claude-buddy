import { useEffect, useRef } from 'react';
import { invoke } from '@/services/ipc';

export function useDrag() {
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startWin = useRef({ x: 0, y: 0 });

  const onMouseDown = async (e: React.MouseEvent) => {
    dragging.current = true;
    startPos.current = { x: e.screenX, y: e.screenY };
    const pos = await invoke('window:get-position');
    startWin.current = pos;
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.screenX - startPos.current.x;
      const dy = e.screenY - startPos.current.y;
      invoke('window:set-position', { x: startWin.current.x + dx, y: startWin.current.y + dy });
    };
    const onUp = async () => {
      if (!dragging.current) return;
      dragging.current = false;
      const pos = await invoke('window:get-position');
      const dist = Math.hypot(pos.x - startWin.current.x, pos.y - startWin.current.y);
      if (dist > 4) invoke('position:set', pos);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return { onMouseDown };
}
