/* 大了么 · 密码哈希与会话管理 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.mjs';
import { stmt } from './db.mjs';
import { HttpError } from './security.mjs';

const SESSION_MAX_AGE = config.sessionDays * 24 * 60 * 60;
const scryptAsync = promisify(scrypt);

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at || row.createdAt,
    avatarVersion: stmt.getAvatarVersion.get(row.id)?.version || null,
  };
}

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scryptAsync(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

export async function verifyPassword(password, salt, expectedHex) {
  try {
    const derived = await scryptAsync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = Buffer.from(derived);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** 创建会话；超出单用户会话上限时清理最早的会话 */
export function createSession(userId) {
  const count = stmt.countSessionsByUser.get(userId)?.n || 0;
  if (count >= config.limits.maxSessionsPerUser) {
    const stale = stmt.oldestSessions.all(userId, count - config.limits.maxSessionsPerUser + 1);
    for (const row of stale) stmt.deleteSession.run(row.token_hash);
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  stmt.insertSession.run(hashToken(token), userId, expiresAt, new Date().toISOString());
  return { token, expiresAt, tokenHash: hashToken(token) };
}

/**
 * maxAge === null 表示「会话级 Cookie」：不带 Max-Age / Expires，
 * 浏览器关闭后即失效，用于「每次打开都需要登录」。
 */
export function sessionCookie(token, maxAge = SESSION_MAX_AGE) {
  const parts = [
    `lt_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`);
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

export function getUserFromRequest(req) {
  const token = parseCookies(req).lt_session;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = stmt.findSession.get(tokenHash);
  if (!row) return null;
  if (Number(row.expires_at) <= Date.now()) {
    stmt.deleteSession.run(tokenHash);
    return null;
  }
  return { id: row.id, username: row.username, createdAt: row.created_at, tokenHash };
}

export function requireUser(req) {
  const user = getUserFromRequest(req);
  if (!user) throw new HttpError(401, '请先登录账号', 'UNAUTHORIZED');
  return user;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      /* 非法编码的 Cookie 直接忽略 */
    }
  }
  return cookies;
}
