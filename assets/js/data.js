/* 大了么 · 动作库分类、默认状态与常量
 *
 * 动作目录来自 hasaneyldrm/exercises-dataset（1,324 个动作，含 GIF）。
 * 目录由 scripts/import-exercises.mjs 生成，见 assets/js/exercise-catalog.js。
 */
import { CATALOG_META, EXERCISE_CATALOG } from './exercise-catalog.js';

export const APP_NAME = '大了么';
export const APP_VERSION = '2.3.0';
export const STORAGE_KEY = 'liantrace.state.v1';

/* 新版部位 = 数据集 body_part；末尾 4 项仅用于解析历史训练数据，不出现在筛选器里 */
export const MUSCLES = {
  chest: { name: '胸部', color: '#ff7a59', soft: 'rgba(255,122,89,.14)' },
  back: { name: '背部', color: '#6fb7ff', soft: 'rgba(111,183,255,.14)' },
  shoulders: { name: '肩部', color: '#ffd166', soft: 'rgba(255,209,102,.14)' },
  upper_arms: { name: '上臂', color: '#ffc48a', soft: 'rgba(255,196,138,.14)' },
  lower_arms: { name: '前臂', color: '#e9a06b', soft: 'rgba(233,160,107,.14)' },
  upper_legs: { name: '大腿', color: '#ff9b3f', soft: 'rgba(255,155,63,.13)' },
  lower_legs: { name: '小腿', color: '#c96a2e', soft: 'rgba(201,106,46,.14)' },
  waist: { name: '腰腹', color: '#ff9db5', soft: 'rgba(255,157,181,.14)' },
  neck: { name: '颈部', color: '#d8b4ff', soft: 'rgba(216,180,255,.14)' },
  cardio: { name: '有氧', color: '#9aa7ff', soft: 'rgba(154,167,255,.14)' },
  legs: { name: '腿', color: '#ff9b3f', soft: 'rgba(255,155,63,.13)', legacy: true },
  glutes: { name: '臀', color: '#f0a6ff', soft: 'rgba(240,166,255,.14)', legacy: true },
  arms: { name: '手臂', color: '#ffc48a', soft: 'rgba(255,196,138,.14)', legacy: true },
  core: { name: '核心', color: '#ff9db5', soft: 'rgba(255,157,181,.14)', legacy: true },
};

/** 按动作数量排序的部位，供筛选 / 分组 UI 使用 */
export const BODY_PARTS = CATALOG_META.bodyParts
  .map((part) => ({
    ...part,
    color: MUSCLES[part.key].color,
    count: EXERCISE_CATALOG.filter((e) => e.muscle === part.key).length,
  }))
  .sort((a, b) => b.count - a.count);

/** 器械中文名（含旧版自定义动作可能用到的取值） */
const catalogEquipment = [...new Set(EXERCISE_CATALOG.map((e) => e.equipment))];
export const EQUIPMENT = [...new Set([...catalogEquipment, '器械', '有氧'])];

/** 器械筛选器：仅展示目录中真实存在、并按数量排序的取值 */
const equipmentCounts = new Map();
for (const exercise of EXERCISE_CATALOG) {
  equipmentCounts.set(exercise.equipment, (equipmentCounts.get(exercise.equipment) || 0) + 1);
}
export const EQUIPMENT_FILTERS = [...equipmentCounts.entries()]
  .map(([label, count]) => ({ label, count }))
  .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh'));

export const CATALOG_INFO = CATALOG_META;
export { EXERCISE_CATALOG };

export const PLAN_COLORS = [
  { id: 'lime', label: '暖橙', value: '#ff9b3f' },
  { id: 'orange', label: '赤陶', value: '#e0563b' },
  { id: 'blue', label: '逐浪', value: '#6fb7ff' },
  { id: 'violet', label: '暮紫', value: '#c39bff' },
];

