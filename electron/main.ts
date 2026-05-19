import { app, BrowserWindow } from 'electron';
import { createMascotWindow } from './window-manager';

let mascotWin: BrowserWindow | null = null;
const isDev = !app.isPackaged;

function bootstrap() {
  mascotWin = createMascotWindow();
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mascotWin.loadURL(process.env.VITE_DEV_SERVER_URL);
    mascotWin.webContents.openDevTools({ mode: 'detach' });
  } else {
    mascotWin.loadFile('dist/index.html');
  }
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
