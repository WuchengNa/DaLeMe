/* 数据分析 */
import {
  getPersonalBests,
  getWorkouts,
  muscleDistribution,
  volumeByWeek,
  workoutStats,
} from '../store.js';
import { MUSCLES } from '../data.js';
import { barChart } from '../charts.js';
import { emptyState, exerciseGlyph, icon, pageHead } from '../ui.js';
import {
  addDays,
  esc,
  fmtVolume,
  startOfWeek,
  sum,
  toDateKey,
  WEEKDAYS,
} from '../utils.js';

export default function statsView() {
  let period = 4;

  function paint() {
    const root = document.getElementById('stats-root');
    if (!root) return;
    const all = getWorkouts();
    const current = periodWorkouts(period);
    const previous = previousPeriodWorkouts(period);
    const stats = aggregate(current);
    const prevStats = aggregate(previous);
    const weeks = volumeByWeek(period);
    const maxWeekVolume = Math.max(...weeks.map((w) => w.volume), 0);
    const prs = Object.values(getPersonalBests())
      .filter((pr) => pr.bestE1rm > 0 || pr.bestReps > 0)
      .sort((a, b) => b.bestE1rm - a.bestE1rm)
      .slice(0, 8);

    root.innerHTML = `
      <div class="stats-summary">
        ${summaryCard('训练次数', stats.count, '次', deltaText(stats.count, prevStats.count, '次'))}
        ${summaryCard('训练容量', formatBigNumber(stats.volume), stats.volume >= 10000 ? '吨' : 'kg', deltaText(stats.volume, prevStats.volume, '', true))}
        ${summaryCard('训练时长', (stats.duration / 3600).toFixed(1), '小时', deltaText(stats.duration, prevStats.duration, '小时', true, 3600))}
        ${summaryCard('完成组数', stats.sets, '组', deltaText(stats.sets, prevStats.sets, '组'))}
      </div>

      <section class="card chart-card">
        <div class="chart-head">
          <div><h3>周训练容量</h3><p>重量 × 次数，仅统计已完成组</p></div>
          <div class="chart-legend"><span><i></i>训练容量</span></div>
        </div>
        ${barChart(
          weeks.map((week) => ({
            label: week.label,
            value: week.volume,
            tooltip: `${week.label} 当周：${week.count} 练 · ${fmtVolume(week.volume)}`,
          })),
          { height: 235 },
        )}
        <div class="chart-foot">
          <span>最高周容量 <b>${fmtVolume(maxWeekVolume)}</b></span>
          <span>${period} 周平均 <b>${fmtVolume(stats.volume / period)}</b></span>
        </div>
      </section>

      <div class="stats-grid">
        <section class="card chart-card" style="margin:0">
          <div class="chart-head"><div><h3>肌群训练分布</h3><p>按训练容量占比</p></div></div>
          ${muscleBars(current)}
        </section>
        <section class="card chart-card" style="margin:0">
          <div class="chart-head"><div><h3>训练节奏</h3><p>${period} 周内各星期训练次数</p></div></div>
          ${weekdayBars(current)}
        </section>
      </div>

      <section class="card heatmap-card">
        <div class="chart-head">
          <div><h3>训练热力图</h3><p>过去 16 周 · 每格代表一天</p></div>
          <span class="tag">${activeDays(all, 112)} 个训练日</span>
        </div>
        <div class="heatmap-layout">
          <div class="heatmap-plot">${heatmap(all)}</div>
          ${heatSummary(all)}
        </div>
      </section>

      <section class="card chart-card">
        <div class="chart-head">
          <div><h3>个人最佳</h3><p>按估算 1RM 排序，估算值仅供参考</p></div>
          <a class="section-link" href="#/exercises">动作库 ${icon('chevron-right', 13)}</a>
        </div>
        ${prs.length ? `<table class="pr-table">
          <thead><tr><th>动作</th><th>最佳组</th><th>估算 1RM</th><th>日期</th></tr></thead>
          <tbody>${prs
            .map(
              (pr) => `<tr>
                <td><span class="pr-ex">${exerciseGlyph(pr.muscle, 'sm')}<span><strong>${esc(pr.name)}</strong><span>${esc(MUSCLES[pr.muscle]?.name || '')} · ${pr.sessions} 次训练</span></span></span></td>
                <td class="num-cell">${pr.bestE1rmWeight > 0 ? `${pr.bestE1rmWeight} kg × ${pr.bestE1rmReps}` : `${pr.bestReps} 次`}</td>
                <td class="num-cell">${pr.bestE1rm > 0 ? `${pr.bestE1rm} kg` : '—'}</td>
                <td class="date-cell">${pr.bestE1rmDate ? formatShortDate(pr.bestE1rmDate) : '—'}</td>
              </tr>`,
            )
            .join('')}</tbody>
        </table>` : emptyState({ iconName: 'trophy', title: '还没有个人记录', text: '完成训练后，这里会自动计算你的最佳成绩。' })}
      </section>
    `;
  }

  function summaryCard(label, value, unit, delta) {
    return `<div class="summary-card"><span>${label}</span><strong>${value}<small>${unit}</small></strong><span class="delta ${delta.cls}">${delta.text}</span></div>`;
  }

  return {
    html: `<div>
      ${pageHead({
        eyebrow: 'PROGRESS',
        title: '数据分析',
        actions: `<div class="segmented">${[4, 8, 12]
          .map((n) => `<button type="button" class="segmented-item${period === n ? ' active' : ''}" data-period="${n}">${n} 周</button>`)
          .join('')}</div>`,
      })}
      <div id="stats-root"></div>
    </div>`,
    mount(root) {
      paint();
      const controller = new AbortController();
      root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-period]');
        if (!button) return;
        period = Number(button.dataset.period);
        root.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b === button));
        paint();
      }, { signal: controller.signal });
      return () => controller.abort();
    },
  };
}

