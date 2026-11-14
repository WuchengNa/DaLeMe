/* 训练进行中 */
import { BODY_PARTS, FEEL_LEVELS, MUSCLES, feelInfo } from '../data.js';
import {
  filterExercises, mediaMarkup, primaryName, secondaryName,
  bindMediaFallback, PICKER_LIMIT,
} from '../exercise-utils.js';
import {
  activeElapsedSeconds,
  discardActiveWorkout,
  finishActiveWorkout,
  getActiveWorkout,
  getExercise,
  getExercises,
  getLastPerformance,
  getState,
  getWorkoutPRs,
  pauseActiveWorkout,
  resumeActiveWorkout,
  saveState,
  updateSettings,
  workoutStats,
} from '../store.js';
import {
  actionSheet,
  confirmDialog,
  exerciseGlyph,
  icon,
  openSheet,
  showToast,
} from '../ui.js';
import {
  clamp,
  esc,
  fmtDuration,
  fmtVolume,
  pad,
  parseRepsRange,
  uid,
} from '../utils.js';

/* 音频上下文在模块里复用：手机上每次新建 AudioContext 容易超出上限，
 * 而且必须在用户手势里创建 / resume 才能可靠发声。 */
let audioCtx = null;

export default function workoutView(ctx) {
  const active = getActiveWorkout();
  if (!active) {
    return {
      html: `<div class="workout-page"><div class="card workout-empty">${icon('dumbbell', 30)}<h2>没有进行中的训练</h2><p>从今日建议或训练计划开始一场训练。</p><a class="btn btn-primary" href="#/">返回首页</a></div></div>`,
    };
  }

  let timerInterval = null;
  let finished = false;
  let restAlertEl = null;
  let restAlertTimer = null;
  let restTitleTimer = null;
  let lastTickSecond = null;
  let wakeLock = null;

  const paused = () => Boolean(active.pausedAt);

  function calculate() {
    const stats = workoutStats(active);
    const totalSets = active.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
    const doneSets = active.exercises.reduce(
      (acc, ex) => acc + ex.sets.filter((s) => s.done && s.type !== 'warmup').length,
      0,
    );
    return { ...stats, totalSets, doneSets };
  }

  function elapsedSeconds() {
    return activeElapsedSeconds(active);
  }

  function pausedSeconds() {
    if (!active.pausedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(active.pausedAt).getTime()) / 1000));
  }

  function restLeft(rest) {
    if (!rest) return 0;
    if (rest.endAt) {
      return Math.max(0, Math.ceil((new Date(rest.endAt).getTime() - Date.now()) / 1000));
    }
    if (Number.isFinite(Number(rest.remainingMs))) {
      return Math.max(0, Math.ceil(Number(rest.remainingMs) / 1000));
    }
    return 0;
  }

  function paint() {
    const root = document.getElementById('workout-root');
    if (!root) return;
    blurInside(root);
    const stats = calculate();
    const progress = stats.totalSets ? stats.doneSets / stats.totalSets : 0;
    const isPaused = paused();
    const rest = isPaused ? null : active.rest;

    root.innerHTML = `
      <div class="workout-head">
        <button type="button" class="icon-btn" data-workout-back aria-label="最小化">${icon('arrow-left', 20)}</button>
        <div class="workout-head-main">
          <h1>${esc(active.dayName)}</h1>
          <p>${
            isPaused
              ? `<span class="live-dot paused"></span>已暂停 · 计时已冻结`
              : `<span class="live-dot"></span>训练中 · ${esc(active.planName)}`
          }</p>
        </div>
        <div class="workout-clock" title="训练净时长">${icon('timer', 15)}<span id="workout-clock">${clockLong(elapsedSeconds())}</span></div>
        <button type="button" class="icon-btn workout-pause-btn${isPaused ? ' paused' : ''}" data-workout-pause aria-label="${isPaused ? '继续训练' : '暂停训练'}" title="${isPaused ? '继续训练' : '暂停训练'}">
          ${icon(isPaused ? 'play' : 'pause', 18)}
        </button>
        <button type="button" class="icon-btn" data-workout-menu aria-label="训练菜单">${icon('more', 20)}</button>
      </div>

      <div class="workout-overview">
        <div class="overview-bar">
          <div class="overview-bar-top"><span>已完成 <b>${stats.doneSets}</b> / ${stats.totalSets} 组</span><span>${Math.round(progress * 100)}%</span></div>
          <div class="overview-track"><i style="width:${Math.round(progress * 100)}%"></i></div>
        </div>
        <div class="overview-volume"><strong>${fmtVolume(stats.volume)}</strong><span>当前容量</span></div>
      </div>

      ${active.exercises
        .map((exercise, exerciseIndex) => {
          const last = getLastPerformance(exercise.exerciseId);
          const lastWorking = (last?.sets || []).filter((s) => s.type !== 'warmup');
          const lastText = lastWorking.length
            ? `上次 ${Number(lastWorking[0].weight) > 0 ? `${lastWorking[0].weight}kg` : '自重'} × ${lastWorking[0].reps}`
            : '首次记录';
          return `<section class="workout-exercise card" data-exercise="${exerciseIndex}">
            <header class="exercise-card-head">
              <span class="exercise-index">${pad(exerciseIndex + 1)}</span>
              ${exerciseGlyph(exercise.muscle, 'sm')}
              <div class="exercise-card-title">
                <h3>${esc(exercise.name)}</h3>
                <p>${esc(MUSCLES[exercise.muscle]?.name || '')}<span class="dot-sep"></span>${exercise.sets.length} 组 · 休息 ${exercise.rest}s<span class="dot-sep"></span>${esc(lastText)}</p>
              </div>
              <button type="button" class="icon-btn" data-ex-menu="${exerciseIndex}" aria-label="动作菜单">${icon('more', 17)}</button>
            </header>
            ${exercise.note ? `<div class="exercise-note">${icon('note', 13)}<span>${esc(exercise.note)}</span></div>` : ''}
            <div class="set-table">
              <div class="set-head"><span>组</span><span>重量 kg</span><span>次数</span><span>RPE</span><span></span></div>
              ${exercise.sets
                .map(
                  (set, setIndex) => `<div class="set-row${set.done ? ' done' : ''}" data-set-row="${exerciseIndex}-${setIndex}">
                    <span class="set-number${set.type === 'warmup' ? ' warmup' : ''}">${set.type === 'warmup' ? 'W' : setIndex + 1}</span>
                    <input class="set-input" type="number" inputmode="decimal" min="0" step="0.5" enterkeyhint="done"
                      placeholder="${exercise.equipment === '自重' || exercise.muscle === 'cardio' ? '自重' : '0'}"
                      value="${esc(set.weight)}" data-set-field="weight" data-ex="${exerciseIndex}" data-set="${setIndex}" aria-label="第 ${setIndex + 1} 组重量" />
                    <input class="set-input" type="number" inputmode="numeric" min="0" step="1" enterkeyhint="done"
                      placeholder="次数" value="${esc(set.reps)}" data-set-field="reps" data-ex="${exerciseIndex}" data-set="${setIndex}" aria-label="第 ${setIndex + 1} 组次数" />
                    <input class="set-rpe" type="number" inputmode="decimal" min="1" max="10" step="0.5"
                      placeholder="—" value="${esc(set.rpe || '')}" data-set-field="rpe" data-ex="${exerciseIndex}" data-set="${setIndex}" aria-label="第 ${setIndex + 1} 组 RPE" />
                    <button type="button" class="set-check${set.done ? ' checked' : ''}" data-toggle-set="${exerciseIndex}-${setIndex}" aria-label="${set.done ? '取消完成' : '完成这一组'}" aria-pressed="${set.done}">
                      ${icon('check', 17)}
                    </button>
                  </div>`,
                )
                .join('')}
              <div class="set-actions">
                <button type="button" class="set-add" data-add-set="${exerciseIndex}">${icon('plus', 13)} 加一组</button>
                <span class="set-hint">组间休息 ${exercise.rest}s</span>
                ${exercise.sets.length > 1 ? `<button type="button" class="set-add set-remove" data-remove-set="${exerciseIndex}">删除末组</button>` : ''}
              </div>
            </div>
            ${feelBar(exercise, exerciseIndex)}
          </section>`;
        })
        .join('')}

      <button type="button" class="workout-add-ex" data-add-exercise>${icon('plus', 17)} 添加动作</button>

      <div class="workout-foot">
        <button type="button" class="btn btn-ghost" data-workout-pause>${icon(isPaused ? 'play' : 'pause', 17)} ${isPaused ? '继续训练' : '暂停一下'}</button>
        <button type="button" class="btn btn-primary btn-lg" data-finish>${icon('check', 18)} 完成训练</button>
      </div>

      ${rest ? restDock(rest) : ''}
      ${isPaused ? pauseOverlay() : ''}
    </div>`;

    if (rest) updateRestDom();
    document.body.classList.toggle('resting', Boolean(rest));
  }

  function feelBar(exercise, exerciseIndex) {
    const info = feelInfo(exercise.feel);
    return `<button type="button" class="exercise-feel${info ? ' has' : ''}" data-ex-feel="${exerciseIndex}">
      <span class="feel-caption">${icon('heart', 13)} 动作感受</span>
      ${
        info
          ? `<span class="feel-tag" style="--feel:${info.color};--feel-soft:${info.soft}"><i></i>${info.label}</span>`
          : '<span class="feel-tag empty">还没记录</span>'
      }
      ${exercise.feelNote ? `<span class="feel-quote">${esc(exercise.feelNote)}</span>` : ''}
      <span class="feel-edit">${info ? '修改' : '记录'}${icon('chevron-right', 13)}</span>
    </button>`;
  }

  function pauseOverlay() {
    return `<div class="pause-overlay" role="dialog" aria-modal="true" aria-label="训练已暂停">
      <div class="pause-card">
        <span class="pause-glyph">${icon('pause', 30)}</span>
        <h2>训练已暂停</h2>
        <p>计时和组间休息都已冻结，慢慢来。</p>
        <div class="pause-stats">
          <div><strong id="pause-clock">${fmtClock(pausedSeconds())}</strong><span>本次暂停</span></div>
          <div><strong>${clockLong(elapsedSeconds())}</strong><span>训练净时长</span></div>
        </div>
        <button type="button" class="btn btn-primary btn-lg btn-block" data-workout-resume>${icon('play', 18)} 继续训练</button>
        <div class="pause-links">
          <button type="button" data-finish>结束训练</button>
          <span class="dot-sep"></span>
          <button type="button" data-workout-menu>更多操作</button>
        </div>
      </div>
    </div>`;
  }

  function restDock(rest) {
    const total = Math.max(1, Number(rest.duration) || 1);
    const left = restLeft(rest);
    const pct = clamp(left / total, 0, 1);
    const circumference = 2 * Math.PI * 19;
    return `<div class="rest-dock${left <= 10 ? ' urgent' : ''}" id="rest-dock">
      <div class="rest-ring">
        <svg width="46" height="46" viewBox="0 0 46 46">
          <circle cx="23" cy="23" r="19" fill="none" stroke="var(--line)" stroke-width="3.5"/>
          <circle id="rest-circle" cx="23" cy="23" r="19" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round"
            stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - pct)}" transform="rotate(-90 23 23)"/>
        </svg>
        <span class="rest-time" id="rest-time">${fmtClock(left)}</span>
      </div>
      <div class="rest-info">
        <strong>组间休息</strong>
        <span>${esc(rest.label || '下一组准备')}</span>
      </div>
      <div class="rest-actions">
        <button type="button" class="btn btn-ghost" data-rest-add>+15s</button>
        <button type="button" class="btn btn-ghost" data-rest-skip>跳过</button>
      </div>
    </div>`;
  }

  function updateRestDom() {
    const rest = active.rest;
    if (!rest) return;
    const total = Math.max(1, Number(rest.duration) || 1);
    const left = restLeft(rest);
    const pct = clamp(left / total, 0, 1);
    const circle = document.getElementById('rest-circle');
    const timeEl = document.getElementById('rest-time');
    if (circle) {
      const circumference = 2 * Math.PI * 19;
      circle.setAttribute('stroke-dashoffset', String(circumference * (1 - pct)));
    }
    if (timeEl) timeEl.textContent = fmtClock(left);
    document.getElementById('rest-dock')?.classList.toggle('urgent', left <= 10);
  }

  function tick() {
    const clock = document.getElementById('workout-clock');
    if (clock) clock.textContent = clockLong(elapsedSeconds());

    if (paused()) {
      const pausedEl = document.getElementById('pause-clock');
      if (pausedEl) pausedEl.textContent = fmtClock(pausedSeconds());
      updateTitle();
      return;
    }

    const rest = active.rest;
    if (rest) {
      const left = restLeft(rest);
      if (left <= 0) {
        completeRest(rest);
      } else {
        updateRestDom();
        if (left <= 3 && lastTickSecond !== left) {
          lastTickSecond = left;
          playCountdownTick();
        }
      }
    } else {
      lastTickSecond = null;
    }
    updateTitle();
  }

  function updateTitle() {
    if (restAlertEl) return;
    const rest = active.rest;
    document.title = paused()
      ? `已暂停 ${clockLong(elapsedSeconds())} · 大了么`
      : rest
        ? `休息 ${fmtClock(restLeft(rest))} · 大了么`
        : `训练中 ${clockLong(elapsedSeconds())} · 大了么`;
  }

  function startRest(exercise, setIndex) {
    if (!Number(exercise.rest)) return;
    active.rest = {
      endAt: new Date(Date.now() + Number(exercise.rest) * 1000).toISOString(),
      duration: Number(exercise.rest),
      label: `${exercise.name} · 第 ${setIndex + 1} 组完成`,
    };
    lastTickSecond = null;
    saveState();
  }

  function completeRest(rest) {
    active.rest = null;
    lastTickSecond = null;
    saveState();
    paint();
    playRestDoneSound();
    buzzRestDone();
    showRestAlert(rest);
  }

  /* ---------- 休息结束的强提示：画面 + 声音 + 震动 + 标题闪烁 ---------- */

  function showRestAlert(rest) {
    const host = document.getElementById('workout-root');
    if (!host || finished) return;
    dismissRestAlert(true);
    const el = document.createElement('div');
    el.className = 'rest-alert';
    el.innerHTML = `<div class="rest-alert-flash" aria-hidden="true"></div>
      <div class="rest-alert-card" role="alertdialog" aria-label="休息结束">
        <span class="rest-alert-glyph">${icon('bell', 30)}</span>
        <h2>休息结束</h2>
        <p>${esc(rest?.label || '准备下一组')}</p>
        <button type="button" class="btn btn-primary btn-lg" data-dismiss-rest>${icon('play', 17)} 开始下一组</button>
        <span class="rest-alert-hint">轻触任意位置关闭</span>
      </div>`;
    host.appendChild(el);
    restAlertEl = el;
    requestAnimationFrame(() => el.classList.add('show'));
    el.addEventListener('click', () => dismissRestAlert());
    restAlertTimer = setTimeout(() => dismissRestAlert(), 6500);
    startTitleFlash();
  }

  function dismissRestAlert(silent = false) {
    clearTimeout(restAlertTimer);
    restAlertTimer = null;
    stopTitleFlash();
    const el = restAlertEl;
    restAlertEl = null;
    if (el) {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 260);
    }
    if (!silent) updateTitle();
  }

  function startTitleFlash() {
    stopTitleFlash();
    let flip = false;
    restTitleTimer = setInterval(() => {
      document.title = flip ? '休息结束，开始下一组 · 大了么' : '该下一组了 · 大了么';
      flip = !flip;
    }, 800);
  }

  function stopTitleFlash() {
    if (restTitleTimer) clearInterval(restTitleTimer);
    restTitleTimer = null;
  }

  function pauseWorkout() {
    if (paused()) return;
    pauseActiveWorkout();
    lastTickSecond = null;
    releaseWakeLock();
    paint();
    showToast('训练已暂停，计时停止', 'info');
  }

  function resumeWorkout() {
    if (!paused()) return;
    resumeActiveWorkout();
    lastTickSecond = null;
    requestWakeLock();
    ensureAudio();
    paint();
  }

  function toggleSet(exerciseIndex, setIndex) {
    const exercise = active.exercises[exerciseIndex];
    const set = exercise?.sets[setIndex];
    if (!exercise || !set || paused()) return;
    if (!set.done) {
      if (!String(set.reps ?? '').trim()) {
        showToast('先填写这一组的次数', 'error');
        const input = document.querySelector(
          `input[data-set-field="reps"][data-ex="${exerciseIndex}"][data-set="${setIndex}"]`,
        );
        input?.focus();
        return;
      }
      set.done = true;
      saveState();
      startRest(exercise, setIndex);
      paint();

      const working = exercise.sets.filter((s) => s.type !== 'warmup');
      const allDone = working.length > 0 && working.every((s) => s.done);
      if (allDone && !exercise.feel) {
        setTimeout(() => {
          if (finished || paused()) return;
          if (active.exercises[exerciseIndex] !== exercise) return;
          if (!exercise.sets.filter((s) => s.type !== 'warmup').every((s) => s.done)) return;
          openFeelSheet(exerciseIndex, { auto: true });
        }, 340);
      }
    } else {
      set.done = false;
      active.rest = null;
      lastTickSecond = null;
      saveState();
      paint();
    }
  }

  function addSet(exerciseIndex) {
    const exercise = active.exercises[exerciseIndex];
    if (!exercise) return;
    const previous = exercise.sets[exercise.sets.length - 1];
    exercise.sets.push({
      id: uid('set'),
      weight: previous?.weight || '',
      reps: previous?.reps || '',
      rpe: '',
      done: false,
      type: 'normal',
    });
    saveState();
    paint();
    const inputs = document.querySelectorAll(
      `input[data-set-field="weight"][data-ex="${exerciseIndex}"]`,
    );
    inputs[inputs.length - 1]?.focus();
  }

  async function removeLastSet(exerciseIndex) {
    const exercise = active.exercises[exerciseIndex];
    if (!exercise || exercise.sets.length <= 1) return;
    const last = exercise.sets[exercise.sets.length - 1];
    if (last?.done) {
      const confirmed = await confirmDialog({
        title: '删除末组？',
        message: `「${esc(exercise.name)}」最后一组已经完成，删除后需要重新填写。`,
        confirmText: '删除这组',
        danger: true,
        iconName: 'trash',
      });
      if (!confirmed) return;
    }
    const current = active.exercises[exerciseIndex];
    if (!current || current.sets.length <= 1) return;
    current.sets.pop();
    saveState();
    paint();
  }

  /* ---------- 动作感受 ---------- */

  function openFeelSheet(exerciseIndex, { auto = false } = {}) {
    const exercise = active.exercises[exerciseIndex];
    if (!exercise) return;
    let selected = exercise.feel || '';
    const doneSets = exercise.sets.filter((s) => s.done && s.type !== 'warmup').length;

    openSheet({
      title: auto ? '这个动作练完了' : '记录动作感受',
      subtitle: `${exercise.name} · ${doneSets} 组完成`,
      size: 'sm',
      className: 'feel-sheet',
      autoFocus: false,
      body: `<div class="feel-grid">
        ${FEEL_LEVELS.map(
          (level) => `<button type="button" class="feel-option${selected === level.id ? ' active' : ''}" data-feel="${level.id}"
            style="--feel:${level.color};--feel-soft:${level.soft}">
            <i></i><strong>${level.label}</strong><span>${level.hint}</span>
          </button>`,
        ).join('')}
      </div>
      <label class="field" style="margin-top:14px">
        <span class="field-label">自定义感受 <span class="muted" style="font-weight:400">（可选）</span></span>
        <textarea class="textarea" data-feel-note rows="2" placeholder="例如：左肩有点紧，下次减 2.5kg；节奏很稳，可以加重">${esc(exercise.feelNote || '')}</textarea>
      </label>`,
      footer: `<div class="btn-row">
        <button type="button" class="btn btn-ghost" data-feel-skip>${auto ? '先跳过' : '取消'}</button>
        <button type="button" class="btn btn-primary" data-feel-save>保存感受</button>
      </div>`,
      onMount: (sheet, close) => {
        const options = [...sheet.querySelectorAll('[data-feel]')];
        options.forEach((button) => {
          button.addEventListener('click', () => {
            selected = selected === button.dataset.feel ? '' : button.dataset.feel;
            options.forEach((item) => item.classList.toggle('active', item.dataset.feel === selected));
            ensureAudio();
          });
        });
        sheet.querySelector('[data-feel-save]').addEventListener('click', () => {
          exercise.feel = selected;
          exercise.feelNote = sheet.querySelector('[data-feel-note]').value.trim();
          saveState();
          close();
          paint();
          const info = feelInfo(selected);
          showToast(info ? `已记录：${info.label}` : '已保存这个动作的感受');
        });
        sheet.querySelector('[data-feel-skip]').addEventListener('click', close);
      },
    });
  }

  function openExerciseMenu(exerciseIndex) {
    const exercise = active.exercises[exerciseIndex];
    if (!exercise) return;
    actionSheet(exercise.name, [
      {
        label: exercise.feel ? '修改动作感受' : '记录动作感受',
        icon: 'heart',
        onClick: () => openFeelSheet(exerciseIndex),
      },
      {
        label: '编辑动作备注',
        icon: 'note',
        onClick: () => openNoteEditor(exerciseIndex),
      },
      ...(exerciseIndex > 0
        ? [
            {
              label: '上移动作',
              icon: 'arrow-up',
              onClick: () => {
                active.exercises.splice(exerciseIndex - 1, 0, active.exercises.splice(exerciseIndex, 1)[0]);
                saveState();
                paint();
              },
            },
          ]
        : []),
      ...(exerciseIndex < active.exercises.length - 1
        ? [
            {
              label: '下移动作',
              icon: 'arrow-down',
              onClick: () => {
                active.exercises.splice(exerciseIndex + 1, 0, active.exercises.splice(exerciseIndex, 1)[0]);
                saveState();
                paint();
              },
            },
          ]
        : []),
      {
        label: '移除这个动作',
        icon: 'trash',
        danger: true,
        onClick: async () => {
          const done = exercise.sets.some((s) => s.done);
          const confirmed = await confirmDialog({
            title: '移除这个动作？',
            message: done ? '这个动作中已完成的组也会一起移除。' : `从本次训练中移除「${esc(exercise.name)}」。`,
            confirmText: '移除',
            danger: true,
            iconName: 'trash',
          });
          if (confirmed) {
            const index = active.exercises.indexOf(exercise);
            if (index >= 0) active.exercises.splice(index, 1);
            saveState();
            paint();
          }
        },
      },
    ], `${exercise.sets.length} 组 · 休息 ${exercise.rest}s`);
  }

  function openNoteEditor(exerciseIndex) {
    const exercise = active.exercises[exerciseIndex];
    openSheet({
      title: '动作备注',
      subtitle: exercise.name,
      size: 'sm',
      body: `<label class="field"><span class="field-label">这次训练的感受或提示</span>
        <textarea class="textarea" data-note-input placeholder="例如：肩胛收紧，最后一组力竭…">${esc(exercise.note || '')}</textarea>
      </label>`,
      footer: `<div class="btn-row"><button type="button" class="btn btn-ghost" data-sheet-close>取消</button><button type="button" class="btn btn-primary" data-save-note>保存备注</button></div>`,
      onMount: (sheet, close) => {
        sheet.querySelector('[data-save-note]').addEventListener('click', () => {
          exercise.note = sheet.querySelector('[data-note-input]').value.trim();
          saveState();
          close();
          paint();
        });
      },
    });
  }

  function openExercisePicker() {
    let search = '';
    let selectedMuscle = 'all';
    const added = new Set();

    openSheet({
      title: '添加动作',
      subtitle: active.dayName,
      size: 'lg',
      body: `<div class="picker-search">
        <div class="search-box">${icon('search', 17)}<input type="search" placeholder="搜索动作、器械或肌群…" data-picker-search /></div>
        <div class="chips scroll" style="margin-top:9px">
          <button type="button" class="chip active" data-picker-muscle="all">全部</button>
          ${BODY_PARTS.map((part) => `<button type="button" class="chip" data-picker-muscle="${part.key}">${esc(part.label)}</button>`).join('')}
        </div>
      </div>
      <div class="picker-list" data-picker-list></div>`,
      footer: `<button type="button" class="btn btn-primary btn-block" data-sheet-close>完成<span data-picker-count></span></button>`,
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
                    <span class="picker-item-info"><strong>${esc(primaryName(exercise))}</strong><span>${esc(MUSCLES[exercise.muscle]?.name || '')} · ${esc(exercise.equipment)}</span>${english ? `<span class="picker-item-en">${esc(english)}</span>` : ''}</span>
                    <span class="add-icon">${icon('plus', 15)}</span>
                  </button>`;
                  },
                )
                .join('') +
              (hidden > 0 ? `<p class="picker-more-hint">还有 ${hidden} 个动作，输入关键词缩小范围</p>` : '')
            : `<div class="empty-state" style="padding:30px 10px"><div class="empty-icon">${icon('search', 22)}</div><h3>没有找到动作</h3><p>换个关键词试试。</p></div>`;
          list.querySelectorAll('[data-pick-id]').forEach((button) => {
            button.addEventListener('click', () => {
              addExerciseFromPicker(button.dataset.pickId);
              added.add(button.dataset.pickId);
              countEl.textContent = ` · 已添加 ${added.size}`;
              button.querySelector('.add-icon').innerHTML = icon('check', 15);
            });
          });
        };
        sheet.querySelector('[data-picker-search]').addEventListener('input', (event) => {
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

  function addExerciseFromPicker(exerciseId) {
    const def = getExercise(exerciseId);
    if (!def) return;
    const last = getLastPerformance(def.id);
    const lastWorking = (last?.sets || []).filter((s) => s.type !== 'warmup');
    const [, hi] = parseRepsRange(def.reps);
    const sets = Array.from({ length: 3 }, (_, index) => {
      const previous = lastWorking[index] || lastWorking[lastWorking.length - 1];
      return {
        id: uid('set'),
        weight: previous && Number(previous.weight) > 0 ? String(previous.weight) : '',
        reps: previous?.reps ? String(previous.reps) : String(hi || 10),
        rpe: '',
        done: false,
        type: 'normal',
      };
    });
    active.exercises.push({
      exerciseId: def.id,
      name: primaryName(def),
      muscle: def.muscle,
      equipment: def.equipment,
      rest: 90,
      note: '',
      targetSets: 3,
      targetReps: def.reps || '8-12',
      sets,
      feel: '',
      feelNote: '',
    });
    saveState();
    paint();
    showToast(`已添加：${primaryName(def)}`);
  }

  async function finishWorkout() {
    const stats = calculate();
    if (!stats.doneSets) {
      showToast('至少完成一组再结束训练', 'error');
      return;
    }
    const now = new Date();
    const preview = {
      ...active,
      finishedAt: now.toISOString(),
      durationSec: Math.max(60, elapsedSeconds()),
      totalVolume: stats.volume,
      totalSets: stats.doneSets,
    };
    const prs = getWorkoutPRs(preview);

    openSheet({
      title: '',
      size: 'md',
      className: 'finish-sheet',
      body: `<div class="finish-head">
        <div class="finish-badge">${icon('check', 28)}</div>
        <h2>训练完成</h2>
        <p>${esc(active.dayName)} · ${fmtDuration(preview.durationSec)}</p>
        </div>
        <div class="finish-stats">
          <div class="finish-stat"><strong>${stats.volume > 0 ? fmtVolume(stats.volume) : '自重'}</strong><span>训练容量</span></div>
          <div class="finish-stat"><strong>${stats.doneSets}</strong><span>完成组数</span></div>
          <div class="finish-stat"><strong>${stats.reps}</strong><span>总次数</span></div>
        </div>
        ${prs.length
          ? `<div class="pr-list">
              ${prs
                .slice(0, 4)
                .map(
                  (pr) => `<div class="pr-item">${icon('trophy', 14)}<span>${esc(pr.name)}</span><b>${pr.isFirst ? '首次记录' : '新 PR'}</b><span>${Number(pr.weight) > 0 ? `${pr.weight}kg × ${pr.reps}` : `${pr.reps} 次`}</span></div>`,
                )
                .join('')}
            </div>`
          : ''}
        <label class="field"><span class="field-label">训练感受 <span class="muted" style="font-weight:400">（可选）</span></span>
          <textarea class="textarea" data-finish-note placeholder="今天的状态、动作感受、下次调整…">${esc(active.notes || '')}</textarea>
        </label>`,
      footer: `<div class="btn-row">
        <button type="button" class="btn btn-ghost" data-sheet-close>继续练</button>
        <button type="button" class="btn btn-primary" data-save-workout>${icon('check', 16)} 保存训练</button>
      </div>
      <button type="button" class="btn btn-ghost btn-block finish-share-btn" data-save-share>${icon('share', 16)} 保存并生成分享长图</button>`,
      onMount: (sheet, close) => {
        const save = (withShare) => {
          if (finished) return;
          finished = true;
          const notes = sheet.querySelector('[data-finish-note]').value;
          const workout = finishActiveWorkout(notes);
          close();
          if (workout) {
            showToast('训练已保存，干得漂亮');
            ctx.navigate(`/history/${workout.id}${withShare ? '?share=1' : '?saved=1'}`);
          }
        };
        sheet.querySelector('[data-save-workout]').addEventListener('click', () => save(false));
        sheet.querySelector('[data-save-share]').addEventListener('click', () => save(true));
      },
    });
  }

  function openWorkoutMenu() {
    const soundOn = getState().settings.restSound !== false;
    actionSheet('训练菜单', [
      paused()
        ? { label: '继续训练', icon: 'play', onClick: resumeWorkout }
        : { label: '暂停训练', icon: 'pause', onClick: pauseWorkout },
      { label: '添加动作', icon: 'plus', onClick: openExercisePicker },
      {
        label: `休息提示音：${soundOn ? '已开启' : '已关闭'}`,
        icon: soundOn ? 'volume-on' : 'volume-off',
        onClick: () => {
          updateSettings({ restSound: !soundOn });
          showToast(soundOn ? '休息提示音已关闭' : '休息提示音已开启', 'info');
          if (!soundOn) {
            ensureAudio();
            playCountdownTick();
          }
        },
      },
      { label: '完成训练', icon: 'check', onClick: finishWorkout },
      {
        label: '放弃本次训练',
        icon: 'trash',
        danger: true,
        onClick: async () => {
          const confirmed = await confirmDialog({
            title: '放弃本次训练？',
            message: '本次已记录的内容不会被保存，操作不可撤销。',
            confirmText: '放弃训练',
            danger: true,
            iconName: 'trash',
          });
          if (confirmed) {
            discardActiveWorkout();
            showToast('已放弃本次训练', 'info');
            ctx.navigate('/');
          }
        },
      },
    ], `${active.planName} · ${active.dayName}${paused() ? ' · 暂停中' : ''}`);
  }

  return {
    html: '<div class="workout-page" id="workout-root"></div>',
    mount(root) {
      const controller = new AbortController();
      const { signal } = controller;

      paint();
      tick();
      timerInterval = setInterval(tick, 500);

      /* 首次触摸就把音频上下文准备好，休息结束才不会被浏览器静音拦截 */
      const primeAudio = () => ensureAudio();
      document.addEventListener('pointerdown', primeAudio, { once: true, signal });
      document.addEventListener('touchstart', primeAudio, { once: true, signal, passive: true });

      const onPageHide = () => saveState();
      window.addEventListener('pagehide', onPageHide, { signal });

      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          ensureAudio();
          /* 切回前台时浏览器可能已经释放了屏幕常亮，重新申请 */
          if (!paused()) requestWakeLock();
          tick();
        }
      };
      document.addEventListener('visibilitychange', onVisible, { signal });

      requestWakeLock();

      root.addEventListener('click', (event) => {
        ensureAudio();
        const button = event.target.closest('button');
        if (!button) return;
        if (button.hasAttribute('data-workout-back')) {
          if (paused()) {
            showToast('训练暂停中，先继续再离开', 'info');
            return;
          }
          ctx.navigate('/');
          showToast('已回到首页，训练计时仍在继续', 'info');
          return;
        }
        if (button.hasAttribute('data-workout-pause')) {
          paused() ? resumeWorkout() : pauseWorkout();
          return;
        }
        if (button.hasAttribute('data-workout-resume')) return resumeWorkout();
        if (button.hasAttribute('data-workout-menu')) return openWorkoutMenu();
        if (button.hasAttribute('data-add-exercise')) return openExercisePicker();
        if (button.hasAttribute('data-finish')) return finishWorkout();
        if (button.hasAttribute('data-add-set')) return addSet(Number(button.dataset.addSet));
        if (button.hasAttribute('data-remove-set')) return removeLastSet(Number(button.dataset.removeSet));
        if (button.hasAttribute('data-ex-menu')) return openExerciseMenu(Number(button.dataset.exMenu));
        if (button.hasAttribute('data-ex-feel')) return openFeelSheet(Number(button.dataset.exFeel));
        if (button.dataset.toggleSet) {
          const [exerciseIndex, setIndex] = button.dataset.toggleSet.split('-').map(Number);
          return toggleSet(exerciseIndex, setIndex);
        }
        if (button.hasAttribute('data-rest-add')) {
          if (active.rest) {
            const base = active.rest.endAt ? new Date(active.rest.endAt).getTime() : Date.now() + restLeft(active.rest) * 1000;
            active.rest.endAt = new Date(base + 15000).toISOString();
            active.rest.duration += 15;
            saveState();
            updateRestDom();
          }
          return;
        }
        if (button.hasAttribute('data-rest-skip')) {
          stopRest();
        }
      }, { signal });

      root.addEventListener('input', (event) => {
        const input = event.target.closest('[data-set-field]');
        if (!input) return;
        const exerciseIndex = Number(input.dataset.ex);
        const setIndex = Number(input.dataset.set);
        const field = input.dataset.setField;
        const set = active.exercises[exerciseIndex]?.sets[setIndex];
        if (!set) return;
        set[field] = input.value;
        saveState();
      }, { signal });

      root.addEventListener('change', (event) => {
        const input = event.target.closest('[data-set-field]');
        if (!input) return;
        /* 有些安卓输入法只在收起键盘时才提交最终值 */
        const exerciseIndex = Number(input.dataset.ex);
        const setIndex = Number(input.dataset.set);
        const set = active.exercises[exerciseIndex]?.sets[setIndex];
        if (!set) return;
        set[input.dataset.setField] = input.value;
        saveState();
      }, { signal });

      root.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const input = event.target.closest('[data-set-field]');
        if (!input) return;
        event.preventDefault();
        const exerciseIndex = Number(input.dataset.ex);
        const setIndex = Number(input.dataset.set);
        /* 先失焦再重绘：iOS Safari 在输入框被移除时会把页面卡在放大状态 */
        input.blur();
        setTimeout(() => toggleSet(exerciseIndex, setIndex), 0);
      }, { signal });

      function stopRest() {
        active.rest = null;
        lastTickSecond = null;
        saveState();
        paint();
      }

      return () => {
        controller.abort();
        clearInterval(timerInterval);
        clearTimeout(restAlertTimer);
        stopTitleFlash();
        dismissRestAlert(true);
        document.body.classList.remove('resting');
        releaseWakeLock();
        saveState();
        document.title = '训练记录 · 大了么';
      };
    },
  };

  function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    navigator.wakeLock
      .request('screen')
      .then((lock) => {
        wakeLock = lock;
        lock.addEventListener?.('release', () => {
          wakeLock = null;
        });
      })
      .catch(() => {});
  }

  function releaseWakeLock() {
    try {
      wakeLock?.release?.();
    } catch (error) {
      /* 忽略 */
    }
    wakeLock = null;
  }
}

function blurInside(container) {
  const el = document.activeElement;
  if (!el || el === document.body) return;
  if (!container.contains(el)) return;
  if (el.matches('input, textarea, select')) el.blur();
}

function clockLong(seconds) {
  const sec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function fmtClock(seconds) {
  const sec = Math.max(0, Math.ceil(seconds));
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
}

/* ---------------- 提示音 ---------------- */

function ensureAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume?.().catch?.(() => {});
    return audioCtx;
  } catch (error) {
    return null;
  }
}

function soundEnabled() {
  return getState().settings.restSound !== false;
}

function tone(audio, freq, at, duration, peak, type = 'sine') {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.03);
}

function playRestDoneSound() {
  if (!soundEnabled()) return;
  const audio = ensureAudio();
  if (!audio) return;
  const start = audio.currentTime + 0.02;
  const notes = [783.99, 987.77, 1318.51];
  [0, 0.52].forEach((offset) => {
    notes.forEach((freq, index) => {
      tone(audio, freq, start + offset + index * 0.13, 0.34, 0.22, 'triangle');
    });
  });
}

function playCountdownTick() {
  if (!soundEnabled()) return;
  const audio = ensureAudio();
  if (!audio) return;
  tone(audio, 1046.5, audio.currentTime + 0.01, 0.08, 0.08, 'sine');
}

function buzzRestDone() {
  try {
    navigator.vibrate?.([140, 70, 140, 70, 320]);
  } catch (error) {
    /* 静音 / 不支持时忽略 */
  }
}
