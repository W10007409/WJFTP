import { ipcMain } from 'electron';
import fs from 'fs';
import https from 'https';
import crypto from 'crypto';

const PURGE_API_BASE = 'https://cdn.openapi.wjthinkbig.com';
const PURGE_ENDPOINT = '/auth/OpenApi.php';
const PURGE_SERVICE = 'sdd';
const PURGE_USER_ID = 'wjth@bookclubstudy';

// SSL bypass agent for corporate proxy with self-signed certificates
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Domain mapping: FTP path prefix → CDN download domain
const DOMAIN_MAP: Record<string, string> = {
  '/WJTH_CACHE': 'https://cache.wjthinkbig.com',
  '/WJTH_DOWNLOAD': 'https://down.wjthinkbig.com',
};

function base64Encode(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

function ftpPathToCdnUrl(ftpPath: string): string | null {
  for (const [prefix, domain] of Object.entries(DOMAIN_MAP)) {
    if (ftpPath.startsWith(prefix)) {
      const subPath = ftpPath.substring(prefix.length);
      return `${domain}${subPath}`;
    }
  }
  return null;
}

async function purgeUrl(cdnUrl: string): Promise<{ success: boolean; url: string; message: string }> {
  const params = new URLSearchParams({
    a: 'purge',
    file: base64Encode(cdnUrl),
    ttl: '0',
    service: PURGE_SERVICE,
    userID: PURGE_USER_ID,
  });

  const requestUrl = `${PURGE_API_BASE}${PURGE_ENDPOINT}?${params.toString()}`;

  try {
    const text = await new Promise<string>((resolve, reject) => {
      const req = https.get(requestUrl, { agent: httpsAgent }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timed out (30s)'));
      });
    });

    return { success: true, url: cdnUrl, message: text };
  } catch (err: any) {
    const errorDetail = err.code === 'SELF_SIGNED_CERT_IN_CHAIN' || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
      ? `SSL 인증서 오류 (${err.code}): ${err.message}`
      : `${err.code ? `[${err.code}] ` : ''}${err.message}`;
    return { success: false, url: cdnUrl, message: errorDetail };
  }
}

// Parse paths from HTML/JS/CSS source files
function parsePathsFromSource(content: string, fileExt: string): string[] {
  const paths: Set<string> = new Set();

  // HTML: src="...", href="..."
  const htmlAttrRegex = /(?:src|href|action|data-src|poster)\s*=\s*["']([^"']+?)["']/gi;
  let match;
  while ((match = htmlAttrRegex.exec(content)) !== null) {
    const p = match[1].trim();
    if (p && !p.startsWith('data:') && !p.startsWith('#') && !p.startsWith('mailto:') && !p.startsWith('javascript:')) {
      paths.add(p);
    }
  }

  // CSS: url("...") / url('...') / url(...)
  const cssUrlRegex = /url\(\s*["']?([^"')]+?)["']?\s*\)/gi;
  while ((match = cssUrlRegex.exec(content)) !== null) {
    const p = match[1].trim();
    if (p && !p.startsWith('data:')) {
      paths.add(p);
    }
  }

  // JS: import "..." / import '...' / require("...") / require('...')
  if (fileExt === '.js' || fileExt === '.ts' || fileExt === '.mjs') {
    const importRegex = /(?:import|require)\s*\(\s*["']([^"']+?)["']\s*\)/g;
    while ((match = importRegex.exec(content)) !== null) {
      paths.add(match[1].trim());
    }
    const importFromRegex = /import\s+.*?\s+from\s+["']([^"']+?)["']/g;
    while ((match = importFromRegex.exec(content)) !== null) {
      paths.add(match[1].trim());
    }
  }

  // Filter: only keep paths that look like file references
  return Array.from(paths).filter(p => {
    // Remove absolute URLs to external domains
    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('//')) {
      // Keep only if it's our CDN domain
      return p.includes('cache.wjthinkbig.com') || p.includes('down.wjthinkbig.com');
    }
    return true;
  });
}

