/* 大了么 · 社交模块前端共享件
 * 广场卡片、他人头像、关注按钮、发布弹层、找人弹层都放在这里，
 * 供 views/square.js、views/post-detail.js、views/user-profile.js 复用。
 */
import { api } from './api.js';
import { getState, getWorkouts, workoutStats } from './store.js';
import { getSyncState } from './sync.js';
import {
  actionSheet,
  confirmDialog,
  icon,
  openSheet,
  showToast,
} from './ui.js';
import {
  copyText,
  debounce,
  esc,
  fmtDate,
  fmtDuration,
  fmtVolume,
  initials,
} from './utils.js';

/* ---------------- 头像 ---------------- */

/**
 * 广场里展示他人头像：服务端按 user_id 下发，版本号变化即可绕过缓存。
 * 注意不要用 data-avatar 属性——那是「我自己」的头像，上传后会整体刷新。
 */
export function userAvatar(user, size = '') {
  const name = user?.displayName || user?.username || '训练者';
  const version = user?.avatarVersion;
  const classes = ['avatar', size, 'social-avatar'].filter(Boolean).join(' ');
  const photo = version
    ? `<img class="avatar-photo" src="/api/social/avatar/${encodeURIComponent(user.id)}?v=${encodeURIComponent(version)}" alt="" draggable="false" loading="lazy" />`
    : `<span class="avatar-initials">${esc(initials(name))}</span>`;
  return `<span class="${classes}" data-remote-avatar data-avatar-name="${esc(name)}">${photo}</span>`;
}

/* 他人头像加载失败（对方删了头像等）时退回首字母，避免破图 */
document.addEventListener(
  'error',
  (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('avatar-photo')) return;
    const host = img.closest('[data-remote-avatar]');
    if (!host) return;
    img.remove();
    if (!host.querySelector('.avatar-initials')) {
      host.insertAdjacentHTML(
        'afterbegin',
        `<span class="avatar-initials">${esc(initials(host.dataset.avatarName || ''))}</span>`,
      );
    }
  },
  true,
);

/* ---------------- 时间与文案 ---------------- */

export function timeAgo(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 2) return '昨天';
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return fmtDate(date, false);
}

function bestSetText(exercise) {
  const working = (exercise.sets || []).filter((set) => set.type !== 'warmup');
  const best = working.reduce(
    (acc, set) => (Number(set.weight) > Number(acc?.weight || 0) ? set : acc),
    null,
  );
  if (best && Number(best.weight) > 0) {
    return `${Number(best.weight)} kg × ${best.reps}`;
  }
  const reps = working.reduce((acc, set) => acc + (Number(set.reps) || 0), 0);
  return `${reps} 次`;
}

function metric(label, value, unit = '') {
  return `<div class="post-metric"><b>${value}${unit ? `<small>${unit}</small>` : ''}</b><span>${label}</span></div>`;
}

/* ---------------- 广场卡片 ---------------- */

