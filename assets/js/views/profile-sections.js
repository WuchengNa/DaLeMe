/* 大了么 · 「我的」二级页面：身体数据 / 训练偏好 / 账号与同步 / 数据管理 */
import {
  addBodyWeight,
  bodyWeightSeries,
  clearAllData,
  deleteBodyWeight,
  exportPayload,
  getState,
  importPayload,
  latestBodyWeight,
  updateSettings,
} from '../store.js';
import { accountCardHtml, mountAccountCard } from '../account.js';
import { getBodyProfile, bmiCardHtml } from '../body-view.js';
import { GENDERS } from '../bmi.js';
import { lineChart } from '../charts.js';
import { confirmDialog, icon, showToast } from '../ui.js';
import { clamp, downloadFile, esc, todayKey } from '../utils.js';

function subHead(title, subtitle) {
  return `<header class="profile-subhead">
    <a class="icon-btn" href="#/profile" aria-label="返回我的">${icon('arrow-left', 18)}</a>
    <div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
  </header>`;
}

function restoreScroll(fn) {
  const y = window.scrollY;
  fn();
  requestAnimationFrame(() => window.scrollTo(0, y));
}

/* ---------------- 身体数据：基础信息 + BMI + 体重趋势 ---------------- */

export function bodyView(ctx) {
  const state = getState();
  const body = getBodyProfile();
  const series = bodyWeightSeries();
  const latest = latestBodyWeight();
  const gender = state.settings.gender || 'unset';

  const chartPoints = series.slice(-12).map((record) => ({
    label: `${new Date(record.date).getMonth() + 1}/${new Date(record.date).getDate()}`,
    value: record.weight,
    tooltip: `${record.date} · ${record.weight}kg${record.bodyFat ? ` · 体脂 ${record.bodyFat}%` : ''}`,
  }));
  const bodyRecords = [...series].reverse().slice(0, 10);

  const html = `<div>
    ${subHead('身体数据', '身高、体重、性别与 BMI')}
    ${bmiCardHtml(body, { link: false })}

    <section class="card settings-card">
      <div class="settings-card-head">
        <h3>基础信息</h3>
        <p>体重会同时记入下方趋势，保存后自动同步</p>
      </div>
      <form class="body-form" data-body-form>
        <div class="field">
          <span class="field-label">性别</span>
          <div class="seg" data-gender-group>
            ${GENDERS.map(
              (item) => `<button type="button" class="${item.key === gender ? 'active' : ''}" data-gender="${item.key}">${item.label}</button>`,
            ).join('')}
          </div>
        </div>
        <div class="body-form-row">
          <label class="field">
            <span class="field-label">身高（cm）</span>
            <input class="input" type="number" inputmode="decimal" min="100" max="230" step="0.5" data-body-height placeholder="例如 175" value="${body.height || ''}" />
          </label>
          <label class="field">
            <span class="field-label">当前体重（kg）</span>
            <input class="input" type="number" inputmode="decimal" min="20" max="300" step="0.1" data-body-weight placeholder="例如 68.5" value="${body.weight || ''}" />
          </label>
        </div>
        <label class="field">
          <span class="field-label">体脂率（%）· 选填</span>
          <input class="input" type="number" inputmode="decimal" min="1" max="70" step="0.1" data-body-fat placeholder="例如 18" value="${latest?.bodyFat || ''}" />
        </label>
        <button type="submit" class="btn btn-primary btn-block" data-save-body>${icon('check', 15)} 保存身体信息</button>
      </form>
    </section>

    <section class="card settings-card">
      <div class="settings-card-head">
        <h3>体重趋势</h3>
        <p>${series.length ? `共 ${series.length} 条记录` : '还没有记录'}</p>
      </div>
      <div style="padding:6px 18px 14px">
        ${chartPoints.length
          ? lineChart(chartPoints, { height: 190, color: 'var(--blue)', valueFormat: (v) => Number(v).toFixed(1), unit: ' kg' })
          : '<div class="chart-empty">记录一次体重，开始观察趋势</div>'}
      </div>
      ${
        bodyRecords.length
          ? `<div style="padding:0 18px 12px">
              ${bodyRecords
                .map(
                  (record) => `<div class="body-record">
                    <span class="date">${record.date === todayKey() ? '今天' : record.date.slice(5).replace('-', '/')}</span>
                    <span class="weight">${record.weight.toFixed(1)} kg</span>
                    ${record.bodyFat ? `<span class="fat">体脂 ${record.bodyFat}%</span>` : ''}
                    <button type="button" class="icon-btn" data-delete-bw="${record.id}" aria-label="删除记录">${icon('x', 14)}</button>
                  </div>`,
                )
                .join('')}
            </div>`
          : ''
      }
    </section>
  </div>`;

  return {
    html,
    mount(root) {
      let selectedGender = gender;
      const group = root.querySelector('[data-gender-group]');
      group?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-gender]');
        if (!button) return;
        selectedGender = button.dataset.gender;
        group.querySelectorAll('[data-gender]').forEach((el) => el.classList.toggle('active', el === button));
      });

      root.querySelector('[data-body-form]')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const heightInput = root.querySelector('[data-body-height]');
        const weightInput = root.querySelector('[data-body-weight]');
        const fatInput = root.querySelector('[data-body-fat]');
        const height = Number(heightInput.value);
        const weight = Number(weightInput.value);
        const fat = Number(fatInput.value);

        if (heightInput.value && (!height || height < 100 || height > 230)) {
          showToast('请输入 100–230 cm 之间的身高', 'error');
          heightInput.focus();
          return;
        }
        if (weightInput.value && (!weight || weight < 20 || weight > 300)) {
          showToast('请输入 20–300 kg 之间的体重', 'error');
          weightInput.focus();
          return;
        }
        if (fatInput.value && (!fat || fat < 1 || fat > 70)) {
          showToast('请输入 1–70 之间的体脂率', 'error');
          fatInput.focus();
          return;
        }

        updateSettings({ height: heightInput.value ? height : null, gender: selectedGender });
        if (weightInput.value) {
          addBodyWeight({
            date: todayKey(),
            weight: Math.round(weight * 10) / 10,
            bodyFat: fatInput.value ? Math.round(fat * 10) / 10 : null,
          });
        }
        showToast('身体信息已保存');
        ctx.rerender();
      });

      root.querySelectorAll('[data-delete-bw]').forEach((button) => {
        button.addEventListener('click', async () => {
          const confirmed = await confirmDialog({
            title: '删除这条身体数据？',
            message: '记录删除后无法恢复。',
            confirmText: '删除',
            danger: true,
            iconName: 'trash',
          });
          if (!confirmed) return;
          deleteBodyWeight(button.dataset.deleteBw);
          showToast('记录已删除');
          restoreScroll(ctx.rerender);
        });
      });
    },
  };
}

