/* 大了么 · BMI 计算与标准刻度（纯函数，无 DOM / 状态依赖）
 *
 * 分界值按性别区分（参考我国成人常用标准与 WHO 上限）：
 *   男性：  < 18.5 偏瘦 · 18.5–24.9 正常 · 25–27.9 超重 · ≥ 28 肥胖
 *   女性/保密：< 18.5 偏瘦 · 18.5–23.9 正常 · 24–27.9 超重 · ≥ 28 肥胖
 * 刻度轴显示范围 15–35，四段宽度按分界值等比切分。
 */

export const BMI_SCALE = { min: 15, max: 35 };

export const BMI_BOUNDS_MALE = [18.5, 25, 28];
export const BMI_BOUNDS_FEMALE = [18.5, 24, 28];

/** 依据性别取分界值；未填性别按女性标准（更保守的 24 分界）显示 */
export function bmiBounds(gender) {
  return gender === 'male' ? BMI_BOUNDS_MALE : BMI_BOUNDS_FEMALE;
}

/** 依据性别取四段区间文案 */
export function bmiBands(gender) {
  const bounds = bmiBounds(gender);
  const fmt = (v) => (Number.isInteger(v) ? String(v) : String(v));
  return [
    { key: 'under', label: '偏瘦', hint: '< 18.5' },
    {
      key: 'normal',
      label: '正常',
      hint: `18.5 – ${fmt(bounds[1] - 0.1)}`,
    },
    {
      key: 'over',
      label: '超重',
      hint: `${fmt(bounds[1])} – 27.9`,
    },
    { key: 'obese', label: '肥胖', hint: '≥ 28' },
  ];
}

/* 兼容旧调用：默认（女性/保密）标准 */
export const BMI_BOUNDS = BMI_BOUNDS_FEMALE;
export const BMI_BANDS = bmiBands('female');

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

export function bmiBand(bmi, gender) {
  if (bmi == null || !Number.isFinite(Number(bmi))) return null;
  const value = Number(bmi);
  const bounds = bmiBounds(gender);
  const bands = bmiBands(gender);
  if (value < bounds[0]) return bands[0];
  if (value < bounds[1]) return bands[1];
  if (value < bounds[2]) return bands[2];
  return bands[3];
}

/** 该身高对应的健康体重区间（BMI 18.5 至该性别的正常上限） */
export function healthyWeightRange(heightCm, gender) {
  const meters = Number(heightCm) / 100;
  if (!validHeight(meters)) return null;
  const bounds = bmiBounds(gender);
  return {
    min: round1(bounds[0] * meters * meters),
    max: round1(bounds[1] * meters * meters),
  };
}

export function bmiPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const span = BMI_SCALE.max - BMI_SCALE.min;
  return Math.max(0, Math.min(100, ((number - BMI_SCALE.min) / span) * 100));
}

/** 刻度轴四段 + 分界刻度，供视图直接渲染 */
export function bmiScale(gender) {
  const bounds = bmiBounds(gender);
  const bands = bmiBands(gender);
  const span = BMI_SCALE.max - BMI_SCALE.min;
  const points = [BMI_SCALE.min, ...bounds, BMI_SCALE.max];
  const segments = bands.map((band, index) => ({
    ...band,
    width: ((points[index + 1] - points[index]) / span) * 100,
  }));
  const ticks = points.map((value) => ({
    value: String(value),
    percent: ((value - BMI_SCALE.min) / span) * 100,
  }));
  return { segments, ticks };
}

export function genderLabel(key) {
  return GENDERS.find((item) => item.key === key)?.label || '保密';
}
