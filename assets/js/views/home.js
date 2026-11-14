/* 今日首页 */
import {
  activeElapsedSeconds,
  bodyWeightSeries,
  getActivePlan,
  getActiveWorkout,
  getExercise,
  getState,
  getWorkouts,
  latestBodyWeight,
  nextWorkoutSuggestion,
  startWorkout,
  trainingStreakDays,
  weekStreak,
  weeklySummary,
} from '../store.js';
import { icon, ringProgress, workoutRow, emptyState } from '../ui.js';
import { sparkline } from '../charts.js';
import {
  addDays,
  esc,
  fmtDate,
  fmtDuration,
  fmtVolume,
  greeting,
  startOfWeek,
  toDateKey,
  WEEKDAYS_SHORT,
} from '../utils.js';
import { MUSCLES } from '../data.js';
import { primaryName } from '../exercise-utils.js';

const TIPS = [
  '训练前花 5 分钟做动态热身，能显著提升动作质量。',
  '每组之间记录真实重量与次数，比“感觉练到了”更可靠。',
  '复合动作优先安排在精力最好的前半段。',
  '睡眠不足时，主动降低 5–10% 的训练容量。',
  '渐进超负荷不必每周加重量，加次数或加组同样有效。',
  '离心阶段控制 2 秒，肌肉张力时间更充分。',
  '训练后 1–2 小时补充蛋白质，全天总量比时机更重要。',
  '疼痛不是荣誉勋章。关节刺痛时，立刻调整动作幅度。',
];