export function postCardHtml(post) {
  if (!post?.workout) {
    return `<article class="post-card broken" data-post-id="${esc(post?.id || '')}">
      <p class="muted">这条分享的数据不完整。</p>
    </article>`;
  }
  const workout = post.workout;
  const stats = post.stats || {};
  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  const volume = Number(stats.volume) || 0;
  const prs = Array.isArray(post.prs) ? post.prs.slice(0, 2) : [];
  const author = post.author;
  const name = author.displayName || author.username;

  return `<article class="post-card" data-post-id="${esc(post.id)}">
    <header class="post-head">
      <a class="post-author" href="#/square/u/${esc(author.id)}">
        ${userAvatar(author)}
        <span class="post-author-text">
          <strong>${esc(name)}</strong>
          <span>@${esc(author.username)} · ${timeAgo(post.createdAt)}</span>
        </span>
      </a>
      <div class="post-head-actions">
        ${
          author.isSelf
            ? `<button type="button" class="icon-btn sm" data-post-menu="${esc(post.id)}" aria-label="更多操作">${icon('more', 18)}</button>`
            : `<button type="button" class="btn btn-sm ${author.isFollowing ? 'btn-ghost' : 'btn-soft'}" data-follow="${esc(author.id)}" data-following="${author.isFollowing ? '1' : '0'}">
                ${author.isFollowing ? `${icon('check', 13)} 已关注` : `${icon('user-plus', 13)} 关注`}
              </button>`
        }
      </div>
    </header>

    ${post.caption ? `<p class="post-caption">${esc(post.caption)}</p>` : ''}

    <a class="post-workout" href="#/square/p/${esc(post.id)}">
      <div class="post-workout-top">
        <span class="tag lime">${esc(workout.planName || '训练')}</span>
        <span class="post-date">${esc(fmtDate(new Date(workout.startedAt), false))}</span>
      </div>
      <h3>${esc(workout.dayName)}</h3>

      <div class="post-metrics">
        ${metric('容量', volume > 0 ? fmtVolume(volume) : '自重')}
        ${metric('组数', Number(stats.sets) || 0)}
        ${metric('时长', fmtDuration(stats.durationSec, true))}
        ${metric('动作', Number(stats.exercises) || exercises.length)}
      </div>

      ${
        prs.length
          ? `<div class="post-prs">${prs
              .map(
                (pr) =>
                  `<span class="post-pr">${icon('trophy', 12)}${esc(pr.name)} ${pr.weight > 0 ? `${pr.weight}kg × ${pr.reps}` : `${pr.reps} 次`}<b>${pr.isFirst ? '首次' : 'PR'}</b></span>`,
              )
              .join('')}</div>`
          : ''
      }

      <div class="post-exercise-list">
        ${exercises
          .slice(0, 3)
          .map(
            (exercise) => `<div class="post-exercise">
              <span class="post-exercise-name">${esc(exercise.name)}</span>
              <span class="post-exercise-sets">${(exercise.sets || []).length} 组 · ${bestSetText(exercise)}</span>
            </div>`,
          )
          .join('')}
        ${
          exercises.length > 3
            ? `<div class="post-more">还有 ${exercises.length - 3} 个动作 · 查看完整记录 ${icon('chevron-right', 12)}</div>`
            : ''
        }
      </div>
    </a>

    <footer class="post-foot">
      <button type="button" class="post-action like${post.liked ? ' liked' : ''}" data-like="${esc(post.id)}" data-liked="${post.liked ? '1' : '0'}" aria-pressed="${post.liked ? 'true' : 'false'}">
        ${icon('heart', 17)}<span data-like-count>${Number(post.likes) || 0}</span>
      </button>
      <a class="post-action" href="#/square/p/${esc(post.id)}">查看详情 ${icon('chevron-right', 12)}</a>
    </footer>
  </article>`;
}

export function postCardSkeleton() {
  return `<div class="post-card skeleton-card" aria-hidden="true">
    <div class="sk-line sk-w40"></div>
    <div class="sk-block"></div>
    <div class="sk-line sk-w70"></div>
  </div>`;
}

/* ---------------- 关注 / 点赞 ---------------- */

export function applyFollowState(button, following) {
  button.dataset.following = following ? '1' : '0';
  button.classList.toggle('btn-ghost', following);
  button.classList.toggle('btn-soft', !following);
  button.classList.toggle('followed', following);
  button.innerHTML = following
    ? `${icon('check', 14)} 已关注`
    : `${icon('user-plus', 14)} 关注`;
}

export async function toggleFollow(button) {
  if (!button || button.disabled) return null;
  const userId = button.dataset.follow;
  const following = button.dataset.following === '1';
  button.disabled = true;
  try {
    const result = following ? await api.unfollowUser(userId) : await api.followUser(userId);
    applyFollowState(button, result.following);
    showToast(result.following ? '已关注，TA 的新动态会出现在「关注」里' : '已取消关注', result.following ? 'success' : 'info');
    return result;
  } catch (error) {
    showToast(error.message || '操作失败，请稍后重试', 'error');
    return null;
  } finally {
    button.disabled = false;
  }
}

async function toggleLike(button) {
  if (!button || button.disabled) return;
  const postId = button.dataset.like;
  const liked = button.dataset.liked === '1';
  const countEl = button.querySelector('[data-like-count]');
  button.disabled = true;
  try {
    const result = await api.likePost(postId, liked);
    button.dataset.liked = result.liked ? '1' : '0';
    button.classList.toggle('liked', result.liked);
    button.setAttribute('aria-pressed', result.liked ? 'true' : 'false');
    if (countEl) countEl.textContent = String(result.likes);
  } catch (error) {
    showToast(error.message || '点赞失败', 'error');
  } finally {
    button.disabled = false;
  }
}

/**
 * 给一块容器挂上社交交互（关注 / 点赞 / 卡片菜单 / 删除）。
 * 用事件委托，卡片列表动态追加也不需要重新绑定。
 */
