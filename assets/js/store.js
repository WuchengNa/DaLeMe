/* 大了么 · 状态管理与数据选择器 */
import {
  EXERCISE_CATALOG,
  LEGACY_EXERCISES,
  STORAGE_KEY,
  createDefaultState,
  createEmptyPlan,
} from './data.js';
import {
  addDays,
  e1rm,
  parseRepsRange,
  startOfWeek,
  toDateKey,
  todayKey,
  uid,
} from './utils.js';

let state = loadState();
const listeners = new Set();

/**
 * 老版本默认是深色主题。2.3 起整体调亮：只要用户没主动切换过主题
 * （themeExplicit !== true），就把历史 / 云端状态里的 dark 视为浅色。
 * 该规则是幂等的，云端同步覆盖本机状态时同样生效。
 */
function normalizeSettings(settings) {
  if (settings.theme === 'dark' && !settings.themeExplicit) settings.theme = 'light';
  return settings;
}

function normalizeState(parsed) {
  const defaults = createDefaultState();
  return {
    ...defaults,
    ...parsed,
    settings: normalizeSettings({ ...defaults.settings, ...(parsed.settings || {}) }),
    plans: Array.isArray(parsed.plans) ? parsed.plans : [],
    workouts: Array.isArray(parsed.workouts) ? parsed.workouts : [],
    customExercises: Array.isArray(parsed.customExercises) ? parsed.customExercises : [],
    bodyWeights: Array.isArray(parsed.bodyWeights) ? parsed.bodyWeights : [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== 1 || !Array.isArray(parsed.plans)) {
      return createDefaultState();
    }
    return normalizeState(parsed);
  } catch (error) {
    console.warn('[大了么] 读取本地数据失败，已重置为空数据。', error);
    return createDefaultState();
  }
}

export function getState() {
  return state;
}

export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[大了么] 保存失败', error);
    throw new Error('本地存储空间不足，请先导出并清理部分数据。');
  }
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (error) {
      console.error(error);
    }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  saveState();
}

export function setState(next) {
  state = normalizeState(next);
  saveState();
}

/** 退出登录 / 未登录时把工作副本重置为空，避免上一个账号的数据残留 */
export function resetToEmpty() {
  state = createDefaultState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 忽略存储异常 */
  }
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (error) {
      console.error(error);
    }
  });
}

export function clearAllData() {
  const fresh = createDefaultState();
  const emptyPlan = createEmptyPlan();
  emptyPlan.id = 'plan_empty';
  emptyPlan.name = '我的第一个计划';
  emptyPlan.days[0].id = 'plan_empty_d1';
  emptyPlan.days[0].name = '训练日 1';
  state = {
    ...fresh,
    plans: [emptyPlan],
    workouts: [],
    bodyWeights: [],
    customExercises: [],
    activeWorkout: null,
    settings: { ...fresh.settings, activePlanId: emptyPlan.id },
    meta: { demo: false, lastBackupAt: null },
  };
  saveState();
}

/* ---------------- 动作库 ---------------- */

/* 旧版内置动作的 id 仍可能出现在历史计划 / 训练里，仅用于兜底解析 */
const legacyExerciseMap = new Map(LEGACY_EXERCISES.map((exercise) => [exercise.id, exercise]));

export function getExercises() {
  return [...EXERCISE_CATALOG, ...(state.customExercises || [])];
}

export function getExercise(id) {
  return getExercises().find((e) => e.id === id) || legacyExerciseMap.get(id) || null;
}

export function addCustomExercise(payload) {
  const exercise = {
    id: `custom_${uid('ex')}`,
    name: payload.name.trim(),
    muscle: payload.muscle || 'chest',
    equipment: payload.equipment || '自重',
    base: 0,
    reps: payload.reps || '8-12',
    tip: payload.tip || '',
    custom: true,
  };
  state.customExercises.push(exercise);
  saveState();
  return exercise;
}

export function updateCustomExercise(id, patch) {
  const index = state.customExercises.findIndex((e) => e.id === id);
  if (index === -1) return null;
  state.customExercises[index] = { ...state.customExercises[index], ...patch };
  saveState();
  return state.customExercises[index];
}

