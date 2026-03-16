import { ipcMain } from 'electron';
import { getDb, persistDb } from '../db';

// sql.js helper: run a query and return rows as array of objects
function queryAll(sql: string, params: any[] = []): any[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql: string, params: any[] = []): any | null {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function runSql(sql: string, params: any[] = []): void {
  const db = getDb();
  db.run(sql, params);
  persistDb();
}

export function registerHistoryHandlers(): void {
  ipcMain.handle('history:add', async (_event, record: {
    cdn_type: string;
    local_path: string;
    remote_path: string;
    original_filename: string;
    uploaded_filename: string;
    file_size: number;
    status: string;
    purge_status?: string;
    purge_urls?: string;
    error_message?: string;
  }) => {
    runSql(
      `INSERT INTO upload_history (cdn_type, local_path, remote_path, original_filename,
        uploaded_filename, file_size, status, purge_status, purge_urls, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.cdn_type,
        record.local_path,
        record.remote_path,
        record.original_filename,
        record.uploaded_filename,
        record.file_size,
        record.status,
        record.purge_status || null,
        record.purge_urls || null,
        record.error_message || null,
      ]
    );
    const row = queryOne('SELECT last_insert_rowid() as id');
    return { success: true, id: row?.id };
  });

  ipcMain.handle('history:update', async (_event, id: number, updates: Record<string, any>) => {
    const keys = Object.keys(updates);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => updates[k]);
    runSql(`UPDATE upload_history SET ${setClause} WHERE id = ?`, [...values, id]);
    return { success: true };
  });

  ipcMain.handle('history:list', async (_event, options: {
    limit?: number;
    offset?: number;
    cdnType?: string;
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    let where = '1=1';
    const params: any[] = [];

    if (options.cdnType) {
      where += ' AND cdn_type = ?';
      params.push(options.cdnType);
    }
    if (options.status) {
      where += ' AND status = ?';
      params.push(options.status);
    }
    if (options.search) {
      where += ' AND (original_filename LIKE ? OR remote_path LIKE ?)';
      params.push(`%${options.search}%`, `%${options.search}%`);
    }
    if (options.startDate) {
      where += ' AND created_at >= ?';
      params.push(options.startDate);
    }
    if (options.endDate) {
      where += ' AND created_at <= ?';
      params.push(options.endDate);
    }

    const countResult = queryOne(
      `SELECT COUNT(*) as total FROM upload_history WHERE ${where}`,
      params
    );

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const items = queryAll(
      `SELECT * FROM upload_history WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return { success: true, items, total: countResult?.total || 0 };
  });

  ipcMain.handle('history:get', async (_event, id: number) => {
    const item = queryOne('SELECT * FROM upload_history WHERE id = ?', [id]);
    return { success: true, item };
  });

  ipcMain.handle('history:delete', async (_event, id: number) => {
    runSql('DELETE FROM upload_history WHERE id = ?', [id]);
    return { success: true };
  });

  ipcMain.handle('history:clear', async () => {
    runSql('DELETE FROM upload_history');
    return { success: true };
  });

  ipcMain.handle('history:stats', async () => {
    const stats = queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(file_size) as total_size
      FROM upload_history
    `);
    return { success: true, stats: stats || { total: 0, success_count: 0, failed_count: 0, total_size: 0 } };
  });
}