export function bindSocialActions(root, { onDelete, onFollowChange } = {}) {
  if (!root) return;

  root.addEventListener('click', async (event) => {
    const followBtn = event.target.closest('[data-follow]');
    if (followBtn) {
      event.preventDefault();
      const result = await toggleFollow(followBtn);
      if (result) onFollowChange?.(followBtn.dataset.follow, result.following, result);
      return;
    }

    const likeBtn = event.target.closest('[data-like]');
    if (likeBtn) {
      event.preventDefault();
      await toggleLike(likeBtn);
      return;
    }

    const menuBtn = event.target.closest('[data-post-menu]');
    if (menuBtn) {
      event.preventDefault();
      const card = menuBtn.closest('[data-post-id]');
      const postId = menuBtn.dataset.postMenu;
      actionSheet('这条分享', [
        {
          label: '查看详情',
          icon: 'quote',
          onClick: () => {
            location.hash = `#/square/p/${postId}`;
          },
        },
        {
          label: '删除这条分享',
          icon: 'trash',
          danger: true,
          onClick: async () => {
            const ok = await confirmDialog({
              title: '删除这条分享？',
              message: '广场上的这条动态会被移除，训练记录本身不受影响。',
              confirmText: '删除分享',
              danger: true,
              iconName: 'trash',
            });
            if (!ok) return;
            try {
              await api.deletePost(postId);
              card?.remove();
              showToast('分享已删除');
              onDelete?.(postId);
            } catch (error) {
              showToast(error.message || '删除失败', 'error');
            }
          },
        },
      ]);
    }
  });
}

/* ---------------- 发布到广场 ---------------- */

/**
 * 分享弹层：选一次训练 + 写一句感受。
 * @param {{ workoutId?: string, onPublished?: (post: object) => void }} options
 */
export function openPublishSheet({ workoutId = '', onPublished } = {}) {
  const workouts = getWorkouts().slice(0, 20);
  if (!workouts.length) {
    showToast('还没有可以分享的训练，先完成一次训练吧', 'info');
    return;
  }

  let selected = workouts.some((w) => w.id === workoutId) ? workoutId : workouts[0].id;

  const itemHtml = (workout) => {
    const stats = workoutStats(workout);
    const volume = Number(workout.totalVolume) || stats.volume;
    return `<button type="button" class="publish-item${workout.id === selected ? ' active' : ''}" data-publish-pick="${esc(workout.id)}">
      <span class="publish-item-main">
        <strong>${esc(workout.dayName)}</strong>
        <span>${esc(fmtDate(new Date(workout.startedAt), false))} · ${Number(workout.totalSets) || stats.sets} 组 · ${volume > 0 ? fmtVolume(volume) : '自重'}</span>
      </span>
      <span class="publish-item-check">${icon('check', 14)}</span>
    </button>`;
  };

  openSheet({
    title: '分享到大大广场',
    subtitle: '选一次训练，写一句感受。其他训练者就能在广场看到它。',
    size: 'md',
    className: 'publish-sheet',
    body: `<div class="publish-body">
      <div class="publish-list" data-publish-list>${workouts.map(itemHtml).join('')}</div>
      <label class="field publish-caption-field">
        <span class="field-label">说点什么（可选）</span>
        <textarea class="input publish-caption" data-publish-caption maxlength="240" rows="3" placeholder="今天状态如何？有什么想记下来的？"></textarea>
        <span class="field-hint"><span data-caption-count>0</span> / 240</span>
      </label>
      <p class="publish-tip">${icon('info', 13)} 只会分享这一次训练的动作、组数与重量，其他训练数据仍然只有你自己能看到。</p>
    </div>`,
    footer: `<div class="btn-row">
      <button type="button" class="btn btn-ghost" data-sheet-close>取消</button>
      <button type="button" class="btn btn-primary" data-publish-submit>${icon('send', 16)} 发布到广场</button>
    </div>`,
    onMount: (sheet, close) => {
      const caption = sheet.querySelector('[data-publish-caption]');
      const counter = sheet.querySelector('[data-caption-count]');
      const submit = sheet.querySelector('[data-publish-submit]');

      sheet.querySelectorAll('[data-publish-pick]').forEach((button) => {
        button.addEventListener('click', () => {
          selected = button.dataset.publishPick;
          sheet.querySelectorAll('[data-publish-pick]').forEach((el) => {
            el.classList.toggle('active', el === button);
          });
        });
      });

      caption?.addEventListener('input', () => {
        counter.textContent = String(caption.value.length);
      });

      submit.addEventListener('click', async () => {
        if (submit.disabled) return;
        submit.disabled = true;
        const original = submit.innerHTML;
        submit.textContent = '发布中…';
        try {
          const result = await api.createPost(selected, caption.value.trim());
          close();
          showToast('已分享到大大广场');
          onPublished?.(result.post);
        } catch (error) {
          if (error.code === 'POST_EXISTS') {
            close();
            showToast('这次训练已经分享过了', 'info');
            return;
          }
          showToast(error.message || '发布失败，请稍后重试', 'error');
          submit.disabled = false;
          submit.innerHTML = original;
        }
      });
    },
  });
}

