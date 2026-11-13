/* 大了么 · 登录状态与云端同步
 * 设计：应用必须登录后使用，云端（SQLite）是唯一数据源。
 * 本机 localStorage 仅作为当前登录用户的离线工作副本。
 */
import { api } from './api.js';
import { getState, resetToEmpty, setState, subscribe } from './store.js';

const META_KEY = 'liantrace.sync.v1';
const BACKUP_KEY = 'liantrace.backup.before-adopt';
/* 登录门禁：默认每次「新打开」都要登录；勾选记住登录后才允许自动进入 */
const REMEMBER_KEY = 'liantrace.remember.v1';
const OPEN_KEY = 'liantrace.auth.open.v1';

function readRemember() {
  try { return localStorage.getItem(REMEMBER_KEY) === '1'; } catch { return false; }
}
function writeRemember(on) {
  try {
    if (on) localStorage.setItem(REMEMBER_KEY, '1');
    else localStorage.removeItem(REMEMBER_KEY);
  } catch { /* 忽略配额异常 */ }
}
function hasOpenedThisTab() {
  try { return sessionStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
}
function markOpened() {
  try { sessionStorage.setItem(OPEN_KEY, '1'); } catch { /* 忽略 */ }
}
function clearOpened() {
  try { sessionStorage.removeItem(OPEN_KEY); } catch { /* 忽略 */ }
}

let applyingRemote = false;
let pushTimer = null;
let pushing = false;
let queuedPush = false;

const syncState = {
  user: null,
  status: 'signed-out', // signed-out | checking | pending | syncing | synced | error
  lastSyncedAt: null,
  error: '',
};

const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn(syncState);
    } catch (error) {
      console.error(error);
    }
  }
}

export function getSyncState() {
  return syncState;
}

export function subscribeSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 头像上传/删除后更新当前用户版本号，并通知界面刷新 */
export function setAvatarVersion(version) {
  if (!syncState.user) return;
  syncState.user = { ...syncState.user, avatarVersion: version || null };
  notify();
}

function readMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { userId: null, lastSyncedAt: null, revision: 0, dirty: false };
    return { userId: null, lastSyncedAt: null, revision: 0, dirty: false, ...JSON.parse(raw) };
  } catch {
    return { userId: null, lastSyncedAt: null, revision: 0, dirty: false };
  }
}

function writeMeta(patch) {
  const next = { ...readMeta(), ...patch };
  try {
    localStorage.setItem(META_KEY, JSON.stringify(next));
  } catch {
    /* 忽略配额异常 */
  }
  return next;
}

function clearMeta() {
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    /* 忽略 */
  }
}

function backupLocalState(reason) {
  try {
    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({ at: new Date().toISOString(), reason, data: getState() }),
    );
  } catch {
    /* 忽略配额异常 */
  }
}

function setStatus(status, patch = {}) {
  syncState.status = status;
  Object.assign(syncState, patch);
  notify();
}

/** 云端数据覆盖本机工作副本（覆盖前自动备份到 localStorage） */
export function adoptCloud(cloud) {
  if (!cloud?.data) return;
  backupLocalState('before-adopt-cloud');
  applyingRemote = true;
  try {
    setState(cloud.data);
  } finally {
    applyingRemote = false;
  }
  writeMeta({
    userId: syncState.user?.id || null,
    lastSyncedAt: cloud.updatedAt,
    revision: cloud.revision,
    dirty: false,
  });
  setStatus('synced', { lastSyncedAt: cloud.updatedAt, error: '' });
}

/** 会话失效：清空工作副本并回到登录页 */
function handleSessionExpired() {
  syncState.user = null;
  clearMeta();
  clearOpened();
  applyingRemote = true;
  try {
    resetToEmpty();
  } finally {
    applyingRemote = false;
  }
  setStatus('signed-out', { lastSyncedAt: null, error: '' });
}

async function pushLocalToCloud({ silent = false } = {}) {
  if (!syncState.user) return null;
  if (applyingRemote) return null;
  if (pushing) {
    queuedPush = true;
    return null;
  }
  clearTimeout(pushTimer);
  pushTimer = null;
  pushing = true;
  setStatus('syncing', { error: '' });
  try {
    const result = await api.putCloudData(getState());
    const meta = writeMeta({
      userId: syncState.user.id,
      lastSyncedAt: result.updatedAt,
      revision: result.revision,
      dirty: false,
    });
    setStatus('synced', { lastSyncedAt: result.updatedAt, error: '' });
    return { ...result, meta };
  } catch (error) {
    if (error.status === 401) {
      handleSessionExpired();
      return null;
    }
    writeMeta({ dirty: true });
    setStatus('error', { error: error.message || '同步失败' });
    if (!silent) throw error;
    return null;
  } finally {
    pushing = false;
    if (queuedPush) {
      queuedPush = false;
      schedulePush(300);
    }
  }
}

