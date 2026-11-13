/* 计划编辑器 */
import { BODY_PARTS, MUSCLES, PLAN_COLORS } from '../data.js';
import {
  filterExercises, mediaMarkup, primaryName, secondaryName,
  bindMediaFallback, PICKER_LIMIT,
} from '../exercise-utils.js';
import {
  createEmptyPlan,
  getExercise,
  getExercises,
  getPlan,
  getState,
  savePlan,
  updateSettings,
} from '../store.js';
import {
  confirmDialog,
  exerciseGlyph,
  icon,
  openSheet,
  showToast,
} from '../ui.js';
import { clamp, esc, parseRepsRange, uid } from '../utils.js';

export default function planEditorView(ctx) {
  const isEdit = ctx.mode === 'edit';
  const source = isEdit ? getPlan(ctx.id) : null;
  if (isEdit && !source) {
    return {
      html: `<div class="empty-state"><div class="empty-icon">${icon('plans', 26)}</div><h3>计划不存在</h3><a class="btn btn-primary" href="#/plans">返回计划列表</a></div>`,
    };
  }

  let draft = source ? JSON.parse(JSON.stringify(source)) : createEmptyPlan();
  let activeDayId = draft.days[0]?.id;
  let dirty = false;

  function activeDay() {
    return draft.days.find((d) => d.id === activeDayId) || draft.days[0];
  }

  function paint() {
    const root = document.getElementById('plan-editor-root');
    if (!root) return;
    if (!draft.days.find((d) => d.id === activeDayId)) activeDayId = draft.days[0]?.id;
    const day = activeDay();
    const color = PLAN_COLORS.find((c) => c.id === draft.color)?.value || PLAN_COLORS[0].value;

    root.innerHTML = `
      <div class="editor-bar">
        <div class="editor-bar-left">
          <button type="button" class="icon-btn" data-editor-back aria-label="返回">${icon('arrow-left', 20)}</button>
          <div>
            <h1>${isEdit ? '编辑计划' : '新建计划'}</h1>
            <p>${draft.days.length} 个训练日 · ${draft.days.reduce((acc, d) => acc + d.exercises.length, 0)} 个动作</p>
          </div>
        </div>
        <button type="button" class="btn btn-primary" data-editor-save>${icon('check', 16)} 保存计划</button>
      </div>

      <section class="card editor-meta" style="--plan-color:${color}">
        <div class="editor-meta-row">
          <label class="field">
            <span class="field-label">计划名称</span>
            <input class="input" data-field="plan-name" value="${esc(draft.name)}" placeholder="例如：上下肢四分化" maxlength="30" />
          </label>
          <div class="field">
            <span class="field-label">计划颜色</span>
            <div class="color-picker">
              ${PLAN_COLORS.map(
                (c) => `<button type="button" class="color-dot${draft.color === c.id ? ' active' : ''}" style="--dot:${c.value}" data-color="${c.id}" aria-label="${c.label}"></button>`,
              ).join('')}
            </div>
          </div>
        </div>
        <label class="field" style="margin-top:14px">
          <span class="field-label">计划说明 <span class="muted" style="font-weight:400">（可选）</span></span>
          <textarea class="textarea" data-field="plan-desc" rows="2" placeholder="训练目标、频率或注意事项…" maxlength="160">${esc(draft.desc || '')}</textarea>
        </label>
      </section>

      <div class="day-tabs">
        ${draft.days
          .map(
            (d, index) => `<button type="button" class="day-tab${d.id === activeDayId ? ' active' : ''}" data-day-index="${index}">
              <b>D${index + 1}</b>${esc(d.name || `训练日 ${index + 1}`)}
            </button>`,
          )
          .join('')}
        <button type="button" class="day-tab add" data-add-day>${icon('plus', 14)} 添加训练日</button>
      </div>

      ${day
        ? `<section class="card" data-editor-day>
            <div class="editor-day-head">
              <span class="day-index">D${draft.days.indexOf(day) + 1}</span>
              <input class="input" data-field="day-name" value="${esc(day.name)}" placeholder="训练日名称" maxlength="30" />
              <div class="day-tools">
                <button type="button" class="icon-btn sm" data-duplicate-day title="复制训练日">${icon('copy', 16)}</button>
                <button type="button" class="icon-btn sm" data-delete-day title="删除训练日">${icon('trash', 16)}</button>
              </div>
            </div>
            <div class="editor-exercises">
              ${
                day.exercises.length
                  ? day.exercises
                      .map((entry, index) => {
                        const def = getExercise(entry.exerciseId);
                        return `<div class="editor-ex" data-ex-index="${index}">
                          ${exerciseGlyph(def?.muscle || 'chest', 'sm')}
                          <div class="editor-ex-main">
                            <strong>${esc(def?.name || entry.exerciseId)}</strong>
                            <span>${esc(def?.equipment || '')} · ${esc(MUSCLES[def?.muscle]?.name || '')}</span>
                          </div>
                          <div class="editor-ex-fields">
                            <div class="mini-field"><label>组数</label><input class="mini-input narrow" type="number" min="1" max="20" inputmode="numeric" data-field="sets" data-ex-index="${index}" value="${esc(entry.sets)}" /></div>
                            <div class="mini-field"><label>次数</label><input class="mini-input wide" type="text" data-field="reps" data-ex-index="${index}" value="${esc(entry.reps)}" placeholder="8-12" /></div>
                            <div class="mini-field"><label>休息s</label><input class="mini-input narrow" type="number" min="0" max="600" step="15" inputmode="numeric" data-field="rest" data-ex-index="${index}" value="${esc(entry.rest)}" /></div>
                          </div>
                          <div class="ex-tools">
                            <button type="button" class="icon-btn sm" data-move-ex="${index}" data-dir="-1" title="上移" ${index === 0 ? 'disabled' : ''}>${icon('arrow-up', 13)}</button>
                            <button type="button" class="icon-btn sm" data-move-ex="${index}" data-dir="1" title="下移" ${index === day.exercises.length - 1 ? 'disabled' : ''}>${icon('arrow-down', 13)}</button>
                            <button type="button" class="icon-btn sm" data-remove-ex="${index}" title="移除">${icon('x', 13)}</button>
                          </div>
                        </div>`;
                      })
                      .join('')
                  : `<div class="editor-empty">这一天还没有动作<br/><span class="muted">从动作库中选择，或先保存再慢慢调整。</span></div>`
              }
              <button type="button" class="add-ex-btn" data-add-exercise>${icon('plus', 15)} 添加动作</button>
            </div>
          </section>`
        : ''}

      <div class="editor-tip">
        ${icon('info', 15)}
        <span>建议每个训练日安排 4–6 个动作。休息时间按动作强度设置：复合动作 120–180 秒，孤立动作 45–90 秒。</span>
      </div>

      <div class="save-bar">
        <button type="button" class="btn btn-ghost" data-editor-back>取消</button>
        <button type="button" class="btn btn-primary" data-editor-save>${icon('check', 16)} 保存计划</button>
      </div>`;
  }

  function normalize() {
    const days = draft.days
      .map((day, index) => ({
        ...day,
        id: day.id || `${draft.id}_d${index + 1}`,
        name: String(day.name || '').trim() || `训练日 ${index + 1}`,
        short: String(day.name || '')
          .split(' · ')[0]
          .trim()
          .slice(0, 6),
        exercises: day.exercises.map((entry) => ({
          ...entry,
          sets: clamp(Math.round(Number(entry.sets) || 3), 1, 20),
          reps: String(entry.reps || '').trim() || '8-12',
          rest: clamp(Math.round(Number(entry.rest) || 0), 0, 900),
        })),
      }))
      .filter((day) => day.exercises.length > 0);
    return {
      ...draft,
      name: String(draft.name || '').trim(),
      desc: String(draft.desc || '').trim(),
      days,
    };
  }

  function doSave() {
    const normalized = normalize();
    if (!normalized.name) {
      showToast('给计划起个名字吧', 'error');
      document.querySelector('[data-field="plan-name"]')?.focus();
      return;
    }
    if (!normalized.days.length) {
      showToast('至少添加一个动作才能保存', 'error');
      return;
    }
    savePlan(normalized);
    if (!isEdit) {
      updateSettings({ activePlanId: normalized.id });
      showToast('计划已创建，开始第一练吧');
    } else {
      showToast('计划已保存');
    }
    ctx.navigate(`/plans/${normalized.id}`);
  }

  async function goBack() {
    if (!dirty) {
      ctx.navigate('/plans');
      return;
    }
    const discard = await confirmDialog({
      title: '放弃修改？',
      message: '当前修改还没有保存，返回后将丢失。',
      confirmText: '放弃修改',
      cancelText: '继续编辑',
      danger: true,
      iconName: 'edit',
    });
    if (discard) ctx.navigate(isEdit ? `/plans/${draft.id}` : '/plans');
  }

  function addExercise(exerciseId) {
    const day = activeDay();
    if (!day) return;
    const def = getExercise(exerciseId);
    if (!def) return;
    const [, hi] = parseRepsRange(def.reps);
    day.exercises.push({
      exerciseId: def.id,
      sets: 3,
      reps: def.reps || '8-12',
      rest: getState().settings.defaultRest || 90,
      note: '',
    });
    dirty = true;
    paint();
  }

  function openExercisePicker() {
    const day = activeDay();
    if (!day) return;
    let selectedMuscle = 'all';
    let search = '';
    let addedCount = 0;
    const added = new Set(day.exercises.map((e) => e.exerciseId));

    const sheetBody = `<div class="picker-search">
      <div class="search-box">
        ${icon('search', 17)}
        <input type="search" placeholder="搜索动作、器械或肌群…" data-picker-search />
      </div>
      <div class="chips scroll" style="margin-top:9px">
        <button type="button" class="chip active" data-picker-muscle="all">全部</button>
        ${BODY_PARTS.map((part) => `<button type="button" class="chip" data-picker-muscle="${part.key}">${esc(part.label)}</button>`).join('')}
      </div>
    </div>
    <div class="picker-list" data-picker-list></div>`;

    openSheet({
      title: '添加到训练日',
      subtitle: day.name,
      size: 'lg',
      body: sheetBody,
      footer: `<button type="button" class="btn btn-primary btn-block" data-sheet-close>完成<span data-picker-count>${addedCount ? ` · 已添加 ${addedCount}` : ''}</span></button>`,
      onMount: (sheet) => {
        const list = sheet.querySelector('[data-picker-list]');
        const countEl = sheet.querySelector('[data-picker-count]');
        bindMediaFallback(sheet);

        const renderList = () => {
          const matches = filterExercises(getExercises(), { search, muscle: selectedMuscle });
          const exercises = matches.slice(0, PICKER_LIMIT);
          const hidden = matches.length - exercises.length;
          list.innerHTML = exercises.length
            ? exercises
                .map(
                  (exercise) => {
                    const english = secondaryName(exercise);
                    return `<button type="button" class="picker-item" data-pick-id="${exercise.id}">
                    ${mediaMarkup(exercise, { className: 'picker-media', animated: false })}
                    <span class="picker-item-info">
                      <strong>${esc(primaryName(exercise))}</strong>
                      <span>${esc(MUSCLES[exercise.muscle]?.name || '')} · ${esc(exercise.equipment)}${exercise.custom ? ' · 自定义' : ''}</span>
                      ${english ? `<span class="picker-item-en">${esc(english)}</span>` : ''}
                    </span>
                    <span class="add-icon">${added.has(exercise.id) ? icon('check', 15) : icon('plus', 15)}</span>
                  </button>`;
                  },
                )
                .join('') +
              (hidden > 0 ? `<p class="picker-more-hint">还有 ${hidden} 个动作，输入关键词缩小范围</p>` : '')
            : `<div class="empty-state" style="padding:30px 10px"><div class="empty-icon">${icon('search', 22)}</div><h3>没有找到动作</h3><p>换个关键词，或到动作库中创建自定义动作。</p></div>`;
          list.querySelectorAll('[data-pick-id]').forEach((button) => {
            button.addEventListener('click', () => {
              addExercise(button.dataset.pickId);
              added.add(button.dataset.pickId);
              addedCount += 1;
              countEl.textContent = ` · 已添加 ${addedCount}`;
              button.querySelector('.add-icon').innerHTML = icon('check', 15);
              button.classList.add('picked');
            });
          });
        };

        sheet.querySelector('[data-picker-search]')?.addEventListener('input', (event) => {
          search = event.target.value.trim();
          renderList();
        });
        sheet.querySelectorAll('[data-picker-muscle]').forEach((chip) => {
          chip.addEventListener('click', () => {
            selectedMuscle = chip.dataset.pickerMuscle;
            sheet.querySelectorAll('[data-picker-muscle]').forEach((c) => c.classList.toggle('active', c === chip));
            renderList();
          });
        });
        renderList();
      },
    });
  }

  return {
    html: '<div id="plan-editor-root"></div>',
    mount(root) {
      paint();
      const beforeUnload = (event) => {
        if (!dirty) return;
        event.preventDefault();
        event.returnValue = '';
      };

      root.addEventListener('click', async (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        if (target.hasAttribute('data-editor-back')) return goBack();
        if (target.hasAttribute('data-editor-save')) return doSave();

        if (target.dataset.color) {
          draft.color = target.dataset.color;
          dirty = true;
          paint();
          return;
        }
        if (target.dataset.dayIndex !== undefined && target.dataset.dayIndex !== '') {
          const index = Number(target.dataset.dayIndex);
          if (draft.days[index]) {
            activeDayId = draft.days[index].id;
            paint();
          }
          return;
        }
        if (target.hasAttribute('data-add-day')) {
          if (draft.days.length >= 7) {
            showToast('最多支持 7 个训练日', 'error');
            return;
          }
          const day = {
            id: `day_${uid('day')}`,
            name: `训练日 ${draft.days.length + 1}`,
            short: `DAY ${draft.days.length + 1}`,
            exercises: [],
          };
          draft.days.push(day);
          activeDayId = day.id;
          dirty = true;
          paint();
          return;
        }
        if (target.hasAttribute('data-duplicate-day')) {
          const day = activeDay();
          const copy = JSON.parse(JSON.stringify(day));
          copy.id = `day_${uid('day')}`;
          copy.name = `${day.name} 副本`;
          copy.short = copy.name.slice(0, 6);
          const index = draft.days.indexOf(day);
          draft.days.splice(index + 1, 0, copy);
          activeDayId = copy.id;
          dirty = true;
          paint();
          return;
        }
        if (target.hasAttribute('data-delete-day')) {
          if (draft.days.length <= 1) {
            showToast('至少保留一个训练日', 'error');
            return;
          }
          const day = activeDay();
          const confirmed = await confirmDialog({
            title: '删除这个训练日？',
            message: `「${esc(day.name)}」中的动作将一起移除。`,
            confirmText: '删除',
            danger: true,
            iconName: 'trash',
          });
          if (confirmed) {
            draft.days = draft.days.filter((d) => d.id !== day.id);
            activeDayId = draft.days[0]?.id;
            dirty = true;
            paint();
          }
          return;
        }
        if (target.hasAttribute('data-add-exercise')) {
          openExercisePicker();
          return;
        }
        if (target.dataset.moveEx !== undefined) {
          const index = Number(target.dataset.moveEx);
          const dir = Number(target.dataset.dir);
          const list = activeDay().exercises;
          const next = index + dir;
          if (next >= 0 && next < list.length) {
            [list[index], list[next]] = [list[next], list[index]];
            dirty = true;
            paint();
          }
          return;
        }
        if (target.dataset.removeEx !== undefined) {
          const index = Number(target.dataset.removeEx);
          activeDay().exercises.splice(index, 1);
          dirty = true;
          paint();
        }
      });

      root.addEventListener('input', (event) => {
        const el = event.target;
        const field = el.dataset.field;
        if (!field) return;
        if (field === 'plan-name') {
          draft.name = el.value;
          dirty = true;
          return;
        }
        if (field === 'plan-desc') {
          draft.desc = el.value;
          dirty = true;
          return;
        }
        if (field === 'day-name') {
          activeDay().name = el.value;
          dirty = true;
          return;
        }
        if (['sets', 'reps', 'rest'].includes(field)) {
          const index = Number(el.dataset.exIndex);
          const entry = activeDay()?.exercises[index];
          if (entry) {
            entry[field] = el.value;
            dirty = true;
          }
        }
      });

      window.addEventListener('beforeunload', beforeUnload);
      return () => window.removeEventListener('beforeunload', beforeUnload);
    },
  };
}
