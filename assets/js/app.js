/* 大了么 · 应用外壳、路由与全局交互 */
import { APP_NAME, APP_VERSION, PLAN_COLORS } from './data.js';
import {
  getActivePlan,
  getActiveWorkout,
  getState,
  nextWorkoutSuggestion,
  startWorkout,
  subscribe,
  updateSettings,
  weeklySummary,
} from './store.js';
import { icon, logoMark, showToast, closeSheet, openSheet } from './ui.js';
import { esc, todayKey } from './utils.js';
import { avatarHtml } from './avatar.js';
import { getSyncState, initSync, subscribeSync } from './sync.js';
import { authPanelHtml, mountAuthPanel } from './account.js';

import homeView from './views/home.js';
import plansView from './views/plans.js';
import planEditorView from './views/plan-editor.js';
import workoutView from './views/workout.js';
import historyView from './views/history.js';
import historyDetailView from './views/history-detail.js';
import statsView from './views/stats.js';
import exercisesView from './views/exercises.js';
import exerciseDetailView from './views/exercise-detail.js';
import profileView from './views/profile.js';
import squareView from './views/square.js';
import postDetailView from './views/post-detail.js';
import userProfileView from './views/user-profile.js';
import { syncPublicProfile } from './social.js';
import {
  accountView,
  bodyView,
  dataView,
  preferencesView,
} from './views/profile-sections.js';

const viewRoot = document.getElementById('view');
const sidebar = document.getElementById('sidebar');
const mobileTopbar = document.getElementById('mobile-topbar');
const bottomNav = document.getElementById('bottom-nav');

let cleanupCurrent = null;
let currentRoute = { key: 'home', path: '/' };
let booted = false;

const NAV_ITEMS = [
  { key: 'home', label: '今日', icon: 'home', path: '/', group: '训练' },
  { key: 'plans', label: '训练计划', icon: 'plans', path: '/plans', group: '训练' },
  { key: 'exercises', label: '动作库', icon: 'dumbbell', path: '/exercises', group: '训练' },
  { key: 'square', label: '大大广场', icon: 'square', path: '/square', group: '社区' },
  { key: 'following', label: '关注', icon: 'users', path: '/following', group: '社区' },
  { key: 'history', label: '训练记录', icon: 'history', path: '/history', group: '数据' },
  { key: 'stats', label: '数据分析', icon: 'chart', path: '/stats', group: '数据' },
];
const NAV_GROUPS = ['训练', '社区', '数据'];

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart || '/';
  const segments = path.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart || '');
  return { path, segments, query };
}

function resolveRoute() {
  const { path, segments, query } = parseRoute();
  if (!segments.length) return { key: 'home', view: homeView, title: '今日训练', path };
  const [first, second, third] = segments;

  if (first === 'plans') {
    if (second === 'new') return { key: 'plans', view: planEditorView, params: { mode: 'create' }, title: '新建计划', path };
    if (third === 'edit') return { key: 'plans', view: planEditorView, params: { mode: 'edit', id: second }, title: '编辑计划', path };
    if (second) return { key: 'plans', view: plansView, params: { detailId: second }, title: '计划详情', path };
    return { key: 'plans', view: plansView, title: '训练计划', path };
  }
  if (first === 'workout') return { key: 'workout', view: workoutView, title: '训练中', path };
  if (first === 'history') {
    if (second) return { key: 'history', view: historyDetailView, params: { id: second, query }, title: '训练详情', path };
    return { key: 'history', view: historyView, title: '训练记录', path };
  }
  if (first === 'stats') return { key: 'stats', view: statsView, title: '数据分析', path };
  if (first === 'square' || first === 'following') {
    if (first === 'square' && second === 'p' && third) {
      return { key: 'square', view: postDetailView, params: { id: third }, title: '分享详情', path };
    }
    if (first === 'square' && second === 'u' && third) {
      return { key: 'square', view: userProfileView, params: { id: third }, title: '训练者主页', path };
    }
    return {
      key: first === 'following' ? 'following' : 'square',
      view: squareView,
      params: { tab: first === 'following' ? 'following' : 'square' },
      title: first === 'following' ? '关注' : '大大广场',
      path,
    };
  }
  if (first === 'exercises') {
    if (second) return { key: 'exercises', view: exerciseDetailView, params: { id: second }, title: '动作详情', path };
    return { key: 'exercises', view: exercisesView, title: '动作库', path };
  }
  if (first === 'profile') {
    const subviews = {
      body: { view: bodyView, title: '身体数据' },
      preferences: { view: preferencesView, title: '训练偏好' },
      account: { view: accountView, title: '账号与同步' },
      data: { view: dataView, title: '数据管理' },
    };
    const sub = second && subviews[second];
    if (sub) return { key: 'profile', view: sub.view, title: sub.title, path };
    return { key: 'profile', view: profileView, title: '我的', path };
  }
  return { key: 'home', view: homeView, title: '今日训练', path };
}

