/* 大了么 · 动作库中文映射表（供 scripts/import-exercises.mjs 生成目录使用）
 *
 * 上游 exercises-dataset 的字段为英文，这里把部位 / 器械 / 目标肌群翻译成
 * 中文，并对动作名称做「短语优先 + 完整度校验」的翻译：只有当名称中所有
 * 实义词都能命中词典时才采用中文名，否则保留英文原名，避免出现半中半英。
 */

export const BODY_PART_LABELS = {
  'upper arms': '上臂',
  'upper legs': '大腿',
  back: '背部',
  waist: '腰腹',
  chest: '胸部',
  shoulders: '肩部',
  'lower legs': '小腿',
  'lower arms': '前臂',
  cardio: '有氧',
  neck: '颈部',
};

/* 数据集的 body_part → 应用内部 muscle key */
export const BODY_PART_KEYS = {
  'upper arms': 'upper_arms',
  'upper legs': 'upper_legs',
  back: 'back',
  waist: 'waist',
  chest: 'chest',
  shoulders: 'shoulders',
  'lower legs': 'lower_legs',
  'lower arms': 'lower_arms',
  cardio: 'cardio',
  neck: 'neck',
};

export const EQUIPMENT_LABELS = {
  'body weight': '自重',
  cable: '绳索',
  'leverage machine': '固定器械',
  assisted: '辅助器械',
  'medicine ball': '药球',
  'stability ball': '稳定球',
  band: '弹力带',
  barbell: '杠铃',
  rope: '绳索',
  dumbbell: '哑铃',
  'ez barbell': '曲杆杠铃',
  'sled machine': '雪橇机',
  'upper body ergometer': '上肢训练机',
  kettlebell: '壶铃',
  'olympic barbell': '奥林匹克杠铃',
  weighted: '负重',
  'bosu ball': '平衡半球',
  'resistance band': '弹力带',
  roller: '泡沫轴',
  'skierg machine': '滑雪机',
  hammer: '锤铃',
  'smith machine': '史密斯架',
  'wheel roller': '健腹轮',
  'stationary bike': '健身车',
  tire: '轮胎',
  'trap bar': '六角杠铃',
  'elliptical machine': '椭圆机',
  'stepmill machine': '登山机',
};

export const TARGET_LABELS = {
  abs: '腹肌',
  quads: '股四头肌',
  lats: '背阔肌',
  calves: '小腿肌',
  pectorals: '胸大肌',
  glutes: '臀肌',
  hamstrings: '腘绳肌',
  adductors: '内收肌',
  triceps: '肱三头肌',
  'cardiovascular system': '心肺',
  spine: '竖脊肌',
  'upper back': '上背',
  biceps: '肱二头肌',
  delts: '三角肌',
  forearms: '前臂肌',
  traps: '斜方肌',
  'serratus anterior': '前锯肌',
  abductors: '外展肌',
  'levator scapulae': '肩胛提肌',
};

export const MUSCLE_GROUP_LABELS = {
  'hip flexors': '髋屈肌',
  obliques: '腹斜肌',
  hamstrings: '腘绳肌',
  biceps: '肱二头肌',
  'ankle stabilizers': '踝稳定肌',
  triceps: '肱三头肌',
  shoulders: '肩部',
  glutes: '臀肌',
  quadriceps: '股四头肌',
  chest: '胸大肌',
  calves: '小腿肌',
  forearms: '前臂肌',
  'lower back': '下背',
  traps: '斜方肌',
  'upper back': '上背',
  ankles: '踝部',
  trapezius: '斜方肌',
  deltoids: '三角肌',
  core: '核心',
  rhomboids: '菱形肌',
  'rotator cuff': '肩袖',
  'wrist flexors': '腕屈肌',
  'wrist extensors': '腕伸肌',
  'latissimus dorsi': '背阔肌',
  abdominals: '腹肌',
  lats: '背阔肌',
  soleus: '比目鱼肌',
  wrists: '手腕',
  hands: '手部',
};

