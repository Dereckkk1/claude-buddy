import { exec } from 'node:child_process';
import { clipboard } from 'electron';

export interface ActiveAppInfo {
  processName: string;
  windowTitle: string;
}

let lastForegroundHwnd: string = '0';
let lastActiveApp: ActiveAppInfo | null = null;
let ownHwnds: Set<string> = new Set();

export function registerOwnHwnd(hwnd: string) {
  ownHwnds.add(hwnd);
}

export function getLastForegroundHwnd(): string {
  return lastForegroundHwnd;
}

// Last captured foreground app metadata — null until the first non-self
// foreground window is seen. Cheap to expose to the renderer as a snapshot.
export function getActiveApp(): ActiveAppInfo | null {
  return lastActiveApp;
}

function runPowerShell(script: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          console.error('[keyboard] PS error:', err.message, 'stderr:', stderr);
          reject(err);
        } else {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        }
      }
    );
  });
}

const NATIVE = `
if (-not ([System.Management.Automation.PSTypeName]'CBNative.Win').Type) {
  Add-Type -Namespace CBNative -Name Win -MemberDefinition @'
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern System.IntPtr GetForegroundWindow();
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(System.IntPtr hWnd);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern int GetWindowText(System.IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
'@
}
`;

export async function captureActiveWindow(): Promise<void> {
  try {
    // Single PS roundtrip — also fetch the owning process name via
    // GetWindowThreadProcessId + Get-Process. We separate fields with `|||`
    // so titles containing '=' won't break parsing.
    const script = `
      ${NATIVE}
      $h = [CBNative.Win]::GetForegroundWindow()
      $sb = New-Object System.Text.StringBuilder 256
      [void][CBNative.Win]::GetWindowText($h, $sb, 256)
      $pid_out = [uint32]0
      [void][CBNative.Win]::GetWindowThreadProcessId($h, [ref]$pid_out)
      $procName = ''
      try { $procName = (Get-Process -Id $pid_out -ErrorAction Stop).ProcessName } catch {}
      Write-Output ("HWND=" + $h.ToInt64() + "|||PROC=" + $procName + "|||TITLE=" + $sb.ToString())
    `;
    const { stdout } = await runPowerShell(script);
    const match = stdout.match(/HWND=(\d+)\|\|\|PROC=([^|]*)\|\|\|TITLE=(.*)$/s);
    if (match) {
      const hwnd = match[1];
      const processName = (match[2] ?? '').trim();
      const windowTitle = (match[3] ?? '').trim();
      // Don't save our own windows as the target — that would just paste into the mascot.
      if (!ownHwnds.has(hwnd) && hwnd !== '0') {
        lastForegroundHwnd = hwnd;
        lastActiveApp = { processName, windowTitle };
        console.log('[keyboard] captured non-self:', stdout);
      } else {
        console.log('[keyboard] skipped (own window):', stdout);
      }
    }
  } catch (e) {
    console.error('[keyboard] captureActiveWindow failed:', e);
  }
}

// Simulates Ctrl+C in the previously active window and returns its clipboard text.
// Uses the same AttachThreadInput trick as paste.
export async function copyFromActiveWindow(): Promise<string | null> {
  console.log('[keyboard] copy from active, target hwnd:', lastForegroundHwnd);
  if (lastForegroundHwnd === '0') return null;

  const script = `
    ${NATIVE}
    $target = [System.IntPtr]::new([int64]${lastForegroundHwnd})
    if ($target -eq [System.IntPtr]::Zero) { Write-Output 'NO_TARGET'; exit }

    $fg = [CBNative.Win]::GetForegroundWindow()
    $fgPid = [uint32]0
    $fgThread = [CBNative.Win]::GetWindowThreadProcessId($fg, [ref]$fgPid)
    $targetPid = [uint32]0
    $targetThread = [CBNative.Win]::GetWindowThreadProcessId($target, [ref]$targetPid)
    $currentThread = [CBNative.Win]::GetCurrentThreadId()

    [void][CBNative.Win]::AttachThreadInput($currentThread, $targetThread, $true)
    [void][CBNative.Win]::AttachThreadInput($fgThread, $targetThread, $true)
    [void][CBNative.Win]::ShowWindow($target, 9)
    $ok = [CBNative.Win]::SetForegroundWindow($target)
    [void][CBNative.Win]::AttachThreadInput($currentThread, $targetThread, $false)
    [void][CBNative.Win]::AttachThreadInput($fgThread, $targetThread, $false)

    Start-Sleep -Milliseconds 120
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait('^c')
    Write-Output 'COPIED'
  `;
  await runPowerShell(script);
  // Give clipboard time to update
  await new Promise((r) => setTimeout(r, 200));
  const txt = clipboard.readText();
  console.log('[keyboard] selection length:', txt.length);
  return txt.trim().length > 0 ? txt : null;
}

export async function pasteToActiveWindow(text: string): Promise<void> {
  clipboard.writeText(text);
  console.log('[keyboard] clipboard set, len:', text.length, 'target hwnd:', lastForegroundHwnd);

  // AttachThreadInput trick to bypass Windows foreground lock.
  const script = `
    ${NATIVE}
    $target = [System.IntPtr]::new([int64]${lastForegroundHwnd})
    if ($target -eq [System.IntPtr]::Zero) { Write-Output 'NO_TARGET'; exit }

    $fg = [CBNative.Win]::GetForegroundWindow()
    $fgPid = [uint32]0
    $fgThread = [CBNative.Win]::GetWindowThreadProcessId($fg, [ref]$fgPid)
    $targetPid = [uint32]0
    $targetThread = [CBNative.Win]::GetWindowThreadProcessId($target, [ref]$targetPid)
    $currentThread = [CBNative.Win]::GetCurrentThreadId()

    [void][CBNative.Win]::AttachThreadInput($currentThread, $targetThread, $true)
    [void][CBNative.Win]::AttachThreadInput($fgThread, $targetThread, $true)
    [void][CBNative.Win]::ShowWindow($target, 9)  # SW_RESTORE
    $ok = [CBNative.Win]::SetForegroundWindow($target)
    [void][CBNative.Win]::AttachThreadInput($currentThread, $targetThread, $false)
    [void][CBNative.Win]::AttachThreadInput($fgThread, $targetThread, $false)

    Write-Output ("SetForeground=" + $ok)

    Start-Sleep -Milliseconds 150
    $newFg = [CBNative.Win]::GetForegroundWindow()
    Write-Output ("NewForeground=" + $newFg.ToInt64())

    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Write-Output 'PASTED'
  `;
  const { stdout, stderr } = await runPowerShell(script);
  console.log('[keyboard] paste result stdout:', stdout);
  if (stderr) console.log('[keyboard] paste result stderr:', stderr);
}
