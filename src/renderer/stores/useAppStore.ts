import { create } from 'zustand';

export type CdnType = 'SK-CDN' | 'NAVER';

export type TransferStatus = 'waiting' | 'uploading' | 'purging' | 'completed' | 'failed' | 'retrying';

export interface TransferItem {
  id: string;
  localPath: string;
  remotePath: string;
  originalName: string;
  uploadedName: string;
  fileSize: number;
  status: TransferStatus;
  progress: number;
  speed: number;
  error?: string;
  purgeStatus?: 'pending' | 'success' | 'failed';
  purgeError?: string;
  purgeUrls?: string[];
  retryCount: number;
  startTime?: number;
}

export interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string | null;
  permissions?: any;
  accessible?: boolean;
}

interface AppState {
  // CDN
  cdnType: CdnType;
  setCdnType: (type: CdnType) => void;

  // Connection
  connId: string | null;
  setConnId: (id: string | null) => void;
  connected: boolean;
  setConnected: (connected: boolean) => void;
  connecting: boolean;
  setConnecting: (connecting: boolean) => void;

  // Paths
  localPath: string;
  setLocalPath: (path: string) => void;
  remotePath: string;
  setRemotePath: (path: string) => void;

  // File lists
  localFiles: FileItem[];
  setLocalFiles: (files: FileItem[]) => void;
  remoteFiles: FileItem[];
  setRemoteFiles: (files: FileItem[]) => void;

  // Selection
  selectedLocalFiles: string[];
  setSelectedLocalFiles: (files: string[]) => void;
  selectedRemoteFiles: string[];
  setSelectedRemoteFiles: (files: string[]) => void;

  // Transfer queue
  transfers: TransferItem[];
  addTransfer: (item: TransferItem) => void;
  updateTransfer: (id: string, updates: Partial<TransferItem>) => void;
  removeTransfer: (id: string) => void;
  clearCompleted: () => void;

  // Theme / Language
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  language: string;
  setLanguage: (lang: string) => void;

  // Logs
  logs: { time: string; message: string; type: 'info' | 'error' | 'success' }[];
  addLog: (message: string, type?: 'info' | 'error' | 'success') => void;
  clearLogs: () => void;

  // UI
  activeTab: 'explorer' | 'history' | 'settings';
  setActiveTab: (tab: 'explorer' | 'history' | 'settings') => void;
}

export const useAppStore = create<AppState>((set) => ({
  cdnType: 'SK-CDN',
  setCdnType: (type) => set({ cdnType: type }),

  connId: null,
  setConnId: (id) => set({ connId: id }),
  connected: false,
  setConnected: (connected) => set({ connected }),
  connecting: false,
  setConnecting: (connecting) => set({ connecting }),

  localPath: '',
  setLocalPath: (path) => set({ localPath: path }),
  remotePath: '/',
  setRemotePath: (path) => set({ remotePath: path }),

  localFiles: [],
  setLocalFiles: (files) => set({ localFiles: files }),
  remoteFiles: [],
  setRemoteFiles: (files) => set({ remoteFiles: files }),

  selectedLocalFiles: [],
  setSelectedLocalFiles: (files) => set({ selectedLocalFiles: files }),
  selectedRemoteFiles: [],
  setSelectedRemoteFiles: (files) => set({ selectedRemoteFiles: files }),

  transfers: [],
  addTransfer: (item) => set((state) => ({ transfers: [...state.transfers, item] })),
  updateTransfer: (id, updates) =>
    set((state) => ({
      transfers: state.transfers.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTransfer: (id) => set((state) => ({ transfers: state.transfers.filter((t) => t.id !== id) })),
  clearCompleted: () =>
    set((state) => ({ transfers: state.transfers.filter((t) => t.status !== 'completed') })),

  theme: 'dark',
  setTheme: (theme) => set({ theme }),
  language: 'ko',
  setLanguage: (lang) => set({ language: lang }),

  logs: [],
  addLog: (message, type = 'info') =>
    set((state) => ({
      logs: [
        ...state.logs.slice(-200),
        { time: new Date().toLocaleTimeString(), message, type },
      ],
    })),
  clearLogs: () => set({ logs: [] }),

  activeTab: 'explorer',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
