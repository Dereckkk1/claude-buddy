import { BrowserWindow, desktopCapturer, screen, ipcMain } from 'electron';
import { translate } from '../shared/i18n-strings';
import { getSettings } from './store';

export async function captureScreenRegion(): Promise<{ mimeType: string; base64: string } | null> {
  // Localized "ESC to cancel — drag to select" hint, baked into the overlay
  // HTML at render time. Settings already carry the user's locale.
  const escHint = translate(getSettings().locale, 'capture.escHint');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });
  const fullScreen = sources[0]?.thumbnail;
  if (!fullScreen) return null;
  const fullDataUrl = fullScreen.toDataURL();

  const overlay = new BrowserWindow({
    width, height, x: display.bounds.x, y: display.bounds.y,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    fullscreen: true, hasShadow: false, resizable: false,
    webPreferences: { contextIsolation: false, nodeIntegration: true },
  });

  const html = `
    <html>
    <body style="margin:0;cursor:crosshair;background:rgba(0,0,0,0.3);overflow:hidden">
      <img id="bg" src="${fullDataUrl}" style="position:absolute;inset:0;width:100%;height:100%;opacity:0.35;pointer-events:none">
      <div style="position:absolute;top:16px;left:50%;transform:translateX(-50%);padding:6px 14px;background:rgba(0,0,0,0.6);color:#fff;font-family:system-ui,sans-serif;font-size:13px;border-radius:6px;pointer-events:none;z-index:10">${escHint.replace(/"/g, '&quot;')}</div>
      <div id="sel" style="position:absolute;border:2px solid #ff6b35;background:rgba(255,107,53,0.15);display:none"></div>
      <script>
        const { ipcRenderer } = require('electron');
        let startX, startY, isDown = false;
        const sel = document.getElementById('sel');
        document.addEventListener('mousedown', e => {
          isDown = true; startX = e.clientX; startY = e.clientY;
          sel.style.left = startX+'px'; sel.style.top = startY+'px';
          sel.style.width = '0px'; sel.style.height = '0px'; sel.style.display = 'block';
        });
        document.addEventListener('mousemove', e => {
          if (!isDown) return;
          const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
          const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
          sel.style.left = x+'px'; sel.style.top = y+'px';
          sel.style.width = w+'px'; sel.style.height = h+'px';
        });
        document.addEventListener('mouseup', e => {
          if (!isDown) return; isDown = false;
          const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
          const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
          if (w < 8 || h < 8) { ipcRenderer.send('capture:result', null); return; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const img = document.getElementById('bg');
          const tmp = new Image();
          tmp.onload = () => {
            const sx = x * (tmp.naturalWidth / window.innerWidth);
            const sy = y * (tmp.naturalHeight / window.innerHeight);
            const sw = w * (tmp.naturalWidth / window.innerWidth);
            const sh = h * (tmp.naturalHeight / window.innerHeight);
            canvas.getContext('2d').drawImage(tmp, sx, sy, sw, sh, 0, 0, w, h);
            const data = canvas.toDataURL('image/png').split(',')[1];
            ipcRenderer.send('capture:result', { mimeType: 'image/png', base64: data });
          };
          tmp.src = img.src;
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') { ipcRenderer.send('capture:result', null); } });
      </script>
    </body>
    </html>
  `;

  overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  return new Promise((resolve) => {
    const handler = (_e: unknown, data: { mimeType: string; base64: string } | null) => {
      ipcMain.removeListener('capture:result', handler);
      overlay.close();
      resolve(data);
    };
    ipcMain.on('capture:result', handler);
  });
}
