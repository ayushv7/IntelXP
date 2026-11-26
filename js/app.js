/* =========================================================================
   app.js — screen flow, quiz, recommendation, comparison, kiosk behaviour
   ========================================================================= */
const DATA = window.PROCESSOR_DATA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const IDLE_RESET_MS = 60000;   // reset to landing after 60 s of inactivity
const IDLE_RESET_END_MS = 90000; // the end screen stays up longer for the store associate
const IDLE_WARN_BEFORE_MS = 10000; // show "still there?" 10 s before reset

const state = {
  screen: 'landing',
  unlocked: false,
  completed: new Set(),
  answers: new Set(),
  tier: DATA.tierOrder[0]
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
  'play-work': () => { show('work'); window.Minis.start('work', $('#screen-work')); },
  'play-learning': () => { show('learning'); window.Minis.start('learning', $('#screen-learning')); },
  'exit-mini': () => { window.Minis.stop(); show('select'); },
  'finish-placeholder': () => {
    window.Minis.stop();
    markComplete(state.screen === 'work' ? 'work' : 'learning');
    show('select');
  },
  next: (btn) => {
    if (!state.unlocked) {
      shake(btn); window.SFX?.error();
      toast('Play a mission first to unlock NEXT');
      return;
    }
    show('quiz');
  },
  'exit-game': () => { race()?.stop(); show('select'); },
  'race-again': () => race()?.restart(),
  'finish-game': () => { race()?.stop(); $('#game-error').classList.remove('show'); markComplete('gaming'); show('select'); },
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
  'back-quiz': () => { closeSheet(); show('quiz'); },
  compare: () => { renderComparison(); show('compare'); },
  specs: () => showSheet('specs-sheet'),
  sources: () => showSheet('sources-sheet'),
  'close-sheet': () => closeSheet(),
  'back-rec': () => { closeSheet(); show('rec'); },
  end: () => { closeSheet(); renderEnd(); show('end'); window.SFX?.jingle(); },
  restart: () => resetAll(),
  stay: () => bumpActivity()
};

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const fn = actions[btn.dataset.action];
  if (fn) { window.SFX?.click(); fn(btn); }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && state.screen === 'landing') { e.preventDefault(); actions.enter(); }
  if (e.key === 'Escape' && openSheet) { closeSheet(); return; }
  if (e.key === 'Escape' && state.screen === 'game') actions['exit-game']();
});

function markComplete(id) {
  state.completed.add(id);
  const wasUnlocked = state.unlocked;
  if (!wasUnlocked) setTimeout(() => window.SFX?.unlock(), 350);
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
  game?.stop(); race2d?.stop();
  window.Minis?.stop();
  state.unlocked = false;
  state.completed.clear();
  state.answers.clear();
  state.tier = DATA.tierOrder[0];
  closeSheet();
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
    window.SFX?.tick();
    opt.setAttribute('aria-pressed', String(on));
    $('#quiz-msg').textContent = state.answers.size ? `${state.answers.size} selected` : '';
  });
}

/* ----------------------------------------------- recommendation logic */
// Highest tier among the picks wins; a busy "everyday" shopper (3+ picks) moves up.
function computeTier(answers) {
  const order = DATA.tierOrder; // low -> high
  let best = -1;
  for (const a of answers) {
    for (const [tier, ids] of Object.entries(DATA.tierRules)) {
      if (ids.includes(a)) best = Math.max(best, order.indexOf(tier));
    }
  }
  let tier = best < 0 ? order[0] : order[best];
  const bump = DATA.multitaskBump;
  if (bump && tier === bump.from && answers.length >= bump.minPicks) tier = bump.to;
  return tier;
}

const labelFor = id => DATA.useCases.find(u => u.id === id)?.label || id;
const listText = names => names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1] : (names[0] || '');
const chipName = p => `${p.family} ${p.model}`.trim();
const heroOf = L => (L.models || []).find(m => m.hero) || (L.models || [])[0];
/** "Core Ultra X7 358H (same Arc B390)" -> "Intel® Core™ Ultra X7 358H" */
const poweredChip = cpu => 'Intel® ' + String(cpu || '').replace(/\s*\(.*\)\s*$/, '').replace(/^Core Ultra/, 'Core™ Ultra');
/** The shopper's pick that best explains this tier (falls back to their first pick). */
function topPick(tier, picks) {
  return picks.find(id => (DATA.tierRules[tier] || []).includes(id)) || picks[0];
}

