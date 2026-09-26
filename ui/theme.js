/**
 * theme.js — presentation-only appearance preference for the lab shell.
 * No beam state, calculations, external packages, or network requests.
 */
export const THEME_STORAGE_KEY = 'structural-lab.theme';
export const THEME_MODES = Object.freeze(['system', 'light', 'dark']);

function safeRead(storage) {
  try { return storage?.getItem(THEME_STORAGE_KEY) ?? null; } catch { return null; }
}

function safeWrite(storage, mode) {
  try {
    if (mode === 'system') storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Appearance still changes for this session when browser storage is blocked.
  }
}

/**
 * Set up the theme button. The returned controller is useful to tests and
 * keeps all appearance behavior outside the engineering/application state.
 */
export function initTheme(doc, env = globalThis) {
  const button = doc?.getElementById?.('theme-toggle');
  if (!button || typeof button.addEventListener !== 'function') return null;

  let media = null;
  try { media = env.matchMedia?.('(prefers-color-scheme: dark)') ?? null; } catch { /* no matchMedia */ }
  const storage = (() => { try { return env.localStorage; } catch { return null; } })();
  const saved = safeRead(storage);
  let mode = THEME_MODES.includes(saved) && saved !== 'system' ? saved : 'system';

  const apply = () => {
    const actual = mode === 'system' ? (media?.matches ? 'dark' : 'light') : mode;
    doc.documentElement.setAttribute('data-theme', actual);
    doc.documentElement.style.colorScheme = actual;
    const labelMode = mode === 'system' ? `System (${actual})` : `${mode[0].toUpperCase()}${mode.slice(1)}`;
    button.textContent = `Theme: ${labelMode}`;
    button.setAttribute('aria-label', `Color theme is set to ${labelMode}. Activate to change.`);
    button.title = mode === 'system'
      ? `Following your device setting (${actual} mode)`
      : `${mode[0].toUpperCase()}${mode.slice(1)} mode selected`;
  };

  button.addEventListener('click', () => {
    mode = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
    safeWrite(storage, mode);
    apply();
  });

  const onSystemChange = () => { if (mode === 'system') apply(); };
  try {
    if (media?.addEventListener) media.addEventListener('change', onSystemChange);
    else media?.addListener?.(onSystemChange);
  } catch { /* older/restricted browser */ }

  apply();
  return {
    getMode: () => mode,
    getActualTheme: () => (mode === 'system' ? (media?.matches ? 'dark' : 'light') : mode),
    setMode: (next) => {
      if (!THEME_MODES.includes(next)) return false;
      mode = next;
      safeWrite(storage, mode);
      apply();
      return true;
    },
    destroy: () => {
      try {
        if (media?.removeEventListener) media.removeEventListener('change', onSystemChange);
        else media?.removeListener?.(onSystemChange);
      } catch { /* no-op */ }
    },
  };
}
