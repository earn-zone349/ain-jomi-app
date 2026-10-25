// Apply the saved theme before first paint (avoids a light flash in dark mode).
// Kept as a separate file because the Content-Security-Policy forbids inline scripts.
(function () {
  try {
    var m = localStorage.getItem('aj:theme') || 'system';
    var dark = m === 'dark' || (m === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.textSize = localStorage.getItem('aj:textSize') || 'normal';
  } catch (e) {}
})();
