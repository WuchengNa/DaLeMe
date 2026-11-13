/* 训练计划列表与详情 */
import { PLAN_COLORS } from '../data.js';
import {
  deletePlan,
  duplicatePlan,
  estimatedPlanDuration,
  getActiveWorkout,
  getExercise,
  getPlan,
  getState,
  getWorkouts,
  planStats,
  startWorkout,
  updateSettings,
} from '../store.js';
import {
  actionSheet,
  confirmDialog,
  emptyState,
  exerciseGlyph,
  icon,
  pageHead,
  showToast,
  openSheet,
} from '../ui.js';
import { esc } from '../utils.js';

export default function plansView(ctx) {
  if (ctx.detailId) return planDetail(ctx, ctx.detailId);
  return planList(ctx);
}

function colorOf(plan) {
  return PLAN_COLORS.find((c) => c.id === plan.color)?.value || '#ff9b3f';
}

function softOf(plan) {
  const color = colorOf(plan);
  return `color-mix(in srgb, ${color} 12%, transparent)`;
}

function planList(ctx) {
  const state = getState();
  const plans = state.plans;
  const activeId = state.settings.activePlanId;

  const cards = plans
    .map((plan) => {
      const stats = planStats(plan);
      const isActive = plan.id === activeId;
      return `<article class="card plan-card" style="--plan-color:${colorOf(plan)};--plan-soft:${softOf(plan)}">
        <div class="plan-card-top">
          <span class="plan-badge${isActive ? ' current' : ''}">${isActive ? '当前计划' : `${plan.days.length} 日分化`}</span>
          <h3><a href="#/plans/${plan.id}">${esc(plan.name)}</a></h3>
          <p class="plan-desc">${esc(plan.desc || '还没有填写计划说明。')}</p>
          <div class="plan-facts">
            <div class="plan-fact"><b>${stats.days}</b><span>训练日</span></div>
            <div class="plan-fact"><b>${stats.exercises}</b><span>动作</span></div>
            <div class="plan-fact"><b>${stats.sets}</b><span>组</span></div>
          </div>
        </div>
        <div class="plan-day-chips">
          ${plan.days
            .slice(0, 4)
            .map((day) => `<span class="plan-day-chip"><i></i>${esc(day.short || day.name)}</span>`)
            .join('')}
          ${plan.days.length > 4 ? `<span class="plan-day-chip">+${plan.days.length - 4}</span>` : ''}
        </div>
        <div class="plan-card-foot">
          <a class="btn btn-ghost btn-sm" href="#/plans/${plan.id}">查看详情</a>
          <button type="button" class="btn btn-primary btn-sm" data-plan-start="${plan.id}">${icon('play', 14)} 开始</button>
        </div>
      </article>`;
    })
    .join('');

  const html = `<div>
    ${pageHead({
      eyebrow: 'PROGRAMS',
      title: '训练计划',
      actions: `<a class="btn btn-primary" href="#/plans/new">${icon('plus', 16)} 新建计划</a>`,
    })}
    <div class="plan-grid">
      ${cards}
      <a class="add-plan-card" href="#/plans/new">
        <span class="plus-circle">${icon('plus', 22)}</span>
        <b>创建新计划</b>
        <span>自定义训练日、动作与组次</span>
      </a>
    </div>
    ${plans.length === 0 ? `<div style="margin-top:20px">${emptyState({
      iconName: 'plans',
      title: '从第一份计划开始',
      text: '你可以手动添加动作，也可以先复制内置的上下肢四分化模板。',
      action: '<a class="btn btn-primary" href="#/plans/new">新建计划</a>',
    })}</div>` : ''}
  </div>`;

  function startForPlan(plan) {
    const active = getActiveWorkout();
    const availableDays = plan.days.filter((day) => day.exercises?.length);
    const last = getWorkouts().find((w) => w.planId === plan.id);
    const lastIndex = last ? availableDays.findIndex((d) => d.id === last.dayId) : -1;
    const day = availableDays.length
      ? availableDays[lastIndex >= 0 ? (lastIndex + 1) % availableDays.length : 0]
      : null;
    if (!day) {
      showToast('这个计划还没有安排动作', 'error');
      ctx.navigate(`/plans/${plan.id}/edit`);
      return;
    }
    if (active) {
      openSheet({
        title: '有一场训练还没结束',
        subtitle: `当前：${active.dayName}`,
        size: 'sm',
        body: `<div class="confirm-body"><div class="confirm-icon">${icon('timer', 26)}</div><p>继续当前训练，还是放弃它并开始「${esc(day.name)}」？</p></div>`,
        footer: `<div class="btn-row">
          <button type="button" class="btn btn-ghost" data-resume>继续当前</button>
          <button type="button" class="btn btn-outline-danger" data-restart>放弃并开始</button>
        </div>`,
        onMount: (sheet, close) => {
          sheet.querySelector('[data-resume]').addEventListener('click', () => {
            close();
            ctx.navigate('/workout');
          });
          sheet.querySelector('[data-restart]').addEventListener('click', () => {
            close();
            startWorkout(plan, day);
            ctx.navigate('/workout');
          });
        },
      });
      return;
    }
    startWorkout(plan, day);
    ctx.navigate('/workout');
  }

  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-plan-start]').forEach((button) => {
        button.addEventListener('click', () => {
          const plan = getPlan(button.dataset.planStart);
          if (plan) startForPlan(plan);
        });
      });
    },
  };
}

