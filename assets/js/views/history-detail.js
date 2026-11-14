/* 训练详情 */
import {
  deleteWorkout,
  getActiveWorkout,
  getPlan,
  getWorkout,
  getWorkoutPRs,
  startWorkout,
  workoutStats,
} from '../store.js';
import { openWorkoutShare } from '../share.js';
import { openPublishSheet } from '../social.js';
import {
  actionSheet,
  confirmDialog,
  emptyState,
  exerciseGlyph,
  icon,
  setChip,
  showToast,
} from '../ui.js';
import {
  copyText,
  esc,
  fmtDate,
  fmtDuration,
  fmtVolume,
  fmtWeight,
  WEEKDAYS,
} from '../utils.js';
import { feelInfo } from '../data.js';

export default function historyDetailView(ctx) {
  const workout = getWorkout(ctx.id);
  if (!workout) {
    return {
      html: `<div>${emptyState({
        iconName: 'history',
        title: '找不到这次训练',
        text: '记录可能已经被删除。',
        action: '<a class="btn btn-primary" href="#/history">返回训练记录</a>',
      })}</div>`,
    };
  }

  const stats = workoutStats(workout);
  const volume = Number(workout.totalVolume) || stats.volume;
  const sets = Number(workout.totalSets) || stats.sets;
  const prs = getWorkoutPRs(workout);
  const date = new Date(workout.startedAt);
  const dateText = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
  const doneExercises = (workout.exercises || []).filter((exercise) =>
    (exercise.sets || []).some((set) => set.done),
  );
  const hasLoad = doneExercises.some((exercise) =>
    (exercise.sets || []).some((set) => set.done && Number(set.weight) > 0),
  );

  const prHtml = prs.length
    ? `<div class="pr-list" style="margin:0 0 16px">
        ${prs
          .slice(0, 3)
          .map(
            (pr) => `<div class="pr-item">${icon('trophy', 14)}<span>${esc(pr.name)}</span><b>${pr.isFirst ? '首次记录' : 'PR'}</b><span>${Number(pr.weight) > 0 ? `${pr.weight}kg × ${pr.reps}` : `${pr.reps} 次`}</span></div>`,
          )
          .join('')}
      </div>`
    : '';

  const exercisesHtml = doneExercises
    .map((exercise) => {      const doneSets = exercise.sets.filter((set) => set.done);
      const exVolume = doneSets
        .filter((s) => s.type !== 'warmup')
        .reduce((acc, s) => acc + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
      const best = doneSets.reduce(
        (acc, s) => Math.max(acc, Number(s.weight) || 0),
        0,
      );
      const feel = feelInfo(exercise.feel);
      return `<section class="card detail-exercise">
        <div class="detail-exercise-head">
          ${exerciseGlyph(exercise.muscle, 'sm')}
          <div>
            <h3>${esc(exercise.name)}</h3>
            <p>${doneSets.length} 组${best > 0 ? ` · 最重 ${fmtWeight(best)}` : ''}</p>
          </div>
          <div class="ex-volume">${exVolume > 0 ? fmtVolume(exVolume) : `${doneSets.reduce((a, s) => a + Number(s.reps || 0), 0)} 次`}<span>${exVolume > 0 ? '动作容量' : '动作次数'}</span></div>
        </div>
        <div class="set-chip-list">
          ${doneSets.map((set, index) => setChip(set, index)).join('')}
        </div>
        ${feel || exercise.feelNote
          ? `<div class="detail-feel">
              <span class="feel-caption">${icon('heart', 13)} 动作感受</span>
              ${feel ? `<span class="feel-tag" style="--feel:${feel.color};--feel-soft:${feel.soft}"><i></i>${feel.label}</span>` : ''}
              ${exercise.feelNote ? `<span class="feel-quote">${esc(exercise.feelNote)}</span>` : ''}
            </div>`
          : ''}
        ${exercise.note ? `<div class="exercise-note" style="margin:10px 0 0">${icon('note', 13)}<span>${esc(exercise.note)}</span></div>` : ''}
      </section>`;
    })
    .join('');

  const html = `<div>
    <div style="margin-bottom:14px"><a class="section-link" href="#/history">${icon('arrow-left', 15)} 训练记录</a></div>

    <section class="history-detail-head">
      <div style="min-width:0">
        <div class="history-date">${icon('clock', 13)} ${dateText}</div>
        <h1>${esc(workout.dayName)}</h1>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span class="tag">${esc(workout.planName)}</span>
          ${prs.length ? '<span class="tag orange">' + icon('trophy', 11) + ' 产生新记录</span>' : ''}
        </div>
        <div class="detail-stats" style="margin:18px 0 0">
          <div class="detail-stat"><span>训练时长</span><strong>${Math.round((Number(workout.durationSec) || 0) / 60)}<small>分钟</small></strong></div>
          <div class="detail-stat"><span>训练容量</span><strong>${hasLoad ? `${volume >= 10000 ? (volume / 1000).toFixed(1) : Math.round(volume).toLocaleString('zh-CN')}<small>${volume >= 10000 ? '吨' : 'kg'}</small>` : '自重'}</strong></div>
          <div class="detail-stat"><span>完成组数</span><strong>${sets}<small>组</small></strong></div>
          <div class="detail-stat"><span>总次数</span><strong>${stats.reps}<small>次</small></strong></div>
        </div>
      </div>
      <div class="detail-head-actions">
        <button type="button" class="icon-btn" data-share aria-label="生成分享长图" title="生成分享长图">${icon('share', 19)}</button>
        <button type="button" class="icon-btn" data-detail-menu aria-label="更多">${icon('more', 20)}</button>
      </div>
    </section>

    ${prHtml}

    <div class="section-head" style="margin-top:4px"><div><h2>动作明细</h2><p>${doneExercises.length} 个动作 · ${sets} 组</p></div></div>
    ${exercisesHtml || `<div class="card">${emptyState({ iconName: 'dumbbell', title: '没有完成的组', text: '这次训练没有留下可统计的内容。' })}</div>`}

    ${workout.notes ? `<div class="detail-note"><h4>${icon('note', 13)} 训练感受</h4><p>${esc(workout.notes)}</p></div>` : ''}

    <div class="detail-actions">
      <button type="button" class="btn btn-primary" data-repeat>${icon('rotate', 16)} 再做一次</button>
      <button type="button" class="btn btn-ghost" data-share-card>${icon('share', 16)} 分享长图</button>
      <button type="button" class="btn btn-ghost" data-share-square>${icon('square', 16)} 分享到广场</button>
      <button type="button" class="btn btn-ghost" data-delete-workout>${icon('trash', 16)} 删除记录</button>
    </div>
  </div>`;

  function copySummary() {
    const lines = [
      `${workout.dayName} · ${workout.planName}`,
      `${dateText} · ${fmtDuration(workout.durationSec)}`,
      `容量 ${fmtVolume(volume)} · ${sets} 组 · ${stats.reps} 次`,
      '',
      ...doneExercises.map((exercise) => {
        const doneSets = exercise.sets.filter((set) => set.done);
        const feel = feelInfo(exercise.feel);
        return `${exercise.name}：${doneSets
          .map((set) => (Number(set.weight) > 0 ? `${set.weight}kg×${set.reps}` : `${set.reps}次`))
          .join(' / ')}${feel ? `（感受：${feel.label}）` : ''}`;
      }),
    ];
    copyText(lines.join('\n'))
      .then(() => showToast('训练摘要已复制'))
      .catch(() => showToast('复制失败，请手动选择', 'error'));
  }

  async function repeat() {
    const plan = getPlan(workout.planId);
    const day = plan?.days.find((d) => d.id === workout.dayId);
    if (!plan || !day) {
      showToast('原计划已删除，无法直接重复', 'error');
      return;
    }
    const active = getActiveWorkout();
    if (active) {
      actionSheet('训练进行中', [
        { label: '继续当前训练', icon: 'play', onClick: () => ctx.navigate('/workout') },
        {
          label: '放弃并重做这次训练',
          icon: 'rotate',
          danger: true,
          onClick: () => {
            startWorkout(plan, day);
            ctx.navigate('/workout');
          },
        },
      ], `当前：${active.dayName}`);
      return;
    }
    startWorkout(plan, day);
    showToast('已按上次的记录预填重量');
    ctx.navigate('/workout');
  }

  async function remove() {
    const confirmed = await confirmDialog({
      title: '删除这次训练？',
      message: `「${esc(workout.dayName)}」的所有组数与重量记录将被永久删除。`,
      confirmText: '删除记录',
      danger: true,
      iconName: 'trash',
    });
    if (!confirmed) return;
    deleteWorkout(workout.id);
    showToast('训练记录已删除');
    ctx.navigate('/history');
  }

  return {
    html,
    mount(root) {
      if (ctx.query?.get('saved') === '1') {
        setTimeout(() => showToast('训练已保存，继续保持'), 250);
      }
      root.querySelector('[data-repeat]')?.addEventListener('click', repeat);
      root.querySelector('[data-delete-workout]')?.addEventListener('click', remove);
      const share = () => openWorkoutShare(workout);
      const shareSquare = () =>
        openPublishSheet({
          workoutId: workout.id,
          onPublished: (post) => ctx.navigate(`/square/p/${post.id}`),
        });
      root.querySelector('[data-share]')?.addEventListener('click', share);
      root.querySelector('[data-share-card]')?.addEventListener('click', share);
      root.querySelector('[data-share-square]')?.addEventListener('click', shareSquare);
      root.querySelector('[data-detail-menu]')?.addEventListener('click', () => {
        actionSheet('训练记录', [
          { label: '分享到大大广场', icon: 'square', onClick: shareSquare },
          { label: '生成分享长图', icon: 'share', onClick: share },
          { label: '复制训练摘要', icon: 'copy', onClick: copySummary },
          { label: '再做一次', icon: 'rotate', onClick: repeat },
          { label: '删除这条记录', icon: 'trash', danger: true, onClick: remove },
        ], `${workout.dayName} · ${fmtDate(date, false)}`);
      });
      if (ctx.query?.get('share') === '1') {
        setTimeout(share, 320);
      }
    },
  };
}
