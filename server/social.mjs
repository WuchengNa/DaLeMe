/* 大了么 · 社交模块：大大广场、关注、点赞、训练者主页
 *
 * 设计要点：
 *  1. 训练记录本身仍是私有数据（user_data 里的整份 JSON），广场只发布
 *     一份**由服务端生成并固化**的训练快照，避免客户端伪造别人的成绩，
 *     也避免分享后修改记录导致历史动态被改写。
 *  2. 同一次训练只允许分享一次（posts 上有 (user_id, workout_id) 唯一索引）。
 *  3. 关注是单向边，互相关注即两条记录；「关注」信息流 = 自己 + 关注的人。
 *  4. 所有接口都要求登录；广场内容对所有登录用户可见。
 */
import { randomBytes } from 'node:crypto';

import { stmt } from './db.mjs';
import { readJson, sendJson } from './json.mjs';
import { requireUser } from './auth.mjs';
import { HttpError, checkOrigin, clientIp, rateLimit } from './security.mjs';
import { log } from './logger.mjs';

const MAX_CAPTION = 240;
const MAX_BIO = 80;
const MAX_DISPLAY_NAME = 24;
const MAX_EXERCISES = 40;
const MAX_SETS_PER_EXERCISE = 30;
const MAX_PAYLOAD_CHARS = 120_000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;
const LIST_LIMIT = 100;

/* ---------------- 工具 ---------------- */

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

function scoreSet(set) {
  const weight = Number(set?.weight) || 0;
  const reps = Number(set?.reps) || 0;
  return weight > 0 ? e1rm(weight, reps) : reps;
}

function normalizeCursor(raw) {
  if (!raw) return { createdAt: null, id: null };
  const [createdAt, id] = String(raw).split('~');
  if (!createdAt || Number.isNaN(new Date(createdAt).getTime())) {
    return { createdAt: null, id: null };
  }
  return { createdAt, id: id || 'zzzzzzzz' };
}

/**
 * 把用户云端数据里的一次训练转成可公开的快照。
 * 只保留已完成的组与动作名，且做长度与数值裁剪，防止超大 payload。
 */
export function buildSharePayload(data, workoutId) {
  const workouts = Array.isArray(data?.workouts) ? data.workouts : [];
  const workout = workouts.find((w) => w && w.id === workoutId);
  if (!workout) return null;

  const startedAtDate = new Date(workout.startedAt);
  const startedAt = Number.isNaN(startedAtDate.getTime())
    ? new Date().toISOString()
    : startedAtDate.toISOString();

  const exercises = [];
  const prCandidates = [];
  let volume = 0;
  let sets = 0;
  let reps = 0;

  for (const raw of (Array.isArray(workout.exercises) ? workout.exercises : []).slice(0, MAX_EXERCISES)) {
    const doneSets = (Array.isArray(raw?.sets) ? raw.sets : [])
      .filter((set) => set && set.done)
      .slice(0, MAX_SETS_PER_EXERCISE);
    if (!doneSets.length) continue;

    const cleanSets = doneSets.map((set) => {
      const weight = clampNumber(set.weight, 0, 99_999);
      const setReps = clampNumber(set.reps, 0, 999);
      const type = set.type === 'warmup' ? 'warmup' : 'normal';
      if (type !== 'warmup') {
        sets += 1;
        reps += setReps;
        volume += weight * setReps;
      }
      return { weight, reps: setReps, type };
    });

    exercises.push({
      name: cleanText(raw.name, 80) || '未命名动作',
      muscle: cleanText(raw.muscle, 24),
      note: cleanText(raw.note, 200),
      sets: cleanSets,
    });
    prCandidates.push({
      exerciseId: cleanText(raw.exerciseId, 80),
      name: cleanText(raw.name, 80) || '未命名动作',
      best: doneSets
        .filter((set) => set.type !== 'warmup')
        .reduce((acc, set) => {
          const score = scoreSet(set);
          return !acc || score > acc.score
            ? { score, weight: Number(set.weight) || 0, reps: Number(set.reps) || 0 }
            : acc;
        }, null),
    });
  }

  /* 一次都没有完成正式组，就没有值得分享的内容 */
  if (!exercises.length || sets === 0) return null;

  /* 历史最好成绩：只看这次训练之前的记录 */
  const cutoff = new Date(startedAt).getTime();
  const previous = {};
  for (const earlier of workouts) {
    if (!earlier || earlier.id === workout.id) continue;
    if (new Date(earlier.startedAt).getTime() >= cutoff) continue;
    for (const exercise of earlier.exercises || []) {
      if (!exercise?.exerciseId) continue;
      for (const set of exercise.sets || []) {
        if (!set?.done || set.type === 'warmup') continue;
        const score = scoreSet(set);
        if (!previous[exercise.exerciseId] || score > previous[exercise.exerciseId].score) {
          previous[exercise.exerciseId] = {
            score,
            weight: Number(set.weight) || 0,
            reps: Number(set.reps) || 0,
          };
        }
      }
    }
  }

  const prs = [];
  for (const candidate of prCandidates) {
    if (!candidate.best) continue;
    const before = previous[candidate.exerciseId];
    if (!before) {
      prs.push({ name: candidate.name, weight: candidate.best.weight, reps: candidate.best.reps, isFirst: true });
    } else if (candidate.best.score > before.score + 0.01) {
      prs.push({
        name: candidate.name,
        weight: candidate.best.weight,
        reps: candidate.best.reps,
        isFirst: false,
        previousWeight: before.weight,
        previousReps: before.reps,
      });
    }
  }
  prs.sort((a, b) => b.weight * b.reps - a.weight * a.reps);

  const durationSec = clampInt(workout.durationSec, 0, 12 * 60 * 60);

  return {
    workout: {
      dayName: cleanText(workout.dayName, 80) || '训练',
      planName: cleanText(workout.planName, 80),
      startedAt,
      durationSec,
      notes: cleanText(workout.notes, 500),
      exercises,
    },
    stats: {
      volume: Math.round(volume),
      sets,
      reps,
      exercises: exercises.length,
      durationSec,
    },
    prs: prs.slice(0, 6),
  };
}

