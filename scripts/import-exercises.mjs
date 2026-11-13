/* 大了么 · 从 hasaneyldrm/exercises-dataset 生成动作库资源
 *
 * 用法：
 *   node scripts/import-exercises.mjs [上游仓库目录]
 *
 * 上游仓库目录里需要有 data/exercises.json、images/、videos/、NOTICE.md、LICENSE。
 * 获取方式（任选其一）：
 *   git clone --depth 1 https://github.com/hasaneyldrm/exercises-dataset.git
 *   curl -L -o ds.tar.gz https://codeload.github.com/hasaneyldrm/exercises-dataset/tar.gz/refs/heads/main
 *
 * 生成物：
 *   assets/exercises/videos/*.gif   动作 GIF（本地托管，符合 CSP 且可离线）
 *   assets/exercises/images/*.jpg   静态缩略图
 *   assets/exercises/details.json   中文 / 英文分步动作要领（按需加载）
 *   assets/exercises/NOTICE.md      媒体版权声明
 *   assets/exercises/LICENSE.txt    上游数据 MIT 许可
 *   assets/js/exercise-catalog.js   精简动作目录（ES 模块，同步可用）
 *
 * 注意：媒体版权归 Gym visual 所有，须保留署名，商业使用请先取得授权。
 */
import {
  copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync,
  statSync, writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  BODY_PART_KEYS, BODY_PART_LABELS, EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS,
  TARGET_LABELS, translateName,
} from './exercise-i18n.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = resolve(process.argv[2] || join(ROOT, '.tmp/src/exercises-dataset-main'));
const OUT_MEDIA = join(ROOT, 'assets/exercises');
const OUT_JS = join(ROOT, 'assets/js/exercise-catalog.js');

const DATASET_JSON = join(SOURCE, 'data/exercises.json');
if (!existsSync(DATASET_JSON)) {
  console.error(`找不到数据集：${DATASET_JSON}`);
  console.error('请先 clone 上游仓库并把目录路径作为参数传入，详见本文件头部说明。');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(DATASET_JSON, 'utf8'));
if (!Array.isArray(raw) || raw.length < 1000) {
  throw new Error('数据集内容异常：预期至少 1000 条动作记录');
}

/* ---------- 1. 复制媒体与许可文件 ---------- */
mkdirSync(join(OUT_MEDIA, 'videos'), { recursive: true });
mkdirSync(join(OUT_MEDIA, 'images'), { recursive: true });

for (const folder of ['videos', 'images']) {
  const from = join(SOURCE, folder);
  if (!existsSync(from)) throw new Error(`缺少媒体目录：${from}`);
  cpSync(from, join(OUT_MEDIA, folder), { recursive: true, force: true });
  const count = readdirSync(join(OUT_MEDIA, folder)).filter((f) => /\.(gif|jpe?g)$/i.test(f)).length;
  console.log(`  ${folder}: ${count} 个文件`);
}
for (const [file, target] of [['NOTICE.md', 'NOTICE.md'], ['LICENSE', 'LICENSE.txt']]) {
  const from = join(SOURCE, file);
  if (existsSync(from)) copyFileSync(from, join(OUT_MEDIA, target));
}

/* ---------- 2. 生成精简目录 ---------- */
const labelize = (value, map) => map[value] || value || '';

function defaultReps(item) {
  const n = String(item.name || '').toLowerCase();
  if (item.body_part === 'cardio') return '30-60';
  if (/\bstretch|plank|hold|hang\b/.test(n)) return '30-45';
  if (item.body_part === 'waist') return '12-20';
  return '8-12';
}

const catalog = [];
const details = {};
const missingMedia = [];
const seenIds = new Set();

for (const item of raw) {
  const id = `ex_${item.id}`;
  if (seenIds.has(id)) throw new Error(`重复动作 ID：${id}`);
  seenIds.add(id);

  const gifFile = basename(item.gif_url || '');
  const imageFile = basename(item.image || '');
  if (!existsSync(join(OUT_MEDIA, 'videos', gifFile))) missingMedia.push(`videos/${gifFile}`);
  if (!existsSync(join(OUT_MEDIA, 'images', imageFile))) missingMedia.push(`images/${imageFile}`);

  const name = String(item.name || '').trim();
  const nameZh = translateName(name);
  const muscle = BODY_PART_KEYS[item.body_part];
  if (!muscle) throw new Error(`未知部位：${item.body_part}`);

  catalog.push({
    id,
    name,
    nameZh,
    muscle,
    equipment: labelize(item.equipment, EQUIPMENT_LABELS),
    target: labelize(item.target, TARGET_LABELS),
    muscleGroup: labelize(item.muscle_group, MUSCLE_GROUP_LABELS),
    secondary: (item.secondary_muscles || []).slice(0, 3).map((m) => labelize(m, MUSCLE_GROUP_LABELS)),
    gif: `/assets/exercises/videos/${gifFile}`,
    image: `/assets/exercises/images/${imageFile}`,
    reps: defaultReps(item),
    tip: '',
  });

  details[id] = {
    zh: item.instruction_steps?.zh?.length ? item.instruction_steps.zh : [item.instructions?.zh || ''].filter(Boolean),
    en: item.instruction_steps?.en?.length ? item.instruction_steps.en : [item.instructions?.en || ''].filter(Boolean),
  };
}

if (missingMedia.length) {
  throw new Error(`有 ${missingMedia.length} 个媒体文件缺失，例如：${missingMedia.slice(0, 3).join(', ')}`);
}

const translated = catalog.filter((e) => e.nameZh).length;
const meta = {
  source: 'hasaneyldrm/exercises-dataset',
  sourceUrl: 'https://github.com/hasaneyldrm/exercises-dataset',
  attribution: '© Gym visual — https://gymvisual.com/',
  total: catalog.length,
  translated,
  bodyParts: Object.entries(BODY_PART_KEYS).map(([en, key]) => ({ key, label: BODY_PART_LABELS[en] })),
};

const banner = `/* 自动生成，请勿手动编辑。
 * 来源：https://github.com/hasaneyldrm/exercises-dataset （数据 MIT；媒体 © Gym visual）
 * 重新生成：node scripts/import-exercises.mjs <上游仓库目录>
 * 生成时间：${new Date().toISOString()}
 */\n`;

const jsBody = `export const CATALOG_META = ${JSON.stringify(meta, null, 2)};\n\n` +
  `export const EXERCISE_CATALOG = [\n` +
  catalog.map((e) => `  ${JSON.stringify(e)},`).join('\n') +
  `\n];\n`;
writeFileSync(OUT_JS, banner + jsBody, 'utf8');
writeFileSync(
  join(OUT_MEDIA, 'details.json'),
  JSON.stringify({ meta: { attribution: meta.attribution, sourceUrl: meta.sourceUrl }, items: details }),
  'utf8',
);

const size = (p) => `${(statSync(p).size / 1024).toFixed(0)} KB`;
console.log(`\n完成：`);
console.log(`  动作 ${catalog.length} 个，中文名 ${translated} 个 (${(translated / catalog.length * 100).toFixed(1)}%)`);
console.log(`  ${OUT_JS} → ${size(OUT_JS)}`);
console.log(`  ${join(OUT_MEDIA, 'details.json')} → ${size(join(OUT_MEDIA, 'details.json'))}`);
console.log(`  媒体署名：${meta.attribution}`);
