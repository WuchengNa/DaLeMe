/* 大了么 · BMI 纯函数单元测试（中国成人标准） */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BMI_BANDS,
  bmiBand,
  bmiPercent,
  bmiScale,
  computeBmi,
  genderLabel,
  healthyWeightRange,
} from '../assets/js/bmi.js';

test('BMI 公式：体重 / 身高²，保留一位小数', () => {
  assert.equal(computeBmi(175, 68.6), 22.4);
  assert.equal(computeBmi(170, 50), 17.3);
  assert.equal(computeBmi(180, 100), 30.9);
});

test('缺失 / 越界数据返回 null，不产生 Infinity 或 NaN', () => {
  assert.equal(computeBmi(null, 70), null);
  assert.equal(computeBmi(175, null), null);
  assert.equal(computeBmi(0, 70), null);
  assert.equal(computeBmi(175, 0), null);
  assert.equal(computeBmi(10, 70), null);
  assert.equal(computeBmi(175, 1000), null);
});

test('分界值 18.5 / 24 / 28 归入正确区间', () => {
  assert.equal(bmiBand(18.4).key, 'under');
  assert.equal(bmiBand(18.5).key, 'normal');
  assert.equal(bmiBand(23.9).key, 'normal');
  assert.equal(bmiBand(24).key, 'over');
  assert.equal(bmiBand(27.9).key, 'over');
  assert.equal(bmiBand(28).key, 'obese');
  assert.equal(bmiBand(null), null);
  assert.equal(BMI_BANDS.length, 4);
});

test('健康体重范围按身高换算', () => {
  const range = healthyWeightRange(175);
  assert.equal(range.min, 56.7);
  assert.equal(range.max, 73.5);
  assert.equal(healthyWeightRange(null), null);
  assert.equal(healthyWeightRange(5), null);
});

test('刻度轴：四段宽度合计 100%，分界刻度对齐', () => {
  const { segments, ticks } = bmiScale();
  assert.equal(segments.length, 4);
  assert.equal(Math.round(segments.reduce((sum, seg) => sum + seg.width, 0)), 100);
  assert.deepEqual(segments.map((seg) => seg.key), ['under', 'normal', 'over', 'obese']);
  assert.deepEqual(ticks.map((tick) => tick.value), ['15', '18.5', '24', '28', '35']);
  assert.equal(ticks[1].percent, 17.5);
  assert.equal(ticks[2].percent, 45);
  assert.equal(ticks[3].percent, 65);
});

test('当前位置指针按 15–35 线性映射并夹紧', () => {
  assert.equal(bmiPercent(15), 0);
  assert.equal(bmiPercent(25), 50);
  assert.equal(bmiPercent(35), 100);
  assert.equal(bmiPercent(5), 0);
  assert.equal(bmiPercent(45), 100);
});

test('性别标签', () => {
  assert.equal(genderLabel('male'), '男');
  assert.equal(genderLabel('female'), '女');
  assert.equal(genderLabel('unset'), '保密');
  assert.equal(genderLabel('unknown'), '保密');
});
