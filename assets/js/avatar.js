/* 大了么 · 头像展示与编辑
 *
 * 头像以账号为单位存放在服务端，前端只负责：
 *  1) 把任意来源图片裁剪成 256×256 的 WebP/PNG；
 *  2) 上传后拿到版本串，用 /api/avatar?v=<版本> 展示（版本变化即绕过缓存）；
 *  3) 未设置头像或图片加载失败时，回退到用户名首字母。
 */
import { api } from './api.js';
import { getSyncState, setAvatarVersion } from './sync.js';
import { confirmDialog, icon, openSheet, showToast } from './ui.js';
import { clamp, esc, initials } from './utils.js';

const OUTPUT_SIZE = 256;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
/* 服务端上限 512 KB，base64 约膨胀 4/3，留少量余量 */
const MAX_ENCODED = 690 * 1024;

export function avatarSrc(version) {
  return `/api/avatar?v=${encodeURIComponent(version)}`;
}

function innerMarkup(version, name) {
  return version
    ? `<img class="avatar-photo" src="${avatarSrc(version)}" alt="" draggable="false" />`
    : `<span class="avatar-initials">${esc(initials(name))}</span>`;
}

/**
 * 生成头像元素。所有实例都带 data-avatar，方便上传后统一刷新。
 * @param {string} name 无头像时显示的首字母来源
 * @param {{size?: string, editable?: boolean, dot?: boolean, className?: string}} options
 */
export function avatarHtml(name, { size = '', editable = false, dot = false, className = '' } = {}) {
  const version = getSyncState().user?.avatarVersion || null;
  const classes = ['avatar', size, className].filter(Boolean).join(' ');
  const attrs = [
    `class="${classes}"`,
    'data-avatar',
    `data-avatar-name="${esc(name)}"`,
    editable ? 'data-avatar-edit role="button" tabindex="0" aria-label="更换头像"' : '',
    dot && getSyncState().user ? 'data-avatar-dot="1"' : '',
  ].filter(Boolean).join(' ');

  return `<span ${attrs}>
    ${innerMarkup(version, name)}
    ${dot && getSyncState().user ? '<i class="online-dot" aria-hidden="true"></i>' : ''}
    ${editable ? `<i class="avatar-edit-badge" aria-hidden="true">${icon('camera', 12)}</i>` : ''}
  </span>`;
}

/** 上传 / 删除后，原地刷新页面上所有头像，不打断当前页面状态 */
export function refreshAvatars() {
  const version = getSyncState().user?.avatarVersion || null;
  document.querySelectorAll('[data-avatar]').forEach((host) => {
    host.querySelector('.avatar-photo, .avatar-initials')?.remove();
    host.insertAdjacentHTML('afterbegin', innerMarkup(version, host.dataset.avatarName || ''));
  });
}

/* error 事件不冒泡，用捕获阶段统一处理：头像加载失败时退回首字母，避免破图 */
document.addEventListener('error', (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('avatar-photo')) return;
  const host = img.closest('[data-avatar]');
  if (!host) return;
  img.remove();
  if (!host.querySelector('.avatar-initials')) {
    host.insertAdjacentHTML(
      'afterbegin',
      `<span class="avatar-initials">${esc(initials(host.dataset.avatarName || ''))}</span>`,
    );
  }
}, true);

/* 事件委托：任意位置的「可编辑头像」点击都能打开编辑器，页面重渲染后依然生效 */
document.addEventListener('click', (event) => {
  const target = event.target?.closest?.('[data-avatar-edit]');
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  openAvatarSheet();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target?.closest?.('[data-avatar-edit]');
  if (!target) return;
  event.preventDefault();
  openAvatarSheet();
});

function loadViaDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取这个文件'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('无法识别这张图片，请换一张试试'));
      /* 用 data: URL，符合 CSP img-src 'self' data: */
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function decodeImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('图片不能超过 10 MB');
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* 部分浏览器对 createImageBitmap 的 EXIF 处理有差异，降级到 Image */
    }
  }
  return loadViaDataUrl(file);
}

function exportDataUrl(canvas) {
  let url = canvas.toDataURL('image/webp', 0.86);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/png');
  if ((url.split(',')[1] || '').length > MAX_ENCODED) {
    url = canvas.toDataURL('image/jpeg', 0.82);
  }
  return url;
}

