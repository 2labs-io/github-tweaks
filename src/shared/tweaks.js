// Single source of truth for every tweak. Loaded by the content scripts and the popup.
globalThis.GITHUB_TWEAKS = [
  {
    id: "imageLightbox",
    name: "Image lightbox",
    description:
      "Open images in issues and pull requests in an in-page viewer instead of a new tab. Browse every image on the page without leaving it.",
    default: true,
  },
];

globalThis.GITHUB_TWEAKS_DEFAULTS = Object.fromEntries(
  globalThis.GITHUB_TWEAKS.map((tweak) => [tweak.id, tweak.default])
);
