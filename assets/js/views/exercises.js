/* 动作库 · 按部位 / 器械筛选与分组，动作 GIF 展示 */
import {
  BODY_PARTS, CATALOG_INFO, EQUIPMENT, EQUIPMENT_FILTERS, MUSCLES,
} from '../data.js';
import {
  addCustomExercise,
  getExercises,
  getPersonalBests,
  updateCustomExercise as updateCustom,
} from '../store.js';
import {
  bindMediaFallback, exerciseSearchText, mediaMarkup, primaryName, secondaryName,
} from '../exercise-utils.js';
import { icon, openSheet, pageHead, showToast } from '../ui.js';
import { esc } from '../utils.js';

const PAGE_SIZE = 48;
const PART_ORDER = new Map(BODY_PARTS.map((part, index) => [part.key, index]));

function partLabel(exercise) {
  return MUSCLES[exercise.muscle]?.name || '其他';
}

function groupKey(exercise, mode) {
  if (mode === 'part') return partLabel(exercise);
  if (mode === 'equipment') return exercise.equipment || '其他';
  return null;
}

export default function exercisesView(ctx) {
  const exercises = getExercises();
  const bests = getPersonalBests();
  const customCount = exercises.filter((e) => e.custom).length;

  const html = `<div>
    ${pageHead({
      eyebrow: 'EXERCISES',
      title: '动作库',
      subtitle: `${exercises.length} 个动作 · ${BODY_PARTS.length} 个部位 · ${EQUIPMENT_FILTERS.length} 种器械`,
      actions: `<button type="button" class="btn btn-primary" data-new-exercise>${icon('plus', 16)} 新建动作</button>`,
    })}

    <div class="library-toolbar">
      <div class="search-box">
        ${icon('search', 17)}
        <input type="search" placeholder="搜索动作名称、器械或肌群…" data-ex-search />
      </div>
    </div>

    <div class="library-filter">
      <span class="library-filter-label">部位</span>
      <div class="chips scroll" data-ex-parts>
        <button type="button" class="chip active" data-ex-muscle="all">全部</button>
        ${BODY_PARTS.map(
          (part) => `<button type="button" class="chip" data-ex-muscle="${part.key}">
            <span class="chip-dot" style="background:${part.color}"></span>${esc(part.label)}<b>${part.count}</b></button>`,
        ).join('')}
      </div>
    </div>

    <div class="library-filter">
      <span class="library-filter-label">器械</span>
      <div class="chips scroll" data-ex-equip>
        <button type="button" class="chip active" data-ex-equipment="all">全部</button>
        ${EQUIPMENT_FILTERS.map(
          (item) => `<button type="button" class="chip" data-ex-equipment="${esc(item.label)}">${esc(item.label)}<b>${item.count}</b></button>`,
        ).join('')}
      </div>
    </div>

    <div class="library-groupbar">
      <div class="seg" data-ex-group>
        <button type="button" class="active" data-ex-groupby="none">不分组</button>
        <button type="button" data-ex-groupby="part">按部位</button>
        <button type="button" data-ex-groupby="equipment">按器械</button>
      </div>
      <span class="muted" data-ex-result></span>
      ${customCount ? `<span class="tag" style="margin-left:auto">${customCount} 个自定义</span>` : ''}
    </div>

    <div data-ex-grid></div>
    <button type="button" class="btn btn-ghost btn-block hide" data-ex-more style="margin-top:12px">加载更多</button>
    <div class="empty-state hide" data-ex-empty>
      <div class="empty-icon">${icon('search', 24)}</div>
      <h3>没有找到动作</h3>
      <p>换个关键词，或者创建一个自定义动作。</p>
      <button type="button" class="btn btn-ghost" data-new-exercise>新建动作</button>
    </div>

    <div class="library-credit">
      动作资料来自 <a href="${esc(CATALOG_INFO.sourceUrl)}" target="_blank" rel="noopener noreferrer">exercises-dataset</a>
      · 动作 GIF <a href="https://gymvisual.com/" target="_blank" rel="noopener noreferrer">© Gym visual</a>
    </div>
  </div>`;

  return {
    html,
    mount(root) {
      let search = '';
      let muscle = 'all';
      let equipment = 'all';
      let groupMode = 'none';
      let shown = PAGE_SIZE;

      const grid = root.querySelector('[data-ex-grid]');
      const more = root.querySelector('[data-ex-more]');
      const empty = root.querySelector('[data-ex-empty]');
      const result = root.querySelector('[data-ex-result]');

      const card = (exercise) => {
        const best = bests[exercise.id];
        const hasWeight = best?.bestWeight > 0;
        const pb = best ? (hasWeight ? `${best.bestWeight} kg` : `${best.bestReps} 次`) : null;
        const english = secondaryName(exercise);
        return `<a class="ex-tile" href="#/exercises/${exercise.id}">
          ${mediaMarkup(exercise, { className: 'ex-tile-media' })}
          <span class="ex-tile-body">
            <strong>${esc(primaryName(exercise))}</strong>
            ${english ? `<span class="ex-tile-en">${esc(english)}</span>` : ''}
            <span class="ex-tile-tags">
              <span class="tag">${esc(partLabel(exercise))}</span>
              <span class="tag">${esc(exercise.equipment || '')}</span>
              ${exercise.target ? `<span class="tag">${esc(exercise.target)}</span>` : ''}
            </span>
            ${pb ? `<span class="ex-tile-pb">${icon('trophy', 12)} ${esc(pb)} 个人最佳</span>` : ''}
            ${exercise.custom ? '<span class="tag lime ex-tile-custom">自定义</span>' : ''}
          </span>
        </a>`;
      };

      const render = () => {
        const needle = search.trim().toLowerCase();
        const filtered = exercises.filter((exercise) => {
          const matchSearch = !needle || exerciseSearchText(exercise).includes(needle);
          const matchMuscle = muscle === 'all' || exercise.muscle === muscle;
          const matchEquipment = equipment === 'all' || exercise.equipment === equipment;
          return matchSearch && matchMuscle && matchEquipment;
        });

        /* 自定义动作始终排在最前，方便找到自己创建的动作 */
        filtered.sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)));

        if (groupMode === 'part') {
          filtered.sort((a, b) => (PART_ORDER.get(a.muscle) ?? 99) - (PART_ORDER.get(b.muscle) ?? 99));
        } else if (groupMode === 'equipment') {
          filtered.sort((a, b) => String(a.equipment).localeCompare(String(b.equipment), 'zh'));
        }

        const counts = new Map();
        if (groupMode !== 'none') {
          for (const exercise of filtered) {
            const key = groupKey(exercise, groupMode);
            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }

        const page = filtered.slice(0, shown);
        let markup = '';
        let currentGroup = null;
        let open = false;
        for (const exercise of page) {
          const key = groupKey(exercise, groupMode);
          if (groupMode !== 'none' && key !== currentGroup) {
            if (open) markup += '</div></section>';
            markup += `<section class="library-group">
              <div class="library-group-head"><h2>${esc(key)}</h2><span>${counts.get(key)} 个动作</span></div>
              <div class="ex-tile-grid">`;
            currentGroup = key;
            open = true;
          } else if (groupMode === 'none' && !open) {
            markup += '<div class="ex-tile-grid">';
            open = true;
          }
          markup += card(exercise);
        }
        if (open) markup += `</div>${groupMode !== 'none' ? '</section>' : ''}`;
        grid.innerHTML = markup;

        result.textContent = `共 ${filtered.length} 个动作${page.length < filtered.length ? ` · 已显示 ${page.length}` : ''}`;
        empty.classList.toggle('hide', filtered.length > 0);
        more.classList.toggle('hide', page.length >= filtered.length);
        if (page.length < filtered.length) {
          more.textContent = `加载更多（还有 ${filtered.length - page.length} 个）`;
        }
      };

      root.querySelector('[data-ex-search]')?.addEventListener('input', (event) => {
        search = event.target.value;
        shown = PAGE_SIZE;
        render();
      });
      root.querySelectorAll('[data-ex-muscle]').forEach((chip) => {
        chip.addEventListener('click', () => {
          muscle = chip.dataset.exMuscle;
          root.querySelectorAll('[data-ex-muscle]').forEach((c) => c.classList.toggle('active', c === chip));
          shown = PAGE_SIZE;
          render();
        });
      });
      root.querySelectorAll('[data-ex-equipment]').forEach((chip) => {
        chip.addEventListener('click', () => {
          equipment = chip.dataset.exEquipment;
          root.querySelectorAll('[data-ex-equipment]').forEach((c) => c.classList.toggle('active', c === chip));
          shown = PAGE_SIZE;
          render();
        });
      });
      root.querySelectorAll('[data-ex-groupby]').forEach((button) => {
        button.addEventListener('click', () => {
          groupMode = button.dataset.exGroupby;
          root.querySelectorAll('[data-ex-groupby]').forEach((b) => b.classList.toggle('active', b === button));
          shown = PAGE_SIZE;
          render();
        });
      });
      more.addEventListener('click', () => {
        shown += PAGE_SIZE;
        render();
      });
      root.querySelectorAll('[data-new-exercise]').forEach((button) => {
        button.addEventListener('click', () => openExerciseForm(null, ctx));
      });
      bindMediaFallback(root);
      render();
    },
  };
}