export function registerPurgeHandlers(): void {
  // Purge a single file by FTP path
  ipcMain.handle('purge:file', async (_event, ftpPath: string) => {
    const cdnUrl = ftpPathToCdnUrl(ftpPath);
    if (!cdnUrl) {
      return { success: false, error: `Cannot map FTP path to CDN URL: ${ftpPath}` };
    }
    return await purgeUrl(cdnUrl);
  });

  // Purge multiple files by FTP paths
  ipcMain.handle('purge:batch', async (_event, ftpPaths: string[]) => {
    const results = [];
    for (const ftpPath of ftpPaths) {
      const cdnUrl = ftpPathToCdnUrl(ftpPath);
      if (!cdnUrl) {
        // Skip paths that don't map to a known CDN domain (not behind SK-CDN cache)
        results.push({ success: true, url: ftpPath, message: 'Skipped (no CDN mapping)', skipped: true });
        continue;
      }
      const result = await purgeUrl(cdnUrl);
      results.push(result);
    }
    return { success: true, results };
  });

  // Purge with source parsing for HTML/JS/CSS files
  ipcMain.handle('purge:withSourceParsing', async (_event, localPath: string, ftpPath: string) => {
    const results = [];

    // 1. Purge the file itself (uppercase path)
    const cdnUrl = ftpPathToCdnUrl(ftpPath);
    if (cdnUrl) {
      const result = await purgeUrl(cdnUrl);
      results.push(result);
    }

    // 2. Parse source and purge referenced paths
    const ext = localPath.substring(localPath.lastIndexOf('.')).toLowerCase();
    const sourceExts = ['.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.less', '.mjs'];

    if (sourceExts.includes(ext)) {
      try {
        const content = fs.readFileSync(localPath, 'utf-8');
        const referencedPaths = parsePathsFromSource(content, ext);

        for (const refPath of referencedPaths) {
          let purgeTarget: string;

          if (refPath.startsWith('http://') || refPath.startsWith('https://') || refPath.startsWith('//')) {
            // Absolute URL - purge directly
            purgeTarget = refPath.startsWith('//') ? `https:${refPath}` : refPath;
          } else if (refPath.startsWith('/')) {
            // Absolute path - need to determine CDN domain from the file's FTP path
            const matchedPrefix = Object.keys(DOMAIN_MAP).find(prefix => ftpPath.startsWith(prefix));
            if (matchedPrefix) {
              purgeTarget = `${DOMAIN_MAP[matchedPrefix]}${refPath}`;
            } else {
              continue;
            }
          } else {
            // Relative path - resolve against file's directory
            const fileDir = ftpPath.substring(0, ftpPath.lastIndexOf('/'));
            const resolved = resolveRelativePath(fileDir, refPath);
            const resolvedCdnUrl = ftpPathToCdnUrl(resolved);
            if (resolvedCdnUrl) {
              purgeTarget = resolvedCdnUrl;
            } else {
              continue;
            }
          }

          const result = await purgeUrl(purgeTarget);
          results.push(result);
        }
      } catch (err: any) {
        results.push({ success: false, url: localPath, message: `Source parse error: ${err.message}` });
      }
    }

    return { success: true, results };
  });

  // Get CDN URL from FTP path
  ipcMain.handle('purge:getCdnUrl', async (_event, ftpPath: string) => {
    const cdnUrl = ftpPathToCdnUrl(ftpPath);
    return { success: !!cdnUrl, cdnUrl };
  });

  // Naver Cloud CDN+ purge
  ipcMain.handle('purge:naverCloud', async (_event, config: {
    accessKey: string;
    secretKey: string;
    cdnInstanceNo: string;
    targetFiles: string[];
    cdnDomain?: string;
  }) => {
    try {
      const results = await purgeNaverCloudCdn(
        config.accessKey,
        config.secretKey,
        config.cdnInstanceNo,
        config.targetFiles,
      );
      return { success: true, results };
    } catch (err: any) {
      return { success: false, error: err.message, results: [] };
    }
  });

  // Naver Cloud Global Edge purge (legacy: manual profileId/edgeId)
  ipcMain.handle('purge:globalEdge', async (_event, config: {
    accessKey: string;
    secretKey: string;
    profileId: string;
    edgeId: string;
    targetFiles: string[];
  }) => {
    try {
      const results = await purgeGlobalEdge(
        config.accessKey,
        config.secretKey,
        config.profileId,
        config.edgeId,
        config.targetFiles,
      );
      return { success: true, results };
    } catch (err: any) {
      return { success: false, error: err.message, results: [] };
    }
  });

  // Naver Cloud Global Edge purge by bucket name (auto mapping)
  ipcMain.handle('purge:globalEdgeByBucket', async (_event, config: {
    accessKey: string;
    secretKey: string;
    bucketName: string;
    targetFiles: string[];
  }) => {
    try {
      return await purgeGlobalEdgeByBucket(
        config.accessKey,
        config.secretKey,
        config.bucketName,
        config.targetFiles,
      );
    } catch (err: any) {
      return { success: false, error: err.message, results: [] };
    }
  });
}

// --- Naver Cloud CDN+ Purge ---

function makeNcpSignature(method: string, uri: string, timestamp: string, accessKey: string, secretKey: string): string {
  const space = ' ';
  const newLine = '\n';
  const message = method + space + uri + newLine + timestamp + newLine + accessKey;
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(message);
  return hmac.digest('base64');
}

async function purgeNaverCloudCdn(
  accessKey: string,
  secretKey: string,
  cdnInstanceNo: string,
  targetFiles: string[],
): Promise<{ success: boolean; url: string; message: string }[]> {
  const uri = '/cdn/v2/requestCdnPlusPurge';
  const method = 'POST';
  const timestamp = Date.now().toString();
  const signature = makeNcpSignature(method, uri, timestamp, accessKey, secretKey);

  const body = JSON.stringify({
    cdnInstanceNo,
    isWholePurge: 'false',
    targetFileList: targetFiles,
  });

  const responseText = await new Promise<string>((resolve, reject) => {
    const req = https.request({
      hostname: 'ncloud.apigw.ntruss.com',
      port: 443,
      path: uri,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-iam-access-key': accessKey,
        'x-ncp-apigw-signature-v2': signature,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timed out (30s)'));
    });
    req.write(body);
    req.end();
  });

  // Return result for each target file
  return targetFiles.map(file => ({
    success: true,
    url: file,
    message: responseText,
  }));
}

