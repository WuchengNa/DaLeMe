/* 大了么 · API 路由：认证、数据同步、账号管理、头像、健康检查 */
import { randomBytes } from 'node:crypto';

import { config } from './config.mjs';
import { parseAvatarImage } from './avatar.mjs';
import { stmt, checkIntegrity } from './db.mjs';
import { readJson, sendJson } from './json.mjs';
import { routeSocial } from './social.mjs';
import {
  createSession,
  getUserFromRequest,
  hashPassword,
  publicUser,
  requireUser,
  sessionCookie,
  verifyPassword,
} from './auth.mjs';
import {
  HttpError,
  checkOrigin,
  clientIp,
  failureGuard,
  isSecureRequest,
  rateLimit,
} from './security.mjs';
import { log } from './logger.mjs';

const startedAt = Date.now();

/* 兼容旧调用方：这两个辅助原本定义在本文件 */
export { readJson, sendJson };

function validatePassword(value) {
  const password = String(value ?? '');
  if (password.length < 8 || password.length > 72) {
    throw new HttpError(400, '密码长度需在 8–72 个字符之间', 'BAD_PASSWORD');
  }
  return password;
}

function validateUsername(body) {
  const username = String(body?.username ?? '').trim();
  if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(username)) {
    throw new HttpError(400, '用户名需为 2–24 个字符，只能包含文字、数字、下划线或短横线', 'BAD_USERNAME');
  }
  return username;
}

function validateState(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, '训练数据格式不正确', 'BAD_STATE');
  }
  if (data.schema !== 1 || !Array.isArray(data.plans) || !Array.isArray(data.workouts)) {
    throw new HttpError(400, '训练数据缺少必要字段', 'BAD_STATE');
  }
  if (typeof data.settings !== 'object' || data.settings === null) {
    throw new HttpError(400, '训练设置格式不正确', 'BAD_STATE');
  }
  if (data.plans.length > 200 || data.workouts.length > 50000) {
    throw new HttpError(400, '训练数据条数超出限制', 'STATE_TOO_LARGE');
  }
}

function getCloudData(userId) {
  const row = stmt.getData.get(userId);
  if (!row) return { data: null, revision: 0, updatedAt: null };
  let data;
  try {
    data = JSON.parse(row.payload);
  } catch {
    throw new HttpError(500, '云端数据损坏，请联系管理员', 'CLOUD_DATA_CORRUPT');
  }
  return { data, revision: row.revision, updatedAt: row.updated_at };
}

async function handleRegister(req, res) {
  rateLimit(req, 'register', config.limits.registerPerHour, 60 * 60 * 1000);
  const body = await readJson(req);
  const username = validateUsername(body);
  const password = validatePassword(body.password);
  if (body?.confirmPassword !== undefined && String(body.confirmPassword) !== password) {
    throw new HttpError(400, '两次输入的密码不一致', 'PASSWORD_MISMATCH');
  }
  if (stmt.findUser.get(username)) {
    throw new HttpError(409, '这个用户名已经被注册了', 'USERNAME_TAKEN');
  }
  const id = `usr_${randomBytes(12).toString('base64url')}`;
  const { salt, hash } = await hashPassword(password);
  try {
    stmt.insertUser.run(id, username, hash, salt, new Date().toISOString());
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      throw new HttpError(409, '这个用户名已经被注册了', 'USERNAME_TAKEN');
    }
    throw error;
  }
  const row = stmt.findUserById.get(id);
  const session = createSession(id);
  const remember = body?.remember === true;
  log.info('user.registered', { userId: id, ip: clientIp(req), remember });
  return sendJson(res, 201, { ok: true, user: publicUser(row), cloud: null }, {
    'Set-Cookie': sessionCookie(session.token, remember ? undefined : null, isSecureRequest(req)),
  });
}

