/* 广场动态详情：完整动作与组次 */
import { api } from '../api.js';
import { emptyState, icon, setChip, showToast } from '../ui.js';
import { esc, fmtDate, fmtDuration, fmtVolume, WEEKDAYS } from '../utils.js';
import {
  bindSocialActions,
  copyPostText,
  postCardSkeleton,
  timeAgo,
  userAvatar,
} from '../social.js';

export default function postDetailView(ctx) {
  const html = `<div class="post-detail">
    <div class="back-row">
      <a class="section-link" href="#/square">${icon('arrow-left', 15)} 大大广场</a>
    </div>
    <div data-detail-body>${postCardSkeleton()}</div>
  </div>`;

  return {
    html,
    mount(root) {
      const body = root.querySelector('[data-detail-body]');
      bindSocialActions(body, {
        onDelete: () => ctx.navigate('/square'),
      });

      load();

      async function load() {
        try {
          const { post } = await api.getPost(ctx.id);
          body.innerHTML = detailHtml(post);
          body.querySelector('[data-copy-post]')?.addEventListener('click', async () => {
            try {
              await copyPostText(post);
              showToast('训练摘要已复制');
            } catch {
              showToast('复制失败，请手动选择', 'error');
            }
          });
        } catch (error) {
          body.innerHTML = `<div class="card">${emptyState({
            iconName: 'square',
            title: error.status === 404 ? '这条分享找不到了' : '加载失败',
            text: error.status === 404 ? '它可能已经被作者删除。' : esc(error.message || '请稍后重试'),
            action: '<a class="btn btn-primary" href="#/square">回到大大广场</a>',
          })}</div>`;
        }
      }
    },
  };
}

function detailHtml(post) {
  const workout = post.workout || {};
  const stats = post.stats || {};
  const author = post.author || {};
  const name = author.displayName || author.username || '训练者';
  const date = new Date(workout.startedAt || post.createdAt);
  const dateText = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  const prs = Array.isArray(post.prs) ? post.prs : [];

  return `<article class="card post-detail-card" data-post-id="${esc(post.id)}">
    <header class="post-head">
      <a class="post-author" href="#/square/u/${esc(author.id)}">
        ${userAvatar(author, 'md')}
        <span class="post-author-text">
          <strong>${esc(name)}</strong>
          <span>@${esc(author.username)} · 分享于 ${timeAgo(post.createdAt)}</span>
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

    ${post.caption ? `<p class="post-caption lg">${esc(post.caption)}</p>` : ''}

    <div class="post-detail-hero">
      <div class="post-workout-top">
        <span class="tag lime">${esc(workout.planName || '训练')}</span>
        <span class="post-date">${esc(dateText)}</span>
      </div>
      <h1>${esc(workout.dayName || '训练')}</h1>
      <div class="post-metrics big">
        <div class="post-metric"><b>${Number(stats.volume) > 0 ? fmtVolume(stats.volume) : '自重'}</b><span>容量</span></div>
        <div class="post-metric"><b>${Number(stats.sets) || 0}<small>组</small></b><span>完成组数</span></div>
        <div class="post-metric"><b>${fmtDuration(stats.durationSec, true)}</b><span>训练时长</span></div>
        <div class="post-metric"><b>${Number(stats.exercises) || exercises.length}<small>个</small></b><span>动作</span></div>
      </div>
    </div>

    ${
      prs.length
        ? `<div class="post-prs wide">${prs
            .map(
              (pr) =>
                `<span class="post-pr">${icon('trophy', 12)}${esc(pr.name)} ${pr.weight > 0 ? `${pr.weight}kg × ${pr.reps}` : `${pr.reps} 次`}<b>${pr.isFirst ? '首次记录' : 'PR'}</b></span>`,
            )
            .join('')}</div>`
        : ''
    }

    <div class="section-head"><div><h2>动作明细</h2><p>${exercises.length} 个动作 · ${Number(stats.sets) || 0} 组</p></div></div>

    <div class="pd-exercises">
      ${exercises
        .map(
          (exercise) => `<section class="pd-exercise">
            <div class="pd-exercise-head">
              <h3>${esc(exercise.name)}</h3>
              <span>${(exercise.sets || []).length} 组</span>
            </div>
            <div class="set-chip-list">
              ${(exercise.sets || []).map((set, index) => setChip(set, index)).join('')}
            </div>
            ${exercise.note ? `<div class="exercise-note">${icon('note', 13)}<span>${esc(exercise.note)}</span></div>` : ''}
          </section>`,
        )
        .join('')}
    </div>

    ${workout.notes ? `<div class="detail-note"><h4>${icon('note', 13)} 训练感受</h4><p>${esc(workout.notes)}</p></div>` : ''}

    <footer class="post-detail-foot">
      <button type="button" class="post-action like${post.liked ? ' liked' : ''}" data-like="${esc(post.id)}" data-liked="${post.liked ? '1' : '0'}" aria-pressed="${post.liked ? 'true' : 'false'}">
        ${icon('heart', 18)}<span data-like-count>${Number(post.likes) || 0}</span>
        <em>点赞</em>
      </button>
      <button type="button" class="btn btn-ghost btn-sm" data-copy-post>${icon('copy', 14)} 复制训练摘要</button>
      <a class="btn btn-ghost btn-sm" href="#/square">${icon('square', 14)} 回到广场</a>
    </footer>
  </article>`;
}
