/* 大了么 · 登录界面、账号卡片与账号安全 */
import {
  changePassword,
  deleteAccount,
  formatSyncTime,
  getSyncState,
  loginUser,
  logoutAllDevices,
  logoutUser,
  registerUser,
  subscribeSync,
  syncNow,
} from './sync.js';
import { confirmDialog, icon, logoMark, openSheet, showToast } from './ui.js';
import { esc } from './utils.js';
import { getState } from './store.js';
import { avatarHtml } from './avatar.js';

export function syncStatusInfo(sync = getSyncState()) {
  switch (sync.status) {
    case 'checking':
      return { label: '检查中', detail: '请稍候…', tone: 'wait' };
    case 'syncing':
      return { label: '同步中', detail: '正在保存…', tone: 'wait' };
    case 'pending':
      return { label: '待同步', detail: '正在保存改动…', tone: 'wait' };
    case 'synced':
      return {
        label: '已同步',
        detail: sync.lastSyncedAt ? `最近同步 · ${formatSyncTime(sync.lastSyncedAt)}` : '记录已是最新',
        tone: 'ok',
      };
    case 'error':
      return { label: '同步失败', detail: sync.error || '网络异常，稍后会自动重试', tone: 'bad' };
    default:
      return { label: '未登录', detail: '请先登录账号', tone: '' };
  }
}

/* ---------------- 登录 / 注册界面（整页） ---------------- */

export function authPanelHtml() {
  return `<div class="auth-page">
    <div class="auth-page-glow"></div>
    <section class="auth-card">
      <div class="auth-brand">
        ${logoMark()}
        <span class="brand-text"><strong>大了么</strong><span>DALEME</span></span>
      </div>
      <h1 class="auth-title">登录后开始记录</h1>
      <p class="auth-subtitle">换个设备登录，训练记录还在。</p>
      <div class="auth-tabs">
        <button type="button" class="auth-tab active" data-auth-mode="login">登录</button>
        <button type="button" class="auth-tab" data-auth-mode="register">注册</button>
      </div>
      <form class="auth-form" data-auth-form>
        <label class="field"><span class="field-label">用户名</span>
          <input class="input" name="username" maxlength="24" autocomplete="username" placeholder="2–24 个字符" autofocus />
        </label>
        <label class="field"><span class="field-label">密码</span>
          <input class="input" name="password" type="password" minlength="8" maxlength="72" autocomplete="current-password" placeholder="至少 8 个字符" />
        </label>
        <label class="field auth-confirm" hidden><span class="field-label">确认密码</span>
          <input class="input" name="confirmPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password" placeholder="再输入一次密码" />
        </label>
        <label class="auth-remember">
          <input type="checkbox" name="remember" />
          <span>30 天内自动登录</span>
        </label>
        <p class="auth-error" data-auth-error></p>
        <button type="button" class="btn btn-primary btn-block auth-submit" data-auth-submit>
          ${icon('arrow-right', 16)} <span>登录</span>
        </button>
        <p class="auth-checking" data-auth-checking hidden>正在验证登录状态…</p>
      </form>
    </section>
    <p class="auth-foot">每一次，都算数。</p>
  </div>`;
}

export function mountAuthPanel(root, { onSuccess } = {}) {
  const form = root.querySelector('[data-auth-form]');
  const submit = root.querySelector('[data-auth-submit]');
  const errorEl = root.querySelector('[data-auth-error]');
  const confirmField = root.querySelector('.auth-confirm');
  const usernameInput = form.elements.username;
  const passwordInput = form.elements.password;
  const confirmInput = form.elements.confirmPassword;
  let currentMode = 'login';
  let working = false;

  const setMode = (next) => {
    currentMode = next;
    root.querySelectorAll('[data-auth-mode]').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.authMode === next);
    });
    confirmField.hidden = next === 'login';
    passwordInput.autocomplete = next === 'login' ? 'current-password' : 'new-password';
    submit.querySelector('span').textContent = next === 'login' ? '登录' : '创建账号';
    errorEl.textContent = '';
    errorEl.classList.remove('show');
    if (next === 'login') confirmInput.value = '';
    usernameInput.focus();
  };

  root.querySelectorAll('[data-auth-mode]').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.authMode));
  });

  form.addEventListener('submit', (event) => event.preventDefault());

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.classList.add('show');
  };

  const submitForm = async () => {
    if (working) return;
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (username.length < 2) return showError('用户名至少需要 2 个字符');
    if (password.length < 8) return showError('密码至少需要 8 个字符');
    if (currentMode === 'register' && password !== confirmInput.value) {
      return showError('两次输入的密码不一致');
    }
    working = true;
    submit.disabled = true;
    const label = submit.querySelector('span');
    label.textContent = currentMode === 'login' ? '登录中…' : '创建中…';
    errorEl.classList.remove('show');
    try {
      const remember = form.elements.remember.checked;
      const result =
        currentMode === 'login'
          ? await loginUser(username, password, remember)
          : await registerUser(username, password, remember);
      showToast(currentMode === 'login' ? `欢迎回来，${result.user.username}` : '账号已创建');
      onSuccess?.();
    } catch (error) {
      showError(error.message || '操作失败，请稍后再试');
    } finally {
      working = false;
      submit.disabled = false;
      label.textContent = currentMode === 'login' ? '登录' : '创建账号';
    }
  };

  submit.addEventListener('click', submitForm);
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitForm();
    }
  });
}