async function handleLogin(req, res) {
  rateLimit(req, 'login', config.limits.loginPerWindow, 15 * 60 * 1000);
  const body = await readJson(req);
  const username = validateUsername(body);
  const password = String(body?.password ?? '');
  const guard = failureGuard(`login:${username}`, config.limits.loginPerUser, 15 * 60 * 1000);
  const row = stmt.findUser.get(username);
  const valid = row ? await verifyPassword(password, row.salt, row.password_hash) : false;
  if (!valid) {
    guard.fail();
    log.warn('auth.login_failed', { username, ip: clientIp(req) });
    throw new HttpError(401, '用户名或密码错误', 'INVALID_CREDENTIALS');
  }
  guard.reset();
  const session = createSession(row.id);
  const remember = body?.remember === true;
  log.info('auth.login', { userId: row.id, ip: clientIp(req), remember });
  return sendJson(res, 200, { ok: true, user: publicUser(row), cloud: null }, {
    'Set-Cookie': sessionCookie(session.token, remember ? undefined : null, isSecureRequest(req)),
  });
}

async function handlePasswordChange(req, res) {
  rateLimit(req, 'password', 10, 60 * 60 * 1000);
  const user = requireUser(req);
  const body = await readJson(req);
  const newPassword = validatePassword(body?.newPassword);
  const row = stmt.findUserById.get(user.id);
  const ok = await verifyPassword(String(body?.currentPassword ?? ''), row.salt, row.password_hash);
  if (!ok) throw new HttpError(401, '当前密码不正确', 'INVALID_CREDENTIALS');
  if (newPassword === String(body?.currentPassword ?? '')) {
    throw new HttpError(400, '新密码不能和当前密码相同', 'PASSWORD_UNCHANGED');
  }
  const { salt, hash } = await hashPassword(newPassword);
  stmt.updatePassword.run(hash, salt, user.id);
  /* 吊销其他设备上的会话，保留当前会话 */
  stmt.deleteOtherSessionsByUser.run(user.id, user.tokenHash);
  log.info('auth.password_changed', { userId: user.id, ip: clientIp(req) });
  return sendJson(res, 200, { ok: true });
}

async function handleLogoutAll(req, res) {
  const user = requireUser(req);
  stmt.deleteAllSessionsByUser.run(user.id);
  log.info('auth.logout_all', { userId: user.id, ip: clientIp(req) });
  return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0, isSecureRequest(req)) });
}

async function handleDeleteAccount(req, res) {
  rateLimit(req, 'delete-account', 5, 60 * 60 * 1000);
  const user = requireUser(req);
  const body = await readJson(req);
  const row = stmt.findUserById.get(user.id);
  const ok = await verifyPassword(String(body?.password ?? ''), row.salt, row.password_hash);
  if (!ok) throw new HttpError(401, '密码不正确', 'INVALID_CREDENTIALS');
  stmt.deleteUser.run(user.id); /* 级联删除会话与云端数据 */
  log.warn('account.deleted', { userId: user.id, ip: clientIp(req) });
  return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0, isSecureRequest(req)) });
}

/* ---------------- 头像 ---------------- */

async function handleAvatarUpload(req, res) {
  rateLimit(req, 'avatar', config.limits.avatarPerHour, 60 * 60 * 1000);
  const user = requireUser(req);
  const body = await readJson(req);
  const image = parseAvatarImage(body?.image);
  stmt.upsertAvatar.run(user.id, image.mime, image.data, image.version, new Date().toISOString());
  log.info('avatar.updated', {
    userId: user.id,
    ip: clientIp(req),
    bytes: image.data.length,
    size: `${image.width}x${image.height}`,
  });
  return sendJson(res, 200, { ok: true, avatarVersion: image.version });
}