const LINE_ICONS = {
  ai:     '<path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.6-3.4 8.2-8 9-4.6-.8-8-4.4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  apps:   '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  bolt:   '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  game:   '<path d="M6.5 8h11a4 4 0 0 1 4 4v2.5a3 3 0 0 1-5.3 1.9L14.5 14h-5l-1.7 2.4A3 3 0 0 1 2.5 14.5V12a4 4 0 0 1 4-4z"/><path d="M7.5 10.5v3M6 12h3"/><circle cx="16" cy="11" r=".6"/><circle cx="17.8" cy="13" r=".6"/>'
};
const lineIcon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${LINE_ICONS[name] || LINE_ICONS.ai}</svg>`;

/** Generic AI laptop illustration (no real brand). Screen glows in the tier accent. */
function laptopSVG(title, accent, { small = false, sub = '' } = {}) {
  const id = 'lg' + Math.random().toString(36).slice(2, 7);
  const keys = [];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 12; k++) {
    const x = 92 + k * 26.5 + r * 4, y = 282 + r * 14;
    keys.push(`<rect x="${x.toFixed(1)}" y="${y}" width="20" height="9" rx="2"/>`);
  }
  return `<svg class="laptop-svg" viewBox="0 0 480 400" role="img" aria-label="${esc(title)} illustration">
    <defs>
      <radialGradient id="${id}g" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="${accent}" stop-opacity=".95"/><stop offset=".55" stop-color="${accent}" stop-opacity=".35"/><stop offset="1" stop-color="#061a40" stop-opacity="1"/></radialGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd9ea"/><stop offset="1" stop-color="#8e9bb3"/></linearGradient>
      <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3550"/><stop offset="1" stop-color="#151b2c"/></linearGradient>
      <filter id="${id}f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>
    </defs>
    <ellipse cx="240" cy="150" rx="170" ry="110" fill="${accent}" opacity=".35" filter="url(#${id}f)"/>
    <rect x="70" y="20" width="340" height="232" rx="18" fill="url(#${id}l)"/>
    <rect x="84" y="34" width="312" height="204" rx="8" fill="url(#${id}g)"/>
    <circle cx="240" cy="27" r="2.5" fill="#56627e"/>
    <text x="240" y="${sub ? 118 : 138}" text-anchor="middle" font-family="Space Grotesk, Inter, Arial, sans-serif" font-weight="700" font-size="${Math.min(40, 560 / Math.max(8, title.length))}" fill="#ffffff">${esc(title)}</text>
    ${sub ? `<text x="240" y="160" text-anchor="middle" font-family="Space Grotesk, Inter, Arial, sans-serif" font-weight="600" font-size="${Math.min(26, 520 / Math.max(10, sub.length))}" fill="#ffffff" opacity=".9">${esc(sub)}</text>` : ''}
    <rect x="200" y="${sub ? 178 : 160}" width="80" height="5" rx="2.5" fill="#ffffff" opacity=".45"/>
    <path d="M70 252h340l52 104a10 10 0 0 1-9 14H27a10 10 0 0 1-9-14z" fill="url(#${id}b)"/>
    <path d="M18 356l4 8a10 10 0 0 0 5 6h426a10 10 0 0 0 5-6l4-8z" fill="#6f7c96"/>
    <g fill="#5c6883" opacity=".55">${keys.join('')}</g>
    <rect x="170" y="340" width="100" height="24" rx="4" fill="#a3afc5"/>
    ${small ? `<rect x="330" y="338" width="88" height="26" rx="5" fill="#0a3fc2"/>` : `<rect x="296" y="334" width="150" height="32" rx="6" fill="#0a3fc2"/>
    <text x="371" y="355" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="15" fill="#ffffff">Intel® Core™ Ultra</text>`}
  </svg>`;
}

function renderRecommendation() {
  const p = DATA.processors[state.tier];
  const L = p.laptop;
  const picks = [...state.answers];
  const hero = heroOf(L), others = (L.models || []).filter(m => m !== hero).slice(0, 2);
  const chip = hero ? poweredChip(hero.cpu) : chipName(p);
  $('#rec-art').innerHTML = hero ? laptopSVG(hero.brand, p.accent, { sub: hero.name }) : laptopSVG(L.title, p.accent);
  $('#rec-art').style.setProperty('--accent', p.accent);
  $('#rec-kicker').textContent = `YOUR ${L.title.toUpperCase()}`;
  $('#rec-name').textContent = hero ? `${hero.brand} ${hero.name}` : L.title;
  $('#rec-powered').textContent = `Powered by ${chip}`;
  $('#rec-powered').style.setProperty('--accent', p.accent);
  $('#pick-meta').textContent = hero ? [hero.sku, hero.memory, hero.price && `from ${hero.price}`].filter(Boolean).join(' · ') : '';
  const sameChip = hero && others.every(m => m.cpu === hero.cpu);
  $('#rec-also').hidden = !others.length;
  $('#rec-also').innerHTML = others.length ? `<p class="also-label">${sameChip ? 'Also with this chip' : 'Also consider'}</p><div class="also-cards">` +
    others.map(m => `<div class="also-card"><b>${esc(m.brand)}</b><span>${esc(m.name)}</span>${m.cpu !== hero.cpu ? `<em>${esc(poweredChip(m.cpu).replace('Intel® ', ''))}</em>` : ''}<i>${m.price ? 'from ' + esc(m.price) : 'Price in store'}</i></div>`).join('') + '</div>' : '';
  $('#rec-benefits').innerHTML = L.benefits.slice(0, 3).map(b =>
    `<li><span class="b-ico" style="--accent:${esc(p.accent)}">${lineIcon(b.icon)}</span><span>${esc(b.text)}</span></li>`).join('');
  const lead = topPick(state.tier, picks);
  $('#rec-why').innerHTML = `<b>Why it fits you:</b> ${esc(DATA.useCaseReasons[lead] || '')}`;
  // tech-specs sheet content
  $('#sheet-title').textContent = `${chipName(p)} · tech specs`;
  $('#sheet-specs').innerHTML = p.specs.map(s => `<div><span>${esc(s.label)}</span><b>${esc(s.value)}</b></div>`).join('');
  $('#sheet-roles').innerHTML = [['CPU', p.roles.cpu], ['GPU', p.roles.gpu], ['NPU', p.roles.npu]]
    .map(([k, v]) => `<div><b>${k}</b><p>${esc(v)}</p></div>`).join('');
  $('#sheet-also').textContent = L.alsoIn || '';
}

function renderComparison() {
  const p = DATA.processors[state.tier];
  const c = DATA.comparisons[state.tier];
  const picks = [...state.answers];
  const article = /^[aeiou]|^(AMD|HP|LG|MSI)\b/i.test(c.competitorName) ? 'an' : 'a';
  const hero = heroOf(p.laptop);
  $('#cmp-title').innerHTML = `${hero ? esc(hero.brand + ' ' + hero.name) + ` <span class="chipnote">(${esc(poweredChip(hero.cpu).replace(/®|™/g, ''))})</span>` : 'Intel AI laptop'} <span class="vs">vs</span> ${article} ${esc(c.competitorName)} laptop`;
  $('#cmp-chips').innerHTML = `<span class="intel">${esc(chipName(p))}</span><span class="sep">vs</span><span>${esc(c.competitorName)}</span>`;

  const hits = r => (r.matters || []).filter(m => picks.includes(m));
  const rows = c.rows.map((r, i) => ({ r, i, hl: hits(r).length > 0 }))
    .sort((a, b) => (b.hl - a.hl) || (a.i - b.i))
    .slice(0, 5);
  const cell = (val, side, r) => {
    const win = r.winner === side;
    const cls = win ? (side === 'intel' ? 'win' : 'win-neutral') : '';
    return `<span class="v ${side} ${cls}">${win ? '<i aria-hidden="true">✓</i>' : ''}${esc(val)}</span>`;
  };
  $('#cmp-table').innerHTML =
    `<div class="cmp-head"><span></span><span class="intel">Intel</span><span>${esc(c.competitorName.split(/[\s™]/)[0])}</span></div>` +
    rows.map(({ r, hl }, k) => `<div class="cmp-row ${hl ? 'hl' : ''}" style="animation-delay:${k * 60}ms">
        <span class="lbl">${esc(r.label)}${hl ? '<em class="tag">Matters to you</em>' : ''}</span>
        ${cell(r.intel, 'intel', r)}${cell(r.competitor, 'competitor', r)}
        ${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}
      </div>`).join('');

  const hl = rows.filter(x => x.hl);
  const wins = rows.filter(x => x.r.winner === 'intel').length;
  let verdict;
  if (hl.length && hl.every(x => x.r.winner === 'intel')) {
    const mattered = picks.filter(id => hl.some(x => (x.r.matters || []).includes(id)));
    verdict = `Intel wins where it matters for ${listText(mattered.map(labelFor))}`;
  } else {
    verdict = `Intel leads in ${wins} of ${rows.length}`;
  }
  $('#cmp-verdict').textContent = verdict;
  $('#cmp-callout').textContent = (c.advantages && c.advantages[0]) || '';
  $('#cmp-callout').hidden = !(c.advantages && c.advantages[0]);
  $('#sources-list').innerHTML = (DATA.sources || []).map(s => `<li>${esc(s)}</li>`).join('');
}

function renderEnd() {
  const p = DATA.processors[state.tier];
  const L = p.laptop, hero = heroOf(L);
  $('#end-art').innerHTML = hero ? laptopSVG(hero.brand, p.accent, { small: true, sub: hero.name }) : laptopSVG(L.title, p.accent, { small: true });
  $('#end-ask').innerHTML = hero ? `Ask for the <b>${esc(hero.brand)} ${esc(hero.name)}</b>` : `Ask for the <b>${esc(L.title)}</b>`;
  $('#end-sku').textContent = hero ? `SKU ${hero.sku} · Powered by ${poweredChip(hero.cpu)}` : `Powered by ${chipName(p)}`;
  $('#end-price').hidden = !(hero && hero.price);
  $('#end-price').textContent = hero && hero.price ? `${hero.price} · Price seen online in 2026, check today's price in store.` : '';
}

