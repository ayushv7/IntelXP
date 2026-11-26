/* =========================================================================
   app.js — screen flow, quiz, recommendation, comparison, kiosk behaviour
   ========================================================================= */
const DATA = window.PROCESSOR_DATA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const IDLE_RESET_MS = 60000;   // reset to landing after 60 s of inactivity
const IDLE_WARN_MS = 50000;    // show "still there?" 10 s before reset

const state = {
  screen: 'landing',
  unlocked: false,
  completed: new Set(),
  answers: new Set(),
  tier: 'mid'
};

/* ---------------------------------------------------------------- utils */
let toastTimer;
function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  document.body.classList.toggle('pixel-mode', $('.screen.active')?.classList.contains('pixel'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------------------------------------------------- navigation */
function show(name) {
  const next = $(`[data-screen="${name}"]`);
  if (!next) { console.warn('Unknown screen', name); return; }
  $$('.screen.active').forEach(s => s.classList.remove('active'));
  next.classList.add('active');
  next.scrollTop = 0;
  state.screen = name;
  document.body.classList.toggle('in-game', name === 'game');
  if (name === 'landing') startStars(); else stopStars();
  // move focus for keyboard users (not in-game: Space/arrows drive the car there)
  if (name === 'game') document.activeElement?.blur?.();
  else (next.querySelector('.hex-btn') || next.querySelector('button'))?.focus({ preventScroll: true });
}

/* ------------------------------------------------------------- actions */
const actions = {
  enter: () => show('select'),
  home: () => resetAll(),
  'play-gaming': () => startGame(),
  'play-work': () => show('work'),
  'play-learning': () => show('learning'),
  'finish-placeholder': () => {
    markComplete(state.screen === 'work' ? 'work' : 'learning');
    show('select');
  },
  next: (btn) => {
    if (!state.unlocked) {
      shake(btn);
      toast('Play a mission first to unlock NEXT');
      return;
    }
    show('quiz');
  },
  'exit-game': () => { game?.stop(); show('select'); },
  'race-again': () => game?.restart(),
  'finish-game': () => { game?.stop(); markComplete('gaming'); show('select'); },
  'back-select': () => show('select'),
  'finish-quiz': (btn) => {
    if (!state.answers.size) {
      shake(btn);
      $('#quiz-msg').textContent = 'Pick at least one option to continue.';
      return;
    }
    state.tier = computeTier([...state.answers]);
    renderRecommendation();
    show('rec');
  },
  'back-quiz': () => show('quiz'),
  compare: () => { renderComparison(); show('compare'); },
  'back-rec': () => show('rec'),
  end: () => { renderEnd(); show('end'); },
  restart: () => resetAll(),
  stay: () => bumpActivity()
};

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const fn = actions[btn.dataset.action];
  if (fn) fn(btn);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && state.screen === 'landing') { e.preventDefault(); actions.enter(); }
  if (e.key === 'Escape' && state.screen === 'game') actions['exit-game']();
});

function markComplete(id) {
  state.completed.add(id);
  const wasUnlocked = state.unlocked;
  state.unlocked = true;
  const card = $(`.mission[data-action="play-${id}"]`);
  card?.classList.add('done');
  const btn = $('#btn-next');
  btn.classList.remove('locked');
  const hint = $('#next-hint');
  hint.textContent = 'Unlocked!';
  hint.classList.add('ready');
}

function resetAll() {
  game?.stop();
  state.unlocked = false;
  state.completed.clear();
  state.answers.clear();
  state.tier = 'mid';
  $$('.mission').forEach(m => m.classList.remove('done'));
  $('#btn-next').classList.add('locked');
  const hint = $('#next-hint');
  hint.textContent = 'Complete a mission to unlock';
  hint.classList.remove('ready');
  $$('.quiz-opt').forEach(o => o.setAttribute('aria-pressed', 'false'));
  $('#quiz-msg').textContent = '';
  hideIdle();
  show('landing');
}

