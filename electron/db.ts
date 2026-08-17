import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  error TEXT
);
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  last_message TEXT,
  last_ts TEXT,
  unread INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wa_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  chat_name TEXT NOT NULL DEFAULT '',
  from_me INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wa_chat ON wa_messages(chat_id);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL,
  preview TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  provider TEXT NOT NULL DEFAULT 'local',
  avatar TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'reminder',
  note TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth (
  provider TEXT PRIMARY KEY,
  client_id TEXT NOT NULL DEFAULT '',
  client_secret TEXT NOT NULL DEFAULT ''
);
`

export interface DB {
  init(): Promise<void>
  getDbPath(): string
  run(sql: string, params?: unknown[]): number
  all<T>(sql: string, params?: unknown[]): T[]
  get<T>(sql: string, params?: unknown[]): T | undefined
  exec(sql: string): void
  save(): Promise<void>
  close(): void
}

class SqliteDb implements DB {
  private SQL!: SqlJsStatic
  private db!: Database
  private dbPath = ''
  private saveQueued = false

  async init(): Promise<void> {
    this.SQL = await initSqlJs({
      locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file)
    })
    const dir = app.getPath('userData')
    await fs.mkdir(dir, { recursive: true })
    this.dbPath = path.join(dir, 'toqi.db')

    let buffer: Buffer | undefined
    try {
      buffer = await fs.readFile(this.dbPath)
    } catch {
      buffer = undefined
    }
    this.db = buffer ? new this.SQL.Database(buffer) : new this.SQL.Database()
    this.exec(SCHEMA)
    this.migrate()
    await this.save()
  }

  private migrate(): void {
    const columns = (table: string): string[] => {
      const stmt = this.db.prepare(`PRAGMA table_info(${table})`)
      const out: string[] = []
      try {
        while (stmt.step()) out.push((stmt.getAsObject() as { name: string }).name)
      } finally {
        stmt.free()
      }
      return out
    }
    const session = this.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'sessionUserId'`)
    const owner = session ? Number(session.value) : null
    if (!columns('conversations').includes('user_id')) {
      this.db.exec(`ALTER TABLE conversations ADD COLUMN user_id INTEGER`)
      if (owner) this.db.exec(`UPDATE conversations SET user_id = ${owner} WHERE user_id IS NULL`)
    }
    if (!columns('reminders').includes('user_id')) {
      this.db.exec(`ALTER TABLE reminders ADD COLUMN user_id INTEGER`)
      if (owner) this.db.exec(`UPDATE reminders SET user_id = ${owner} WHERE user_id IS NULL`)
    }
  }

  getDbPath(): string {
    return this.dbPath
  }

  run(sql: string, params: unknown[] = []): number {
    this.db.run(sql, params as never[])
    const stmt = this.db.prepare('SELECT last_insert_rowid() AS id')
    let id = 0
    try {
      stmt.bind()
      while (stmt.step()) {
        id = (stmt.getAsObject() as { id: number }).id
      }
    } finally {
      stmt.free()
    }
    this.queueSave()
    return id
  }

  all<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params as never[])
      const rows: T[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T)
      }
      return rows
    } finally {
      stmt.free()
    }
  }

  get<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  exec(sql: string): void {
    this.db.exec(sql)
    this.queueSave()
  }

  private queueSave(): void {
    if (this.saveQueued) return
    this.saveQueued = true
    setImmediate(() => {
      void this.save().finally(() => {
        this.saveQueued = false
      })
    })
  }

  async save(): Promise<void> {
    if (!this.db || !this.dbPath) return
    const data = Buffer.from(this.db.export())
    await fs.writeFile(this.dbPath, data)
  }

  close(): void {
    if (this.db) this.db.close()
  }
}

export const db: DB = new SqliteDb()
