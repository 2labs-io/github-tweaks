<p align="center">
  <img src="assets/logo-512.png" width="112" alt="GitHub Tweaks logo">
</p>

<h1 align="center">GitHub Tweaks</h1>

<p align="center">Small quality-of-life fixes for github.com, built to look and behave like GitHub itself.</p>

---

## Tweaks

### Image lightbox

On GitHub, clicking an image in an issue or pull request opens it in a new tab. With this tweak on, it opens in a viewer on the same page instead, and you can step through every image on that page from there.

- Opens with a zoom animation from the image you clicked
- Shows a filmstrip of every image on the page, across all comments, in order
- Shows the comment author and the image's alt text when it has some
- Zoom: click the image, use the buttons, pinch on a trackpad, or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + scroll. Drag to pan.
- Swipe or drag sideways to change images
- Copy the image link, download the image, or open it in a new tab
- Uses GitHub's Primer colors and Octicons, so it follows your light, dark, or high-contrast theme
- Links that point somewhere other than an image (such as a CI badge) keep working as before
- <kbd>⌘</kbd>/<kbd>Ctrl</kbd>/<kbd>Shift</kbd>/middle-click still open the image in a new tab or window

| Key | Action |
| --- | --- |
| <kbd>←</kbd> <kbd>→</kbd> | Previous / next image |
| <kbd>+</kbd> <kbd>-</kbd> | Zoom in / out |
| <kbd>0</kbd> | Fit to screen |
| <kbd>Esc</kbd> | Close |

While the viewer is open, it blocks GitHub's own keyboard shortcuts so they don't fire behind it.

## Install

The extension isn't on the Chrome Web Store, so you load it unpacked.

### From a release

1. Download `github-tweaks-vX.Y.Z.zip` from the [latest release](https://github.com/2labs-io/github-tweaks/releases/latest).
2. Unzip it into a folder you'll keep. Chrome loads the extension from that folder, so don't delete it.
3. Open `chrome://extensions` in Chrome (or any Chromium browser: Edge, Arc, Brave).
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).
6. Pin the extension and reload any open GitHub tabs.

To update, unzip the new release over the same folder, then click the reload icon on the extension's card in `chrome://extensions`. Your settings are kept.

### From source

Clone the repo (`git clone https://github.com/2labs-io/github-tweaks.git`) and follow steps 3–6 above, selecting the cloned folder. To update, run `git pull` and reload the extension.

### Making a release

```sh
zip -r github-tweaks-v0.1.0.zip manifest.json src icons -x "*.DS_Store"
gh release create v0.1.0 github-tweaks-v0.1.0.zip --title "v0.1.0"
```

Bump `version` in `manifest.json` first so Chrome shows the new version.

Click the toolbar icon to turn tweaks on or off. Changes take effect immediately on open tabs and sync across your Chrome profile.

## Project layout

```
manifest.json                      Manifest V3 config
src/shared/tweaks.js               Registry of tweaks (id, name, description, default)
src/content/core.js                Settings loader + change events for content scripts
src/content/octicons.js            Octicon SVGs used in the UI
src/tweaks/image-lightbox/         The lightbox tweak (JS + CSS)
src/popup/                         Toolbar popup with on/off switches
src/background/service-worker.js   Handles downloads (cross-origin <a download> doesn't work)
assets/                            Logo sources (SVG) and a 512px render
icons/                             Extension icons, rendered from assets/
```

There's no build step. The files are loaded exactly as they are in the repo.

## Adding a tweak

1. Add an entry to `src/shared/tweaks.js`. The popup picks it up automatically.
2. Create `src/tweaks/<name>/` with your script (and CSS if needed).
3. Add the files to `content_scripts` in `manifest.json`, after `src/content/core.js`.
4. Gate the behavior on `GitHubTweaks.isEnabled("<id>")` and react to `GitHubTweaks.onChange(...)` so the popup switch works without a page reload.

Some things to keep in mind:

- GitHub swaps pages without full reloads (Turbo and React routing), so use delegated listeners on `window`/`document` rather than binding to elements at load.
- Use Primer CSS variables (`--fgColor-default`, `--bgColor-default`, `--borderColor-default`, …) with fallbacks so the tweak matches every theme.
- Prefix classes with `ght-` to avoid colliding with GitHub's styles.

## Logo

The logo is GitHub's mark with a green slider badge cut into the corner. To re-render the icons after editing the SVGs (requires `librsvg`):

```sh
rsvg-convert -w 16 -h 16 assets/logo-16.svg -o icons/icon-16.png
for s in 32 48 128; do rsvg-convert -w $s -h $s assets/logo.svg -o icons/icon-$s.png; done
rsvg-convert -w 512 -h 512 assets/logo.svg -o assets/logo-512.png
```

## Permissions

- `storage`: remembers which tweaks are on
- `downloads`: lets the lightbox's download button save images
- Host access is limited to `https://github.com/*`

The extension makes no network requests of its own and collects no data.

---

Not affiliated with GitHub. The GitHub mark and Octicons belong to GitHub, Inc.; Octicons are MIT licensed.
