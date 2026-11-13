/* 大了么 · 服务入口：HTTP 服务、超时、优雅停机、定时任务 */
import { createServer } from 'node:http';
import { config } from './server/config.mjs';
import { log } from './server/logger.mjs';
import { runBackup, closeDb, stmt } from './server/db.mjs';
import { handleApi, sendJson } from './server/handlers.mjs';
import { serveStatic } from './server/static.mjs';
import { applySecurityHeaders, clientIp, HttpError } from './server/security.mjs';

/* ---- HTTP 服务 ---- */
const server = createServer(async (req, res) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const url = req.url || '/';
    log.access({
      method: req.method,
      path: url.split('?')[0].slice(0, 200),
      status: res.statusCode,
      ms: Number(process.hrtime.bigint() - started) / 1e6,
      ip: clientIp(req),
      bytes: Number(res.getHeader('Content-Length')) || undefined,
    });
  });

  applySecurityHeaders(res, req);
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || config.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error?.code === 'ECONNRESET') {
      res.destroy();
      return;
    }
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) log.error('request.failed', error, { url: req.url });
    sendJson(res, status, {
      ok: false,
      error: status >= 500 ? '服务器开小差了，请稍后再试' : error.message,
      code: error.code || 'SERVER_ERROR',
    });
  }
});

/* 反向代理与慢客户端防护 */
server.keepAliveTimeout = 15_000;
server.headersTimeout = 65_000;
server.requestTimeout = 120_000;

/* ---- 定时任务 ---- */
stmt.deleteExpiredSessions.run(Date.now());
setInterval(() => stmt.deleteExpiredSessions.run(Date.now()), 6 * 60 * 60 * 1000).unref();

if (config.backup.onStart) {
  try {
    const target = runBackup();
    log.info('backup.completed', { target });
  } catch (error) {
    log.error('backup.failed', error);
  }
}
setInterval(() => {
  try {
    const target = runBackup();
    log.info('backup.completed', { target });
  } catch (error) {
    log.error('backup.failed', error);
  }
}, 24 * 60 * 60 * 1000).unref();

/* ---- 启动 ---- */
server.listen(config.port, config.host, () => {
  const address = server.address();
  const port = typeof address === 'object' ? address.port : config.port;
  /* 供进程管理器与集成测试识别实际监听端口 */
  console.log(JSON.stringify({ ready: true, port, host: config.host, version: config.version }));
  log.info('server.started', { host: config.host, port, version: config.version, db: config.dbPath });
});

/* ---- 优雅停机与全局兜底 ---- */
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('server.shutdown', { signal });
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  /* 在途请求最多再等 10 秒 */
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  log.error('process.uncaughtException', error);
  process.exitCode = 1;
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  log.error('process.unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});