export function deleteCustomExercise(id) {
  state.customExercises = state.customExercises.filter((e) => e.id !== id);
  state.plans = state.plans.map((plan) => ({
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      exercises: day.exercises.filter((entry) => entry.exerciseId !== id),
    })),
  }));
  saveState();
}

/* ---------------- 计划 ---------------- */

export function getPlan(id) {
  return state.plans.find((p) => p.id === id) || null;
}

export function getActivePlan() {
  const active = getPlan(state.settings.activePlanId);
  return active || state.plans[0] || null;
}

export function savePlan(plan) {
  const index = state.plans.findIndex((p) => p.id === plan.id);
  if (index === -1) {
    state.plans.unshift(plan);
  } else {
    state.plans[index] = plan;
  }
  if (!state.settings.activePlanId || !getPlan(state.settings.activePlanId)) {
    state.settings.activePlanId = plan.id;
  }
  saveState();
  return plan;
}

export function deletePlan(id) {
  state.plans = state.plans.filter((p) => p.id !== id);
  if (state.settings.activePlanId === id) {
    state.settings.activePlanId = state.plans[0]?.id || null;
  }
  if (state.activeWorkout?.planId === id) state.activeWorkout = null;
  saveState();
}

export function duplicatePlan(id) {
  const source = getPlan(id);
  if (!source) return null;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = `plan_${uid('plan')}`;
  copy.name = `${source.name} · 副本`;
  copy.createdAt = new Date().toISOString();
  copy.days = copy.days.map((day, index) => ({
    ...day,
    id: `${copy.id}_d${index + 1}`,
  }));
  state.plans.unshift(copy);
  saveState();
  return copy;
}

export function planStats(plan) {
  const exercises = plan.days.reduce((acc, day) => acc + day.exercises.length, 0);
  const sets = plan.days.reduce(
    (acc, day) => acc + day.exercises.reduce((s, e) => s + (Number(e.sets) || 0), 0),
    0,
  );
  return { days: plan.days.length, exercises, sets };
}

/* ---------------- 训练记录 ---------------- */

export function workoutStats(workout) {
  let volume = 0;
  let sets = 0;
  let reps = 0;
  for (const exercise of workout?.exercises || []) {
    for (const set of exercise.sets || []) {
      if (!set.done || set.type === 'warmup') continue;
      sets += 1;
      reps += Number(set.reps) || 0;
      volume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
    }
  }
  return { volume, sets, reps };
}

