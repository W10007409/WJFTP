import { ipcMain, safeStorage } from 'electron';
import Store from 'electron-store';

interface SkCdnConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

interface NaverCloudConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  cdnInstanceNo?: string;
  cdnDomain?: string;
  edgeProfileId?: string;
  edgeId?: string;
}

interface AppSettings {
  language: string;
  theme: 'dark' | 'light';
  skCdn: SkCdnConfig | null;
  naverCloud: NaverCloudConfig | null;
}

// Use 'any' cast because electron-store v10 type definitions
// don't properly expose inherited Conf get/set methods
const store: any = new Store({
  defaults: {
    language: 'ko',
    theme: 'dark',
    skCdn: null,
    naverCloud: null,
  },
});

function encryptString(text: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString('base64');
  }
  return Buffer.from(text).toString('base64');
}

function decryptString(encrypted: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }
  return Buffer.from(encrypted, 'base64').toString('utf-8');
}

export function registerStoreHandlers(): void {
  ipcMain.handle('store:get', async (_event, key: string) => {
    return (store as any).get(key);
  });

  ipcMain.handle('store:set', async (_event, key: string, value: any) => {
    (store as any).set(key, value);
    return { success: true };
  });

  ipcMain.handle('store:saveSkCdn', async (_event, config: SkCdnConfig) => {
    (store as any).set('skCdn', {
      host: config.host,
      port: config.port,
      user: config.user,
      password: encryptString(config.password),
    });
    return { success: true };
  });

  ipcMain.handle('store:getSkCdn', async () => {
    const config = (store as any).get('skCdn');
    if (!config) return null;
    try {
      return {
        ...config,
        password: decryptString(config.password),
      };
    } catch {
      return { ...config, password: '' };
    }
  });

  ipcMain.handle('store:saveNaverCloud', async (_event, config: NaverCloudConfig) => {
    (store as any).set('naverCloud', {
      endpoint: config.endpoint,
      region: config.region,
      bucket: config.bucket,
      accessKey: config.accessKey,
      secretKey: encryptString(config.secretKey),
      cdnInstanceNo: config.cdnInstanceNo || '',
      cdnDomain: config.cdnDomain || '',
      edgeProfileId: config.edgeProfileId || '',
      edgeId: config.edgeId || '',
    });
    return { success: true };
  });

  ipcMain.handle('store:getNaverCloud', async () => {
    const config = (store as any).get('naverCloud');
    if (!config) return null;
    try {
      return {
        ...config,
        secretKey: decryptString(config.secretKey),
      };
    } catch {
      return { ...config, secretKey: '' };
    }
  });

  ipcMain.handle('store:getTheme', async () => {
    return (store as any).get('theme');
  });

  ipcMain.handle('store:setTheme', async (_event, theme: 'dark' | 'light') => {
    (store as any).set('theme', theme);
    return { success: true };
  });

  ipcMain.handle('store:getLanguage', async () => {
    return (store as any).get('language');
  });

  ipcMain.handle('store:setLanguage', async (_event, language: string) => {
    (store as any).set('language', language as any);
    return { success: true };
  });
}
