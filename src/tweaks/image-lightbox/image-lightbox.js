// Image lightbox: clicking an image in a comment opens an in-page viewer
// with every image on the page, instead of a new tab.
(() => {
  const GT = globalThis.GitHubTweaks;
  const icon = GT.octicon;
  const TWEAK_ID = "imageLightbox";
  const ENABLED_CLASS = "ght-lightbox-enabled";

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 8;
  const ZOOM_STEP = 1.25;
  const SWIPE_THRESHOLD = 60;
  const CLICK_SLOP = 4;
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i;
  const GENERIC_ALT = /^(image|img|screenshot|untitled)$/i;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------------------------------------------------------------------------
  // Which images count

  function linkPointsToImage(anchor, img) {
    let url;
    try {
      url = new URL(anchor.href, location.href);
    } catch {
      return false;
    }
    if (anchor.href === img.src || anchor.href === img.currentSrc) return true;
    if (anchor.href === img.getAttribute("data-canonical-src")) return true;
    if (url.pathname.includes("/user-attachments/assets/")) return true;
    if (url.hostname.endsWith("githubusercontent.com")) return true;
    return IMAGE_EXT.test(url.pathname);
  }

  // An image qualifies if it sits in rendered markdown and isn't a link to
  // somewhere else (badges linking to CI, logos linking to sites, etc.).
  function isViewable(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    if (!img.closest(".markdown-body")) return false;
    if (img.closest("[contenteditable], .ght-lightbox")) return false;
    if (img.classList.contains("emoji") || img.matches(".avatar, [data-hovercard-type]")) return false;
    const anchor = img.closest("a[href]");
    return !anchor || linkPointsToImage(anchor, img);
  }

  function isTiny(img) {
    return img.complete && img.naturalWidth > 0 && (img.naturalWidth <= 32 || img.naturalHeight <= 32);
  }

  // Hidden by theme (#gh-dark-mode-only) or CSS. Images inside closed <details> still count.
  function isRendered(img) {
    return img.getClientRects().length > 0 || !!img.closest("details:not([open])");
  }

  function collectGallery(clicked) {
    const images = [...document.querySelectorAll(".markdown-body img")].filter(
      (img) => img === clicked || (isViewable(img) && isRendered(img) && !isTiny(img))
    );
    return images.map(toItem);
  }

  // The comment author, found by walking up to the nearest ancestor that has a
  // user link outside the markdown body. Works for both classic and React views.
  const AUTHOR_LINKS = [
    "a.author",
    'a[data-testid="avatar-link"]',
    'a[data-hovercard-type="user"]',
    'a[data-hovercard-type="bot"]',
  ];

  function loginFrom(link) {
    const hovercard = link.getAttribute("data-hovercard-url")?.match(/^\/users\/([^/]+)\//);
    if (hovercard) return decodeURIComponent(hovercard[1]);
    const path = new URL(link.href, location.href).pathname.split("/").filter(Boolean);
    if (path.length === 1) return path[0];
    if (path[0] === "apps" && path.length === 2) return path[1];
    return null;
  }

  function findAuthor(img) {
    let node = img.closest(".markdown-body")?.parentElement;
    for (let depth = 0; node && depth < 10; depth++, node = node.parentElement) {
      for (const selector of AUTHOR_LINKS) {
        const link = [...node.querySelectorAll(selector)].find(
          (el) => !el.closest(".markdown-body") && loginFrom(el)
        );
        if (!link) continue;
        const login = loginFrom(link);
        const avatar = [...node.querySelectorAll("img.avatar, img[class*='avatar' i]")].find(
          (el) => !el.closest(".markdown-body") && (el.alt || "").replace(/^@/, "") === login
        );
        return { login, avatar: avatar?.currentSrc || avatar?.src || null };
      }
    }
    return null;
  }

  function toItem(img) {
    const anchor = img.closest("a[href]");
    const src = img.currentSrc || img.src;
    const alt = (img.getAttribute("alt") || "").trim();
    return {
      img,
      src,
      href: anchor?.href || img.getAttribute("data-canonical-src") || src,
      caption: alt && !GENERIC_ALT.test(alt) ? alt : "",
      author: findAuthor(img),
    };
  }

  // ---------------------------------------------------------------------------
  // Viewer DOM

  let root = null;
  let ui = null;
  const state = {
    items: [],
    index: 0,
    scale: 1,
    fitScale: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    returnFocus: null,
    loadToken: 0,
  };

  function button(action, label, iconName, extraClass = "") {
    return `<button type="button" class="ght-lb-btn ${extraClass}" data-action="${action}" aria-label="${label}" data-tip="${label}">${icon(iconName)}</button>`;
  }

  function build() {
    root = document.createElement("div");
    root.className = "ght-lightbox";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Image viewer");
    root.tabIndex = -1;
    root.hidden = true;
    root.innerHTML = `
      <div class="ght-lb-backdrop"></div>
      <div class="ght-lb-stage" data-action="close">
        <img class="ght-lb-image" alt="" draggable="false">
        <div class="ght-lb-spinner" hidden><span></span></div>
      </div>
      <header class="ght-lb-bar ght-lb-top">
        <div class="ght-lb-panel ght-lb-meta">
          <span class="ght-lb-counter"></span>
          <span class="ght-lb-author" hidden><img alt=""><span></span></span>
          <span class="ght-lb-caption"></span>
        </div>
        <div class="ght-lb-panel ght-lb-actions">
          ${button("zoom-out", "Zoom out", "zoomOut")}
          <button type="button" class="ght-lb-btn ght-lb-zoom" data-action="fit" aria-label="Fit to screen" data-tip="Fit to screen">100%</button>
          ${button("zoom-in", "Zoom in", "zoomIn")}
          <span class="ght-lb-divider"></span>
          ${button("copy", "Copy link", "copy")}
          ${button("download", "Download", "download")}
          ${button("open", "Open in new tab", "linkExternal")}
          <span class="ght-lb-divider"></span>
          ${button("close", "Close", "x")}
        </div>
      </header>
      ${button("prev", "Previous image", "chevronLeft", "ght-lb-nav ght-lb-prev")}
      ${button("next", "Next image", "chevronRight", "ght-lb-nav ght-lb-next")}
      <nav class="ght-lb-bar ght-lb-bottom" aria-label="All images">
        <div class="ght-lb-panel ght-lb-strip"></div>
      </nav>
      <div class="ght-lb-sr" aria-live="polite"></div>
    `;
    document.body.append(root);

    const q = (sel) => root.querySelector(sel);
    ui = {
      stage: q(".ght-lb-stage"),
      image: q(".ght-lb-image"),
      spinner: q(".ght-lb-spinner"),
      counter: q(".ght-lb-counter"),
      author: q(".ght-lb-author"),
      caption: q(".ght-lb-caption"),
      zoom: q(".ght-lb-zoom"),
      copy: q('[data-action="copy"]'),
      prev: q(".ght-lb-prev"),
      next: q(".ght-lb-next"),
      bottom: q(".ght-lb-bottom"),
      strip: q(".ght-lb-strip"),
      live: q(".ght-lb-sr"),
    };

    root.addEventListener("click", onViewerClick);
    ui.stage.addEventListener("wheel", onWheel, { passive: false });
    ui.stage.addEventListener("pointerdown", onPointerDown);
    ui.stage.addEventListener("dblclick", (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------------------
  // Geometry

  function stageRect() {
    return ui.stage.getBoundingClientRect();
  }

  // Space the image may occupy when fitted: the stage minus room for the bars.
  function fitBox() {
    const r = stageRect();
    const top = root.querySelector(".ght-lb-top").offsetHeight + 16;
    const bottom = ui.bottom.hidden ? 24 : ui.bottom.offsetHeight + 16;
    const side = r.width > 720 ? 80 : 16;
    return { left: side, top, width: r.width - side * 2, height: r.height - top - bottom };
  }

  function computeFit() {
    const box = fitBox();
    return Math.min(1, box.width / state.width, box.height / state.height);
  }

  function centeredPosition(scale) {
    const box = fitBox();
    return {
      x: box.left + (box.width - state.width * scale) / 2,
      y: box.top + (box.height - state.height * scale) / 2,
    };
  }

  // Keep a zoomed image from being dragged off-screen; center it on axes where it fits.
  function clampPosition(x, y, scale) {
    const r = stageRect();
    const w = state.width * scale;
    const h = state.height * scale;
    const centered = centeredPosition(scale);
    return {
      x: w <= r.width ? centered.x : Math.min(0, Math.max(r.width - w, x)),
      y: h <= r.height ? centered.y : Math.min(0, Math.max(r.height - h, y)),
    };
  }

  function render({ animate = true } = {}) {
    ui.image.classList.toggle("is-animated", animate && !reducedMotion.matches);
    ui.image.style.width = `${state.width}px`;
    ui.image.style.height = `${state.height}px`;
    ui.image.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
    ui.zoom.textContent = `${Math.round(state.scale * 100)}%`;
    root.classList.toggle("is-zoomed", state.scale > state.fitScale + 0.001);
  }

  function setZoom(scale, origin, opts) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
    const r = stageRect();
    const ox = origin ? origin.x - r.left : r.width / 2;
    const oy = origin ? origin.y - r.top : r.height / 2;
    const ratio = next / state.scale;
    const pos = clampPosition(ox - (ox - state.x) * ratio, oy - (oy - state.y) * ratio, next);
    Object.assign(state, { scale: next, ...pos });
    render(opts);
  }

  function fit(opts) {
    state.fitScale = computeFit();
    state.scale = state.fitScale;
    Object.assign(state, centeredPosition(state.scale));
    render(opts);
  }

  // Place the viewer image exactly over a page image (for open/close morphs).
  function placeOver(el) {
    const from = el.getBoundingClientRect();
    const r = stageRect();
    if (!from.width || !from.height || !state.width) return false;
    const inView = from.bottom > 0 && from.top < innerHeight && from.right > 0 && from.left < innerWidth;
    if (!inView) return false;
    state.scale = from.width / state.width;
    state.x = from.left - r.left;
    state.y = from.top - r.top;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Showing images

  function naturalSize(img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w && h) return { width: w, height: h };
    // SVGs without intrinsic size: fall back to the rendered box or a sane default.
    const rect = img.getBoundingClientRect();
    return rect.width && rect.height ? { width: rect.width, height: rect.height } : { width: 800, height: 600 };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const probe = new Image();
      probe.decoding = "async";
      probe.onload = () => resolve(probe);
      probe.onerror = reject;
      probe.src = src;
    });
  }

  async function show(index, { morphFrom = null } = {}) {
    const count = state.items.length;
    state.index = (index + count) % count;
    const item = state.items[state.index];
    const token = ++state.loadToken;

    updateChrome(item);

    const spinnerTimer = setTimeout(() => (ui.spinner.hidden = false), 150);
    ui.image.classList.add("is-loading");
    let loaded;
    try {
      loaded = await loadImage(item.src);
    } catch {
      loaded = null;
    }
    clearTimeout(spinnerTimer);
    if (token !== state.loadToken) return;
    ui.spinner.hidden = true;

    Object.assign(state, loaded ? naturalSize(loaded) : naturalSize(item.img));
    ui.image.src = item.src;
    ui.image.alt = item.caption || "";
    await ui.image.decode?.().catch(() => {});
    if (token !== state.loadToken) return;

    if (morphFrom && !reducedMotion.matches && placeOver(morphFrom)) {
      render({ animate: false });
      ui.image.classList.remove("is-loading");
      ui.image.getBoundingClientRect(); // commit the start frame before animating
      fit({ animate: true });
    } else {
      fit({ animate: false });
      ui.image.classList.remove("is-loading");
    }

    preload(state.index + 1);
    preload(state.index - 1);
  }

  function preload(index) {
    const count = state.items.length;
    if (count < 2) return;
    new Image().src = state.items[(index + count) % count].src;
  }

  function updateChrome(item) {
    const count = state.items.length;
    const many = count > 1;
    ui.counter.textContent = many ? `${state.index + 1} / ${count}` : "1 image";
    ui.caption.textContent = item.caption;
    ui.caption.title = item.caption;
    ui.author.hidden = !item.author;
    if (item.author) {
      const avatar = ui.author.querySelector("img");
      avatar.hidden = !item.author.avatar;
      if (item.author.avatar) avatar.src = item.author.avatar;
      ui.author.querySelector("span").textContent = item.author.login;
    }
    ui.prev.hidden = ui.next.hidden = !many;
    ui.bottom.hidden = !many;
    ui.live.textContent = `Image ${state.index + 1} of ${count}${item.caption ? `: ${item.caption}` : ""}`;
    resetCopyButton();

    [...ui.strip.children].forEach((thumb, i) => {
      const current = i === state.index;
      thumb.classList.toggle("is-current", current);
      thumb.setAttribute("aria-current", current ? "true" : "false");
      if (current) scrollThumbIntoView(thumb);
    });
  }

  function scrollThumbIntoView(thumb) {
    const strip = ui.strip;
    const target = thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2;
    strip.scrollTo({ left: target, behavior: reducedMotion.matches ? "auto" : "smooth" });
  }

  function buildStrip() {
    ui.strip.replaceChildren(
      ...state.items.map((item, i) => {
        const thumb = document.createElement("button");
        thumb.type = "button";
        thumb.className = "ght-lb-thumb";
        thumb.dataset.action = "goto";
        thumb.dataset.index = String(i);
        thumb.setAttribute("aria-label", `Image ${i + 1}${item.caption ? `: ${item.caption}` : ""}`);
        const img = document.createElement("img");
        img.src = item.src;
        img.alt = "";
        img.loading = "lazy";
        img.draggable = false;
        thumb.append(img);
        return thumb;
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Open / close

  let scrollbarComp = "";

  function open(clicked) {
    if (!root) build();
    state.items = collectGallery(clicked);
    const index = Math.max(
      0,
      state.items.findIndex((item) => item.img === clicked)
    );
    state.returnFocus = document.activeElement;

    buildStrip();
    lockScroll();
    root.hidden = false;
    root.getBoundingClientRect();
    root.classList.add("is-open");
    document.addEventListener("keydown", onKeydown, true);
    window.addEventListener("resize", onResize);

    show(index, { morphFrom: clicked });
    root.focus({ preventScroll: true });
  }

  function close() {
    if (!root || root.hidden || root.classList.contains("is-closing")) return;
    state.loadToken++;
    document.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("resize", onResize);

    const source = state.items[state.index]?.img;
    const morph = !reducedMotion.matches && source && placeOver(source);
    if (morph) render({ animate: true });

    root.classList.remove("is-open");
    root.classList.add("is-closing");
    const finish = () => {
      root.hidden = true;
      root.classList.remove("is-closing", "is-zoomed");
      ui.image.removeAttribute("src");
      ui.strip.replaceChildren();
      unlockScroll();
      state.returnFocus?.focus?.({ preventScroll: true });
    };
    if (reducedMotion.matches) finish();
    else setTimeout(finish, 220);
  }

  function lockScroll() {
    const html = document.documentElement;
    const gap = innerWidth - html.clientWidth;
    scrollbarComp = html.style.paddingRight;
    if (gap > 0) html.style.paddingRight = `${gap}px`;
    html.classList.add("ght-lightbox-lock");
  }

  function unlockScroll() {
    const html = document.documentElement;
    html.style.paddingRight = scrollbarComp;
    html.classList.remove("ght-lightbox-lock");
  }

  // ---------------------------------------------------------------------------
  // Actions

  function resetCopyButton() {
    ui.copy.innerHTML = icon("copy");
    ui.copy.dataset.tip = "Copy link";
    ui.copy.classList.remove("is-success");
  }

  async function copyLink() {
    const { href } = state.items[state.index];
    try {
      await navigator.clipboard.writeText(href);
      ui.copy.innerHTML = icon("check");
      ui.copy.dataset.tip = "Copied!";
      ui.copy.classList.add("is-success");
      setTimeout(resetCopyButton, 1600);
    } catch {
      ui.copy.dataset.tip = "Couldn't copy";
    }
  }

  function download() {
    const { src, href } = state.items[state.index];
    chrome.runtime.sendMessage({ type: "download", url: src }).then(
      (res) => !res?.ok && window.open(href, "_blank", "noopener"),
      () => window.open(href, "_blank", "noopener")
    );
  }

  const actions = {
    close,
    prev: () => show(state.index - 1),
    next: () => show(state.index + 1),
    goto: (el) => show(Number(el.dataset.index)),
    "zoom-in": () => setZoom(state.scale * ZOOM_STEP),
    "zoom-out": () => setZoom(state.scale / ZOOM_STEP),
    fit: () => fit(),
    copy: copyLink,
    download,
    open: () => window.open(state.items[state.index].href, "_blank", "noopener"),
  };

  function onViewerClick(e) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const target = e.target.closest("[data-action]");
    if (!target) return;
    // The stage closes on backdrop clicks only. Image clicks are handled on pointerup.
    if (target === ui.stage && e.target !== ui.stage) return;
    actions[target.dataset.action]?.(target, e);
  }

  function toggleZoom(e) {
    if (state.scale > state.fitScale + 0.001) return fit();
    const target = Math.max(1, state.fitScale * 2);
    setZoom(Math.min(target, MAX_ZOOM), { x: e.clientX, y: e.clientY });
  }

  function onKeydown(e) {
    const key = e.key;
    const handled = {
      Escape: close,
      ArrowLeft: () => state.items.length > 1 && actions.prev(),
      ArrowRight: () => state.items.length > 1 && actions.next(),
      "+": actions["zoom-in"],
      "=": actions["zoom-in"],
      "-": actions["zoom-out"],
      0: actions.fit,
    }[key];

    if (key === "Tab") return trapFocus(e);
    if (handled && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      handled();
    }
    // Keep GitHub's own hotkeys (j/k, g i, ?) from firing behind the viewer.
    e.stopPropagation();
  }

  function trapFocus(e) {
    const focusable = [...root.querySelectorAll("button:not([hidden])")].filter(
      (el) => el.offsetParent !== null
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!root.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
    e.stopPropagation();
  }

  let resizeFrame = 0;
  function onResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const wasFit = state.scale <= state.fitScale + 0.001;
      state.fitScale = computeFit();
      if (wasFit) fit({ animate: false });
      else setZoom(state.scale, null, { animate: false });
    });
  }

  // Pinch (ctrl+wheel on trackpads) or ctrl/cmd+wheel zooms at the cursor;
  // a plain wheel pans when zoomed in.
  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      setZoom(state.scale * factor, { x: e.clientX, y: e.clientY }, { animate: false });
    } else if (state.scale > state.fitScale + 0.001) {
      const pos = clampPosition(state.x - e.deltaX, state.y - e.deltaY, state.scale);
      Object.assign(state, pos);
      render({ animate: false });
    }
  }

  // Drag to pan when zoomed; swipe to change image when not.
  let drag = null;
  let suppressClick = false;

  function onPointerDown(e) {
    if (e.button !== 0 || e.target !== ui.image) return;
    drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x: state.x, y: state.y, moved: false };
    ui.stage.setPointerCapture(e.pointerId);
    ui.stage.addEventListener("pointermove", onPointerMove);
    ui.stage.addEventListener("pointerup", onPointerUp);
    ui.stage.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    drag.moved = true;
    root.classList.add("is-dragging");
    if (state.scale > state.fitScale + 0.001) {
      Object.assign(state, clampPosition(drag.x + dx, drag.y + dy, state.scale));
    } else {
      state.x = drag.x + dx;
    }
    render({ animate: false });
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    ui.stage.removeEventListener("pointermove", onPointerMove);
    ui.stage.removeEventListener("pointerup", onPointerUp);
    ui.stage.removeEventListener("pointercancel", onPointerUp);
    root.classList.remove("is-dragging");
    const dx = e.clientX - drag.startX;
    const wasFit = state.scale <= state.fitScale + 0.001;
    // Pointer capture retargets the follow-up click to the stage, which would
    // read as a backdrop click, so swallow it and handle the tap here.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    if (!drag.moved) {
      toggleZoom(e);
    } else {
      if (wasFit) {
        if (Math.abs(dx) > SWIPE_THRESHOLD && state.items.length > 1) show(state.index + (dx < 0 ? 1 : -1));
        else fit();
      }
    }
    drag = null;
  }

  // ---------------------------------------------------------------------------
  // Page hook

  function onPageClick(e) {
    if (!GT.isEnabled(TWEAK_ID)) return;
    // Let cmd/ctrl/shift/middle-click keep their usual "open in new tab/window" meaning.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const img = e.target instanceof Element ? e.target.closest("img") : null;
    if (!img || !isViewable(img)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(img);
  }

  function syncEnabled() {
    const on = GT.isEnabled(TWEAK_ID);
    document.documentElement.classList.toggle(ENABLED_CLASS, on);
    if (!on) close();
  }

  // Capture on window so we run before GitHub's own (React or delegated) handlers.
  window.addEventListener("click", onPageClick, true);
  // GitHub swaps pages with Turbo/React routing; don't leave a viewer over a new page.
  document.addEventListener("turbo:before-visit", close);
  window.addEventListener("popstate", close);
  GT.onChange(syncEnabled);
  syncEnabled();
})();
