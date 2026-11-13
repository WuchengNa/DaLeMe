/* 大了么 · 训练记录分享：生成长图 → 保存到本地 / 分享到微信 / 复制图片 */
import { MUSCLES } from './data.js';
import { renderWorkoutPoster } from './poster.js';
import { getWorkoutPRs, workoutStats } from './store.js';
import { icon, openSheet, showToast } from './ui.js';
import {
  copyText,
  esc,
  fmtDuration,
  fmtVolume,
  fmtWeight,
  pad,
  toDateKey,
  WEEKDAYS,
} from './utils.js';

const UA = navigator.userAgent || '';
const IN_WECHAT = /MicroMessenger/i.test(UA);
const IN_IOS = /iPhone|iPad|iPod/i.test(UA);

function setLabel(weight, reps, warmup) {
  const base = Number(weight) > 0 ? `${weight}kg × ${reps}` : `${reps} 次`;
  return warmup ? `热身 ${base}` : base;
}

function normalizeWorkout(workout) {
  const stats = workoutStats(workout);
  const volume = Number(workout.totalVolume) || stats.volume;
  const sets = Number(workout.totalSets) || stats.sets;
  const date = new Date(workout.startedAt);
  const doneExercises = (workout.exercises || []).filter((exercise) =>
    (exercise.sets || []).some((set) => set.done),
  );
  const hasLoad = doneExercises.some((exercise) =>
    (exercise.sets || []).some((set) => set.done && Number(set.weight) > 0),
  );

  const exercises = doneExercises.map((exercise) => {
    const doneSets = (exercise.sets || []).filter((set) => set.done);
    const exVolume = doneSets
      .filter((set) => set.type !== 'warmup')
      .reduce((acc, set) => acc + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
    const best = doneSets.reduce((acc, set) => Math.max(acc, Number(set.weight) || 0), 0);
    const muscle = MUSCLES[exercise.muscle] || MUSCLES.chest;
    return {
      name: exercise.name,
      color: muscle.color,
      soft: muscle.soft,
      note: exercise.note || '',
      summary: exVolume > 0
        ? fmtVolume(exVolume)
        : `${doneSets.reduce((acc, set) => acc + (Number(set.reps) || 0), 0)} 次`,
      summaryLabel: exVolume > 0 ? '动作容量' : '动作次数',
      meta: `${doneSets.length} 组${best > 0 ? ` · 最重 ${fmtWeight(best)}` : ''}`,
      sets: doneSets.map((set) => ({
        label: setLabel(set.weight, set.reps, set.type === 'warmup'),
        warmup: set.type === 'warmup',
      })),
    };
  });

  const volumeValue = hasLoad
    ? (volume >= 10000 ? (volume / 1000).toFixed(1) : Math.round(volume).toLocaleString('zh-CN'))
    : '自重';
  const volumeUnit = hasLoad ? (volume >= 10000 ? '吨' : 'kg') : '';

  return {
    dayName: workout.dayName || '训练记录',
    planName: workout.planName || '训练记录',
    dateText: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`,
    shortDate: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    generatedAt: `生成于 ${toDateKey(new Date())}`,
    durationSec: Number(workout.durationSec) || 0,
    stats: [
      { value: String(Math.max(1, Math.round((Number(workout.durationSec) || 0) / 60))), unit: '分钟', label: '训练时长' },
      { value: volumeValue, unit: volumeUnit, label: '训练容量' },
      { value: String(sets), unit: '组', label: '完成组数' },
      { value: String(stats.reps), unit: '次', label: '总次数' },
    ],
    sets,
    prs: getWorkoutPRs(workout).slice(0, 4),
    exercises,
    notes: workout.notes || '',
  };
}

function buildShareText(data) {
  const lines = [
    `${data.dayName} · ${data.planName}`,
    `${data.dateText} · ${fmtDuration(data.durationSec || 0)}`,
    `容量 ${data.stats[1].value}${data.stats[1].unit} · ${data.sets} 组 · ${data.stats[3].value} 次`,
    '',
  ];
  for (const exercise of data.exercises) {
    lines.push(`${exercise.name}：${exercise.sets.map((set) => set.label).join(' / ')}`);
  }
  lines.push('', '每一次，都算数。 · 大了么');
  return lines.join('\n');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function canSystemShare(file) {
  try {
    return typeof navigator.share === 'function'
      && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * 打开训练记录分享弹层
 * @param {object} workout 已保存的训练记录
 */
export function openWorkoutShare(workout) {
  if (!workout) return;
  const data = normalizeWorkout(workout);
  const filename = `大了么-训练记录-${toDateKey(new Date(workout.startedAt))}.png`;
  const shareText = buildShareText(data);
  const hint = IN_WECHAT
    ? '微信内请长按上方图片 →「保存图片 / 发送给朋友」'
    : '长按图片可保存或发送给朋友';

  openSheet({
    title: '分享训练记录',
    subtitle: `${data.dayName} · ${data.shortDate}`,
    size: 'lg',
    className: 'share-sheet',
    body: `
      <div class="share-stage" data-share-stage>
        <div class="share-loading">${icon('spark', 22)}<span>正在生成长图…</span></div>
      </div>
      <p class="share-hint" data-share-hint>${icon('info', 14)}<span>${esc(hint)}</span></p>
    `,
    footer: `
      <div class="share-actions">
        <button type="button" class="btn btn-primary" data-share-wechat>${icon('wechat', 16)} 分享到微信</button>
        <button type="button" class="btn btn-ghost" data-share-save>${icon('download', 16)} 保存到本地</button>
        <button type="button" class="btn btn-ghost" data-share-copy>${icon('copy', 16)} 复制图片</button>
        <button type="button" class="btn btn-ghost" data-share-text>${icon('note', 16)} 复制文案</button>
      </div>`,
    onMount: (sheet) => {
      const stage = sheet.querySelector('[data-share-stage]');
      const hintEl = sheet.querySelector('[data-share-hint]');
      let poster = null;

      const requirePoster = () => {
        if (!poster) {
          showToast('长图还在生成中，请稍候', 'info');
          return false;
        }
        return true;
      };

      const highlightLongPress = (message) => {
        showToast(message, 'info');
        stage.classList.add('share-longpress');
        hintEl.innerHTML = `${icon('info', 14)}<span>长按上方图片 → 保存图片 / 发送给朋友</span>`;
      };

      renderWorkoutPoster(data)
        .then((result) => {
          poster = result;
          stage.innerHTML = `<img class="share-poster" src="${result.dataUrl}" alt="${esc(data.dayName)}训练记录长图" />`;
        })
        .catch((error) => {
          stage.innerHTML = `<div class="share-error">${icon('info', 22)}<span>${esc(error.message || '长图生成失败')}</span></div>`;
        });

      sheet.querySelector('[data-share-save]').addEventListener('click', () => {
        if (!requirePoster()) return;
        if (IN_WECHAT || IN_IOS) {
          highlightLongPress('微信 / iPhone 不支持直接下载，请长按图片保存');
          return;
        }
        triggerDownload(poster.blob, filename);
        showToast('长图已保存到下载目录');
      });

      sheet.querySelector('[data-share-wechat]').addEventListener('click', async () => {
        if (!requirePoster()) return;
        const file = new File([poster.blob], filename, { type: 'image/png' });
        if (canSystemShare(file)) {
          try {
            await navigator.share({ files: [file], title: `大了么 · ${data.dayName}`, text: shareText });
            showToast('已调起系统分享');
            return;
          } catch (error) {
            if (error?.name === 'AbortError') return;
          }
        }
        highlightLongPress(
          IN_WECHAT
            ? '请长按上方图片，选择「发送给朋友」'
            : '当前浏览器不支持直接分享，请长按或保存图片后发到微信',
        );
      });

      sheet.querySelector('[data-share-copy]').addEventListener('click', async () => {
        if (!requirePoster()) return;
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
          showToast('当前浏览器不支持复制图片，请长按保存', 'info');
          return;
        }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': poster.blob })]);
          showToast('图片已复制，可直接粘贴到微信');
        } catch {
          showToast('复制失败，请改用保存图片', 'error');
        }
      });

      sheet.querySelector('[data-share-text]').addEventListener('click', () => {
        copyText(shareText)
          .then(() => showToast('分享文案已复制'))
          .catch(() => showToast('复制失败，请手动选择', 'error'));
      });
    },
  });
}