function navigate(path) {
  const next = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === next) {
    renderRoute();
    return;
  }
  location.hash = next;
}

function startSuggestedWorkout() {
  const active = getActiveWorkout();
  if (active) {
    navigate('/workout');
    showToast('继续上次训练', 'info');
    return;
  }
  const suggestion = nextWorkoutSuggestion();
  if (!suggestion) {
    const plan = getActivePlan();
    if (plan) {
      showToast('先给计划安排几个动作', 'info');
      navigate(`/plans/${plan.id}/edit`);
    } else {
      showToast('先创建一个训练计划吧', 'info');
      navigate('/plans');
    }
    return;
  }
  openSheet({
    title: '开始今天的训练？',
    subtitle: `${suggestion.plan.name} · 第 ${suggestion.dayIndex + 1} 天`,
    size: 'sm',
    body: `<div class="quick-start-sheet">
      <div class="quick-plan-line">
        ${PLAN_COLORS.find((c) => c.id === suggestion.plan.color)?.value ? `<i style="background:${PLAN_COLORS.find((c) => c.id === suggestion.plan.color).value}"></i>` : ''}
        <strong>${esc(suggestion.day.name)}</strong>
      </div>
      <div class="quick-ex-list">
        ${suggestion.day.exercises
          .slice(0, 5)
          .map(
            (entry) =>
              `<span>${esc(entry.sets)} 组 · ${esc(entry.reps)} 次</span>`,
          )
          .join('')}
        ${suggestion.day.exercises.length > 5 ? `<span>+${suggestion.day.exercises.length - 5} 个动作</span>` : ''}
      </div>
    </div>`,
    footer: `<div class="btn-row">
      <button type="button" class="btn btn-ghost" data-sheet-close>再想想</button>
      <button type="button" class="btn btn-primary" data-quick-confirm>开始训练 ${icon('arrow-right', 16)}</button>
    </div>`,
    onMount: (sheet, close) => {
      sheet.querySelector('[data-quick-confirm]')?.addEventListener('click', () => {
        startWorkout(suggestion.plan, suggestion.day);
        close();
        navigate('/workout');
      });
    },
  });
}

function toggleTheme() {
  const state = getState();
  const next = state.settings.theme === 'light' ? 'dark' : 'light';
  updateSettings({ theme: next, themeExplicit: true });
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#fffaf5' : '#1e1611');
  renderChrome();
  renderRoute();
}

