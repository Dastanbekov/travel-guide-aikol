/**
 * ScrollExpandHero — Vanilla JS port of the React ScrollExpandMedia component.
 * Handles scroll-driven media expansion with split-title animation.
 */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  let scrollProgress = 0;
  let mediaFullyExpanded = false;
  let showContent = false;
  let touchStartY = 0;
  let isMobile = window.innerWidth < 768;
  let rafPending = false;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const wrapper        = document.getElementById('she-wrapper');
  const bg             = document.getElementById('she-bg');
  const mediaBox       = document.getElementById('she-media-box');
  const mediaOverlay   = document.getElementById('she-media-overlay');
  const titleLeft      = document.getElementById('she-title-left');
  const titleRight     = document.getElementById('she-title-right');
  const dateEl         = document.getElementById('she-date');
  const hintEl         = document.getElementById('she-hint');
  const revealSection  = document.getElementById('she-reveal');

  if (!wrapper) return; // guard: not on landing page

  // ── Render (called via rAF for performance) ────────────────────────────────
  function render() {
    rafPending = false;
    const p = scrollProgress;

    // Background fades out
    bg.style.opacity = 1 - p;

    // Media expands
    const baseW  = isMobile ? 300 : 340;
    const growW  = isMobile ? 680 : 1260;
    const baseH  = isMobile ? 380 : 420;
    const growH  = isMobile ? 210 : 420;
    const w = Math.min(baseW + p * growW, window.innerWidth * 0.97);
    const h = Math.min(baseH + p * growH, window.innerHeight * 0.9);
    mediaBox.style.width  = w + 'px';
    mediaBox.style.height = h + 'px';

    // Media overlay lightens as it expands
    const overlayOpacity = Math.max(0.5 - p * 0.3, 0.07);
    mediaOverlay.style.opacity = overlayOpacity;

    // Title words slide apart
    const tx = p * (isMobile ? 35 : 42); // vw units
    titleLeft.style.transform  = 'translateX(-' + tx + 'vw)';
    titleRight.style.transform = 'translateX(' + tx + 'vw)';
    titleLeft.style.opacity    = Math.max(1 - p * 1.6, 0);
    titleRight.style.opacity   = Math.max(1 - p * 1.6, 0);

    // Date / hint labels slide in opposite directions
    if (dateEl) dateEl.style.transform = 'translateX(-' + tx + 'vw)';
    if (hintEl) hintEl.style.transform = 'translateX(' + tx + 'vw)';

    // Reveal section fades in
    if (showContent) {
      const revealOpacity = Math.min((p - 0.85) / 0.15, 1);
      revealSection.style.opacity = revealOpacity;
      revealSection.style.pointerEvents = revealOpacity >= 0.5 ? 'auto' : 'none';
    } else {
      revealSection.style.opacity = 0;
      revealSection.style.pointerEvents = 'none';
    }

    // Collapse border-radius when fully expanded
    mediaBox.style.borderRadius = p >= 1 ? '0' : '18px';
  }

  function scheduleRender() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(render);
    }
  }

  // ── Progress update ────────────────────────────────────────────────────────
  function applyDelta(delta) {
    if (mediaFullyExpanded) return;

    const next = Math.min(Math.max(scrollProgress + delta, 0), 1);
    scrollProgress = next;

    if (next >= 1) {
      mediaFullyExpanded = true;
      showContent = true;
      // Allow natural scroll after full expansion
      document.body.style.overflow = '';
    } else if (next < 0.75) {
      showContent = false;
    }

    scheduleRender();
  }

  // ── Wheel ──────────────────────────────────────────────────────────────────
  function onWheel(e) {
    if (mediaFullyExpanded) {
      // Allow collapse only if user scrolls up at the very top
      if (e.deltaY < 0 && window.scrollY <= 5) {
        mediaFullyExpanded = false;
        showContent = false;
        document.body.style.overflow = 'hidden';
        e.preventDefault();
        scheduleRender();
      }
      return;
    }
    e.preventDefault();
    applyDelta(e.deltaY * 0.0009);
  }

  // ── Touch ──────────────────────────────────────────────────────────────────
  function onTouchStart(e) {
    touchStartY = e.touches[0].clientY;
  }

  function onTouchMove(e) {
    if (!touchStartY) return;
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY - touchY;

    if (mediaFullyExpanded) {
      if (deltaY < -20 && window.scrollY <= 5) {
        mediaFullyExpanded = false;
        showContent = false;
        document.body.style.overflow = 'hidden';
        e.preventDefault();
        scheduleRender();
      }
      return;
    }

    e.preventDefault();
    const factor = deltaY < 0 ? 0.008 : 0.005;
    applyDelta(deltaY * factor);
    touchStartY = touchY;
  }

  function onTouchEnd() {
    touchStartY = 0;
  }

  // ── Scroll lock ────────────────────────────────────────────────────────────
  function onScroll() {
    if (!mediaFullyExpanded) {
      window.scrollTo(0, 0);
    }
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  function onResize() {
    isMobile = window.innerWidth < 768;
    scheduleRender();
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    // Lock scroll initially
    document.body.style.overflow = 'hidden';

    // Initial render
    scheduleRender();

    window.addEventListener('wheel',      onWheel,      { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true  });
    window.addEventListener('touchmove',  onTouchMove,  { passive: false });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true  });
    window.addEventListener('scroll',     onScroll,     { passive: true  });
    window.addEventListener('resize',     onResize,     { passive: true  });
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
