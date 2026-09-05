(function () {
  'use strict';

  var STORAGE_KEY = 'track_theme';

  /* The canonical stored values, and the ONE place the pair is spelled.
     It used to be spelled at four sites — the fallback, the click handler,
     the system-preference listener and TrackTheme.toggle — which is the
     duplication shape that has already cost this project a caution predicate.
     Miss one and applyTheme becomes a silent no-op: no attribute is set, and
     every bare `html[data-theme]` rule in styles.css (focus rings, the notes
     widget, the Firebase overlay, all four banners) loses its styling at once.

     'dark' deliberately KEEPS its name rather than becoming 'night'. A tab
     still running the cached previous script understands 'dark' and does not
     understand 'night', so renaming it would break the one direction that
     still works across versions. 'night' is the display name only. */
  var GRIT = 'grit';
  var NIGHT = 'dark';

  var root = document.documentElement;
  var colorSchemeQuery = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  var toggle = null;
  var hostObserver = null;

  /* The one normaliser. Both the storage read and applyTheme go through it, so
     `TrackTheme.set('light')` from an older tab or a console still works and
     still canonicalises. Returns null for anything unrecognised, which is the
     only case applyTheme refuses. */
  function normalizeTheme(value) {
    if (value === GRIT || value === 'light') return GRIT;
    if (value === NIGHT || value === 'night') return NIGHT;
    return null;
  }

  /* `color-scheme` is written INLINE below, so it beats both stylesheet
     declarations. Its grammar accepts a custom ident, which means a raw theme
     name would parse, stick, and be understood by no UA — silently falling
     back to light. That would leave a night page with light scrollbars and
     light native date pickers, and there are 19 date/time inputs across the
     app. Map the name to a keyword; never pass the name through. */
  function colorSchemeFor(theme) {
    return theme === NIGHT ? 'dark' : 'light';
  }

  /* Reads the stored preference, aliasing the superseded 'light'. The alias is
     read-only on purpose: rewriting the key would fire `storage` in every open
     tab, and a tab on the cached previous script does not recognise 'grit', so
     it would fall through to matchMedia and silently flip appearance under a
     user who touched nothing.

     The accept-list and the alias must stay in this one function. If a stored
     canonical value made this return null, handleSystemTheme below would
     conclude the user had never chosen and let the next OS change override an
     explicit preference. */
  function readStoredTheme() {
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return null;
    }
  }

  function preferredTheme() {
    return readStoredTheme() || (colorSchemeQuery && colorSchemeQuery.matches ? NIGHT : GRIT);
  }

  function updateToggle(theme) {
    if (!toggle) return;
    var isNight = theme === NIGHT;
    var label = toggle.querySelector('.theme-toggle__label');
    var next = isNight ? 'Grit' : 'Night';

    toggle.setAttribute('aria-checked', String(isNight));
    toggle.setAttribute('aria-label', 'Switch to ' + next + ' mode');
    toggle.title = 'Switch to ' + next + ' mode';
    if (label) label.textContent = isNight ? 'Night' : 'Grit';
  }

  function applyTheme(theme, persist) {
    var next = normalizeTheme(theme);
    if (!next) return;

    root.dataset.theme = next;
    root.style.colorScheme = colorSchemeFor(next);

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (error) {}
    }

    updateToggle(next);
    root.dispatchEvent(new CustomEvent('track-theme-change', {
      detail: { theme: next }
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
    /* A growth-ring cross-section rather than a sun: the rings are the identity,
       and their spacing narrows outward the way a real section's does. */
    toggle.innerHTML = [
      '<span class="theme-toggle__icon" aria-hidden="true">',
      '  <svg class="theme-toggle__rings" viewBox="0 0 24 24" fill="none" stroke="currentColor">',
      '    <circle cx="12" cy="12" r="10"></circle>',
      '    <circle cx="12" cy="12" r="7.9"></circle>',
      '    <circle cx="12" cy="12" r="5.9"></circle>',
      '    <circle cx="12" cy="12" r="4"></circle>',
      '    <circle cx="12" cy="12" r="2.2"></circle>',
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
      applyTheme(root.dataset.theme === NIGHT ? GRIT : NIGHT, true);
    });

    if (!moveToggleToHost()) {
      document.body.appendChild(toggle);
    }
    updateToggle(normalizeTheme(root.dataset.theme) || preferredTheme());

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

  /* Re-derives rather than trusting event.newValue, so a CLEARED key correctly
     falls back to the OS preference and a legacy 'light' from an older tab is
     aliased on the way in. */
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) applyTheme(preferredTheme(), false);
  });

  if (colorSchemeQuery) {
    var handleSystemTheme = function (event) {
      if (!readStoredTheme()) applyTheme(event.matches ? NIGHT : GRIT, false);
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
      applyTheme(root.dataset.theme === NIGHT ? GRIT : NIGHT, true);
    }
  };
})();
