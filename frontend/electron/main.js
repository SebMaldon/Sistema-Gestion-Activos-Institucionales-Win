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
    
    // Escribir bandera para iniciar oculto tras actualizar
    require('fs').writeFileSync(path.join(app.getPath('userData'), '.update-restart'), '1');
    
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

function createWindow() {
  const fs = require('fs');
  const flagPath = path.join(app.getPath('userData'), '.update-restart');
  let startHidden = false;
  if (fs.existsSync(flagPath)) {
    startHidden = true;
    fs.unlinkSync(flagPath);
  }

  if (process.argv.includes('--hidden')) {
    startHidden = true;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    show: !startHidden,
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
  
  // Quitar modo eficiencia al abrir
  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_NORMAL); } catch(e){}
  
  if (startHidden) {
    mainWindow.destroy();
    mainWindow = null;
    try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch(e){}
    return;
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
        mainWindow = null;
        // Entrar a modo eficiencia (Hojita Verde) al cerrar
        try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch(e){}
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
    { label: 'Mostrar aplicación', click: () => mainWindow?.show() },
    { type: 'separator' },
    { 
      label: 'Salir', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);

  tray.setToolTip('Gestor Activos - IMSS');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.destroy();
      mainWindow = null;
      try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch(e){}
    } else {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
      } else {
        mainWindow.show();
      }
    }
  });
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
  const gotTheLock = app.requestSingleInstanceLock();
  
  if (!gotTheLock) {
    app.quit();
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
    args: [
      '--hidden'
    ]
  });

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Alguien intentó abrir otra instancia. Enfocar nuestra ventana.
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  startBackend();
  createWindow();
  createTray();
  setupAutoUpdater();
  startAutoSync();

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
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
  // En lugar de app.quit(), la app sigue en segundo plano
  // No hacemos nada aqui
});