function handleAvatarGet(req, res, url) {
  /* 头像只属于当前登录账号，接口不接收任何用户标识，天然隔离 */
  const user = requireUser(req);
  const row = stmt.getAvatar.get(user.id);
  if (!row) throw new HttpError(404, '还没有设置头像', 'NO_AVATAR');
  const body = Buffer.from(row.data);
  const requestedVersion = url.searchParams.get('v');
  const versionValid = requestedVersion !== null && requestedVersion === row.version;
  const headers = {
    'Content-Type': row.mime,
    'Content-Length': body.length,
    'Cache-Control': versionValid
      ? 'private, max-age=31536000, immutable'
      : 'private, no-cache, must-revalidate',
    ETag: `"${row.version}"`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  };
  if (req.headers['if-none-match'] === headers.ETag) {
    res.writeHead(304, { ETag: headers.ETag, 'Cache-Control': headers['Cache-Control'] });
    res.end();
    return;
  }
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function handleAvatarDelete(req, res) {
  const user = requireUser(req);
  const removed = stmt.deleteAvatar.run(user.id);
  log.info('avatar.deleted', { userId: user.id, ip: clientIp(req), removed: removed.changes });
  return sendJson(res, 200, { ok: true, avatarVersion: null });
}

function handleHealth(res) {
  let database = 'ok';
  try {
    stmt.ping.get();
    if (!checkIntegrity()) database = 'degraded';
  } catch {
    database = 'down';
  }
  return sendJson(res, database === 'ok' ? 200 : 503, {
    ok: database === 'ok',
    service: 'daleme',
    version: config.version,
    database,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    time: new Date().toISOString(),
  });
}

export async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (pathname === '/api/health' && method === 'GET') return handleHealth(res);

  /* 社交模块：大大广场、关注、用户主页、点赞与他人头像 */
  if (pathname.startsWith('/api/social/')) {
    if (await routeSocial(req, res, url)) return;
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    checkOrigin(req);
    return handleRegister(req, res);
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    checkOrigin(req);
    return handleLogin(req, res);
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    checkOrigin(req);
    const user = getUserFromRequest(req);
    if (user) stmt.deleteSession.run(user.tokenHash);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0, isSecureRequest(req)) });
  }

  if (pathname === '/api/auth/logout-all' && method === 'POST') {
    checkOrigin(req);
    return handleLogoutAll(req, res);
  }

  if (pathname === '/api/auth/password' && method === 'PUT') {
    checkOrigin(req);
    return handlePasswordChange(req, res);
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = getUserFromRequest(req);
    return sendJson(res, 200, { ok: true, user: user ? publicUser(user) : null });
  }

  if (pathname === '/api/account' && method === 'DELETE') {
    checkOrigin(req);
    return handleDeleteAccount(req, res);
  }

  if (pathname === '/api/avatar' && (method === 'GET' || method === 'HEAD')) {
    return handleAvatarGet(req, res, url);
  }

  if (pathname === '/api/avatar' && method === 'PUT') {
    checkOrigin(req);
    return handleAvatarUpload(req, res);
  }

  if (pathname === '/api/avatar' && method === 'DELETE') {
    checkOrigin(req);
    return handleAvatarDelete(req, res);
  }

  if (pathname === '/api/data' && method === 'GET') {
    const user = requireUser(req);
    const cloud = getCloudData(user.id);
    return sendJson(res, 200, { ok: true, ...cloud });
  }

  if (pathname === '/api/data' && method === 'PUT') {
    checkOrigin(req);
    const user = requireUser(req);
    const body = await readJson(req);
    validateState(body?.data);
    const payload = JSON.stringify(body.data);
    const now = new Date().toISOString();
    const existing = stmt.getData.get(user.id);
    if (existing) stmt.updateData.run(payload, now, user.id);
    else stmt.insertData.run(user.id, payload, now);
    const saved = stmt.getData.get(user.id);
    return sendJson(res, 200, { ok: true, revision: saved.revision, updatedAt: saved.updated_at });
  }

  throw new HttpError(404, '接口不存在', 'NOT_FOUND');
}
