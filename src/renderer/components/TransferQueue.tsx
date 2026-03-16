import React, { useState } from 'react';
import { Button, Progress, Tag, Space, Tooltip } from 'antd';
import {
  CaretUpOutlined, CaretDownOutlined, ClearOutlined,
  ReloadOutlined, CloudSyncOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppStore, TransferItem, TransferStatus } from '../stores/useAppStore';

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatSize(bytesPerSec)}/s`;
}

function statusColor(status: TransferStatus): string {
  const map: Record<TransferStatus, string> = {
    waiting: 'default',
    uploading: 'processing',
    purging: 'warning',
    completed: 'success',
    failed: 'error',
    retrying: 'warning',
  };
  return map[status];
}

export const TransferQueue: React.FC = () => {
  const { t } = useTranslation();
  const { transfers, clearCompleted, removeTransfer, addLog } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);

  const completed = transfers.filter(t => t.status === 'completed').length;
  const total = transfers.length;
  const uploading = transfers.filter(t => t.status === 'uploading' || t.status === 'purging');
  const overallPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleBatchPurge = async () => {
    const completedItems = transfers.filter(t => t.status === 'completed');
    const paths = completedItems.map(t => t.remotePath);
    if (paths.length === 0) return;

    addLog(`Batch purge: ${paths.length} files`, 'info');
    const result = await window.api.purge.batch(paths);
    if (result.success && result.results) {
      const failed = result.results.filter((r: any) => !r.success);
      if (failed.length === 0) {
        addLog(`Batch purge completed: ${result.results.length} URLs all OK`, 'success');
      } else {
        addLog(`Batch purge: ${result.results.length - failed.length} OK, ${failed.length} failed`, 'error');
        for (const f of failed) {
          addLog(`  FAIL [${f.url}]: ${f.message}`, 'error');
        }
      }
    }
  };

  const handleRetry = (item: TransferItem) => {
    window.dispatchEvent(new CustomEvent('wjftp:retry', { detail: { id: item.id } }));
  };

  return (
    <div className="transfer-panel">
      <div className="transfer-header" onClick={() => setCollapsed(!collapsed)}>
        <Space>
          {collapsed ? <CaretUpOutlined /> : <CaretDownOutlined />}
          <strong>{t('transfer.queue')}</strong>
          <span style={{ fontSize: 12, color: '#888' }}>
            {t('transfer.filesCompleted', { completed, total })}
          </span>
          {total > 0 && (
            <Progress
              percent={overallPercent}
              size="small"
              style={{ width: 120, marginBottom: 0 }}
            />
          )}
        </Space>
        <Space>
          <Tooltip title={t('transfer.batchPurge')}>
            <Button size="small" icon={<CloudSyncOutlined />} onClick={(e) => {
              e.stopPropagation();
              handleBatchPurge();
            }} disabled={completed === 0}>
              {t('transfer.batchPurge')}
            </Button>
          </Tooltip>
          <Button size="small" icon={<ClearOutlined />} onClick={(e) => {
            e.stopPropagation();
            clearCompleted();
          }}>
            {t('transfer.clearCompleted')}
          </Button>
        </Space>
      </div>

      {!collapsed && (
        <div className="transfer-list">
          {transfers.map(item => (
            <div key={item.id} className="transfer-item">
              <span className="filename" title={item.originalName}>
                {item.originalName}
              </span>
              <span className="arrow">→</span>
              <span className="uploaded-name" title={item.uploadedName}>
                {item.uploadedName}
              </span>
              <div className="progress-bar">
                <Progress
                  percent={item.progress}
                  size="small"
                  status={item.status === 'failed' ? 'exception' : item.status === 'completed' ? 'success' : 'active'}
                  format={(p) => `${p}%`}
                  style={{ marginBottom: 0 }}
                />
              </div>
              <span style={{ fontSize: 11, color: '#888', minWidth: 70 }}>
                {item.status === 'uploading' ? formatSpeed(item.speed) : formatSize(item.fileSize)}
              </span>
              <Tag color={statusColor(item.status)} className="status-badge">
                {t(`transfer.${item.status}`)}
              </Tag>
              {item.purgeStatus && (
                <Tooltip title={item.purgeError || undefined}>
                  <Tag color={item.purgeStatus === 'success' ? 'green' : item.purgeStatus === 'failed' ? 'red' : 'orange'}
                    style={item.purgeStatus === 'failed' ? { cursor: 'help' } : undefined}>
                    {item.purgeStatus === 'success' ? t('transfer.purgeComplete') :
                     item.purgeStatus === 'failed' ? t('transfer.purgeFailed') : t('transfer.purging')}
                  </Tag>
                </Tooltip>
              )}
              {item.status === 'failed' && (
                <Tooltip title={item.error}>
                  <Button size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(item)}>
                    {t('transfer.retry')}
                  </Button>
                </Tooltip>
              )}
              {item.retryCount > 0 && item.status === 'retrying' && (
                <span style={{ fontSize: 11, color: '#faad14' }}>
                  {t('transfer.autoRetry', { current: item.retryCount, max: 3 })}
                </span>
              )}
              <Button size="small" icon={<DeleteOutlined />}
                onClick={() => removeTransfer(item.id)} type="text" />
            </div>
          ))}
          {transfers.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
              {t('fileExplorer.dragDropHint')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