/* ---------------- 账号卡片 ---------------- */

export function accountCardHtml() {
  const sync = getSyncState();
  const info = syncStatusInfo(sync);

  if (!sync.user) {
    return `<section class="card account-card">
      <div class="account-head">
        <span class="account-icon">${icon('shield', 21)}</span>
        <div class="account-info">
          <span class="eyebrow">ACCOUNT</span>
          <h3>未登录</h3>
          <p>请刷新页面并登录后使用。</p>
        </div>
      </div>
    </section>`;
  }

  const userName = getState().settings.userName?.trim() || sync.user.username;

  return `<section class="card account-card">
    <div class="account-head">
      ${avatarHtml(userName, { className: 'account-avatar', editable: true })}
      <div class="account-info">
        <span class="eyebrow">ACCOUNT</span>
        <h3>@${esc(sync.user.username)}</h3>
        <p data-account-status>${esc(info.detail)}</p>
      </div>
      <span class="sync-badge ${info.tone}" data-account-badge>${esc(info.label)}</span>
    </div>
    <div class="account-actions">
      <button type="button" class="btn btn-ghost" data-sync-now>${icon('rotate', 15)} 立即同步</button>
      <button type="button" class="btn btn-ghost" data-logout>${icon('logout', 15)} 退出登录</button>
    </div>
    <div class="account-actions">
      <button type="button" class="btn btn-ghost" data-change-password>${icon('shield', 15)} 修改密码</button>
      <button type="button" class="btn btn-ghost" data-logout-all>退出所有设备</button>
      <button type="button" class="btn btn-ghost" data-delete-account>注销账号</button>
    </div>
  </section>`;
}

export function mountAccountCard(root, ctx) {
  root.querySelector('[data-sync-now]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = `${icon('rotate', 15)} 同步中…`;
    try {
      await syncNow();
      showToast('已同步');
    } catch (error) {
      showToast(error.message || '同步失败', 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = `${icon('rotate', 15)} 立即同步`;
      updateAccountStatus(root);
    }
  });

  root.querySelector('[data-logout]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: '退出账号？',
      message: '退出后需要重新登录才能查看训练记录。',
      confirmText: '退出登录',
      danger: true,
      iconName: 'logout',
    });
    if (!confirmed) return;
    try {
      await logoutUser();
      showToast('已退出账号', 'info');
      ctx.rerender();
    } catch (error) {
      showToast(error.message || '退出失败', 'error');
    }
  });

  root.querySelector('[data-change-password]')?.addEventListener('click', () => {
    openPasswordSheet();
  });

  root.querySelector('[data-logout-all]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: '退出所有设备？',
      message: '所有设备都会退出登录，训练记录不会删除。',
      confirmText: '退出所有设备',
      danger: true,
      iconName: 'logout',
    });
    if (!confirmed) return;
    try {
      await logoutAllDevices();
      showToast('已退出所有设备', 'info');
      ctx.rerender();
    } catch (error) {
      showToast(error.message || '操作失败', 'error');
    }
  });

  root.querySelector('[data-delete-account]')?.addEventListener('click', () => {
    openDeleteAccountSheet({ onSuccess: ctx.rerender });
  });

  const unsubscribeSync = subscribeSync(() => updateAccountStatus(root));
  return () => {
    unsubscribeSync();
  };
}

export function updateAccountStatus(root) {
  const badge = root.querySelector('[data-account-badge]');
  const statusEl = root.querySelector('[data-account-status]');
  if (!badge || !statusEl) return;
  const info = syncStatusInfo();
  badge.textContent = info.label;
  badge.className = `sync-badge ${info.tone}`;
  statusEl.textContent = info.detail;
}

/* ---------------- 账号安全 ---------------- */

