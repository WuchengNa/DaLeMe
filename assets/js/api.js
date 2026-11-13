/* 大了么 · 后端 API 客户端 */
class ApiError extends Error {
  constructor(message, status, code = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError('网络连接失败，请稍后重试', 0, 'NETWORK_ERROR');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || `请求失败（${response.status}）`, response.status, payload?.code);
  }
  return payload;
}

export const api = {
  getMe: () => request('/api/auth/me'),
  register: (username, password, remember = false) =>
    request('/api/auth/register', {
      method: 'POST',
      body: { username, password, confirmPassword: password, remember },
    }),
  login: (username, password, remember = false) =>
    request('/api/auth/login', { method: 'POST', body: { username, password, remember } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  logoutAll: () => request('/api/auth/logout-all', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/password', { method: 'PUT', body: { currentPassword, newPassword } }),
  deleteAccount: (password) => request('/api/account', { method: 'DELETE', body: { password } }),
  getCloudData: () => request('/api/data'),
  putCloudData: (data) => request('/api/data', { method: 'PUT', body: { data } }),
  uploadAvatar: (image) => request('/api/avatar', { method: 'PUT', body: { image } }),
  deleteAvatar: () => request('/api/avatar', { method: 'DELETE' }),

  /* ---------------- 社交：大大广场 / 关注 ---------------- */
  socialFeed: ({ scope = 'square', before = '', limit = 10 } = {}) => {
    const params = new URLSearchParams({ scope, limit: String(limit) });
    if (before) params.set('before', before);
    return request(`/api/social/feed?${params.toString()}`);
  },
  createPost: (workoutId, caption = '') =>
    request('/api/social/posts', { method: 'POST', body: { workoutId, caption } }),
  getPost: (id) => request(`/api/social/posts/${encodeURIComponent(id)}`),
  deletePost: (id) => request(`/api/social/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  likePost: (id, liked) =>
    request(`/api/social/posts/${encodeURIComponent(id)}/like`, {
      method: liked ? 'DELETE' : 'POST',
    }),
  getSocialProfile: () => request('/api/social/profile'),
  updateSocialProfile: (patch) => request('/api/social/profile', { method: 'PUT', body: patch }),
  searchUsers: (q = '') =>
    request(`/api/social/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getUser: (id) => request(`/api/social/users/${encodeURIComponent(id)}`),
  followUser: (id) => request(`/api/social/users/${encodeURIComponent(id)}/follow`, { method: 'POST' }),
  unfollowUser: (id) =>
    request(`/api/social/users/${encodeURIComponent(id)}/follow`, { method: 'DELETE' }),
  getUserFollows: (id, kind = 'followers') =>
    request(`/api/social/users/${encodeURIComponent(id)}/${kind}`),
};

export { ApiError };
