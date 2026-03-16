import { ipcMain } from 'electron';
import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import fs from 'fs';
import path from 'path';

// SSL bypass agent for corporate proxy with self-signed certificates
const s3HttpAgent = new https.Agent({ rejectUnauthorized: false });

interface S3Connection {
  client: S3Client;
  bucket: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  region: string;
}

const s3Connections: Map<string, S3Connection> = new Map();

// Parse /bucketName/path/to/key → { bucket, key }
function parseBucketPath(fullPath: string): { bucket: string; key: string } {
  const p = fullPath.replace(/^\//, '');
  const idx = p.indexOf('/');
  if (idx === -1) return { bucket: p, key: '' };
  return { bucket: p.substring(0, idx), key: p.substring(idx + 1) };
}

export function registerS3Handlers(): void {
  ipcMain.handle('s3:connect', async (_event, config: {
    endpoint: string;
    region: string;
    bucket?: string;
    accessKey: string;
    secretKey: string;
  }) => {
    const connId = `s3:${config.accessKey}@${config.endpoint}`;

    try {
      const client = new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: {
          accessKeyId: config.accessKey,
          secretAccessKey: config.secretKey,
        },
        forcePathStyle: true,
        requestHandler: new NodeHttpHandler({
          httpsAgent: s3HttpAgent,
        }),
      });

      // Test connection by listing buckets
      await client.send(new ListBucketsCommand({}));

      s3Connections.set(connId, {
        client,
        bucket: config.bucket || '',
        endpoint: config.endpoint,
        accessKey: config.accessKey,
        secretKey: config.secretKey,
        region: config.region,
      });
      return { success: true, connId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('s3:disconnect', async (_event, connId: string) => {
    const conn = s3Connections.get(connId);
    if (conn) {
      conn.client.destroy();
      s3Connections.delete(connId);
    }
    return { success: true };
  });

  ipcMain.handle('s3:list', async (_event, connId: string, prefix: string) => {
    const conn = s3Connections.get(connId);
    if (!conn) return { success: false, error: 'Not connected' };

    try {
      // Root path: show bucket list with access check
      if (prefix === '/') {
        const bucketsResult = await conn.client.send(new ListBucketsCommand({}));
        const buckets = bucketsResult.Buckets || [];

        const items = await Promise.all(buckets.map(async (b) => {
          let accessible = false;
          try {
            await conn.client.send(new ListObjectsV2Command({
              Bucket: b.Name!,
              MaxKeys: 1,
            }));
            accessible = true;
          } catch {
            accessible = false;
          }
          return {
            name: accessible ? b.Name! : `🔒 ${b.Name!}`,
            type: 'directory' as const,
            size: 0,
            modifiedAt: b.CreationDate?.toISOString() || null,
            accessible,
          };
        }));

        // Sort: accessible first, then inaccessible
        items.sort((a, b) => (a.accessible === b.accessible ? 0 : a.accessible ? -1 : 1));

        return { success: true, items };
      }

      // Extract bucket name from path: /bucketName/rest/of/path
      const pathWithoutLeadingSlash = prefix.replace(/^\//, '');
      const slashIndex = pathWithoutLeadingSlash.indexOf('/');
      const bucket = slashIndex === -1 ? pathWithoutLeadingSlash : pathWithoutLeadingSlash.substring(0, slashIndex);
      const objectPrefix = slashIndex === -1 ? '' : pathWithoutLeadingSlash.substring(slashIndex + 1);

      // Update current bucket on connection
      conn.bucket = bucket;

      const result = await conn.client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: objectPrefix,
        Delimiter: '/',
      }));

      const dirs = (result.CommonPrefixes || []).map(p => ({
        name: p.Prefix!.replace(objectPrefix, '').replace(/\/$/, ''),
        type: 'directory' as const,
        size: 0,
        modifiedAt: null,
      }));

      const files = (result.Contents || [])
        .filter(obj => obj.Key !== objectPrefix)
        .map(obj => ({
          name: obj.Key!.replace(objectPrefix, ''),
          type: 'file' as const,
          size: obj.Size || 0,
          modifiedAt: obj.LastModified?.toISOString() || null,
        }));

      return { success: true, items: [...dirs, ...files] };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('s3:upload', async (event, connId: string, localPath: string, remotePath: string) => {
    const conn = s3Connections.get(connId);
    if (!conn) return { success: false, error: 'Not connected' };

    try {
      const { bucket, key } = parseBucketPath(remotePath);
      const fileBuffer = fs.readFileSync(localPath);
      const fileSize = fileBuffer.length;

      await conn.client.send(new PutObjectCommand({
        Bucket: bucket || conn.bucket,
        Key: key,
        Body: fileBuffer,
      }));

      event.sender.send('s3:upload-progress', {
        localPath,
        remotePath,
        bytes: fileSize,
        total: fileSize,
        percent: 100,
      });

      return { success: true, remotePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('s3:delete', async (_event, connId: string, remotePath: string) => {
    const conn = s3Connections.get(connId);
    if (!conn) return { success: false, error: 'Not connected' };

    try {
      const { bucket, key } = parseBucketPath(remotePath);
      await conn.client.send(new DeleteObjectCommand({
        Bucket: bucket || conn.bucket,
        Key: key,
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('s3:rename', async (_event, connId: string, oldPath: string, newPath: string) => {
    const conn = s3Connections.get(connId);
    if (!conn) return { success: false, error: 'Not connected' };

    try {
      const old = parseBucketPath(oldPath);
      const nw = parseBucketPath(newPath);
      const bucket = old.bucket || conn.bucket;

      await conn.client.send(new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${old.key}`,
        Key: nw.key,
      }));

      await conn.client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: old.key,
      }));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
