/* 大了么 · JSON 请求 / 响应辅助
 * 独立成模块是为了让 handlers.mjs 与 social.mjs 都能复用，
 * 避免两个路由模块互相 import 造成循环依赖。
 */
import { config } from './config.mjs';
import { HttpError } from './security.mjs';

export function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

export async function readJson(req) {
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) {
    throw new HttpError(415, '请求格式必须是 application/json', 'UNSUPPORTED_MEDIA_TYPE');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > config.maxBodyBytes) {
      throw new HttpError(413, '数据体积过大', 'PAYLOAD_TOO_LARGE');
    }
    chunks.push(chunk);
  }
  if (!chunks.length) throw new HttpError(400, '请求体为空', 'EMPTY_BODY');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON 格式不正确', 'BAD_JSON');
  }
}