/* ------------------------------------------------------------------
   动作名称词典。短语越靠前、越长越优先匹配（生成器会按 token 数排序）。
   值为 '' 表示该函数词直接丢弃（on / with / the ...）。
   ------------------------------------------------------------------ */
export const NAME_PHRASES = [
  // 复合动作 / 固定短语（优先）
  ['clean grip', '抓举握'], ['rack pull', '架上硬拉'],
  ['skull crusher', '仰卧臂屈伸'], ['skullcrusher', '仰卧臂屈伸'],
  ['pelvic tilt', '骨盆倾斜'], ['all fours', '四点跪姿'],
  ['jack knife', '折刀'], ['balance board', '平衡板'],
  ['air bike', '风阻单车'], ['rectus femoris', '股直肌'],
  ['pectoralis major', '胸大肌'], ['back lever', '后水平'],
  ['front lever', '前水平'], ['wheel rollerout', '健腹轮'],
  ['bent over row', '俯身划船'], ['bent over', '俯身'],
  ['behind the neck', '颈后'], ['behind neck', '颈后'],
  ['good morning', '早安式'], ['russian twist', '俄罗斯转体'],
  ['arnold press', '阿诺德推举'], ['military press', '实力推举'],
  ['bench press', '卧推'], ['incline bench', '上斜卧推'], ['decline bench', '下斜卧推'],
  ['close grip', '窄握'], ['wide grip', '宽握'], ['reverse grip', '反握'],
  ['neutral grip', '对握'], ['underhand', '反握'], ['overhand', '正握'],
  ['preacher curl', '牧师凳弯举'], ['concentration curl', '集中弯举'],
  ['hammer curl', '锤式弯举'], ['reverse curl', '反握弯举'],
  ['zottman curl', '佐特曼弯举'], ['spider curl', '蜘蛛弯举'],
  ['wrist curl', '腕弯举'], ['leg curl', '腿弯举'],
  ['bicep curl', '二头弯举'], ['biceps curl', '二头弯举'],
  ['triceps extension', '三头臂屈伸'], ['tricep extension', '三头臂屈伸'],
  ['leg extension', '腿屈伸'], ['hip extension', '髋伸展'],
  ['back extension', '背屈伸'], ['hyperextension', '背屈伸'],
  ['triceps pushdown', '三头下压'], ['pushdown', '下压'],
  ['lat pulldown', '高位下拉'], ['pulldown', '下拉'],
  ['pull up', '引体向上'], ['pullup', '引体向上'],
  ['chin up', '反握引体向上'], ['chinup', '反握引体向上'],
  ['push up', '俯卧撑'], ['pushup', '俯卧撑'],
  ['sit up', '仰卧起坐'], ['situp', '仰卧起坐'],
  ['leg raise', '举腿'], ['knee raise', '举膝'], ['calf raise', '提踵'],
  ['lateral raise', '侧平举'], ['front raise', '前平举'],
  ['rear delt', '三角肌后束'], ['side raise', '侧平举'],
  ['shoulder press', '肩推'], ['overhead press', '过头推举'],
  ['chest press', '推胸'], ['chest fly', '夹胸'], ['chest dip', '双杠臂屈伸'],
  ['leg press', '腿举'], ['hack squat', '哈克深蹲'], ['front squat', '前蹲'],
  ['split squat', '分腿蹲'], ['sumo squat', '相扑深蹲'],
  ['bulgarian split squat', '保加利亚分腿蹲'],
  ['romanian deadlift', '罗马尼亚硬拉'], ['stiff leg deadlift', '直腿硬拉'],
  ['deadlift', '硬拉'], ['squat', '深蹲'],
  ['hip thrust', '臀推'], ['glute bridge', '臀桥'], ['hip bridge', '臀桥'],
  ['glute kickback', '臀后踢'], ['kickback', '后伸'],
  ['step up', '登阶'], ['stepmill', '登山机'],
  ['muscle up', '双力臂'], ['burpee', '波比跳'],
  ['plank', '平板支撑'], ['crunch', '卷腹'], ['twist', '转体'],
  ['pullover', '仰卧上拉'], ['upright row', '直立划船'],
  ['face pull', '面拉'], ['shrug', '耸肩'], ['swing', '摆荡'],
  ['snatch', '抓举'], ['clean and jerk', '挺举'], ['clean', '翻站'], ['jerk', '挺举'],
  ['pullover', '上拉'], ['dip', '双杠臂屈伸'], ['dips', '双杠臂屈伸'],
  ['curl', '弯举'], ['curls', '弯举'], ['row', '划船'], ['press', '推举'],
  ['fly', '飞鸟'], ['flyes', '飞鸟'], ['raise', '抬起'],
  ['pulley', '滑轮'], ['pullover machine', '器械上拉'],
  ['calf', '小腿'], ['calves', '小腿'],
  ['heel touchers', '脚跟触碰'], ['toe touch', '触脚'],
  ['leg circles', '腿部绕环'], ['ankle circles', '踝绕环'],
  ['arm circles', '手臂绕环'], ['circles', '绕环'],
  ['side bend', '体侧屈'], ['bend', '屈伸'],
  ['russian', '俄罗斯'], ['turkish get up', '土耳其起立'],
  ['wall', '靠墙'], ['floor', '地面'], ['chair', '椅上'],
  ['rope', '绳索'], ['attachment', '把手'], ['bar', '杠'], ['bars', '双杠'],
  ['overhead', '过头'], ['upside down', '倒立'], ['upright', '直立'],
  ['piriformis', '梨状肌'], ['gluteus', '臀肌'], ['adductor', '内收肌'],
  ['abductor', '外展肌'], ['oblique', '腹斜肌'], ['scapula', '肩胛'],
  ['bicycle', '单车'], ['bike', '健身车'], ['board', '板'],
  ['fixed', '固定'], ['pallof', '帕洛夫'], ['y raise', 'Y 字抬起'],
  ['y', 'Y'], ['skull', '仰卧臂屈伸'], ['drag', '拖拽'],
  ['zercher', '泽奇'], ['guillotine', '断头台'], ['jefferson', '杰斐逊'],
  ['pendlay', '潘德雷'], ['jm', 'JM'], ['pin', '架上'], ['rack', '架上'],
  ['windmill', '风车'], ['flat', '平板'], ['pelvic', '骨盆'], ['tilt', '倾斜'],
  ['reach', '伸展'], ['self', '自身'], ['raises', '抬起'], ['slingers', '悬摆'],
  ['jumps', '跳跃'], ['astride', '分腿'], ['forth', '前'], ['pec', '胸'],
  ['squad', '深蹲'], ['fours', '四点'], ['all', '全'], ['rollerout', '滚轮'],
  ['pulse', '脉冲'], ['squeeze', '挤压'], ['bridge', '臀桥'],
  ['bench', '卧推凳'], ['ball', '球'], ['band', '弹力带'],
  ['resistance band', '弹力带'], ['body weight', '自重'], ['bodyweight', '自重'],
  ['ez barbell', '曲杆杠铃'], ['olympic barbell', '奥林匹克杠铃'], ['trap bar', '六角杠铃'],
  ['smith machine', '史密斯架'], ['smith', '史密斯'], ['leverage machine', '固定器械'],
  ['lever', '杠杆'], ['sled machine', '雪橇机'], ['sled', '雪橇'],
  ['stability ball', '稳定球'], ['medicine ball', '药球'], ['bosu ball', '平衡半球'],
  ['wheel roller', '健腹轮'], ['roller', '泡沫轴'], ['rollerout', '滚轮'],
  ['kettlebell', '壶铃'], ['dumbbell', '哑铃'], ['barbell', '杠铃'], ['cable', '绳索'],
  ['machine', '器械'], ['assisted', '辅助'], ['weighted', '负重'], ['hammer', '锤式'],
  ['tire', '轮胎'], ['towel', '毛巾'], ['bike', '健身车'],
  ['elliptical', '椭圆机'], ['skierg', '滑雪机'], ['ergometer', '训练机'],
  // 姿态 / 变式
  ['incline', '上斜'], ['decline', '下斜'], ['seated', '坐姿'], ['standing', '站姿'],
  ['lying', '仰卧'], ['prone', '俯卧'], ['supine', '仰卧'], ['kneeling', '跪姿'],
  ['hanging', '悬垂'], ['suspended', '悬吊'], ['inverted', '倒立'],
  ['single arm', '单臂'], ['one arm', '单臂'], ['two arm', '双臂'], ['double arm', '双臂'],
  ['single leg', '单腿'], ['one leg', '单腿'], ['two legs', '双腿'],
  ['alternate', '交替'], ['alternating', '交替'], ['twisting', '转体'],
  ['reverse', '反向'], ['revers', '反向'], ['inverse', '反向'],
  ['bent knee', '屈膝'], ['straight leg', '直腿'], ['straight arm', '直臂'],
  ['straight', '直'], ['bent', '屈'], ['extended', '伸展'], ['raised', '抬升'],
  ['parallel', '平行'], ['close', '窄'], ['wide', '宽'], ['narrow', '窄'],
  ['high', '高位'], ['low', '低位'], ['full', '全程'], ['half', '半程'],
  ['front', '前'], ['rear', '后'], ['side', '侧'], ['lateral', '侧'],
  ['inner', '内侧'], ['outer', '外侧'], ['upper', '上'], ['lower', '下'],
  ['vertical', '垂直'], ['horizontal', '水平'], ['circular', '绕环'],
  ['cross', '交叉'], ['archer', '弓箭手'], ['frog', '蛙式'], ['pike', '屈体'],
  ['spider', '蜘蛛'], ['donkey', '驴式'], ['sumo', '相扑'], ['plyo', '爆发'],
  ['french', '法式'], ['zottman', '佐特曼'], ['arnold', '阿诺德'],
  ['abduction', '外展'], ['adduction', '内收'], ['rotation', '旋转'],
  ['internal rotation', '内旋'], ['external rotation', '外旋'],
  ['stretch', '拉伸'], ['motion', '动作'], ['exercise', '练习'],
  ['range of motion', '全程'],
  // 身体部位
  ['cardiovascular system', '心肺'], ['cardio', '有氧'],
  ['chest', '胸'], ['shoulder', '肩'], ['shoulders', '肩'], ['back', '背'],
  ['biceps', '肱二头肌'], ['bicep', '肱二头肌'], ['triceps', '肱三头肌'], ['tricep', '肱三头肌'],
  ['delt', '三角肌'], ['delts', '三角肌'], ['lat', '背阔肌'], ['lats', '背阔肌'],
  ['quads', '股四头肌'], ['quad', '股四头肌'], ['hamstring', '腘绳肌'],
  ['glute', '臀'], ['glutes', '臀'], ['hip', '髋'], ['abs', '腹肌'], ['abdominal', '腹'],
  ['wrist', '手腕'], ['forearm', '前臂'], ['forearms', '前臂'], ['neck', '颈部'],
  ['knee', '膝'], ['knees', '膝'], ['toe', '脚尖'], ['heel', '脚跟'],
  ['leg', '腿'], ['legs', '腿'], ['arm', '手臂'], ['arms', '手臂'],
  ['elbow', '肘'], ['head', '头部'], ['hand', '手'], ['hands', '双手'],
  ['palm', '掌心'], ['palms', '掌心'], ['body', '身体'],
  // 动作通用词
  ['lift', '上举'], ['drop', '下落'], ['throw', '抛'], ['touch', '触碰'], ['tap', '轻触'],
  ['jump', '跳跃'], ['jumping', '跳跃'], ['jack', '开合跳'], ['walk', '行走'],
  ['walking', '行走'], ['run', '跑步'], ['kick', '踢'], ['swing', '摆荡'],
  ['push', '推'], ['pull', '拉'], ['hold', '保持'], ['support', '支撑'],
  ['extension', '伸展'], ['flexor', '屈肌'], ['blaster', '强化'],
  ['pose', '姿势'], ['stance', '站姿'], ['squad', ' squad'],
  ['hang', '悬垂'], ['dip', '臂屈伸'], ['twist', '转体'], ['bridge', '桥'],
  ['lunge', '箭步蹲'], ['split', '分腿'], ['step', '踏步'], ['squatting', '蹲'],
  ['clean', '翻站'], ['snatch', '抓举'], ['planche', '俄式挺身'],
  ['handstand', '倒立'], ['male', '（男）'], ['female', '（女）'],
  ['one', '单'], ['single', '单'], ['two', '双'], ['double', '双'],
  ['alternating heel touchers', '交替脚跟触碰'],
  ['v up', 'V 字两头起'], ['up', '上'], ['down', '下'], ['over', '越过'],
  ['through', '穿过'], ['between', '之间'], ['from', '从'],
  ['with', ''], ['on', ''], ['in', ''], ['to', ''], ['and', ''], ['of', ''],
  ['the', ''], ['a', ''], ['at', ''], ['for', ''], ['pov', ''], ['v', 'V'],
  ['v.', ''], ['t', 'T'], ['ups', '起'], ['sit', '坐'],
  ['against', ''], ['apart', '分开'], ['together', '并拢'],
  ['bent over', '俯身'], ['over', '过'], ['forward', '向前'], ['backward', '向后'],
];