function periodWorkouts(weeks) {
  const now = new Date();
  const start = addDays(startOfWeek(now), -(weeks - 1) * 7);
  return getWorkouts().filter((workout) => new Date(workout.startedAt) >= start);
}

function previousPeriodWorkouts(weeks) {
  const now = new Date();
  const currentStart = addDays(startOfWeek(now), -(weeks - 1) * 7);
  const start = addDays(currentStart, -weeks * 7);
  return getWorkouts().filter((workout) => {
    const date = new Date(workout.startedAt);
    return date >= start && date < currentStart;
  });
}

function aggregate(workouts) {
  return {
    count: workouts.length,
    volume: sum(workouts, (w) => Number(w.totalVolume) || workoutStats(w).volume),
    duration: sum(workouts, (w) => Number(w.durationSec) || 0),
    sets: sum(workouts, (w) => Number(w.totalSets) || workoutStats(w).sets),
  };
}

function deltaText(current, previous, unit = '', percent = false, divisor = 1) {
  if (!previous) return { text: '暂无对比', cls: '' };
  const diff = current - previous;
  if (percent) {
    const pct = Math.round((diff / previous) * 100);
    return { text: `${pct >= 0 ? '+' : ''}${pct}% 较上期`, cls: pct >= 0 ? 'up' : 'down' };
  }
  if (divisor > 1) {
    const diffHours = diff / divisor;
    return {
      text: `${diffHours >= 0 ? '+' : ''}${diffHours.toFixed(1)} 小时`,
      cls: diff >= 0 ? 'up' : 'down',
    };
  }
  return {
    text: `${diff >= 0 ? '+' : ''}${diff} ${unit} 较上期`,
    cls: diff >= 0 ? 'up' : 'down',
  };
}

function formatBigNumber(value) {
  if (value >= 10000) return (value / 1000).toFixed(1);
  return Math.round(value).toLocaleString('zh-CN');
}

function muscleBars(workouts) {
  const distribution = muscleDistribution(workouts);
  const entries = Object.entries(distribution)
    .map(([muscle, data]) => ({ muscle, ...data }))
    .sort((a, b) => b.volume - a.volume);
  if (!entries.length) return '<div class="chart-empty">这段时间还没有训练数据</div>';
  const total = sum(entries, (e) => e.volume) || sum(entries, (e) => e.sets);
  const max = Math.max(...entries.map((e) => e.volume || e.sets), 1);
  return `<div class="muscle-bars">
    ${entries
      .map((entry) => {
        const info = MUSCLES[entry.muscle] || { name: entry.muscle, color: 'var(--accent)' };
        const value = entry.volume || entry.sets;
        const pct = Math.round((value / total) * 100);
        return `<div class="muscle-bar">
          <div class="muscle-bar-head"><span><i style="--muscle:${info.color}"></i>${esc(info.name)}</span><b>${pct}% · ${entry.volume > 0 ? fmtVolume(entry.volume) : `${entry.sets} 组`}</b></div>
          <div class="muscle-track"><i style="width:${Math.max(3, (value / max) * 100)}%;--muscle:${info.color}"></i></div>
        </div>`;
      })
      .join('')}
  </div>`;
}

