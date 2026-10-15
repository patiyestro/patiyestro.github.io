
/* PATI YESTRO — TWO-FINGER PINCH ZOOM ONLY */
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
        Pinch with two fingers to zoom · Drag to explore
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

  stage.style.touchAction = "none";
  img.style.touchAction = "none";

  let active = false;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let pointers = new Map();
  let gesture = null;
  let sourceImage = null;
  let savedScrollY = 0;
  let oldBodyStyles = {};

  const MIN = 1;
  const MAX = 8;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function bounds() {
    return {
      x: Math.max(0, (img.clientWidth * scale - stage.clientWidth) / 2),
      y: Math.max(0, (img.clientHeight * scale - stage.clientHeight) / 2)
    };
  }

  function render() {
    scale = clamp(scale, MIN, MAX);
    const b = bounds();

    panX = clamp(panX, -b.x, b.x);
    panY = clamp(panY, -b.y, b.y);

    img.style.transform =
      `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${scale})`;

    status.textContent = Math.round(scale * 100) + "%";
  }

  function reset() {
    scale = 1;
    panX = 0;
    panY = 0;
    render();
  }

  function open(image) {
    if (!image || active) return;

    sourceImage = image;
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
    img.src = image.currentSrc || image.src;
    img.alt = image.alt || "Enlarged artwork";

    viewer.classList.add("py-open");
    viewer.setAttribute("aria-hidden", "false");

    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
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
    img.removeAttribute("src");
    sourceImage = null;
  }

  function isArtwork(image) {
    if (!image.matches("img")) return false;
    if (image.closest("#py-zoom-viewer")) return false;
    if (image.closest("header, nav, footer, .site-nav, .site-footer")) return false;

    const rect = image.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return false;

    return !!image.closest(
      "main, article, .studio-image, .artwork-card, .work-card, " +
      ".gallery, .gallery-item, .collection, .collection-grid, " +
      ".painting, .artwork, .works-grid, .studio-gallery"
    );
  }

  function attach(image) {
    if (image.dataset.pyZoomAttached === "yes") return;
    if (!isArtwork(image)) return;

    image.dataset.pyZoomAttached = "yes";
    image.classList.add("py-zoomable");

    /*
     * Do not intercept click events.
     * Your existing single-tap description remains in control.
     */
    image.addEventListener("touchstart", function (event) {
      if (event.touches.length === 2 && !active) {
        event.preventDefault();
        open(image);
      }
    }, { passive: false });
  }

  function scan(root) {
    if (root.matches && root.matches("img")) attach(root);
    if (root.querySelectorAll) root.querySelectorAll("img").forEach(attach);
  }

  scan(document);

  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) scan(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  function points() {
    return Array.from(pointers.values());
  }

  function midpoint(p) {
    return {
      x: (p[0].x + p[1].x) / 2,
      y: (p[0].y + p[1].y) / 2
    };
  }

  function distance(p) {
    return Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
  }

  function beginGesture() {
    const p = points();

    if (p.length === 1) {
      gesture = {
        type: "drag",
        x: p[0].x,
        y: p[0].y,
        panX,
        panY
      };
    } else if (p.length === 2) {
      gesture = {
        type: "pinch",
        distance: Math.max(1, distance(p)),
        scale,
        midpoint: midpoint(p),
        panX,
        panY
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

    beginGesture();
  });

  stage.addEventListener("pointermove", function (event) {
    if (!active || !pointers.has(event.pointerId)) return;

    event.preventDefault();

    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    const p = points();

    if (p.length === 2 && gesture && gesture.type === "pinch") {
      const d = distance(p);
      const mid = midpoint(p);
      const nextScale = clamp(
        gesture.scale * d / gesture.distance,
        MIN,
        MAX
      );

      const ratio = nextScale / gesture.scale;
      const rect = stage.getBoundingClientRect();
      const px = gesture.midpoint.x - rect.left - rect.width / 2;
      const py = gesture.midpoint.y - rect.top - rect.height / 2;

      panX = px - (px - gesture.panX) * ratio +
        mid.x - gesture.midpoint.x;
      panY = py - (py - gesture.panY) * ratio +
        mid.y - gesture.midpoint.y;

      scale = nextScale;
      if (scale === 1) {
        panX = 0;
        panY = 0;
      }

      render();
    } else if (p.length === 1 && gesture && gesture.type === "drag" && scale > 1) {
      panX = gesture.panX + p[0].x - gesture.x;
      panY = gesture.panY + p[0].y - gesture.y;
      render();
    }
  });

  function release(event) {
    if (!pointers.has(event.pointerId)) return;

    pointers.delete(event.pointerId);
    beginGesture();
  }

  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("lostpointercapture", release);

  viewer.querySelector("#py-zoom-in").onclick = function () {
    scale = clamp(scale * 1.5, MIN, MAX);
    render();
  };

  viewer.querySelector("#py-zoom-out").onclick = function () {
    scale = clamp(scale / 1.5, MIN, MAX);
    if (scale === 1) {
      panX = 0;
      panY = 0;
    }
    render();
  };

  viewer.querySelector("#py-zoom-reset").onclick = reset;
  viewer.querySelector("#py-zoom-close").onclick = close;

  document.addEventListener("keydown", function (event) {
    if (active && event.key === "Escape") close();
  });

  window.addEventListener("resize", function () {
    if (active) render();
  });
})();