export function schedulePush(delay = 1200) {
  if (!syncState.user) return;
  writeMeta({ dirty: true });
  if (syncState.status !== 'syncing') setStatus('pending', { error: '' });
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushLocalToCloud().catch(() => {
      /* 状态已记录，等待下次改动或手动重试 */
    });
  }, delay);
}

/** 启动：校验会话。未登录返回 signedOut，由界面渲染登录页 */
export async function initSync() {
  /* 新标签页 / 新窗口 / 重启浏览器打开时，若未勾选「记住登录」，
     主动注销遗留的持久会话，保证首屏一定是登录页。
     同一标签页内刷新则保留登录状态，不会反复要求输入密码。 */
  if (!readRemember() && !hasOpenedThisTab()) {
    try { await api.logout(); } catch { /* 忽略：可能本来就没有会话 */ }
    handleSessionExpired();
    return { signedOut: true, freshOpen: true };
  }
  setStatus('checking');
  try {
    const me = await api.getMe();
    if (!me?.user) {
      syncState.user = null;
      clearMeta();
      applyingRemote = true;
      try {
        resetToEmpty();
      } finally {
        applyingRemote = false;
      }
      setStatus('signed-out', { lastSyncedAt: null, error: '' });
      return { signedOut: true };
    }
    syncState.user = me.user;
    const cloud = await api.getCloudData();
    if (cloud.data) {
      adoptCloud(cloud);
      return { user: me.user, adopted: true };
    }
    /* 账号尚无云端数据：用当前工作副本初始化 */
    await pushLocalToCloud({ silent: true });
    return { user: me.user, adopted: false };
  } catch (error) {
    if (error.status === 401) {
      handleSessionExpired();
      return { signedOut: true };
    }
    setStatus('error', { error: error.message || '网络连接失败，请稍后重试' });
    return { error: error.message };
  }
}

export async function loginUser(username, password, remember = false) {
  const result = await api.login(username, password, remember);
  writeRemember(remember);
  markOpened();
  syncState.user = result.user;
  setStatus('checking', { error: '' });
  const cloud = await api.getCloudData();
  if (cloud.data) adoptCloud(cloud);
  else await pushLocalToCloud();
  return { user: result.user };
}

export async function registerUser(username, password, remember = false) {
  const result = await api.register(username, password, remember);
  writeRemember(remember);
  markOpened();
  syncState.user = result.user;
  /* 新账号从空白开始，不继承设备上可能残留的数据 */
  applyingRemote = true;
  try {
    resetToEmpty();
  } finally {
    applyingRemote = false;
  }
  setStatus('checking', { error: '' });
  await pushLocalToCloud();
  return { user: result.user };
}

function resetLocalSync() {
  syncState.user = null;
  clearMeta();
  clearOpened();
  writeRemember(false);
  clearTimeout(pushTimer);
  pushTimer = null;
  applyingRemote = true;
  try {
    resetToEmpty();
  } finally {
    applyingRemote = false;
  }
  setStatus('signed-out', { lastSyncedAt: null, error: '' });
}

export async function logoutUser() {
  try {
    await api.logout();
  } finally {
    resetLocalSync();
  }
}

export async function syncNow() {
  if (!syncState.user) throw new Error('请先登录账号');
  return pushLocalToCloud();
}

/** 修改密码（服务端吊销其他设备会话，当前设备保持登录） */
export async function changePassword(currentPassword, newPassword) {
  return api.changePassword(currentPassword, newPassword);
}

/** 退出所有已登录设备（包括本机） */
export async function logoutAllDevices() {
  try {
    await api.logoutAll();
  } finally {
    resetLocalSync();
  }
}

/** 注销账号：云端数据、会话与账号本体都会被删除 */
export async function deleteAccount(password) {
  try {
    await api.deleteAccount(password);
  } finally {
    resetLocalSync();
  }
}

/** 本机状态每次保存后自动排队上传 */
subscribe(() => {
  if (applyingRemote) return;
  if (!syncState.user) return;
  schedulePush();
});

window.addEventListener('online', () => {
  if (syncState.user && readMeta().dirty) schedulePush(800);
});

export function formatSyncTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return sameDay ? `今天 ${time}` : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
