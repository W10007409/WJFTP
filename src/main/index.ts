import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import { registerFtpHandlers } from './ipc/ftpHandlers';
import { registerS3Handlers } from './ipc/s3Handlers';
import { registerFsHandlers } from './ipc/fsHandlers';
import { registerPurgeHandlers } from './ipc/purgeHandlers';
import { registerStoreHandlers } from './ipc/storeHandlers';
import { registerHistoryHandlers } from './ipc/historyHandlers';
import { initDatabase } from './db';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'WJFTP - CDN Upload Manager',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await initDatabase();
  registerFtpHandlers();
  registerS3Handlers();
  registerFsHandlers();
  registerPurgeHandlers();
  registerStoreHandlers();
  registerHistoryHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
