import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  // FTP
  ftp: {
    connect: (config: any) => ipcRenderer.invoke('ftp:connect', config),
    disconnect: (connId: string) => ipcRenderer.invoke('ftp:disconnect', connId),
    list: (connId: string, path: string) => ipcRenderer.invoke('ftp:list', connId, path),
    upload: (connId: string, localPath: string, remotePath: string) =>
      ipcRenderer.invoke('ftp:upload', connId, localPath, remotePath),
    delete: (connId: string, path: string) => ipcRenderer.invoke('ftp:delete', connId, path),
    deleteDir: (connId: string, path: string) => ipcRenderer.invoke('ftp:deleteDir', connId, path),
    rename: (connId: string, oldPath: string, newPath: string) =>
      ipcRenderer.invoke('ftp:rename', connId, oldPath, newPath),
    mkdir: (connId: string, path: string) => ipcRenderer.invoke('ftp:mkdir', connId, path),
    pwd: (connId: string) => ipcRenderer.invoke('ftp:pwd', connId),
    download: (connId: string, remotePath: string, localPath: string) =>
      ipcRenderer.invoke('ftp:download', connId, remotePath, localPath),
    getBackupDir: () => ipcRenderer.invoke('ftp:getBackupDir'),
    openBackupDir: () => ipcRenderer.invoke('ftp:openBackupDir'),
    onUploadProgress: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('ftp:upload-progress', handler);
      return () => ipcRenderer.removeListener('ftp:upload-progress', handler);
    },
  },

  // S3
  s3: {
    connect: (config: any) => ipcRenderer.invoke('s3:connect', config),
    disconnect: (connId: string) => ipcRenderer.invoke('s3:disconnect', connId),
    list: (connId: string, prefix: string) => ipcRenderer.invoke('s3:list', connId, prefix),
    upload: (connId: string, localPath: string, remotePath: string) =>
      ipcRenderer.invoke('s3:upload', connId, localPath, remotePath),
    delete: (connId: string, path: string) => ipcRenderer.invoke('s3:delete', connId, path),
    rename: (connId: string, oldPath: string, newPath: string) =>
      ipcRenderer.invoke('s3:rename', connId, oldPath, newPath),
    onUploadProgress: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('s3:upload-progress', handler);
      return () => ipcRenderer.removeListener('s3:upload-progress', handler);
    },
  },

  // Local filesystem
  fs: {
    listDir: (path: string) => ipcRenderer.invoke('fs:listDir', path),
    getDrives: () => ipcRenderer.invoke('fs:getDrives'),
    getHome: () => ipcRenderer.invoke('fs:getHome'),
    readFileContent: (path: string) => ipcRenderer.invoke('fs:readFileContent', path),
    openFileDialog: (options: any) => ipcRenderer.invoke('fs:openFileDialog', options),
    getFileInfo: (path: string) => ipcRenderer.invoke('fs:getFileInfo', path),
    getAllFiles: (dirPath: string) => ipcRenderer.invoke('fs:getAllFiles', dirPath),
    deleteFile: (path: string) => ipcRenderer.invoke('fs:deleteFile', path),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    mkdir: (dirPath: string) => ipcRenderer.invoke('fs:mkdir', dirPath),
  },

  // Purge
  purge: {
    file: (ftpPath: string) => ipcRenderer.invoke('purge:file', ftpPath),
    batch: (ftpPaths: string[]) => ipcRenderer.invoke('purge:batch', ftpPaths),
    withSourceParsing: (localPath: string, ftpPath: string) =>
      ipcRenderer.invoke('purge:withSourceParsing', localPath, ftpPath),
    getCdnUrl: (ftpPath: string) => ipcRenderer.invoke('purge:getCdnUrl', ftpPath),
    naverCloud: (config: {
      accessKey: string;
      secretKey: string;
      cdnInstanceNo: string;
      targetFiles: string[];
      cdnDomain?: string;
    }) => ipcRenderer.invoke('purge:naverCloud', config),
    globalEdge: (config: {
      accessKey: string;
      secretKey: string;
      profileId: string;
      edgeId: string;
      targetFiles: string[];
    }) => ipcRenderer.invoke('purge:globalEdge', config),
    globalEdgeByBucket: (config: {
      accessKey: string;
      secretKey: string;
      bucketName: string;
      targetFiles: string[];
    }) => ipcRenderer.invoke('purge:globalEdgeByBucket', config),
  },

  // Settings store
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    saveSkCdn: (config: any) => ipcRenderer.invoke('store:saveSkCdn', config),
    getSkCdn: () => ipcRenderer.invoke('store:getSkCdn'),
    saveNaverCloud: (config: any) => ipcRenderer.invoke('store:saveNaverCloud', config),
    getNaverCloud: () => ipcRenderer.invoke('store:getNaverCloud'),
    getTheme: () => ipcRenderer.invoke('store:getTheme'),
    setTheme: (theme: string) => ipcRenderer.invoke('store:setTheme', theme),
    getLanguage: () => ipcRenderer.invoke('store:getLanguage'),
    setLanguage: (lang: string) => ipcRenderer.invoke('store:setLanguage', lang),
  },

  // History
  history: {
    add: (record: any) => ipcRenderer.invoke('history:add', record),
    update: (id: number, updates: any) => ipcRenderer.invoke('history:update', id, updates),
    list: (options: any) => ipcRenderer.invoke('history:list', options),
    get: (id: number) => ipcRenderer.invoke('history:get', id),
    delete: (id: number) => ipcRenderer.invoke('history:delete', id),
    clear: () => ipcRenderer.invoke('history:clear'),
    stats: () => ipcRenderer.invoke('history:stats'),
  },
};

contextBridge.exposeInMainWorld('api', api);

// Expose webUtils for drag & drop file path resolution
contextBridge.exposeInMainWorld('electronUtils', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
});

export type ApiType = typeof api;
