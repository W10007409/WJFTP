import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Button, Select, Card, Divider, message, Space } from 'antd';
import { SaveOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../stores/useAppStore';

export const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, language, setLanguage } = useAppStore();

  const [skForm] = Form.useForm();
  const [naverForm] = Form.useForm();

  useEffect(() => {
    (async () => {
      const sk = await window.api.store.getSkCdn();
      if (sk) skForm.setFieldsValue(sk);

      const naver = await window.api.store.getNaverCloud();
      if (naver) naverForm.setFieldsValue(naver);
    })();
  }, []);

  const saveSkCdn = async (values: any) => {
    await window.api.store.saveSkCdn(values);
    message.success(t('settings.saved'));
  };

  const saveNaverCloud = async (values: any) => {
    await window.api.store.saveNaverCloud({ ...values, region: 'kr-standard' });
    message.success(t('settings.saved'));
  };

  const handleThemeChange = async (value: 'dark' | 'light') => {
    setTheme(value);
    await window.api.store.setTheme(value);
  };

  const handleLanguageChange = async (value: string) => {
    setLanguage(value);
    i18n.changeLanguage(value);
    await window.api.store.setLanguage(value);
  };

  return (
    <div className="settings-container">
      <h2>{t('settings.title')}</h2>

      <Divider />

      <Card title="SK-CDN (FTP)" size="small" style={{ marginBottom: 16 }}>
        <Form form={skForm} layout="vertical" onFinish={saveSkCdn} size="small"
          initialValues={{ host: 'wjth.ftp.scs.skcdn.co.kr', port: 10021 }}>
          <Form.Item name="host" label={t('connection.host')}>
            <Input />
          </Form.Item>
          <Form.Item name="port" label={t('connection.port')}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="user" label={t('connection.user')}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={t('connection.password')}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
            {t('settings.save')}
          </Button>
        </Form>
      </Card>

      <Card title="Naver Cloud Object Storage (S3)" size="small" style={{ marginBottom: 16 }}>
        <Form form={naverForm} layout="vertical" onFinish={saveNaverCloud} size="small"
          initialValues={{ endpoint: 'https://kr.object.ncloudstorage.com' }}>
          <Form.Item name="endpoint" label={t('connection.endpoint')}>
            <Input placeholder="https://kr.object.ncloudstorage.com" />
          </Form.Item>
          <Form.Item name="bucket" label={t('connection.bucket')}>
            <Input />
          </Form.Item>
          <Form.Item name="accessKey" label={t('connection.accessKey')}>
            <Input />
          </Form.Item>
          <Form.Item name="secretKey" label={t('connection.secretKey')}>
            <Input.Password />
          </Form.Item>
          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, margin: '12px 0' }}>
            Global Edge {t('settings.purgeSettings')}
          </Divider>
          <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            {t('settings.edgeAutoMapping')}
          </p>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
            {t('settings.save')}
          </Button>
        </Form>
      </Card>

      <Card title={t('settings.backup')} size="small" style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8, fontSize: 13, opacity: 0.7 }}>{t('settings.backupDescription')}</p>
        <Button icon={<FolderOpenOutlined />} onClick={() => window.api.ftp.openBackupDir()}>
          {t('settings.openBackupDir')}
        </Button>
      </Card>

      <Card title={t('settings.appearance')} size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>{t('settings.theme')}</label>
            <Select value={theme} onChange={handleThemeChange} style={{ width: 200 }}>
              <Select.Option value="dark">{t('settings.dark')}</Select.Option>
              <Select.Option value="light">{t('settings.light')}</Select.Option>
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>{t('settings.language')}</label>
            <Select value={language} onChange={handleLanguageChange} style={{ width: 200 }}>
              <Select.Option value="ko">{t('settings.korean')}</Select.Option>
              <Select.Option value="en">{t('settings.english')}</Select.Option>
            </Select>
          </div>
        </Space>
      </Card>
    </div>
  );
};