/* ---------------- 找人 ---------------- */

export function userRowHtml(user, { compact = false } = {}) {
  const name = user.displayName || user.username;
  return `<div class="user-row${compact ? ' compact' : ''}">
    <a class="user-row-main" href="#/square/u/${esc(user.id)}" data-user-link>
      ${userAvatar(user, 'sm')}
      <span class="user-row-text">
        <strong>${esc(name)}</strong>
        <span>@${esc(user.username)}${user.bio ? ` · ${esc(user.bio)}` : ''}</span>
      </span>
    </a>
    ${
      user.isSelf
        ? '<span class="tag">我</span>'
        : `<button type="button" class="btn btn-sm ${user.isFollowing ? 'btn-ghost' : 'btn-soft'}" data-follow="${esc(user.id)}" data-following="${user.isFollowing ? '1' : '0'}">
            ${user.isFollowing ? `${icon('check', 13)} 已关注` : `${icon('user-plus', 13)} 关注`}
          </button>`
    }
  </div>`;
}

export function openUserSearchSheet() {
  openSheet({
    title: '找训练者',
    subtitle: '搜索昵称或用户名，关注后就能在「关注」里看到 TA 的动态',
    size: 'sm',
    className: 'user-search-sheet',
    body: `<div class="search-box">${icon('search', 17)}
        <input type="search" placeholder="输入昵称 / 用户名" data-user-search autofocus />
      </div>
      <div class="user-result-list" data-user-results><div class="mini-loading">输入关键词开始搜索</div></div>`,
    onMount: (sheet, close) => {
      const input = sheet.querySelector('[data-user-search]');
      const results = sheet.querySelector('[data-user-results]');

      const run = debounce(async (query) => {
        results.innerHTML = '<div class="mini-loading">搜索中…</div>';
        try {
          const data = await api.searchUsers(query);
          if (!data.users?.length) {
            results.innerHTML = `<div class="mini-loading">${query ? '没有找到匹配的训练者' : '还没有可推荐的训练者'}</div>`;
            return;
          }
          results.innerHTML = data.users
            .map((user) => userRowHtml(user, { compact: true }))
            .join('');
        } catch (error) {
          results.innerHTML = `<div class="mini-loading">${esc(error.message || '搜索失败')}</div>`;
        }
      }, 320);

      bindSocialActions(results);
      results.addEventListener('click', (event) => {
        if (event.target.closest('[data-user-link]')) close();
      });
      run('');
      input?.addEventListener('input', () => run(input.value.trim()));
    },
  });
}

/* ---------------- 公开资料同步 ---------------- */

/**
 * 把「我的 → 编辑资料」里的称呼同步到公开资料表，
 * 这样广场上没有头像时也能显示正确的昵称。
 */
export async function syncPublicProfile() {
  const user = getSyncState().user;
  if (!user) return;
  const displayName = getState().settings.userName?.trim();
  if (!displayName) return;
  try {
    const { profile } = await api.getSocialProfile();
    if (!profile || profile.displayName !== displayName) {
      await api.updateSocialProfile({ displayName });
    }
  } catch {
    /* 社交资料同步失败不阻塞启动 */
  }
}

/* ---------------- 小工具 ---------------- */

export function copyPostText(post) {
  const workout = post.workout || {};
  const lines = [
    `${workout.dayName || '训练'} · ${workout.planName || ''}`.trim(),
    `${fmtDate(new Date(workout.startedAt || Date.now()), false)} · ${fmtDuration(post.stats?.durationSec)}`,
    `容量 ${fmtVolume(post.stats?.volume)} · ${post.stats?.sets || 0} 组 · ${post.stats?.exercises || 0} 个动作`,
    '',
    ...(workout.exercises || []).map(
      (exercise) =>
        `${exercise.name}：${(exercise.sets || [])
          .map((set) => (set.weight > 0 ? `${set.weight}kg×${set.reps}` : `${set.reps}次`))
          .join(' / ')}`,
    ),
    '',
    `—— 来自「大了么」大大广场 @${post.author?.username || ''}`,
  ];
  return copyText(lines.join('\n'));
}