export function openExerciseForm(exercise, ctx) {
  const isEdit = Boolean(exercise);
  const body = `<div class="stack">
    <label class="field"><span class="field-label">动作名称</span>
      <input class="input" data-ex-name maxlength="40" placeholder="例如：绳索面拉" value="${esc(exercise?.name || '')}" autofocus />
    </label>
    <div class="form-grid">
      <label class="field"><span class="field-label">训练部位</span>
        <select class="select" data-ex-muscle-select>
          ${BODY_PARTS.map(
            (part) => `<option value="${part.key}" ${exercise?.muscle === part.key ? 'selected' : ''}>${esc(part.label)}</option>`,
          ).join('')}
        </select>
      </label>
      <label class="field"><span class="field-label">器械</span>
        <select class="select" data-ex-equipment-select>
          ${EQUIPMENT.map((eq) => `<option value="${esc(eq)}" ${exercise?.equipment === eq ? 'selected' : ''}>${esc(eq)}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="field"><span class="field-label">建议次数</span>
      <input class="input" data-ex-reps maxlength="12" placeholder="8-12" value="${esc(exercise?.reps || '8-12')}" />
      <span class="field-hint">例如「8-12」或「45-60」，用于新建训练组时的默认次数。</span>
    </label>
    <label class="field"><span class="field-label">动作要点 <span class="muted" style="font-weight:400">（可选）</span></span>
      <textarea class="textarea" data-ex-tip rows="3" placeholder="提醒自己注意的动作细节…">${esc(exercise?.tip || '')}</textarea>
    </label>
  </div>`;

  openSheet({
    title: isEdit ? '编辑自定义动作' : '新建自定义动作',
    body,
    footer: `<div class="btn-row"><button type="button" class="btn btn-ghost" data-sheet-close>取消</button><button type="button" class="btn btn-primary" data-save-exercise>${icon('check', 15)} ${isEdit ? '保存' : '创建动作'}</button></div>`,
    onMount: (sheet, close) => {
      sheet.querySelector('[data-save-exercise]').addEventListener('click', () => {
        const name = sheet.querySelector('[data-ex-name]').value.trim();
        if (!name) {
          showToast('请输入动作名称', 'error');
          sheet.querySelector('[data-ex-name]').focus();
          return;
        }
        const payload = {
          name,
          muscle: sheet.querySelector('[data-ex-muscle-select]').value,
          equipment: sheet.querySelector('[data-ex-equipment-select]').value,
          reps: sheet.querySelector('[data-ex-reps]').value.trim() || '8-12',
          tip: sheet.querySelector('[data-ex-tip]').value.trim(),
        };
        let target = exercise;
        if (isEdit) {
          updateCustom(exercise.id, payload);
          showToast('动作已更新');
        } else {
          target = addCustomExercise(payload);
          showToast('自定义动作已创建');
        }
        close();
        if (!isEdit) ctx.navigate(`/exercises/${target.id}`);
        else ctx.rerender();
      });
    },
  });
}