/* ---------------- 训练偏好 ---------------- */

export function preferencesView(ctx) {
  const state = getState();
  const goal = Number(state.settings.weeklyGoal) || 4;
  const rest = Number(state.settings.defaultRest) || 90;
  const isLight = state.settings.theme === 'light';

  const html = `<div>
    ${subHead('训练偏好', '目标、休息与外观')}
    <section class="card settings-card">
      <div class="setting-row">
        <span class="setting-icon">${icon('target', 17)}</span>
        <div class="setting-text"><strong>每周训练目标</strong><span>用于首页周进度</span></div>
        <div class="stepper setting-control">
          <button type="button" data-setting="weeklyGoal" data-step="-1" ${goal <= 1 ? 'disabled' : ''} aria-label="减少">${icon('minus', 15)}</button>
          <span><b>${goal}</b>次</span>
          <button type="button" data-setting="weeklyGoal" data-step="1" ${goal >= 7 ? 'disabled' : ''} aria-label="增加">${icon('plus', 15)}</button>
        </div>
      </div>
      <div class="setting-row">
        <span class="setting-icon">${icon('timer', 17)}</span>
        <div class="setting-text"><strong>默认组间休息</strong><span>新建动作时的默认秒数</span></div>
        <div class="stepper setting-control">
          <button type="button" data-setting="defaultRest" data-step="-15" ${rest <= 15 ? 'disabled' : ''} aria-label="减少">${icon('minus', 15)}</button>
          <span><b>${rest}</b>秒</span>
          <button type="button" data-setting="defaultRest" data-step="15" ${rest >= 300 ? 'disabled' : ''} aria-label="增加">${icon('plus', 15)}</button>
        </div>
      </div>
      <div class="setting-row">
        <span class="setting-icon">${isLight ? icon('sun', 17) : icon('moon', 17)}</span>
        <div class="setting-text"><strong>外观主题</strong><span>${isLight ? '明亮浅色' : '柔暗深色'}</span></div>
        <label class="switch setting-control" aria-label="切换主题">
          <input type="checkbox" data-theme-switch ${isLight ? 'checked' : ''} />
          <span class="switch-track"></span>
        </label>
      </div>
      <div class="setting-row">
        <span class="setting-icon">${icon('scale', 17)}</span>
        <div class="setting-text"><strong>重量单位</strong></div>
        <span class="tag">kg</span>
      </div>
    </section>
  </div>`;

  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-setting]').forEach((button) => {
        button.addEventListener('click', () => {
          const key = button.dataset.setting;
          const step = Number(button.dataset.step);
          const current = Number(getState().settings[key]) || 0;
          const next = key === 'weeklyGoal' ? clamp(current + step, 1, 7) : clamp(current + step, 15, 300);
          updateSettings({ [key]: next });
          restoreScroll(ctx.rerender);
        });
      });

      root.querySelector('[data-theme-switch]')?.addEventListener('change', () => {
        const next = getState().settings.theme === 'light' ? 'dark' : 'light';
        updateSettings({ theme: next, themeExplicit: true });
        document.documentElement.dataset.theme = next;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#fffaf5' : '#1e1611');
        restoreScroll(ctx.rerender);
      });
    },
  };
}