export function getWorkouts() {
  return [...state.workouts].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export function getWorkout(id) {
  return state.workouts.find((w) => w.id === id) || null;
}

export function getLastPerformance(exerciseId, beforeDate = new Date()) {
  const cutoff = beforeDate ? new Date(beforeDate).getTime() : Infinity;
  const workouts = getWorkouts();
  for (const workout of workouts) {
    if (new Date(workout.startedAt).getTime() >= cutoff) continue;
    const exercise = workout.exercises.find((e) => e.exerciseId === exerciseId);
    if (exercise?.sets?.some((s) => s.done)) return exercise;
  }
  return null;
}

export function getPersonalBests(workouts = state.workouts) {
  const map = {};
  const sorted = [...workouts].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  for (const workout of sorted) {
    for (const exercise of workout.exercises || []) {
      const working = (exercise.sets || []).filter((s) => s.done && s.type !== 'warmup');
      if (!working.length) continue;
      const current =
        map[exercise.exerciseId] ||
        (map[exercise.exerciseId] = {
          exerciseId: exercise.exerciseId,
          name: exercise.name,
          muscle: exercise.muscle,
          sessions: 0,
          totalVolume: 0,
          totalSets: 0,
          bestWeight: 0,
          bestWeightReps: 0,
          bestWeightDate: null,
          bestE1rm: 0,
          bestE1rmWeight: 0,
          bestE1rmReps: 0,
          bestE1rmDate: null,
          bestReps: 0,
          bestRepsDate: null,
        });
      current.sessions += 1;
      for (const set of working) {
        const weight = Number(set.weight) || 0;
        const reps = Number(set.reps) || 0;
        const estimate = e1rm(weight, reps);
        current.totalVolume += weight * reps;
        current.totalSets += 1;
        if (weight > current.bestWeight) {
          current.bestWeight = weight;
          current.bestWeightReps = reps;
          current.bestWeightDate = workout.startedAt;
        }
        if (estimate > current.bestE1rm) {
          current.bestE1rm = estimate;
          current.bestE1rmWeight = weight;
          current.bestE1rmReps = reps;
          current.bestE1rmDate = workout.startedAt;
        }
        if (reps > current.bestReps) {
          current.bestReps = reps;
          current.bestRepsDate = workout.startedAt;
        }
      }
    }
  }
  return map;
}

function setScore(set) {
  const weight = Number(set.weight) || 0;
  const reps = Number(set.reps) || 0;
  return weight > 0 ? e1rm(weight, reps) : reps;
}

/** 计算某次训练相对此前记录产生的 PR */
export function getWorkoutPRs(workout) {
  if (!workout) return [];
  const earlier = state.workouts
    .filter(
      (w) =>
        w.id !== workout.id &&
        new Date(w.startedAt).getTime() < new Date(workout.startedAt).getTime(),
    )
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  const previous = {};
  for (const w of earlier) {
    for (const exercise of w.exercises || []) {
      const working = (exercise.sets || []).filter((s) => s.done && s.type !== 'warmup');
      for (const set of working) {
        const key = exercise.exerciseId;
        if (!previous[key] || setScore(set) > previous[key].score) {
          previous[key] = {
            score: setScore(set),
            weight: Number(set.weight) || 0,
            reps: Number(set.reps) || 0,
            date: w.startedAt,
            name: exercise.name,
          };
        }
      }
    }
  }

  const prs = [];
  for (const exercise of workout.exercises || []) {
    const working = (exercise.sets || []).filter((s) => s.done && s.type !== 'warmup');
    if (!working.length) continue;
    let best = null;
    for (const set of working) {
      const score = setScore(set);
      if (!best || score > best.score) {
        best = {
          score,
          weight: Number(set.weight) || 0,
          reps: Number(set.reps) || 0,
          name: exercise.name,
          muscle: exercise.muscle,
        };
      }
    }
    if (!best) continue;
    const prev = previous[exercise.exerciseId];
    if (!prev) {
      prs.push({ ...best, isFirst: true, previous: null });
    } else if (best.score > prev.score + 0.01) {
      prs.push({
        ...best,
        isFirst: false,
        previous: { weight: prev.weight, reps: prev.reps },
      });
    }
  }
  return prs.sort((a, b) => b.score - a.score);
}

export function saveWorkout(workout) {
  state.workouts.unshift(workout);
  state.workouts.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  state.activeWorkout = null;
  saveState();
  return workout;
}

export function deleteWorkout(id) {
  state.workouts = state.workouts.filter((w) => w.id !== id);
  saveState();
}

/* ---------------- 进行中的训练 ---------------- */

export function getActiveWorkout() {
  return state.activeWorkout;
}

export function buildActiveWorkout(plan, day) {
  const exercises = day.exercises.map((entry) => {
    const def = getExercise(entry.exerciseId);
    const last = getLastPerformance(entry.exerciseId);
    const lastWorking = (last?.sets || []).filter((s) => s.type !== 'warmup');
    const [lo, hi] = parseRepsRange(entry.reps);
    const targetSets = Math.max(1, Number(entry.sets) || 3);
    const sets = Array.from({ length: targetSets }, (_, index) => {
      const previous = lastWorking[index] || lastWorking[lastWorking.length - 1];
      const planWeight = Number(entry.weight) > 0 ? String(entry.weight) : '';
      return {
        id: uid('set'),
        weight: previous && Number(previous.weight) > 0 ? String(previous.weight) : planWeight,
        reps: previous?.reps ? String(previous.reps) : String(hi || lo || 10),
        done: false,
        type: 'normal',
      };
    });
    return {
      exerciseId: entry.exerciseId,
      name: def?.nameZh || def?.name || entry.exerciseId,
      muscle: def?.muscle || 'chest',
      equipment: def?.equipment || '',
      rest: Number(entry.rest) || state.settings.defaultRest || 90,
      note: entry.note || '',
      targetSets,
      targetReps: entry.reps || '8-12',
      sets,
    };
  });

  return {
    id: uid('workout'),
    planId: plan.id,
    planName: plan.name,
    dayId: day.id,
    dayName: day.name,
    startedAt: new Date().toISOString(),
    exercises,
    notes: '',
    rest: null,
  };
}

export function startWorkout(plan, day) {
  state.activeWorkout = buildActiveWorkout(plan, day);
  saveState();
  return state.activeWorkout;
}

export function updateActiveWorkout(mutator) {
  if (!state.activeWorkout) return null;
  mutator(state.activeWorkout);
  saveState();
  return state.activeWorkout;
}

export function discardActiveWorkout() {
  state.activeWorkout = null;
  saveState();
}

export function finishActiveWorkout(notes = '') {
  const active = state.activeWorkout;
  if (!active) return null;
  const now = new Date();
  const stats = workoutStats(active);
  const workout = {
    ...active,
    notes: notes || active.notes || '',
    finishedAt: now.toISOString(),
    durationSec: Math.max(
      60,
      Math.round((now.getTime() - new Date(active.startedAt).getTime()) / 1000),
    ),
    totalVolume: stats.volume,
    totalSets: stats.sets,
    rest: undefined,
  };
  state.activeWorkout = null;
  state.workouts.unshift(workout);
  saveState();
  return workout;
}

/* ---------------- 统计 ---------------- */

export function weeklySummary(date = new Date()) {
  const start = startOfWeek(date);
  const end = addDays(start, 7);
  const workouts = getWorkouts().filter((w) => {
    const time = new Date(w.startedAt).getTime();
    return time >= start.getTime() && time < end.getTime();
  });
  const volume = workouts.reduce((acc, w) => acc + (Number(w.totalVolume) || workoutStats(w).volume), 0);
  const duration = workouts.reduce((acc, w) => acc + (Number(w.durationSec) || 0), 0);
  const sets = workouts.reduce((acc, w) => acc + (Number(w.totalSets) || workoutStats(w).sets), 0);
  const days = new Set(workouts.map((w) => toDateKey(w.startedAt)));
  return {
    workouts,
    count: workouts.length,
    volume,
    duration,
    sets,
    trainedDays: days.size,
  };
}

export function weekStreak() {
  const goal = Math.max(1, Number(state.settings.weeklyGoal) || 1);
  let streak = 0;
  let week = startOfWeek(new Date());
  for (let i = 0; i < 52; i += 1) {
    const summary = weeklySummary(week);
    if (summary.count >= goal) {
      streak += 1;
    } else if (i > 0) {
      break;
    }
    week = addDays(week, -7);
  }
  return streak;
}

export function trainingStreakDays() {
  const days = new Set(getWorkouts().map((w) => toDateKey(w.startedAt)));
  let cursor = new Date();
  if (!days.has(todayKey())) cursor = addDays(cursor, -1);
  let streak = 0;
  for (let i = 0; i < 366; i += 1) {
    if (days.has(toDateKey(cursor))) {
      streak += 1;
    } else if (i > 0) {
      break;
    } else if (!days.has(todayKey())) {
      // 昨天也没练，连续归零
      break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function nextWorkoutSuggestion() {
  const plan = getActivePlan();
  if (!plan || !plan.days?.length) return null;
  const availableDays = plan.days.filter((day) => day.exercises?.length);
  if (!availableDays.length) return null;
  const last = getWorkouts().find((w) => w.planId === plan.id);
  let index = 0;
  if (last) {
    const lastIndex = availableDays.findIndex((d) => d.id === last.dayId);
    index = lastIndex >= 0 ? (lastIndex + 1) % availableDays.length : 0;
  }
  return { plan, day: availableDays[index], dayIndex: index };
}

export function muscleDistribution(workouts) {
  const map = {};
  for (const workout of workouts) {
    for (const exercise of workout.exercises || []) {
      const working = (exercise.sets || []).filter((s) => s.done && s.type !== 'warmup');
      if (!working.length) continue;
      const volume = working.reduce(
        (acc, s) => acc + (Number(s.weight) || 0) * (Number(s.reps) || 0),
        0,
      );
      const setCount = working.length;
      const entry = map[exercise.muscle] || (map[exercise.muscle] = { volume: 0, sets: 0 });
      entry.volume += volume;
      entry.sets += setCount;
    }
  }
  return map;
}

export function volumeByWeek(weeks = 8) {
  const current = startOfWeek(new Date());
  const result = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDays(current, -i * 7);
    const summary = weeklySummary(start);
    result.push({
      start,
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      ...summary,
    });
  }
  return result;
}

export function exerciseHistory(exerciseId) {
  const points = [];
  for (const workout of getWorkouts()) {
    const exercise = workout.exercises?.find((e) => e.exerciseId === exerciseId);
    if (!exercise) continue;
    const working = (exercise.sets || []).filter((s) => s.done && s.type !== 'warmup');
    if (!working.length) continue;
    let best = null;
    for (const set of working) {
      const score = setScore(set);
      if (!best || score > best.score) best = { ...set, score };
    }
    points.push({
      date: workout.startedAt,
      workoutId: workout.id,
      weight: Number(best.weight) || 0,
      reps: Number(best.reps) || 0,
      e1rm: e1rm(Number(best.weight) || 0, Number(best.reps) || 0),
      volume: working.reduce(
        (acc, s) => acc + (Number(s.weight) || 0) * (Number(s.reps) || 0),
        0,
      ),
    });
  }
  return points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function bodyWeightSeries() {
  return [...state.bodyWeights].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

export function latestBodyWeight() {
  const series = bodyWeightSeries();
  return series[series.length - 1] || null;
}

export function addBodyWeight(record) {
  const entry = {
    id: uid('bw'),
    date: record.date || todayKey(),
    weight: Number(record.weight),
    bodyFat: record.bodyFat ? Number(record.bodyFat) : null,
  };
  const existing = state.bodyWeights.findIndex((r) => r.date === entry.date);
  if (existing >= 0) state.bodyWeights[existing] = { ...state.bodyWeights[existing], ...entry };
  else state.bodyWeights.push(entry);
  state.bodyWeights.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  saveState();
  return entry;
}

export function deleteBodyWeight(id) {
  state.bodyWeights = state.bodyWeights.filter((r) => r.id !== id);
  saveState();
}

export function monthlyWorkoutMap(weeks = 16) {
  const map = {};
  for (const workout of state.workouts) {
    const key = toDateKey(workout.startedAt);
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

/* ---------------- 导入导出 ---------------- */

export function exportPayload() {
  return JSON.stringify(
    {
      app: '大了么',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2,
  );
}

export function importPayload(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  const data = parsed?.data || parsed;
  if (!data || !Array.isArray(data.plans) || !Array.isArray(data.workouts)) {
    throw new Error('文件格式不正确，缺少 plans 或 workouts 数据。');
  }
  state = {
    ...createDefaultState(),
    ...data,
    schema: 1,
    plans: data.plans,
    workouts: data.workouts,
    customExercises: data.customExercises || [],
    bodyWeights: data.bodyWeights || [],
    activeWorkout: null,
    meta: { ...(data.meta || {}), lastBackupAt: new Date().toISOString() },
    settings: normalizeSettings({ ...createDefaultState().settings, ...(data.settings || {}) }),
  };
  saveState();
  return state;
}

export function estimatedPlanDuration(day) {
  return day.exercises.reduce((acc, entry) => {
    const sets = Number(entry.sets) || 3;
    const rest = Number(entry.rest) || 90;
    return acc + sets * (45 + rest);
  }, 0);
}

export function bestSetFor(exerciseId) {
  const bests = getPersonalBests();
  return bests[exerciseId] || null;
}

export { createEmptyPlan };
