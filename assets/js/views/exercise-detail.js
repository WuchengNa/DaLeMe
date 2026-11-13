/* 动作详情 · GIF 示范、中文动作要领、分类信息与历史数据 */
import { CATALOG_INFO, MUSCLES } from '../data.js';
import {
  deleteCustomExercise,
  exerciseHistory,
  getActiveWorkout,
  getExercise,
  getLastPerformance,
  getPersonalBests,
  getWorkout,
  saveState,
} from '../store.js';
import {
  bindMediaFallback, getExerciseSteps, mediaMarkup, primaryName, secondaryName,
} from '../exercise-utils.js';
import {
  confirmDialog,
  emptyState,
  icon,
  setChip,
  showToast,
} from '../ui.js';
import { lineChart } from '../charts.js';
import {
  esc,
  fmtDate,
  fmtVolume,
  parseRepsRange,
  relativeDate,
  uid,
} from '../utils.js';
import { openExerciseForm } from './exercises.js';

export default function exerciseDetailView(ctx) {
  const exercise = getExercise(ctx.id);
  if (!exercise) {
    return {
      html: `<div>${emptyState({
        iconName: 'dumbbell',
        title: '找不到这个动作',
        text: '它可能已经被删除。',
        action: '<a class="btn btn-primary" href="#/exercises">返回动作库</a>',
      })}</div>`,
    };
  }

  const best = getPersonalBests()[exercise.id];
  const history = exerciseHistory(exercise.id);
  const recent = [...history].reverse().slice(0, 8);
  const hasWeight = history.some((point) => point.weight > 0);
  const active = getActiveWorkout();
  const muscle = MUSCLES[exercise.muscle] || { name: exercise.muscle, color: 'var(--accent)', soft: 'rgba(255,255,255,.08)' };
  const chartPoints = history.slice(-12).map((point) => ({
    label: `${new Date(point.date).getMonth() + 1}/${new Date(point.date).getDate()}`,
    value: hasWeight ? point.e1rm : point.reps,
    tooltip: `${fmtDate(point.date, false)} · ${hasWeight ? `估算 1RM ${point.e1rm}kg` : `${point.reps} 次`}`,
  }));

  const bestValue = best
    ? hasWeight
      ? `${best.bestWeight}<small>kg</small>`
      : `${best.bestReps}<small>次</small>`
    : '—';
  const bestLabel = best ? (hasWeight ? `× ${best.bestWeightReps} 次` : '单组最多次数') : '还没有记录';
  const english = secondaryName(exercise);

  const metaRows = [
    ['训练部位', muscle.name],
    ['器械', exercise.equipment],
    ['目标肌群', exercise.target],
    ['主要肌群', exercise.muscleGroup],
    ['协同肌群', (exercise.secondary || []).join('、')],
    ['建议次数', exercise.reps],
  ].filter(([, value]) => Boolean(value));

  const html = `<div>
    <div style="margin-bottom:14px"><a class="section-link" href="#/exercises">${icon('arrow-left', 15)} 动作库</a></div>

    <section class="exercise-detail-hero ex-detail-hero">
      ${mediaMarkup(exercise, { className: 'ex-detail-media' })}
      <div class="ex-detail-info" style="min-width:0;flex:1">
        <div class="ex-tags">
          <span class="muscle-badge" style="--muscle:${muscle.color};--muscle-soft:${muscle.soft}"><i></i>${esc(muscle.name)}</span>
          <span class="tag">${esc(exercise.equipment || '')}</span>
          ${exercise.custom ? '<span class="tag lime">自定义</span>' : ''}
        </div>
        <h1>${esc(primaryName(exercise))}</h1>
        ${english ? `<p class="ex-detail-en">${esc(english)}</p>` : ''}
        <div class="ex-detail-meta">
          ${metaRows.map(([label, value]) => `<span><em>${esc(label)}</em>${esc(value)}</span>`).join('')}
        </div>
        <div class="ex-detail-actions">
          ${active ? `<button type="button" class="btn btn-primary btn-sm" data-add-to-workout>${icon('plus', 14)} 加入当前训练</button>` : ''}
          ${exercise.custom ? `<button type="button" class="icon-btn" data-edit-ex aria-label="编辑">${icon('edit', 18)}</button><button type="button" class="icon-btn" data-delete-ex aria-label="删除">${icon('trash', 18)}</button>` : ''}
        </div>
      </div>
    </section>

    <section class="card ex-steps-card">
      <div class="ex-steps-head">
        <div><h3>动作要领</h3><p>跟着示范 GIF 完成动作</p></div>
        <div class="seg ex-steps-lang hide" data-ex-lang>
          <button type="button" class="active" data-ex-lang-key="zh">中文</button>
          <button type="button" data-ex-lang-key="en">English</button>
        </div>
      </div>
      <div data-ex-steps class="ex-steps-body"><div class="ex-steps-loading">正在载入动作要领…</div></div>
      ${exercise.tip ? `<div class="detail-note"><h4>${icon('note', 13)} 动作要点</h4><p>${esc(exercise.tip)}</p></div>` : ''}
    </section>

    <div class="best-grid">
      <div class="best-card"><span>${hasWeight ? '最佳重量' : '最佳次数'}</span><strong>${bestValue}</strong><em>${bestLabel}</em></div>
      <div class="best-card"><span>估算 1RM</span><strong>${best?.bestE1rm ? `${best.bestE1rm}<small>kg</small>` : '—'}</strong><em>${best?.bestE1rmDate ? relativeDate(best.bestE1rmDate) : '基于最佳组估算'}</em></div>
      <div class="best-card"><span>训练记录</span><strong>${best?.sessions || 0}<small>次</small></strong><em>累计 ${best?.totalSets || 0} 组 · ${best ? fmtVolume(best.totalVolume) : '0 kg'}</em></div>
    </div>

    <section class="card chart-card">
      <div class="chart-head">
        <div><h3>${hasWeight ? '力量趋势' : '次数趋势'}</h3><p>${hasWeight ? '每次训练最佳组的估算 1RM' : '每次训练单组最多次数'}</p></div>
        <span class="tag">最近 ${Math.min(12, history.length)} 次</span>
      </div>
      ${
        chartPoints.length >= 2
          ? lineChart(chartPoints, {
              height: 215,
              color: muscle.color,
              valueFormat: (v) => String(v),
              unit: hasWeight ? 'kg' : '次',
            })
          : `<div class="chart-empty">再完成一次训练，就能生成趋势图</div>`
      }
    </section>

    <div class="section-head"><div><h2>最近记录</h2><p>${history.length} 次训练中包含这个动作</p></div></div>
    ${
      recent.length
        ? `<section class="card pad" style="padding-top:6px;padding-bottom:6px">
            <div class="exercise-hist">
              ${recent
                .map(
                  (point) => {
                    const workout = historyWorkout(point.workoutId);
                    const sets = workout?.exercises.find((e) => e.exerciseId === exercise.id)?.sets.filter((s) => s.done) || [];
                    return `<a class="exercise-hist-row" href="#/history/${point.workoutId}">
                      <span class="date">${new Date(point.date).getMonth() + 1}/${new Date(point.date).getDate()}</span>
                      <span class="sets">${sets.slice(0, 4).map((set, index) => setChip(set, index)).join('')}${sets.length > 4 ? `<span class="set-chip">+${sets.length - 4}</span>` : ''}</span>
                      <span class="vol">${point.volume > 0 ? fmtVolume(point.volume) : `${point.reps} 次`}</span>
                    </a>`;
                  },
                )
                .join('')}
            </div>
          </section>`
        : `<div class="card">${emptyState({
            iconName: 'activity',
            title: '还没有训练数据',
            text: '把这个动作加入计划，开始记录第一组。',
            action: '<a class="btn btn-primary" href="#/plans">去训练计划</a>',
          })}</div>`
    }

    <div class="library-credit">
      动作资料来自 <a href="${esc(CATALOG_INFO.sourceUrl)}" target="_blank" rel="noopener noreferrer">exercises-dataset</a>
      · 动作 GIF <a href="https://gymvisual.com/" target="_blank" rel="noopener noreferrer">© Gym visual</a>
    </div>
  </div>`;

  function addToWorkout() {
    if (!active) {
      showToast('先从计划开始一场训练', 'info');
      return;
    }
    if (active.exercises.some((e) => e.exerciseId === exercise.id)) {
      showToast('当前训练中已经有这个动作', 'info');
      ctx.navigate('/workout');
      return;
    }
    const last = getLastPerformance(exercise.id);
    const lastWorking = (last?.sets || []).filter((s) => s.type !== 'warmup');
    const [, hi] = parseRepsRange(exercise.reps);
    active.exercises.push({
      exerciseId: exercise.id,
      name: primaryName(exercise),
      muscle: exercise.muscle,
      equipment: exercise.equipment,
      rest: 90,
      note: '',
      targetSets: 3,
      targetReps: exercise.reps,
      sets: Array.from({ length: 3 }, (_, index) => {
        const previous = lastWorking[index] || lastWorking[lastWorking.length - 1];
        return {
          id: uid('set'),
          weight: previous && Number(previous.weight) > 0 ? String(previous.weight) : '',
          reps: previous?.reps ? String(previous.reps) : String(hi || 10),
          rpe: '',
          done: false,
          type: 'normal',
        };
      }),
    });
    saveState();
    showToast('已加入当前训练');
    ctx.navigate('/workout');
  }

  return {
    html,
    mount(root) {
      root.querySelector('[data-add-to-workout]')?.addEventListener('click', addToWorkout);
      root.querySelector('[data-edit-ex]')?.addEventListener('click', () => {
        openExerciseForm(exercise, ctx);
      });
      root.querySelector('[data-delete-ex]')?.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
          title: '删除这个动作？',
          message: `「${esc(primaryName(exercise))}」会从动作库和所有计划中移除，历史训练记录不受影响。`,
          confirmText: '删除动作',
          danger: true,
          iconName: 'trash',
        });
        if (!confirmed) return;
        deleteCustomExercise(exercise.id);
        showToast('动作已删除');
        ctx.navigate('/exercises');
      });

      const stepsBox = root.querySelector('[data-ex-steps]');
      const langBar = root.querySelector('[data-ex-lang]');
      let steps = null;
      let lang = 'zh';

      const paintSteps = () => {
        if (!steps) return;
        const list = steps[lang]?.length ? steps[lang] : steps.zh || [];
        stepsBox.innerHTML = list.length
          ? `<ol class="ex-steps-list">${list.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>`
          : `<p class="muted">这个动作暂时没有文字说明，请参考上方示范动图。</p>`;
      };

      if (exercise.custom) {
        stepsBox.innerHTML = `<p class="muted">自定义动作没有示范动图，可在「动作要点」里记录自己的提示。</p>`;
      } else {
        getExerciseSteps(exercise.id).then((data) => {
          if (!data) {
            stepsBox.innerHTML = `<p class="muted">动作要领加载失败，请稍后重试。</p>`;
            return;
          }
          steps = data;
          if (data.en?.length) langBar.classList.remove('hide');
          paintSteps();
        });
      }
      langBar.querySelectorAll('[data-ex-lang-key]').forEach((button) => {
        button.addEventListener('click', () => {
          lang = button.dataset.exLangKey;
          langBar.querySelectorAll('[data-ex-lang-key]').forEach((b) => b.classList.toggle('active', b === button));
          paintSteps();
        });
      });
      bindMediaFallback(root);
    },
  };
}

/* 通过全局状态拿训练详情，避免额外查询层 */
function historyWorkout(id) {
  return getWorkout(id);
}