export default function homeView(ctx) {
  const state = getState();
  const summary = weeklySummary();
  const goal = Math.max(1, Number(state.settings.weeklyGoal) || 1);
  const pct = Math.min(1, summary.count / goal);
  const suggestion = nextWorkoutSuggestion();
  const active = getActiveWorkout();
  const workouts = getWorkouts();
  const recent = workouts.slice(0, 4);
  const streak = weekStreak();
  const dayStreak = trainingStreakDays();
  const latest = latestBodyWeight();
  const bwSeries = bodyWeightSeries().slice(-8);
  const bwDelta = bwSeries.length > 1 ? bwSeries[bwSeries.length - 1].weight - bwSeries[0].weight : 0;
  const monday = startOfWeek();
  const trainedDays = new Set(workouts.map((w) => toDateKey(w.startedAt)));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    const key = toDateKey(date);
    return { date, key, done: trainedDays.has(key), today: key === toDateKey(new Date()) };
  });
  const tip = TIPS[new Date().getDate() % TIPS.length];
  const activePlan = suggestion?.plan || getActivePlan();

  const PLAN_COLOR_HEX = {
    lime: '#ff9b3f',
    orange: '#e0563b',
    blue: '#6fb7ff',
    violet: '#c39bff',
  };
  const PLAN_SOFT_HEX = {
    lime: 'rgba(255,155,63,.1)',
    orange: 'rgba(224,86,59,.1)',
    blue: 'rgba(111,183,255,.1)',
    violet: 'rgba(195,155,255,.1)',
  };
  const planColor = PLAN_COLOR_HEX[activePlan?.color] || PLAN_COLOR_HEX.lime;
  const planSoft = PLAN_SOFT_HEX[activePlan?.color] || PLAN_SOFT_HEX.lime;
  const volumeValue = fmtVolume(summary.volume).replace(' kg', '').replace(' t', '');
  const volumeUnit = fmtVolume(summary.volume).includes(' t') ? '吨' : 'kg';

  const resumeHtml = active
    ? `<a class="resume-banner${active.pausedAt ? ' paused' : ''}" href="#/workout">
        <span class="resume-pulse">${icon(active.pausedAt ? 'pause' : 'play', 17)}</span>
        <span class="resume-text">
          <strong>${active.pausedAt ? '训练已暂停' : '训练进行中'} · ${esc(active.dayName)}</strong>
          <span>${active.pausedAt ? '计时已经冻结，随时回来继续' : `已训练 ${fmtDuration(activeElapsedSeconds(active), true)} · 点击继续记录`}</span>
        </span>
        <span class="btn btn-primary btn-sm">${active.pausedAt ? '恢复' : '继续'} ${icon('arrow-right', 14)}</span>
      </a>`
    : '';

  const hero = `<section class="hero">
    <div class="hero-grid">
      <div>
        <span class="hero-kicker">THIS WEEK · 第 ${getWeekNumber()} 周</span>
        <div class="hero-main">
          <span class="big">${summary.count}</span>
          <span class="slash">/</span>
          <span class="goal">${goal}</span>
          <span class="hero-title" style="margin-left:8px">次训练</span>
        </div>
        <p class="hero-sub">${
          summary.count >= goal
            ? `目标达成！本周已练 ${summary.trainedDays} 天，保持节奏。`
            : `再完成 ${goal - summary.count} 次，达成本周目标 · 已练 ${summary.trainedDays} 天`
        }</p>
        <div class="hero-progress" aria-hidden="true">
          ${Array.from({ length: 7 }, (_, i) => `<i class="${i < summary.count ? 'on' : ''}"></i>`).join('')}
        </div>
        <div class="hero-actions">
          ${
            active
              ? `<a class="btn btn-primary" href="#/workout">${icon('play', 16)} ${active.pausedAt ? '恢复训练' : '继续训练'}</a>`
              : `<button type="button" class="btn btn-primary" data-start-suggested>
                  ${icon('zap', 16)} ${suggestion ? `开始 · ${esc(suggestion.day.short || suggestion.day.name.split(' · ')[0])}` : activePlan ? '完善训练计划' : '创建训练计划'}
                </button>`
          }
          <a class="btn btn-ghost" href="${suggestion ? `#/plans/${suggestion.plan.id}` : '#/plans'}">
            ${icon('plans', 16)} 查看计划
          </a>
          ${
            activePlan
              ? `<span class="hero-note">当前计划 · <b>${esc(activePlan.name)}</b></span>`
              : ''
          }
        </div>
      </div>
      <div class="hero-side">
        ${ringProgress({
          value: pct,
          size: 118,
          stroke: 9,
          color: 'var(--accent)',
          label: `${Math.round(pct * 100)}%`,
          sub: '目标完成度',
        })}
        <span class="hero-side-label">${
          summary.count >= goal ? '本周目标已完成' : `还差 ${goal - summary.count} 次`
        }<br/>连续 ${streak} 周达标</span>
      </div>
    </div>
  </section>`;

  const miniStats = `<div class="mini-stats">
    <div class="mini-stat"><span>训练时长</span><strong>${Math.round(summary.duration / 60)}<small>分钟</small></strong></div>
    <div class="mini-stat"><span>训练容量</span><strong>${volumeValue}<small>${volumeUnit}</small></strong></div>
    <div class="mini-stat"><span>完成组数</span><strong>${summary.sets}<small>组</small></strong></div>
    <div class="mini-stat"><span>训练天数</span><strong>${summary.trainedDays}<small>天</small></strong></div>
  </div>`;

  const todayCard = suggestion
    ? `<section class="card today-card" style="--plan-color:${planColor};--plan-soft:${planSoft}">
        <div class="today-top">
          <span class="today-label">今日建议 · DAY ${suggestion.dayIndex + 1}</span>
          <span class="tag">${esc(suggestion.plan.name)}</span>
        </div>
        <h2>${esc(suggestion.day.name)}</h2>
        <p class="today-sub">${suggestion.day.exercises.length} 个动作 · 约 ${estimatedMinutes(suggestion.day)} 分钟 · 根据上次记录已预填重量</p>
        <div class="today-exercises">
          ${suggestion.day.exercises
            .slice(0, 5)
            .map((entry) => {
              const def = getExercise(entry.exerciseId);
              const info = MUSCLES[def?.muscle] || {};
              return `<span class="today-ex" style="--muscle:${info.color || 'var(--muted)'}"><i></i>${esc(primaryName(def) || entry.exerciseId)}</span>`;
            })
            .join('')}
          ${suggestion.day.exercises.length > 5 ? `<span class="today-ex">+${suggestion.day.exercises.length - 5}</span>` : ''}
        </div>
        <div class="today-actions">
          <button type="button" class="btn btn-primary" data-start-suggested>${icon('play', 15)} 开始这次训练</button>
          <a class="btn btn-ghost" href="#/plans/${suggestion.plan.id}">调整</a>
          <span class="today-meta">${suggestion.day.exercises.reduce((acc, e) => acc + Number(e.sets || 0), 0)} 组 · ${suggestion.day.exercises.length} 动作</span>
        </div>
      </section>`
    : `<section class="card today-card">
        ${emptyState({
          iconName: activePlan ? 'edit' : 'plans',
          title: activePlan ? '计划还没有动作' : '还没有训练计划',
          text: activePlan
            ? '把想练的动作和组次安排进去，就可以开始记录了。'
            : '创建一个计划，把想练的动作和组次安排进去。',
          action: activePlan
            ? `<a class="btn btn-primary" href="#/plans/${activePlan.id}/edit">完善计划</a>`
            : '<a class="btn btn-primary" href="#/plans">创建计划</a>',
        })}
      </section>`;

  const weekCard = `<section class="card week-card">
    <div class="week-head">
      <div><h3>本周安排</h3><p>${fmtDate(monday, false)} – ${fmtDate(addDays(monday, 6), false)}</p></div>
      <span class="week-badge">${summary.count}/${goal}</span>
    </div>
    <div class="week-strip">
      ${weekDays
        .map(
          (day) => `<div class="week-day${day.done ? ' done' : ''}${day.today ? ' today' : ''}">
            <span class="dow">${WEEKDAYS_SHORT[day.date.getDay()]}</span>
            <span class="date">${day.date.getDate()}</span>
            <span class="mark"></span>
          </div>`,
        )
        .join('')}
    </div>
    <div class="week-summary">
      <span>本周 <b>${summary.count}</b> 练 · <b>${fmtVolume(summary.volume)}</b></span>
      <a class="section-link" href="#/stats">数据 ${icon('chevron-right', 13)}</a>
    </div>
  </section>`;

  const bodyCard = latest
    ? `<section class="card body-card">
        <div class="body-top">
          <div><h3>身体数据</h3><span class="body-trend ${bwDelta <= 0 ? 'down' : ''}">${bwDelta === 0 ? '保持稳定' : `${bwDelta > 0 ? '+' : ''}${bwDelta.toFixed(1)} kg / 近 ${bwSeries.length} 次`}</span></div>
          <a class="icon-btn sm" href="#/profile" aria-label="记录体重">${icon('plus', 16)}</a>
        </div>
        <div class="body-weight">${latest.weight.toFixed(1)}<small>kg</small></div>
        ${sparkline(bwSeries.map((r) => r.weight), { color: 'var(--blue)' })}
        <div class="week-summary" style="margin-top:4px;padding-top:8px">
          <span>体脂 <b>${latest.bodyFat ? `${latest.bodyFat}%` : '—'}</b></span>
          <span>${latest.date === toDateKey(new Date()) ? '今天' : latest.date.slice(5).replace('-', '/')} 更新</span>
        </div>
      </section>`
    : `<section class="card body-card">
        <div class="body-top"><h3>身体数据</h3><a class="icon-btn sm" href="#/profile">${icon('plus', 16)}</a></div>
        <a class="btn btn-ghost btn-sm" href="#/profile" style="margin-top:8px">去记录</a>
      </section>`;

  const tipCard = `<aside class="tip-card">
    <span class="tip-icon">${icon('zap', 17)}</span>
    <div><h4>训练小贴士</h4><p>${esc(tip)}</p></div>
  </aside>`;

  const recentHtml = recent.length
    ? `<section class="card pad" style="padding-top:9px;padding-bottom:9px">
        <div class="recent-list">${recent.map(workoutRow).join('')}</div>
      </section>`
    : `<section class="card">${emptyState({
        iconName: 'history',
        title: '还没有训练记录',
        text: '完成第一次训练后，这里会留下你的每一次进步。',
        action: '<a class="btn btn-primary" href="#/plans">从计划开始</a>',
      })}</section>`;

  const html = `<div class="home">
    <header class="home-head">
      <div class="home-greeting">
        <h1>${greeting()}，${esc(state.settings.userName || '训练者')}<em>。</em></h1>
        <p>${fmtDate(new Date())} · ${
          active?.pausedAt
            ? '有一场训练暂停中，随时可以继续'
            : active
            ? '有一场训练还没结束'
            : summary.count >= goal
              ? '本周目标已达成，可以安排恢复'
              : dayStreak > 0
                ? `已经连续 ${dayStreak} 天训练，记得留出恢复日`
                : '把今天该做的，做掉。'
        }</p>
      </div>
      <div class="streak-pill" title="连续达到周训练目标的周数">
        <span class="flame-box">${icon('flame', 18)}</span>
        <div><b>${streak}</b><span>周连续达标</span></div>
      </div>
    </header>

    ${resumeHtml}
    ${hero}
    ${miniStats}

    <div class="home-grid">
      <div class="home-col">
        ${todayCard}
        <div class="section-head">
          <div><h2>最近训练</h2><p>回看每一次完成的动作</p></div>
          <a class="section-link" href="#/history">全部记录 ${icon('chevron-right', 13)}</a>
        </div>
        ${recentHtml}
      </div>
      <div class="home-col side">
        ${weekCard}
        ${bodyCard}
        ${tipCard}
      </div>
    </div>
  </div>`;

  function startFromCard() {
    if (active) {
      ctx.navigate('/workout');
      return;
    }
    if (!suggestion) {
      if (activePlan) ctx.navigate(`/plans/${activePlan.id}/edit`);
      else ctx.navigate('/plans');
      return;
    }
    startWorkout(suggestion.plan, suggestion.day);
    ctx.navigate('/workout');
  }

  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-start-suggested]').forEach((button) => {
        button.addEventListener('click', startFromCard);
      });
    },
  };
}

/* 本地辅助 */
function estimatedMinutes(day) {
  const seconds = day.exercises.reduce(
    (acc, entry) => acc + (Number(entry.sets) || 3) * (45 + (Number(entry.rest) || 90)),
    0,
  );
  return Math.max(10, Math.round(seconds / 60));
}

function getWeekNumber() {
  const date = new Date();
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date - start) / 86400000 + start.getDay() + 1) / 7);
}