// --- Naver Cloud Global Edge Purge ---

// Bucket → { profileId, edgeIds[] } mapping
const BUCKET_EDGE_MAP: Record<string, { profileId: number; edgeIds: number[] }> = {
  'ai-srt-corrector':    { profileId: 4719, edgeIds: [14039, 12910] },
  'appbuild':            { profileId: 1171, edgeIds: [2750] },
  'appfile':             { profileId: 263,  edgeIds: [565, 530] },
  'bookclub-config-dev': { profileId: 2016, edgeIds: [4860, 4558] },
  'bookclub-config-prd': { profileId: 2016, edgeIds: [4565, 4557] },
  'bookclub-music':      { profileId: 340,  edgeIds: [3546, 3544] },
  'bookclubcontents':    { profileId: 340,  edgeIds: [2518, 672] },
  'bookclubmetaverse':   { profileId: 1067, edgeIds: [2855] },
  'class-1on1':          { profileId: 4517, edgeIds: [12981, 12329] },
  'class-1on1-dev':      { profileId: 4517, edgeIds: [12982, 12980] },
  'commonfile':          { profileId: 1410, edgeIds: [3946] },
  'html-resource':       { profileId: 1410, edgeIds: [3368] },
  'krs-bookcontents':    { profileId: 5125, edgeIds: [14026, 14027] },
  'metaxenglish':        { profileId: 1067, edgeIds: [2849, 2848] },
  'metaxenglish-dev':    { profileId: 1067, edgeIds: [4401, 4400] },
  'metaxtest':           { profileId: 1067, edgeIds: [2425] },
  'smartallcontents':    { profileId: 1410, edgeIds: [13435, 13434] },
  'thinkbig-hanja':      { profileId: 4889, edgeIds: [13430, 13432] },
  'thinkbig-hanja-dev':  { profileId: 4889, edgeIds: [13431, 13433] },
  'wj-fe-lms':           { profileId: 4387, edgeIds: [13946, 13935] },
};

async function purgeGlobalEdgeSingle(
  accessKey: string,
  secretKey: string,
  profileId: number,
  edgeId: number,
  targetFiles: string[],
): Promise<{ success: boolean; url: string; message: string }[]> {
  const uri = '/api/v1/purge';
  const method = 'POST';
  const timestamp = Date.now().toString();
  const signature = makeNcpSignature(method, uri, timestamp, accessKey, secretKey);

  const body = JSON.stringify({
    profileId,
    edgeId,
    purgeType: 'URL',
    purgeTarget: targetFiles,
  });

  const responseText = await new Promise<string>((resolve, reject) => {
    const req = https.request({
      hostname: 'edge.apigw.ntruss.com',
      port: 443,
      path: uri,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-iam-access-key': accessKey,
        'x-ncp-apigw-signature-v2': signature,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timed out (30s)'));
    });
    req.write(body);
    req.end();
  });

  return targetFiles.map(file => ({
    success: true,
    url: `[edge:${edgeId}] ${file}`,
    message: responseText,
  }));
}

// Legacy: purge with explicit profileId/edgeId
async function purgeGlobalEdge(
  accessKey: string,
  secretKey: string,
  profileId: string,
  edgeId: string,
  targetFiles: string[],
): Promise<{ success: boolean; url: string; message: string }[]> {
  return purgeGlobalEdgeSingle(accessKey, secretKey, Number(profileId), Number(edgeId), targetFiles);
}

// Auto purge by bucket name: looks up mapping, purges all associated edge IDs
async function purgeGlobalEdgeByBucket(
  accessKey: string,
  secretKey: string,
  bucketName: string,
  targetFiles: string[],
): Promise<{ success: boolean; results: { success: boolean; url: string; message: string }[]; skipped?: boolean }> {
  const mapping = BUCKET_EDGE_MAP[bucketName];
  if (!mapping) {
    return { success: true, results: [], skipped: true };
  }

  const allResults: { success: boolean; url: string; message: string }[] = [];

  for (const edgeId of mapping.edgeIds) {
    try {
      const results = await purgeGlobalEdgeSingle(accessKey, secretKey, mapping.profileId, edgeId, targetFiles);
      allResults.push(...results);
    } catch (err: any) {
      allResults.push(...targetFiles.map(f => ({
        success: false,
        url: `[edge:${edgeId}] ${f}`,
        message: err.message,
      })));
    }
  }

  return { success: true, results: allResults };
}

function resolveRelativePath(basePath: string, relativePath: string): string {
  const parts = basePath.split('/');
  const relParts = relativePath.split('/');

  for (const part of relParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }

  return parts.join('/');
}
