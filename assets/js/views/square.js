/* 大大广场 · 广场 / 关注信息流 */
import { api } from '../api.js';
import { getSyncState } from '../sync.js';
import { emptyState, icon, pageHead, showToast } from '../ui.js';
import { esc } from '../utils.js';
import {
  bindSocialActions,
  openPublishSheet,
  openUserSearchSheet,
  postCardHtml,
  postCardSkeleton,
  userAvatar,
  userRowHtml,
} from '../social.js';

const PAGE_SIZE = 10;

export default function squareView(ctx) {
  const tab = ctx.tab === 'following' ? 'following' : 'square';
  const me = getSyncState().user;

  const html = `<div class="square">
    ${pageHead({
      eyebrow: 'COMMUNITY',
      title: tab === 'following' ? '关注' : '大大广场',
      subtitle:
        tab === 'following'
          ? '你关注的训练者分享了什么'
          : '把每一次训练晒出来，也看看别人怎么练',
      actions: `<button type="button" class="btn btn-primary" data-publish>${icon('send', 16)} 分享训练</button>`,
    })}

    <div class="square-toolbar">
      <div class="square-tabs" role="tablist" aria-label="广场分区">
        <a class="square-tab${tab === 'square' ? ' active' : ''}" href="#/square" role="tab" aria-selected="${tab === 'square'}">${icon('square', 15)} 大大广场</a>
        <a class="square-tab${tab === 'following' ? ' active' : ''}" href="#/following" role="tab" aria-selected="${tab === 'following'}">${icon('users', 15)} 关注</a>
      </div>
      <button type="button" class="search-trigger" data-find-user>
        ${icon('search', 16)}<span>找训练者</span>
      </button>
    </div>

    <div class="square-layout">
      <div class="feed" data-feed>${postCardSkeleton()}${postCardSkeleton()}</div>

      <aside class="square-aside">
        <section class="card mini-profile" data-mini-profile>
          <div class="mini-profile-head">
            ${userAvatar({ id: me?.id, username: me?.username, displayName: me?.username, avatarVersion: me?.avatarVersion }, 'sm')}
            <div>
              <strong data-mini-name>${esc(me?.username || '我')}</strong>
              <span>我的训练主页</span>
            </div>
          </div>
          <div class="mini-profile-stats">
            <div><b data-my-posts>—</b><span>分享</span></div>
            <div><b data-my-following>—</b><span>关注</span></div>
            <div><b data-my-followers>—</b><span>粉丝</span></div>
          </div>
          <a class="btn btn-ghost btn-sm btn-block" href="#/square/u/${esc(me?.id || '')}">查看我的主页</a>
        </section>

        <section class="card discover-card">
          <div class="aside-head">
            <h3>发现训练者</h3>
            <button type="button" class="section-link" data-find-user>搜索 ${icon('chevron-right', 12)}</button>
          </div>
          <div class="discover-list" data-discover>
            <div class="mini-loading">正在寻找训练者…</div>
          </div>
        </section>
      </aside>
    </div>
  </div>`;

  return {
    html,
    mount(root) {
      const feed = root.querySelector('[data-feed]');
      const discover = root.querySelector('[data-discover]');
      let cursor = null;
      let loading = false;
      let exhausted = false;
      let followingCount = null;

      root.querySelectorAll('[data-publish]').forEach((button) => {
        button.addEventListener('click', () => {
          openPublishSheet({
            onPublished: () => {
              if (tab === 'following') ctx.navigate('/square');
              else {
                cursor = null;
                exhausted = false;
                feed.innerHTML = '';
                load(true);
              }
            },
          });
        });
      });

      root.querySelectorAll('[data-find-user]').forEach((button) => {
        button.addEventListener('click', openUserSearchSheet);
      });

      bindSocialActions(feed, {
        onDelete: (postId) => {
          if (!feed.querySelector(`[data-post-id="${postId}"]`)) return;
        },
      });

      /* 卡片里的「加载更多」用委托，避免每次追加后重新绑定 */
      feed.addEventListener('click', (event) => {
        if (event.target.closest('[data-load-more]')) load(false);
      });

      function emptyHtml() {
        if (tab === 'following') {
          return `<div class="card">${emptyState({
            iconName: 'users',
            title: '关注的人还没有分享',
            text:
              followingCount === 0
                ? '先关注几位训练者，他们的训练动态会出现在这里。'
                : '你关注的人还没有分享训练，去广场逛逛吧。',
            action: `<div class="btn-row" style="max-width:320px">
              <a class="btn btn-primary" href="#/square">去广场看看</a>
              <button type="button" class="btn btn-ghost" data-find-user>找训练者</button>
            </div>`,
          })}</div>`;
        }
        return `<div class="card">${emptyState({
          iconName: 'square',
          title: '广场还很安静',
          text: '成为第一个分享训练的人，把今天的重量留在这里。',
          action: '<button type="button" class="btn btn-primary" data-publish>分享我的训练</button>',
        })}</div>`;
      }

      function bindEmptyActions() {
        feed.querySelectorAll('[data-publish]').forEach((button) => {
          button.addEventListener('click', () => openPublishSheet({ onPublished: () => load(true) }));
        });
        feed.querySelectorAll('[data-find-user]').forEach((button) => {
          button.addEventListener('click', openUserSearchSheet);
        });
      }

      function footHtml() {
        if (loading) return '<div class="feed-foot"><span class="mini-loading">加载中…</span></div>';
        if (cursor) {
          return `<div class="feed-foot"><button type="button" class="btn btn-ghost" data-load-more>加载更多</button></div>`;
        }
        if (exhausted) return '<div class="feed-foot"><span>已经看到全部动态了</span></div>';
        return '';
      }

      async function load(reset) {
        if (loading) return;
        loading = true;
        if (reset) {
          cursor = null;
          exhausted = false;
          feed.innerHTML = postCardSkeleton();
        }
        const foot = feed.querySelector('.feed-foot');
        if (foot) foot.innerHTML = '<span class="mini-loading">加载中…</span>';

        try {
          const data = await api.socialFeed({ scope: tab, limit: PAGE_SIZE, before: cursor || '' });
          if (reset) feed.innerHTML = '';
          if (typeof data.following === 'number') {
            followingCount = data.following;
            const el = root.querySelector('[data-my-following]');
            if (el) el.textContent = String(data.following);
          }
          if (data.posts?.length) {
            feed.insertAdjacentHTML('beforeend', data.posts.map(postCardHtml).join(''));
          }
          cursor = data.nextCursor || null;
          exhausted = !cursor;
          if (!feed.querySelector('[data-post-id]')) {
            exhausted = true;
            feed.innerHTML = emptyHtml();
            bindEmptyActions();
          } else {
            feed.querySelector('.feed-foot')?.remove();
            feed.insertAdjacentHTML('beforeend', footHtml());
          }
        } catch (error) {
          feed.innerHTML = `<div class="card">${emptyState({
            iconName: 'info',
            title: '广场加载失败',
            text: esc(error.message || '请检查网络后重试'),
            action: '<button type="button" class="btn btn-primary" data-retry>重新加载</button>',
          })}</div>`;
          feed.querySelector('[data-retry]')?.addEventListener('click', () => load(true));
          if (error.status === 401) showToast('登录已过期，请重新登录', 'error');
        } finally {
          loading = false;
        }
      }

      async function loadSide() {
        try {
          const [profile, discovery] = await Promise.all([
            api.getSocialProfile().catch(() => null),
            api.searchUsers('').catch(() => null),
          ]);
          const p = profile?.profile;
          if (p) {
            const nameEl = root.querySelector('[data-mini-name]');
            if (nameEl && p.displayName) nameEl.textContent = p.displayName;
            const postsEl = root.querySelector('[data-my-posts]');
            const followingEl = root.querySelector('[data-my-following]');
            const followersEl = root.querySelector('[data-my-followers]');
            if (postsEl) postsEl.textContent = String(p.posts);
            if (followingEl) followingEl.textContent = String(p.following);
            if (followersEl) followersEl.textContent = String(p.followers);
          }
          if (!discover) return;
          if (discovery?.users?.length) {
            discover.innerHTML = discovery.users.map((user) => userRowHtml(user, { compact: true })).join('');
            bindSocialActions(discover);
          } else {
            discover.innerHTML = '<div class="mini-loading">暂时没有更多训练者，稍后再来看看</div>';
          }
        } catch {
          if (discover) discover.innerHTML = '<div class="mini-loading">暂时无法加载推荐</div>';
        }
      }

      load(true);
      loadSide();
    },
  };
}
