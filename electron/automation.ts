import { exec } from 'node:child_process';
import { desktopCapturer, screen, clipboard } from 'electron';

function runPS(script: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    );
  });
}

const NATIVE = `
if (-not ([System.Management.Automation.PSTypeName]'CBAuto.Win').Type) {
  Add-Type -Namespace CBAuto -Name Win -MemberDefinition @'
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, System.UIntPtr dwExtraInfo);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern bool GetCursorPos(out System.Drawing.Point lpPoint);
'@ -ReferencedAssemblies System.Drawing
}
`;

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;

export async function moveMouse(x: number, y: number): Promise<void> {
  await runPS(`${NATIVE}\n[void][CBAuto.Win]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})`);
}

export async function mouseClick(x: number, y: number, button: 'left' | 'right' | 'middle'): Promise<void> {
  const down = button === 'left' ? MOUSEEVENTF_LEFTDOWN : button === 'right' ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_MIDDLEDOWN;
  const up = button === 'left' ? MOUSEEVENTF_LEFTUP : button === 'right' ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_MIDDLEUP;
  await runPS(`
    ${NATIVE}
    [void][CBAuto.Win]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
    Start-Sleep -Milliseconds 30
    [CBAuto.Win]::mouse_event(${down}, 0, 0, 0, [System.UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [CBAuto.Win]::mouse_event(${up}, 0, 0, 0, [System.UIntPtr]::Zero)
  `);
}

export async function doubleClick(x: number, y: number): Promise<void> {
  await runPS(`
    ${NATIVE}
    [void][CBAuto.Win]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
    Start-Sleep -Milliseconds 30
    [CBAuto.Win]::mouse_event(${MOUSEEVENTF_LEFTDOWN}, 0, 0, 0, [System.UIntPtr]::Zero)
    [CBAuto.Win]::mouse_event(${MOUSEEVENTF_LEFTUP}, 0, 0, 0, [System.UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [CBAuto.Win]::mouse_event(${MOUSEEVENTF_LEFTDOWN}, 0, 0, 0, [System.UIntPtr]::Zero)
    [CBAuto.Win]::mouse_event(${MOUSEEVENTF_LEFTUP}, 0, 0, 0, [System.UIntPtr]::Zero)
  `);
}

export async function typeText(text: string): Promise<void> {
  clipboard.writeText(text);
  await runPS(`Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 80; [System.Windows.Forms.SendKeys]::SendWait('^v')`);
}

function translateKey(key: string): string {
  const parts = key.toLowerCase().split('+').map((p) => p.trim());
  let modifiers = '';
  let main = '';
  for (const p of parts) {
    if (p === 'ctrl' || p === 'control') modifiers += '^';
    else if (p === 'shift') modifiers += '+';
    else if (p === 'alt') modifiers += '%';
    else main = p;
  }
  const map: Record<string, string> = {
    'enter': '{ENTER}', 'return': '{ENTER}', 'tab': '{TAB}',
    'escape': '{ESC}', 'esc': '{ESC}', 'backspace': '{BS}',
    'delete': '{DEL}', 'del': '{DEL}', 'space': ' ',
    'up': '{UP}', 'down': '{DOWN}', 'left': '{LEFT}', 'right': '{RIGHT}',
    'home': '{HOME}', 'end': '{END}', 'pageup': '{PGUP}', 'pagedown': '{PGDN}',
    'page_up': '{PGUP}', 'page_down': '{PGDN}',
    'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}',
    'f5': '{F5}', 'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}',
    'f9': '{F9}', 'f10': '{F10}', 'f11': '{F11}', 'f12': '{F12}',
    'super': '^{ESC}', 'win': '^{ESC}', 'meta': '^{ESC}',
  };
  main = map[main] ?? main;
  return modifiers + main;
}

export async function pressKey(key: string): Promise<void> {
  const sk = translateKey(key);
  // Escape ' for SendKeys argument
  const escaped = sk.replace(/'/g, "''");
  await runPS(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`);
}

export async function scroll(x: number, y: number, direction: 'up' | 'down', amount: number): Promise<void> {
  const delta = direction === 'down' ? -120 * amount : 120 * amount;
  await runPS(`
    ${NATIVE}
    [void][CBAuto.Win]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
    [CBAuto.Win]::mouse_event(${MOUSEEVENTF_WHEEL}, 0, 0, ${delta}, [System.UIntPtr]::Zero)
  `);
}

export async function cursorPosition(): Promise<{ x: number; y: number }> {
  const { stdout } = await runPS(`
    ${NATIVE}
    $p = New-Object System.Drawing.Point
    [void][CBAuto.Win]::GetCursorPos([ref]$p)
    Write-Output ($p.X.ToString() + ',' + $p.Y.ToString())
  `);
  const [x, y] = stdout.split(',').map(Number);
  return { x, y };
}

const MAX_SCREENSHOT_WIDTH = 1280;

export async function getScreenshot(): Promise<{
  scaledWidth: number;
  scaledHeight: number;
  realWidth: number;
  realHeight: number;
  base64: string;
}> {
  const display = screen.getPrimaryDisplay();
  const realWidth = display.size.width;
  const realHeight = display.size.height;
  const scale = Math.min(1, MAX_SCREENSHOT_WIDTH / realWidth);
  const scaledWidth = Math.round(realWidth * scale);
  const scaledHeight = Math.round(realHeight * scale);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: scaledWidth, height: scaledHeight },
  });
  if (sources.length === 0) throw new Error('no screen source available');
  return {
    scaledWidth,
    scaledHeight,
    realWidth,
    realHeight,
    base64: sources[0].thumbnail.toPNG().toString('base64'),
  };
}

export function getScreenSize(): { realWidth: number; realHeight: number; scaledWidth: number; scaledHeight: number } {
  const display = screen.getPrimaryDisplay();
  const realWidth = display.size.width;
  const realHeight = display.size.height;
  const scale = Math.min(1, MAX_SCREENSHOT_WIDTH / realWidth);
  return {
    realWidth,
    realHeight,
    scaledWidth: Math.round(realWidth * scale),
    scaledHeight: Math.round(realHeight * scale),
  };
}
