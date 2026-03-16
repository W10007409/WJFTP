import { ipcMain, app, shell } from 'electron';
import * as ftp from 'basic-ftp';
import path from 'path';
import fs from 'fs';

interface FtpConnection {
  client: ftp.Client;
  host: string;
  connected: boolean;
}

const connections: Map<string, FtpConnection> = new Map();

function getConnectionId(host: string, user: string): string {
  return `${user}@${host}`;
}

export function registerFtpHandlers(): void {
  ipcMain.handle('ftp:connect', async (_event, config: {
    host: string;
    port: number;
    user: string;
    password: string;
  }) => {
    const connId = getConnectionId(config.host, config.user);
    const existing = connections.get(connId);
    if (existing?.connected) {
      existing.client.close();
    }

    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
      await client.access({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        secure: false,
      });

      connections.set(connId, { client, host: config.host, connected: true });
      return { success: true, connId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ftp:disconnect', async (_event, connId: string) => {
    const conn = connections.get(connId);
    if (conn) {
      conn.client.close();
      conn.connected = false;
      connections.delete(connId);
    }
    return { success: true };
  });

  ipcMain.handle('ftp:list', async (_event, connId: string, remotePath: string) => {
    const conn = connections.get(connId);
    if (!conn?.connected) return { success: false, error: 'Not connected' };

    try {
      const list = await conn.client.list(remotePath);
      return {
        success: true,
        items: list.map(item => ({
          name: item.name,
          type: item.type === ftp.FileType.Directory ? 'directory' : 'file',
          size: item.size,
          modifiedAt: item.modifiedAt?.toISOString() || null,
          permissions: item.permissions,
        })),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ftp:upload', async (event, connId: string, localPath: string, remotePath: string) => {
    const conn = connections.get(connId);
    if (!conn?.connected) return { success: false, error: 'Not connected' };

    try {
      const fileSize = fs.statSync(localPath).size;
      let uploaded = 0;

      conn.client.trackProgress(info => {
        uploaded = info.bytes;
        event.sender.send('ftp:upload-progress', {
          localPath,
          remotePath,
          bytes: info.bytes,
          total: fileSize,
          percent: fileSize > 0 ? Math.round((info.bytes / fileSize) * 100) : 0,
        });
      });

      // Ensure remote directory exists
      const remoteDir = path.posix.dirname(remotePath);
      await conn.client.ensureDir(remoteDir);
      await conn.client.cd('/'); // reset to root after ensureDir

      await conn.client.uploadFrom(localPath, remotePath);
      conn.client.trackProgress(); // stop tracking

      return { success: true, remotePath };
    } catch (err: any) {
      conn.client.trackProgress();
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ftp:delete', async (_event, connId: string, remotePath: string) => {
    const conn = connections.get(connId);
    if (!conn?.connected) return { success: false, error: 'Not connected' };

    try {
      await conn.client.remove(remotePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ftp:deleteDir', async (_event, connId: string, remotePath: string) => {
    const conn = connections.get(connId);
    if (!conn?.connected) return { success: false, error: 'Not connected' };

    try {
      await conn.client.removeDir(remotePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ftp:rename', async (_event, connId: string, oldPath: string, newPath: string) => {
    const conn = connections.get(connId);
    if (!conn?.connected) return { success: false, error: 'Not connected' };

    try {
      await conn.client.rename(oldPath, newPath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ftp:mkdir', async (_event, connId: string, remotePath: string) => {
    const conn = connections.get(connId);
    if (!conn?.connected) return { success: false, error: 'Not connected' };

    try {
      await conn.client.ensureDir(remotePath);
      await conn.client.cd('/');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ftp:pwd', async (_event, connId: string) => {
    const conn = connections.get(connId);
    if (!conn?.connected) return { success: false, error: 'Not connected' };

    try {
      const pwd = await conn.client.pwd();
      return { success: true, path: pwd };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Download file from FTP to local path (used for backup before delete)
  ipcMain.handle('ftp:download', async (_event, connId: string, remotePath: string, localPath: string) => {
    const conn = connections.get(connId);
    if (!conn?.connected) return { success: false, error: 'Not connected' };

    try {
      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      fs.mkdirSync(localDir, { recursive: true });

      await conn.client.downloadTo(localPath, remotePath);
      return { success: true, localPath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Get backup directory path
  ipcMain.handle('ftp:getBackupDir', async () => {
    const backupDir = path.join(app.getPath('userData'), 'ftp-backup');
    fs.mkdirSync(backupDir, { recursive: true });
    return { success: true, path: backupDir };
  });

  // Open backup directory in file explorer
  ipcMain.handle('ftp:openBackupDir', async () => {
    const backupDir = path.join(app.getPath('userData'), 'ftp-backup');
    fs.mkdirSync(backupDir, { recursive: true });
    await shell.openPath(backupDir);
    return { success: true };
  });
}
