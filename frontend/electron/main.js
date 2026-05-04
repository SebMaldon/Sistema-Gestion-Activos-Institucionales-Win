import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Gestor Activos - IMSS',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // In development, load from Vite dev server. In production, load the static build.
  const isDev = !app.isPackaged;
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:5200');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function startBackend() {
  const isDev = !app.isPackaged;
  
  // The path to the C# exe
  let exePath;
  if (isDev) {
    exePath = path.join(__dirname, '../../GestorActivosHardware/bin/Debug/net10.0-windows/GestorActivosHardware.exe');
  } else {
    // In production, you would configure electron-builder to copy the backend exe into the resources folder
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