/* 每个动作练完后的快捷感受评价：从轻松到力竭 */
export const FEEL_LEVELS = [
  { id: 'easy', label: '轻松', hint: '还能多做 3 次以上', color: '#6fb7ff', soft: 'rgba(111,183,255,.16)' },
  { id: 'moderate', label: '适中', hint: '大概还剩 2 次余量', color: '#ffb056', soft: 'rgba(255,176,86,.16)' },
  { id: 'hard', label: '吃力', hint: '只能再顶 1 次', color: '#ff8f6b', soft: 'rgba(255,143,107,.16)' },
  { id: 'failure', label: '力竭', hint: '一下也做不动了', color: '#ff8080', soft: 'rgba(255,128,128,.16)' },
];

export const FEEL_MAP = Object.fromEntries(FEEL_LEVELS.map((level) => [level.id, level]));

export function feelInfo(id) {
  return FEEL_MAP[id] || null;
}

/* ------------------------------------------------------------------
   旧版内置动作（48 个）：新目录已替换它们，但历史计划 / 训练里仍可能
   引用这些 id。仅用于 getExercise() 兜底解析，不出现在动作库与选择器中。
   ------------------------------------------------------------------ */
export const LEGACY_EXERCISES = [
  { id: 'barbell-bench', name: '杠铃卧推', muscle: 'chest', equipment: '杠铃', reps: '6-8', tip: '肩胛后收下沉，杠铃触胸后快速推起。' },
  { id: 'incline-barbell', name: '上斜杠铃卧推', muscle: 'chest', equipment: '杠铃', reps: '8-10', tip: '凳面约 30°，保持手腕在肘部正上方。' },
  { id: 'dumbbell-bench', name: '哑铃卧推', muscle: 'chest', equipment: '哑铃', reps: '8-12', tip: '下放至胸肌充分拉伸，避免肘部过度外展。' },
  { id: 'incline-db', name: '上斜哑铃卧推', muscle: 'chest', equipment: '哑铃', reps: '8-12', tip: '控制下放速度，顶端不要完全锁死肘关节。' },
  { id: 'dips', name: '双杠臂屈伸', muscle: 'chest', equipment: '自重', reps: '8-12', tip: '身体微前倾更偏胸，肩部不适时缩小幅度。' },
  { id: 'cable-fly', name: '绳索夹胸', muscle: 'chest', equipment: '绳索', reps: '12-15', tip: '想象拥抱大树，顶峰收缩一秒。' },
  { id: 'pec-deck', name: '蝴蝶机夹胸', muscle: 'chest', equipment: '器械', reps: '12-15', tip: '肘部微屈固定，避免借力耸肩。' },
  { id: 'pushup', name: '俯卧撑', muscle: 'chest', equipment: '自重', reps: '12-20', tip: '身体成一条直线，胸部接近地面。' },
  { id: 'deadlift', name: '硬拉', muscle: 'back', equipment: '杠铃', reps: '4-6', tip: '杠铃贴腿，背部中立，用髋部和腿部发力。' },
  { id: 'pullup', name: '引体向上', muscle: 'back', equipment: '自重', reps: '6-10', tip: '先沉肩再拉，避免摆动借力。' },
  { id: 'barbell-row', name: '杠铃划船', muscle: 'back', equipment: '杠铃', reps: '6-8', tip: '髋部铰链，背部平直，拉向下腹。' },
  { id: 'lat-pulldown', name: '高位下拉', muscle: 'back', equipment: '器械', reps: '10-12', tip: '肘部向下向后，不要用力后仰。' },
  { id: 'seated-row', name: '坐姿绳索划船', muscle: 'back', equipment: '器械', reps: '10-12', tip: '胸口挺起，肩胛骨充分后缩。' },
  { id: 'one-arm-row', name: '单臂哑铃划船', muscle: 'back', equipment: '哑铃', reps: '10-12', tip: '保持躯干稳定，避免身体旋转。' },
  { id: 'straight-arm-pulldown', name: '直臂下压', muscle: 'back', equipment: '绳索', reps: '12-15', tip: '手臂微屈固定，感受背阔肌发力。' },
  { id: 'face-pull', name: '面拉', muscle: 'back', equipment: '绳索', reps: '12-15', tip: '拉向面部，外旋肩部，改善圆肩。' },
  { id: 'squat', name: '杠铃深蹲', muscle: 'legs', equipment: '杠铃', reps: '6-8', tip: '核心收紧，膝盖与脚尖同向，蹲至髋低于膝。' },
  { id: 'front-squat', name: '前蹲', muscle: 'legs', equipment: '杠铃', reps: '6-8', tip: '肘部高抬，躯干保持直立。' },
  { id: 'leg-press', name: '腿举', muscle: 'legs', equipment: '器械', reps: '10-12', tip: '下放至膝角约 90°，不要锁死膝盖。' },
  { id: 'bulgarian-split', name: '保加利亚分腿蹲', muscle: 'legs', equipment: '哑铃', reps: '8-10', tip: '前脚踩稳，垂直下蹲，重心放在前腿。' },
  { id: 'rdl', name: '罗马尼亚硬拉', muscle: 'legs', equipment: '杠铃', reps: '8-10', tip: '臀部向后推，杠铃贴腿，感受腘绳肌拉伸。' },
  { id: 'leg-curl', name: '腿弯举', muscle: 'legs', equipment: '器械', reps: '12-15', tip: '控制离心，避免髋部抬起。' },
  { id: 'leg-extension', name: '腿屈伸', muscle: 'legs', equipment: '器械', reps: '12-15', tip: '顶峰停顿，缓慢下放。' },
  { id: 'calf-raise', name: '站姿提踵', muscle: 'legs', equipment: '器械', reps: '15-20', tip: '底部充分拉伸，顶端停顿两秒。' },
  { id: 'lunge', name: '哑铃箭步蹲', muscle: 'legs', equipment: '哑铃', reps: '10-12', tip: '步幅适中，后膝轻触地面附近。' },
  { id: 'hip-thrust', name: '杠铃臀推', muscle: 'glutes', equipment: '杠铃', reps: '8-10', tip: '下巴微收，顶端臀肌收紧而非腰部反弓。' },
  { id: 'glute-bridge', name: '臀桥', muscle: 'glutes', equipment: '自重', reps: '15-20', tip: '脚跟发力，顶峰夹紧臀部。' },
  { id: 'hip-abduction', name: '髋外展', muscle: 'glutes', equipment: '器械', reps: '15-20', tip: '身体前倾可更多刺激臀中肌。' },
  { id: 'ohp', name: '站姿杠铃推举', muscle: 'shoulders', equipment: '杠铃', reps: '6-8', tip: '核心与臀部收紧，杠铃沿面部推起。' },
  { id: 'seated-db-press', name: '坐姿哑铃推举', muscle: 'shoulders', equipment: '哑铃', reps: '8-12', tip: '肘部略在手腕前方，避免耸肩。' },
  { id: 'lateral-raise', name: '哑铃侧平举', muscle: 'shoulders', equipment: '哑铃', reps: '12-15', tip: '用肘部带动，抬至与肩同高即可。' },
  { id: 'rear-delt-fly', name: '俯身哑铃侧平举', muscle: 'shoulders', equipment: '哑铃', reps: '12-15', tip: '小重量、慢节奏，感受三角肌后束。' },
  { id: 'arnold-press', name: '阿诺德推举', muscle: 'shoulders', equipment: '哑铃', reps: '8-12', tip: '推起时旋转手腕，动作连贯。' },
  { id: 'barbell-curl', name: '杠铃弯举', muscle: 'arms', equipment: '杠铃', reps: '8-12', tip: '肘部固定，避免身体摆动借力。' },
  { id: 'db-curl', name: '哑铃弯举', muscle: 'arms', equipment: '哑铃', reps: '10-12', tip: '顶峰收缩，离心阶段控制下放。' },
  { id: 'hammer-curl', name: '锤式弯举', muscle: 'arms', equipment: '哑铃', reps: '10-12', tip: '掌心相对，更多刺激肱桡肌。' },
  { id: 'triceps-pushdown', name: '绳索下压', muscle: 'arms', equipment: '绳索', reps: '10-15', tip: '大臂夹紧身体，底部完全伸直。' },
  { id: 'skull-crusher', name: '仰卧臂屈伸', muscle: 'arms', equipment: '哑铃', reps: '10-12', tip: '肘部指向上方，下放至额头上方。' },
  { id: 'close-grip-bench', name: '窄距卧推', muscle: 'arms', equipment: '杠铃', reps: '8-10', tip: '握距略窄于肩，肘部贴近身体。' },
  { id: 'plank', name: '平板支撑', muscle: 'core', equipment: '自重', reps: '45-60', tip: '收紧腹部与臀部，保持身体一条直线。' },
  { id: 'hanging-leg-raise', name: '悬垂举腿', muscle: 'core', equipment: '自重', reps: '10-15', tip: '控制摆动，用腹部卷起骨盆。' },
  { id: 'crunch', name: '卷腹', muscle: 'core', equipment: '自重', reps: '15-20', tip: '下背贴地，呼气时卷起上背。' },
  { id: 'russian-twist', name: '俄罗斯转体', muscle: 'core', equipment: '哑铃', reps: '16-20', tip: '转动胸椎而非只摆动手臂。' },
  { id: 'ab-wheel', name: '健腹轮', muscle: 'core', equipment: '自重', reps: '10-12', tip: '收紧核心，避免腰部下塌。' },
  { id: 'treadmill', name: '跑步机', muscle: 'cardio', equipment: '有氧', reps: '20-30', tip: '以能保持对话的强度进行有氧。' },
  { id: 'rower', name: '划船机', muscle: 'cardio', equipment: '有氧', reps: '15-20', tip: '腿—髋—臂的顺序发力。' },
  { id: 'bike', name: '动感单车', muscle: 'cardio', equipment: '有氧', reps: '20-30', tip: '调节座椅高度，膝盖不过度前伸。' },
  { id: 'jump-rope', name: '跳绳', muscle: 'cardio', equipment: '有氧', reps: '10-15', tip: '前脚掌落地，保持轻盈节奏。' },
];