/* ---------------- 序列化 ---------------- */

function postJson(row, viewerId) {
  let payload = null;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    payload = null;
  }
  return {
    id: row.id,
    workoutId: row.workout_id,
    caption: row.caption,
    createdAt: row.created_at,
    author: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarVersion: row.avatar_version || null,
      isFollowing: !!row.is_following,
      isSelf: viewerId != null && row.user_id === viewerId,
    },
    workout: payload?.workout || null,
    stats: payload?.stats || { volume: 0, sets: 0, reps: 0, exercises: 0, durationSec: 0 },
    prs: Array.isArray(payload?.prs) ? payload.prs : [],
    likes: Number(row.like_count) || 0,
    liked: !!row.liked,
  };
}

function pageOfPosts(rows, limit, viewerId) {
  const posts = rows.slice(0, limit).map((row) => postJson(row, viewerId));
  const next = rows.length > limit ? posts[posts.length - 1] : null;
  return {
    posts,
    nextCursor: next ? `${next.createdAt}~${next.id}` : null,
  };
}

function userJson(row, viewerId) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    bio: row.bio || '',
    avatarVersion: row.avatar_version || null,
    followers: Number(row.follower_count) || 0,
    following: Number(row.following_count) || 0,
    posts: Number(row.post_count) || 0,
    isFollowing: !!row.is_following,
    isSelf: row.id === viewerId,
  };
}

/* ---------------- 处理函数 ---------------- */

async function handleFeed(req, res, url) {
  const user = requireUser(req);
  const scope = url.searchParams.get('scope') === 'following' ? 'following' : 'square';
  const limit = clampInt(url.searchParams.get('limit') || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const cursor = normalizeCursor(url.searchParams.get('before'));

  const rows =
    scope === 'following'
      ? stmt.feedFollowing.all(
          user.id, user.id, user.id, user.id,
          cursor.createdAt, cursor.createdAt, cursor.createdAt, cursor.id,
          limit + 1,
        )
      : stmt.feedAll.all(
          user.id, user.id,
          cursor.createdAt, cursor.createdAt, cursor.createdAt, cursor.id,
          limit + 1,
        );

  const page = pageOfPosts(rows, limit, user.id);
  const following = Number(stmt.countFollowing.get(user.id)?.n) || 0;
  return sendJson(res, 200, { ok: true, scope, following, ...page });
}

async function handleCreatePost(req, res) {
  rateLimit(req, 'social-post', 30, 60 * 60 * 1000);
  const user = requireUser(req);
  const body = await readJson(req);
  const workoutId = cleanText(body?.workoutId, 80);
  if (!workoutId) throw new HttpError(400, '请先选择要分享的训练', 'BAD_WORKOUT');
  const caption = cleanText(body?.caption, MAX_CAPTION);

  const row = stmt.getData.get(user.id);
  if (!row) throw new HttpError(400, '还没有训练记录可以分享', 'NO_DATA');

  let data;
  try {
    data = JSON.parse(row.payload);
  } catch {
    throw new HttpError(500, '云端数据损坏，请联系管理员', 'CLOUD_DATA_CORRUPT');
  }

  const payload = buildSharePayload(data, workoutId);
  if (!payload) {
    throw new HttpError(400, '找不到这次训练，或它还没有完成的正式组', 'WORKOUT_NOT_SHAREABLE');
  }
  const encoded = JSON.stringify(payload);
  if (encoded.length > MAX_PAYLOAD_CHARS) {
    throw new HttpError(400, '这次训练的数据量超出分享上限', 'POST_TOO_LARGE');
  }

  const id = `post_${randomBytes(9).toString('base64url')}`;
  const now = new Date().toISOString();
  try {
    stmt.insertPost.run(id, user.id, workoutId, caption, encoded, now);
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) {
      throw new HttpError(409, '这次训练已经分享过了', 'POST_EXISTS');
    }
    throw error;
  }

  /* 顺手把昵称同步到公开资料，避免广场上出现「未命名训练者」 */
  const displayName = cleanText(data?.settings?.userName, MAX_DISPLAY_NAME);
  if (displayName) {
    const profile = stmt.getProfile.get(user.id);
    stmt.upsertProfile.run(
      user.id,
      displayName,
      profile?.bio || '',
      now,
    );
  }

  const created = stmt.postById.get(user.id, user.id, id);
  log.info('social.post_created', { userId: user.id, postId: id, ip: clientIp(req) });
  return sendJson(res, 201, { ok: true, post: postJson(created, user.id) });
}

