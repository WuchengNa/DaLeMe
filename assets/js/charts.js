/* 大了么 · 轻量 SVG 图表 */
import { esc, fmtVolume } from './utils.js';

function niceMax(value) {
  const n = Math.max(1, Number(value) || 0);
  const exponent = Math.floor(Math.log10(n));
  const fraction = n / 10 ** exponent;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const niceFraction = steps.find((step) => fraction <= step) || 10;
  return niceFraction * 10 ** exponent;
}

function niceStep(value) {
  const n = Math.max(0.0001, Number(value) || 0);
  const exponent = Math.floor(Math.log10(n));
  const fraction = n / 10 ** exponent;
  const steps = [1, 2, 2.5, 5, 10];
  const niceFraction = steps.find((step) => fraction <= step) || 10;
  return niceFraction * 10 ** exponent;
}

function axisShort(value) {
  const n = Number(value) || 0;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}t`;
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 10) return n.toFixed(1).replace(/\.0$/, '');
  return n.toFixed(1);
}

export function barChart(data, { height = 230, color = 'var(--accent)', valueFormat = (v) => fmtVolume(v) } = {}) {
  if (!data.length) return '<div class="chart-empty">暂无数据</div>';
  const width = 680;
  const pad = { top: 18, right: 12, bottom: 30, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((d) => Number(d.value) || 0)));
  const slot = plotW / data.length;
  const barW = Math.min(38, slot * 0.52);
  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const y = pad.top + (plotH / ticks) * i;
    const value = max - (max / ticks) * i;
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--line)" stroke-dasharray="${i === ticks ? '0' : '3 5'}"/>
      <text x="${pad.left - 8}" y="${y + 3}" text-anchor="end">${axisShort(value)}</text>`;
  }).join('');

  const bars = data
    .map((d, index) => {
      const value = Number(d.value) || 0;
      const h = Math.max(value > 0 ? 3 : 0, (value / max) * plotH);
      const x = pad.left + slot * index + (slot - barW) / 2;
      const y = pad.top + plotH - h;
      const active = index === data.length - 1;
      const labelEvery = data.length > 10 ? 2 : 1;
      const label =
        index % labelEvery === 0 || index === data.length - 1
          ? `<text x="${x + barW / 2}" y="${height - 10}" text-anchor="middle">${esc(d.label)}</text>`
          : '';
      return `<g class="chart-bar" style="color:${color}">
        <title>${esc(d.tooltip || `${d.label}：${valueFormat(value)}`)}</title>
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="currentColor" opacity="${active ? 1 : 0.52}"/>
        ${value > 0 ? `<text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" style="font-size:8.5px">${axisShort(value)}</text>` : ''}
        ${label}
      </g>`;
    })
    .join('');

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="训练容量柱状图">
    ${grid}${bars}
  </svg>`;
}

export function lineChart(points, { height = 210, color = 'var(--accent)', valueFormat = (v) => String(v), unit = '' } = {}) {
  if (!points.length) return '<div class="chart-empty">暂无数据</div>';
  if (points.length === 1) {
    return `<div class="chart-single">
      <span class="chart-single-value">${esc(valueFormat(points[0].value))}${esc(unit)}</span>
      <span class="chart-single-label">${esc(points[0].label || '')}</span>
      <p>再记录一次，就能看到变化趋势</p>
    </div>`;
  }
  const width = 680;
  const pad = { top: 16, right: 14, bottom: 26, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = points.map((p) => Number(p.value) || 0);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  const padding = Math.max((rawMax - rawMin) * 0.2, Math.max(0.5, rawMax * 0.015));
  const step = niceStep((rawMax + padding - Math.max(0, rawMin - padding)) / 4);
  const max = Math.ceil((rawMax + padding) / step) * step;
  const min = Math.max(0, Math.floor((rawMin - padding) / step) * step);
  const range = max - min || 1;
  const xFor = (i) => pad.left + (plotW / (points.length - 1)) * i;
  const yFor = (v) => pad.top + plotH - ((v - min) / range) * plotH;

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const y = pad.top + (plotH / ticks) * i;
    const value = max - (range / ticks) * i;
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--line)" stroke-dasharray="${i === ticks ? '0' : '3 5'}"/>
      <text x="${pad.left - 8}" y="${y + 3}" text-anchor="end">${axisShort(value)}</text>`;
  }).join('');

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(values[i]).toFixed(1)}`).join(' ');
  const area = `${path} L${xFor(points.length - 1).toFixed(1)},${pad.top + plotH} L${pad.left},${pad.top + plotH} Z`;
  const gradientId = `line-grad-${Math.random().toString(36).slice(2, 8)}`;

  const dots = points
    .map((p, i) => {
      const show = points.length <= 12 || i === 0 || i === points.length - 1 || i === points.length - 2;
      if (!show) return '';
      const x = xFor(i);
      const y = yFor(values[i]);
      return `<g class="chart-dot" style="color:${color}">
        <title>${esc(p.tooltip || `${p.label}：${valueFormat(values[i])}${unit}`)}</title>
        <circle cx="${x}" cy="${y}" r="8" fill="currentColor" opacity=".12"/>
        <circle cx="${x}" cy="${y}" r="3.4" fill="currentColor" stroke="var(--surface)" stroke-width="1.5"/>
      </g>`;
    })
    .join('');

  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const labels = points
    .map((p, i) => {
      if (i % labelEvery !== 0 && i !== points.length - 1) return '';
      return `<text x="${xFor(i)}" y="${height - 8}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${esc(p.label || '')}</text>`;
    })
    .join('');

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" style="color:${color}" role="img" aria-label="训练趋势折线图">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="currentColor" stop-opacity=".22"/>
        <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <g>
      ${grid}
      <path d="${area}" fill="url(#${gradientId})" stroke="none"/>
      <path d="${path}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${labels}
    </g>
  </svg>`;
}

export function sparkline(values, { width = 220, height = 48, color = 'var(--accent)' } = {}) {
  if (!values.length) return '';
  if (values.length === 1) values = [values[0], values[0]];
  const pad = 4;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const xFor = (i) => pad + ((width - pad * 2) / (values.length - 1)) * i;
  const yFor = (v) => pad + (height - pad * 2) * (1 - (v - min) / range);
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
  const area = `${path} L${width - pad},${height - pad} L${pad},${height - pad} Z`;
  const id = `spark-${Math.random().toString(36).slice(2, 7)}`;
  return `<svg class="body-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="color:${color}" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="currentColor" stop-opacity=".2"/>
      <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/>
    <path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${xFor(values.length - 1)}" cy="${yFor(values[values.length - 1])}" r="2.6" fill="currentColor"/>
  </svg>`;
}
