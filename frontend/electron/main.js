import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Optimización para PC viejas: Desactivar aceleración por hardware
app.disableHardwareAcceleration();

let mainWindow;
let backendProcess;

const log = require('electron-log');
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;
autoUpdater.requestHeaders = { "Cache-Control": "no-cache" };

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    console.log('Buscando actualizaciones...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Actualización disponible:', info.version);
    autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('El sistema está en la versión más reciente.');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-progress', Math.round(progress.percent));
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('Actualización descargada. Instalando en segundo plano...');
    autoUpdater.quitAndInstall(true, true);
  });

  autoUpdater.on('error', (err) => {
    console.error('Error en actualización:', err?.message || err);
  });

  // Verificar al arrancar (solo en producción)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(err => {
        console.error("Error al conectar con IIS:", err);
    });
  }
}

// Expuesto para polling si se requiere
ipcMain.on('checar-actualizaciones', () => {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(console.error);
  }
});

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

  // Matar cualquier instancia huérfana previa
  import('child_process').then(({ exec }) => {
    exec('taskkill /f /im GestorActivosHardware.exe', (err) => {
      // Ignoramos error si no existía el proceso
      backendProcess = spawn(exePath, [], { 
        detached: false,
        cwd: path.dirname(exePath)
      });

      backendProcess.stdout.on('data', (data) => {
        console.log(`Backend: ${data}`);
      });

      backendProcess.stderr.on('data', (data) => {
        console.error(`Backend Error: ${data}`);
      });
    });
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

app.on('before-quit', () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch (e) {
      console.error('Error cerrando backend:', e);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
