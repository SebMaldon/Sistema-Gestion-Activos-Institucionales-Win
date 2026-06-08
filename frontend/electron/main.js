import { app, BrowserWindow, dialog, ipcMain, Tray, Menu, nativeImage } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { startAutoSync } from './autoSync.js';
import os from 'os';

const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Optimización de RAM y CPU en segundo plano
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService,CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('disable-site-isolation-trials');

let mainWindow;
let backendProcess;
let tray = null;
let isQuitting = false;

// Debe ir ANTES de whenReady para evitar race condition al reiniciar
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  showOrCreateWindow();
});

const log = require('electron-log');
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;
autoUpdater.requestHeaders = { "Cache-Control": "no-cache" };

function setupAutoUpdater() {
  const sendToRenderer = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  autoUpdater.on('checking-for-update', () => {
    console.log('Buscando actualizaciones...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Actualización disponible:', info.version);
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      sendToRenderer('update-available', info.version);
      // El usuario decidirá cuándo descargar usando el botón en la UI
    } else {
      console.log('App en segundo plano, descargando actualización automáticamente...');
      autoUpdater.downloadUpdate();
    }
  });

  ipcMain.on('descargar-actualizacion', () => {
    console.log('Usuario solicitó descargar actualización...');
    autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('El sistema está en la versión más reciente.');
    sendToRenderer('update-not-available', true);
  });

  autoUpdater.on('error', (err) => {
    console.error('Error en actualización:', err?.message || err);
    sendToRenderer('update-error', true);
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update-progress', Math.round(progress.percent));
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('Actualización descargada.');
    require('fs').writeFileSync(path.join(app.getPath('userData'), '.update-restart'), '1');

    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      const { dialog } = require('electron');
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Actualización lista',
        message: 'Se ha descargado una nueva actualización.',
        detail: 'La aplicación debe reiniciarse para aplicar los cambios. ¿Deseas reiniciar ahora?',
        buttons: ['Reiniciar Ahora', 'Más Tarde'],
        defaultId: 0,
        cancelId: 1
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(true, true);
        }
      });
    } else {
      console.log('App en segundo plano, instalando silenciosamente...');
      autoUpdater.quitAndInstall(true, true);
    }
  });



  // Verificar al arrancar (solo en producción)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(err => {
        console.error("Error al conectar con IIS:", err);
    });

    // Buscar actualizaciones cada hora (3600000 ms)
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(console.error);
    }, 3600000);
  }
}

// Expuesto para polling si se requiere
ipcMain.on('checar-actualizaciones', () => {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(console.error);
  }
});

function showOrCreateWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else if (!mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    mainWindow.focus();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    show: true,
    title: 'Gestor Activos - IMSS',
    icon: !app.isPackaged
      ? path.join(__dirname, '../public/IMSS_logo_blanco.png')
      : path.join(__dirname, '../dist/IMSS_logo_blanco.png'),
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
  
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (line ${line})`);
  });

  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_NORMAL); } catch(e){}

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript('localStorage.clear();').finally(() => {
          mainWindow.destroy();
          mainWindow = null;
          try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch(e){}
        });
      }
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5200');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function createTray() {
  const iconPath = !app.isPackaged
    ? path.join(__dirname, '../public/IMSS_logo_blanco.png')
    : path.join(__dirname, '../dist/IMSS_logo_blanco.png');

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Mostrar aplicación', click: () => showOrCreateWindow() },
    { type: 'separator' },
    { 
      label: 'Salir', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);

  tray.setToolTip(`Gestor Activos - IMSS v${app.getVersion()}`);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => showOrCreateWindow());
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

      backendProcess.on('close', (code) => {
        if (!isQuitting) {
          console.error(`[Watchdog] Backend crasheó (código ${code}). Reiniciando en 5s...`);
          setTimeout(startBackend, 5000);
        }
      });
    });
  });
}

app.whenReady().then(() => {
  if (!gotTheLock) return;

  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
    args: ['--hidden']
  });

  startBackend();
  // NO crear ventana al inicio — el usuario la abre desde el tray
  createTray();
  setupAutoUpdater();
  startAutoSync();

  // macOS: al hacer click en el dock volver a abrir
  app.on('activate', () => showOrCreateWindow());
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
  // En lugar de app.quit(), la app sigue en segundo plano
  // No hacemos nada aqui
});

ipcMain.on('checar-actualizaciones', () => {
  if (app.isPackaged) {
    console.log('Verificación manual de actualizaciones solicitada.');
    autoUpdater.checkForUpdates().catch(console.error);
  }
});
