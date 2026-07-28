(function () {
  'use strict';

  var STORAGE_KEY = 'track_theme';
  var root = document.documentElement;
  var colorSchemeQuery = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  var toggle = null;
  var hostObserver = null;

  function readStoredTheme() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : null;
    } catch (error) {
      return null;
    }
  }

  function preferredTheme() {
    return readStoredTheme() || (colorSchemeQuery && colorSchemeQuery.matches ? 'dark' : 'light');
  }

  function updateToggle(theme) {
    if (!toggle) return;
    var isDark = theme === 'dark';
    var label = toggle.querySelector('.theme-toggle__label');

    toggle.setAttribute('aria-checked', String(isDark));
    toggle.setAttribute('aria-label', 'Switch to ' + (isDark ? 'light' : 'dark') + ' mode');
    toggle.title = 'Switch to ' + (isDark ? 'light' : 'dark') + ' mode';
    if (label) label.textContent = isDark ? 'Dark' : 'Light';
  }

  function applyTheme(theme, persist) {
    if (theme !== 'light' && theme !== 'dark') return;

    root.dataset.theme = theme;
    root.style.colorScheme = theme;

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch (error) {}
    }

    updateToggle(theme);
    root.dispatchEvent(new CustomEvent('track-theme-change', {
      detail: { theme: theme }
    }));
  }

  function moveToggleToHost() {
    if (!toggle) return false;
    var host = document.querySelector('[data-theme-toggle-host]');
    if (!host) return false;
    if (toggle.parentNode !== host) host.appendChild(toggle);
    return true;
  }

  function buildToggle() {
    if (toggle || !document.body) return;

    toggle = document.createElement('button');
    toggle.id = 'theme-toggle';
    toggle.className = 'theme-toggle';
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.innerHTML = [
      '<span class="theme-toggle__icon" aria-hidden="true">',
      '  <svg class="theme-toggle__sun" viewBox="0 0 24 24" fill="none" stroke="currentColor">',
      '    <circle cx="12" cy="12" r="3.5"></circle>',
      '    <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path>',
      '  </svg>',
      '  <svg class="theme-toggle__moon" viewBox="0 0 24 24" fill="none" stroke="currentColor">',
      '    <path d="M20.4 15.2A8.4 8.4 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z"></path>',
      '  </svg>',
      '</span>',
      '<span class="theme-toggle__label"></span>',
      '<span class="theme-toggle__track" aria-hidden="true">',
      '  <span class="theme-toggle__thumb"></span>',
      '</span>'
    ].join('');

    toggle.addEventListener('click', function () {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
    });

    if (!moveToggleToHost()) {
      document.body.appendChild(toggle);
    }
    updateToggle(root.dataset.theme || preferredTheme());

    if (!document.querySelector('[data-theme-toggle-host]')) {
      hostObserver = new MutationObserver(function () {
        if (moveToggleToHost() && hostObserver) {
          hostObserver.disconnect();
          hostObserver = null;
        }
      });
      hostObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  applyTheme(preferredTheme(), false);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildToggle, { once: true });
  } else {
    buildToggle();
  }

  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) applyTheme(preferredTheme(), false);
  });

  if (colorSchemeQuery) {
    var handleSystemTheme = function (event) {
      if (!readStoredTheme()) applyTheme(event.matches ? 'dark' : 'light', false);
    };
    if (colorSchemeQuery.addEventListener) {
      colorSchemeQuery.addEventListener('change', handleSystemTheme);
    } else if (colorSchemeQuery.addListener) {
      colorSchemeQuery.addListener(handleSystemTheme);
    }
  }

  window.TrackTheme = {
    get: function () { return root.dataset.theme; },
    set: function (theme) { applyTheme(theme, true); },
    toggle: function () {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
    }
  };
})();
