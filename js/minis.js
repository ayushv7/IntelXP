/* =========================================================================
   minis.js — shared kit for the Work and Learning (Study) minigames.
   Each game lives in its own file (mini-study.js, mini-work.js) and registers
   itself with Minis.register(kind, fn). The kit provides the common shell:
   "x/3 AI PC features unlocked" HUD, intro page, RPG dialog box, unlock toast
   and the congratulations page. Everything is a SIMULATED demonstration.
   ========================================================================= */
window.Minis = (() => {
  const DATA = window.PROCESSOR_DATA;
  const registry = {};
  let cur = null; // { kind, dead, raf, timers[], cleanup[] }

  /* ---------------- helpers */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const heroOf = tier => { const ms = DATA?.processors?.[tier]?.laptop?.models || []; return ms.find(m => m.hero) || ms[0] || null; };
  const fullName = m => m ? `${m.brand} ${m.name}` : 'Intel AI laptop';
  const chipLine = cpu => 'Intel® ' + String(cpu || 'Core Ultra').replace(/\s*\(.*\)\s*$/, '').replace(/^Core Ultra/, 'Core™ Ultra');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  /** Per-run context handed to each game: timers, loop and DOM helpers that all die on stop(). */
  function makeCtx(root) {
    const ctx = {
      root, esc, heroOf, fullName, chipLine, clamp, rand,
      get dead() { return !cur || cur.ctx !== ctx; },
      later(fn, ms) { const id = setTimeout(() => { if (!ctx.dead) fn(); }, ms); cur.timers.push(id); return id; },
      wait(ms) { return new Promise(res => ctx.later(res, ms)); },
      /** rAF loop: fn(dt, t). Runs until stop(). */
      loop(fn) {
        let last = performance.now();
        const step = now => {
          if (ctx.dead) return;
          cur.raf = requestAnimationFrame(step);
          const dt = Math.min(.05, (now - last) / 1000); last = now;
          fn(dt, now / 1000);
        };
        cur.raf = requestAnimationFrame(step);
      },
      onCleanup(fn) { cur.cleanup.push(fn); }
    };
    return ctx;
  }

  /**
   * Common shell. cfg = { title, cls } -> ui:
   *   ui.scene        the game area (position: relative)
   *   ui.intro(t)     intro page; resolves when START is pressed
   *   ui.ask(o)       RPG dialog; resolves with the chosen index
   *   ui.unlock(f)    count +1, corner toast
   *   ui.finish(o)    congratulations page
   */
  function shell(ctx, cfg) {
    const { root } = ctx;
    root.innerHTML = `
      <button class="corner-btn" data-action="exit-mini" aria-label="Exit" title="Exit">✕</button>
      <div class="mg ${cfg.cls || ''}">
        <div class="mg-top">
          <h2 class="mg-title">${esc(cfg.title)}</h2>
          <div class="mg-count" aria-live="polite"><span class="mg-pips"><i></i><i></i><i></i></span><b class="mg-n">0/3</b> <span>AI PC features unlocked</span></div>
        </div>
        <div class="mg-scene"></div>
      </div>
      <div class="mg-toast" role="status"><span class="mg-toast-ico" aria-hidden="true">✦</span><div><small>AI PC FEATURE UNLOCKED</small><b></b><em></em></div></div>
      <div class="mg-dialog" role="dialog" aria-modal="true"><div class="mg-box">
        <h3 class="mg-d-title"></h3><p class="mg-d-text"></p><p class="mg-d-say" aria-live="assertive"></p><div class="mg-d-btns"></div>
      </div></div>
      <div class="game-overlay mg-page"><div class="hex-card overlay-card mg-card"></div></div>`;
    const q = s => root.querySelector(s);
    let n = 0;
    const ui = {
      scene: q('.mg-scene'),
      get count() { return n; },
      intro({ title, lines, start }) {
        q('.mg-card').innerHTML = `<h3 class="ov-title">${esc(title)}</h3>${lines.map(l => `<p class="ov-text">${l && l.html ? l.html : esc(l)}</p>`).join('')}
          <div class="btn-row"><button class="hex-btn hex-md mg-go">${esc(start)}</button></div>`;
        q('.mg-page').classList.add('show');
        q('.mg-go').focus({ preventScroll: true });
        return new Promise(res => q('.mg-go').addEventListener('click', () => { q('.mg-page').classList.remove('show'); window.SFX?.go(); res(); }, { once: true }));
      },
      /** choices: [{ label, kind: 'primary'|'ghost'|'toggle', wrong: 'message shown, then choose again' }] */
      ask({ title, text, choices, tone = '' }) {
        const dlg = q('.mg-dialog'), btns = q('.mg-d-btns'), say = q('.mg-d-say');
        dlg.className = 'mg-dialog show ' + tone;
        q('.mg-d-title').textContent = title; q('.mg-d-text').textContent = text || ''; say.textContent = '';
        btns.innerHTML = choices.map((c, i) => c.kind === 'toggle'
          ? `<button class="mg-toggle" data-i="${i}" role="switch" aria-checked="false"><span class="mg-sw"><i></i></span>${esc(c.label)}</button>`
          : `<button class="hex-btn hex-md ${c.kind === 'ghost' ? 'ghost' : ''}" data-i="${i}">${esc(c.label)}</button>`).join('');
        window.SFX?.beep();
        btns.querySelector('button')?.focus({ preventScroll: true });
        return new Promise(res => {
          btns.onclick = e => {
            const b = e.target.closest('button'); if (!b || b.disabled) return;
            const i = +b.dataset.i, c = choices[i];
            if (c.wrong) { say.textContent = c.wrong; window.SFX?.error(); const box = q('.mg-box'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); return; }
            btns.querySelectorAll('button').forEach(x => { x.disabled = true; });
            const close = () => { dlg.classList.remove('show'); res(i); };
            if (c.kind === 'toggle') { b.setAttribute('aria-checked', 'true'); window.SFX?.tick(); ctx.later(close, 450); } else close();
          };
        });
      },
      unlock({ name, sub }) {
        n = Math.min(3, n + 1);
        q('.mg-n').textContent = `${n}/3`;
        root.querySelectorAll('.mg-pips i').forEach((p, i) => p.classList.toggle('on', i < n));
        const c = q('.mg-count'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
        const t = q('.mg-toast');
        t.querySelector('b').textContent = name; t.querySelector('em').textContent = sub || '';
        t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
        clearTimeout(ui._tt); ui._tt = ctx.later(() => t.classList.remove('show'), 2400);
        window.SFX?.upgrade(n - 1);
      },
      finish({ title, lines = [], features = [], extraHTML = '' }) {
        q('.mg-card').innerHTML = `<h3 class="ov-title">${esc(title)}</h3>${lines.map(l => `<p class="ov-text">${esc(l)}</p>`).join('')}
          <ul class="mg-feats">${features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>${extraHTML}
          <div class="btn-row"><button class="hex-btn hex-md" data-action="finish-mini">BACK TO MISSIONS ▶</button></div>
          <p class="ov-small">Simulated demonstration.</p>`;
        q('.mg-page').classList.add('show', 'done');
        q('.mg-toast').classList.remove('show');
        window.SFX?.stopLoops(); window.SFX?.jingle();
      }
    };
    return ui;
  }

  /** Pointer drag of `el` (touch + mouse). onDrop(rect) returns true to accept; otherwise it springs back. A tap counts as a drop. */
  function draggable(ctx, el, onDrop) {
    let sx = 0, sy = 0, dx = 0, dy = 0, id = null, moved = false;
    const down = e => {
      if (el.classList.contains('gone')) return;
      id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0; moved = false;
      el.setPointerCapture?.(id); el.classList.add('dragging'); window.SFX?.paper();
    };
    const move = e => {
      if (e.pointerId !== id) return;
      dx = e.clientX - sx; dy = e.clientY - sy; if (Math.hypot(dx, dy) > 6) moved = true;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${clamp(dx * .04, -8, 8)}deg) scale(1.06)`;
    };
    const up = e => {
      if (e.pointerId !== id) return; id = null; el.classList.remove('dragging');
      if (onDrop(el.getBoundingClientRect(), !moved)) return;
      el.style.transform = '';
    };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  function stop() {
    if (!cur) return;
    cancelAnimationFrame(cur.raf); window.SFX?.stopLoops();
    cur.timers.forEach(clearTimeout);
    cur.cleanup.forEach(fn => { try { fn(); } catch {} });
    cur = null;
  }
  function start(kind, root) {
    stop();
    cur = { kind, raf: 0, timers: [], cleanup: [] };
    const ctx = cur.ctx = makeCtx(root);
    const game = registry[kind];
    if (game) game(ctx, { shell: cfg => shell(ctx, cfg), draggable: (el, fn) => draggable(ctx, el, fn) });
  }
  return { start, stop, register: (kind, fn) => { registry[kind] = fn; } };
})();
