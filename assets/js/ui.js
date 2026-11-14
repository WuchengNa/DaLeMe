/* 大了么 · 图标与通用 UI 组件 */
import { MUSCLES } from './data.js';
import { workoutStats } from './store.js';
import {
  esc,
  fmtDuration,
  fmtVolume,
  fmtWeight,
  relativeDate,
  toDateKey,
  WEEKDAYS,
} from './utils.js';

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  plans: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M8 3v3M16 3v3M3 9h18"/><path d="M7.5 13h3M13.5 13h3M7.5 17h3"/>',
  dumbbell: '<path d="M6.5 6.5v11M3.5 8.5v7M17.5 6.5v11M20.5 8.5v7M6.5 12h11"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  x: '<path d="m5 5 14 14M19 5 5 19"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  'chevron-left': '<path d="m15 5-7 7 7 7"/>',
  'chevron-down': '<path d="m5 9 7 7 7-7"/>',
  'arrow-left': '<path d="M20 12H4M10 6l-6 6 6 6"/>',
  'arrow-right': '<path d="M4 12h16M14 6l6 6-6 6"/>',
  'arrow-up': '<path d="M12 20V4M5 11l7-7 7 7"/>',
  'arrow-down': '<path d="M12 4v16M5 13l7 7 7-7"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14"/><path d="M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-6.6 0-3.2-2-5.4-4.2-7.6C13.5 6.5 12.5 4.5 12 2c-.8 3.4-2.6 4.8-4.1 6.7C6 11 5 12.7 5 15.4 5 19.2 8 22 12 22z"/><path d="M9.5 16.5c0 1.7 1.1 2.8 2.5 2.8s2.5-1.1 2.5-2.8c0-1.4-.9-2.4-1.7-3.3-.5-.6-.9-1.2-1.1-1.9-.5 1.1-2.2 2.7-2.2 5.2z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v4M8 21h8M9 21v-4h6v4"/>',
  scale: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 10a4.5 4.5 0 0 1 8 0M12 10l1.8-1.8"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"/>',
  grip: '<circle cx="9" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1" fill="currentColor" stroke="none"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  note: '<path d="M5 3h14v18l-7-4-7 4V3z"/><path d="M9 8h6M9 12h4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  rotate: '<path d="M20 11a8 8 0 0 0-14-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8 8 0 0 0 14 4l3-3"/><path d="M21 19v-5h-5"/>',
  spark: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5M3 17l9 5 9-5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  crown: '<path d="m3 7 4 4 5-7 5 7 4-4-2 12H5L3 7z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  logout: '<path d="M9 4H5v16h4M14 8l4 4-4 4M8 12h10"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  drag: '<path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" stroke-width="3"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>',
  share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  wechat: '<path d="M9.5 4C5.6 4 2.5 6.5 2.5 9.6c0 1.7.9 3.2 2.4 4.2l-.6 2.2 2.5-1.2c.8.2 1.8.4 2.7.4h.6"/><path d="M6.6 8.2h.01M12.4 8.2h.01" stroke-width="2.6"/><path d="M14.8 11.6c3.4 0 6.2 2.2 6.2 5s-2.8 5-6.2 5c-.7 0-1.4-.1-2-.3l-2.2 1 .5-2c-1.1-.9-1.8-2.2-1.8-3.7 0-2.8 2.8-5 5.5-5z"/><path d="M12.8 15h.01M16.8 15h.01" stroke-width="2.6"/>',
  square: '<rect x="3" y="3" width="7.4" height="7.4" rx="2.2"/><rect x="13.6" y="3" width="7.4" height="7.4" rx="2.2"/><rect x="3" y="13.6" width="7.4" height="7.4" rx="2.2"/><rect x="13.6" y="13.6" width="7.4" height="7.4" rx="2.2"/>',
  users: '<circle cx="9.2" cy="8" r="3.5"/><path d="M2.8 20a6.4 6.4 0 0 1 12.8 0"/><path d="M16.4 5.1a3.5 3.5 0 0 1 0 5.8M17.6 14.2A6.4 6.4 0 0 1 21.6 20"/>',
  heart: '<path d="M12 20.4 4.7 13a4.9 4.9 0 0 1 6.9-7l.4.4.4-.4a4.9 4.9 0 0 1 6.9 7L12 20.4z"/>',
  send: '<path d="M21 3 3 10.4l7.1 2.6L12.7 20 21 3z"/><path d="M10.1 13 21 3"/>',
  'user-plus': '<circle cx="9.5" cy="8" r="3.6"/><path d="M3 20a6.5 6.5 0 0 1 13 0"/><path d="M18.5 7v6M15.5 10h6"/>',
  'user-check': '<circle cx="9.5" cy="8" r="3.6"/><path d="M3 20a6.5 6.5 0 0 1 13 0"/><path d="m15.8 10.2 2 2 3.7-4"/>',
  quote: '<path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  'volume-on': '<path d="M4 9v6h3l5 4V5L7 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  'volume-off': '<path d="M4 9v6h3l5 4V5L7 9H4z"/><path d="m16 9 5 6M21 9l-5 6"/>',
};