function handleDeletePost(req, res, postId) {
  const user = requireUser(req);
  const row = stmt.findPostOwner.get(postId);
  if (!row) throw new HttpError(404, '这条分享不存在', 'NOT_FOUND');
  if (row.user_id !== user.id) throw new HttpError(403, '只能删除自己的分享', 'FORBIDDEN');
  stmt.deletePost.run(postId, user.id);
  log.info('social.post_deleted', { userId: user.id, postId, ip: clientIp(req) });
  return sendJson(res, 200, { ok: true });
}

function handleLike(req, res, postId, liked) {
  const user = requireUser(req);
  const row = stmt.findPostOwner.get(postId);
  if (!row) throw new HttpError(404, '这条分享不存在', 'NOT_FOUND');
  if (liked) stmt.insertLike.run(postId, user.id, new Date().toISOString());
  else stmt.deleteLike.run(postId, user.id);
  return sendJson(res, 200, {
    ok: true,
    liked,
    likes: Number(stmt.countLikes.get(postId)?.n) || 0,
  });
}

function handleGetPost(req, res, postId) {
  const user = requireUser(req);
  const row = stmt.postById.get(user.id, user.id, postId);
  if (!row) throw new HttpError(404, '这条分享不存在', 'NOT_FOUND');
  return sendJson(res, 200, { ok: true, post: postJson(row, user.id) });
}

function handleSearchUsers(req, res, url) {
  const user = requireUser(req);
  const query = cleanText(url.searchParams.get('q'), 30).replace(/[%_]/g, '');
  const users = query
    ? stmt.searchUsers.all(user.id, user.id, `%${query}%`, `%${query}%`, 20)
    : stmt.suggestUsers.all(user.id, user.id, user.id, 8);
  return sendJson(res, 200, {
    ok: true,
    query,
    users: users.map((row) => userJson(row, user.id)),
  });
}

function handleUserDetail(req, res, userId) {
  const user = requireUser(req);
  const row = stmt.userCard.get(user.id, userId);
  if (!row) throw new HttpError(404, '找不到这位训练者', 'NOT_FOUND');
  const target = userJson(row, user.id);
  const rows = stmt.postsByUser.all(user.id, user.id, userId, null, null, null, null, DEFAULT_LIMIT + 1);
  const page = pageOfPosts(rows, DEFAULT_LIMIT, user.id);
  return sendJson(res, 200, { ok: true, user: target, ...page });
}

function handleFollow(req, res, userId, following) {
  rateLimit(req, 'social-follow', 180, 60 * 60 * 1000);
  const user = requireUser(req);
  if (userId === user.id) throw new HttpError(400, '不能关注自己', 'SELF_FOLLOW');
  const target = stmt.userCard.get(user.id, userId);
  if (!target) throw new HttpError(404, '找不到这位训练者', 'NOT_FOUND');

  if (following) stmt.insertFollow.run(user.id, userId, new Date().toISOString());
  else stmt.deleteFollow.run(user.id, userId);

  return sendJson(res, 200, {
    ok: true,
    following,
    followers: Number(stmt.countFollowers.get(userId)?.n) || 0,
    followingCount: Number(stmt.countFollowing.get(user.id)?.n) || 0,
  });
}

function handleFollowList(req, res, userId, kind) {
  const user = requireUser(req);
  const target = stmt.userCard.get(user.id, userId);
  if (!target) throw new HttpError(404, '找不到这位训练者', 'NOT_FOUND');
  const rows =
    kind === 'followers'
      ? stmt.listFollowers.all(user.id, userId, LIST_LIMIT)
      : stmt.listFollowing.all(user.id, userId, LIST_LIMIT);
  return sendJson(res, 200, {
    ok: true,
    kind,
    users: rows.map((row) => userJson(row, user.id)),
  });
}

