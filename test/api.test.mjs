/* 大了么 · API 集成测试：真实启动服务器，走完整 HTTP 流程 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = join(import.meta.dirname, '..');

async function startServer(env = {}) {
  const workDir = mkdtempSync(join(tmpdir(), 'liantrace-test-'));
  const port = 18000 + Math.floor(Math.random() * 8000);
  const child = spawn(
    process.execPath,
    ['--no-warnings', join(ROOT, 'server.mjs')],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: join(workDir, 'data'),
        LOG_DIR: join(workDir, 'logs'),
        BACKUP_ON_START: '0',
        REGISTER_LIMIT: '1000',
        LOGIN_LIMIT: '1000',
        LOGIN_USER_LIMIT: '1000',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const base = await new Promise((resolvePromise, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('服务器启动超时')), 15_000);
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const line = buffer.split('\n').find((l) => l.includes('"ready"'));
      if (line) {
        clearTimeout(timer);
        try {
          resolvePromise(`http://127.0.0.1:${JSON.parse(line).port}`);
        } catch (error) {
          reject(error);
        }
      }
    });
    child.on('exit', (code) => reject(new Error(`服务器提前退出（code=${code}）`)));
  });

  async function stop() {
    child.kill('SIGTERM');
    await sleep(300);
    child.kill('SIGKILL');
    rmSync(workDir, { recursive: true, force: true });
  }

  return { base, stop, workDir };
}

function makeClient(base) {
  let cookie = '';
  return {
    get cookie() {
      return cookie;
    },
    async request(path, { method = 'GET', body, headers = {}, keepCookie = true, origin } = {}) {
      const response = await fetch(base + path, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie && keepCookie ? { Cookie: cookie } : {}),
          ...(origin ? { Origin: origin } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'manual',
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie && keepCookie) {
        cookie = setCookie.split(';')[0] === 'lt_session=' ? '' : setCookie.split(';')[0];
      }
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        /* 非 JSON 响应 */
      }
      return { status: response.status, headers: response.headers, payload };
    },
  };
}

const validState = () => ({
  schema: 1,
  plans: [{ id: 'p1', name: '测试计划', days: [] }],
  workouts: [],
  settings: { theme: 'dark' },
});

test('健康检查与安全响应头', async () => {
  const server = await startServer();
  const client = makeClient(server.base);
  try {
    const res = await client.request('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.database, 'ok');
    assert.ok(res.payload.version);

    const page = await client.request('/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
  } finally {
    await server.stop();
  }
});

test('注册 → 会话 → 数据同步 → 退出', async () => {
  const server = await startServer();
  const client = makeClient(server.base);
  try {
    const anon = await client.request('/api/data');
    assert.equal(anon.status, 401);

    const reg = await client.request('/api/auth/register', {
      method: 'POST',
      body: { username: '测试用户', password: 'secure-pass-123', confirmPassword: 'secure-pass-123' },
      origin: server.base,
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.payload.user.username, '测试用户');
    assert.ok(client.cookie);

    const put = await client.request('/api/data', { method: 'PUT', body: { data: validState() }, origin: server.base });
    assert.equal(put.status, 200);
    assert.equal(put.payload.revision, 1);

    const get = await client.request('/api/data');
    assert.equal(get.status, 200);
    assert.equal(get.payload.data.plans[0].name, '测试计划');

    const evil = await client.request('/api/data', {
      method: 'PUT',
      body: { data: validState() },
      origin: 'http://evil.example.com',
    });
    assert.equal(evil.status, 403);

    await client.request('/api/auth/logout', { method: 'POST', origin: server.base });
    assert.equal((await client.request('/api/auth/me')).payload.user, null);
    assert.equal(client.cookie, '');
  } finally {
    await server.stop();
  }
});

test('重复注册 / 错误密码 / 数据校验', async () => {
  const server = await startServer();
  const client = makeClient(server.base);
  try {
    await client.request('/api/auth/register', {
      method: 'POST',
      body: { username: 'alice', password: 'password-123' },
      origin: server.base,
    });
    const dup = await client.request('/api/auth/register', {
      method: 'POST',
      body: { username: 'ALICE', password: 'password-123' },
      origin: server.base,
    });
    assert.equal(dup.status, 409);

    const bad = await makeClient(server.base);
    const wrong = await bad.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'alice', password: 'wrong-password' },
      origin: server.base,
    });
    assert.equal(wrong.status, 401);

    const badState = await client.request('/api/data', {
      method: 'PUT',
      body: { data: { schema: 2 } },
      origin: server.base,
    });
    assert.equal(badState.status, 400);
  } finally {
    await server.stop();
  }
});

