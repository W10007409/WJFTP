import React, { useState, useEffect } from 'react';
import { Select, Input, Button, Space, message } from 'antd';
import {
  LinkOutlined,
  DisconnectOutlined,
  LoadingOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppStore, CdnType } from '../stores/useAppStore';

export const ConnectionBar: React.FC = () => {
  const { t } = useTranslation();
  const {
    cdnType, setCdnType, connected, setConnected, connecting, setConnecting,
    setConnId, connId, addLog, setRemotePath, setRemoteFiles,
  } = useAppStore();

  // SK-CDN fields
  const [ftpUser, setFtpUser] = useState('');
  const [ftpPass, setFtpPass] = useState('');
  const [ftpHost, setFtpHost] = useState('wjth.ftp.scs.skcdn.co.kr');
  const [ftpPort, setFtpPort] = useState(10021);

  // Naver Cloud fields
  const [s3Endpoint, setS3Endpoint] = useState('https://kr.object.ncloudstorage.com');
  const [s3AccessKey, setS3AccessKey] = useState('');
  const [s3SecretKey, setS3SecretKey] = useState('');

  // Load saved credentials
  useEffect(() => {
    (async () => {
      const skConfig = await window.api.store.getSkCdn();
      if (skConfig) {
        setFtpHost(skConfig.host || 'wjth.ftp.scs.skcdn.co.kr');
        setFtpPort(skConfig.port || 10021);
        setFtpUser(skConfig.user || '');
        setFtpPass(skConfig.password || '');
      }
      const naverConfig = await window.api.store.getNaverCloud();
      if (naverConfig) {
        setS3Endpoint(naverConfig.endpoint || 'https://kr.object.ncloudstorage.com');
        setS3AccessKey(naverConfig.accessKey || '');
        setS3SecretKey(naverConfig.secretKey || '');
      }
    })();
  }, []);

  const handleConnect = async () => {
    if (connected) {
      // Disconnect
      if (connId) {
        if (cdnType === 'SK-CDN') {
          await window.api.ftp.disconnect(connId);
        } else {
          await window.api.s3.disconnect(connId);
        }
      }
      setConnected(false);
      setConnId(null);
      setRemoteFiles([]);
      addLog(`${cdnType} ${t('connection.disconnected')}`, 'info');
      return;
    }

    setConnecting(true);

    try {
      if (cdnType === 'SK-CDN') {
        const result = await window.api.ftp.connect({
          host: ftpHost, port: ftpPort, user: ftpUser, password: ftpPass,
        });
        if (result.success) {
          setConnId(result.connId);
          setConnected(true);
          setRemotePath('/');
          addLog(`SK-CDN FTP ${t('connection.connectionSuccess')}`, 'success');

          // Save credentials
          await window.api.store.saveSkCdn({
            host: ftpHost, port: ftpPort, user: ftpUser, password: ftpPass,
          });
        } else {
          message.error(`${t('connection.connectionFailed')}: ${result.error}`);
          addLog(`FTP ${t('connection.connectionFailed')}: ${result.error}`, 'error');
        }
      } else {
        const result = await window.api.s3.connect({
          endpoint: s3Endpoint, region: 'kr-standard',
          accessKey: s3AccessKey, secretKey: s3SecretKey,
        });
        if (result.success) {
          setConnId(result.connId);
          setConnected(true);
          setRemotePath('/');
          addLog(`Naver Cloud ${t('connection.connectionSuccess')}`, 'success');

          await window.api.store.saveNaverCloud({
            endpoint: s3Endpoint, region: 'kr-standard',
            accessKey: s3AccessKey, secretKey: s3SecretKey,
          });
        } else {
          message.error(`${t('connection.connectionFailed')}: ${result.error}`);
          addLog(`S3 ${t('connection.connectionFailed')}: ${result.error}`, 'error');
        }
      }
    } catch (err: any) {
      message.error(err.message);
      addLog(err.message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="connection-bar">
      <Select
        value={cdnType}
        onChange={(v: CdnType) => {
          if (connected) return;
          setCdnType(v);
        }}
        disabled={connected}
        style={{ width: 160 }}
        options={[
          { value: 'SK-CDN', label: t('connection.skCdn') },
          { value: 'NAVER', label: t('connection.naverCloud') },
        ]}
      />

      {cdnType === 'SK-CDN' ? (
        <Space.Compact>
          <Input
            placeholder={t('connection.host')}
            value={ftpHost}
            onChange={(e) => setFtpHost(e.target.value)}
            disabled={connected}
            style={{ width: 220 }}
            size="small"
          />
          <Input
            placeholder={t('connection.port')}
            value={ftpPort}
            onChange={(e) => setFtpPort(Number(e.target.value) || 21)}
            disabled={connected}
            style={{ width: 70 }}
            size="small"
          />
          <Input
            placeholder={t('connection.user')}
            value={ftpUser}
            onChange={(e) => setFtpUser(e.target.value)}
            disabled={connected}
            style={{ width: 120 }}
            size="small"
          />
          <Input.Password
            placeholder={t('connection.password')}
            value={ftpPass}
            onChange={(e) => setFtpPass(e.target.value)}
            disabled={connected}
            style={{ width: 120 }}
            size="small"
          />
        </Space.Compact>
      ) : (
        <Space.Compact>
          <Input
            placeholder={t('connection.endpoint')}
            value={s3Endpoint}
            onChange={(e) => setS3Endpoint(e.target.value)}
            disabled={connected}
            style={{ width: 220 }}
            size="small"
          />
          <Input
            placeholder={t('connection.accessKey')}
            value={s3AccessKey}
            onChange={(e) => setS3AccessKey(e.target.value)}
            disabled={connected}
            style={{ width: 140 }}
            size="small"
          />
          <Input.Password
            placeholder={t('connection.secretKey')}
            value={s3SecretKey}
            onChange={(e) => setS3SecretKey(e.target.value)}
            disabled={connected}
            style={{ width: 140 }}
            size="small"
          />
        </Space.Compact>
      )}

      <Button
        type={connected ? 'default' : 'primary'}
        danger={connected}
        icon={connecting ? <LoadingOutlined /> : connected ? <DisconnectOutlined /> : <LinkOutlined />}
        onClick={handleConnect}
        loading={connecting}
        size="small"
      >
        {connected ? t('connection.disconnect') : t('connection.connect')}
      </Button>

      <div className="connection-status">
        <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
        {connected ? t('connection.connected') : t('connection.disconnected')}
      </div>
    </div>
  );
};
