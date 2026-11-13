/* 大了么 · 首屏主题预加载：在样式表渲染前应用已保存的主题，避免闪白/闪黑 */
(function () {
  var KEY = 'liantrace.state.v1';
  var LIGHT_META = '#fffaf5';
  var DARK_META = '#1e1611';
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return; /* 全新状态：index.html 已默认浅色 */
    var parsed = JSON.parse(raw);
    var settings = (parsed && parsed.settings) || {};
    /* 与 store.js 的 normalizeSettings 保持一致：
       未主动选择过主题的历史状态一律按明亮的浅色渲染。 */
    var theme =
      settings.theme === 'dark' && !settings.themeExplicit ? 'light' : settings.theme;
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.dataset.theme = theme;
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = theme === 'light' ? LIGHT_META : DARK_META;
    }
  } catch (error) {
    /* 忽略主题预加载失败 */
  }
})();