export function icon(name, size = 20, extra = '') {
  const path = PATHS[name] || PATHS.info;
  return `<svg class="icon ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function logoMark(size = 'md') {
  return `<span class="logo-mark ${size}"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M6 13h20M16 6v12M16 18L7 27M16 18l9 9" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg></span>`;
}

export function muscleBadge(muscle, small = false) {
  const info = MUSCLES[muscle] || MUSCLES.chest;
  return `<span class="muscle-badge${small ? ' sm' : ''}" style="--muscle:${info.color};--muscle-soft:${info.soft}">
    <i></i>${esc(info.name)}</span>`;
}

export function exerciseGlyph(muscle, size = 'md') {
  const info = MUSCLES[muscle] || MUSCLES.chest;
  return `<span class="exercise-glyph ${size}" style="--muscle:${info.color};--muscle-soft:${info.soft}">
    ${icon(muscle === 'cardio' ? 'activity' : 'dumbbell', size === 'sm' ? 16 : 20)}
  </span>`;
}

export function pageHead({ eyebrow = '', title, subtitle = '', actions = '' }) {
  return `<header class="page-head">
    <div>
      ${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}
      <h1>${title}</h1>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
    </div>
    ${actions ? `<div class="page-head-actions">${actions}</div>` : ''}
  </header>`;
}

export function emptyState({ iconName = 'dumbbell', title, text = '', action = '' }) {
  return `<div class="empty-state">
    <div class="empty-icon">${icon(iconName, 26)}</div>
    <h3>${title}</h3>
    ${text ? `<p>${text}</p>` : ''}
    ${action || ''}
  </div>`;
}

export function ringProgress({ value, size = 116, stroke = 8, color = 'var(--accent)', track = 'rgba(255,255,255,.08)', label = '', sub = '' }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  return `<div class="ring-progress" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
      <circle class="ring-value" cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-label">${label}<small>${sub}</small></div>
  </div>`;
}

export function workoutRow(workout) {
  const stats = workoutStats(workout);
  const date = new Date(workout.startedAt);
  const volume = workout.totalVolume || stats.volume;
  const sets = workout.totalSets || stats.sets;
  const hasLoad = (workout.exercises || []).some((exercise) =>
    (exercise.sets || []).some((set) => set.done && Number(set.weight) > 0),
  );
  return `<a class="workout-row" href="#/history/${workout.id}">
    <div class="date-block">
      <strong>${String(date.getDate()).padStart(2, '0')}</strong>
      <span>${WEEKDAYS[date.getDay()]}</span>
    </div>
    <div class="workout-row-main">
      <div class="workout-row-title">
        <h3>${esc(workout.dayName)}</h3>
        <span class="dot-sep"></span>
        <span>${relativeDate(date)}</span>
      </div>
      <p>${esc(workout.planName)} · ${workout.exercises.length} 个动作 · ${sets} 组</p>
    </div>
    <div class="workout-row-stats">
      <strong>${hasLoad ? fmtVolume(volume) : '自重'}</strong>
      <span>${fmtDuration(workout.durationSec, true)}</span>
    </div>
    <span class="row-chevron">${icon('chevron-right', 18)}</span>
  </a>`;
}

