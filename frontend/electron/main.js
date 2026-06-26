import { app, BrowserWindow, dialog, ipcMain, Tray, Menu, nativeImage } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
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
let tray = null;
let isQuitting = false;
let userRequestedUpdate = false; // true solo si el usuario clickeó descargar
let initialUpdateCheckDone = false; // true cuando el primer check ya terminó
let pendingShowWindow = false;    // si el usuario hizo click antes de que terminara el check

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
    // Si la ventana está visible, notificar y esperar confirmación del usuario
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      sendToRenderer('update-available', info.version);
    } else {
      // Si está oculta en tray, descargar silenciosamente con un Jitter de 30m a 6h
      // para no saturar la red descargando el .exe pesado todos a la vez.
      const downloadJitter = Math.floor(Math.random() * (21600000 - 1800000 + 1)) + 1800000;
      console.log(`Actualización en background detectada. Esperando ${downloadJitter / 60000} minutos para iniciar descarga...`);
      setTimeout(() => {
        console.log('Iniciando descarga retrasada en background...');
        autoUpdater.downloadUpdate();
      }, downloadJitter);
    }
  });

  ipcMain.on('descargar-actualizacion', () => {
    console.log('Usuario solicitó descargar actualización...');
    userRequestedUpdate = true;
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
    console.log('Actualización descargada. Instalando y reiniciando...');
    sendToRenderer('update-downloaded', true);
    // Marcar reinicio si el usuario lo pidió
    if (userRequestedUpdate) {
      require('fs').writeFileSync(path.join(app.getPath('userData'), '.update-restart'), '1');
    }
    // Cerrar e instalar de inmediato sin el segundo popup, ya que el usuario ya confirmó o estaba en background
    autoUpdater.quitAndInstall(true, true);
  });



  // Ciclo de 3 horas para revisar si hay actualizaciones (.yml ligero)
  setInterval(() => {
    if (app.isPackaged) {
      console.log('Revisión cíclica de 3 horas...');
      autoUpdater.checkForUpdates().catch(console.error);
    }
  }, 10800000); // 3 horas

  // Revisión inicial (inmediata, pues el jitter pesado está en la descarga)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(console.error);
  }

  // Marcar como listo de inmediato para no bloquear la pantalla inicial
  initialUpdateCheckDone = true;
}

// Expuesto para polling si se requiere
ipcMain.on('checar-actualizaciones', () => {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(console.error);
  }
});

function _doShowOrCreateWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else if (!mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    mainWindow.focus();
  }
}

function showOrCreateWindow() {
  if (!initialUpdateCheckDone) {
    // El check de inicio aún no termina; encolar para cuando termine
    console.log('Check de actualización en curso, esperando antes de abrir ventana...');
    pendingShowWindow = true;
    return;
  }
  _doShowOrCreateWindow();
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
  
  if (process.env.VITE_SHOW_DEVTOOLS === 'true') {
    mainWindow.webContents.openDevTools();
  }
  
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


app.whenReady().then(() => {
  if (!gotTheLock) return;

  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
    args: ['--hidden']
  });

  createTray();
  setupAutoUpdater();

  // Si reiniciamos desde una actualización, mostrar ventana
  const fs = require('fs');
  const updateRestartFlag = path.join(app.getPath('userData'), '.update-restart');
  if (fs.existsSync(updateRestartFlag)) {
    try { fs.unlinkSync(updateRestartFlag); } catch(e) {}
    showOrCreateWindow();
  }
  // Si no es reinicio post-update: no abrir ventana (queda en tray)

  // macOS: al hacer click en el dock volver a abrir
  app.on('activate', () => showOrCreateWindow());
});

app.on('before-quit', () => {
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
