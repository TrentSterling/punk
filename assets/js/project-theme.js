/* Bridge only legacy RGB color roles; geometry and animation rules stay in the page. */
(function () {
  'use strict';
  var html = document.documentElement;
  var roles = {
    '--color-primary-neon-rgb': '--te-accent', '--color-secondary-neon-rgb': '--te-secondary',
    '--color-accent-neon-rgb': '--te-orange', '--project-ground-x-rgb': '--te-grid-x',
    '--project-panel-rgb': '--te-panel', '--project-bg-rgb': '--te-bg'
  };
  function sync() {
    var custom = html.getAttribute('data-te-project') === 'custom';
    Object.keys(roles).forEach(function (name) {
      var hex = html.style.getPropertyValue(roles[name]).trim();
      var value = custom && /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); }).join(', ') : '';
      if (html.style.getPropertyValue(name) !== value) {
        if (value) html.style.setProperty(name, value); else html.style.removeProperty(name);
      }
    });
  }
  sync();
  new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ['style', 'data-te-project'] });
})();