/** 归一化：统一小写、括号与连字符转空格，便于短语匹配 */
export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/([a-z])-([a-z])/g, '$1 $2')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PHRASES = NAME_PHRASES.map(([en, zh]) => [normalizeName(en).split(' '), zh])
  .filter(([tokens]) => tokens.length && tokens[0])
  .sort((a, b) => b[0].length - a[0].length || b[0].join('').length - a[0].join('').length);

/** 数字 / 角度 / 型号等「非实义词」允许保留在中文名里（含上游少量乱码字符） */
const isNumericToken = (token) => !/[a-z]/i.test(token);

/** 中文与拉丁字符相邻时补空格，避免「交替V 字两头起」这类粘连 */
function joinParts(parts) {
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    const prev = out.slice(-1);
    const next = part[0];
    const boundary = prev && /[A-Za-z0-9]/.test(prev) && /[A-Za-z0-9]/.test(next);
    if (boundary) out += ' ';
    out += part;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * 翻译动作名。仅当所有实义词都命中词典时返回中文名，否则返回空串，
 * 由调用方保留英文原名，避免出现「杠铃 bench press」这类半吊子译名。
 */
export function translateName(name) {
  const tokens = normalizeName(name).split(' ').filter(Boolean);
  const parts = [];
  const leftovers = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (const [phrase, zh] of PHRASES) {
      if (i + phrase.length > tokens.length) continue;
      if (phrase.every((word, offset) => tokens[i + offset] === word)) {
        if (zh) parts.push(zh);
        i += phrase.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const token = tokens[i];
    if (isNumericToken(token)) {
      parts.push(`${token} `);
      i += 1;
      continue;
    }
    leftovers.push(token);
    i += 1;
  }
  if (leftovers.length) return '';
  const chinese = joinParts(parts);
  // 至少要译出一个中文词，纯数字 / 空串不算有效译名
  return /[\u4e00-\u9fa5]/.test(chinese) ? chinese : '';
}
