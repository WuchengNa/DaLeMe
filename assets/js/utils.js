/* 大了么 · 通用工具函数 */

export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export const WEEKDAYS_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

/* ---------------- 日期 ---------------- */

export function toDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = () => toDateKey(new Date());

export function parseKey(key) {
  if (!key) return new Date(NaN);
  const [y, m, d] = String(key).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** 周一为一周的第一天 */
export function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function endOfWeek(date = new Date()) {
  return addDays(startOfWeek(date), 6);
}

export function isSameDay(a, b) {
  return toDateKey(a) === toDateKey(b);
}

export function daysBetween(a, b) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86400000);
}

export function fmtDate(date, withWeekday = true) {
  const d = date instanceof Date ? date : parseKey(date);
  const base = `${d.getMonth() + 1}月${d.getDate()}日`;
  return withWeekday ? `${base} ${WEEKDAYS[d.getDay()]}` : base;
}

export function fmtDateShort(date) {
  const d = date instanceof Date ? date : parseKey(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtMonth(date) {
  const d = date instanceof Date ? date : parseKey(date);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function relativeDate(date) {
  const diff = daysBetween(date, new Date());
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  if (diff > 2 && diff < 7) return `${diff} 天前`;
  return fmtDate(date, false);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/* ---------------- 数字 / 时间 ---------------- */

export function sum(list, fn = (x) => x) {
  return list.reduce((acc, item, index) => acc + (Number(fn(item, index)) || 0), 0);
}

export function average(list) {
  return list.length ? sum(list) / list.length : 0;
}

export function roundTo(n, step = 2.5) {
  return Math.round(Number(n) / step) * step;
}

export function fmtNum(n, digits = 0) {
  const num = Number(n) || 0;
  return num.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function fmtWeight(w) {
  const n = Number(w) || 0;
  if (!n) return '自重';
  return `${Number.isInteger(n) ? n : n.toFixed(1)} kg`;
}

export function fmtVolume(kg) {
  const n = Number(kg) || 0;
  if (n >= 10000) return `${(n / 1000).toFixed(1)} t`;
  return `${fmtNum(Math.round(n))} kg`;
}

export function fmtDuration(seconds, compact = false) {
  const sec = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (compact) {
    if (h) return `${h}h${m ? ` ${m}m` : ''}`;
    return `${m}m`;
  }
  if (h) return `${h} 小时 ${m} 分`;
  if (m) return `${m} 分钟`;
  return `${sec} 秒`;
}

export function fmtClock(seconds) {
  const sec = Math.max(0, Math.round(Number(seconds) || 0));
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
}

export function parseRepsRange(reps) {
  const nums = String(reps ?? '')
    .match(/\d+/g)
    ?.map(Number);
  if (!nums?.length) return [8, 12];
  return [nums[0], nums[1] ?? nums[0]];
}

export function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

export function sortBy(list, fn, dir = 'asc') {
  return [...list].sort((a, b) => {
    const va = fn(a);
    const vb = fn(b);
    if (va === vb) return 0;
    return (va > vb ? 1 : -1) * (dir === 'desc' ? -1 : 1);
  });
}

export function groupBy(list, fn) {
  return list.reduce((acc, item) => {
    const key = fn(item);
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
}

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function downloadFile(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

export function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function initials(name = '') {
  const cleaned = String(name).trim();
  if (!cleaned) return '练';
  return cleaned.slice(0, 2).toUpperCase();
}