test('修改密码：新密码可登录，其他设备会话被吊销', async () => {
  const server = await startServer();
  const first = makeClient(server.base);
  try {
    await first.request('/api/auth/register', {
      method: 'POST',
      body: { username: 'bob', password: 'old-password-1' },
      origin: server.base,
    });
    /* 第二个“设备”登录 */
    const second = makeClient(server.base);
    await second.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'bob', password: 'old-password-1' },
      origin: server.base,
    });
    assert.ok(second.cookie);

    const changed = await first.request('/api/auth/password', {
      method: 'PUT',
      body: { currentPassword: 'old-password-1', newPassword: 'new-password-9' },
      origin: server.base,
    });
    assert.equal(changed.status, 200);
    assert.ok(first.cookie); /* 当前设备保持登录 */

    const revoked = await second.request('/api/auth/me');
    assert.equal(revoked.payload.user, null);

    const relogin = await makeClient(server.base);
    const ok = await relogin.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'bob', password: 'new-password-9' },
      origin: server.base,
    });
    assert.equal(ok.status, 200);
    const oldFail = await makeClient(server.base);
    const fail = await oldFail.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'bob', password: 'old-password-1' },
      origin: server.base,
    });
    assert.equal(fail.status, 401);
  } finally {
    await server.stop();
  }
});

test('退出所有设备与账号注销', async () => {
  const server = await startServer();
  const first = makeClient(server.base);
  try {
    await first.request('/api/auth/register', {
      method: 'POST',
      body: { username: 'carol', password: 'password-123' },
      origin: server.base,
    });
    await first.request('/api/data', { method: 'PUT', body: { data: validState() }, origin: server.base });

    const second = makeClient(server.base);
    await second.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'carol', password: 'password-123' },
      origin: server.base,
    });

    const all = await second.request('/api/auth/logout-all', { method: 'POST', origin: server.base });
    assert.equal(all.status, 200);
    assert.equal((await first.request('/api/auth/me')).payload.user, null);
    assert.equal((await second.request('/api/auth/me')).payload.user, null);

    /* 重新登录后注销账号 */
    const again = makeClient(server.base);
    await again.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'carol', password: 'password-123' },
      origin: server.base,
    });
    const wrongDel = await again.request('/api/account', {
      method: 'DELETE',
      body: { password: 'nope-wrong-1' },
      origin: server.base,
    });
    assert.equal(wrongDel.status, 401);

    const del = await again.request('/api/account', {
      method: 'DELETE',
      body: { password: 'password-123' },
      origin: server.base,
    });
    assert.equal(del.status, 200);
    assert.equal((await again.request('/api/auth/me')).payload.user, null);

    const gone = await makeClient(server.base);
    const loginGone = await gone.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'carol', password: 'password-123' },
      origin: server.base,
    });
    assert.equal(loginGone.status, 401);
  } finally {
    await server.stop();
  }
});