/* ---------------------------------------------------------------- quiz */
const ICONS = {
  book: '<svg viewBox="0 0 48 48"><path d="M6 10h14a6 6 0 0 1 6 6v24a4 4 0 0 0-4-4H6zM42 10H28a6 6 0 0 0-2 .4V40a4 4 0 0 1 4-4h12z" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
  brief: '<svg viewBox="0 0 48 48"><rect x="5" y="14" width="38" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M17 14V9h14v5M5 26h38" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
  play: '<svg viewBox="0 0 48 48"><rect x="4" y="8" width="40" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M20 15l10 7-10 7z" fill="currentColor"/><path d="M14 42h20" stroke="currentColor" stroke-width="2.5"/></svg>',
  pad: '<svg viewBox="0 0 48 48"><path d="M12 16h24a8 8 0 0 1 8 8v4a6 6 0 0 1-10.5 4L30 28H18l-3.5 4A6 6 0 0 1 4 28v-4a8 8 0 0 1 8-8z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M14 20v8M10 24h8" stroke="currentColor" stroke-width="2.5"/><circle cx="33" cy="22" r="2" fill="currentColor"/><circle cx="37" cy="27" r="2" fill="currentColor"/></svg>',
  cam: '<svg viewBox="0 0 48 48"><rect x="4" y="13" width="30" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M34 21l10-6v20l-10-6z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="19" cy="25" r="5" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
  globe: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M6 24h36M24 6c6 6 6 30 0 36M24 6c-6 6-6 30 0 36" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>'
};

function buildQuiz() {
  const grid = $('#quiz-grid');
  grid.innerHTML = DATA.useCases.map(u => `
    <button class="hex-card quiz-opt" data-id="${esc(u.id)}" aria-pressed="false">
      <span class="qi" aria-hidden="true">${ICONS[u.icon] || ''}</span>
      <span class="qt"><b>${esc(u.label)}</b><small>${esc(u.blurb)}</small></span>
      <span class="check" aria-hidden="true"></span>
    </button>`).join('');
  grid.addEventListener('click', e => {
    const opt = e.target.closest('.quiz-opt');
    if (!opt) return;
    const id = opt.dataset.id;
    const on = !state.answers.has(id);
    on ? state.answers.add(id) : state.answers.delete(id);
    opt.setAttribute('aria-pressed', String(on));
    $('#quiz-msg').textContent = state.answers.size ? `${state.answers.size} selected` : '';
  });
}

/* ----------------------------------------------- recommendation logic */
function computeTier(answers) {
  const order = DATA.tierOrder; // low -> high
  let best = -1;
  for (const a of answers) {
    for (const [tier, ids] of Object.entries(DATA.tierRules)) {
      if (ids.includes(a)) best = Math.max(best, order.indexOf(tier));
    }
  }
  return best < 0 ? 'mid' : order[best];
}

function labelFor(id) { return DATA.useCases.find(u => u.id === id)?.label || id; }

function renderRecommendation() {
  const p = DATA.processors[state.tier];
  const picks = [...state.answers];
  $('#rec-img').src = p.image;
  $('#rec-img').alt = `${p.family} processor illustration`;
  $('.chip-halo').style.setProperty('--chip-accent', p.accent);
  $('#rec-name').textContent = `${p.family}${p.model ? ' ' + p.model : ''}`;
  $('#rec-tagline').textContent = p.tagline;
  $('#rec-picks').innerHTML = picks.map(id => `<span class="chip-tag">${esc(labelFor(id))}</span>`).join('');
  const key = p.specs.filter(x => x.key);
  $('#rec-specs').innerHTML = (key.length ? key : p.specs.slice(0, 4)).map(x => `<li><span>${esc(x.label)}</span><b>${esc(x.value)}</b></li>`).join('');
  // one concise, personalised sentence instead of a wall of cards
  const tierPicks = picks.filter(id => (DATA.tierRules[state.tier] || []).includes(id));
  const lead = tierPicks[0] || picks[0];
  const names = picks.map(labelFor);
  const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1] : names[0];
  $('#rec-why').innerHTML = `Great for <b>${esc(list)}</b>. ${esc(DATA.useCaseReasons[lead] || '')}`;
  $('#rec-roles').innerHTML = [['CPU', p.roles.cpu], ['GPU', p.roles.gpu], ['NPU', p.roles.npu]]
    .map(([k, v]) => `<div class="role"><b>${k}</b><p>${esc(v)}</p></div>`).join('');
  $('.placeholder-badge').style.display = (DATA.showPlaceholderBadges && p.placeholder) ? '' : 'none';
}

