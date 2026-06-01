import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let backendProcess;

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Buscando actualizaciones...');
  });

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización disponible',
      message: `Nueva versión ${info.version} disponible.\n¿Deseas descargarla ahora?`,
      buttons: ['Sí, actualizar', 'Después'],
      defaultId: 0,
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('La aplicación está actualizada.');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-progress', Math.round(progress.percent));
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Lista para instalar',
      message: 'Actualización descargada. Se instalará al cerrar la aplicación.',
      buttons: ['Reiniciar ahora', 'Después'],
      defaultId: 0,
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Error en actualización:', err?.message || err);
  });

  // Verificar al arrancar (solo en producción)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: 'Gestor Activos - IMSS',
    icon: !app.isPackaged
      ? path.join(__dirname, '../public/IMSS_Logosímbolo_Blanco.png')
      : path.join(__dirname, '../dist/IMSS_Logosímbolo_Blanco.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#006241',
      symbolColor: '#ffffff',
      height: 44
    },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5200');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function startBackend() {
  const isDev = !app.isPackaged;

  let exePath;
  if (isDev) {
    exePath = path.join(__dirname, '../../GestorActivosHardware/bin/Debug/net10.0-windows/GestorActivosHardware.exe');
  } else {
    exePath = path.join(process.resourcesPath, 'backend', 'GestorActivosHardware.exe');
  }

  console.log('Iniciando Backend en:', exePath);

  backendProcess = spawn(exePath, [], { detached: false });

  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch (e) {
      console.error('Error cerrando backend:', e);
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
