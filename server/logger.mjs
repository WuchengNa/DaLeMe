/* 大了么 · 结构化日志：JSON Lines 写入日志文件，重要级别同步输出到控制台 */
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.mjs';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_LOG_BYTES = 10 * 1024 * 1024;
const MAX_LOG_KEEP = 5;

mkdirSync(config.logDir, { recursive: true });

const APP_LOG = join(config.logDir, 'app.log');
const ACCESS_LOG = join(config.logDir, 'access.log');
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function rotateIfNeeded(file) {
  try {
    if (statSync(file).size > MAX_LOG_BYTES) {
      for (let i = MAX_LOG_KEEP - 1; i >= 1; i -= 1) {
        const from = `${file}.${i}`;
        try {
          renameSync(from, `${file}.${i + 1}`);
        } catch {
          /* 文件不存在则跳过 */
        }
      }
      renameSync(file, `${file}.1`);
    }
  } catch {
    /* 首次写入前文件不存在 */
  }
}

function writeLine(file, entry) {
  try {
    rotateIfNeeded(file);
    appendFileSync(file, `${JSON.stringify(entry)}\n`);
  } catch {
    /* 日志写入失败不影响业务 */
  }
}

function consoleLine(level, event, fields) {
  const prefix = { info: '', warn: '[警告] ', error: '[错误] ', debug: '[调试] ' }[level] || '';
  const detail = fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : '';
  return `${prefix}${event}${detail}`;
}

function emit(level, event, fields = {}) {
  if ((LEVELS[level] ?? LEVELS.info) < threshold) return;
  const entry = { t: new Date().toISOString(), level, event, ...fields };
  writeLine(APP_LOG, entry);
  if (level === 'warn' || level === 'error' || level === 'info') {
    console.log(consoleLine(level, event, fields));
  }
}

function serializeError(error) {
  return {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
    code: error?.code,
  };
}

export const log = {
  debug: (event, fields) => emit('debug', event, fields),
  info: (event, fields) => emit('info', event, fields),
  warn: (event, fields) => emit('warn', event, fields),
  error: (event, error, fields = {}) => emit('error', event, { error: serializeError(error), ...fields }),

  access({ method, path, status, ms, ip, userId, bytes }) {
    const entry = {
      t: new Date().toISOString(),
      level: status >= 500 ? 'error' : 'info',
      event: 'access',
      method,
      path,
      status,
      ms: Math.round(ms),
      ip,
      ...(userId ? { userId } : {}),
      ...(bytes !== undefined ? { bytes } : {}),
    };
    writeLine(ACCESS_LOG, entry);
    if ((LEVELS[entry.level] ?? LEVELS.info) >= threshold) {
      console.log(`${entry.method} ${entry.path} ${entry.status} ${entry.ms}ms ${ip}`);
    }
  },
};
