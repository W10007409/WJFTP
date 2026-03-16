import React, { useEffect, useState, useCallback } from 'react';
import { Table, Input, Select, Button, Tag, Space, Card, Statistic, Modal, Popconfirm, DatePicker } from 'antd';
import { SearchOutlined, DeleteOutlined, EyeOutlined, ClearOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface HistoryRecord {
  id: number;
  cdn_type: string;
  local_path: string;
  remote_path: string;
  original_filename: string;
  uploaded_filename: string;
  file_size: number;
  status: string;
  purge_status: string | null;
  purge_urls: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  completed_at: string | null;
}

interface Stats {
  total: number;
  success_count: number;
  failed_count: number;
  total_size: number;
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export const HistoryPage: React.FC = () => {
  const { t } = useTranslation();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, success_count: 0, failed_count: 0, total_size: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [cdnFilter, setCdnFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const result = await window.api.history.list({
      limit: 50,
      offset: (page - 1) * 50,
      cdnType: cdnFilter || undefined,
      status: statusFilter || undefined,
      search: search || undefined,
    });
    if (result.success) {
      setRecords(result.items);
      setTotal(result.total);
    }

    const statsResult = await window.api.history.stats();
    if (statsResult.success) {
      setStats(statsResult.stats);
    }
    setLoading(false);
  }, [page, search, cdnFilter, statusFilter]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleClear = async () => {
    await window.api.history.clear();
    loadHistory();
  };

  const showDetail = (record: HistoryRecord) => {
    const purgeUrls = record.purge_urls ? JSON.parse(record.purge_urls) : [];
    Modal.info({
      title: t('history.detail'),
      width: 600,
      content: (
        <div>
          <p><strong>CDN:</strong> {record.cdn_type}</p>
          <p><strong>{t('transfer.originalName')}:</strong> {record.original_filename}</p>
          <p><strong>{t('transfer.uploadedName')}:</strong> {record.uploaded_filename}</p>
          <p><strong>{t('fileExplorer.path')}:</strong> {record.remote_path}</p>
          <p><strong>{t('fileExplorer.size')}:</strong> {formatSize(record.file_size)}</p>
          <p><strong>{t('transfer.status')}:</strong> {record.status}</p>
          {record.error_message && (
            <p><strong>{t('common.error')}:</strong> <span style={{ color: '#ff4d4f' }}>{record.error_message}</span></p>
          )}
          {purgeUrls.length > 0 && (
            <>
              <p><strong>{t('history.purgeUrls')}:</strong></p>
              <ul style={{ fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
                {purgeUrls.map((url: string, i: number) => (
                  <li key={i}>{url}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ),
    });
  };

  const columns = [
    {
      title: 'CDN', dataIndex: 'cdn_type', key: 'cdn_type', width: 90,
      render: (v: string) => <Tag color={v === 'SK-CDN' ? 'blue' : 'green'}>{v}</Tag>,
    },
    {
      title: t('transfer.originalName'), dataIndex: 'original_filename', key: 'original_filename',
      ellipsis: true,
    },
    {
      title: t('transfer.uploadedName'), dataIndex: 'uploaded_filename', key: 'uploaded_filename',
      ellipsis: true,
    },
    {
      title: t('fileExplorer.size'), dataIndex: 'file_size', key: 'file_size', width: 90,
      render: (v: number) => formatSize(v),
    },
    {
      title: t('transfer.status'), dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => (
        <Tag color={v === 'success' ? 'success' : v === 'failed' ? 'error' : 'default'}>{v}</Tag>
      ),
    },
    {
      title: t('fileExplorer.modified'), dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: '', key: 'actions', width: 50,
      render: (_: any, record: HistoryRecord) => (
        <Button size="small" icon={<EyeOutlined />} type="text" onClick={() => showDetail(record)} />
      ),
    },
  ];

  return (
    <div className="history-container">
      <Space style={{ marginBottom: 12 }}>
        <Statistic title={t('history.totalUploads')} value={stats.total} />
        <Statistic title={t('history.successCount')} value={stats.success_count} valueStyle={{ color: '#52c41a' }} />
        <Statistic title={t('history.failCount')} value={stats.failed_count} valueStyle={{ color: '#ff4d4f' }} />
        <Statistic title={t('history.totalSize')} value={formatSize(stats.total_size || 0)} />
      </Space>

      <Space style={{ marginBottom: 12 }}>
        <Input
          placeholder={t('history.search')}
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 200 }}
          allowClear
        />
        <Select value={cdnFilter} onChange={setCdnFilter} style={{ width: 130 }}
          options={[
            { value: '', label: t('history.allCdn') },
            { value: 'SK-CDN', label: 'SK-CDN' },
            { value: 'NAVER', label: 'Naver Cloud' },
          ]}
        />
        <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 130 }}
          options={[
            { value: '', label: t('history.allStatus') },
            { value: 'success', label: t('transfer.completed') },
            { value: 'failed', label: t('transfer.failed') },
          ]}
        />
        <Popconfirm title={t('history.confirmClear')} onConfirm={handleClear}>
          <Button icon={<ClearOutlined />} danger>{t('history.clear')}</Button>
        </Popconfirm>
      </Space>

      <Table
        dataSource={records}
        columns={columns}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 50,
          onChange: setPage,
          showSizeChanger: false,
        }}
        style={{ flex: 1 }}
      />
    </div>
  );
};
