/* 大了么 · 配置中心：集中读取、校验环境变量，启动前快速失败 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readInt(name, fallback, { min = 1, max = 2 ** 31 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`环境变量 ${name} 必须是 ${min}–${max} 之间的整数，当前值：${JSON.stringify(raw)}`);
  }
  return value;
}

function readBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw === 'true';
}

const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(ROOT, 'data');

export const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

export const config = {
  root: ROOT,
  version: VERSION,
  host: process.env.HOST || '127.0.0.1',
  port: readInt('PORT', 4173, { min: 1, max: 65535 }),

  dataDir,
  dbPath: process.env.DB_PATH ? resolve(process.env.DB_PATH) : join(dataDir, 'liantrace.db'),
  logDir: process.env.LOG_DIR ? resolve(process.env.LOG_DIR) : join(ROOT, 'logs'),

  /** debug | info | warn | error */
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),

  /** 反向代理（Nginx / Caddy 等）后部署时设为 1，日志与限流将使用 X-Forwarded-For */
  trustProxy: readBool('TRUST_PROXY', false),

  /** HTTPS 部署时设为 1：Cookie 加 Secure，并下发 HSTS */
  cookieSecure: readBool('COOKIE_SECURE', false),

  /** 设为 0 可临时关闭 CSP（仅排障用，勿在生产关闭） */
  csp: readBool('CSP', true),

  sessionDays: readInt('SESSION_DAYS', 30, { min: 1, max: 365 }),
  maxBodyBytes: readInt('MAX_BODY_BYTES', 6 * 1024 * 1024, { min: 1024 }),

  /** 头像上传体积上限（字节），前端会先裁剪压缩 */
  avatarMaxBytes: readInt('AVATAR_MAX_BYTES', 512 * 1024, {
    min: 16 * 1024,
    max: 5 * 1024 * 1024,
  }),

  limits: {
    registerPerHour: readInt('REGISTER_LIMIT', 8, { min: 1 }),
    loginPerWindow: readInt('LOGIN_LIMIT', 20, { min: 1 }),
    loginPerUser: readInt('LOGIN_USER_LIMIT', 10, { min: 1 }),
    maxSessionsPerUser: readInt('MAX_SESSIONS_PER_USER', 20, { min: 1 }),
    avatarPerHour: readInt('AVATAR_LIMIT', 30, { min: 1 }),
  },

  backup: {
    keep: readInt('BACKUP_KEEP', 7, { min: 1, max: 365 }),
    onStart: readBool('BACKUP_ON_START', true),
  },
};

if (!['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
  throw new Error(`LOG_LEVEL 只能是 debug / info / warn / error，当前值：${config.logLevel}`);
}
