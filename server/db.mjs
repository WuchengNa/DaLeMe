/* 大了么 · SQLite 数据库：连接、Schema、预编译语句、备份与一致性检查 */
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.mjs';

mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
  PRAGMA wal_autocheckpoint = 400;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_data (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  /* 头像独立存放，避免每次训练同步都重传整份图片数据 */
  CREATE TABLE IF NOT EXISTS avatars (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    version TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

export const stmt = {
  ping: db.prepare('SELECT 1 AS ok'),
  findUser: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  findUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser: db.prepare(
    'INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)',
  ),
  updatePassword: db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?'),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
  insertSession: db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ),
  findSession: db.prepare(`
    SELECT s.token_hash, s.user_id, s.expires_at, u.id, u.username, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteAllSessionsByUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  deleteOtherSessionsByUser: db.prepare(
    'DELETE FROM sessions WHERE user_id = ? AND token_hash != ?',
  ),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  countSessionsByUser: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?'),
  oldestSessions: db.prepare(`
    SELECT token_hash FROM sessions WHERE user_id = ?
    ORDER BY expires_at ASC LIMIT ?
  `),
  getData: db.prepare(
    'SELECT user_id, payload, revision, updated_at FROM user_data WHERE user_id = ?',
  ),
  insertData: db.prepare(
    'INSERT INTO user_data (user_id, payload, revision, updated_at) VALUES (?, ?, 1, ?)',
  ),
  updateData: db.prepare(
    'UPDATE user_data SET payload = ?, revision = revision + 1, updated_at = ? WHERE user_id = ?',
  ),
  getAvatar: db.prepare('SELECT mime, data, version FROM avatars WHERE user_id = ?'),
  getAvatarVersion: db.prepare('SELECT version FROM avatars WHERE user_id = ?'),
  upsertAvatar: db.prepare(`
    INSERT INTO avatars (user_id, mime, data, version, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      mime = excluded.mime, data = excluded.data,
      version = excluded.version, updated_at = excluded.updated_at
  `),
  deleteAvatar: db.prepare('DELETE FROM avatars WHERE user_id = ?'),
};

/* ---------------- 备份 ---------------- */

const BACKUP_DIR = join(config.dataDir, 'backups');

/** 用 VACUUM INTO 生成一致性快照（对 WAL 数据库安全），并按保留数量清理旧备份 */
export function runBackup() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = join(BACKUP_DIR, `liantrace-${stamp}.db`);
  db.prepare('VACUUM INTO ?').run(target);

  const files = readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const path = join(BACKUP_DIR, name);
      return { path, mtime: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  for (const stale of files.slice(config.backup.keep)) {
    try {
      unlinkSync(stale.path);
    } catch {
      /* 忽略清理失败 */
    }
  }
  return target;
}

export function checkIntegrity() {
  const row = db.prepare('PRAGMA quick_check').get();
  return row && Object.values(row)[0] === 'ok';
}

export function closeDb() {
  try {
    db.close();
  } catch {
    /* 忽略重复关闭 */
  }
}

export const DB_FILE = basename(config.dbPath);
