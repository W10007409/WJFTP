import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { Table, Button, Input, Space, Tooltip, Modal, message } from 'antd';
import {
  FolderOutlined, FileOutlined, HomeOutlined, ArrowUpOutlined,
  ReloadOutlined, FolderAddOutlined, DeleteOutlined, EditOutlined,
  UploadOutlined, FileAddOutlined, SearchOutlined, CloseCircleOutlined,
  CopyOutlined, FolderOpenOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppStore, FileItem } from '../stores/useAppStore';

interface FileExplorerProps {
  side: 'local' | 'remote';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getFileExtIcon(name: string, type: string) {
  if (type === 'directory') return <FolderOutlined style={{ color: '#f0c040' }} />;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const colors: Record<string, string> = {
    html: '#e44d26', htm: '#e44d26', css: '#264de4', js: '#f7df1e',
    ts: '#3178c6', tsx: '#61dafb', jsx: '#61dafb', json: '#5b8c00',
    png: '#13c2c2', jpg: '#13c2c2', gif: '#13c2c2', svg: '#13c2c2',
    mp4: '#722ed1', mp3: '#722ed1', pdf: '#cf1322',
  };
  return <FileOutlined style={{ color: colors[ext] || '#888' }} />;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ side }) => {
  const { t } = useTranslation();
  const store = useAppStore();
  const isLocal = side === 'local';

  const currentPath = isLocal ? store.localPath : store.remotePath;
  const setPath = isLocal ? store.setLocalPath : store.setRemotePath;
  const files = isLocal ? store.localFiles : store.remoteFiles;
  const setFiles = isLocal ? store.setLocalFiles : store.setRemoteFiles;
  const selected = isLocal ? store.selectedLocalFiles : store.selectedRemoteFiles;
  const setSelected = isLocal ? store.setSelectedLocalFiles : store.setSelectedRemoteFiles;

  const [pathInput, setPathInput] = useState(currentPath);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [focusedFile, setFocusedFile] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const keyBufferRef = useRef('');
  const keyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigation history for mouse back button
  const historyRef = useRef<string[]>([]);

  // Last clicked index for shift+click range selection
  const lastClickedIndexRef = useRef<number>(-1);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; record: FileItem } | null>(null);

  // Busy flag to prevent concurrent FTP operations
  const busyRef = useRef(false);

  useEffect(() => {
    setPathInput(currentPath);
  }, [currentPath]);

  // Filter files by search text
  const filteredFiles = useMemo(() => {
    if (!searchText) return files;
    const lower = searchText.toLowerCase();
    return files.filter(f => f.name.toLowerCase().includes(lower));
  }, [files, searchText]);

  // Clear search and focus when navigating
  useEffect(() => {
    setSearchText('');
    setFocusedFile(null);
  }, [currentPath]);

  const loadFiles = useCallback(async (dirPath: string, addToHistory = true) => {
    // Prevent concurrent FTP operations on remote panel
    if (!isLocal && busyRef.current) return;
    setLoading(true);
    if (!isLocal) busyRef.current = true;
    try {
      if (isLocal) {
        const result = await window.api.fs.listDir(dirPath);
        if (result.success) {
          if (addToHistory && currentPath && currentPath !== dirPath) {
            historyRef.current.push(currentPath);
          }
          setFiles(result.items);
          setPath(dirPath);
          setSelected([]);
        }
      } else {
        if (!store.connected || !store.connId) return;
        const api = store.cdnType === 'SK-CDN' ? window.api.ftp : window.api.s3;
        const result = await api.list(store.connId, dirPath);
        if (result.success) {
          if (addToHistory && currentPath && currentPath !== dirPath) {
            historyRef.current.push(currentPath);
          }
          setFiles(result.items);
          setPath(dirPath);
          setSelected([]);
        } else {
          message.error(result.error);
        }
      }
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
      if (!isLocal) busyRef.current = false;
    }
  }, [isLocal, store.connected, store.connId, store.cdnType, setFiles, setPath, setSelected, currentPath]);

  // Mouse back button (button 3) for directory navigation
  useEffect(() => {
    const container = tableContainerRef.current?.closest('.file-panel');
    if (!container) return;

    const handleMouseDown = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      if (mouseEvent.button === 3) {
        e.preventDefault();
        if (!isLocal && busyRef.current) return; // skip if busy
        const prev = historyRef.current.pop();
        if (prev) {
          loadFiles(prev, false);
        }
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    return () => container.removeEventListener('mousedown', handleMouseDown);
  }, [loadFiles, isLocal]);

  // Initial load
  useEffect(() => {
    if (isLocal && !currentPath) {
      window.api.fs.getHome().then((r: any) => {
        if (r.success) loadFiles(r.path, false);
      });
    }
  }, [isLocal, currentPath, loadFiles]);

  // Reload remote when connection changes
  useEffect(() => {
    if (!isLocal && store.connected && store.connId) {
      loadFiles(store.remotePath || '/', false);
    }
  }, [isLocal, store.connected, store.connId]);

  const navigateUp = () => {
    if (isLocal) {
      const sep = currentPath.includes('\\') ? '\\' : '/';
      const parts = currentPath.split(sep).filter(Boolean);
      if (parts.length <= 1) {
        if (currentPath.match(/^[A-Z]:\\/i)) {
          loadFiles(currentPath.substring(0, 3));
        }
        return;
      }
      parts.pop();
      const parent = parts.join(sep) + (currentPath.startsWith('/') ? '' : sep);
      loadFiles(currentPath.startsWith('/') ? '/' + parent : parent);
    } else {
      const parts = currentPath.split('/').filter(Boolean);
      parts.pop();
      loadFiles('/' + parts.join('/') + (parts.length ? '/' : ''));
    }
  };

  const handleDoubleClick = (record: FileItem) => {
    if (record.type === 'directory') {
      // Block access to locked buckets
      if (record.accessible === false) {
        message.warning(t('fileExplorer.noAccess'));
        return;
      }
      // Strip lock icon prefix if present
      const cleanName = record.name.replace(/^🔒\s*/, '');
      const sep = isLocal && currentPath.includes('\\') ? '\\' : '/';
      const newPath = isLocal
        ? `${currentPath.replace(/[\\/]$/, '')}${sep}${cleanName}`
        : `${currentPath.replace(/\/$/, '')}/${cleanName}/`;
      loadFiles(newPath);
    }
  };

  // Backup files from FTP before deleting
  const backupAndDelete = async (names: string[]) => {
    if (!store.connId) return;
    busyRef.current = true;
    try {
      const backupResult = await window.api.ftp.getBackupDir();
      if (!backupResult.success) {
        message.error('Failed to get backup directory');
        return;
      }
      const backupBase = backupResult.path;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

      for (const name of names) {
        const item = files.find(f => f.name === name);
        const remoteFull = `${currentPath.replace(/\/$/, '')}/${name}`;

        if (item?.type === 'directory') {
          await window.api.ftp.deleteDir(store.connId, remoteFull);
          store.addLog(`Deleted directory: ${name}`, 'info');
        } else {
          const backupPath = `${backupBase}/${timestamp}${currentPath.replace(/\/$/, '')}/${name}`.replace(/\\/g, '/');
          const dlResult = await window.api.ftp.download(store.connId, remoteFull, backupPath);
          if (dlResult.success) {
            store.addLog(`Backed up: ${name} → ${backupPath}`, 'info');
            await window.api.ftp.delete(store.connId, remoteFull);
            store.addLog(`Deleted: ${name}`, 'info');
          } else {
            store.addLog(`Backup failed for ${name}: ${dlResult.error}`, 'error');
            message.error(`${t('fileExplorer.backupFailed')}: ${name}`);
          }
        }
      }
    } finally {
      busyRef.current = false;
    }
    loadFiles(currentPath);
  };

  const handleDelete = async (targetNames?: string[]) => {
    const names = targetNames || selected;
    if (names.length === 0) return;
    Modal.confirm({
      title: t('fileExplorer.confirmDelete'),
      content: !isLocal
        ? `${names.join(', ')}\n\n${t('fileExplorer.backupBeforeDelete')}`
        : names.join(', '),
      onOk: async () => {
        if (!isLocal && store.connId) {
          // Remote: backup then delete (SK-CDN) or just delete (S3)
          if (store.cdnType === 'SK-CDN') {
            await backupAndDelete(names);
          } else {
            for (const name of names) {
              const remoteFull = `${currentPath.replace(/\/$/, '')}/${name}`;
              await window.api.s3.delete(store.connId, remoteFull);
            }
            store.addLog(`Deleted: ${names.join(', ')}`, 'info');
            loadFiles(currentPath);
          }
        } else if (isLocal) {
          // Local delete via fs
          for (const name of names) {
            const sep = currentPath.includes('\\') ? '\\' : '/';
            const fullPath = `${currentPath.replace(/[\\/]$/, '')}${sep}${name}`;
            try {
              await window.api.fs.deleteFile(fullPath);
              store.addLog(`Deleted: ${name}`, 'info');
            } catch {
              store.addLog(`Failed to delete: ${name}`, 'error');
            }
          }
          loadFiles(currentPath);
        }
      },
    });
  };

  const handleRename = (targetName?: string) => {
    const oldName = targetName || (selected.length === 1 ? selected[0] : null);
    if (!oldName) return;
    Modal.confirm({
      title: t('fileExplorer.renameTo'),
      content: (
        <Input
          defaultValue={oldName}
          id="rename-input"
          autoFocus
        />
      ),
      onOk: async () => {
        const input = document.getElementById('rename-input') as HTMLInputElement;
        const newName = input?.value;
        if (!newName || newName === oldName) return;

        if (isLocal) {
          // Local rename
          const sep = currentPath.includes('\\') ? '\\' : '/';
          const oldPath = `${currentPath.replace(/[\\/]$/, '')}${sep}${oldName}`;
          const newPath = `${currentPath.replace(/[\\/]$/, '')}${sep}${newName}`;
          try {
            await window.api.fs.rename(oldPath, newPath);
            store.addLog(`Renamed: ${oldName} → ${newName}`, 'success');
            loadFiles(currentPath);
          } catch (err: any) {
            message.error(err.message);
          }
        } else if (store.connId) {
          const api = store.cdnType === 'SK-CDN' ? window.api.ftp : window.api.s3;
          const oldPath = `${currentPath.replace(/\/$/, '')}/${oldName}`;
          const newPath = `${currentPath.replace(/\/$/, '')}/${newName}`;
          const result = await api.rename(store.connId, oldPath, newPath);
          if (result.success) {
            store.addLog(`Renamed: ${oldName} → ${newName}`, 'success');
            loadFiles(currentPath);
          } else {
            message.error(result.error);
          }
        }
      },
    });
  };

  const handleNewFolder = () => {
    Modal.confirm({
      title: t('fileExplorer.newFolderName'),
      content: <Input id="newfolder-input" autoFocus />,
      onOk: async () => {
        const input = document.getElementById('newfolder-input') as HTMLInputElement;
        const name = input?.value;
        if (!name) return;

        if (isLocal) {
          const sep = currentPath.includes('\\') ? '\\' : '/';
          const folderPath = `${currentPath.replace(/[\\/]$/, '')}${sep}${name}`;
          try {
            await window.api.fs.mkdir(folderPath);
            store.addLog(`Created folder: ${name}`, 'success');
            loadFiles(currentPath);
          } catch (err: any) {
            message.error(err.message);
          }
        } else if (store.connId) {
          const folderPath = `${currentPath.replace(/\/$/, '')}/${name}`;
          if (store.cdnType === 'SK-CDN') {
            await window.api.ftp.mkdir(store.connId, folderPath);
          }
          store.addLog(`Created folder: ${name}`, 'success');
          loadFiles(currentPath);
        }
      },
    });
  };

  // Handle row click with shift+click range selection
  const handleRowClick = (record: FileItem, index: number, e: React.MouseEvent) => {
    setFocusedFile(null);

    if (e.shiftKey && lastClickedIndexRef.current >= 0) {
      e.preventDefault();
      const start = Math.min(lastClickedIndexRef.current, index);
      const end = Math.max(lastClickedIndexRef.current, index);
      const rangeNames = filteredFiles.slice(start, end + 1).map(f => f.name);
      if (e.ctrlKey || e.metaKey) {
        const merged = new Set([...selected, ...rangeNames]);
        setSelected(Array.from(merged));
      } else {
        setSelected(rangeNames);
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (selected.includes(record.name)) {
        setSelected(selected.filter(n => n !== record.name));
      } else {
        setSelected([...selected, record.name]);
      }
      lastClickedIndexRef.current = index;
    } else {
      lastClickedIndexRef.current = index;
    }
  };

  // Context menu - works on both local and remote
  const handleContextMenu = (record: FileItem, e: React.MouseEvent) => {
    e.preventDefault();
    if (!selected.includes(record.name)) {
      setSelected([record.name]);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, record });
  };

  // Close context menu
  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [contextMenu]);

  const onMenuAction = (action: string) => {
    if (!contextMenu) return;
    setContextMenu(null);

    switch (action) {
      case 'upload': {
        const toUpload = selected.length > 0 ? selected : [contextMenu.record.name];
        window.dispatchEvent(new CustomEvent('wjftp:upload', {
          detail: { files: toUpload, localPath: currentPath },
        }));
        break;
      }
      case 'open':
        handleDoubleClick(contextMenu.record);
        break;
      case 'copyPath': {
        const sep = isLocal && currentPath.includes('\\') ? '\\' : '/';
        const fullPath = `${currentPath.replace(/[\\/]$/, '')}${sep}${contextMenu.record.name}`;
        navigator.clipboard.writeText(fullPath);
        message.success(t('fileExplorer.pathCopied'));
        break;
      }
      case 'newFolder':
        handleNewFolder();
        break;
      case 'rename':
        handleRename(contextMenu.record.name);
        break;
      case 'delete': {
        const toDelete = selected.length > 0 ? selected : [contextMenu.record.name];
        handleDelete(toDelete);
        break;
      }
      case 'refresh':
        loadFiles(currentPath);
        break;
    }
  };

  // Keyboard first-letter navigation (scroll only, no checkbox)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;

    const key = e.key;
    if (key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;

    e.preventDefault();

    if (keyTimerRef.current) clearTimeout(keyTimerRef.current);
    keyBufferRef.current += key.toLowerCase();
    keyTimerRef.current = setTimeout(() => { keyBufferRef.current = ''; }, 800);

    const search = keyBufferRef.current;
    const target = filteredFiles.find(f =>
      f.name.toLowerCase().startsWith(search)
    );

    if (target) {
      setFocusedFile(target.name);
      const container = tableContainerRef.current;
      if (container) {
        const idx = filteredFiles.indexOf(target);
        const row = container.querySelectorAll('.ant-table-tbody > tr')[idx];
        row?.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [filteredFiles]);

  const columns = [
    {
      title: t('fileExplorer.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: FileItem) => (
        <span>
          <span className="file-icon">{getFileExtIcon(name, record.type)}</span>
          {name}
        </span>
      ),
      sorter: (a: FileItem, b: FileItem) => a.name.localeCompare(b.name),
    },
    {
      title: t('fileExplorer.size'),
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number, record: FileItem) =>
        record.type === 'directory' ? '' : formatSize(size),
      sorter: (a: FileItem, b: FileItem) => a.size - b.size,
    },
    {
      title: t('fileExplorer.modified'),
      dataIndex: 'modifiedAt',
      key: 'modifiedAt',
      width: 150,
      render: (date: string | null) =>
        date ? new Date(date).toLocaleString() : '',
    },
  ];

  return (
    <div className="file-panel">
      <div className="panel-header">
        {isLocal ? (
          <><FolderOutlined /> {t('fileExplorer.localFiles')}</>
        ) : (
          <><FolderOutlined /> {t('fileExplorer.remoteFiles')} ({store.cdnType})</>
        )}
      </div>

      <div className="panel-toolbar">
        <Tooltip title={t('fileExplorer.home')}>
          <Button
            size="small" icon={<HomeOutlined />}
            onClick={() => {
              if (isLocal) {
                window.api.fs.getHome().then((r: any) => r.success && loadFiles(r.path));
              } else {
                loadFiles('/');
              }
            }}
          />
        </Tooltip>
        <Tooltip title={t('fileExplorer.up')}>
          <Button size="small" icon={<ArrowUpOutlined />} onClick={navigateUp} />
        </Tooltip>
        <Tooltip title={t('fileExplorer.refresh')}>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => loadFiles(currentPath)} />
        </Tooltip>
        <Input
          className="path-input"
          size="small"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onPressEnter={() => loadFiles(pathInput)}
        />
      </div>

      <div className="search-bar">
        <Input
          size="small"
          prefix={<SearchOutlined style={{ color: '#888' }} />}
          suffix={searchText ? (
            <CloseCircleOutlined
              style={{ cursor: 'pointer', color: '#888' }}
              onClick={() => setSearchText('')}
            />
          ) : null}
          placeholder={t('fileExplorer.searchPlaceholder')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear={false}
        />
        {searchText && (
          <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
            {filteredFiles.length}/{files.length}
          </span>
        )}
      </div>

      <div className="file-list-container" ref={tableContainerRef} onKeyDown={handleKeyDown} tabIndex={0}>
        <Table
          dataSource={filteredFiles}
          columns={columns}
          rowKey="name"
          size="small"
          pagination={false}
          loading={loading}
          scroll={{ y: 'calc(100%)' }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys as string[]),
          }}
          onRow={(record, index) => ({
            onDoubleClick: () => handleDoubleClick(record),
            onClick: (e) => handleRowClick(record, index ?? 0, e),
            onContextMenu: (e) => handleContextMenu(record, e),
            className: [
              record.name === focusedFile ? 'focused-row' : '',
              record.accessible === false ? 'locked-row' : '',
            ].filter(Boolean).join(' '),
          })}
        />
      </div>

      {/* Context menu - both local and remote */}
      {contextMenu && (
        <div
          className="custom-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {isLocal && (
            <>
              <div className="ctx-item" onClick={() => onMenuAction('upload')}>
                <UploadOutlined /> {t('fileExplorer.upload')}
              </div>
              <div className="ctx-divider" />
            </>
          )}
          <div
            className={`ctx-item ${contextMenu.record.type !== 'directory' ? 'ctx-disabled' : ''}`}
            onClick={() => contextMenu.record.type === 'directory' && onMenuAction('open')}
          >
            <FolderOpenOutlined /> {t('fileExplorer.openFolder')}
          </div>
          <div className="ctx-item" onClick={() => onMenuAction('copyPath')}>
            <CopyOutlined /> {t('fileExplorer.copyPath')}
          </div>
          <div className="ctx-divider" />
          <div className="ctx-item" onClick={() => onMenuAction('newFolder')}>
            <FolderAddOutlined /> {t('fileExplorer.newFolder')}
          </div>
          <div className="ctx-item" onClick={() => onMenuAction('rename')}>
            <EditOutlined /> {t('fileExplorer.rename')}
          </div>
          <div className="ctx-item ctx-danger" onClick={() => onMenuAction('delete')}>
            <DeleteOutlined /> {t('fileExplorer.delete')}
          </div>
          <div className="ctx-divider" />
          <div className="ctx-item" onClick={() => onMenuAction('refresh')}>
            <ReloadOutlined /> {t('fileExplorer.refresh')}
          </div>
        </div>
      )}

      <div className="panel-actions">
        {isLocal ? (
          <>
            <Button
              size="small"
              icon={<UploadOutlined />}
              type="primary"
              disabled={!store.connected || selected.length === 0}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('wjftp:upload', {
                  detail: { files: selected, localPath: currentPath },
                }));
              }}
            >
              {t('fileExplorer.upload')} →
            </Button>
            <Button
              size="small"
              icon={<FileAddOutlined />}
              onClick={async () => {
                const result = await window.api.fs.openFileDialog({ multiple: true });
                if (result.success && result.paths.length > 0) {
                  window.dispatchEvent(new CustomEvent('wjftp:upload-files', {
                    detail: { paths: result.paths },
                  }));
                }
              }}
            >
              {t('fileExplorer.selectFiles')}
            </Button>
          </>
        ) : (
          <>
            <Button size="small" icon={<FolderAddOutlined />} onClick={handleNewFolder}
              disabled={!store.connected}>
              {t('fileExplorer.newFolder')}
            </Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => handleRename()}
              disabled={!store.connected || selected.length !== 1}>
              {t('fileExplorer.rename')}
            </Button>
            <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete()}
              disabled={!store.connected || selected.length === 0}>
              {t('fileExplorer.delete')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
