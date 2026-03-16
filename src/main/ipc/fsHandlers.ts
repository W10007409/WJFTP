import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function registerFsHandlers(): void {
  ipcMain.handle('fs:listDir', async (_event, dirPath: string) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = entries
        .filter(e => !e.name.startsWith('.'))
        .map(entry => {
          let size = 0;
          let modifiedAt: string | null = null;
          try {
            const stats = fs.statSync(path.join(dirPath, entry.name));
            size = stats.size;
            modifiedAt = stats.mtime.toISOString();
          } catch {
            // ignore stat errors
          }
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size,
            modifiedAt,
          };
        })
        .sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        });
      return { success: true, items, path: dirPath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:getDrives', async () => {
    if (process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        const output = execSync('wmic logicaldisk get name', { encoding: 'utf-8' });
        const drives = output.split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => /^[A-Z]:$/.test(l))
          .map((d: string) => d + '\\');
        return { success: true, drives };
      } catch {
        return { success: true, drives: ['C:\\'] };
      }
    }
    return { success: true, drives: ['/'] };
  });

  ipcMain.handle('fs:getHome', async () => {
    return { success: true, path: os.homedir() };
  });

  ipcMain.handle('fs:readFileContent', async (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:openFileDialog', async (_event, options: {
    directory?: boolean;
    multiple?: boolean;
    filters?: { name: string; extensions: string[] }[];
  }) => {
    const properties: ('openFile' | 'openDirectory' | 'multiSelections')[] = [];
    if (options.directory) {
      properties.push('openDirectory');
    } else {
      properties.push('openFile');
    }
    if (options.multiple) {
      properties.push('multiSelections');
    }

    const result = await dialog.showOpenDialog({
      properties,
      filters: options.filters,
    });

    return {
      success: !result.canceled,
      paths: result.filePaths,
    };
  });

  ipcMain.handle('fs:getFileInfo', async (_event, filePath: string) => {
    try {
      const stats = fs.statSync(filePath);
      return {
        success: true,
        info: {
          name: path.basename(filePath),
          path: filePath,
          size: stats.size,
          isDirectory: stats.isDirectory(),
          modifiedAt: stats.mtime.toISOString(),
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Delete a file or empty directory
  ipcMain.handle('fs:deleteFile', async (_event, filePath: string) => {
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Rename a file or directory
  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      fs.renameSync(oldPath, newPath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Create a directory
  ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:getAllFiles', async (_event, dirPath: string) => {
    try {
      const files: { localPath: string; relativePath: string }[] = [];
      function walk(dir: string, rel: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            walk(fullPath, relPath);
          } else {
            files.push({ localPath: fullPath, relativePath: relPath });
          }
        }
      }
      walk(dirPath, '');
      return { success: true, files };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
