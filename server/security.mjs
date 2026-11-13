/* 大了么 · 安全层：限流、来源校验、响应安全头、代理感知 */
import { config } from './config.mjs';

export class HttpError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * 客户端 IP：默认取 socket 地址；TRUST_PROXY=1 时信任反向代理的
 * X-Forwarded-For 链路（取最左侧由客户端发起的地址）。
 */
export function clientIp(req) {
  if (config.trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '');
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return req.socket.remoteAddress || 'local';
}

/* ---- 内存限流：单机部署足够；多实例需换集中存储 ---- */
const rateBuckets = new Map();
const failureThrottle = new Map();

export function rateLimit(req, action, limit, windowMs) {
  const key = `${clientIp(req)}:${action}`;
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new HttpError(429, '操作过于频繁，请稍后再试', 'RATE_LIMITED');
  }
}

/**
 * 按「目标」节流（如按用户名暴力破解防护）：
 * 失败次数累计，成功后清零；超限后直接拒绝并返回剩余锁定时间。
 */
export function failureGuard(target, limit, windowMs) {
  const key = String(target).toLowerCase();
  const now = Date.now();
  const record = failureThrottle.get(key);
  if (record && record.resetAt > now && record.count >= limit) {
    const waitMinutes = Math.max(1, Math.ceil((record.resetAt - now) / 60000));
    throw new HttpError(429, `尝试次数过多，请约 ${waitMinutes} 分钟后再试`, 'TOO_MANY_ATTEMPTS');
  }
  return {
    fail() {
      const current = failureThrottle.get(key);
      if (!current || current.resetAt <= now) {
        failureThrottle.set(key, { count: 1, resetAt: now + windowMs });
      } else {
        current.count += 1;
      }
    },
    reset() {
      failureThrottle.delete(key);
    },
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  for (const [key, record] of failureThrottle) {
    if (record.resetAt <= now) failureThrottle.delete(key);
  }
}, 10 * 60 * 1000).unref();

export function checkOrigin(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    if (new URL(origin).host !== req.headers.host) {
      throw new HttpError(403, '非法请求来源', 'BAD_ORIGIN');
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, '非法请求来源', 'BAD_ORIGIN');
  }
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** 通用安全响应头（所有响应统一下发） */
export function applySecurityHeaders(res) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  };
  if (config.csp) headers['Content-Security-Policy'] = CSP;
  if (config.cookieSecure) {
    headers['Strict-Transport-Security'] = 'max-age=15552000; includeSubDomains';
  }
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
}