/* ------------------------------------------------- sheets & overlays */
let openSheet = null;
function showSheet(id) {
  closeSheet();
  openSheet = $('#' + id);
  openSheet.classList.add('show');
  openSheet.querySelector('.sheet-close')?.focus({ preventScroll: true });
}
function closeSheet() {
  if (!openSheet) return;
  openSheet.classList.remove('show');
  openSheet = null;
}
document.addEventListener('click', e => {
  if (openSheet && e.target === openSheet) closeSheet(); // tap outside the panel
});

/* ------------------------------------------------------------- game */
let game = null;
let gameModulePromise = null;

// ?mode=2d forces the 2D canvas race; ?mode=3d disables the automatic fallback (testing)
const RACE_MODE = new URLSearchParams(location.search).get('mode');
let race2d = null, use2d = RACE_MODE === '2d';
const race = () => (use2d ? race2d : game);

function start2D(reason) {
  if (reason) console.info('Race: using 2D canvas version (' + reason + ')');
  use2d = true;
  game?.stop();
  $('#game-loading').classList.remove('show');
  $('#game-canvas').hidden = true;
  $('#game-canvas-2d').hidden = false;
  try {
    race2d ||= window.createRace2D({ root: $('#game-root'), canvas: $('#game-canvas-2d'), onActivity: bumpActivity });
  } catch (err) { // only if even a 2D canvas is impossible
    console.error('2D race failed:', err);
    $('#game-error').classList.add('show');
    return;
  }
  if (state.screen === 'game') race2d.restart();
}

