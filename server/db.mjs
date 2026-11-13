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

  /* 社交：公开资料（广场上展示的昵称 / 简介，与私密训练数据分离） */
  CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  /* 社交：关注关系（有向边，互相关注即两条记录） */
  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (follower_id, followee_id)
  );

  /* 社交：分享到广场的训练动态。payload 为发布时固化的训练快照，
     不随之后的记录修改而变化，也不暴露用户的完整训练数据。 */
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workout_id TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS post_likes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC);
  /* 同一次训练只允许分享一次，避免广场被重复动态刷屏 */
  CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_user_workout ON posts(user_id, workout_id);
  CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
`);

/* 社交列表的公共 SELECT：一条查询同时带出作者资料、关注 / 粉丝 / 动态数与
   「我是否已关注」。第一个占位符永远是浏览者自己的 user_id。 */
const USER_CARD_SELECT = `
  SELECT u.id, u.username,
         COALESCE(NULLIF(pr.display_name, ''), u.username) AS display_name,
         COALESCE(pr.bio, '') AS bio,
         (SELECT version FROM avatars a WHERE a.user_id = u.id) AS avatar_version,
         (SELECT COUNT(*) FROM follows f1 WHERE f1.followee_id = u.id) AS follower_count,
         (SELECT COUNT(*) FROM follows f2 WHERE f2.follower_id = u.id) AS following_count,
         (SELECT COUNT(*) FROM posts p1 WHERE p1.user_id = u.id) AS post_count,
         EXISTS(SELECT 1 FROM follows f3 WHERE f3.follower_id = ? AND f3.followee_id = u.id) AS is_following
  FROM users u
  LEFT JOIN profiles pr ON pr.user_id = u.id`;

/* 广场动态 SELECT：liked / is_following 相对浏览者计算，前两个占位符均为浏览者 */
const POST_SELECT = `
  SELECT p.id, p.user_id, p.workout_id, p.caption, p.payload, p.created_at,
         u.username,
         COALESCE(NULLIF(pr.display_name, ''), u.username) AS display_name,
         (SELECT version FROM avatars a WHERE a.user_id = p.user_id) AS avatar_version,
         (SELECT COUNT(*) FROM post_likes l1 WHERE l1.post_id = p.id) AS like_count,
         EXISTS(SELECT 1 FROM post_likes l2 WHERE l2.post_id = p.id AND l2.user_id = ?) AS liked,
         EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = p.user_id) AS is_following
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN profiles pr ON pr.user_id = u.id`;

const FEED_ORDER = ' ORDER BY p.created_at DESC, p.id DESC LIMIT ?';

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

  /* ---------------- 社交 ---------------- */
  getProfile: db.prepare('SELECT user_id, display_name, bio, updated_at FROM profiles WHERE user_id = ?'),
  upsertProfile: db.prepare(`
    INSERT INTO profiles (user_id, display_name, bio, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = excluded.display_name, bio = excluded.bio, updated_at = excluded.updated_at
  `),

  insertFollow: db.prepare(
    'INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)',
  ),
  deleteFollow: db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?'),
  countFollowers: db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?'),
  countFollowing: db.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?'),

  insertPost: db.prepare(
    'INSERT INTO posts (id, user_id, workout_id, caption, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ),
  deletePost: db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?'),
  findPostOwner: db.prepare('SELECT user_id FROM posts WHERE id = ?'),
  countPostsByUser: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?'),

  insertLike: db.prepare(
    'INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)',
  ),
  deleteLike: db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?'),
  countLikes: db.prepare('SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?'),

  /* 列表查询：占位符顺序见 social.mjs 调用处
     （浏览者 ×2 → 游标 created_at ×2 + id → limit） */
  feedAll: db.prepare(
    `${POST_SELECT}
     WHERE (? IS NULL OR p.created_at < ? OR (p.created_at = ? AND p.id < ?))${FEED_ORDER}`,
  ),
  feedFollowing: db.prepare(`
    ${POST_SELECT}
    WHERE (p.user_id = ? OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?))
      AND (? IS NULL OR p.created_at < ? OR (p.created_at = ? AND p.id < ?))${FEED_ORDER}`),
  postById: db.prepare(`${POST_SELECT} WHERE p.id = ?`),
  postsByUser: db.prepare(
    `${POST_SELECT}
     WHERE p.user_id = ? AND (? IS NULL OR p.created_at < ? OR (p.created_at = ? AND p.id < ?))${FEED_ORDER}`,
  ),
  userCard: db.prepare(`${USER_CARD_SELECT} WHERE u.id = ?`),
  searchUsers: db.prepare(`
    ${USER_CARD_SELECT}
    WHERE u.id != ? AND (u.username LIKE ? OR COALESCE(pr.display_name, '') LIKE ?)
    ORDER BY post_count DESC, follower_count DESC, u.created_at DESC LIMIT ?`),
  suggestUsers: db.prepare(`
    ${USER_CARD_SELECT}
    WHERE u.id != ?
      AND NOT EXISTS(SELECT 1 FROM follows f6 WHERE f6.follower_id = ? AND f6.followee_id = u.id)
    ORDER BY post_count DESC, follower_count DESC, u.created_at DESC LIMIT ?`),
  listFollowers: db.prepare(`
    ${USER_CARD_SELECT}
    JOIN follows f4 ON f4.follower_id = u.id
    WHERE f4.followee_id = ? ORDER BY f4.created_at DESC LIMIT ?`),
  listFollowing: db.prepare(`
    ${USER_CARD_SELECT}
    JOIN follows f5 ON f5.followee_id = u.id
    WHERE f5.follower_id = ? ORDER BY f5.created_at DESC LIMIT ?`),
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