export function openAvatarSheet() {
  const user = getSyncState().user;
  if (!user) return;
  const hadAvatar = !!user.avatarVersion;

  openSheet({
    title: '更换头像',
    subtitle: '选择一张照片，拖动或用滑块调整后保存。',
    size: 'sm',
    className: 'avatar-sheet',
    body: `<div class="avatar-editor">
      <div class="avatar-crop" data-avatar-crop>
        <canvas width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" data-avatar-canvas aria-label="头像预览"></canvas>
        <span class="avatar-crop-ring" aria-hidden="true"></span>
        <span class="avatar-crop-empty" data-avatar-empty>${icon('camera', 26)}<span>还没有选择图片</span></span>
      </div>
      <label class="avatar-zoom-row">
        <span>缩放</span>
        <input type="range" min="100" max="300" value="100" step="1" data-avatar-zoom aria-label="缩放图片" disabled />
      </label>
      <p class="avatar-editor-hint" data-avatar-hint>支持 JPG、PNG、WebP，最大 10 MB</p>
      <div class="avatar-editor-actions">
        <button type="button" class="btn btn-ghost" data-avatar-pick>${icon('upload', 15)} 选择图片</button>
        <button type="button" class="btn btn-ghost" data-avatar-remove ${hadAvatar ? '' : 'disabled'}>${icon('trash', 15)} 恢复默认</button>
      </div>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif" data-avatar-file hidden />
      <p class="auth-error" data-avatar-error></p>
    </div>`,
    footer: `<div class="btn-row">
      <button type="button" class="btn btn-ghost" data-sheet-close>取消</button>
      <button type="button" class="btn btn-primary" data-avatar-submit disabled>${icon('check', 16)} 保存头像</button>
    </div>`,
    onMount: (sheet, close) => {
      const canvas = sheet.querySelector('[data-avatar-canvas]');
      const ctx = canvas.getContext('2d');
      const crop = sheet.querySelector('[data-avatar-crop]');
      const empty = sheet.querySelector('[data-avatar-empty]');
      const zoom = sheet.querySelector('[data-avatar-zoom]');
      const hint = sheet.querySelector('[data-avatar-hint]');
      const fileInput = sheet.querySelector('[data-avatar-file]');
      const submit = sheet.querySelector('[data-avatar-submit]');
      const removeBtn = sheet.querySelector('[data-avatar-remove]');
      const errorEl = sheet.querySelector('[data-avatar-error]');

      let source = null;
      let scale = 1;
      let offsetX = 0;
      let offsetY = 0;
      let dragging = false;
      let pointerId = null;
      let lastX = 0;
      let lastY = 0;
      let working = false;

      const showError = (message) => {
        errorEl.textContent = message;
        errorEl.classList.add('show');
      };
      const clearError = () => {
        errorEl.textContent = '';
        errorEl.classList.remove('show');
      };

      function draw() {
        ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        if (!source) return;
        const iw = source.naturalWidth || source.width;
        const ih = source.naturalHeight || source.height;
        const s = Math.max(OUTPUT_SIZE / iw, OUTPUT_SIZE / ih) * scale;
        const dw = iw * s;
        const dh = ih * s;
        offsetX = clamp(offsetX, -Math.max(0, (dw - OUTPUT_SIZE) / 2), Math.max(0, (dw - OUTPUT_SIZE) / 2));
        offsetY = clamp(offsetY, -Math.max(0, (dh - OUTPUT_SIZE) / 2), Math.max(0, (dh - OUTPUT_SIZE) / 2));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, (OUTPUT_SIZE - dw) / 2 + offsetX, (OUTPUT_SIZE - dh) / 2 + offsetY, dw, dh);
      }

      function useSource(next) {
        if (source && typeof source.close === 'function') source.close();
        source = next;
        scale = 1;
        offsetX = 0;
        offsetY = 0;
        zoom.value = '100';
        zoom.disabled = false;
        submit.disabled = false;
        empty.hidden = true;
        hint.textContent = '拖动图片调整位置，滑动下方滑块缩放';
        clearError();
        draw();
      }

      /* 已有头像时先载入当前图片，用户可直接微调，也可另选新图 */
      if (user.avatarVersion) {
        const current = new Image();
        current.onload = () => { if (!source) useSource(current); };
        current.src = avatarSrc(user.avatarVersion);
      }

      sheet.querySelector('[data-avatar-pick]').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        try {
          useSource(await decodeImage(file));
        } catch (error) {
          showError(error.message || '无法读取这张图片');
        }
      });

      zoom.addEventListener('input', () => {
        scale = Number(zoom.value) / 100;
        draw();
      });
      crop.addEventListener('wheel', (event) => {
        if (!source) return;
        event.preventDefault();
        zoom.value = String(clamp(Number(zoom.value) + (event.deltaY > 0 ? -6 : 6), 100, 300));
        scale = Number(zoom.value) / 100;
        draw();
      }, { passive: false });

      crop.addEventListener('pointerdown', (event) => {
        if (!source || working) return;
        dragging = true;
        pointerId = event.pointerId;
        lastX = event.clientX;
        lastY = event.clientY;
        crop.classList.add('dragging');
        try { crop.setPointerCapture(event.pointerId); } catch { /* 浏览器不支持时忽略 */ }
      });
      crop.addEventListener('pointermove', (event) => {
        if (!dragging || event.pointerId !== pointerId) return;
        const ratio = OUTPUT_SIZE / Math.max(1, crop.clientWidth);
        offsetX += (event.clientX - lastX) * ratio;
        offsetY += (event.clientY - lastY) * ratio;
        lastX = event.clientX;
        lastY = event.clientY;
        draw();
      });
      const endDrag = (event) => {
        if (event.pointerId !== pointerId) return;
        dragging = false;
        crop.classList.remove('dragging');
      };
      crop.addEventListener('pointerup', endDrag);
      crop.addEventListener('pointercancel', endDrag);

      submit.addEventListener('click', async () => {
        if (!source || working) return;
        working = true;
        const original = submit.innerHTML;
        submit.disabled = true;
        submit.textContent = '保存中…';
        clearError();
        try {
          const result = await api.uploadAvatar(exportDataUrl(canvas));
          setAvatarVersion(result.avatarVersion);
          refreshAvatars();
          close();
          showToast('头像已更新');
        } catch (error) {
          showError(error.message || '保存失败，请稍后重试');
          submit.disabled = false;
          submit.innerHTML = original;
        } finally {
          working = false;
        }
      });

      removeBtn.addEventListener('click', async () => {
        if (working || removeBtn.disabled) return;
        const confirmed = await confirmDialog({
          title: '恢复默认头像？',
          message: '当前头像会被移除，训练记录不受影响。',
          confirmText: '恢复默认',
          danger: true,
          iconName: 'trash',
        });
        if (!confirmed) return;
        working = true;
        removeBtn.disabled = true;
        clearError();
        try {
          await api.deleteAvatar();
          setAvatarVersion(null);
          refreshAvatars();
          close();
          showToast('已恢复默认头像', 'info');
        } catch (error) {
          showError(error.message || '操作失败，请稍后重试');
          removeBtn.disabled = false;
        } finally {
          working = false;
        }
      });
    },
  });
}
