// Downloads need the extension context: cross-origin <a download> just navigates.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "download" || typeof message.url !== "string") return;
  chrome.downloads
    .download({ url: message.url })
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});

// GitHub attachment URLs end in a bare asset id, so add an extension from the MIME type.
const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const ext = EXTENSIONS[item.mime];
  if (item.byExtensionId !== chrome.runtime.id || !ext || /\.[a-z0-9]{2,5}$/i.test(item.filename)) {
    suggest();
    return;
  }
  suggest({ filename: `${item.filename}.${ext}` });
});