function renderChrome() {
  if (!getSyncState().user) return;
  const state = getState();
  const summary = weeklySummary();
  const active = getActiveWorkout();
  const sync = getSyncState();
  const userName = state.settings.userName?.trim() || '训练者';
  const activePlan = getActivePlan();
  const goal = Math.max(1, Number(state.settings.weeklyGoal) || 1);
  const pct = Math.min(100, Math.round((summary.count / goal) * 100));
  const currentKey = currentRoute.key;

  const navGroups = NAV_GROUPS;
  const navHtml = navGroups
    .map(
      (group) => `<span class="nav-label">${group}</span>${NAV_ITEMS.filter((item) => item.group === group)
        .map(
          (item) => `<a class="nav-link${currentKey === item.key ? ' active' : ''}" href="#${item.path}" data-nav="${item.key}">
            ${icon(item.icon, 19)}
            <span>${item.label}</span>
            ${item.key === 'history' && summary.count ? `<span class="nav-badge">${summary.count}</span>` : ''}
          </a>`,
        )
        .join('')}`,
    )
    .join('');

  sidebar.innerHTML = `
    <a class="brand" href="#/" aria-label="大了么首页">
      ${logoMark()}
      <span class="brand-text"><strong>大了么</strong><span>DALEME</span></span>
    </a>
    <div class="sidebar-action">
      <button type="button" class="btn btn-primary btn-block" data-quick-start>
        ${icon(active ? (active.pausedAt ? 'pause' : 'play') : 'zap', 17)} ${active ? (active.pausedAt ? '训练已暂停' : '继续训练') : '开始训练'}
      </button>
      <div class="sidebar-goal">
        <span>本周目标</span>
        <div class="sidebar-goal-bar"><i style="width:${pct}%"></i></div>
        <b>${summary.count}/${goal}</b>
      </div>
    </div>
    <nav class="nav" aria-label="主导航">${navHtml}</nav>
    <div class="sidebar-foot">
      <a class="side-profile" href="#/profile">
        ${avatarHtml(userName, { dot: true })}
        <span class="side-profile-text"><strong>${esc(userName)}</strong><span>${sync.user ? `@${esc(sync.user.username)}` : activePlan ? esc(activePlan.name) : '还没有训练计划'}</span></span>
        ${icon('chevron-right', 16)}
      </a>
      <div class="sidebar-tools">
        <button type="button" class="tool-btn" data-theme-toggle>${icon(state.settings.theme === 'light' ? 'moon' : 'sun', 15)}${state.settings.theme === 'light' ? '深色' : '浅色'}</button>
        <a class="tool-btn" href="#/profile">${icon('shield', 15)} 数据</a>
      </div>
    </div>`;

  mobileTopbar.innerHTML = `
    <a class="mobile-brand" href="#/">
      ${logoMark('sm')}
      <span class="brand-text"><strong>大了么</strong><span>DALEME</span></span>
    </a>
    <div class="mobile-top-actions">
      <a class="icon-btn" href="#/exercises" aria-label="动作库">${icon('dumbbell', 19)}</a>
      <button type="button" class="icon-btn" data-theme-toggle aria-label="切换主题">${icon(state.settings.theme === 'light' ? 'moon' : 'sun', 19)}</button>
      <a class="icon-btn account-entry${sync.user ? ' online' : ''}" href="#/profile" aria-label="我的">${avatarHtml(userName, { className: 'avatar-topbar' })}</a>
    </div>`;

  const mobileItems = [
    { key: 'home', label: '今日', icon: 'home', path: '/' },
    { key: 'square', label: '广场', icon: 'square', path: '/square' },
    { key: 'workout', label: active ? (active.pausedAt ? '暂停中' : '继续') : '开始', icon: active?.pausedAt ? 'pause' : 'zap', path: '/workout', center: true },
    { key: 'plans', label: '计划', icon: 'plans', path: '/plans' },
    { key: 'history', label: '记录', icon: 'history', path: '/history' },
  ];

  bottomNav.innerHTML = mobileItems
    .map((item) => {
      if (item.center) {
        return `<button type="button" class="bottom-item center${currentKey === 'workout' ? ' active' : ''}" data-quick-start>
          <span class="center-btn">${icon(active ? (active.pausedAt ? 'pause' : 'play') : 'plus', 21)}</span>
          <span>${item.label}</span>
        </button>`;
      }
      const isActive =
        currentKey === item.key ||
        (item.key === 'square' && currentKey === 'following') ||
        (item.key === 'plans' && (currentKey === 'plan-editor' || currentKey === 'plans')) ||
        (item.key === 'exercises' && currentKey === 'exercises');
      return `<a class="bottom-item${isActive ? ' active' : ''}" href="#${item.path}">
        ${icon(item.icon, 20)}<span>${item.label}</span>
      </a>`;
    })
    .join('');

  sidebar.querySelectorAll('[data-quick-start], [data-theme-toggle]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      if (el.hasAttribute('data-theme-toggle')) toggleTheme();
      else startSuggestedWorkout();
    });
  });
  mobileTopbar.querySelectorAll('[data-theme-toggle]').forEach((el) => el.addEventListener('click', toggleTheme));
  bottomNav.querySelectorAll('[data-quick-start]').forEach((el) => el.addEventListener('click', startSuggestedWorkout));
}