test('静态资源：路径穿越防护与 ETag 304', async () => {
  const server = await startServer();
  const client = makeClient(server.base);
  try {
    const traversal = await client.request('/..%2fserver.mjs');
    assert.ok([403, 404].includes(traversal.status));
    const secret = await client.request('/server.mjs');
    assert.ok([403, 404].includes(secret.status));

    const page = await client.request('/index.html');
    assert.equal(page.status, 200);
    const etag = page.headers.get('etag');
    assert.ok(etag);

    const notModified = await fetch(server.base + '/index.html', {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(notModified.status, 304);

    const compressed = await fetch(server.base + '/assets/css/styles.css', {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(compressed.status, 200);
    assert.equal(compressed.headers.get('content-encoding'), 'gzip');
  } finally {
    await server.stop();
  }
});

test('限流：注册接口超限返回 429', async () => {
  const server = await startServer({ REGISTER_LIMIT: '3' });
  const client = makeClient(server.base);
  try {
    for (let i = 0; i < 3; i += 1) {
      await client.request('/api/auth/register', {
        method: 'POST',
        body: { username: `no_user_${i}`, password: 'short' },
        origin: server.base,
        keepCookie: false,
      });
    }
    const limited = await client.request('/api/auth/register', {
      method: 'POST',
      body: { username: 'blocked', password: 'password-123' },
      origin: server.base,
    });
    assert.equal(limited.status, 429);
  } finally {
    await server.stop();
  }
});

test('登录门禁：默认会话级 Cookie，记住登录才持久化，未登录读不到数据', async () => {
  const server = await startServer();
  const client = makeClient(server.base);
  try {
    const anonData = await client.request('/api/data');
    assert.equal(anonData.status, 401, '未登录不能读取云端数据');
    const anonMe = await client.request('/api/auth/me');
    assert.equal(anonMe.payload.user, null);

    const shell = await fetch(server.base + '/index.html');
    const html = await shell.text();
    assert.match(html, /<body class="auth-mode">/, '入口首帧即处于登录模式');
    assert.match(html, /正在验证登录状态/, '入口不展示应用内容');

    const reg = await client.request('/api/auth/register', {
      method: 'POST',
      body: { username: 'gate_a', password: 'password-123' },
      origin: server.base,
    });
    assert.equal(reg.status, 201);
    const defaultCookie = reg.headers.get('set-cookie') || '';
    assert.match(defaultCookie, /HttpOnly/);
    assert.match(defaultCookie, /Path=\//);
    assert.doesNotMatch(defaultCookie, /Max-Age=/, '默认不下发持久 Cookie');

    const data = await client.request('/api/data');
    assert.equal(data.status, 200);

    const remembered = await client.request('/api/auth/login', {
      method: 'POST',
      body: { username: 'gate_a', password: 'password-123', remember: true },
      origin: server.base,
    });
    assert.equal(remembered.status, 200);
    assert.match(remembered.headers.get('set-cookie') || '', /Max-Age=\d+/, '勾选记住登录才持久化');
  } finally {
    await server.stop();
  }
});

test('静态资源版本化：入口与模块 import 带内容指纹，旧缓存不会挡住新代码', async () => {
  const server = await startServer();
  try {
    const page = await fetch(server.base + '/');
    const html = await page.text();
    assert.match(page.headers.get('cache-control') || '', /no-store/, '入口不允许强缓存');
    assert.match(html, /assets\/js\/app\.js\?v=[\w-]+/, '入口模块带版本指纹');
    assert.match(html, /assets\/js\/theme\.js\?v=[\w-]+/, '主题脚本带版本指纹');
    assert.match(html, /assets\/css\/styles\.css\?v=[\w-]+/, '样式带版本指纹');

    const version = html.match(/assets\/js\/app\.js\?v=([\w-]+)/)[1];
    const app = await fetch(server.base + `/assets/js/app.js?v=${version}`);
    const js = await app.text();
    assert.match(js, /from '\.\/data\.js\?v=[\w-]+'/, 'ES module 相对 import 被重写');
    assert.match(js, /'\.\/views\/history-detail\.js\?v=[\w-]+'/, '视图模块 URL 带版本');
    assert.match(app.headers.get('cache-control') || '', /immutable/, '版本化 URL 可长期缓存');

    const detail = await fetch(server.base + `/assets/js/views/history-detail.js?v=${version}`);
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), /data-share-card/, '新版本资源包含分享入口');

    const unversioned = await fetch(server.base + '/assets/js/views/history-detail.js');
    assert.match(unversioned.headers.get('cache-control') || '', /no-cache/, '无版本 URL 必须重新协商');
    const stale = await fetch(server.base + '/assets/js/views/history-detail.js?v=stale-build');
    assert.match(stale.headers.get('cache-control') || '', /no-cache/, '过期版本 URL 不允许长缓存');
  } finally {
    await server.stop();
  }
});

test('头像：上传校验、读取缓存、账号隔离、删除与注销清理', async () => {
  const server = await startServer();
  const client = makeClient(server.base);
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const png = `data:image/png;base64,${pngBase64}`;
  const password = 'password-123';
  try {
    /* 未登录不能读写 */
    assert.equal((await client.request('/api/avatar')).status, 401);
    assert.equal((await client.request('/api/avatar', {
      method: 'PUT', body: { image: png }, origin: server.base,
    })).status, 401);

    const registered = await client.request('/api/auth/register', {
      method: 'POST', body: { username: 'avatar_user', password }, origin: server.base,
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.payload.user.avatarVersion, null, '新账号默认无头像');
    assert.equal((await client.request('/api/avatar')).status, 404, '未设置头像返回 404');

    /* 非法输入一律拒绝 */
    const oversizedHeader = Buffer.from(pngBase64, 'base64');
    oversizedHeader.writeUInt32BE(2000, 16);
    oversizedHeader.writeUInt32BE(2000, 20);
    const badCases = [
      ['伪造内容', 'data:image/png;base64,aGVsbG8gd29ybGQ=', 415],
      ['SVG', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 415],
      ['声明与内容不符', `data:image/webp;base64,${pngBase64}`, 415],
      ['非 data URL', 'https://example.com/a.png', 415],
      ['超大尺寸声明', `data:image/png;base64,${oversizedHeader.toString('base64')}`, 400],
      ['超大体积', `data:image/png;base64,${'A'.repeat(700 * 1024)}`, 413],
    ];
    for (const [label, image, expected] of badCases) {
      const result = await client.request('/api/avatar', {
        method: 'PUT', body: { image }, origin: server.base,
      });
      assert.equal(result.status, expected, `${label} 应返回 ${expected}`);
    }
    assert.equal((await client.request('/api/auth/me')).payload.user.avatarVersion, null);

    /* 合法上传 */
    const uploaded = await client.request('/api/avatar', {
      method: 'PUT', body: { image: png }, origin: server.base,
    });
    assert.equal(uploaded.status, 200);
    const version = uploaded.payload.avatarVersion;
    assert.match(version, /^[\w-]{8,}$/);
    assert.equal((await client.request('/api/auth/me')).payload.user.avatarVersion, version);

    /* 二进制读取 + 版本化缓存 + ETag 304 */
    const withCookie = { Cookie: client.cookie };
    const image = await fetch(`${server.base}/api/avatar?v=${version}`, { headers: withCookie });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.match(image.headers.get('cache-control') || '', /immutable/, '带版本 URL 可长缓存');
    assert.match(image.headers.get('content-disposition') || '', /inline/);
    assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'), pngBase64, '字节原样返回');
    const etag = image.headers.get('etag');
    const notModified = await fetch(`${server.base}/api/avatar?v=${version}`, {
      headers: { ...withCookie, 'If-None-Match': etag },
    });
    assert.equal(notModified.status, 304);
    const unversioned = await fetch(`${server.base}/api/avatar`, { headers: withCookie });
    assert.match(unversioned.headers.get('cache-control') || '', /no-cache/, '无版本 URL 必须协商');

    /* 账号隔离：另一个账号读不到别人的头像 */
    const other = makeClient(server.base);
    await other.request('/api/auth/register', {
      method: 'POST', body: { username: 'avatar_other', password }, origin: server.base,
    });
    const otherImage = await fetch(`${server.base}/api/avatar`, { headers: { Cookie: other.cookie } });
    assert.equal(otherImage.status, 404);

    /* 删除后回到首字母状态 */
    const removed = await client.request('/api/avatar', { method: 'DELETE', origin: server.base });
    assert.equal(removed.status, 200);
    assert.equal(removed.payload.avatarVersion, null);
    assert.equal((await client.request('/api/avatar')).status, 404);
    assert.equal((await client.request('/api/auth/me')).payload.user.avatarVersion, null);

    /* 注销账号时头像随外键级联删除，不留下孤儿数据 */
    await client.request('/api/avatar', {
      method: 'PUT', body: { image: png }, origin: server.base,
    });
    const deleted = await client.request('/api/account', {
      method: 'DELETE', body: { password }, origin: server.base,
    });
    assert.equal(deleted.status, 200);
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(server.workDir, 'data', 'liantrace.db'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM avatars').get().n, 0, '头像已级联清理');
    db.close();
  } finally {
    await server.stop();
  }
});

test('动作库目录：1324 条动作、字段完整、GIF 与中文要领齐全', async () => {
  const { EXERCISE_CATALOG, CATALOG_META } = await import('../assets/js/exercise-catalog.js');
  const { BODY_PARTS, EQUIPMENT_FILTERS, LEGACY_EXERCISES } = await import('../assets/js/data.js');

  assert.equal(EXERCISE_CATALOG.length, 1324);
  assert.equal(CATALOG_META.total, EXERCISE_CATALOG.length);
  assert.equal(new Set(EXERCISE_CATALOG.map((e) => e.id)).size, EXERCISE_CATALOG.length, '动作 ID 不可重复');
  assert.equal(BODY_PARTS.length, 10, '10 个训练部位');
  assert.ok(EQUIPMENT_FILTERS.length >= 20, '器械分类来自真实目录');
  assert.match(CATALOG_META.attribution, /Gym visual/);
  assert.ok(existsSync(join(ROOT, 'assets/exercises/NOTICE.md')), '必须保留媒体署名文件');
  assert.ok(existsSync(join(ROOT, 'assets/exercises/LICENSE.txt')), '必须保留上游许可文件');

  /* 旧内置动作只用于历史数据兜底，不能与新目录 ID 冲突 */
  const catalogIds = new Set(EXERCISE_CATALOG.map((e) => e.id));
  assert.equal(LEGACY_EXERCISES.length, 48);
  assert.ok(LEGACY_EXERCISES.every((e) => !catalogIds.has(e.id)));

  const details = JSON.parse(readFileSync(join(ROOT, 'assets/exercises/details.json'), 'utf8'));
  assert.match(details.meta.attribution, /Gym visual/);
  for (const exercise of EXERCISE_CATALOG) {
    assert.ok(exercise.name && exercise.equipment && exercise.muscle && exercise.reps, `${exercise.id} 字段缺失`);
    assert.match(exercise.gif, /^\/assets\/exercises\/videos\/[\w.-]+\.gif$/);
    assert.ok(existsSync(join(ROOT, exercise.gif.slice(1))), `${exercise.id} GIF 缺失`);
    assert.ok(existsSync(join(ROOT, exercise.image.slice(1))), `${exercise.id} 缩略图缺失`);
    assert.ok(details.items[exercise.id]?.zh?.length, `${exercise.id} 缺少中文动作要领`);
  }
  const gifs = readdirSync(join(ROOT, 'assets/exercises/videos')).filter((f) => f.endsWith('.gif'));
  assert.equal(gifs.length, EXERCISE_CATALOG.length, '每个动作都要有对应 GIF');
});

test('动作库媒体：同源静态服务正确返回 GIF / 缩略图 / 中文要领', async () => {
  const server = await startServer();
  try {
    const { EXERCISE_CATALOG } = await import('../assets/js/exercise-catalog.js');
    const sample = EXERCISE_CATALOG[0];

    const gif = await fetch(server.base + sample.gif);
    assert.equal(gif.status, 200);
    assert.equal(gif.headers.get('content-type'), 'image/gif');
    assert.match(gif.headers.get('cache-control') || '', /immutable/, '按内容命名的媒体可长缓存');
    assert.equal(Buffer.from(await gif.arrayBuffer()).subarray(0, 3).toString(), 'GIF');
    assert.ok(gif.headers.get('etag'), '媒体也要有 ETag');
    const notModified = await fetch(server.base + sample.gif, {
      headers: { 'If-None-Match': gif.headers.get('etag') },
    });
    assert.equal(notModified.status, 304);

    const thumb = await fetch(server.base + sample.image);
    assert.equal(thumb.headers.get('content-type'), 'image/jpeg');

    const details = await fetch(server.base + '/assets/exercises/details.json');
    assert.equal(details.status, 200);
    assert.match(details.headers.get('content-type') || '', /application\/json/);

    const dataModule = await fetch(server.base + '/assets/js/data.js');
    const source = await dataModule.text();
    assert.match(source, /exercise-catalog\.js\?v=[\w-]+/, '新模块也要带内容指纹，避免手机端旧缓存');

    /* 媒体本地托管，CSP 无需放行任何外部图片域名 */
    const page = await fetch(server.base + '/');
    assert.match(page.headers.get('content-security-policy'), /img-src 'self' data:/);
  } finally {
    await server.stop();
  }
});