function renderComparison() {
  const p = DATA.processors[state.tier];
  const c = DATA.comparisons[state.tier];
  $('#cmp-note').style.display = DATA.showPlaceholderBadges ? '' : 'none';
  const head = `<div class="cmp-head">
      <div></div>
      <div class="who intel"><img src="${esc(p.image)}" alt="" />${esc(p.family)}${p.model ? ' ' + esc(p.model) : ''}</div>
      <div class="who comp"><img src="${esc(c.competitorImage)}" alt="" />${esc(c.competitorName)}</div>
    </div>`;
  const rows = c.rows.map((r, i) => `<div class="cmp-row" style="animation-delay:${i * 70}ms">
      <span class="lbl">${esc(r.label)}</span>
      <span class="v ${r.winner === 'intel' ? 'win' : ''}">${esc(r.intel)}</span>
      <span class="v comp ${r.winner === 'competitor' ? 'win' : ''}">${esc(r.competitor)}</span>
    </div>`).join('');
  $('#cmp-table').innerHTML = head + rows;
  $('#cmp-adv').innerHTML = c.advantages.map(a => `<div class="adv">${esc(a)}</div>`).join('');
}

function renderEnd() {
  const p = DATA.processors[state.tier];
  $('#end-img').src = p.image;
  $('#end-img').alt = `${p.family} processor illustration`;
  $('#end-name').textContent = `${p.family}${p.model ? ' ' + p.model : ''}`;
  $('#end-tag').textContent = p.tagline;
}

/* ------------------------------------------------------------- game */
let game = null;
let gameModulePromise = null;

async function startGame() {
  show('game');
  const loading = $('#game-loading');
  try {
    if (!game) {
      loading.classList.add('show');
      gameModulePromise ||= window.loadGameModule();
      const mod = await gameModulePromise;
      game = mod.createGame({
        root: $('#game-root'),
        canvas: $('#game-canvas'),
        onActivity: bumpActivity
      });
    }
    loading.classList.remove('show');
    if (state.screen !== 'game') return; // user left while loading
    game.restart();
  } catch (err) {
    console.error('Game failed to start:', err);
    gameModulePromise = null;
    game = null;
    loading.classList.remove('show');
    $('#game-error-msg').textContent = (err && err.message && /webgl/i.test(err.message))
      ? 'WebGL is not available on this device. You can still continue the experience.'
      : 'The 3D engine could not load (check the internet connection). You can still continue the experience.';
    $('#game-error').classList.add('show');
  }
}

/* --------------------------------------------------------- fullscreen */
function toggleFullscreen() {
  const d = document;
  try {
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const el = d.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => toast('Fullscreen not allowed here'));
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
    }
  } catch { toast('Fullscreen not supported'); }
}
$('#btn-fullscreen').addEventListener('click', toggleFullscreen);
if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) $('#btn-fullscreen').style.display = 'none';

/* ------------------------------------------------------- idle / kiosk */
let lastActivity = performance.now();
let idleShown = false;
function bumpActivity() {
  lastActivity = performance.now();
  if (idleShown) hideIdle();
}
function hideIdle() { idleShown = false; $('#idle-overlay').classList.remove('show'); }
['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev =>
  window.addEventListener(ev, bumpActivity, { passive: true, capture: true }));
setInterval(() => {
  if (state.screen === 'landing') { lastActivity = performance.now(); return; }
  const idle = performance.now() - lastActivity;
  if (idle >= IDLE_RESET_MS) { resetAll(); return; }
  if (idle >= IDLE_WARN_MS) {
    if (!idleShown) { idleShown = true; $('#idle-overlay').classList.add('show'); }
    $('#idle-count').textContent = Math.ceil((IDLE_RESET_MS - idle) / 1000);
  }
}, 250);

