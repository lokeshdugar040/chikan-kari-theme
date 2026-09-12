/**
 * Motion layer
 * ------------
 * Lightweight, dependency-free interactions layered on top of the theme:
 *
 *  1. Scroll reveal   – sections fade/slide in as they enter the viewport
 *  2. Card tilt       – subtle 3D tilt on product/collection cards (pointer devices only)
 *  3. Header state    – `data-scrolled` attribute on <body> once the page has scrolled
 *
 * Everything is transform/opacity based, throttled to animation frames, and
 * disabled when the user prefers reduced motion. Works with the theme's
 * section re-rendering in the editor (`shopify:section:load`).
 */

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

/* ------------------------------------------------------------------ */
/* 1. Scroll reveal                                                    */
/* ------------------------------------------------------------------ */

const REVEAL_SELECTOR = '.shopify-section:not(.header-section):not(.shopify-section-group-header-group) > .section, .reveal';

let revealObserver;

function observeReveal(root = document) {
  if (reducedMotion.matches) return;

  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('in-view');
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
  }

  for (const el of root.querySelectorAll(REVEAL_SELECTOR)) {
    if (el.classList.contains('in-view') || el.hasAttribute('data-reveal')) continue;
    el.setAttribute('data-reveal', '');

    // Anything already on screen at load must not flash in – reveal immediately.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add('in-view');
    } else {
      revealObserver.observe(el);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2. Card tilt                                                        */
/* ------------------------------------------------------------------ */

const TILT_SELECTOR = '.product-card, .collection-card, .resource-card';
const MAX_TILT = 4; // degrees

function attachTilt(root = document) {
  if (reducedMotion.matches || !finePointer.matches) return;

  for (const card of root.querySelectorAll(TILT_SELECTOR)) {
    if (card.hasAttribute('data-tilt')) continue;
    card.setAttribute('data-tilt', '');

    let frame = 0;
    let rect = null;

    const onMove = (event) => {
      if (!rect) rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        card.style.setProperty('--tilt-x', `${(-y * MAX_TILT).toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${(x * MAX_TILT).toFixed(2)}deg`);
        card.style.setProperty('--glare-x', `${((x + 0.5) * 100).toFixed(1)}%`);
        card.style.setProperty('--glare-y', `${((y + 0.5) * 100).toFixed(1)}%`);
      });
    };

    const onLeave = () => {
      cancelAnimationFrame(frame);
      rect = null;
      card.style.removeProperty('--tilt-x');
      card.style.removeProperty('--tilt-y');
      card.style.removeProperty('--glare-x');
      card.style.removeProperty('--glare-y');
    };

    card.addEventListener('pointerenter', () => (rect = card.getBoundingClientRect()));
    card.addEventListener('pointermove', onMove, { passive: true });
    card.addEventListener('pointerleave', onLeave);
  }
}

/* ------------------------------------------------------------------ */
/* 3. Header scroll state                                              */
/* ------------------------------------------------------------------ */

function watchScroll() {
  let ticking = false;
  const update = () => {
    document.body.toggleAttribute('data-scrolled', window.scrollY > 24);
    ticking = false;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );
  update();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function init(root = document) {
  observeReveal(root);
  attachTilt(root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init());
} else {
  init();
}
watchScroll();

// Re-bind for content that arrives later (editor, infinite scroll, quick add, section rendering)
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1) init(node.parentElement || node);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

document.addEventListener('shopify:section:load', (event) => init(event.target));

// If the user toggles reduced motion at runtime, reveal everything immediately.
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    for (const el of document.querySelectorAll('[data-reveal]')) el.classList.add('in-view');
  }
});
