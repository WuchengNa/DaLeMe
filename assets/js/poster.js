/* 大了么 · 训练记录分享长图
 * 纯 Canvas 绘制，无第三方依赖。先测量排版，再一次性渲染，避免超高画布浪费内存。
 */
const W = 750;
const SCALE = 2; // 输出 1500px 宽的高清 PNG
const PAD = 56;
const INNER = W - PAD * 2;
const CARD_PAD = 26;
const CHIP_AREA = INNER - CARD_PAD * 2;
const FONT_FAMILY = "'HarmonyOS Sans SC','MiSans','PingFang SC','Microsoft YaHei',sans-serif";

const C = {
  bg: '#0d0a08',
  surface: '#171210',
  surface2: '#211913',
  line: 'rgba(255,255,255,.085)',
  text: '#f7efe8',
  text2: '#c6b6a9',
  muted: '#8e8074',
  accent: '#ff9b3f',
  accentSoft: 'rgba(255,155,63,.10)',
  accentLine: 'rgba(255,155,63,.22)',
  orange: '#ff7a59',
  orangeSoft: 'rgba(255,122,89,.12)',
  blue: '#6fb7ff',
};

function setFont(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
}

function wrapText(ctx, value, maxWidth, size, weight = 400) {
  setFont(ctx, size, weight);
  const lines = [];
  let line = '';
  for (const ch of String(value ?? '').replace(/\r/g, '')) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

function packChips(ctx, sets) {
  setFont(ctx, 17, 600);
  const rows = [];
  let row = [];
  let width = 0;
  for (const set of sets) {
    const w = Math.ceil(ctx.measureText(set.label).width) + 34;
    if (row.length && width + 10 + w > CHIP_AREA) {
      rows.push({ items: row, width });
      row = [];
      width = 0;
    }
    width += (row.length ? 10 : 0) + w;
    row.push({ ...set, w });
  }
  if (row.length) rows.push({ items: row, width });
  return rows;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function text(ctx, value, x, y, { size = 16, weight = 400, color = C.text, align = 'left', baseline = 'top' } = {}) {
  setFont(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(String(value ?? ''), x, y);
}

/** 计算所有区块的位置与高度（使用临时 2D 上下文测量文字） */
export function buildPosterLayout(data) {
  const m = document.createElement('canvas').getContext('2d');
  const blocks = [];
  let y = 0;
  const add = (block) => {
    blocks.push({ ...block, y });
    y += block.h;
  };

  y += 64;
  add({ type: 'brand', h: 56 });
  y += 44;

  const titleLines = wrapText(m, data.dayName || '训练记录', INNER - 16, 46, 700);
  add({ type: 'title', h: titleLines.length * 58 + 4, lines: titleLines });
  y += 14;
  add({ type: 'meta', h: 28 });
  y += 38;

  add({ type: 'stats', h: 164, items: data.stats || [] });
  y += 30;

  const prs = (data.prs || []).slice(0, 4);
  if (prs.length) {
    add({ type: 'prHead', h: 26 });
    y += 12;
    for (const pr of prs) {
      add({ type: 'pr', h: 48, pr });
      y += 8;
    }
    y += 20;
  }

  add({ type: 'section', h: 30, count: (data.exercises || []).length, sets: data.sets });
  y += 18;

  for (const [index, ex] of (data.exercises || []).entries()) {
    const nameLines = wrapText(m, ex.name, CHIP_AREA - 170, 23, 700);
    const noteLines = ex.note ? wrapText(m, ex.note, CHIP_AREA - 12, 15, 400) : [];
    const chipRows = packChips(m, ex.sets || []);
    const headH = Math.max(nameLines.length * 30, 34) + 24;
    const h =
      CARD_PAD +
      headH +
      14 +
      chipRows.length * 44 +
      (noteLines.length ? 12 + noteLines.length * 22 : 0) +
      CARD_PAD;
    add({ type: 'exercise', h, index: index + 1, ex, nameLines, noteLines, chipRows, headH });
    y += 16;
  }

  if (!(data.exercises || []).length) {
    add({ type: 'empty', h: 92 });
    y += 16;
  }

  if (data.notes) {
    const lines = wrapText(m, data.notes, INNER - CARD_PAD * 2, 16, 400);
    add({ type: 'notes', h: CARD_PAD * 2 + 34 + lines.length * 26, lines });
    y += 16;
  }

  y += 42;
  add({ type: 'footer', h: 128 });
  y += 56;

  return {
    blocks,
    height: y,
    width: W,
    shortDate: data.shortDate || '',
    meta: `${data.dateText || ''} · ${data.planName || ''}`,
    generatedAt: data.generatedAt || '',
  };
}

function drawBackground(ctx, height) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, height);

  let glow = ctx.createRadialGradient(W * 0.5, -60, 20, W * 0.5, -60, 560);
  glow.addColorStop(0, 'rgba(255,155,63,.13)');
  glow.addColorStop(1, 'rgba(255,155,63,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 620);

  glow = ctx.createRadialGradient(W * 0.92, height, 20, W * 0.92, height, 640);
  glow.addColorStop(0, 'rgba(255,176,102,.09)');
  glow.addColorStop(1, 'rgba(255,176,102,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, Math.max(0, height - 760), W, 760);
}

function drawLogo(ctx, x, y) {
  roundRect(ctx, x, y, 56, 56, 16, C.accent);
  ctx.save();
  ctx.translate(x + 8, y + 8);
  ctx.scale(40 / 32, 40 / 32);
  ctx.strokeStyle = '#2a1103';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(6, 13);
  ctx.lineTo(26, 13);
  ctx.moveTo(16, 6);
  ctx.lineTo(16, 18);
  ctx.moveTo(16, 18);
  ctx.lineTo(7, 27);
  ctx.moveTo(16, 18);
  ctx.lineTo(25, 27);
  ctx.stroke();
  ctx.restore();
}

function drawBlock(ctx, b, layout) {
  const x = PAD;
  const y = b.y;

  switch (b.type) {
    case 'brand': {
      drawLogo(ctx, x, y);
      text(ctx, '大了么', x + 76, y + 2, { size: 25, weight: 700 });
      text(ctx, 'DALEME · TRAINING LOG', x + 76, y + 34, { size: 12, weight: 600, color: C.muted });
      text(ctx, layout.shortDate, W - PAD, y + 20, {
        size: 14, weight: 500, color: C.muted, align: 'right', baseline: 'middle',
      });
      break;
    }
    case 'title': {
      b.lines.forEach((line, i) => {
        text(ctx, line, x, y + i * 58, { size: 46, weight: 700 });
      });
      break;
    }
    case 'meta': {
      roundRect(ctx, x, y + 3, 4, 20, 2, C.accent);
      text(ctx, layout.meta, x + 16, y + 3, { size: 16, weight: 500, color: C.text2 });
      break;
    }
    case 'stats': {
      roundRect(ctx, x, y, INNER, b.h, 22, C.surface, C.line);
      const colW = INNER / 4;
      for (let i = 1; i < 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(x + colW * i, y + 34);
        ctx.lineTo(x + colW * i, y + b.h - 34);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      b.items.forEach((item, i) => {
        const cx = x + colW * i + colW / 2;
        setFont(ctx, 28, 700);
        const vw = ctx.measureText(item.value).width;
        setFont(ctx, 13, 500);
        const uw = item.unit ? ctx.measureText(item.unit).width + 5 : 0;
        const start = cx - (vw + uw) / 2;
        text(ctx, item.value, start, y + 54, {
          size: 28, weight: 700, color: i === 1 ? C.accent : C.text, baseline: 'top',
        });
        if (item.unit) {
          text(ctx, item.unit, start + vw + 5, y + 70, { size: 13, weight: 500, color: C.muted });
        }
        text(ctx, item.label, cx, y + 106, { size: 13, weight: 500, color: C.muted, align: 'center' });
      });
      break;
    }
    case 'prHead': {
      roundRect(ctx, x, y + 4, 4, 18, 2, C.accent);
      text(ctx, '本次新纪录', x + 16, y + 2, { size: 17, weight: 700, color: C.accent });
      break;
    }
    case 'pr': {
      roundRect(ctx, x, y, INNER, b.h, 12, C.accentSoft, C.accentLine);
      roundRect(ctx, x + 14, y + 12, 40, 24, 7, C.accent);
      text(ctx, b.pr.isFirst ? 'NEW' : 'PR', x + 34, y + 24, {
        size: 11, weight: 800, color: '#2a1103', align: 'center', baseline: 'middle',
      });
      text(ctx, b.pr.name, x + 68, y + 15, { size: 16, weight: 600 });
      const detail = Number(b.pr.weight) > 0
        ? `${b.pr.weight}kg × ${b.pr.reps}`
        : `${b.pr.reps} 次`;
      text(ctx, b.pr.isFirst ? `首次记录 · ${detail}` : detail, W - PAD - 16, y + 16, {
        size: 15, weight: 600, color: C.accent, align: 'right',
      });
      break;
    }
    case 'section': {
      roundRect(ctx, x, y + 3, 4, 22, 2, C.accent);
      text(ctx, '动作明细', x + 16, y, { size: 21, weight: 700 });
      text(ctx, `${b.count} 个动作 · ${b.sets} 组`, W - PAD, y + 5, {
        size: 13, weight: 500, color: C.muted, align: 'right',
      });
      break;
    }
    case 'exercise': {
      const { ex } = b;
      roundRect(ctx, x, y, INNER, b.h, 20, C.surface, C.line);
      const color = ex.color || C.accent;
      ctx.beginPath();
      ctx.arc(x + CARD_PAD + 15, y + CARD_PAD + 16, 15, 0, Math.PI * 2);
      ctx.fillStyle = ex.soft || C.accentSoft;
      ctx.fill();
      text(ctx, b.index, x + CARD_PAD + 15, y + CARD_PAD + 16, {
        size: 14, weight: 700, color, align: 'center', baseline: 'middle',
      });

      const nameX = x + CARD_PAD + 44;
      b.nameLines.forEach((line, i) => {
        text(ctx, line, nameX, y + CARD_PAD + 2 + i * 30, { size: 22, weight: 700 });
      });
      text(ctx, ex.summary || '', W - PAD - CARD_PAD, y + CARD_PAD + 4, {
        size: 17, weight: 700, color: C.text2, align: 'right',
      });
      text(ctx, ex.summaryLabel || '', W - PAD - CARD_PAD, y + CARD_PAD + 28, {
        size: 11, weight: 500, color: C.muted, align: 'right',
      });
      text(ctx, ex.meta || '', nameX, y + CARD_PAD + 4 + b.headH - 24, {
        size: 13, weight: 500, color: C.muted,
      });

      let cy = y + CARD_PAD + b.headH + 14;
      for (const row of b.chipRows) {
        let cx = x + CARD_PAD;
        for (const chip of row.items) {
          roundRect(ctx, cx, cy, chip.w, 34, 10,
            chip.warmup ? C.orangeSoft : C.surface2,
            chip.warmup ? 'rgba(255,122,89,.25)' : C.line);
          text(ctx, chip.label, cx + chip.w / 2, cy + 17, {
            size: 16, weight: 600,
            color: chip.warmup ? C.orange : C.text,
            align: 'center', baseline: 'middle',
          });
          cx += chip.w + 10;
        }
        cy += 44;
      }

      if (b.noteLines.length) {
        cy += 4;
        roundRect(ctx, x + CARD_PAD, cy + 2, 3, b.noteLines.length * 22 - 6, 1.5, C.accent);
        b.noteLines.forEach((line, i) => {
          text(ctx, line, x + CARD_PAD + 12, cy + i * 22, {
            size: 15, weight: 400, color: C.text2,
          });
        });
      }
      break;
    }
    case 'empty': {
      roundRect(ctx, x, y, INNER, b.h, 18, C.surface, C.line);
      text(ctx, '这次训练没有留下可统计的组', W / 2, y + b.h / 2, {
        size: 16, color: C.muted, align: 'center', baseline: 'middle',
      });
      break;
    }
    case 'notes': {
      roundRect(ctx, x, y, INNER, b.h, 18, C.surface, C.line);
      text(ctx, '训练感受', x + CARD_PAD, y + CARD_PAD, { size: 15, weight: 700, color: C.accent });
      b.lines.forEach((line, i) => {
        text(ctx, line, x + CARD_PAD, y + CARD_PAD + 34 + i * 26, {
          size: 16, color: C.text2,
        });
      });
      break;
    }
    case 'footer': {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(W - PAD, y);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      roundRect(ctx, W / 2 - 18, y + 34, 36, 4, 2, C.accent);
      text(ctx, '每一次，都算数。', W / 2, y + 56, {
        size: 19, weight: 700, align: 'center',
      });
      text(ctx, '大了么 · 训练记录', W / 2, y + 90, {
        size: 13, weight: 500, color: C.muted, align: 'center',
      });
      text(ctx, layout.generatedAt, W / 2, y + 110, {
        size: 11, color: C.muted, align: 'center',
      });
      break;
    }
    default:
      break;
  }
}

/**
 * @param {object} data 归一化后的训练数据
 * @returns {Promise<{blob: Blob, dataUrl: string, width: number, height: number, logicalHeight: number}>}
 */
export async function renderWorkoutPoster(data) {
  const layout = buildPosterLayout(data);
  /* 极长的记录（动作很多）降到 1x，避免超大画布拖慢移动端 */
  const scale = layout.height > 9000 ? 1 : SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = Math.ceil(layout.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas');
  ctx.scale(scale, scale);

  drawBackground(ctx, layout.height);
  for (const block of layout.blocks) drawBlock(ctx, block, layout);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('图片生成失败'))),
      'image/png',
    );
  });
  const dataUrl = canvas.toDataURL('image/png');
  return {
    blob,
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    logicalHeight: layout.height,
  };
}
