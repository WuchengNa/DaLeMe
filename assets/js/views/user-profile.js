/* 训练者主页：TA 的公开资料与分享 */
import { api } from '../api.js';
import { emptyState, icon, openSheet, showToast } from '../ui.js';
import { esc } from '../utils.js';
import {
  bindSocialActions,
  postCardHtml,
  postCardSkeleton,
  userAvatar,
  userRowHtml,
} from '../social.js';

export default function userProfileView(ctx) {
  const html = `<div class="user-profile">
    <div class="back-row">
      <a class="section-link" href="#/square">${icon('arrow-left', 15)} 大大广场</a>
    </div>
    <div data-user-body>${postCardSkeleton()}</div>
  </div>`;

  return {
    html,
    mount(root) {
      const body = root.querySelector('[data-user-body]');
      bindSocialActions(body, {
        onFollowChange: (userId, following, result) => {
          /* 关注状态变化后同步粉丝数 */
          const followerEl = body.querySelector('[data-stat-followers]');
          if (!followerEl || !result || typeof result.followers !== 'number') return;
          followerEl.dataset.value = String(result.followers);
          const countEl = followerEl.querySelector('b');
          if (countEl) countEl.textContent = String(result.followers);
        },
      });

      load();

      async function load() {
        try {
          const data = await api.getUser(ctx.id);
          body.innerHTML = heroHtml(data.user) + postsHtml(data.user, data.posts);
          body.querySelectorAll('[data-open-follows]').forEach((button) => {
            button.addEventListener('click', () => {
              openFollowListSheet(data.user, button.dataset.openFollows);
            });
          });
        } catch (error) {
          body.innerHTML = `<div class="card">${emptyState({
            iconName: 'users',
            title: error.status === 404 ? '找不到这位训练者' : '加载失败',
            text: error.status === 404 ? '账号可能已经注销。' : esc(error.message || '请稍后重试'),
            action: '<a class="btn btn-primary" href="#/square">回到大大广场</a>',
          })}</div>`;
        }
      }
    },
  };
}

function heroHtml(user) {
  const name = user.displayName || user.username;
  return `<section class="card user-hero">
    <div class="user-hero-main">
      ${userAvatar(user, 'xl')}
      <div class="user-hero-info">
        <h1>${esc(name)}</h1>
        <p class="user-handle">@${esc(user.username)}${user.isSelf ? ' · 这是你的主页' : ''}</p>
        ${user.bio ? `<p class="user-bio">${esc(user.bio)}</p>` : ''}
        <div class="user-stats">
          <div class="user-stat"><b>${user.posts}</b><span>分享</span></div>
          <button type="button" class="user-stat" data-open-follows="following"><b>${user.following}</b><span>关注</span></button>
          <button type="button" class="user-stat" data-open-follows="followers" data-stat-followers data-value="${user.followers}"><b>${user.followers}</b><span>粉丝</span></button>
        </div>
      </div>
    </div>
    <div class="user-hero-actions">
      ${
        user.isSelf
          ? `<a class="btn btn-ghost" href="#/profile">${icon('edit', 15)} 编辑资料</a>
             <a class="btn btn-primary" href="#/square">${icon('square', 15)} 去广场</a>`
          : `<button type="button" class="btn ${user.isFollowing ? 'btn-ghost' : 'btn-soft'}" data-follow="${esc(user.id)}" data-following="${user.isFollowing ? '1' : '0'}">
              ${user.isFollowing ? `${icon('check', 15)} 已关注` : `${icon('user-plus', 15)} 关注 TA`}
            </button>`
      }
    </div>
  </section>`;
}

function postsHtml(user, posts) {
  const name = user.displayName || user.username;
  if (!posts?.length) {
    return `<div class="section-head"><div><h2>${esc(name)} 的分享</h2><p>还没有公开的训练动态</p></div></div>
      <div class="card">${emptyState({
        iconName: 'square',
        title: '还没有分享',
        text: user.isSelf ? '在训练记录里点「分享到广场」，让其他人看到你的训练。' : '等 TA 分享下一次训练吧。',
        action: user.isSelf ? '<a class="btn btn-primary" href="#/history">去训练记录</a>' : '',
      })}</div>`;
  }
  return `<div class="section-head"><div><h2>${esc(name)} 的分享</h2><p>${posts.length} 条公开训练动态</p></div></div>
    <div class="feed">${posts.map(postCardHtml).join('')}</div>`;
}

async function openFollowListSheet(user, kind) {
  const isFollowers = kind === 'followers';
  const title = isFollowers ? '粉丝' : '关注';
  openSheet({
    title: `${user.displayName || user.username} 的${title}`,
    size: 'sm',
    body: '<div class="mini-loading">加载中…</div>',
    onMount: async (sheet) => {
      const bodyEl = sheet.querySelector('.sheet-body');
      try {
        const data = await api.getUserFollows(user.id, kind);
        if (!data.users?.length) {
          bodyEl.innerHTML = `<div class="mini-loading">${isFollowers ? '还没有粉丝' : '还没有关注任何人'}</div>`;
          return;
        }
        bodyEl.innerHTML = `<div class="user-result-list">${data.users.map((item) => userRowHtml(item, { compact: true })).join('')}</div>`;
        bindSocialActions(bodyEl);
        bodyEl.querySelectorAll('[data-user-link]').forEach((link) => {
          link.addEventListener('click', () => {
            /* 关闭弹层，让路由跳转可见 */
            sheet.querySelector('.sheet-close')?.click();
          });
        });
      } catch (error) {
        bodyEl.innerHTML = `<div class="mini-loading">${esc(error.message || '加载失败')}</div>`;
        showToast(error.message || '加载失败', 'error');
      }
    },
  });
}