export function openPasswordSheet() {
  openSheet({
    title: '修改密码',
    subtitle: '其他设备会退出登录。',
    size: 'sm',
    className: 'auth-sheet',
    body: `<form class="auth-form" data-password-form>
        <label class="field"><span class="field-label">当前密码</span>
          <input class="input" name="current" type="password" autocomplete="current-password" autofocus />
        </label>
        <label class="field"><span class="field-label">新密码</span>
          <input class="input" name="next" type="password" minlength="8" maxlength="72" autocomplete="new-password" placeholder="至少 8 个字符" />
        </label>
        <label class="field"><span class="field-label">确认新密码</span>
          <input class="input" name="confirm" type="password" minlength="8" maxlength="72" autocomplete="new-password" placeholder="再输入一次新密码" />
        </label>
        <p class="auth-error" data-password-error></p>
      </form>`,
    footer: `<button type="button" class="btn btn-primary btn-block" data-password-submit>保存新密码</button>`,
    onMount: (sheet, close) => {
      const form = sheet.querySelector('[data-password-form]');
      const submit = sheet.querySelector('[data-password-submit]');
      const errorEl = sheet.querySelector('[data-password-error]');
      let working = false;

      const showError = (message) => {
        errorEl.textContent = message;
        errorEl.classList.add('show');
      };

      const submitForm = async () => {
        if (working) return;
        const current = form.elements.current.value;
        const next = form.elements.next.value;
        const confirm = form.elements.confirm.value;
        if (!current) return showError('请输入当前密码');
        if (next.length < 8) return showError('新密码至少需要 8 个字符');
        if (next !== confirm) return showError('两次输入的新密码不一致');
        if (next === current) return showError('新密码不能和当前密码相同');
        working = true;
        submit.disabled = true;
        submit.textContent = '保存中…';
        errorEl.classList.remove('show');
        try {
          await changePassword(current, next);
          close();
          showToast('密码已更新，其他设备已退出登录');
        } catch (error) {
          showError(error.message || '修改失败，请稍后再试');
        } finally {
          working = false;
          submit.disabled = false;
          submit.textContent = '保存新密码';
        }
      };

      submit.addEventListener('click', submitForm);
      form.addEventListener('submit', (event) => event.preventDefault());
      form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitForm();
        }
      });
    },
  });
}

export function openDeleteAccountSheet({ onSuccess } = {}) {
  const username = getSyncState().user?.username || '';
  openSheet({
    title: '注销账号',
    size: 'sm',
    dismissible: true,
    className: 'auth-sheet',
    body: `<div class="cloud-choice">
        <p class="cloud-hint" style="margin-bottom:14px">${icon('info', 14)} 账号「${esc(username)}」的全部训练记录将被永久删除，无法恢复。建议先导出备份，然后输入密码确认。</p>
        <form class="auth-form" data-delete-form>
          <label class="field"><span class="field-label">账号密码</span>
            <input class="input" name="password" type="password" autocomplete="current-password" autofocus />
          </label>
          <p class="auth-error" data-delete-error></p>
        </form>
      </div>`,
    footer: `<button type="button" class="btn btn-outline-danger btn-block" data-delete-submit>${icon('trash', 15)} 永久注销账号</button>`,
    onMount: (sheet, close) => {
      const form = sheet.querySelector('[data-delete-form]');
      const submit = sheet.querySelector('[data-delete-submit]');
      const errorEl = sheet.querySelector('[data-delete-error]');
      let working = false;

      const submitForm = async () => {
        if (working) return;
        const password = form.elements.password.value;
        if (!password) {
          errorEl.textContent = '请输入账号密码';
          errorEl.classList.add('show');
          return;
        }
        const confirmed = await confirmDialog({
          title: '确认永久注销？',
          message: `账号「${username}」的全部训练记录将被永久删除，无法恢复。`,
          confirmText: '永久注销',
          danger: true,
          iconName: 'trash',
        });
        if (!confirmed) return;
        working = true;
        submit.disabled = true;
        submit.innerHTML = `${icon('rotate', 15)} 正在注销…`;
        errorEl.classList.remove('show');
        try {
          await deleteAccount(password);
          close();
          showToast('账号已注销', 'info');
          onSuccess?.();
        } catch (error) {
          errorEl.textContent = error.message || '注销失败，请稍后再试';
          errorEl.classList.add('show');
          submit.disabled = false;
          submit.innerHTML = `${icon('trash', 15)} 永久注销账号`;
        } finally {
          working = false;
        }
      };

      submit.addEventListener('click', submitForm);
      form.addEventListener('submit', (event) => event.preventDefault());
      form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitForm();
        }
      });
    },
  });
}
