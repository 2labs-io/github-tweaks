// Shared runtime for content-script tweaks: settings, change listeners.
(() => {
  const settings = { ...globalThis.GITHUB_TWEAKS_DEFAULTS };
  const listeners = new Set();

  const notify = () => listeners.forEach((fn) => fn(settings));

  const ready = chrome.storage.sync
    .get(globalThis.GITHUB_TWEAKS_DEFAULTS)
    .then((stored) => {
      Object.assign(settings, stored);
      notify();
    })
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue ?? globalThis.GITHUB_TWEAKS_DEFAULTS[key];
    }
    notify();
  });

  globalThis.GitHubTweaks = {
    ready,
    isEnabled: (id) => settings[id] !== false,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();
