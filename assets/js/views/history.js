/* 训练记录列表 */
import { getWorkouts, workoutStats } from '../store.js';
import { emptyState, icon, pageHead, workoutRow } from '../ui.js';
import { esc, fmtVolume, todayKey, toDateKey } from '../utils.js';

export default function historyView(ctx) {
  const workouts = getWorkouts();
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthWorkouts = workouts.filter((w) => toDateKey(w.startedAt).startsWith(monthPrefix));
  const monthVolume = monthWorkouts.reduce(
    (acc, w) => acc + (Number(w.totalVolume) || workoutStats(w).volume),
    0,
  );
  const totalVolume = workouts.reduce(
    (acc, w) => acc + (Number(w.totalVolume) || workoutStats(w).volume),
    0,
  );

  const groups = {};
  for (const workout of workouts) {
    const date = new Date(workout.startedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!groups[key]) {
      groups[key] = {
        key,
        label: `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`,
        workouts: [],
      };
    }
    groups[key].workouts.push(workout);
  }

  const groupsHtml = Object.values(groups)
    .map((group) => {
      const volume = group.workouts.reduce((acc, w) => acc + (Number(w.totalVolume) || workoutStats(w).volume), 0);
      return `<section class="month-group" data-month="${group.key}">
        <div class="month-label"><b>${esc(group.label)}</b><span>${group.workouts.length} 次</span><span>${fmtVolume(volume)}</span></div>
        <div class="history-list">
          ${group.workouts
            .map((workout) => {
              const search = [
                workout.planName,
                workout.dayName,
                ...(workout.exercises || []).map((e) => e.name),
              ]
                .join(' ')
                .toLowerCase();
              return `<div data-workout-item data-date="${toDateKey(workout.startedAt)}" data-search="${esc(search)}">${workoutRow(workout)}</div>`;
            })
            .join('')}
        </div>
      </section>`;
    })
    .join('');

  const html = `<div>
    ${pageHead({
      eyebrow: 'LOGBOOK',
      title: '训练记录',
      subtitle: `${workouts.length} 次训练 · 累计 ${fmtVolume(totalVolume)}`,
      actions: `<a class="btn btn-ghost" href="#/stats">${icon('chart', 16)} 查看趋势</a>`,
    })}

    <div class="mini-stats" style="margin-bottom:18px">
      <div class="mini-stat"><span>本月训练</span><strong>${monthWorkouts.length}<small>次</small></strong></div>
      <div class="mini-stat"><span>本月容量</span><strong>${fmtVolume(monthVolume).replace(' kg', '').replace(' t', '')}<small>${fmtVolume(monthVolume).includes(' t') ? '吨' : 'kg'}</small></strong></div>
      <div class="mini-stat"><span>最近训练</span><strong style="font-size:15px">${workouts[0] ? esc(workouts[0].dayName.split(' · ')[0]) : '—'}</strong></div>
      <div class="mini-stat"><span>连续训练</span><strong>${currentStreak()}<small>天</small></strong></div>
    </div>

    ${
      workouts.length
        ? `<div class="history-toolbar">
            <div class="search-box" style="max-width:340px">
              ${icon('search', 17)}
              <input type="search" placeholder="搜索计划、训练日或动作…" data-history-search />
            </div>
            <div class="chips scroll" style="flex:1">
              <button type="button" class="chip active" data-history-range="all">全部</button>
              <button type="button" class="chip" data-history-range="month">本月</button>
              <button type="button" class="chip" data-history-range="30">近 30 天</button>
            </div>
          </div>
          <div data-history-groups>${groupsHtml}</div>
          <div class="empty-state hide" data-history-empty>
            <div class="empty-icon">${icon('search', 24)}</div>
            <h3>没有匹配的记录</h3><p>试试其他关键词或时间范围。</p>
          </div>`
        : `<div class="card">${emptyState({
            iconName: 'history',
            title: '还没有训练记录',
            text: '完成第一次训练后，你的组数、重量和容量都会记录在这里。',
            action: '<a class="btn btn-primary" href="#/plans">去开始一次训练</a>',
          })}</div>`
    }
  </div>`;

  return {
    html,
    mount(root) {
      if (!workouts.length) return;
      let range = 'all';
      let query = '';
      const groupsEl = root.querySelector('[data-history-groups]');
      const emptyEl = root.querySelector('[data-history-empty]');

      const applyFilter = () => {
        const nowDate = new Date();
        const cutoff = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 29);
        const currentMonth = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`;
        let anyVisible = false;

        groupsEl.querySelectorAll('[data-workout-item]').forEach((item) => {
          const searchMatch = !query || item.dataset.search.includes(query);
          let rangeMatch = true;
          if (range === 'month') rangeMatch = item.dataset.date.startsWith(currentMonth);
          if (range === '30') {
            const date = new Date(`${item.dataset.date}T00:00:00`);
            rangeMatch = date >= cutoff;
          }
          const visible = searchMatch && rangeMatch;
          item.classList.toggle('hide', !visible);
          if (visible) anyVisible = true;
        });

        groupsEl.querySelectorAll('[data-month]').forEach((group) => {
          const hasVisible = [...group.querySelectorAll('[data-workout-item]')].some((item) => !item.classList.contains('hide'));
          group.classList.toggle('hide', !hasVisible);
        });
        emptyEl?.classList.toggle('hide', anyVisible);
      };

      root.querySelector('[data-history-search]')?.addEventListener('input', (event) => {
        query = event.target.value.trim().toLowerCase();
        applyFilter();
      });
      root.querySelectorAll('[data-history-range]').forEach((button) => {
        button.addEventListener('click', () => {
          range = button.dataset.historyRange;
          root.querySelectorAll('[data-history-range]').forEach((b) => b.classList.toggle('active', b === button));
          applyFilter();
        });
      });
    },
  };
}

function currentStreak() {
  const days = new Set(getWorkouts().map((w) => toDateKey(w.startedAt)));
  let cursor = new Date();
  if (!days.has(todayKey())) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (let i = 0; i < 365; i += 1) {
    if (!days.has(toDateKey(cursor))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
