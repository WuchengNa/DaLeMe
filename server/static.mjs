/* 大了么 · 静态资源：白名单目录、内容版本化 URL、ETag/304、gzip 压缩、缓存策略 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { config } from './config.mjs';
import { HttpError } from './security.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const COMPRESSIBLE = new Set([
  'text/html', 'text/css', 'text/plain', 'text/javascript', 'application/json',
  'application/manifest+json', 'image/svg+xml',
]);

const TEXT_EXT = /\.(?:html|js|mjs|css|json|webmanifest|svg|txt)$/;
const MAX_STATIC_BYTES = 20 * 1024 * 1024;
const ASSETS_DIR = join(config.root, 'assets');

/* 动作库媒体：文件名带上游 media_id，内容不会变，可长期缓存；
   且它们是二进制，不参与构建指纹、不需要 gzip 或内容哈希。 */
const EXERCISE_MEDIA_RE = /^assets\/exercises\/(?:images|videos)\//;

/* ------------------------------------------------------------------
   构建指纹：任一 assets 文件变化 → BUILD_ID 变化 → 所有资源 URL 变化。
   这样部署新版本后，浏览器不会因为强缓存继续使用旧版 JS/CSS，
   且未变化的文件仍能命中 immutable 长缓存。
   ------------------------------------------------------------------ */
let buildId = '';
let buildCheckedAt = 0;
const preparedCache = new Map();

function collectAssetFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'images' || entry.name === 'videos') continue;
      collectAssetFiles(full, out);
    } else if (/\.(?:js|mjs|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function computeBuildId() {
  const hash = createHash('sha256');
  const files = collectAssetFiles(ASSETS_DIR).sort();
  for (const file of files) {
    hash.update(file.slice(config.root.length).split(sep).join('/')).update('\0');
    hash.update(readFileSync(file)).update('\0');
  }
  return hash.digest('base64url').slice(0, 12);
}

/** 开发时每秒重算一次；生产环境文件内容不变，指纹恒定 */
function currentBuildId() {
  const now = Date.now();
  if (!buildId || now - buildCheckedAt > 1000) {
    const next = computeBuildId();
    if (next !== buildId) {
      buildId = next;
      preparedCache.clear();
    }
    buildCheckedAt = now;
  }
  return buildId;
}

const HTML_ASSET_RE = /((?:src|href)=)(["'])(\.\/assets\/[^"']+?\.(?:js|mjs|css))\2/g;
const JS_IMPORT_RE = /(\bfrom\s+|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"']+?\.(?:js|mjs))\2/g;

function withVersion(spec, build) {
  return spec.includes('?') ? spec : `${spec}?v=${build}`;
}

/** 给 index.html 的 script/link 以及 JS 模块内的相对 import 追加版本参数 */
function rewriteContent(relativePath, text, build) {
  if (relativePath === 'index.html') {
    const versioned = text.replace(
      HTML_ASSET_RE,
      (_, prefix, quote, spec) => `${prefix}${quote}${withVersion(spec, build)}${quote}`,
    );
    /* 把构建指纹写进 <html>，前端页脚可显示，方便确认客户端是否为最新版本 */
    return versioned.replace(/<html\b([^>]*)>/, (_, attrs) =>
      `<html${attrs.replace(/\s+data-build="[^"]*"/g, '')} data-build="${build}">`);
  }
  if (/\.(?:js|mjs)$/.test(relativePath)) {
    return text.replace(
      JS_IMPORT_RE,
      (_, prefix, quote, spec) => `${prefix}${quote}${withVersion(spec, build)}${quote}`,
    );
  }
  return text;
}

function cacheControlFor(relativePath, versionValid) {
  /* 入口永远取最新，避免反向代理 / 手机浏览器缓存住旧版资源清单 */
  if (relativePath === 'index.html') return 'no-store, must-revalidate';
  /* 动作库 GIF / 缩略图按内容命名，永不变化 */
  if (EXERCISE_MEDIA_RE.test(relativePath)) return 'public, max-age=31536000, immutable';
  /* 带当前版本指纹的 URL 内容永不变，可安全长期缓存 */
  if (versionValid) return 'public, max-age=31536000, immutable';
  /* 无版本或版本过期的 URL（旧客户端、直接访问）：每次协商，保证能拿到新内容 */
  return 'no-cache, must-revalidate';
}

export function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new HttpError(400, '非法路径', 'BAD_PATH');
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const filePath = resolve(config.root, `.${normalize(pathname)}`);
  const rootPrefix = config.root.endsWith(sep) ? config.root : `${config.root}${sep}`;
  if (!filePath.startsWith(rootPrefix)) {
    throw new HttpError(403, '禁止访问', 'FORBIDDEN');
  }
  const relativePath = filePath.slice(rootPrefix.length).split(sep).join('/');
  const allowed =
    relativePath === 'index.html' ||
    relativePath.startsWith('assets/') ||
    relativePath.startsWith('docs/');
  if (!allowed) throw new HttpError(404, '页面不存在', 'NOT_FOUND');

  let stats;
  if (!existsSync(filePath) || !(stats = statSync(filePath)).isFile()) {
    throw new HttpError(404, '页面不存在', 'NOT_FOUND');
  }
  if (stats.size > MAX_STATIC_BYTES) throw new HttpError(413, '文件过大', 'PAYLOAD_TOO_LARGE');

  const build = currentBuildId();
  const requestedVersion = url.searchParams.get('v');
  const versionValid = requestedVersion !== null && requestedVersion === build;
  const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
  const baseType = type.split(';')[0].trim();

  const isMedia = EXERCISE_MEDIA_RE.test(relativePath);
  const cacheKey = `${relativePath}|${build}|${stats.mtimeMs}|${stats.size}`;
  let prepared = preparedCache.get(cacheKey);
  if (!prepared) {
    const raw = readFileSync(filePath);
    const body = !isMedia && TEXT_EXT.test(relativePath)
      ? Buffer.from(rewriteContent(relativePath, raw.toString('utf8'), build), 'utf8')
      : raw;
    const etag = isMedia
      ? `"${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`
      : `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`;
    const gzipped = !isMedia && COMPRESSIBLE.has(baseType) ? gzipSync(body, { level: 6 }) : null;
    prepared = { body, etag, gzipped };
    /* 媒体文件数量多、体积大，不进内存缓存，靠浏览器 immutable 缓存兜底 */
    if (!isMedia) {
      if (preparedCache.size > 128) preparedCache.clear();
      preparedCache.set(cacheKey, prepared);
    }
  }

  const cacheControl = cacheControlFor(relativePath, versionValid);
  if (req.headers['if-none-match'] === prepared.etag) {
    res.writeHead(304, { ETag: prepared.etag, 'Cache-Control': cacheControl });
    res.end();
    return;
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  const canCompress = prepared.gzipped && /gzip/.test(acceptEncoding);
  const headers = {
    'Content-Type': type,
    'Cache-Control': cacheControl,
    ETag: prepared.etag,
    Vary: 'Accept-Encoding',
  };
  const output = canCompress ? prepared.gzipped : prepared.body;
  if (canCompress) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = output.length;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(output);
}
