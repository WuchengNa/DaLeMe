/* 大了么 · 身体信息读取与 BMI 刻度卡片 */
import { getState, latestBodyWeight } from './store.js';
import {
  bmiBand,
  bmiPercent,
  bmiScale,
  computeBmi,
  genderLabel,
  healthyWeightRange,
} from './bmi.js';
import { icon } from './ui.js';
import { esc } from './utils.js';

/** 体重取最新一次体测记录，避免与体重趋势产生两份互相矛盾的数据 */
export function getBodyProfile() {
  const settings = getState().settings;
  const record = latestBodyWeight();
  const height = Number(settings.height) || null;
  const weight = record ? Number(record.weight) : null;
  const bmi = computeBmi(height, weight);
  return {
    height,
    weight,
    gender: settings.gender || 'unset',
    bmi,
    band: bmiBand(bmi, settings.gender || 'unset'),
    healthy: healthyWeightRange(height, settings.gender || 'unset'),
    recordedAt: record?.date || null,
  };
}

function emptyCardHtml() {
  return `<section class="card bmi-card is-empty">
    <div class="bmi-empty">
      <span class="bmi-empty-icon">${icon('scale', 22)}</span>
      <div class="bmi-empty-text">
        <strong>补充身高与体重，查看 BMI</strong>
        <p>按中国成人标准显示刻度与当前所处区间</p>
      </div>
      <a class="btn btn-primary" href="#/profile/body">去填写</a>
    </div>
  </section>`;
}

/**
 * BMI 卡片：大数值 → 四段标准刻度 → 当前位置指针 → 区间图例 → 健康体重范围。
 * @param {ReturnType<getBodyProfile>} profile
 * @param {{link?: boolean}} options 是否显示「完善资料」入口
 */
export function bmiCardHtml(profile, { link = true } = {}) {
  if (profile.bmi == null) return emptyCardHtml();

  const { segments, ticks } = bmiScale(profile.gender);
  const percent = bmiPercent(profile.bmi);
  const band = profile.band || bmiBand(profile.bmi, profile.gender);
  const gender = profile.gender || 'unset';
  const standardNote = gender === 'male'
    ? '标准刻度：男性 BMI 分界值 18.5 / 25 / 28，仅供参考，不替代医学诊断。'
    : '标准刻度：BMI 分界值 18.5 / 24 / 28，仅供参考，不替代医学诊断。';
  const meta = [
    profile.height ? `身高 ${profile.height} cm` : '',
    profile.weight ? `体重 ${profile.weight.toFixed(1)} kg` : '',
    `性别 ${genderLabel(profile.gender)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<section class="card bmi-card">
    <div class="bmi-card-head">
      <div>
        <span class="eyebrow">BODY MASS INDEX</span>
        <div class="bmi-number">
          <b>${profile.bmi.toFixed(1)}</b>
          <span class="bmi-band ${band.key}">${esc(band.label)}</span>
        </div>
        <p class="bmi-meta">${esc(meta)}</p>
      </div>
      ${link ? `<a class="bmi-card-link" href="#/profile/body">完善资料 ${icon('chevron-right', 13)}</a>` : ''}
    </div>

    <div class="bmi-gauge">
      <div class="bmi-marker" style="left:${percent.toFixed(2)}%">
        <span class="bmi-marker-value">${profile.bmi.toFixed(1)}</span>
        <i class="bmi-marker-pin"></i>
      </div>
      <div class="bmi-track">
        ${segments
          .map((seg) => `<i class="bmi-seg ${seg.key}" style="width:${seg.width}%"></i>`)
          .join('')}
      </div>
      <div class="bmi-ticks">
        ${ticks
          .map((tick) => `<span style="left:${tick.percent}%">${esc(tick.value)}</span>`)
          .join('')}
      </div>
    </div>

    <div class="bmi-legend">
      ${segments
        .map((seg) => `<span><i class="${seg.key}"></i>${seg.label} ${esc(seg.hint)}</span>`)
        .join('')}
    </div>

    ${
      profile.healthy
        ? `<p class="bmi-note">按身高 ${profile.height} cm 计算，健康体重范围 <b>${profile.healthy.min.toFixed(1)} – ${profile.healthy.max.toFixed(1)} kg</b></p>`
        : ''
    }
    <p class="bmi-standard">${esc(standardNote)}</p>
  </section>`;
}
