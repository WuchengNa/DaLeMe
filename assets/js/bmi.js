/* 大了么 · BMI 计算与标准刻度（纯函数，无 DOM / 状态依赖）
 *
 * 采用《中国成人超重和肥胖症预防控制指南》的分界值：
 *   < 18.5 偏瘦 · 18.5–23.9 正常 · 24–27.9 超重 · ≥ 28 肥胖
 * 刻度轴显示范围 15–35，四段宽度按分界值等比切分。
 */

export const BMI_SCALE = { min: 15, max: 35 };
export const BMI_BOUNDS = [18.5, 24, 28];

export const BMI_BANDS = [
  { key: 'under', label: '偏瘦', hint: '< 18.5' },
  { key: 'normal', label: '正常', hint: '18.5 – 23.9' },
  { key: 'over', label: '超重', hint: '24 – 27.9' },
  { key: 'obese', label: '肥胖', hint: '≥ 28' },
];

export const GENDERS = [
  { key: 'male', label: '男' },
  { key: 'female', label: '女' },
  { key: 'unset', label: '保密' },
];

const round1 = (value) => Math.round(value * 10) / 10;
const validHeight = (h) => Number.isFinite(h) && h >= 0.8 && h <= 2.5;

/** BMI = 体重(kg) / 身高(m)²；数据缺失或不合理时返回 null */
export function computeBmi(heightCm, weightKg) {
  const meters = Number(heightCm) / 100;
  const kg = Number(weightKg);
  if (!validHeight(meters) || !Number.isFinite(kg) || kg < 20 || kg > 400) return null;
  const value = kg / (meters * meters);
  return Number.isFinite(value) ? round1(value) : null;
}

export function bmiBand(bmi) {
  if (bmi == null || !Number.isFinite(Number(bmi))) return null;
  const value = Number(bmi);
  if (value < BMI_BOUNDS[0]) return BMI_BANDS[0];
  if (value < BMI_BOUNDS[1]) return BMI_BANDS[1];
  if (value < BMI_BOUNDS[2]) return BMI_BANDS[2];
  return BMI_BANDS[3];
}

/** 该身高对应的健康体重区间（BMI 18.5–24） */
export function healthyWeightRange(heightCm) {
  const meters = Number(heightCm) / 100;
  if (!validHeight(meters)) return null;
  return {
    min: round1(BMI_BOUNDS[0] * meters * meters),
    max: round1(BMI_BOUNDS[1] * meters * meters),
  };
}

export function bmiPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const span = BMI_SCALE.max - BMI_SCALE.min;
  return Math.max(0, Math.min(100, ((number - BMI_SCALE.min) / span) * 100));
}

/** 刻度轴四段 + 分界刻度，供视图直接渲染 */
export function bmiScale() {
  const span = BMI_SCALE.max - BMI_SCALE.min;
  const points = [BMI_SCALE.min, ...BMI_BOUNDS, BMI_SCALE.max];
  const segments = BMI_BANDS.map((band, index) => ({
    ...band,
    width: ((points[index + 1] - points[index]) / span) * 100,
  }));
  const ticks = points.map((value) => ({
    value: value === BMI_SCALE.min || value === BMI_SCALE.max ? String(value) : String(value),
    percent: ((value - BMI_SCALE.min) / span) * 100,
  }));
  return { segments, ticks };
}

export function genderLabel(key) {
  return GENDERS.find((item) => item.key === key)?.label || '保密';
}