export function setChip(set, index) {
  if (!set) return '';
  const label = Number(set.weight) > 0 ? `${fmtWeight(set.weight)} × ${set.reps}` : `${set.reps} 次`;
  return `<span class="set-chip ${set.type === 'warmup' ? 'warmup' : ''}">
    <b>${set.type === 'warmup' ? 'W' : index + 1}</b>${esc(label)}</span>`;
}

export function segmented(items, active, actionName) {
  return `<div class="segmented" role="tablist">
    ${items
      .map(
        (item) =>
          `<button type="button" class="segmented-item${item.value === active ? ' active' : ''}"
            data-action="${actionName}" data-value="${esc(item.value)}" role="tab" aria-selected="${item.value === active}">${esc(item.label)}</button>`,
      )
      .join('')}
  </div>`;
}

export function stepper(value, { min = 1, max = 99, step = 1, action = 'stepper', suffix = '' } = {}) {
  return `<div class="stepper" data-stepper>
    <button type="button" data-action="${action}" data-step="${-step}" ${value <= min ? 'disabled' : ''} aria-label="减少">${icon('minus', 16)}</button>
    <span><b data-stepper-value>${value}</b>${suffix}</span>
    <button type="button" data-action="${action}" data-step="${step}" ${value >= max ? 'disabled' : ''} aria-label="增加">${icon('plus', 16)}</button>
  </div>`;
}

/* ---------------- Toast ---------------- */

let toastTimer = null;

export function showToast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  clearTimeout(toastTimer);
  root.innerHTML = `<div class="toast ${type}">
    <span class="toast-icon">${icon(type === 'error' ? 'info' : type === 'info' ? 'info' : 'check', 17)}</span>
    <span>${esc(message)}</span>
  </div>`;
  requestAnimationFrame(() => root.firstElementChild?.classList.add('show'));
  toastTimer = setTimeout(() => {
    root.firstElementChild?.classList.remove('show');
    setTimeout(() => (root.innerHTML = ''), 250);
  }, 2600);
}

/* ---------------- Sheet ---------------- */

let activeSheet = null;

export function closeSheet(immediate = false) {
  if (!activeSheet) return;
  const { layer, onClose, resolveClose } = activeSheet;
  const instance = activeSheet;
  activeSheet = null;
  document.body.classList.remove('sheet-open');
  layer.classList.remove('open');
  const finish = () => {
    layer.remove();
    if (onClose) onClose();
    resolveClose?.(false);
  };
  if (immediate) finish();
  else setTimeout(finish, 220);
  return instance;
}

/**
 * 底部/居中弹出层
 * @returns {Function} close
 */
