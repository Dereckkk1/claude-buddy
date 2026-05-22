import { BrowserWindow, desktopCapturer, screen, ipcMain } from 'electron';
import { exec } from 'node:child_process';
import { translate } from '../shared/i18n-strings';
import { getSettings } from './store';

// Runs a PowerShell script via -EncodedCommand. Mirrors the local helper in
// keyboard.ts — kept here to avoid a circular import.
function runPS(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          console.error('[capture] PS error:', err.message, 'stderr:', stderr);
          reject(err);
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

async function getWindowRect(hwnd: string): Promise<{ left: number; top: number; right: number; bottom: number } | null> {
  // GetWindowRect needs the RECT struct — Add-Type -MemberDefinition can't
  // declare nested types, so we marshal 16 bytes (4 ints) directly via
  // AllocHGlobal and unpack into an int[]. Cached as a PSTypeName so repeated
  // calls don't recompile the helper.
  const script = `
if (-not ([System.Management.Automation.PSTypeName]'CBCap.Win').Type) {
  Add-Type -Namespace CBCap -Name Win -MemberDefinition @'
    [System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint="GetWindowRect")]
    public static extern bool GetWindowRectRaw(System.IntPtr hWnd, System.IntPtr lpRect);
    public static int[] GetRect(System.IntPtr hWnd) {
      System.IntPtr p = System.Runtime.InteropServices.Marshal.AllocHGlobal(16);
      GetWindowRectRaw(hWnd, p);
      int[] r = new int[4];
      System.Runtime.InteropServices.Marshal.Copy(p, r, 0, 4);
      System.Runtime.InteropServices.Marshal.FreeHGlobal(p);
      return r;
    }
'@
}
$h = [System.IntPtr]::new([int64]${hwnd})
$r = [CBCap.Win]::GetRect($h)
Write-Output ("L=" + $r[0] + "|T=" + $r[1] + "|R=" + $r[2] + "|B=" + $r[3])
  `;
  try {
    const out = await runPS(script);
    const m = out.match(/L=(-?\d+)\|T=(-?\d+)\|R=(-?\d+)\|B=(-?\d+)/);
    if (!m) return null;
    return {
      left: parseInt(m[1], 10),
      top: parseInt(m[2], 10),
      right: parseInt(m[3], 10),
      bottom: parseInt(m[4], 10),
    };
  } catch {
    return null;
  }
}

export async function captureActiveWindowImage(
  hwnd: string | null
): Promise<{ mimeType: string; base64: string } | null> {
  if (!hwnd || hwnd === '0') return null;
  const rect = await getWindowRect(hwnd);
  if (!rect) return null;
  const winW = rect.right - rect.left;
  const winH = rect.bottom - rect.top;
  if (winW < 10 || winH < 10) return null;

  // Pick the display containing the window's center — supports multi-monitor.
  const centerX = rect.left + Math.floor(winW / 2);
  const centerY = rect.top + Math.floor(winH / 2);
  const target = screen.getDisplayNearestPoint({ x: centerX, y: centerY });

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: target.size.width, height: target.size.height },
  });
  // display_id comes back stringified; fall back to the first source if no
  // direct match (single-screen path).
  const thumb =
    sources.find((s) => s.display_id === String(target.id))?.thumbnail
    ?? sources[0]?.thumbnail;
  if (!thumb) return null;

  const offsetX = rect.left - target.bounds.x;
  const offsetY = rect.top - target.bounds.y;
  const cropX = Math.max(0, offsetX);
  const cropY = Math.max(0, offsetY);
  const cropW = Math.min(target.size.width - cropX, Math.max(1, winW));
  const cropH = Math.min(target.size.height - cropY, Math.max(1, winH));
  if (cropW < 10 || cropH < 10) return null;

  const cropped = thumb.crop({ x: cropX, y: cropY, width: cropW, height: cropH });
  return { mimeType: 'image/png', base64: cropped.toPNG().toString('base64') };
}

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