function renderRoute() {
  if (!getSyncState().user) {
    renderAuthWall();
    return;
  }
  const route = resolveRoute();
  // 所有页面都能拿到 URL 查询参数（例如 #/plans?templates=1）
  if (!route.query) route.query = parseRoute().query;
  currentRoute = route;
  if (typeof cleanupCurrent === 'function') {
    try {
      cleanupCurrent();
    } catch (error) {
      console.warn(error);
    }
  }
  cleanupCurrent = null;
  closeSheet(true);

  const ctx = {
    navigate,
    rerender: renderRoute,
    refreshChrome: renderChrome,
    query: route.query || route.params?.query || new URLSearchParams(),
  };

  let result;
  try {
    result = route.view({ ...route.params, ...ctx });
  } catch (error) {
    console.error('[大了么] 页面渲染失败', error);
    result = {
      html: `<div class="empty-state"><div class="empty-icon">${icon('info', 26)}</div><h3>页面加载失败</h3><p>${esc(error.message)}</p><a class="btn btn-primary" href="#/">返回首页</a></div>`,
    };
  }

  viewRoot.innerHTML = result.html;
  document.title = `${result.title || route.title} · ${APP_NAME}`;
  renderChrome();

  if (typeof result.mount === 'function') {
    try {
      cleanupCurrent = result.mount(viewRoot, ctx);
    } catch (error) {
      console.error('[大了么] 页面交互初始化失败', error);
    }
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* 保存后刷新外壳进度 */
subscribe(() => {
  if (booted) renderChrome();
});

subscribeSync(() => {
  if (!getSyncState().user) {
    if (booted) renderAuthWall();
    return;
  }
  if (booted) renderChrome();
});

window.addEventListener('hashchange', renderRoute);

function applyTheme() {
  const theme = getState().settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#fffaf5' : '#1e1611');
}

applyTheme();

/* ---------------- 登录门禁 ---------------- */

function renderAuthWall() {
  booted = false;
  document.body.classList.add('auth-mode');
  closeSheet(true);
  sidebar.innerHTML = '';
  mobileTopbar.innerHTML = '';
  bottomNav.innerHTML = '';
  viewRoot.innerHTML = authPanelHtml();
  document.title = `登录 · ${APP_NAME}`;
  mountAuthPanel(viewRoot, { onSuccess: enterApp });
}

function enterApp() {
  document.body.classList.remove('auth-mode');
  applyTheme();
  booted = true;
  renderChrome();
  renderRoute();
}

function setAuthChecking(checking) {
  const checkingEl = viewRoot.querySelector('[data-auth-checking]');
  if (checkingEl) checkingEl.hidden = !checking;
  viewRoot.querySelectorAll('.auth-page input, [data-auth-submit], [data-auth-mode]').forEach((el) => {
    el.disabled = checking;
  });
}

async function boot() {
  /* 首屏直接渲染登录页：验证会话期间也不会露出任何应用内容 */
  renderAuthWall();
  setAuthChecking(true);
  let result;
  try {
    result = await initSync();
  } finally {
    if (!getSyncState().user) setAuthChecking(false);
  }
  applyTheme();
  if (!getSyncState().user) {
    if (result?.error) showToast('网络连接失败，请稍后重试', 'error');
    return;
  }
  enterApp();
  /* 把「我的称呼」同步到广场的公开资料（失败不阻塞使用） */
  void syncPublicProfile();
  if (result?.error) showToast('网络连接失败，请检查网络后重试', 'error');
  console.info(`%c大了么 v${APP_VERSION}`, 'color:#ff9b3f;font-weight:700', `· ${todayKey()}`);
}

boot();
