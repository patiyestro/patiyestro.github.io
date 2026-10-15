
/* PATI YESTRO — UNIVERSAL IMAGE ZOOM */
(function () {
  "use strict";

  if (window.pyImageZoomLoaded) return;
  window.pyImageZoomLoaded = true;

  const viewer = document.createElement("div");
  viewer.id = "py-zoom-viewer";
  viewer.setAttribute("aria-hidden", "true");

  viewer.innerHTML = `
    <div id="py-zoom-stage">
      <img id="py-zoom-image" alt="Enlarged artwork">
      <div id="py-zoom-status">100%</div>
      <button id="py-zoom-close" type="button"
        aria-label="Close image viewer">×</button>
      <div id="py-zoom-help">
        Pinch or double-tap to zoom · Drag to explore
      </div>
      <div id="py-zoom-controls">
        <button id="py-zoom-out" type="button"
          aria-label="Zoom out">−</button>
        <button id="py-zoom-in" type="button"
          aria-label="Zoom in">+</button>
        <button id="py-zoom-reset" type="button"
          aria-label="Reset zoom">↺</button>
      </div>
    </div>`;

  document.body.appendChild(viewer);

  const stage = viewer.querySelector("#py-zoom-stage");
  const img = viewer.querySelector("#py-zoom-image");
  const status = viewer.querySelector("#py-zoom-status");

  /* Allow the script to handle touch gestures itself. */
  stage.style.touchAction = "none";
  img.style.touchAction = "none";
  stage.style.overscrollBehavior = "contain";

  let scale = 1;
  let panX = 0;
  let panY = 0;

  let pointers = new Map();
  let gesture = null;
  let active = false;
  let savedScrollY = 0;
  let previousFocus = null;
  let oldBodyStyles = {};

  const MIN = 1;
  const MAX = 8;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function bounds() {
    const w = img.clientWidth * scale;
    const h = img.clientHeight * scale;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;

    return {
      x: Math.max(0, (w - sw) / 2),
      y: Math.max(0, (h - sh) / 2)
    };
  }

  function render() {
    scale = clamp(scale, MIN, MAX);

    const b = bounds();
    panX = clamp(panX, -b.x, b.x);
    panY = clamp(panY, -b.y, b.y);

    img.style.transform =
      "translate(-50%, -50%) translate(" +
      panX + "px, " + panY + "px) scale(" + scale + ")";

    status.textContent = Math.round(scale * 100) + "%";

    stage.classList.toggle(
      "py-dragging",
      pointers.size === 1 && scale > 1
    );
  }

  function reset() {
    scale = 1;
    panX = 0;
    panY = 0;
    render();
  }

  function zoom(factor, x, y) {
    const old = scale;
    const next = clamp(scale * factor, MIN, MAX);

    if (x !== undefined && y !== undefined) {
      const rect = stage.getBoundingClientRect();
      const px = x - rect.left - rect.width / 2;
      const py = y - rect.top - rect.height / 2;
      const ratio = next / old;

      panX = px - (px - panX) * ratio;
      panY = py - (py - panY) * ratio;
    }

    scale = next;

    if (scale === 1) {
      panX = 0;
      panY = 0;
    }

    render();
  }

  function open(source) {
    if (!source || !(source.currentSrc || source.src)) return;

    previousFocus = document.activeElement;
    savedScrollY = window.scrollY;

    oldBodyStyles = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };

    active = true;
    pointers.clear();
    gesture = null;
    reset();

    img.onload = render;
    img.onerror = close;
    img.alt = source.alt || "Enlarged artwork";
    img.src = source.currentSrc || source.src;

    viewer.classList.add("py-open");
    viewer.setAttribute("aria-hidden", "false");

    document.body.style.position = "fixed";
    document.body.style.top = "-" + savedScrollY + "px";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    viewer.querySelector("#py-zoom-close").focus({
      preventScroll: true
    });

    if (img.complete && img.naturalWidth) render();
  }

  function close() {
    if (!active) return;

    active = false;

    viewer.classList.remove("py-open");
    viewer.setAttribute("aria-hidden", "true");

    Object.assign(document.body.style, oldBodyStyles);
    window.scrollTo(0, savedScrollY);

    pointers.clear();
    gesture = null;
    img.onload = null;
    img.onerror = null;
    img.removeAttribute("src");

    if (previousFocus && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  }

  function isArtwork(image) {
    if (!image.matches("img")) return false;
    if (image.closest("#py-zoom-viewer")) return false;

    if (image.closest(
      "header, nav, footer, .site-nav, .site-footer"
    )) return false;

    const src = image.currentSrc || image.src || "";
    if (!src || src.startsWith("data:image/svg")) return false;

    const rect = image.getBoundingClientRect();
    const style = getComputedStyle(image);

    if (style.display === "none" ||
        style.visibility === "hidden") return false;

    if (rect.width < 80 || rect.height < 80) return false;

    return !!image.closest(
      "main, article, .studio-image, .artwork-card, " +
      ".work-card, .gallery, .gallery-item, .collection, " +
      ".collection-grid, .painting, .artwork, .works-grid, " +
      ".studio-gallery"
    );
  }

  function scan(root) {
    if (root.matches && root.matches("img")) attach(root);

    if (root.querySelectorAll) {
      root.querySelectorAll("img").forEach(attach);
    }
  }

  /*
   * Preserve the existing description click:
   * one tap replays the original click after a short delay.
   * A second tap opens the zoom viewer instead.
   */
  function attach(image) {
    if (image.dataset.pyZoomAttached === "yes") return;
    if (!isArtwork(image)) return;

    image.dataset.pyZoomAttached = "yes";
    image.classList.add("py-zoomable");

    let tapTimer = null;
    let lastTapTime = 0;
    let lastX = 0;
    let lastY = 0;

    image.addEventListener("click", function (event) {
      if (image.dataset.pyZoomReplay === "yes") {
        delete image.dataset.pyZoomReplay;
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const now = Date.now();
      const x = event.clientX;
      const y = event.clientY;

      const isDoubleTap =
        now - lastTapTime < 350 &&
        Math.hypot(x - lastX, y - lastY) < 40;

      if (isDoubleTap) {
        clearTimeout(tapTimer);
        tapTimer = null;
        lastTapTime = 0;
        open(image);
        return;
      }

      clearTimeout(tapTimer);

      lastTapTime = now;
      lastX = x;
      lastY = y;

      tapTimer = setTimeout(function () {
        image.dataset.pyZoomReplay = "yes";

        image.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y
        }));

        tapTimer = null;
      }, 350);
    });
  }

  scan(document);

  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) scan(node);
      });
    });
  }).observe(document.body, {
    childList: true,
    subtree: true
  });

  function midpoint(points) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
  }

  function distance(points) {
    return Math.hypot(
      points[1].x - points[0].x,
      points[1].y - points[0].y
    );
  }

  function startGesture() {
    const pts = Array.from(pointers.values());

    if (pts.length === 1) {
      gesture = {
        type: "drag",
        x: pts[0].x,
        y: pts[0].y,
        panX: panX,
        panY: panY
      };
    } else if (pts.length === 2) {
      gesture = {
        type: "pinch",
        distance: Math.max(1, distance(pts)),
        scale: scale,
        midpoint: midpoint(pts),
        panX: panX,
        panY: panY
      };
    } else {
      gesture = null;
    }
  }

  stage.addEventListener("pointerdown", function (event) {
    if (!active || event.target.closest("button")) return;

    event.preventDefault();

    try {
      stage.setPointerCapture(event.pointerId);
    } catch (_) {}

    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    startGesture();
  });

  stage.addEventListener("pointermove", function (event) {
    if (!active || !pointers.has(event.pointerId)) return;

    event.preventDefault();

    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    const pts = Array.from(pointers.values());

    if (pts.length === 1 && gesture?.type === "drag") {
      if (scale > 1) {
        panX = gesture.panX + pts[0].x - gesture.x;
        panY = gesture.panY + pts[0].y - gesture.y;
        render();
      }
    } else if (pts.length === 2 && gesture?.type === "pinch") {
      const d = distance(pts);
      const mid = midpoint(pts);
      const next = clamp(
        gesture.scale * d / gesture.distance,
        MIN,
        MAX
      );

      const ratio = next / gesture.scale;

      const rect = stage.getBoundingClientRect();
      const px = gesture.midpoint.x - rect.left - rect.width / 2;
      const py = gesture.midpoint.y - rect.top - rect.height / 2;

      panX = px - (px - gesture.panX) * ratio +
        mid.x - gesture.midpoint.x;

      panY = py - (py - gesture.panY) * ratio +
        mid.y - gesture.midpoint.y;

      scale = next;

      if (scale === 1) {
        panX = 0;
        panY = 0;
      }

      render();
    }
  });

  function release(event) {
    if (!pointers.has(event.pointerId)) return;

    pointers.delete(event.pointerId);
    startGesture();

    stage.classList.remove("py-dragging");
  }

  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("lostpointercapture", release);

  stage.addEventListener("click", function (event) {
    if (!active || event.target.closest("button")) return;

    if (event.detail > 1) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  stage.addEventListener("wheel", function (event) {
    if (!active) return;

    event.preventDefault();

    zoom(
      event.deltaY < 0 ? 1.15 : 1 / 1.15,
      event.clientX,
      event.clientY
    );
  }, { passive: false });

  viewer.querySelector("#py-zoom-in").onclick =
    function () { zoom(1.5); };

  viewer.querySelector("#py-zoom-out").onclick =
    function () { zoom(1 / 1.5); };

  viewer.querySelector("#py-zoom-reset").onclick = reset;
  viewer.querySelector("#py-zoom-close").onclick = close;

  document.addEventListener("keydown", function (event) {
    if (!active) return;

    if (event.key === "Escape") close();
    if (event.key === "+" || event.key === "=") zoom(1.5);
    if (event.key === "-") zoom(1 / 1.5);
    if (event.key === "0") reset();
  });

  window.addEventListener("resize", function () {
    if (active) render();
  });
})();