function planDetail(ctx, planId) {
  const plan = getPlan(planId);
  if (!plan) {
    return {
      html: `<div>${pageHead({ title: '计划不存在', subtitle: '它可能已经被删除。' })}${emptyState({
        iconName: 'plans',
        title: '找不到这个计划',
        action: '<a class="btn btn-primary" href="#/plans">返回计划列表</a>',
      })}</div>`,
    };
  }
  const state = getState();
  const stats = planStats(plan);
  const isActive = state.settings.activePlanId === plan.id;
  const last = getWorkouts().find((w) => w.planId === plan.id);
  const lastIndex = last ? plan.days.findIndex((d) => d.id === last.dayId) : -1;
  const availableIndices = plan.days
    .map((day, index) => (day.exercises?.length ? index : -1))
    .filter((index) => index >= 0);
  const lastPosition = availableIndices.indexOf(lastIndex);
  const suggestedIndex = availableIndices.length
    ? availableIndices[(lastPosition + 1) % availableIndices.length]
    : -1;
  const color = colorOf(plan);

  const dayCards = plan.days
    .map((day, index) => {
      const totalSets = day.exercises.reduce((acc, e) => acc + (Number(e.sets) || 0), 0);
      return `<section class="card day-card${index === suggestedIndex ? ' open' : ''}" data-day-card>
        <div class="day-card-head" data-day-toggle role="button" tabindex="0" aria-expanded="${index === suggestedIndex}">
          <span class="day-index">D${index + 1}</span>
          <div class="day-title">
            <h3>${esc(day.name)}</h3>
            <p>${day.exercises.length} 个动作 · ${totalSets} 组 · 约 ${Math.round(estimatedPlanDuration(day) / 60)} 分钟</p>
          </div>
          ${index === suggestedIndex ? '<span class="tag lime">建议今天</span>' : ''}
          <button type="button" class="btn btn-primary btn-sm" data-day-start="${day.id}">${icon('play', 13)} 开始</button>
          <span class="day-chevron">${icon('chevron-down', 18)}</span>
        </div>
        <div class="day-body">
          ${day.exercises.length
            ? day.exercises
                .map((entry) => {
                  const def = getExercise(entry.exerciseId);
                  return `<div class="day-exercise">
                    ${exerciseGlyph(def?.muscle || 'chest', 'sm')}
                    <div class="ex-info"><strong>${esc(def?.nameZh || def?.name || entry.exerciseId)}</strong><span>${esc(entry.note || def?.equipment || '')}</span></div>
                    <span class="ex-target">${entry.sets} × ${esc(entry.reps)}${Number(entry.weight) > 0 ? ` @ ${entry.weight}kg` : ''}<small>${entry.rest || 90}s</small></span>
                  </div>`;
                })
                .join('')
            : `<p class="editor-empty">这一天还没有动作，点右上角编辑添加。</p>`}
        </div>
      </section>`;
    })
    .join('');

  const html = `<div>
    <div style="margin-bottom:14px"><a class="section-link" href="#/plans">${icon('arrow-left', 15)} 全部计划</a></div>
    <section class="plan-hero" style="--plan-color:${color}">
      <div class="plan-hero-top">
        <div>
          <span class="plan-badge${isActive ? ' current' : ''}" style="--plan-color:${color}">${isActive ? '当前计划' : '训练计划'}</span>
          <h1>${esc(plan.name)}</h1>
          <p>${esc(plan.desc || '还没有填写计划说明。')}</p>
        </div>
        <button type="button" class="icon-btn" data-plan-more aria-label="更多操作">${icon('more', 20)}</button>
      </div>
      <div class="plan-stat-row">
        <div><span>训练日</span><b>${stats.days}<small>天 / 周</small></b></div>
        <div><span>动作总数</span><b>${stats.exercises}<small>个</small></b></div>
        <div><span>计划总组数</span><b>${stats.sets}<small>组</small></b></div>
        <div><span>单次时长</span><b>${Math.round(
          plan.days.reduce((acc, day) => acc + estimatedPlanDuration(day), 0) / Math.max(1, plan.days.length) / 60,
        )}<small>分钟</small></b></div>
      </div>
      <div class="plan-hero-actions">
        <button type="button" class="btn btn-primary" data-day-start="${suggestedIndex >= 0 ? plan.days[suggestedIndex].id : ''}" ${suggestedIndex < 0 ? 'disabled' : ''}>${icon('play', 16)} ${suggestedIndex >= 0 ? `开始第 ${suggestedIndex + 1} 天` : '添加动作后开始'}</button>
        <a class="btn btn-ghost" href="#/plans/${plan.id}/edit">${icon('edit', 15)} 编辑计划</a>
        ${!isActive ? `<button type="button" class="btn btn-ghost" data-set-active>${icon('check', 15)} 设为当前</button>` : ''}
      </div>
    </section>

    <div class="section-head"><div><h2>训练日安排</h2></div></div>
    ${dayCards}

  </div>`;

  function begin(day) {
    if (!day || !day.exercises.length) {
      showToast('这一天还没有安排动作', 'error');
      return;
    }
    const active = getActiveWorkout();
    if (active) {
      actionSheet('训练进行中', [
        { label: '继续当前训练', icon: 'play', onClick: () => ctx.navigate('/workout') },
        {
          label: `放弃并开始「${day.name}」`,
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
    ctx.navigate('/workout');
  }

  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-day-toggle]').forEach((head) => {
        const toggle = () => {
          const card = head.closest('[data-day-card]');
          const open = card.classList.toggle('open');
          head.setAttribute('aria-expanded', String(open));
        };
        head.addEventListener('click', (event) => {
          if (event.target.closest('[data-day-start]')) return;
          toggle();
        });
        head.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        });
      });

      root.querySelectorAll('[data-day-start]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const day = plan.days.find((d) => d.id === button.dataset.dayStart);
          begin(day);
        });
      });

      root.querySelector('[data-set-active]')?.addEventListener('click', () => {
        updateSettings({ activePlanId: plan.id });
        showToast('已设为当前计划');
        ctx.rerender();
      });

      root.querySelector('[data-plan-more]')?.addEventListener('click', () => {
        actionSheet(plan.name, [
          ...(!isActive
            ? [
                {
                  label: '设为当前计划',
                  icon: 'check',
                  onClick: () => {
                    updateSettings({ activePlanId: plan.id });
                    showToast('已设为当前计划');
                    ctx.rerender();
                  },
                },
              ]
            : []),
          {
            label: '复制这份计划',
            icon: 'copy',
            onClick: () => {
              const copy = duplicatePlan(plan.id);
              if (copy) {
                showToast('计划已复制');
                ctx.navigate(`/plans/${copy.id}/edit`);
              }
            },
          },
          {
            label: '删除计划',
            icon: 'trash',
            danger: true,
            onClick: async () => {
              const confirmed = await confirmDialog({
                title: '删除这份计划？',
                message: `「${esc(plan.name)}」将被永久删除，但已有的训练记录会保留。`,
                confirmText: '删除计划',
                danger: true,
                iconName: 'trash',
              });
              if (confirmed) {
                deletePlan(plan.id);
                showToast('计划已删除');
                ctx.navigate('/plans');
              }
            },
          },
        ], `${stats.days} 个训练日 · ${stats.exercises} 个动作`);
      });
    },
  };
}
