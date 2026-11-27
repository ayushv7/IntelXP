/* =========================================================================
   debug-layout.js — dev only, loaded by app.js when the URL has ?debug=layout.
   window.__layoutCheck() outlines in red (and logs) every visible element that
     • overflows its own box (scrollWidth/Height > clientWidth/Height) unless it
       is meant to scroll (overflow auto/scroll) or deliberately clips a scene
       ([data-clip]),
     • sticks out of its parent (in-flow elements only; absolute/fixed
       decorations are checked against the viewport instead),
     • sticks out of the viewport horizontally (or vertically when nothing
       above it scrolls).
   ========================================================================= */
(() => {
  const TOL = 1.5;
  const css = document.createElement('style');
  css.textContent = '.__lo { outline: 2px solid red !important; outline-offset: -2px; }';
  document.head.appendChild(css);

  const visible = el => {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    }
    return true;
  };
  const scrolls = v => v === 'auto' || v === 'scroll';
  const label = el => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      parts.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].filter(c => c !== '__lo').slice(0, 2).join('.') : ''));
      if (e.id) break;
    }
    return parts.join(' > ');
  };
  /** Is some ancestor (below <body>) scrollable or clipping in this axis? Then sticking out of the viewport is fine. */
  const clippedOrScrolled = (el, axis) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e), v = axis === 'x' ? s.overflowX : s.overflowY;
      if (scrolls(v) || v === 'hidden' || v === 'clip' || e.hasAttribute('data-clip')) return true;
    }
    return false;
  };

  window.__layoutCheck = () => {
    document.querySelectorAll('.__lo').forEach(e => e.classList.remove('__lo'));
    const out = [], W = innerWidth, H = innerHeight;
    if (document.documentElement.scrollWidth > W + TOL) out.push({ el: document.documentElement, why: `page scrolls horizontally (${document.documentElement.scrollWidth} > ${W})` });
    for (const el of document.body.querySelectorAll('*')) {
      const tag = el.tagName.toLowerCase();
      if (['script', 'style', 'canvas', 'br', 'option', 'source'].includes(tag) || el.closest('[data-clip-inner]')) continue;
      if (!visible(el)) continue;
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      const why = [];
      // 1) own content overflows
      if (s.display !== 'inline' && !el.hasAttribute('data-clip') && tag !== 'svg') {
        if (!scrolls(s.overflowX) && el.scrollWidth > el.clientWidth + TOL && el.clientWidth > 0) why.push(`content wider than box (${el.scrollWidth} > ${el.clientWidth})`);
        if (!scrolls(s.overflowY) && el.scrollHeight > el.clientHeight + TOL && el.clientHeight > 0 && s.overflowY !== 'visible') why.push(`content taller than box (${el.scrollHeight} > ${el.clientHeight})`);
        if (!scrolls(s.overflowY) && s.overflowY === 'visible' && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0 && el.children.length === 0) why.push(`text taller than box (${el.scrollHeight} > ${el.clientHeight})`);
      }
      // 2) sticks out of parent (in-flow only)
      const p = el.parentElement;
      if (p && p !== document.body && !['absolute', 'fixed'].includes(s.position) && s.display !== 'inline' && !el.hasAttribute('data-bleed')) {
        const pr = p.getBoundingClientRect(), ps = getComputedStyle(p);
        if (ps.display !== 'inline' && !scrolls(ps.overflowX) && !scrolls(ps.overflowY) && !p.hasAttribute('data-clip') && pr.width > 0) {
          const dx = Math.max(pr.left - r.left, r.right - pr.right), dy = Math.max(pr.top - r.top, r.bottom - pr.bottom);
          if (dx > TOL) why.push(`sticks out of parent by ${dx.toFixed(0)}px (x)`);
          if (dy > TOL) why.push(`sticks out of parent by ${dy.toFixed(0)}px (y)`);
        }
      }
      // 3) sticks out of the viewport
      if (!el.hasAttribute('data-bleed') && s.pointerEvents !== 'none') {
        if ((r.left < -TOL || r.right > W + TOL) && !clippedOrScrolled(el, 'x')) why.push(`outside viewport (x ${r.left.toFixed(0)}..${r.right.toFixed(0)})`);
        if ((r.top < -TOL || r.bottom > H + TOL) && !clippedOrScrolled(el, 'y')) why.push(`outside viewport (y ${r.top.toFixed(0)}..${r.bottom.toFixed(0)})`);
      }
      if (why.length) { el.classList.add('__lo'); out.push({ el, why: why.join('; ') }); }
    }
    const list = out.map(o => ({ el: o.el === document.documentElement ? 'html' : label(o.el), why: o.why }));
    if (list.length) console.warn(`[layout] ${list.length} offender(s) at ${W}x${H}`, list); else console.info(`[layout] clean at ${W}x${H}`);
    return list;
  };
  addEventListener('load', () => setTimeout(window.__layoutCheck, 500));
})();
