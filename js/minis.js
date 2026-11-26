/* =========================================================================
   minis.js — 30 s 2D minigames for the Work and Learning missions (no Three.js)
   Everything here is a SIMULATED demonstration: no measured numbers are shown.
   Laptop names come from processors.js (hero models), never hard-coded.
   Animation: one rAF loop per game, CSS transforms + a canvas (60 fps friendly).
   ========================================================================= */
window.Minis = (() => {
  const DURATION = 30, TUTORIAL_MS = 4000;
  const DATA = window.PROCESSOR_DATA;
  let cur = null; // { raf, timers, cleanup[] }

  /* ---------------- data helpers */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const heroOf = tier => { const ms = DATA?.processors?.[tier]?.laptop?.models || []; return ms.find(m => m.hero) || ms[0] || null; };
  const heroes = () => (DATA?.tierOrder || []).map(heroOf).filter(Boolean);
  const accentOf = tier => DATA?.processors?.[tier]?.accent || '#00c7fd';
  const chipLine = cpu => 'Powered by Intel® ' + String(cpu || '').replace(/\s*\(.*\)\s*$/, '').replace(/^Core Ultra/, 'Core™ Ultra');
  const fullName = m => m ? `${m.brand} ${m.name}` : 'Intel AI laptop';

  const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const later = (fn, ms) => { const id = setTimeout(fn, ms); cur.timers.push(id); return id; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  /** Generic laptop (no logos): brand + model large on the bezel, chip line under the base. */
  function laptopHTML(m, tier, screen) {
    return `<div class="lap" style="--accent:${accentOf(tier)}">
      <div class="lap-lid"><div class="lap-brand"><b>${esc(m?.brand || 'Intel')}</b> ${esc(m?.name || 'AI laptop')}</div>
        <div class="lap-screen">${screen}</div></div>
      <div class="lap-base"></div>
      <p class="lap-powered">${esc(m ? chipLine(m.cpu) : 'Powered by Intel® Core™ Ultra')}</p>
    </div>`;
  }

  function shell(root, title, lines, endHTML) {
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
        <h3 class="ov-title">MISSION COMPLETE</h3>${endHTML}
        <div class="btn-row"><button class="hex-btn hex-md" data-action="finish-placeholder">CONTINUE ▶</button></div>
        <p class="ov-small">Simulated demonstration.</p></div></div>`;
    return {
      stage: root.querySelector('.mini-stage'), clock: root.querySelector('.mini-clock'),
      timeBar: root.querySelector('.mini-time i'), tut: root.querySelector('.mini-tut'),
      tutBar: root.querySelector('.mini-tut .countdown-bar i'), end: root.querySelector('.mini-end')
    };
  }

  /** Tutorial (auto-start after 4 s), then a 30 s loop calling tick(t, dt, now). Ambient animation runs during the tutorial too. */
  function run(ui, tick, ambient) {
    const t0 = performance.now();
    let last = t0, started = false, startT = 0, ended = false;
    const loop = now => {
      cur.raf = requestAnimationFrame(loop);
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      ambient?.(dt, now / 1000);
      if (!started) {
        ui.tutBar.style.width = Math.min(100, (now - t0) / TUTORIAL_MS * 100) + '%';
        if (now - t0 >= TUTORIAL_MS) { started = true; startT = now; ui.tut.classList.remove('show'); }
        return;
      }
      if (ended) return;
      const t = (now - startT) / 1000;
      ui.timeBar.style.transform = `scaleX(${Math.min(1, t / DURATION)})`;
      tick(Math.min(t, DURATION), dt, now / 1000);
      if (t >= DURATION) { ended = true; ui.end.classList.add('show'); window.SFX?.stopLoops(); window.SFX?.jingle(); }
    };
    cur.raf = requestAnimationFrame(loop);
  }

  /* ===================================================== WORK: Battery Boss */
  function work(root) {
    const m = heroOf('pro');
    const ui = shell(root, 'BATTERY BOSS',
      ['Your 9-to-5 video call starts now.', 'Tap distractions to fix them with AI.', 'Watch both batteries: AI on CPU vs AI on NPU.'],
      `<p class="mini-brand">${esc(fullName(m))}</p><p class="mini-msg">The NPU runs always-on AI at low power, so your battery lasts longer.</p>`);
    ui.stage.innerHTML = `
      <div class="bb2">
        <div class="bb2-lap">${laptopHTML(m, 'pro', `
          <div class="call">
            <div class="room">
              <div class="win"></div><div class="shelf"></div>
              <div class="plant"><div class="leaves"><i></i><i></i><i></i><i></i></div><div class="pot"></div></div>
              <div class="mug"><i class="steam s1"></i><i class="steam s2"></i><i class="steam s3"></i></div>
              <span class="clutter c1"></span><span class="clutter c2"></span><span class="clutter c3"></span>
            </div>
            <div class="person"><span class="head"></span><span class="body"></span><span class="mouth"></span></div>
            <div class="dog" hidden><span class="dog-body"></span><span class="dog-head"></span><span class="dog-tail"></span><em class="muted" hidden>🔇</em></div>
            <div class="fx"></div>
            <div class="caption" hidden></div>
            <div class="lowbat" hidden>Low battery</div>
            <div class="callbar"><span class="dot"></span><span class="call-clock">09:00</span> · Team call</div>
          </div>`)}</div>
        <aside class="bb2-side">
          <div class="bb-toggle" role="group" aria-label="Your laptop runs AI on">
            <span>Your laptop runs AI on</span>
            <div><button data-on="cpu" aria-pressed="false">CPU</button><button data-on="npu" aria-pressed="true">NPU</button></div>
          </div>
          <div class="bat" data-k="cpu"><span>AI on CPU</span><div class="bat-cell"><i></i></div></div>
          <div class="bat" data-k="npu"><span>AI on NPU</span><div class="bat-cell"><i></i></div></div>
        </aside>
      </div>`;
    const S = sel => ui.stage.querySelector(sel);
    const call = S('.call'), room = S('.room'), fx = S('.fx'), cap = S('.caption'), low = S('.lowbat');
    const plant = S('.leaves'), steams = [...ui.stage.querySelectorAll('.steam')], dog = S('.dog'), mouth = S('.mouth'), muted = S('.muted'), callClock = S('.call-clock');
    const bats = { cpu: 1, npu: 1 }, fills = {}, rows = {};
    ui.stage.querySelectorAll('.bat').forEach(b => { fills[b.dataset.k] = b.querySelector('i'); rows[b.dataset.k] = b; });
    let mine = 'npu';
    const toggle = S('.bb-toggle');
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
    let capI = 0, dogUntil = 0, talkFast = 0;
    const apply = k => {
      if (on.has(k)) return;
      on.add(k);
      fx.append(h(`<span class="fx-chip">✓ ${EFFECTS[k].fx}</span>`));
      if (k === 'messy') room.classList.add('blurred');
      if (k === 'talker') { cap.hidden = false; cap.textContent = CAPS[0]; }
      if (k === 'dog') muted.hidden = false;
    };
    const spawn = (k, x, y) => {
      if (k === 'messy') room.classList.add('messy');
      if (k === 'dog') { dog.hidden = false; dogUntil = performance.now() + 7000; }
      if (k === 'talker') talkFast = performance.now() + 6000;
      window.SFX?.pop();
      const d = h(`<button class="bb-distraction" style="left:${x}%;top:${y}%"><span>${EFFECTS[k].icon}</span>${EFFECTS[k].label}</button>`);
      if (on.has(k)) { // always-on AI already handles it
        d.classList.add('handled'); d.innerHTML = '<span>✓</span>Handled by AI';
        call.append(d); later(() => d.remove(), 1600); return;
      }
      d.addEventListener('click', () => { window.SFX?.sparkle(); apply(k); d.classList.add('fixed'); later(() => d.remove(), 350); });
      call.append(d);
      later(() => { if (d.isConnected) { d.classList.add('gone'); later(() => d.remove(), 350); } }, 5500);
    };
    [[1.5, 'dog', 56, 14], [6.5, 'messy', 6, 16], [11.5, 'talker', 54, 52], [17.5, 'dog', 8, 52], [22.5, 'talker', 56, 16], [26, 'messy', 28, 10]]
      .forEach(([t, k, x, y]) => later(() => spawn(k, x, y), TUTORIAL_MS + t * 1000));

    // ambient room life: plant sways, steam rises, dog jumps, mouth moves
    const ambient = (dt, T) => {
      plant.style.transform = `rotate(${Math.sin(T * 1.6) * 4 + Math.sin(T * 3.7) * 1.2}deg)`;
      steams.forEach((s, i) => { const k = ((T * .45 + i / 3) % 1); s.style.transform = `translate3d(${Math.sin(T * 2 + i) * 4}px, ${-k * 38}px, 0) scale(${.6 + k})`; s.style.opacity = String(Math.sin(k * Math.PI) * .7); });
      const now = performance.now();
      if (!dog.hidden) {
        dog.style.transform = `translate3d(0, ${-Math.abs(Math.sin(T * 7)) * 22}px, 0)`;
        dog.querySelector('.dog-tail').style.transform = `rotate(${Math.sin(T * 22) * 30}deg)`;
        if (now > dogUntil) dog.hidden = true;
      }
      mouth.style.transform = `scaleY(${.3 + Math.abs(Math.sin(T * (now < talkFast ? 26 : 9))) * .9})`;
    };

    run(ui, (t, dt) => {
      const mins = Math.round((9 * 60 + t / DURATION * 8 * 60) / 15) * 15;
      const hhmm = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      ui.clock.textContent = hhmm; callClock.textContent = hhmm;
      // illustrative drain only: same always-on AI workload, CPU path drains much faster than NPU path
      const load = .1 + .3 * on.size;
      bats.cpu = Math.max(.04, bats.cpu - (load * .028 + .004) * dt);
      bats.npu = Math.max(.04, bats.npu - (load * .005 + .004) * dt);
      for (const k of ['cpu', 'npu']) { fills[k].style.transform = `scaleX(${bats[k]})`; fills[k].classList.toggle('low', bats[k] < .25); }
      low.hidden = bats[mine] >= .25;
      call.classList.toggle('dim', bats[mine] < .25);
      if (on.has('talker') && Math.floor(t / 3) !== capI) { capI = Math.floor(t / 3); cap.textContent = CAPS[capI % CAPS.length]; }
    }, ambient);
  }

  /* ========================================== LEARNING: Offline Study Sprint */
  function learning(root) {
    const m = heroOf('everyday');
    const name = fullName(m);
    const ui = shell(root, 'OFFLINE STUDY SPRINT',
      ["You're studying on a train.", `Throw your notes onto the ${esc(name)}.`, 'Watch what happens in the tunnel.'],
      `<p class="mini-brand">${esc(name)}</p><p class="mini-msg">Your notes stayed on the ${esc(name)}.<br>On-device AI works without internet.</p>`);
    ui.stage.innerHTML = `
      <div class="os2">
        <div class="carriage">
          <div class="train-win"><canvas class="tw"></canvas><div class="tw-frame"></div>
            <div class="wifi" aria-label="Wi-Fi"><span class="bars"><i></i><i></i><i></i></span><em>Wi-Fi</em></div></div>
          <div class="desk">
            <div class="browser">
              <div class="br-bar"><span class="br-dots"><i></i><i></i><i></i></span><span class="br-url">cloud-ai.app</span></div>
              <div class="br-body"><h4>Cloud AI app</h4><div class="br-drop">Drop notes to summarise</div><p class="br-status">Connected</p><div class="br-cap">Lecture captions…</div></div>
            </div>
            <div class="os2-lap">${laptopHTML(m, 'everyday', `
              <div class="ls">
                <div class="ls-head">On-device AI · Study notes</div>
                <div class="ls-drop">Drop notes here</div>
                <ul class="ls-sum"></ul>
                <div class="ls-caps"><div class="ls-caps-track"></div></div>
                <div class="shield" hidden><span class="shield-ico">🛡</span><span>Your notes stayed on the ${esc(name)}.</span></div>
              </div>`)}</div>
            <div class="table"></div>
            <div class="notes-layer"></div>
          </div>
          <div class="tunnel-shade"></div><div class="tunnel-light"></div>
        </div>
      </div>`;
    const S = sel => ui.stage.querySelector(sel);
    const carriage = S('.carriage'), desk = S('.desk'), layer = S('.notes-layer'), canvas = S('.tw');
    const screen = S('.ls'), sum = S('.ls-sum'), capsTrack = S('.ls-caps-track'), shield = S('.shield'), lsDrop = S('.ls-drop');
    const browser = S('.browser'), brDrop = S('.br-drop'), brStatus = S('.br-status'), brCap = S('.br-cap');
    const wifi = S('.wifi'), wifiBars = [...wifi.querySelectorAll('.bars i')], shade = S('.tunnel-shade'), tLight = S('.tunnel-light');
    const g = canvas.getContext('2d');
    const BOARDS = heroes().map(fullName);

    /* ---- train window canvas: 3 parallax layers + billboards + tunnel */
    let cw = 0, ch = 0, dpr = 1;
    const sizeCanvas = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); cw = Math.max(1, Math.round(r.width * dpr)); ch = Math.max(1, Math.round(r.height * dpr)); canvas.width = cw; canvas.height = ch; };
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas); ro.observe(canvas); cur.cleanup.push(() => ro.disconnect());
    let dist = 0, tunnel = 0, tunnelTarget = 0, wobble = 0;
    function drawWindow(dt, T) {
      const W = cw, H = ch, sp = 1 - tunnel * .1;
      dist += dt * 340 * sp;
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#6fb8ff'); gr.addColorStop(1, '#d8f0ff');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // layer 1: far hills (slow)
      g.fillStyle = '#8fcf9a'; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += W / 30) g.lineTo(x, H * .62 - Math.sin((x + dist * .06 * dpr) / (W * .22)) * H * .12 - Math.sin((x + dist * .06 * dpr) / (W * .09)) * H * .04);
      g.lineTo(W, H); g.fill();
      g.fillStyle = '#5fb83a'; g.fillRect(0, H * .78, W, H * .22);
      // billboards (mid speed) with the hero laptops
      const bSpace = W * 1.1, bOff = (dist * .45 * dpr) % bSpace;
      for (let k = -1; k < 2; k++) {
        const x = W - bOff + k * bSpace, idx = Math.floor((dist * .45 * dpr + (1 - k) * bSpace) / bSpace) % Math.max(1, BOARDS.length);
        if (x < -W * .5 || x > W * 1.2 || !BOARDS.length) continue;
        const bw = W * .42, bh = H * .42, by = H * .22;
        g.fillStyle = '#e9edf3'; g.fillRect(x + bw * .18, by + bh, W * .012, H * .3); g.fillRect(x + bw * .78, by + bh, W * .012, H * .3);
        const bg = g.createLinearGradient(0, by, 0, by + bh); bg.addColorStop(0, '#1f7bff'); bg.addColorStop(1, '#0a3fc2');
        g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(x, by, bw, bh, 10 * dpr) : g.rect(x, by, bw, bh); g.fill();
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const text = BOARDS[(idx + BOARDS.length) % BOARDS.length];
        let fs = bh * .34; g.font = `900 ${fs}px Arial`; const tw = g.measureText(text).width; if (tw > bw * .9) { fs *= bw * .9 / tw; g.font = `900 ${fs}px Arial`; }
        g.fillStyle = '#ffd25e'; g.fillText(text, x + bw / 2, by + bh * .4);
        g.fillStyle = '#dff1ff'; g.font = `700 ${bh * .15}px Arial`; g.fillText('Intel® Core™ Ultra AI laptop', x + bw / 2, by + bh * .74);
      }
      // layer 2: poles + wires (fast)
      const pSpace = W * .32, pOff = (dist * 1.0 * dpr) % pSpace;
      g.strokeStyle = 'rgba(40,50,70,.55)'; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.moveTo(0, H * .16); g.quadraticCurveTo(W / 2, H * .22, W, H * .16); g.stroke();
      g.fillStyle = '#4a4f5c';
      for (let x = W - pOff; x > -20; x -= pSpace) g.fillRect(x, H * .1, 5 * dpr, H * .75);
      // layer 3: near trees / bushes (fastest, blurred feel)
      const tSpace = W * .23, tOff = (dist * 1.9 * dpr) % tSpace;
      for (let x = W - tOff, i = 0; x > -tSpace; x -= tSpace, i++) {
        const k = (Math.floor((dist * 1.9 * dpr) / tSpace) + i) % 3;
        g.fillStyle = k === 0 ? '#2c8a5a' : k === 1 ? '#3fae49' : '#33996a';
        g.beginPath(); g.ellipse(x, H * .92, tSpace * .38, H * (k === 1 ? .32 : .22), 0, 0, Math.PI * 2); g.fill();
      }
      // tunnel: dark walls with passing lights
      if (tunnel > .001) {
        g.fillStyle = `rgba(8,10,18,${tunnel})`; g.fillRect(0, 0, W, H);
        const lSpace = W * .55, lOff = (dist * 2.4 * dpr) % lSpace;
        for (let x = W - lOff; x > -lSpace; x -= lSpace) {
          const lg = g.createRadialGradient(x, H * .18, 0, x, H * .18, W * .12);
          lg.addColorStop(0, `rgba(255,214,140,${.95 * tunnel})`); lg.addColorStop(1, 'rgba(255,214,140,0)');
          g.fillStyle = lg; g.fillRect(x - W * .12, 0, W * .24, H * .5);
        }
      }
    }

    /* ---- physical notes: drag with inertia, throw, gravity, bounce, flutter */
    const NOTES = [
      ['Biology notes', ['Plants turn light, water and CO₂ into sugar.', 'Chlorophyll captures the sunlight.']],
      ['History notes', ['Causes, key events and outcomes, in order.', 'One timeline to revise from.']],
      ['Maths notes', ['Area and volume formulas.', 'One worked example for each.']]
    ];
    const notes = [];
    const deskRect = () => desk.getBoundingClientRect();
    const rel = (el) => { const d = deskRect(), r = el.getBoundingClientRect(); return { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height }; };
    NOTES.forEach(([title, lines], i) => {
      const el = h(`<div class="note" tabindex="0"><b>${title}</b><i></i><i></i><i></i></div>`);
      layer.append(el);
      const n = { el, title, lines, x: 0, y: 0, vx: 0, vy: 0, ang: rand(-6, 6), va: 0, held: false, tx: 0, ty: 0, ox: 0, oy: 0, done: false, ph: rand(0, 6), w: 0, h: 0, init: false, i };
      notes.push(n);
      el.addEventListener('pointerdown', e => {
        if (n.done) return; e.preventDefault();
        window.SFX?.paper(); const d = deskRect(); n.held = true; n.ox = e.clientX - d.left - n.x; n.oy = e.clientY - d.top - n.y; n.tx = n.x; n.ty = n.y;
        el.setPointerCapture(e.pointerId); el.classList.add('held');
      });
      el.addEventListener('pointermove', e => { if (!n.held) return; const d = deskRect(); n.tx = e.clientX - d.left - n.ox; n.ty = e.clientY - d.top - n.oy; });
      const release = () => { if (!n.held) return; n.held = false; el.classList.remove('held'); };
      el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
    });
    function placeNotes() {
      const d = deskRect();
      notes.forEach((n, i) => { if (n.init) return; n.w = n.el.offsetWidth; n.h = n.el.offsetHeight; n.x = 10 + i * (n.w * .78); n.y = d.height - n.h - 4; n.init = true; });
    }
    let offline = false, typing = [], typingEl = null;
    function summarise(n) {
      n.done = true; window.SFX?.chime();
      const lr = rel(screen), cx = lr.x + lr.w / 2 - n.w / 2, cy = lr.y + lr.h * .35 - n.h / 2;
      n.el.classList.add('snap');
      n.el.style.transform = `translate3d(${cx}px, ${cy}px, 0) rotate(0deg) scale(.2)`;
      screen.classList.remove('glow'); void screen.offsetWidth; screen.classList.add('glow');
      later(() => n.el.remove(), 450);
      typing.push({ bold: true, text: n.title + ': ' }, ...n.lines.map(l => ({ text: l + ' ' })), { br: true });
      later(() => { if (!shield.classList.contains('on')) window.SFX?.shield(); shield.hidden = false; shield.classList.add('on'); }, 600);
    }
    function bounceOffCloud(n) {
      window.SFX?.error();
      brDrop.textContent = offline ? 'No connection' : 'Uploading… needs internet';
      browser.classList.remove('nope'); void browser.offsetWidth; browser.classList.add('nope');
      n.vx = -Math.abs(n.vx) - 380; n.vy = -520; n.va = rand(-300, 300);
    }
    function stepNotes(dt, T) {
      const d = deskRect(), floor = d.height - 4, lap = rel(screen), br = rel(browser);
      for (const n of notes) {
        if (n.done || !n.init) continue;
        if (n.held) { // critically damped spring to the finger: inertia while dragging
          const ax = (n.tx - n.x) * 260 - n.vx * 26, ay = (n.ty - n.y) * 260 - n.vy * 26;
          n.vx += ax * dt; n.vy += ay * dt; n.va += (n.vx * .03 - n.ang) * 10 * dt - n.va * 6 * dt;
        } else {
          const airborne = n.y + n.h < floor - 1;
          n.vy += 2400 * dt;                                   // gravity
          if (airborne) {                                       // paper flutter + air drag
            n.vx += Math.sin(T * 9 + n.ph) * 260 * dt; n.va += Math.sin(T * 7 + n.ph) * 900 * dt;
            n.vx *= Math.exp(-1.2 * dt); n.vy *= Math.exp(-.8 * dt);
          }
          n.va *= Math.exp(-3 * dt);
        }
        n.x += n.vx * dt; n.y += n.vy * dt; n.ang += n.va * dt;
        if (n.y + n.h > floor) { n.y = floor - n.h; if (n.vy > 160 && !n.held) { n.vy *= -.38; n.va += rand(-120, 120); } else if (!n.held) { n.vy = 0; n.vx *= Math.exp(-9 * dt); n.ang += (n.ang > 0 ? -1 : 1) * Math.min(Math.abs(n.ang), 40 * dt); } }
        if (n.x < 0) { n.x = 0; n.vx = Math.abs(n.vx) * .4; }
        if (n.x + n.w > d.width) { n.x = d.width - n.w; n.vx = -Math.abs(n.vx) * .4; }
        if (n.y < -d.height * .3) { n.y = -d.height * .3; n.vy = Math.abs(n.vy) * .3; }
        n.ang = clamp(n.ang, -40, 40);
        const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
        if (!n.held && cx > lap.x && cx < lap.x + lap.w && cy > lap.y && cy < lap.y + lap.h) { summarise(n); continue; }
        if (!n.held && cx > br.x && cx < br.x + br.w && cy > br.y && cy < br.y + br.h * .8 && n.vx > -100) bounceOffCloud(n);
        n.el.style.transform = `translate3d(${n.x}px, ${n.y}px, 0) rotate(${n.ang}deg)`;
      }
      lsDrop.classList.toggle('hot', notes.some(n => n.held));
    }
    function stepTyping() { // summary types out character by character
      if (!typing.length) return;
      const it = typing[0];
      if (it.br) { typing.shift(); typingEl = null; return; }
      if (!typingEl) { typingEl = h('<li></li>'); sum.append(typingEl); }
      if (!it.node) { it.node = it.bold ? h('<b></b>') : document.createTextNode(''); typingEl.append(it.node); it.pos = 0; }
      it.pos = Math.min(it.text.length, it.pos + 1); window.SFX?.type(); it.node.textContent = it.text.slice(0, it.pos);
      if (it.pos >= it.text.length) typing.shift();
    }
    const CAPS = ['Today: how plants make food.', 'Chlorophyll absorbs sunlight…', 'Water comes up from the roots.', 'Remember the three key steps.', 'Oxygen is released as a by-product.', 'Quiz on this next week!'];
    let capN = 0, capNext = 0;
    function stepCaptions(T) { // live captions scroll up
      if (T < capNext) return; capNext = T + 2.2;
      capsTrack.append(h(`<p>${CAPS[capN++ % CAPS.length]}</p>`));
      const lines = capsTrack.children; if (lines.length > 6) lines[0].remove();
      const lh = lines[0].offsetHeight || 18, extra = Math.max(0, lines.length - 2);
      capsTrack.style.transform = `translate3d(0, ${-extra * lh}px, 0)`;
    }

    // carriage sway + rail-joint bumps
    let bumpT = 0, bumpY = 0;
    const ambient = (dt, T) => {
      placeNotes();
      tunnel += (tunnelTarget - tunnel) * (1 - Math.exp(-dt * 3));
      drawWindow(dt, T);
      bumpT -= dt; if (bumpT <= 0) { bumpT = rand(1.1, 1.8); bumpY = 3.5; }
      bumpY *= Math.exp(-dt * 9); wobble = Math.sin(T * 6.3) * 1.2 + bumpY * Math.sin(T * 40);
      carriage.style.transform = `translate3d(0, ${wobble}px, 0) rotate(${Math.sin(T * 1.1) * .25}deg)`;
      shade.style.opacity = String(tunnel * .5);
      tLight.style.opacity = String(tunnel);
      tLight.style.transform = `translate3d(${(1 - ((T * 1.6) % 1)) * 140 - 40}%, 0, 0)`;
      stepNotes(dt, T); stepTyping(); stepCaptions(T);
      window.SFX?.rumble(ui.end.classList.contains('show') ? 0 : 1, tunnel);
    };

    run(ui, t => {
      // Wi-Fi drops bar by bar as the tunnel approaches; tunnel 7–21 s; no signal afterwards (rural line)
      wifiBars.forEach((b, i) => { const off = t > 5 + (2 - i) * .7; if (off && !b.classList.contains('off')) window.SFX?.beep(); b.classList.toggle('off', off); });
      if (!offline && t > 6.6) {
        offline = true; wifi.classList.add('lost'); wifi.querySelector('em').textContent = 'No signal';
        brStatus.textContent = '⚠ No connection'; brStatus.classList.add('bad');
        brDrop.textContent = 'No connection'; brCap.textContent = 'Captions unavailable offline'; brCap.classList.add('off');
      }
      const tt = t > 7 && t < 21 ? 1 : 0; if (tt !== tunnelTarget) window.SFX?.whoosh(); tunnelTarget = tt;
    }, ambient);
  }

  function stop() {
    if (!cur) return;
    cancelAnimationFrame(cur.raf); window.SFX?.stopLoops();
    cur.timers.forEach(clearTimeout);
    cur.cleanup.forEach(fn => fn());
    cur = null;
  }
  function start(kind, root) {
    stop();
    cur = { kind, raf: 0, timers: [], cleanup: [] };
    (kind === 'work' ? work : learning)(root);
  }
  return { start, stop };
})();