/* ---------------- 账号与同步 ---------------- */

export function accountView(ctx) {
  return {
    html: `<div>
      ${subHead('账号与同步', '登录状态与账号安全')}
      ${accountCardHtml()}
      <p class="bmi-standard" style="text-align:center;margin-top:4px">训练记录会自动同步到当前账号，换设备登录即可继续。</p>
    </div>`,
    mount(root) {
      return mountAccountCard(root, ctx);
    },
  };
}

/* ---------------- 数据管理 ---------------- */

export function dataView(ctx) {
  return {
    html: `<div>
      ${subHead('数据管理', '备份、导入与清空')}
      <section class="card settings-card">
        <div class="settings-card-head">
          <h3>本地数据</h3>
          <p>导出的备份包含计划、训练记录与身体数据</p>
        </div>
        <div class="data-actions">
          <button type="button" class="btn btn-ghost" data-export>${icon('download', 16)} 导出备份</button>
          <button type="button" class="btn btn-ghost" data-import>${icon('upload', 16)} 导入备份</button>
          <button type="button" class="btn btn-outline-danger" data-clear-all>${icon('trash', 16)} 清空全部数据</button>
        </div>
        <input type="file" accept="application/json,.json" data-import-file hidden />
      </section>
    </div>`,
    mount(root) {
      root.querySelector('[data-export]')?.addEventListener('click', () => {
        downloadFile(`daleme-backup-${todayKey()}.json`, exportPayload());
        showToast('备份文件已下载');
      });

      const fileInput = root.querySelector('[data-import-file]');
      root.querySelector('[data-import]')?.addEventListener('click', () => fileInput?.click());
      fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const confirmed = await confirmDialog({
            title: '导入备份？',
            message: '导入会替换当前所有计划、训练记录和身体数据。当前数据不会自动保留，建议先导出备份。',
            confirmText: '导入并替换',
            danger: true,
            iconName: 'upload',
          });
          if (!confirmed) {
            fileInput.value = '';
            return;
          }
          importPayload(text);
          showToast('备份已导入');
          ctx.navigate('/');
        } catch (error) {
          showToast(error.message || '导入失败，请检查文件', 'error');
          fileInput.value = '';
        }
      });

      root.querySelector('[data-clear-all]')?.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
          title: '清空全部数据？',
          message: '所有计划、训练记录、身体数据都会被永久删除。请确认已经导出备份。',
          confirmText: '全部清空',
          danger: true,
          iconName: 'trash',
        });
        if (confirmed) {
          clearAllData();
          showToast('数据已清空，重新开始');
          ctx.navigate('/');
        }
      });
    },
  };
}
