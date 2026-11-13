/* 大了么 · 动作库展示辅助：双语名称、GIF 渲染、中文动作要领按需加载 */
import { MUSCLES } from './data.js';
import { icon } from './ui.js';
import { esc } from './utils.js';

/** 优先展示中文名；没有可靠译名时保留数据集的英文原名 */
export function primaryName(exercise) {
  return exercise.nameZh || exercise.name || '';
}

/** 中文名存在时，英文原名作为副标题 */
export function secondaryName(exercise) {
  return exercise.nameZh ? exercise.name || '' : '';
}

/** 搜索索引：中英文名 + 器械 + 目标肌群 + 部位 + 协同肌群 */
export function exerciseSearchText(exercise) {
  return [
    primaryName(exercise),
    secondaryName(exercise),
    exercise.equipment,
    exercise.target,
    exercise.muscleGroup,
    MUSCLES[exercise.muscle]?.name,
    ...(exercise.secondary || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** 选择器共用：按部位 / 关键词过滤（关键词覆盖中英文名、器械与目标肌群） */
export function filterExercises(exercises, { search = '', muscle = 'all' } = {}) {
  const needle = search.trim().toLowerCase();
  return exercises.filter((exercise) => {
    const matchMuscle = muscle === 'all' || exercise.muscle === muscle;
    const matchSearch = !needle || exerciseSearchText(exercise).includes(needle);
    return matchMuscle && matchSearch;
  });
}

/** 1,324 个动作不宜一次性铺进选择器，默认最多显示 60 条 */
export const PICKER_LIMIT = 60;

/**
 * 动作 GIF。自定义动作没有 GIF 时回退为部位色块图标。
 * 图片全部本地托管在 /assets/exercises/，可直接通过 CSP 的 img-src 'self'。
 */
export function mediaMarkup(exercise, { className = '', animated = true } = {}) {
  const info = MUSCLES[exercise.muscle] || MUSCLES.chest;
  if (!exercise.gif) {
    return `<span class="ex-media ex-media-empty ${className}" style="--muscle:${info.color};--muscle-soft:${info.soft}">${icon('dumbbell', 24)}</span>`;
  }
  return `<span class="ex-media ${className}">
    <img data-ex-media src="${esc(animated ? exercise.gif : exercise.image || exercise.gif)}"
      alt="${esc(primaryName(exercise))} 动作示范" loading="lazy" decoding="async"
      width="180" height="180" />
  </span>`;
}

/** 图片加载失败时降级为色块图标（用捕获阶段监听，避免内联事件被 CSP 拦截） */
export function bindMediaFallback(root) {
  root.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-ex-media')) return;
      const holder = img.closest('.ex-media');
      if (holder) {
        holder.classList.add('ex-media-empty');
        holder.innerHTML = icon('dumbbell', 24);
      }
    },
    true,
  );
}

/* ------------------------------------------------------------------
   中文 / 英文分步动作要领放在独立 JSON 里，只有打开详情页才请求，
   避免把 1 MB 文本塞进首屏。
   ------------------------------------------------------------------ */
let detailsPromise = null;

export function loadExerciseDetails() {
  if (!detailsPromise) {
    detailsPromise = fetch('/assets/exercises/details.json')
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return detailsPromise;
}

export async function getExerciseSteps(id) {
  const data = await loadExerciseDetails();
  return data?.items?.[id] || null;
}
