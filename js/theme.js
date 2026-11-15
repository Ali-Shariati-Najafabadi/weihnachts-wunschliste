// Classic (non-module) script loaded in <head> so the theme is applied before first paint.
(function () {
  try {
    var saved = window.localStorage.getItem('wwl:theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch (e) {
    /* storage unavailable: follow the system setting */
  }
})();
