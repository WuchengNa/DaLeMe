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
 * 根据请求判断连接是否真正走 HTTPS。
 * - 直连 TLS 时 req.socket.encrypted 为 true；
 * - 经 Nginx 等反代时，由 X-Forwarded-Proto 透传。
 * 用「真实协议」来决定会话 Cookie 是否带 Secure 标记，
 * 避免 HTTP 部署下 Secure Cookie 被浏览器丢弃导致登录后立即掉线。
 */
export function isSecureRequest(req) {
  if (req?.socket?.encrypted) return true;
  const proto = req?.headers?.['x-forwarded-proto'];
  if (proto) return String(proto).split(',')[0].trim().toLowerCase() === 'https';
  return false;
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
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, '非法请求来源', 'BAD_ORIGIN');
  }
  /* 直接连接时用 Host 头比对；经可信反代时，Host 可能被改写为上游地址
     （如 127.0.0.1:4173），此时额外信任 X-Forwarded-Host 透传的公网主机名，
     避免合法的跨端口/反代请求被误判为非法来源（403）。 */
  const candidates = [req.headers.host];
  if (config.trustProxy && req.headers['x-forwarded-host']) {
    candidates.push(req.headers['x-forwarded-host']);
  }
  if (!candidates.some((h) => h && h === originHost)) {
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
export function applySecurityHeaders(res, req) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  };
  if (config.csp) headers['Content-Security-Policy'] = CSP;
  /* HSTS 仅在真正走 HTTPS 时下发；明文 HTTP 响应上的 HSTS 会被浏览器忽略，
     且此时应允许 HTTP 访问（个人/内网部署常见），故不再依赖静态开关。 */
  if (config.cookieSecure && req && isSecureRequest(req)) {
    headers['Strict-Transport-Security'] = 'max-age=15552000; includeSubDomains';
  }
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
}
