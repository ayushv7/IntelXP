/* =========================================================================
   race2d.js — 2D canvas fallback of the race (pseudo-3D pixel road).
   Same story, coins, toasts, HUD, results and API as game.js; no WebGL.
   Performance effects are SIMULATED and time-based; the FPS shown is REAL.
   ========================================================================= */
window.createRace2D = function createRace2D({ root, canvas, onActivity = () => {} }) {
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');

  /* ---------------- tuning (mirrors game.js) */
  const TRACK_LEN = 4000, COIN_S = [430, 1250, 2480], CONG_START = 1700, CONG_END = 2900;
  const LANES = [-6, -2, 2, 6], LIMIT = 7, TUTORIAL_MS = 4000;
  const V_MAX = 72, V_BOOST = 96, V_CRUISE = 30, V_MIN_BRAKE = 12, ACCEL = 15, BRAKE_DECEL = 34, BOOST_ACCEL = 26;
  const UPGRADES = [
    { name: 'INCREASED FRAME RATE', system: 'BASIC PC + FPS', desc: 'Intel Arc graphics render more frames, more smoothly.' },
    { name: 'AI UPSCALING', system: 'AI PC · XeSS', desc: 'XeSS uses AI on the GPU to sharpen every frame.' },
    { name: 'REDUCED LAG', system: 'INTEL AI PC', desc: 'Hybrid cores keep background tasks off your game.' }
  ];
  const SEG = 4, UPM = 250, ROAD_W = 8 * UPM, CAM_H = 1000, CAM_DEPTH = .84, DRAW = 170, CAM_BACK = 6;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  function center(s) { const k = clamp(s / 400, 0, 1), r = k * k * (3 - 2 * k); return r * (68 * Math.sin(s / 520) + 22 * Math.sin(s / 170 + 1.3)); }
  const slope = s => center(s + .5) - center(s - .5);

  /* ---------------- DOM (shared HUD with the 3D game) */
  const $ = id => root.querySelector('#' + id);
  const hud = {
    system: $('hud-system'), prog: $('hud-progress-bar'), fps: $('hud-fps'), fpsMode: $('hud-fpsmode'), speed: $('hud-speed'),
    tutorial: $('game-tutorial'), tutBar: $('tutorial-bar'), toast: $('upgrade-toast'), toastName: $('ut-name'), toastDesc: $('ut-desc'),
    zoneToast: $('zone-toast'), go: $('go-text'), results: $('game-results'), wipe: $('wipe'), flash: $('flash'), mini: $('minimap')
  };
  const slots = [...root.querySelectorAll('.upgrade-slots .slot')];
  const cps = [...root.querySelectorAll('.bar.progress .cp')];
  COIN_S.forEach((s, i) => $('hud')?.style.setProperty(`--cp${i + 1}`, (s / TRACK_LEN * 100) + '%'));
  const _last = new Map();
  const setText = (el, v) => { if (el && _last.get(el) !== v) { _last.set(el, v); el.textContent = v; } };
  const retrigger = (el, c) => { if (!el) return; el.classList.remove(c); void el.offsetWidth; el.classList.add(c); };

  /* ---------------- fixed scenery (seeded so every race looks the same) */
  let seed = 11; const srand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const scenery = [];
  for (let s = 30; s < TRACK_LEN + 800; s += 12 + srand() * 26) {
    if ([0, CONG_START, TRACK_LEN].some(x => Math.abs(x - s) < 25)) continue;
    scenery.push({ s, d: (srand() < .5 ? -1 : 1) * (12 + srand() * 14), kind: srand() < .55 ? 'tree' : 'pine', k: .8 + srand() * .7 });
  }
  const D = window.PROCESSOR_DATA, heroes = D ? D.tierOrder.map(t => { const ms = D.processors[t].laptop?.models || []; return ms.find(m => m.hero) || ms[0]; }).filter(Boolean) : [];
  (heroes.length ? heroes.map(h => `${h.brand} ${h.name}`) : ['AI PC']).concat(heroes.length ? [`${heroes[0].brand} ${heroes[0].name}`] : [])
    .forEach((t, i) => scenery.push({ s: 260 + i * 820, d: (i % 2 ? 1 : -1) * 15, kind: 'board', text: t, color: i % 2 ? '#ffffff' : '#ffd25e' }));
  const gates = [[0, 'START', '#1f6bff'], [CONG_START, 'TRAFFIC AHEAD', '#ff8a3d'], [TRACK_LEN, 'FINISH', '#ffc53d']];

  /* ---------------- state */
  const P = {};
  const keys = { left: false, right: false, gas: false, brake: false, boost: false };
  let stage = 1, phase = 'idle', running = false, raf = 0, lastT = 0, pending = 0, nextCap = 1 / 18, freezeUntil = 0;
  let tutorialStart = 0, finishAt = 0, nextTrafficS = 0, fpsFrames = 0, fpsT0 = 0, fpsShown = 0, shake = 0;
  let slowUntil = 0, wantAfterShot = false, shotBefore = false, toastTimer = 0, miniTimer = 0, zoneShown = false;
  let traffic = [], obstacles = [], coins = [], ups = [], parts = [];
  const portrait = matchMedia('(orientation: portrait)');
  const inStutter = () => stage < 4 && P.s > CONG_START && P.s < CONG_END;

  function reset() {
    Object.assign(P, { s: 0, d: LANES[1], v: 0, steer: 0, brake: 0, boost: 55, ups: 0, hits: 0, time: 0, hitCd: 0, boosting: false });
    stage = 1; nextTrafficS = 140; freezeUntil = 0; shake = 0; zoneShown = false; parts = [];
    traffic = []; obstacles = []; coins = [];
    for (let s = 700; s < CONG_END - 30;) {
      const inZone = s > CONG_START;
      obstacles.push({ s, d: LANES[(Math.random() * 4) | 0], barrier: inZone && Math.random() < .55, hit: false, fly: 0 });
      s += inZone ? rand(55, 85) : rand(170, 260);
    }
    for (let s = 120; s < TRACK_LEN - 60; s += rand(85, 140)) {
      const lane = pick(LANES), n = 4 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const cs = s + i * 7;
        if (COIN_S.some(u => Math.abs(u - cs) < 25) || obstacles.some(o => Math.abs(o.s - cs) < 6 && o.d === lane)) continue;
        coins.push({ s: cs, d: lane, taken: false });
      }
    }
    ups = COIN_S.map((s, i) => ({ s, d: LANES[(i + 1) % 4], taken: false }));
    slots.forEach(x => x.classList.remove('on', 'pop')); cps.forEach(c => c.classList.remove('got'));
    hud.system?.classList.remove('ai'); setText(hud.system, 'BASIC PC');
    sizeCanvas();
  }

  /* ---------------- resolution: low-res pixels before XeSS, sharper after */
  function sizeCanvas() {
    const vw = root.clientWidth || innerWidth, vh = root.clientHeight || innerHeight;
    const w = stage >= 3 ? 640 : 240;
    canvas.width = w; canvas.height = Math.max(90, Math.round(w * vh / vw));
  }

  /* ---------------- projection */
  let camZ = 0, camX = 0, sc0 = 0;
  const xr = s => center(s) - center(sc0) - slope(sc0) * (s - sc0); // lateral offset vs camera heading (m)
  function proj(s, d) {
    const dz = (s - camZ) * UPM; if (dz < 60) return null;
    const W = canvas.width, H = canvas.height, k = CAM_DEPTH / dz;
    return { x: W / 2 + k * ((xr(s) + d) * UPM - camX) * W / 2, y: H * .42 + k * CAM_H * H / 2, m: k * UPM * W / 2 };
  }

  /* ---------------- drawing helpers */
  const hi = () => stage >= 3;
  function outline(fn, col = '#141a2e', lw = 1) { if (hi()) { g.strokeStyle = col; g.lineWidth = lw; fn(); g.stroke(); } }
  function rrect(x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  function shadow(x, y, w) { if (!hi()) return; g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(x, y, w * .6, w * .14, 0, 0, Math.PI * 2); g.fill(); }

  function drawSky(W, H) {
    const hy = H * .42;
    if (hi()) {
      const gr = g.createLinearGradient(0, 0, 0, hy); gr.addColorStop(0, '#2f74ff'); gr.addColorStop(.6, '#7cc4ff'); gr.addColorStop(1, '#ffe2b8');
      g.fillStyle = gr;
    } else g.fillStyle = '#8fc8ff';
    g.fillRect(0, 0, W, hy + 1);
    const pan = (slope(sc0) * 6 + P.steer * .2) * W;
    // hills (parallax)
    for (const [col, amp, f, off] of hi() ? [['#9fd0ad', .12, 3, .3], ['#78b892', .08, 5, .8]] : [['#6f9a7a', .1, 4, .5]]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, hy);
      for (let x = 0; x <= W; x += W / 40) g.lineTo(x, hy - H * amp * (.5 + .5 * Math.sin((x - pan * off) / W * f * Math.PI)));
      g.lineTo(W, hy); g.fill();
    }
    if (hi()) { // clouds
      g.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 5; i++) { const cx = ((i * .27 * W - pan * .2) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * .15, cy = H * (.08 + (i % 3) * .07);
        for (let j = 0; j < 3; j++) { g.beginPath(); g.ellipse(cx + j * W * .03, cy - (j === 1 ? H * .015 : 0), W * .035, H * .03, 0, 0, Math.PI * 2); g.fill(); } }
    }
    if (inStutter()) { g.fillStyle = 'rgba(110,70,140,.25)'; g.fillRect(0, 0, W, hy); }
  }

  function quad(x1, y1, w1, x2, y2, w2, col) { g.fillStyle = col; g.beginPath(); g.moveTo(x1 - w1, y1); g.lineTo(x2 - w2, y2); g.lineTo(x2 + w2, y2); g.lineTo(x1 + w1, y1); g.fill(); }

  function drawRoad(W, H) {
    const base = Math.floor(camZ / SEG);
    let maxY = H;
    const neon = stage >= 4;
    for (let n = 1; n <= DRAW; n++) {
      const s1 = (base + n) * SEG, s2 = s1 + SEG;
      const p1 = proj(s1, 0), p2 = proj(s2, 0);
      if (!p1 || !p2 || p2.y >= maxY) continue;
      const band = Math.floor(s1 / (SEG * 3)) % 2;
      const y1 = Math.min(p1.y, maxY);
      g.fillStyle = hi() ? (band ? '#5fb83a' : '#56ab34') : (band ? '#4f8a45' : '#4a8240'); g.fillRect(0, p2.y, W, y1 - p2.y + 1);
      const r1 = p1.m * 8, r2 = p2.m * 8;
      quad(p1.x, p1.y, r1 * 1.16, p2.x, p2.y, r2 * 1.16, neon ? (band ? '#39b8ff' : '#1f6bff') : (band ? '#f4f1ea' : '#e8453c'));
      quad(p1.x, p1.y, r1, p2.x, p2.y, r2, hi() ? (band ? '#4b4f5c' : '#51555f') : (band ? '#3b3f4a' : '#41454f'));
      if (band) for (const l of [-4, 0, 4]) {
        const lx1 = p1.x + l / 8 * r1, lx2 = p2.x + l / 8 * r2;
        quad(lx1, p1.y, Math.max(.5, r1 * .02), lx2, p2.y, Math.max(.5, r2 * .02), '#fbf7ec');
      }
      maxY = p2.y;
    }
  }

  /* sprites (far -> near) */
  function drawTree(p, k, pine) {
    const m = p.m * k, x = p.x, y = p.y;
    shadow(x, y, m * 3);
    if (pine) {
      g.fillStyle = '#6b4a33'; g.fillRect(x - m * .25, y - m * 1.2, m * .5, m * 1.2);
      for (let i = 0; i < 3; i++) {
        const w = m * (2.4 - i * .6), top = y - m * (2.2 + i * 1.6), bot = y - m * (.8 + i * 1.6);
        g.fillStyle = hi() ? ['#2c8a5a', '#33996a', '#3aa877'][i] : '#3d6b4e';
        g.beginPath(); g.moveTo(x, top - m); g.lineTo(x + w, bot); g.lineTo(x - w, bot); g.closePath(); g.fill(); outline(() => {}, '#141a2e', Math.max(1, m * .08));
      }
    } else {
      g.fillStyle = '#6b4a33'; g.fillRect(x - m * .3, y - m * 4, m * .6, m * 4);
      g.fillStyle = hi() ? '#3fae49' : '#4f8a45';
      if (hi()) { g.beginPath(); g.ellipse(x, y - m * 6, m * 3, m * 3.4, 0, 0, Math.PI * 2); g.fill(); outline(() => {}, '#141a2e', Math.max(1, m * .12));
        g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(x - m, y - m * 7, m * 1.2, m, -.4, 0, Math.PI * 2); g.fill(); }
      else g.fillRect(x - m * 3, y - m * 9, m * 6, m * 6);
    }
  }
  function drawCar(x, y, m, body, tail, player) {
    const w = m * 2.1, h = m * 1.6;
    shadow(x, y, w * 1.1);
    if (!hi()) { g.fillStyle = body; g.fillRect(x - w / 2, y - h * .7, w, h * .7); g.fillStyle = '#9fb6d8'; g.fillRect(x - w * .38, y - h, w * .76, h * .32);
      g.fillStyle = tail; g.fillRect(x - w * .42, y - h * .5, w * .2, h * .12); g.fillRect(x + w * .22, y - h * .5, w * .2, h * .12); return; }
    g.fillStyle = '#1c1f27'; rrect(x - w * .55, y - h * .38, w * .22, h * .38, m * .1); g.fill(); rrect(x + w * .33, y - h * .38, w * .22, h * .38, m * .1); g.fill();
    g.fillStyle = body; rrect(x - w / 2, y - h * .8, w, h * .62, m * .35); g.fill(); outline(() => rrect(x - w / 2, y - h * .8, w, h * .62, m * .35), '#141a2e', Math.max(1, m * .07));
    g.fillStyle = '#15284d'; rrect(x - w * .36, y - h * 1.12, w * .72, h * .38, m * .3); g.fill(); outline(() => rrect(x - w * .36, y - h * 1.12, w * .72, h * .38, m * .3), '#141a2e', Math.max(1, m * .06));
    g.fillStyle = tail; rrect(x - w * .42, y - h * .56, w * .24, h * .1, m * .05); g.fill(); rrect(x + w * .18, y - h * .56, w * .24, h * .1, m * .05); g.fill();
    if (player) { g.fillStyle = '#f6f4ee'; rrect(x - w * .56, y - h * 1.22, w * 1.12, h * .1, m * .05); g.fill(); outline(() => rrect(x - w * .56, y - h * 1.22, w * 1.12, h * .1, m * .05), '#141a2e', Math.max(1, m * .05)); }
  }
  function drawCoin(p, big, t) {
    const m = p.m, r = m * (big ? 1.35 : .62), y = p.y - m * (big ? 2.2 + Math.sin(t * 2.4) * .25 : 1.1), sq = Math.abs(Math.cos(t * 3 + p.x * .01));
    if (big) { g.fillStyle = 'rgba(92,200,255,.22)'; g.fillRect(p.x - r * .8, 0, r * 1.6, y); }
    if (!hi()) { g.fillStyle = big ? '#1f6bff' : '#ffc845'; g.fillRect(p.x - r * sq, y - r, r * 2 * sq + 1, r * 2); return; }
    g.fillStyle = big ? '#1f6bff' : '#ffc53d'; g.beginPath(); g.ellipse(p.x, y, Math.max(1, r * sq), r, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = big ? '#ffd25e' : '#141a2e'; g.lineWidth = Math.max(1, r * .14); g.stroke();
    if (big && sq > .5) { g.fillStyle = '#fff'; g.font = `bold ${Math.max(6, r * .9)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('AI', p.x, y + 1); }
  }
  function drawSprites(W, H, t) {
    const list = [];
    const far = camZ + DRAW * SEG;
    const add = (s, fn) => { if (s > camZ + 1 && s < far) list.push([s, fn]); };
    for (const o of scenery) add(o.s, () => {
      const p = proj(o.s, o.d); if (!p) return;
      if (o.kind === 'board') {
        const m = p.m; g.fillStyle = '#f4f1ea'; g.fillRect(p.x - m * .2, p.y - m * 8, m * .4, m * 8);
        g.fillStyle = hi() ? '#1f6bff' : '#3a5aa8'; rrect(p.x - m * 6, p.y - m * 12.5, m * 12, m * 5, m * .6); g.fill();
        outline(() => rrect(p.x - m * 6, p.y - m * 12.5, m * 12, m * 5, m * .6), '#141a2e', Math.max(1, m * .15));
        if (m > 1.2) {
          g.textAlign = 'center'; g.textBaseline = 'middle';
          let fs = m * 2.2; g.font = `900 ${fs}px Arial`; const tw = g.measureText(o.text).width; if (tw > m * 11) { fs *= m * 11 / tw; g.font = `900 ${fs}px Arial`; }
          g.fillStyle = o.color; g.fillText(o.text, p.x, p.y - m * 10.6);
          g.fillStyle = '#dff1ff'; g.font = `700 ${m * .95}px Arial`; g.fillText('Intel® Core™ Ultra AI laptop', p.x, p.y - m * 8.6);
        }
      } else drawTree(p, o.k, o.kind === 'pine');
    });
    for (const [s, label, col] of gates) add(s, () => {
      const l = proj(s, -11), r = proj(s, 11); if (!l || !r) return;
      const m = l.m; g.fillStyle = col;
      g.fillRect(l.x - m * .7, l.y - m * 11, m * 1.4, m * 11); g.fillRect(r.x - m * .7, r.y - m * 11, m * 1.4, m * 11);
      g.fillStyle = '#fff'; rrect(l.x - m * .7, l.y - m * 13, r.x - l.x + m * 1.4, m * 2.4, m * .6); g.fill();
      outline(() => rrect(l.x - m * .7, l.y - m * 13, r.x - l.x + m * 1.4, m * 2.4, m * .6), '#141a2e', Math.max(1, m * .15));
      if (m > .8) { g.fillStyle = '#10204a'; g.font = `900 ${m * 1.6}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, (l.x + r.x) / 2, l.y - m * 11.8); }
    });
    for (const o of obstacles) add(o.s, () => {
      const p = proj(o.s, o.d); if (!p) return; const m = p.m, y = p.y - o.fly * m;
      if (o.barrier) { g.fillStyle = '#ff7a1a'; g.fillRect(p.x - m * 1.7, y - m * 1.05, m * 3.4, m * 1.05);
        g.fillStyle = '#fff6e6'; for (let i = 0; i < 4; i++) g.fillRect(p.x - m * 1.5 + i * m * .9, y - m * .9, m * .35, m * .75); outline(() => g.rect(p.x - m * 1.7, y - m * 1.05, m * 3.4, m * 1.05), '#141a2e', Math.max(1, m * .08)); }
      else for (const dx of [-1.1, 0, 1.1]) { g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(p.x + dx * m, y - m * 1.1); g.lineTo(p.x + (dx + .45) * m, y); g.lineTo(p.x + (dx - .45) * m, y); g.fill(); }
    });
    for (const c of coins) if (!c.taken) add(c.s, () => { const p = proj(c.s, c.d); if (p) drawCoin(p, false, t); });
    for (const u of ups) if (!u.taken) add(u.s, () => { const p = proj(u.s, u.d); if (p) drawCoin(p, true, t); });
    for (const c of traffic) add(c.s, () => { const p = proj(c.s, c.d); if (p) drawCar(p.x, p.y, p.m, c.col, '#ff2b4a', false); });
    list.sort((a, b) => b[0] - a[0]).forEach(([, fn]) => fn());
  }

  function drawPlayer(W, H) {
    const p = proj(P.s, P.d); if (!p) return;
    const bob = Math.sin(performance.now() / 70) * (P.v > 5 ? p.m * .03 : 0);
    g.save(); g.translate(p.x, p.y + bob); g.rotate(P.steer * .05);
    drawCar(0, 0, p.m * 1.05, hi() ? '#1a6bff' : '#2f5fe0', stage >= 4 ? '#ff2b4a' : '#aa2222', true);
    g.restore();
    if (P.hitCd > 0 && Math.floor(P.hitCd * 12) % 2) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(p.x - p.m * 1.2, p.y - p.m * 1.8, p.m * 2.4, p.m * 1.8); }
    if ((stage >= 4 || P.boosting) && Math.random() < .8) parts.push({ x: p.x + rand(-1, 1) * p.m * .5, y: p.y - p.m * .3, vx: rand(-20, 20), vy: rand(10, 40), life: .5, col: P.boosting ? '#d58bff' : pick(['#5cd0ff', '#ffd25e']) });
  }
  function drawParts(dt) {
    for (const q of parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    parts = parts.filter(q => q.life > 0);
    for (const q of parts) { g.globalAlpha = Math.min(1, q.life * 2); g.fillStyle = q.col; const s = hi() ? 3 : 2; g.fillRect(q.x - s / 2, q.y - s / 2, s, s); }
    g.globalAlpha = 1;
  }
  function burstAt(x, y, n, cols) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rand(-120, 120), vy: rand(-140, 40), life: rand(.4, .9), col: pick(cols) }); }

  function render(t, dt) {
    const W = canvas.width, H = canvas.height;
    camZ = P.s - CAM_BACK; sc0 = P.s; camX = P.d * UPM * .85;
    g.save();
    if (shake > 0) g.translate(rand(-1, 1) * shake * 3, rand(-1, 1) * shake * 3);
    drawSky(W, H); drawRoad(W, H); drawSprites(W, H, t); drawPlayer(W, H); drawParts(dt);
    g.restore();
  }

  /* ---------------- minimap (same look as 3D) */
  function frame(s, d) { const c = slope(s), n = Math.hypot(1, c); return { x: center(s) + d / n, z: -s + d * c / n, nx: 1 / n, nz: c / n }; }
  function drawMinimap(t) {
    const c = hud.mini; if (!c || !c.offsetParent) return;
    const mg = c.getContext('2d'), W = c.width, H = c.height;
    mg.clearRect(0, 0, W, H); mg.save(); mg.beginPath(); mg.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); mg.clip();
    mg.fillStyle = 'rgba(4,14,34,.55)'; mg.fillRect(0, 0, W, H);
    const pf = frame(P.s, P.d), fx = pf.nz, fz = -pf.nx, sc = H * .6 / 360, ox = W / 2, oy = H * .66;
    const to = (x, z) => { const dx = x - pf.x, dz = z - pf.z; return [ox + (dx * pf.nx + dz * pf.nz) * sc, oy - (dx * fx + dz * fz) * sc]; };
    mg.lineCap = mg.lineJoin = 'round'; mg.beginPath();
    for (let s = P.s - 120; s <= P.s + 520; s += 10) { const f = frame(s, 0), [x, y] = to(f.x, f.z); s === P.s - 120 ? mg.moveTo(x, y) : mg.lineTo(x, y); }
    mg.strokeStyle = 'rgba(255,255,255,.85)'; mg.lineWidth = 16 * sc + 4; mg.stroke(); mg.strokeStyle = '#3a4258'; mg.lineWidth = 16 * sc; mg.stroke();
    const dot = (s, d, col, r) => { if (s < P.s - 120 || s > P.s + 520) return; const f = frame(s, d), [x, y] = to(f.x, f.z); mg.fillStyle = col; mg.beginPath(); mg.arc(x, y, r, 0, Math.PI * 2); mg.fill(); };
    traffic.forEach(c2 => dot(c2.s, c2.d, '#ff4d6d', 2.4));
    ups.forEach(u => !u.taken && dot(u.s, u.d, '#00e0ff', 3.5 + Math.sin(t * 6)));
    mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(ox, oy - 7); mg.lineTo(ox + 5, oy + 5); mg.lineTo(ox, oy + 2); mg.lineTo(ox - 5, oy + 5); mg.fill();
    mg.restore();
  }

  /* ---------------- gameplay */
  function toast(i) {
    hud.toastName.textContent = UPGRADES[i].name; hud.toastDesc.textContent = UPGRADES[i].desc;
    hud.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => hud.toast.classList.remove('show'), 2500);
  }
  function mini(tx, ms) { hud.zoneToast.innerHTML = tx; hud.zoneToast.classList.add('show'); clearTimeout(miniTimer); miniTimer = setTimeout(() => hud.zoneToast.classList.remove('show'), ms); }
  function snap(id) { const c = root.querySelector('#' + id); if (!c) return; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(canvas, 0, 0, c.width, c.height); }
  function collect(u) {
    u.taken = true; const i = P.ups++;
    P.boost = Math.min(100, P.boost + 40);
    slots[i]?.classList.add('on'); retrigger(slots[i], 'pop'); cps[i]?.classList.add('got');
    setText(hud.system, UPGRADES[i].system); if (i === 2) hud.system.classList.add('ai');
    slowUntil = performance.now() + 400; retrigger(hud.flash, 'go'); toast(i);
    const p = proj(u.s, u.d); if (p) burstAt(p.x, p.y - p.m * 2, 40, ['#5cd0ff', '#ffd25e', '#ffffff']);
    if (i === 1 && hud.wipe) { // pixelated -> sharp wipe
      hud.wipe.width = canvas.width; hud.wipe.height = canvas.height; hud.wipe.getContext('2d').drawImage(canvas, 0, 0); retrigger(hud.wipe, 'run');
    }
    stage = i + 2; if (stage === 3) sizeCanvas();
    if (stage === 4) { freezeUntil = 0; hud.zoneToast.classList.remove('show'); }
  }
  function hit(d) {
    P.hits++; P.hitCd = .9; P.v *= .45; shake = 1;
    P.d = clamp(P.d + (P.d >= d ? 1 : -1) * 1.2, -LIMIT, LIMIT);
    mini('+1s  COLLISION', 800);
  }
  function step(dt) {
    const racing = phase === 'race', finishing = phase === 'finishing' || phase === 'done';
    const touch = document.body.classList.contains('touch');
    const gas = racing && (keys.gas || touch), brk = racing && keys.brake;
    P.brake = damp(P.brake, (brk || finishing) ? 1 : 0, 12, dt);
    P.boosting = racing && keys.boost && P.boost > 2;
    P.boost = P.boosting ? Math.max(0, P.boost - 32 * dt) : Math.min(100, P.boost + 3.5 * dt);
    const top = P.boosting ? V_BOOST : V_MAX;
    let a = 0;
    if (racing) {
      if (gas || P.boosting) a += (P.boosting ? BOOST_ACCEL : ACCEL) * (1 - Math.pow(P.v / top, 2.2));
      else if (P.v < V_CRUISE && !brk) a += 9;
      if (brk) a -= BRAKE_DECEL;
      a -= .0016 * P.v * P.v + (P.v > top ? (P.v - top) * 1.2 : 0);
    } else if (finishing) a = -26;
    P.v = Math.max(racing ? Math.min(P.v, V_MIN_BRAKE) : 0, P.v + a * dt);
    P.s += P.v * dt;
    if (racing) P.time += dt;
    const steer = racing ? (keys.right ? 1 : 0) - (keys.left ? 1 : 0) : 0;
    P.steer = damp(P.steer, steer, 7, dt);
    P.d = clamp(P.d + P.steer * (8 + P.v * .13) * dt, -LIMIT, LIMIT);
    P.hitCd = Math.max(0, P.hitCd - dt); shake = Math.max(0, shake - dt * 2.4);

    while (nextTrafficS < P.s + 340 && nextTrafficS < TRACK_LEN + 100) {
      const s = nextTrafficS, inZone = s > CONG_START && s < CONG_END;
      const lanes = [0, 1, 2, 3].sort(() => Math.random() - .5).slice(0, inZone && Math.random() < .45 ? 2 : 1);
      for (const li of lanes) {
        if (COIN_S.some(u => Math.abs(u - s) < 30) && Math.abs(LANES[li] - P.d) < 3) continue;
        traffic.push({ s: s + rand(-4, 4), d: LANES[li], v: (inZone ? 12 : 24) + li * 1.6, col: pick(['#ff5a5f', '#ffc93c', '#3ddc97', '#ff8c42', '#9b5de5', '#f7f7f2']) });
      }
      nextTrafficS += inZone ? rand(26, 40) : rand(80, 130);
    }
    for (const c of traffic) { c.s += c.v * dt; if (P.hitCd <= 0 && Math.abs(c.s - P.s) < 4.2 && Math.abs(c.d - P.d) < 1.95) { hit(c.d); c.v = Math.max(c.v, P.v + 14); c.s += 3; c.d = clamp(c.d + (c.d >= P.d ? 2.4 : -2.4), -7.5, 7.5); } }
    traffic = traffic.filter(c => c.s > P.s - 40 && c.s < P.s + 700);
    for (const o of obstacles) {
      if (o.hit) { o.fly = Math.max(0, o.fly + dt * 6); continue; }
      if (P.hitCd <= 0 && Math.abs(o.s - P.s) < 2.8 && Math.abs(o.d - P.d) < 2.65) { o.hit = true; hit(o.d); }
    }
    for (const c of coins) if (!c.taken && Math.abs(c.s - P.s) < 2.6 && Math.abs(c.d - P.d) < 1.9) {
      c.taken = true; P.boost = Math.min(100, P.boost + 12); const p = proj(c.s, c.d); if (p) burstAt(p.x, p.y - p.m, 8, ['#ffd25e', '#fff']);
    }
    const u = ups[P.ups];
    if (u && !u.taken) {
      const ds = u.s - P.s;
      if (ds < 90) u.d = damp(u.d, P.d, ds < 30 ? 9 : 2.5, dt);
      if ((Math.abs(ds) < 3.5 && Math.abs(u.d - P.d) < 2.6) || ds < -2) collect(u);
    }
    if (!zoneShown && stage < 4 && P.s > CONG_START - 10) { zoneShown = true; mini('⚠ CONGESTED ZONE<br>BACKGROUND TASKS ARE CAUSING LAG', 2600); }
    if (racing && P.s >= TRACK_LEN) { phase = 'finishing'; finishAt = performance.now(); }
    if (phase === 'finishing' && (P.v < 1 || performance.now() - finishAt > 2600)) { phase = 'done'; wantAfterShot = true; }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const realDt = Math.min(.25, (now - lastT) / 1000 || 0); lastT = now;
    if (document.body.classList.contains('touch') && portrait.matches) return; // paused behind "rotate" overlay
    pending = Math.min(.25, pending + realDt);
    if (phase === 'tutorial') {
      const el = now - tutorialStart;
      hud.tutBar.style.width = Math.min(100, el / TUTORIAL_MS * 100) + '%';
      if (el >= TUTORIAL_MS) { phase = 'race'; hud.tutorial.classList.remove('show'); retrigger(hud.go, 'show'); }
    }
    // SIMULATED performance effects (time-based, same on every device)
    if (phase === 'race') {
      if (stage === 1) { if (pending < nextCap) return; nextCap = 1 / rand(15, 20); }
      else if (inStutter()) {
        if (now < freezeUntil) return;
        if (Math.random() < pending * 1.6) { freezeUntil = now + rand(110, 300); return; }
        if (Math.random() < .25) return;
      }
    }
    const dt = pending; pending = 0;
    if (phase === 'race' && Object.values(keys).some(Boolean)) onActivity();
    let rem = now < slowUntil ? dt * .25 : dt;
    while (rem > 1e-6) { const h = Math.min(rem, 1 / 120); step(h); rem -= h; }
    render(now / 1000, dt);
    if (!shotBefore && stage === 1 && phase === 'race' && P.time > 1.2) { shotBefore = true; snap('res-before'); }
    if (wantAfterShot) { wantAfterShot = false; snap('res-after'); hud.results.classList.add('show'); }
    setText(hud.speed, String(Math.round(P.v * 3.6)));
    if (hud.prog) hud.prog.style.width = clamp(P.s / TRACK_LEN, 0, 1) * 100 + '%';
    fpsFrames++; if (now - fpsT0 >= 500) { fpsShown = Math.round(fpsFrames * 1000 / (now - fpsT0)); fpsFrames = 0; fpsT0 = now; }
    setText(hud.fps, String(fpsShown));
    setText(hud.fpsMode, phase === 'race' && (stage === 1 || inStutter()) ? 'SIMULATED' : 'REAL');
    drawMinimap(now / 1000);
  }

  /* ---------------- input */
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'boost' };
  const onKey = e => { const k = KEYMAP[e.code]; if (!k || !running) return; e.preventDefault(); keys[k] = e.type === 'keydown'; };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  addEventListener('blur', () => Object.keys(keys).forEach(k => keys[k] = false));
  root.querySelectorAll('.tc-btn').forEach(btn => {
    const k = btn.dataset.key;
    btn.addEventListener('pointerdown', e => { if (!running) return; e.preventDefault(); keys[k] = true; btn.classList.add('held'); btn.setPointerCapture?.(e.pointerId); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, () => { keys[k] = false; btn.classList.remove('held'); }));
  });
  new ResizeObserver(() => { if (running) sizeCanvas(); }).observe(root);

  /* ---------------- API */
  function restart() {
    ['results', 'toast', 'zoneToast'].forEach(k => hud[k]?.classList.remove('show'));
    hud.wipe?.classList.remove('run');
    Object.keys(keys).forEach(k => keys[k] = false);
    reset();
    shotBefore = false; wantAfterShot = false; slowUntil = 0;
    phase = 'tutorial'; tutorialStart = performance.now(); hud.tutorial.classList.add('show'); hud.tutBar.style.width = '0%';
    running = true; pending = 0; lastT = performance.now(); fpsT0 = lastT; fpsFrames = 0;
    render(0, 0);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false; phase = 'idle'; cancelAnimationFrame(raf); raf = 0;
    Object.keys(keys).forEach(k => keys[k] = false);
    ['tutorial', 'results', 'toast', 'zoneToast'].forEach(k => hud[k]?.classList.remove('show'));
  }
  const api = {
    restart, stop, mode: '2d',
    get debug() { return { P, stage, phase, quality: 0, fps: fpsShown, upgrades: P.ups, keys: { ...keys }, mode: '2d' }; },
    _jump(s) { P.s = s; nextTrafficS = Math.max(nextTrafficS, s + 60); },
    _cars() { return traffic.map(c => ({ s: c.s, d: c.d })); }
  };
  window.__game = api;
  return api;
};
