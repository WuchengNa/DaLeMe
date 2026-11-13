/* 训练计划模板：结构、动作 id 与草稿生成的单元测试 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { PLAN_COLORS, LEGACY_EXERCISES } from '../assets/js/data.js';
import { EXERCISE_CATALOG } from '../assets/js/exercise-catalog.js';
import { PLAN_TEMPLATES, buildPlanDraft, getTemplate, templateSummary } from '../assets/js/plan-templates.js';

const knownIds = new Set([
  ...EXERCISE_CATALOG.map((exercise) => exercise.id),
  ...LEGACY_EXERCISES.map((exercise) => exercise.id),
]);
const colorIds = new Set(PLAN_COLORS.map((color) => color.id));

test('模板列表不重复且字段完整', () => {
  assert.ok(PLAN_TEMPLATES.length >= 4, '至少提供 4 套模板');
  const ids = new Set();
  for (const template of PLAN_TEMPLATES) {
    assert.ok(!ids.has(template.id), `模板 id 重复：${template.id}`);
    ids.add(template.id);
    assert.equal(typeof template.name, 'string');
    assert.ok(template.name.length > 0);
    assert.ok(template.desc.length > 0);
    assert.ok(['新手', '中级', '进阶'].includes(template.level));
    assert.ok(colorIds.has(template.color), `未知颜色：${template.color}`);
  }
});

test('每套模板的训练日与动作都在应用限制内', () => {
  for (const template of PLAN_TEMPLATES) {
    assert.ok(template.days.length >= 2 && template.days.length <= 7, `${template.id} 训练日数量`);
    for (const day of template.days) {
      assert.ok(day.name.trim().length > 0);
      assert.ok(day.exercises.length >= 3, `${template.id} / ${day.name} 动作太少`);
      for (const entry of day.exercises) {
        assert.ok(knownIds.has(entry.exerciseId), `${template.id} 引用了不存在的动作：${entry.exerciseId}`);
        assert.ok(Number(entry.sets) >= 1 && Number(entry.sets) <= 20);
        assert.match(String(entry.reps), /^\d+(-\d+)?$/, `${entry.exerciseId} 次数格式`);
        assert.ok(Number(entry.rest) >= 0 && Number(entry.rest) <= 900);
        assert.equal(typeof entry.weight, 'string');
      }
    }
  }
});

test('同一训练日内不重复安排同一动作', () => {
  for (const template of PLAN_TEMPLATES) {
    for (const day of template.days) {
      const seen = new Set();
      for (const entry of day.exercises) {
        assert.ok(!seen.has(entry.exerciseId), `${template.id} / ${day.name} 重复动作：${entry.exerciseId}`);
        seen.add(entry.exerciseId);
      }
    }
  }
});

test('templateSummary 汇总训练日 / 动作 / 组数 / 时长', () => {
  for (const template of PLAN_TEMPLATES) {
    const summary = templateSummary(template);
    const exercises = template.days.reduce((acc, day) => acc + day.exercises.length, 0);
    const sets = template.days.reduce(
      (acc, day) => acc + day.exercises.reduce((s, entry) => s + entry.sets, 0),
      0,
    );
    assert.equal(summary.days, template.days.length);
    assert.equal(summary.exercises, exercises);
    assert.equal(summary.sets, sets);
    assert.ok(summary.minutes >= 15 && summary.minutes <= 120, `${template.id} 预计时长异常：${summary.minutes}`);
  }
});

test('buildPlanDraft 生成独立 id，且不与模板共享引用', () => {
  const template = PLAN_TEMPLATES[0];
  const draft = buildPlanDraft(template);
  assert.equal(draft.name, template.name);
  assert.equal(draft.days.length, template.days.length);

  const dayIds = new Set(draft.days.map((day) => day.id));
  assert.equal(dayIds.size, draft.days.length);
  for (const day of draft.days) assert.ok(day.id.startsWith(draft.id));

  draft.days[0].exercises[0].sets = 99;
  assert.notEqual(template.days[0].exercises[0].sets, 99, '模板数据被草稿污染');
});

test('getTemplate 只返回存在的模板', () => {
  assert.equal(getTemplate('ppl3')?.id, 'ppl3');
  assert.equal(getTemplate('nope'), null);
});