const planColor = (id) => PLAN_COLORS.find((c) => c.id === id)?.value ?? '#ff9b3f';

/** 全新账号的初始状态：不包含任何示例计划或演示训练数据 */
export function createDefaultState() {
  return {
    schema: 1,
    createdAt: new Date().toISOString(),
    settings: {
      userName: '',
      weeklyGoal: 4,
      defaultRest: 90,
      activePlanId: null,
      theme: 'light',
      /* 用户是否主动切换过主题：false 时旧数据会被迁移到明亮的浅色主题 */
      themeExplicit: false,
      /* 身体基础信息：身高 cm、性别（male / female / unset），体重取最新体测记录 */
      height: null,
      gender: 'unset',
      showTips: true,
      /* 组间休息结束时的提示音（震动与画面提示始终开启） */
      restSound: true,
    },
    plans: [],
    workouts: [],
    customExercises: [],
    bodyWeights: [],
    activeWorkout: null,
    meta: { demo: false, lastBackupAt: null },
  };
}

export function createEmptyPlan() {
  return {
    id: `plan_${Date.now().toString(36)}`,
    name: '我的训练计划',
    desc: '',
    color: 'lime',
    createdAt: new Date().toISOString(),
    archived: false,
    days: [
      {
        id: `day_${Date.now().toString(36)}_1`,
        name: '训练日 1',
        short: 'DAY 1',
        exercises: [],
      },
    ],
  };
}

export { planColor };