function handleGetProfile(req, res) {
  const user = requireUser(req);
  const row = stmt.userCard.get(user.id, user.id);
  return sendJson(res, 200, { ok: true, profile: row ? userJson(row, user.id) : null });
}

async function handleUpdateProfile(req, res) {
  rateLimit(req, 'social-profile', 60, 60 * 60 * 1000);
  const user = requireUser(req);
  const body = await readJson(req);
  const existing = stmt.getProfile.get(user.id);

  let displayName = existing?.display_name || '';
  if (body?.displayName !== undefined) {
    displayName = cleanText(body.displayName, MAX_DISPLAY_NAME);
    if (!displayName) throw new HttpError(400, '昵称不能为空', 'BAD_DISPLAY_NAME');
  }
  let bio = existing?.bio || '';
  if (body?.bio !== undefined) bio = cleanText(body.bio, MAX_BIO);

  stmt.upsertProfile.run(user.id, displayName, bio, new Date().toISOString());
  const row = stmt.userCard.get(user.id, user.id);
  return sendJson(res, 200, { ok: true, profile: row ? userJson(row, user.id) : null });
}

function handleUserAvatar(req, res, url, userId) {
  requireUser(req);
  const row = stmt.getAvatar.get(userId);
  if (!row) throw new HttpError(404, 'TA 还没有设置头像', 'NO_AVATAR');
  const body = Buffer.from(row.data);
  const requested = url.searchParams.get('v');
  /* 版本号匹配才允许长缓存；否则协商校验，换头像后立即可见 */
  const versionValid = requested !== null && requested === row.version;
  const etag = `"${row.version}"`;
  const headers = {
    'Content-Type': row.mime,
    'Content-Length': body.length,
    'Cache-Control': versionValid ? 'private, max-age=31536000, immutable' : 'private, no-cache, must-revalidate',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': headers['Cache-Control'] });
    res.end();
    return;
  }
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

/* ---------------- 路由 ---------------- */

const POST_ROUTE = /^\/api\/social\/posts\/([\w-]{4,64})(?:\/(like))?$/;
const USER_ROUTE = /^\/api\/social\/users\/([\w-]{2,64})(?:\/(follow|followers|following))?$/;
const AVATAR_ROUTE = /^\/api\/social\/avatar\/([\w-]{2,64})$/;

/**
 * 处理 /api/social/*；命中返回 true，未命中返回 false 交给上层 404。
 * 所有写操作都做同源校验（防 CSRF）。
 */
export async function routeSocial(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (pathname === '/api/social/feed' && method === 'GET') {
    await handleFeed(req, res, url);
    return true;
  }

  if (pathname === '/api/social/posts' && method === 'POST') {
    checkOrigin(req);
    await handleCreatePost(req, res);
    return true;
  }

  const postMatch = POST_ROUTE.exec(pathname);
  if (postMatch) {
    const [, postId, action] = postMatch;
    if (action === 'like' && (method === 'POST' || method === 'DELETE')) {
      checkOrigin(req);
      handleLike(req, res, postId, method === 'POST');
      return true;
    }
    if (!action && method === 'GET') {
      handleGetPost(req, res, postId);
      return true;
    }
    if (!action && method === 'DELETE') {
      checkOrigin(req);
      handleDeletePost(req, res, postId);
      return true;
    }
  }

  if (pathname === '/api/social/users' && method === 'GET') {
    handleSearchUsers(req, res, url);
    return true;
  }

  const userMatch = USER_ROUTE.exec(pathname);
  if (userMatch) {
    const [, userId, action] = userMatch;
    if (!action && method === 'GET') {
      handleUserDetail(req, res, userId);
      return true;
    }
    if (action === 'follow' && (method === 'POST' || method === 'DELETE')) {
      checkOrigin(req);
      handleFollow(req, res, userId, method === 'POST');
      return true;
    }
    if ((action === 'followers' || action === 'following') && method === 'GET') {
      handleFollowList(req, res, userId, action);
      return true;
    }
  }

  if (pathname === '/api/social/profile' && method === 'GET') {
    handleGetProfile(req, res);
    return true;
  }

  if (pathname === '/api/social/profile' && method === 'PUT') {
    checkOrigin(req);
    await handleUpdateProfile(req, res);
    return true;
  }

  const avatarMatch = AVATAR_ROUTE.exec(pathname);
  if (avatarMatch && (method === 'GET' || method === 'HEAD')) {
    handleUserAvatar(req, res, url, avatarMatch[1]);
    return true;
  }

  return false;
}