/* ---------------------------------------------- landing pixel visuals */
function drawPixelChip() {
  const c = $('#pixel-chip'); const g = c.getContext('2d');
  const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  g.clearRect(0, 0, 32, 32);
  for (let i = 0; i < 6; i++) { // pins
    const p = 7 + i * 3.4 | 0;
    P(p, 1, 2, 4, '#7fe9ff'); P(p, 27, 2, 4, '#7fe9ff'); P(1, p, 4, 2, '#7fe9ff'); P(27, p, 4, 2, '#7fe9ff');
  }
  P(5, 5, 22, 22, '#00e0ff'); P(6, 6, 20, 20, '#0a2f8f'); P(7, 7, 18, 18, '#0068ff');
  P(9, 9, 14, 14, '#06142e');
  // "AI" in pixels
  const A = ['0110', '1001', '1111', '1001', '1001'], I = ['111', '010', '010', '010', '111'];
  A.forEach((r, y) => [...r].forEach((b, x) => b === '1' && P(10 + x, 13 + y, 1, 1, '#ffffff')));
  I.forEach((r, y) => [...r].forEach((b, x) => b === '1' && P(17 + x, 13 + y, 1, 1, '#ffc845')));
  P(10, 10, 2, 1, '#00e0ff'); P(20, 21, 2, 1, '#00e0ff');
}

let starRAF = 0, stars = [];
function startStars() {
  if (starRAF) return;
  const c = $('#pixel-stars'); const g = c.getContext('2d');
  const scale = 4;
  const resize = () => {
    c.width = Math.ceil(innerWidth / scale); c.height = Math.ceil(innerHeight / scale);
    stars = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, z: Math.random() * 3 + .5 }));
  };
  resize();
  window.addEventListener('resize', resize);
  let t0 = performance.now();
  const loop = (t) => {
    const dt = Math.min(.05, (t - t0) / 1000); t0 = t;
    g.clearRect(0, 0, c.width, c.height);
    // pixel horizon grid
    const hy = c.height * .68 | 0;
    g.fillStyle = 'rgba(0,104,255,.25)';
    for (let i = 0; i < 12; i++) {
      const y = hy + Math.pow(((i + (t / 900) % 1) / 12), 2) * (c.height - hy);
      g.fillRect(0, y | 0, c.width, 1);
    }
    for (let i = -14; i <= 14; i++) {
      for (let y = hy; y < c.height; y += 1) {
        const x = c.width / 2 + i * (y - hy) * 0.9;
        if ((y & 1) === 0) g.fillRect(x | 0, y, 1, 1);
      }
    }
    for (const s of stars) {
      s.x -= s.z * 8 * dt;
      if (s.x < 0) { s.x = c.width; s.y = Math.random() * hy; }
      g.fillStyle = s.z > 2.6 ? '#ffffff' : s.z > 1.5 ? '#7fe9ff' : '#1f8bff';
      g.fillRect(s.x | 0, s.y | 0, s.z > 2.8 ? 2 : 1, 1);
    }
    starRAF = requestAnimationFrame(loop);
  };
  starRAF = requestAnimationFrame(loop);
  startStars.cleanup = () => window.removeEventListener('resize', resize);
}
function stopStars() {
  if (!starRAF) return;
  cancelAnimationFrame(starRAF); starRAF = 0;
  startStars.cleanup?.();
}

/* ---------------------------------------------------------------- boot */
if (navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches) document.body.classList.add('touch');
buildQuiz();
drawPixelChip();
startStars();
// Warm the 3D engine download in the background so the race starts fast.
setTimeout(() => {
  if (gameModulePromise) return;
  gameModulePromise = window.loadGameModule();
  gameModulePromise.catch(e => { gameModulePromise = null; console.warn('3D engine prefetch failed (will retry on play):', e); });
}, 1200);

// Expose for automated testing / debugging
window.__app = { state, show, computeTier, get game() { return game; }, get idleMs() { return performance.now() - lastActivity; } };