function weekdayBars(workouts) {
  if (!workouts.length) return '<div class="chart-empty">这段时间还没有训练数据</div>';
  const counts = Array(7).fill(0);
  workouts.forEach((workout) => {
    const day = new Date(workout.startedAt).getDay();
    counts[day === 0 ? 6 : day - 1] += 1;
  });
  const max = Math.max(...counts, 1);
  const order = [0, 1, 2, 3, 4, 5, 6];
  return `<div class="muscle-bars">
    ${order
      .map((index) => {
        const count = counts[index];
        return `<div class="muscle-bar">
          <div class="muscle-bar-head"><span><i style="--muscle:var(--accent)"></i>周${WEEKDAYS[(index + 1) % 7]}</span><b>${count} 次</b></div>
          <div class="muscle-track"><i style="width:${Math.max(count ? 4 : 0, (count / max) * 100)}%;--muscle:var(--accent)"></i></div>
        </div>`;
      })
      .join('')}
  </div>`;
}

function heatmap(workouts) {
  const counts = {};
  workouts.forEach((workout) => {
    const key = toDateKey(workout.startedAt);
    counts[key] = (counts[key] || 0) + 1;
  });
  const now = new Date();
  const start = addDays(startOfWeek(now), -15 * 7);
  const cells = [];
  const monthLabels = [];
  let lastMonth = -1;
  for (let week = 0; week < 16; week += 1) {
    const monday = addDays(start, week * 7);
    let label = '';
    if (monday.getMonth() !== lastMonth) {
      label = `${monday.getMonth() + 1}月`;
      lastMonth = monday.getMonth();
    }
    monthLabels.push(`<span style="width:14px;flex:none">${label}</span>`);
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(monday, day);
      const key = toDateKey(date);
      const count = counts[key] || 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
      cells.push(`<span class="heat-cell${key === toDateKey(now) ? ' today' : ''}" data-level="${level}" title="${date.getMonth() + 1}/${date.getDate()}${count ? ` · ${count} 次训练` : ' · 休息'}"></span>`);
    }
  }
  return `<div class="heatmap-wrap">
    <div class="heatmap-days"><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span>日</span></div>
    <div class="heatmap-main">
      <div class="heatmap-months">${monthLabels.join('')}</div>
      <div class="heatmap-grid">${cells.join('')}</div>
    </div>
  </div>
  <div class="heatmap-legend"><span>少</span><i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><span>多</span></div>`;
}

function heatSummary(workouts) {
  const cutoff = addDays(new Date(), -111);
  const recent = workouts.filter((workout) => new Date(workout.startedAt) >= cutoff);
  const days = [...new Set(recent.map((workout) => toDateKey(workout.startedAt)))].sort();
  const daySet = new Set(days);
  let longest = 0;
  let current = 0;
  if (days.length) {
    let cursor = new Date(`${days[0]}T00:00:00`);
    for (let i = 0; i < 140; i += 1) {
      const key = toDateKey(cursor);
      if (daySet.has(key)) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
      if (key === days[days.length - 1]) break;
      cursor = addDays(cursor, 1);
    }
  }
  const weekStart = startOfWeek(new Date());
  const thisWeek = recent.filter((workout) => new Date(workout.startedAt) >= weekStart).length;
  return `<div class="heatmap-summary">
    <div class="heat-stat"><span>训练天数</span><strong>${days.length}<small>天</small></strong></div>
    <div class="heat-stat"><span>训练次数</span><strong>${recent.length}<small>次</small></strong></div>
    <div class="heat-stat"><span>本周训练</span><strong>${thisWeek}<small>次</small></strong></div>
    <div class="heat-stat"><span>最长连续</span><strong>${longest}<small>天</small></strong></div>
  </div>`;
}

function activeDays(workouts, limitDays) {
  const cutoff = addDays(new Date(), -limitDays);
  return new Set(
    workouts
      .filter((workout) => new Date(workout.startedAt) >= cutoff)
      .map((workout) => toDateKey(workout.startedAt)),
  ).size;
}

function formatShortDate(iso) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
