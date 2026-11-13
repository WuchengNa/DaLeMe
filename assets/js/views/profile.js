/* 大了么 · 「我的」首页：只保留身份、BMI 概览与四个二级入口 */
import { APP_NAME } from '../data.js';
import {
  getState,
  getWorkouts,
  trainingStreakDays,
  updateSettings,
  workoutStats,
} from '../store.js';
import { syncStatusInfo } from '../account.js';
import { getSyncState } from '../sync.js';
import { avatarHtml } from '../avatar.js';
import { getBodyProfile, bmiCardHtml } from '../body-view.js';
import { icon, openSheet, showToast } from '../ui.js';
import { esc, fmtDate, fmtVolume, sum } from '../utils.js';

export default function profileView(ctx) {
  const state = getState();
  const workouts = getWorkouts();
  const totalVolume = sum(workouts, (w) => Number(w.totalVolume) || workoutStats(w).volume);
  const streak = trainingStreakDays();
  const userName = state.settings.userName?.trim() || '训练者';
  const body = getBodyProfile();
  const sync = getSyncState();
  const syncInfo = syncStatusInfo(sync);

  const bodySummary = body.bmi != null
    ? `BMI ${body.bmi.toFixed(1)} · ${body.band.label}`
    : '补充身高体重后自动计算 BMI';
  const prefSummary = `每周 ${Number(state.settings.weeklyGoal) || 4} 次 · 休息 ${Number(state.settings.defaultRest) || 90} 秒 · ${state.settings.theme === 'light' ? '浅色' : '深色'}模式`;
  const accountSummary = sync.user
    ? `${syncInfo.label} · @${sync.user.username}`
    : '未登录';

  const menuRows = [
    { path: '/profile/body', iconName: 'scale', title: '身体数据', desc: bodySummary },
    { path: '/profile/preferences', iconName: 'target', title: '训练偏好', desc: prefSummary },
    { path: '/profile/account', iconName: 'shield', title: '账号与同步', desc: accountSummary },
    { path: '/profile/data', iconName: 'layers', title: '数据管理', desc: '导出备份 · 导入 · 清空' },
  ];

  const html = `<div>
    <header class="page-head">
      <div><span class="eyebrow">PROFILE</span><h1>我的</h1></div>
      <div class="page-head-actions profile-head-action">
        <button type="button" class="btn btn-ghost" data-edit-name>${icon('edit', 15)} 编辑资料</button>
      </div>
    </header>

    <section class="profile-hero">
      ${avatarHtml(userName, { size: 'lg', editable: true })}
      <div class="profile-hero-info">
        <h1>${esc(userName)}</h1>
        <p>${workouts.length ? `从 ${fmtDate(new Date(workouts[workouts.length - 1].startedAt), false)} 开始，已经记录 ${workouts.length} 次训练` : '还没有开始记录，第一练随时可以发生'}</p>
        <div class="profile-hero-stats">
          <div><b>${workouts.length}</b><span>训练次数</span></div>
          <div><b>${fmtVolume(totalVolume)}</b><span>累计容量</span></div>
          <div><b>${streak}</b><span>连续训练天数</span></div>
        </div>
      </div>
      <button type="button" class="icon-btn" data-edit-name aria-label="编辑资料">${icon('edit', 18)}</button>
    </section>

    ${bmiCardHtml(body)}

    <nav class="card profile-menu" aria-label="设置入口">
      ${menuRows
        .map(
          (row) => `<a class="profile-menu-row" href="#${row.path}">
            <span class="profile-menu-icon">${icon(row.iconName, 18)}</span>
            <span class="profile-menu-text"><strong>${row.title}</strong><span>${esc(row.desc)}</span></span>
            <span class="profile-menu-arrow">${icon('chevron-right', 16)}</span>
          </a>`,
        )
        .join('')}
    </nav>

    <div class="about-foot">
      <b>${APP_NAME} · DALEME</b><br/>
      每一次，都算数。
    </div>
  </div>`;

  function editName() {
    openSheet({
      title: '编辑资料',
      size: 'sm',
      body: `<label class="field"><span class="field-label">你的称呼</span><input class="input" data-name-input maxlength="16" placeholder="训练者" value="${esc(userName === '训练者' ? '' : userName)}" autofocus /></label>
        <p class="body-form-tip" style="margin-top:10px">头像请点击左上角图片更换，身高体重请到「身体数据」设置。</p>`,
      footer: `<div class="btn-row"><button type="button" class="btn btn-ghost" data-sheet-close>取消</button><button type="button" class="btn btn-primary" data-save-name>保存</button></div>`,
      onMount: (sheet, close) => {
        sheet.querySelector('[data-save-name]').addEventListener('click', () => {
          const value = sheet.querySelector('[data-name-input]').value.trim();
          updateSettings({ userName: value });
          close();
          showToast('资料已更新');
          ctx.rerender();
        });
      },
    });
  }

  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-edit-name]').forEach((button) => button.addEventListener('click', editName));
    },
  };
}