async function startGame() {
  show('game');
  if (use2d) { start2D(); return; }
  const loading = $('#game-loading');
  try {
    if (!game) {
      loading.classList.add('show');
      gameModulePromise ||= window.loadGameModule();
      const mod = await gameModulePromise;
      game = mod.createGame({
        root: $('#game-root'),
        canvas: $('#game-canvas'),
        onActivity: bumpActivity,
        onFallback: RACE_MODE === '3d' ? null : (why) => start2D(why)
      });
    }
    loading.classList.remove('show');
    $('#game-canvas').hidden = false;
    $('#game-canvas-2d').hidden = true;
    if (state.screen !== 'game') return; // user left while loading
    game.restart();
  } catch (err) {
    console.warn('3D race unavailable:', err);
    gameModulePromise = null;
    game = null;
    start2D(/webgl/i.test(String(err && err.message)) ? 'no WebGL' : '3D engine failed to load');
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
const soundBtn = $('#btn-sound');
const paintSound = () => { const m = window.SFX?.muted; soundBtn.classList.toggle('off', !!m); soundBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound'); soundBtn.title = m ? 'Sound off' : 'Sound on'; };
soundBtn.addEventListener('click', () => { window.SFX?.toggleMute(); paintSound(); if (!window.SFX?.muted) window.SFX?.tick(); });
if (!window.SFX) soundBtn.hidden = true; else paintSound();
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
  const limit = state.screen === 'end' ? IDLE_RESET_END_MS : IDLE_RESET_MS;
  if (idle >= limit) { resetAll(); return; }
  if (idle >= limit - IDLE_WARN_BEFORE_MS) {
    if (!idleShown) { idleShown = true; $('#idle-overlay').classList.add('show'); }
    $('#idle-count').textContent = Math.ceil((limit - idle) / 1000);
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
  if (gameModulePromise || use2d) return;
  gameModulePromise = window.loadGameModule();
  gameModulePromise.catch(e => { gameModulePromise = null; console.warn('3D engine prefetch failed (will retry on play):', e); });
}, 1200);

// Expose for automated testing / debugging
window.__app = { state, show, computeTier, get game() { return game; }, get idleMs() { return performance.now() - lastActivity; } };
