/* =========================================================================
   minis.js — 30 s 2D minigames for the Work and Learning missions (no Three.js)
   Everything here is a SIMULATED demonstration: no measured numbers are shown.
   ========================================================================= */
window.Minis = (() => {
  const DURATION = 30, TUTORIAL_MS = 4000;
  let cur = null; // { kind, raf, timers, cleanup }

  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const later = (fn, ms) => { const id = setTimeout(fn, ms); cur.timers.push(id); return id; };

  function shell(root, title, lines, endMsg) {
    root.innerHTML = `
      <button class="corner-btn" data-action="exit-mini" aria-label="Exit" title="Exit">✕</button>
      <div class="mini">
        <div class="mini-top"><h2 class="mini-title">${title}</h2><span class="mini-clock"></span><span class="sim-badge">SIMULATED</span></div>
        <div class="mini-time"><i></i></div>
        <div class="mini-stage"></div>
      </div>
      <div class="game-overlay show mini-tut"><div class="hex-card overlay-card">
        <h3 class="ov-title">${lines[0]}</h3><p class="ov-text">${lines[1]}</p><p class="ov-text">${lines[2]}</p>
        <div class="countdown-bar"><i></i></div></div></div>
      <div class="game-overlay mini-end"><div class="hex-card overlay-card">
        <h3 class="ov-title">MISSION COMPLETE</h3><p class="mini-msg">${endMsg}</p>
        <div class="btn-row"><button class="hex-btn hex-md" data-action="finish-placeholder">CONTINUE ▶</button></div>
        <p class="ov-small">Simulated demonstration.</p></div></div>`;
    return {
      stage: root.querySelector('.mini-stage'), clock: root.querySelector('.mini-clock'),
      timeBar: root.querySelector('.mini-time i'), tut: root.querySelector('.mini-tut'),
      tutBar: root.querySelector('.mini-tut .countdown-bar i'), end: root.querySelector('.mini-end')
    };
  }

  /** Runs tutorial (auto-start after 4 s), then a 30 s loop calling tick(t, dt). */
  function run(ui, tick, onEnd) {
    const t0 = performance.now();
    let last = t0, started = false, startT = 0;
    const loop = (now) => {
      cur.raf = requestAnimationFrame(loop);
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      if (!started) {
        ui.tutBar.style.width = Math.min(100, (now - t0) / TUTORIAL_MS * 100) + '%';
        if (now - t0 >= TUTORIAL_MS) { started = true; startT = now; ui.tut.classList.remove('show'); }
        return;
      }
      const t = (now - startT) / 1000;
      ui.timeBar.style.width = Math.min(100, t / DURATION * 100) + '%';
      tick(Math.min(t, DURATION), dt);
      if (t >= DURATION) { cancelAnimationFrame(cur.raf); onEnd?.(); ui.end.classList.add('show'); }
    };
    cur.raf = requestAnimationFrame(loop);
  }

  /* ===================================================== WORK: Battery Boss */
  function work(root) {
    const ui = shell(root, 'BATTERY BOSS',
      ['Your 9-to-5 video call starts now.', 'Tap distractions to fix them with AI.', 'Watch both batteries: AI on CPU vs AI on NPU.'],
      'The NPU runs always-on AI at low power, so your battery lasts longer.');
    ui.stage.innerHTML = `
      <div class="bb">
        <div class="bb-call">
          <div class="bb-video">
            <div class="bb-room"><span class="clutter c1"></span><span class="clutter c2"></span><span class="clutter c3"></span></div>
            <div class="bb-person"><span class="head"></span><span class="body"></span></div>
            <div class="bb-fx"></div>
            <div class="bb-caption" hidden></div>
            <div class="bb-lowbat" hidden>Low battery</div>
          </div>
          <div class="bb-bar"><span class="dot"></span> Team call</div>
        </div>
        <aside class="bb-side">
          <div class="bb-toggle" role="group" aria-label="Your laptop runs AI on">
            <span>Your laptop runs AI on</span>
            <div><button data-on="cpu" aria-pressed="false">CPU</button><button data-on="npu" aria-pressed="true">NPU</button></div>
          </div>
          <div class="bat" data-k="cpu"><span>AI on CPU</span><div class="bat-cell"><i></i></div></div>
          <div class="bat" data-k="npu"><span>AI on NPU</span><div class="bat-cell"><i></i></div></div>
        </aside>
      </div>`;
    const video = ui.stage.querySelector('.bb-video'), room = ui.stage.querySelector('.bb-room');
    const fx = ui.stage.querySelector('.bb-fx'), cap = ui.stage.querySelector('.bb-caption'), low = ui.stage.querySelector('.bb-lowbat');
    const bats = { cpu: 1, npu: 1 }, cells = {}, rows = {};
    ui.stage.querySelectorAll('.bat').forEach(b => { cells[b.dataset.k] = b.querySelector('i'); rows[b.dataset.k] = b; });
    let mine = 'npu';
    const toggle = ui.stage.querySelector('.bb-toggle');
    const setMine = k => { mine = k; toggle.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.on === k))); Object.entries(rows).forEach(([kk, r]) => r.classList.toggle('mine', kk === k)); };
    toggle.addEventListener('click', e => { const b = e.target.closest('button[data-on]'); if (b) setMine(b.dataset.on); });
    setMine('npu');

    const EFFECTS = {
      dog:    { label: 'WOOF! WOOF!', icon: '🐶', fx: 'AI noise removal' },
      messy:  { label: 'Messy room',  icon: '🧺', fx: 'AI background blur' },
      talker: { label: 'Talking too fast', icon: '💬', fx: 'AI live captions' }
    };
    const on = new Set();
    const CAPS = ['…so the launch moves to Thursday.', 'Please share the deck by noon.', 'Next item: the budget review.', 'Thanks everyone, great progress!'];
    let capI = 0;
    const apply = (k) => {
      if (on.has(k)) return;
      on.add(k);
      fx.append(h(`<span class="fx-chip">✓ ${EFFECTS[k].fx}</span>`));
      if (k === 'messy') room.classList.add('blurred');
      if (k === 'talker') { cap.hidden = false; cap.textContent = CAPS[0]; }
    };
    const spawn = (k, x, y) => {
      const d = h(`<button class="bb-distraction" style="left:${x}%;top:${y}%"><span>${EFFECTS[k].icon}</span>${EFFECTS[k].label}</button>`);
      if (k === 'messy') room.classList.add('messy');
      if (on.has(k)) { // always-on AI already handles it
        d.classList.add('handled'); d.innerHTML = `<span>✓</span>Handled by AI`;
        video.append(d); later(() => d.remove(), 1600); return;
      }
      d.addEventListener('click', () => { apply(k); d.classList.add('fixed'); later(() => d.remove(), 350); });
      video.append(d);
      later(() => { if (d.isConnected) { d.classList.add('gone'); later(() => d.remove(), 350); } }, 5500);
    };
    [[1.5, 'dog', 62, 18], [6.5, 'messy', 8, 22], [11.5, 'talker', 58, 56], [17.5, 'dog', 12, 58], [22.5, 'talker', 60, 20], [26, 'messy', 30, 14]]
      .forEach(([t, k, x, y]) => later(() => spawn(k, x, y), TUTORIAL_MS + t * 1000));

    run(ui, (t, dt) => {
      const mins = Math.round((9 * 60 + t / DURATION * 8 * 60) / 15) * 15;
      ui.clock.textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      // illustrative drain only: same always-on AI workload, CPU path drains much faster than NPU path
      const load = .1 + .3 * on.size;
      bats.cpu = Math.max(.04, bats.cpu - load * .028 * dt * 1.0 - .004 * dt);
      bats.npu = Math.max(.04, bats.npu - load * .005 * dt - .004 * dt);
      for (const k of ['cpu', 'npu']) { cells[k].style.width = (bats[k] * 100) + '%'; cells[k].classList.toggle('low', bats[k] < .25); }
      low.hidden = bats[mine] >= .25;
      video.classList.toggle('dim', bats[mine] < .25);
      if (on.has('talker') && Math.floor(t / 3) !== capI) { capI = Math.floor(t / 3); cap.textContent = CAPS[capI % CAPS.length]; }
    });
  }

  /* ========================================== LEARNING: Offline Study Sprint */
  function learning(root) {
    const ui = shell(root, 'OFFLINE STUDY SPRINT',
      ["You're studying on a train.", 'Drag your notes onto the Intel AI PC.', 'Watch what happens in the tunnel.'],
      'On-device AI works without internet and keeps your data on your PC.');
    ui.stage.innerHTML = `
      <div class="os">
        <div class="os-window"><div class="os-land"></div><div class="os-tunnel"></div>
          <span class="os-wifi"><b class="wifi-ico"></b><em>Wi-Fi</em></span></div>
        <div class="os-panels">
          <section class="os-panel os-cloud">
            <h4>Cloud AI app</h4>
            <div class="os-drop cloud-drop">Summarise with cloud AI</div>
            <p class="os-status">Connected</p>
            <div class="os-cap">Lecture captions…</div>
          </section>
          <section class="os-panel os-local">
            <h4>Intel AI PC · on-device</h4>
            <div class="os-drop local-drop">Drop notes here</div>
            <ul class="os-sum"></ul>
            <div class="os-cap live"></div>
            <div class="os-shield" hidden>🛡 Your notes stayed on this laptop.</div>
          </section>
        </div>
        <div class="os-notes"></div>
      </div>`;
    const NOTES = [
      ['Biology notes', 'Plants turn light, water and CO₂ into sugar and oxygen.'],
      ['History notes', 'Causes, key events and outcomes, in one timeline.'],
      ['Maths notes', 'Area and volume formulas, one worked example each.']
    ];
    const CAPS = ['Today: how plants make food.', 'Chlorophyll absorbs sunlight…', 'Remember the three key steps.', 'Quiz on this next week!'];
    const wrap = ui.stage.querySelector('.os'), notes = ui.stage.querySelector('.os-notes');
    const localDrop = ui.stage.querySelector('.local-drop'), cloudDrop = ui.stage.querySelector('.cloud-drop');
    const sum = ui.stage.querySelector('.os-sum'), shield = ui.stage.querySelector('.os-shield');
    const status = ui.stage.querySelector('.os-status'), cloudCap = ui.stage.querySelector('.os-cloud .os-cap');
    const liveCap = ui.stage.querySelector('.os-cap.live');
    let offline = false;

    NOTES.forEach(([title, s]) => {
      const card = h(`<div class="note-card" tabindex="0">${title}</div>`);
      notes.append(card);
      let sx = 0, sy = 0, dragging = false;
      card.addEventListener('pointerdown', e => { dragging = true; sx = e.clientX; sy = e.clientY; card.setPointerCapture(e.pointerId); card.classList.add('drag'); });
      card.addEventListener('pointermove', e => { if (dragging) card.style.transform = `translate(${e.clientX - sx}px, ${e.clientY - sy}px)`; });
      const drop = e => {
        if (!dragging) return; dragging = false; card.classList.remove('drag');
        const hit = el => { const r = el.getBoundingClientRect(); return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom; };
        if (hit(localDrop)) {
          card.remove();
          const li = h(`<li class="pending">Summarising on-device…</li>`); sum.append(li);
          later(() => { li.classList.remove('pending'); li.innerHTML = `<b>${title}:</b> ${s}`; shield.hidden = false; }, 700);
        } else {
          if (hit(cloudDrop)) { cloudDrop.classList.remove('nope'); void cloudDrop.offsetWidth; cloudDrop.classList.add('nope'); cloudDrop.textContent = offline ? 'No connection' : 'Uploading…'; }
          card.style.transform = '';
        }
      };
      card.addEventListener('pointerup', drop);
      card.addEventListener('pointercancel', () => { dragging = false; card.classList.remove('drag'); card.style.transform = ''; });
    });

    let capI = -1;
    run(ui, (t) => {
      ui.clock.textContent = '';
      if (!offline && t >= 4) {
        offline = true; wrap.classList.add('in-tunnel');
        status.textContent = '⚠ No connection'; status.classList.add('bad');
        cloudDrop.textContent = 'No connection'; cloudCap.textContent = 'Captions unavailable offline'; cloudCap.classList.add('off');
      }
      const i = Math.floor(t / 2.5);
      if (i !== capI) { capI = i; liveCap.textContent = CAPS[i % CAPS.length]; }
    });
  }

  function stop() {
    if (!cur) return;
    cancelAnimationFrame(cur.raf);
    cur.timers.forEach(clearTimeout);
    cur = null;
  }
  function start(kind, root) {
    stop();
    cur = { kind, raf: 0, timers: [] };
    (kind === 'work' ? work : learning)(root);
  }
  return { start, stop };
})();
