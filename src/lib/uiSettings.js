const STORAGE_KEY = 'uiSettings';

export const defaultUiSettings = {
  sidebarSections: {
    print: true,
    stock: true,
    apps: true,
  },
  adminControls: {
    openTillCashEntry: true,
    adjustFloat: true,
  },
  layout: {
    sidebarWidth: 'standard', // compact | standard | wide
    cartPanelWidth: 'standard', // compact | standard | wide
    contentDensity: 'comfortable', // compact | comfortable | spacious
  },
};

const isObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);

const mergeDeep = (base, override) => {
  if (!isObject(base)) return override;
  const next = { ...base };

  if (!isObject(override)) {
    return next;
  }

  Object.keys(override).forEach((key) => {
    if (isObject(base[key]) && isObject(override[key])) {
      next[key] = mergeDeep(base[key], override[key]);
    } else if (override[key] !== undefined) {
      next[key] = override[key];
    }
  });

  return next;
};

export const getUiSettings = () => {
  if (typeof window === 'undefined') {
    return { ...defaultUiSettings };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...defaultUiSettings };
    }

    const parsed = JSON.parse(stored);
    return mergeDeep(defaultUiSettings, parsed);
  } catch (err) {
    console.warn('Failed to load UI settings, using defaults.', err);
    return { ...defaultUiSettings };
  }
};

export const saveUiSettings = (settings) => {
  if (typeof window === 'undefined') {
    return settings;
  }

  const merged = mergeDeep(defaultUiSettings, settings || {});
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(
    new CustomEvent('uiSettings:updated', { detail: merged })
  );
  return merged;
};

export const resetUiSettings = () => saveUiSettings(defaultUiSettings);
