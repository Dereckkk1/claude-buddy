import { autoUpdater } from 'electron-updater';
import { dialog, BrowserWindow } from 'electron';

// Configura o publish provider via electron-builder.yml.
// Por padrão, lê de package.json > build > publish OU electron-builder.yml > publish.
// Pra ativar updates, configure ali (ex: GitHub releases).

export function setupAutoUpdater(getMascotWin: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    console.warn('[updater] error:', err.message);
  });

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] checking for update');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available:', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] up to date');
  });

  autoUpdater.on('download-progress', (p) => {
    console.log(`[updater] download ${Math.round(p.percent)}%`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    console.log('[updater] update downloaded:', info.version);
    const win = getMascotWin();
    const result = await dialog.showMessageBox(win ?? undefined as never, {
      type: 'info',
      title: 'Claude Buddy — atualização disponível',
      message: `Versão ${info.version} baixada.`,
      detail: 'Reinicie pra aplicar agora, ou ela vai ser aplicada na próxima vez que abrir o app.',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  // Check on boot and every 4 hours after
  autoUpdater.checkForUpdatesAndNotify().catch(() => { /* swallow — provider not configured yet */ });
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => { /* same */ });
  }, 4 * 60 * 60 * 1000);
}
