import React, { useEffect, useCallback, useState, useRef } from 'react';
import { ConfigProvider, Tabs } from 'antd';
import {
  FolderOpenOutlined, HistoryOutlined, SettingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import './i18n';
import './styles/app.css';
import { darkTheme, lightTheme } from './styles/theme';
import { useAppStore, TransferItem } from './stores/useAppStore';
import { ConnectionBar } from './components/ConnectionBar';
import { FileExplorer } from './components/FileExplorer';
import { TransferQueue } from './components/TransferQueue';
import { LogPanel } from './components/LogPanel';
import { SettingsPage } from './pages/SettingsPage';
import { HistoryPage } from './pages/HistoryPage';

const MAX_RETRIES = 3;

// Source file extensions that need path parsing for purge
const SOURCE_EXTS = new Set([
  '.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.less', '.mjs',
]);

function toUpperPath(p: string): string {
  // Convert entire path + filename to uppercase for SK-CDN
  return p.split('/').map(segment => segment.toUpperCase()).join('/');
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const store = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const uploadQueue = useRef<TransferItem[]>([]);
  const processingRef = useRef(false);

  // Load saved settings
  useEffect(() => {
    (async () => {
      const savedTheme = await window.api.store.getTheme();
      if (savedTheme) store.setTheme(savedTheme as 'dark' | 'light');

      const savedLang = await window.api.store.getLanguage();
      if (savedLang) {
        store.setLanguage(savedLang);
        i18n.changeLanguage(savedLang);
      }
    })();
  }, []);

  // Upload progress listener - find transfer by localPath since id is random
  useEffect(() => {
    const unsubFtp = window.api.ftp.onUploadProgress((data) => {
      const transfer = useAppStore.getState().transfers.find(
        t => t.localPath === data.localPath && (t.status === 'uploading' || t.status === 'retrying')
      );
      if (transfer) {
        store.updateTransfer(transfer.id, {
          progress: data.percent,
          speed: data.bytes,
        });
      }
    });

    const unsubS3 = window.api.s3.onUploadProgress((data) => {
      const transfer = useAppStore.getState().transfers.find(
        t => t.localPath === data.localPath && (t.status === 'uploading' || t.status === 'retrying')
      );
      if (transfer) {
        store.updateTransfer(transfer.id, {
          progress: data.percent,
        });
      }
    });

    return () => { unsubFtp(); unsubS3(); };
  }, []);

  // Upload a single file
  const uploadFile = useCallback(async (
    localPath: string,
    remotePath: string,
    originalName: string,
    uploadedName: string,
    fileSize: number,
    transferId: string,
  ) => {
    const { connId, cdnType } = useAppStore.getState();
    if (!connId) return;

    store.updateTransfer(transferId, { status: 'uploading', startTime: Date.now() });
    store.addLog(`Uploading: ${originalName} → ${uploadedName}`, 'info');

    try {
      let result;
      if (cdnType === 'SK-CDN') {
        result = await window.api.ftp.upload(connId, localPath, remotePath);
      } else {
        result = await window.api.s3.upload(connId, localPath, remotePath);
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      store.updateTransfer(transferId, { progress: 100, status: 'purging' });
      store.addLog(`Upload complete: ${uploadedName}`, 'success');

      // Purge
      if (cdnType === 'SK-CDN') {
        // SK-CDN purge
        store.updateTransfer(transferId, { status: 'purging' });
        const ext = originalName.substring(originalName.lastIndexOf('.')).toLowerCase();

        let purgeResult;
        if (SOURCE_EXTS.has(ext)) {
          purgeResult = await window.api.purge.withSourceParsing(localPath, remotePath);
          store.addLog(`Source-parsed purge: ${purgeResult.results?.length || 0} URLs`, 'info');
        } else {
          purgeResult = await window.api.purge.file(remotePath);
        }

        // Collect URLs and check for individual failures
        let purgeUrls: string[];
        let allSuccess: boolean;

        if (purgeResult.results) {
          purgeUrls = purgeResult.results.map((r: any) => r.url);
          const failed = purgeResult.results.filter((r: any) => !r.success);
          allSuccess = failed.length === 0;
          for (const f of failed) {
            store.addLog(`Purge FAIL [${f.url}]: ${f.message}`, 'error');
          }
        } else {
          purgeUrls = [purgeResult.url];
          allSuccess = purgeResult.success;
          if (!purgeResult.success) {
            store.addLog(`Purge FAIL [${purgeResult.url}]: ${purgeResult.message}`, 'error');
          }
        }

        let purgeErrorMsg: string | undefined;
        if (!allSuccess) {
          const failedItems = purgeResult.results
            ? purgeResult.results.filter((r: any) => !r.success).map((r: any) => `${r.url}: ${r.message}`)
            : [`${purgeResult.url}: ${purgeResult.message}`];
          purgeErrorMsg = failedItems.join('\n');
        }

        store.updateTransfer(transferId, {
          status: 'completed',
          purgeStatus: allSuccess ? 'success' : 'failed',
          purgeError: purgeErrorMsg,
          purgeUrls,
        });

        store.addLog(
          allSuccess
            ? `Purge OK: ${uploadedName}`
            : `Purge FAIL: ${uploadedName} (상세 오류는 위 로그 참조)`,
          allSuccess ? 'success' : 'error'
        );
      } else {
        // Naver Cloud Global Edge purge (auto by bucket mapping)
        const naverConfig = await window.api.store.getNaverCloud();
        if (naverConfig?.accessKey && naverConfig?.secretKey) {
          store.updateTransfer(transferId, { status: 'purging' });

          // Extract bucket name and purge target from remotePath
          // remotePath format: /bucketName/folder/file.jpg
          const pathWithoutSlash = remotePath.replace(/^\//, '');
          const slashIdx = pathWithoutSlash.indexOf('/');
          const bucketName = slashIdx !== -1 ? pathWithoutSlash.substring(0, slashIdx) : pathWithoutSlash;
          const purgeTarget = slashIdx !== -1 ? pathWithoutSlash.substring(slashIdx) : `/${pathWithoutSlash}`;

          try {
            const purgeResult = await window.api.purge.globalEdgeByBucket({
              accessKey: naverConfig.accessKey,
              secretKey: naverConfig.secretKey,
              bucketName,
              targetFiles: [purgeTarget],
            });

            if (purgeResult.skipped) {
              // Bucket has no Edge mapping - just complete
              store.updateTransfer(transferId, { status: 'completed' });
              store.addLog(`No Edge mapping for bucket "${bucketName}" - skipped purge`, 'info');
            } else {
              const failed = purgeResult.results?.filter((r: any) => !r.success) || [];
              const allSuccess = purgeResult.success && failed.length === 0;
              const purgeUrls = purgeResult.results?.map((r: any) => r.url) || [purgeTarget];

              for (const f of failed) {
                store.addLog(`Purge FAIL [${f.url}]: ${f.message}`, 'error');
              }

              store.updateTransfer(transferId, {
                status: 'completed',
                purgeStatus: allSuccess ? 'success' : 'failed',
                purgeError: allSuccess ? undefined : (purgeResult.error || failed.map((f: any) => f.message).join('\n')),
                purgeUrls,
              });

              store.addLog(
                allSuccess
                  ? `Global Edge Purge OK: ${uploadedName} (${purgeUrls.length} edge(s))`
                  : `Global Edge Purge FAIL: ${uploadedName}`,
                allSuccess ? 'success' : 'error'
              );
            }
          } catch (purgeErr: any) {
            store.updateTransfer(transferId, {
              status: 'completed',
              purgeStatus: 'failed',
              purgeError: purgeErr.message,
            });
            store.addLog(`Global Edge Purge FAIL: ${purgeErr.message}`, 'error');
          }
        } else {
          // No Naver Cloud credentials - just mark completed
          store.updateTransfer(transferId, { status: 'completed' });
        }
      }

      // Save to history
      const finalTransfer = useAppStore.getState().transfers.find(t => t.id === transferId);
      await window.api.history.add({
        cdn_type: cdnType,
        local_path: localPath,
        remote_path: remotePath,
        original_filename: originalName,
        uploaded_filename: uploadedName,
        file_size: fileSize,
        status: 'success',
        purge_status: finalTransfer?.purgeStatus || null,
        purge_urls: JSON.stringify(finalTransfer?.purgeUrls || []),
      });

    } catch (err: any) {
      const currentItem = useAppStore.getState().transfers.find(t => t.id === transferId);
      const retryCount = (currentItem?.retryCount || 0) + 1;

      // Skip retry for unrecoverable errors (locked files, permission denied)
      const noRetryErrors = ['EBUSY', 'EPERM', 'EACCES', 'EISDIR'];
      const isUnrecoverable = noRetryErrors.some(code => err.message?.includes(code));

      if (!isUnrecoverable && retryCount <= MAX_RETRIES) {
        store.updateTransfer(transferId, {
          status: 'retrying',
          retryCount,
          error: err.message,
        });
        store.addLog(`Retry ${retryCount}/${MAX_RETRIES}: ${originalName} - ${err.message}`, 'error');

        // Wait 2 seconds then retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        await uploadFile(localPath, remotePath, originalName, uploadedName, fileSize, transferId);
      } else {
        store.updateTransfer(transferId, {
          status: 'failed',
          error: err.message,
          retryCount,
        });
        store.addLog(`Failed: ${originalName} - ${err.message}`, 'error');

        await window.api.history.add({
          cdn_type: useAppStore.getState().cdnType,
          local_path: localPath,
          remote_path: remotePath,
          original_filename: originalName,
          uploaded_filename: uploadedName,
          file_size: fileSize,
          status: 'failed',
          error_message: err.message,
        });
      }
    }
  }, []);

  // Process upload queue
  const processUploads = useCallback(async (items: {
    localPath: string;
    relativePath: string;
    fileSize: number;
  }[]) => {
    const { remotePath, cdnType } = useAppStore.getState();

    // Create transfer items
    const transferItems: TransferItem[] = items.map(item => {
      const originalName = item.relativePath.split('/').pop() || item.relativePath;
      const remoteFull = cdnType === 'SK-CDN'
        ? toUpperPath(`${remotePath.replace(/\/$/, '')}/${item.relativePath}`)
        : `${remotePath.replace(/\/$/, '')}/${item.relativePath}`;
      const uploadedName = cdnType === 'SK-CDN'
        ? item.relativePath.toUpperCase()
        : item.relativePath;

      const id = generateId();
      return {
        id,
        localPath: item.localPath,
        remotePath: remoteFull,
        originalName: item.relativePath,
        uploadedName,
        fileSize: item.fileSize,
        status: 'waiting' as const,
        progress: 0,
        speed: 0,
        retryCount: 0,
      };
    });

    // Add all to queue
    transferItems.forEach(item => store.addTransfer(item));

    // Upload sequentially (FTP only supports one operation at a time per connection)
    for (const item of transferItems) {
      await uploadFile(item.localPath, item.remotePath, item.originalName, item.uploadedName, item.fileSize, item.id);
    }

    // After all uploads, do batch purge for SK-CDN
    if (cdnType === 'SK-CDN') {
      const completedPaths = useAppStore.getState().transfers
        .filter(t => t.status === 'completed')
        .map(t => t.remotePath);

      if (completedPaths.length > 0) {
        store.addLog(`Batch purge: ${completedPaths.length} files`, 'info');
        const batchResult = await window.api.purge.batch(completedPaths);
        if (batchResult?.results) {
          const purged = batchResult.results.filter((r: any) => r.success && !r.skipped);
          const skipped = batchResult.results.filter((r: any) => r.skipped);
          const failed = batchResult.results.filter((r: any) => !r.success);
          const parts = [];
          if (purged.length > 0) parts.push(`${purged.length} purged`);
          if (skipped.length > 0) parts.push(`${skipped.length} skipped`);
          if (failed.length > 0) parts.push(`${failed.length} failed`);
          store.addLog(`Batch purge: ${parts.join(', ')}`, failed.length > 0 ? 'error' : 'success');
        } else {
          store.addLog('Batch purge completed', 'success');
        }
      }
    }

    // Refresh remote file list
    const { connId: currentConnId, cdnType: currentCdn } = useAppStore.getState();
    if (currentConnId) {
      const api = currentCdn === 'SK-CDN' ? window.api.ftp : window.api.s3;
      const listResult = await api.list(currentConnId, useAppStore.getState().remotePath);
      if (listResult.success) {
        store.setRemoteFiles(listResult.items);
      }
    }
  }, [uploadFile]);

  // Listen for upload events from FileExplorer
  useEffect(() => {
    const handleUpload = async (e: CustomEvent) => {
      const { files: selectedNames, localPath } = e.detail;
      const items: { localPath: string; relativePath: string; fileSize: number }[] = [];

      for (const name of selectedNames) {
        const sep = localPath.includes('\\') ? '\\' : '/';
        const fullPath = `${localPath}${sep}${name}`;
        const info = await window.api.fs.getFileInfo(fullPath);

        if (info.success) {
          if (info.info.isDirectory) {
            // Get all files in directory
            const allFiles = await window.api.fs.getAllFiles(fullPath);
            if (allFiles.success) {
              for (const f of allFiles.files) {
                const fInfo = await window.api.fs.getFileInfo(f.localPath);
                items.push({
                  localPath: f.localPath,
                  relativePath: `${name}/${f.relativePath}`,
                  fileSize: fInfo.success ? fInfo.info.size : 0,
                });
              }
            }
          } else {
            items.push({
              localPath: fullPath,
              relativePath: name,
              fileSize: info.info.size,
            });
          }
        }
      }

      if (items.length > 0) {
        processUploads(items);
      }
    };

    const handleUploadFiles = async (e: CustomEvent) => {
      const { paths } = e.detail;
      const items: { localPath: string; relativePath: string; fileSize: number }[] = [];

      for (const p of paths) {
        const info = await window.api.fs.getFileInfo(p);
        if (info.success) {
          items.push({
            localPath: p,
            relativePath: info.info.name,
            fileSize: info.info.size,
          });
        }
      }

      if (items.length > 0) processUploads(items);
    };

    const handleRetry = (e: CustomEvent) => {
      const item = useAppStore.getState().transfers.find(t => t.id === e.detail.id);
      if (item) {
        store.updateTransfer(item.id, { retryCount: 0, status: 'waiting', progress: 0, error: undefined });
        uploadFile(item.localPath, item.remotePath, item.originalName, item.uploadedName, item.fileSize, item.id);
      }
    };

    window.addEventListener('wjftp:upload', handleUpload as any);
    window.addEventListener('wjftp:upload-files', handleUploadFiles as any);
    window.addEventListener('wjftp:retry', handleRetry as any);

    return () => {
      window.removeEventListener('wjftp:upload', handleUpload as any);
      window.removeEventListener('wjftp:upload-files', handleUploadFiles as any);
      window.removeEventListener('wjftp:retry', handleRetry as any);
    };
  }, [processUploads, uploadFile]);

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (!store.connected) return;

    const files = Array.from(e.dataTransfer.files);
    const items: { localPath: string; relativePath: string; fileSize: number }[] = [];

    for (const file of files) {
      // Use webUtils.getPathForFile for Electron contextIsolation compatibility
      const fullPath = (window as any).electronUtils?.getPathForFile?.(file) || (file as any).path;
      if (!fullPath) continue;

      const info = await window.api.fs.getFileInfo(fullPath);
      if (info.success) {
        if (info.info.isDirectory) {
          const allFiles = await window.api.fs.getAllFiles(fullPath);
          if (allFiles.success) {
            for (const f of allFiles.files) {
              const fInfo = await window.api.fs.getFileInfo(f.localPath);
              items.push({
                localPath: f.localPath,
                relativePath: `${info.info.name}/${f.relativePath}`,
                fileSize: fInfo.success ? fInfo.info.size : 0,
              });
            }
          }
        } else {
          items.push({
            localPath: fullPath,
            relativePath: info.info.name,
            fileSize: info.info.size,
          });
        }
      }
    }

    if (items.length > 0) processUploads(items);
  };

  const themeConfig = store.theme === 'dark' ? darkTheme : lightTheme;

  const tabItems = [
    {
      key: 'explorer',
      label: <span><FolderOpenOutlined /> {t('fileExplorer.localFiles')}</span>,
      children: null,
    },
    {
      key: 'history',
      label: <span><HistoryOutlined /> {t('history.title')}</span>,
      children: null,
    },
    {
      key: 'settings',
      label: <span><SettingOutlined /> {t('settings.title')}</span>,
      children: null,
    },
  ];

  return (
    <ConfigProvider theme={themeConfig}>
      <div
        className="app-layout"
        data-theme={store.theme}
        style={{
          background: store.theme === 'dark' ? '#181825' : '#f5f5f5',
          color: store.theme === 'dark' ? '#e0e0e0' : '#333',
          ['--border-color' as any]: store.theme === 'dark' ? '#303040' : '#d9d9d9',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ConnectionBar />

        <div className="nav-tabs">
          <Tabs
            activeKey={store.activeTab}
            onChange={(key) => store.setActiveTab(key as any)}
            items={tabItems}
            size="small"
          />
        </div>

        {store.activeTab === 'explorer' && (
          <>
            <div className="explorer-container">
              <FileExplorer side="local" />
              <FileExplorer side="remote" />
            </div>
            <TransferQueue />
            <LogPanel />
          </>
        )}

        {store.activeTab === 'history' && <HistoryPage />}
        {store.activeTab === 'settings' && <SettingsPage />}

        {isDragging && store.connected && (
          <div className="drop-overlay">
            {t('fileExplorer.dragDropHint')}
          </div>
        )}
      </div>
    </ConfigProvider>
  );
};