export function openSheet({
  title = '',
  subtitle = '',
  body = '',
  footer = '',
  size = 'md',
  onMount,
  onClose,
  dismissible = true,
  className = '',
  autoFocus = true,
} = {}) {
  closeSheet(true);
  const root = document.getElementById('overlay-root');
  if (!root) return () => {};
  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  layer.innerHTML = `
    <div class="sheet-backdrop"></div>
    <section class="sheet sheet-${size} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab" aria-hidden="true"></div>
      <header class="sheet-head">
        <div>
          <h2>${esc(title)}</h2>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
        </div>
        ${dismissible ? `<button type="button" class="icon-btn sheet-close" aria-label="关闭">${icon('x', 20)}</button>` : ''}
      </header>
      <div class="sheet-body">${body}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
    </section>`;
  root.appendChild(layer);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => layer.classList.add('open'));

  const close = () => {
    if (activeSheet?.layer === layer) closeSheet();
  };

  const sheet = layer.querySelector('.sheet');
  let resolveClose;
  const closedPromise = new Promise((resolve) => {
    resolveClose = resolve;
  });

  activeSheet = { layer, close, onClose, resolveClose };

  layer.querySelector('.sheet-backdrop')?.addEventListener('click', () => {
    if (dismissible) close();
  });
  layer.querySelector('.sheet-close')?.addEventListener('click', close);
  layer.querySelectorAll('[data-sheet-close]').forEach((el) => {
    el.addEventListener('click', close);
  });

  const onKey = (event) => {
    if (event.key === 'Escape' && dismissible) close();
  };
  document.addEventListener('keydown', onKey);
  const oldOnClose = onClose;
  activeSheet.onClose = () => {
    document.removeEventListener('keydown', onKey);
    oldOnClose?.();
  };

  if (onMount) onMount(sheet, close, closedPromise);
  if (autoFocus) {
    setTimeout(() => {
      const focusEl = sheet.querySelector('[autofocus], input, select, textarea, button:not(.sheet-close)');
      focusEl?.focus?.({ preventScroll: true });
    }, 120);
  }

  return close;
}

export function confirmDialog({
  title = '确认操作',
  message = '',
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  iconName = 'info',
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    openSheet({
      title,
      size: 'sm',
      className: 'confirm-sheet',
      body: `<div class="confirm-body">
        <div class="confirm-icon ${danger ? 'danger' : ''}">${icon(iconName, 26)}</div>
        <p>${message}</p>
      </div>`,
      footer: `<div class="btn-row">
        <button type="button" class="btn btn-ghost" data-confirm-cancel>${esc(cancelText)}</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>${esc(confirmText)}</button>
      </div>`,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
      onMount: (sheet, close) => {
        sheet.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => {
          settled = true;
          resolve(false);
          close();
        });
        sheet.querySelector('[data-confirm-ok]')?.addEventListener('click', () => {
          settled = true;
          resolve(true);
          close();
        });
      },
    });
  });
}

export function actionSheet(title, actions, subtitle = '') {
  openSheet({
    title,
    subtitle,
    size: 'sm',
    body: `<div class="action-list">
      ${actions
        .map(
          (action, index) => `<button type="button" class="action-item${action.danger ? ' danger' : ''}" data-action-index="${index}">
            <span class="action-icon">${icon(action.icon || 'more', 19)}</span>
            <span>${esc(action.label)}</span>
            ${icon('chevron-right', 16, 'action-chevron')}
          </button>`,
        )
        .join('')}
    </div>`,
    onMount: (sheet, close) => {
      sheet.querySelectorAll('[data-action-index]').forEach((button) => {
        button.addEventListener('click', () => {
          const action = actions[Number(button.dataset.actionIndex)];
          close();
          setTimeout(() => action?.onClick?.(), 80);
        });
      });
    },
  });
}

export function inputField({ label, name, value = '', type = 'text', placeholder = '', min, max, step, suffix = '', hint = '', autofocus = false, inputmode }) {
  return `<label class="field">
    <span class="field-label">${esc(label)}</span>
    <span class="input-wrap">
      <input class="input" type="${type}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}"
        ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''}
        ${step !== undefined ? `step="${step}"` : ''} ${autofocus ? 'autofocus' : ''}
        ${inputmode ? `inputmode="${inputmode}"` : ''} />
      ${suffix ? `<span class="input-suffix">${suffix}</span>` : ''}
    </span>
    ${hint ? `<span class="field-hint">${hint}</span>` : ''}
  </label>`;
}

export function dateLabel(iso) {
  return relativeDate(new Date(iso));
}

export function weekdayOf(date) {
  return WEEKDAYS[new Date(date).getDay()];
}

export function dayKey(date) {
  return toDateKey(date);
}
