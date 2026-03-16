import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let db: SqlJsDatabase;
let dbPath: string;

function saveDb(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

export async function initDatabase(): Promise<void> {
  dbPath = path.join(app.getPath('userData'), 'wjftp_history.db');

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS upload_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cdn_type TEXT NOT NULL,
      local_path TEXT NOT NULL,
      remote_path TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      uploaded_filename TEXT NOT NULL,
      file_size INTEGER,
      status TEXT NOT NULL,
      purge_status TEXT,
      purge_urls TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_history_status ON upload_history(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_history_cdn ON upload_history(cdn_type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_history_created ON upload_history(created_at)');

  saveDb();
}

export function getDb(): SqlJsDatabase {
  return db;
}

export function persistDb(): void {
  saveDb();
}
