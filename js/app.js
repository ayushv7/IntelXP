/* =========================================================================
   app.js — screen flow, quiz, recommendation, comparison, kiosk behaviour
   ========================================================================= */
const DATA = window.PROCESSOR_DATA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ATTRACT_AFTER_MS = 30000;    // landing idle -> silent demo race

const state = {
  screen: 'landing',
  unlocked: false,
  completed: new Set(),
  answers: new Set(),
  tier: DATA.tierOrder[0],
  budget: null,   // max ₹ (Infinity for the top tier)
  result: null    // recommendWithBudget(...)
};
const BUDGET = window.BUDGET_DATA;

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
  if (typeof saveProgress === 'function') saveProgress();
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
  'finish-mini': () => {
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
    show('budget');
  },
  'finish-budget': (btn) => {
    const custom = +$('#budget-input').value.replace(/\D/g, '');
    const budget = custom > 0 ? custom : state.budget;
    if (!(budget > 0)) { shake(btn); $('#budget-msg').textContent = 'Pick a budget or enter an amount.'; return; }
    state.budget = budget;
    state.result = recommendWithBudget([...state.answers], budget);
    const c = state.result.chip;
    state.tier = c.idealFor || computeTier([...state.answers]); // accent + (when the chip matches) specs/compare
    state.model = null;
    renderRecommendation();
    show('rec');
  },
  'back-quiz': () => { closeSheet(); show('quiz'); },
  'back-budget': () => { closeSheet(); show('budget'); },
  compare: () => { closeSheet(); renderComparison(); show('compare'); },
  laptops: () => { closeSheet(); renderLaptops(); show('laptops'); },
  'back-laptops': () => show('laptops'),
  specs: () => showSheet('specs-sheet'),
  sources: () => showSheet('sources-sheet'),
  'close-sheet': () => closeSheet(),
  'back-rec': () => { closeSheet(); show('rec'); },
  end: () => { closeSheet(); renderEnd(); show('end'); window.SFX?.jingle(); },
  restart: () => resetAll()
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

function markComplete(id, quiet = false) {
  state.completed.add(id);
  const wasUnlocked = state.unlocked;
  if (!wasUnlocked && !quiet) setTimeout(() => window.SFX?.unlock(), 350);
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
  state.budget = null; state.result = null;
  $$('.budget-opt').forEach(o => o.setAttribute('aria-pressed', 'false'));
  $('#budget-input').value = ''; $('#budget-msg').textContent = '';
  closeSheet();
  $$('.mission').forEach(m => m.classList.remove('done'));
  $('#btn-next').classList.add('locked');
  const hint = $('#next-hint');
  hint.textContent = 'Complete a mission to unlock';
  hint.classList.remove('ready');
  $$('.quiz-opt').forEach(o => o.setAttribute('aria-pressed', 'false'));
  $('#quiz-msg').textContent = '';
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

function buildBudget() {
  const grid = $('#budget-grid');
  grid.innerHTML = BUDGET.budgetTiers.map(b => `
    <button class="hex-card quiz-opt budget-opt" data-max="${b.max}" aria-pressed="false">
      <span class="qt"><b>${esc(b.label)}</b></span><span class="check" aria-hidden="true"></span>
    </button>`).join('');
  grid.addEventListener('click', e => {
    const opt = e.target.closest('.budget-opt'); if (!opt) return;
    $$('.budget-opt').forEach(o => o.setAttribute('aria-pressed', String(o === opt)));
    state.budget = Number(opt.dataset.max); // "Infinity" -> Infinity
    $('#budget-input').value = ''; $('#budget-msg').textContent = '';
    window.SFX?.tick();
  });
  $('#budget-input').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '');
    if (e.target.value) $$('.budget-opt').forEach(o => o.setAttribute('aria-pressed', 'false'));
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

/* ---- budget-aware pick (pure: data in, result out) */
const PICK_TAGS = { studying: ['student', 'portable'], work: ['business', 'portable'], creation: ['creator', 'oled'], gaming: ['gaming'], entertainment: ['oled', 'big-screen'], browsing: ['portable'] };
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
function recommendWithBudget(picks, budget, data = window.BUDGET_DATA) {
  const chips = Object.entries(data.chips).map(([key, c]) => ({ key, ...c }));
  const idealTier = computeTier(picks);
  const ideal = chips.find(c => c.idealFor === idealTier);
  const byTierDesc = chips.slice().sort((a, b) => b.performanceTier - a.performanceTier);
  const cheapest = chips.reduce((a, b) => (b.minLaptopPrice < a.minLaptopPrice ? b : a));
  const fitting = byTierDesc.filter(c => c.minLaptopPrice <= budget); // best chip that fits, no cap
  const idealFits = budget >= ideal.minLaptopPrice;
  const chip = idealFits ? ideal : (fitting[0] || cheapest);
  const stepUp = !idealFits && chip.performanceTier > ideal.performanceTier && chip.minLaptopPrice <= budget;
  const withinBudget = idealFits || stepUp;
  const tradeOffNote = idealFits ? '' : stepUp ? 'Great news: your budget gets you a step up.' : fitting.length
    ? `Your ideal match is the ${ideal.name}. It starts at about ${inr(ideal.minLaptopPrice)}. This is the best Intel AI laptop chip in your budget.${chip.note ? ' ' + chip.note + '.' : ''}`
    : `Intel AI laptops start at about ${inr(cheapest.minLaptopPrice)}.`;
  const wanted = new Set(picks.flatMap(p => PICK_TAGS[p] || []));
  const score = l => l.tags.filter(t => wanted.has(t)).length;
  const rank = list => list.slice().sort((a, b) => score(b) - score(a) || a.price - b.price);
  const ofChip = k => data.laptops.filter(l => l.chip === k);
  let list = rank(ofChip(chip.key).filter(l => l.price <= budget));
  for (const lower of byTierDesc.filter(c => c.performanceTier < chip.performanceTier && c.minLaptopPrice <= budget)) {
    if (list.length >= 2) break;
    list = list.concat(rank(ofChip(lower.key).filter(l => l.price <= budget)));
  }
  if (!list.length) list = ofChip(chip.key).sort((a, b) => a.price - b.price); // nothing fits: show the cheapest chip's laptops
  const cpuOf = k => data.chips[k].name.replace(/^Intel®\s*/, '').replace(/™/g, '');
  const laptops = list.slice(0, 3).map((l, i) => ({
    brand: l.brand, name: l.name, sku: l.sku, cpu: cpuOf(l.chip), chip: l.chip,
    memory: `${l.ram} / ${l.storage}`, price: inr(l.price), priceValue: l.price, whyItFits: l.whyItFits, where: l.where, hero: i === 0
  }));
  return { chip, idealChip: ideal, withinBudget, tradeOffNote, laptops };
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
  globe:  '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  cam:    '<rect x="2.5" y="6.5" width="14" height="11" rx="2"/><path d="M16.5 10.5l5-3v9l-5-3"/>',
  brush:  '<path d="M20 4l-9 9"/><path d="M11 13c-3-1-6 1-6 4 0 1.5-1 2.5-2 3 4 1 8-.5 8-4z"/><path d="M14 4l6 6"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/><path d="M13 12l5 5"/>',
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

/* ---- chip screen: the processor is the hero */
const AI_FEATS = [
  { ids: ['studying'], icon: 'globe', text: 'Live Captions translate 40+ languages to English', copilot: true },
  { ids: ['work'], icon: 'cam', text: 'Windows Studio Effects: blur, eye contact, voice focus', copilot: true },
  { ids: ['creation'], icon: 'brush', text: 'Cocreator in Paint + AI photo edits, on-device', copilot: true },
  { ids: ['browsing', 'entertainment'], icon: 'cursor', text: 'Click to Do: act on anything on screen', copilot: true },
  { ids: ['gaming'], icon: 'game', text: 'Intel XeSS AI upscaling + frame generation', copilot: false }
];
/** Display data for the current result's chip: its own processors.js entry (chipEntries, or the tier
    whose model matches), plus its comparison. Falls back to the quiz tier when there is no result. */
function curChip() {
  const key = state.result?.chip.key;
  const byKey = key && (DATA.chipEntries?.[key] || Object.values(DATA.processors).find(t => String(t.model) === key));
  const tierKey = byKey && Object.keys(DATA.processors).find(k => DATA.processors[k] === byKey);
  const p = byKey || DATA.processors[state.tier];
  return { p, cmp: DATA.comparisons[key] || DATA.comparisons[tierKey || state.tier] };
}
function specValue(p, re) { return (p.specs.find(x => re.test(x.label)) || {}).value || ''; }
function renderRecommendation() {
  const { p } = curChip(), r = state.result, c = r?.chip;
  const series3 = p.series3 !== false;                 // the battery claim is for Core Ultra Series 3 only
  const copilot = c ? !!c.copilotPlus : true;
  $('#rec-chip-img').src = p.image;
  $('#rec-name').textContent = chipName(p);
  $('#rec-chip-img').alt = `${chipName(p)} illustration`;
  $('.chip-halo').style.setProperty('--chip-accent', p.accent);
  $('#rec-tagline').textContent = p.tagline;            // from the returned chip, never the quiz tier
  $('#rec-tradeoff').hidden = !(r && r.tradeOffNote);
  $('#rec-tradeoff').textContent = r ? r.tradeOffNote : '';
  $('#rec-batt-note').hidden = !series3;
  $('#rec-tiles').hidden = false;
  $('.specs-link').hidden = $('[data-action="compare"]').hidden = false;
  const stats = p.stats ? p.stats.map(([v, l]) => [l, v]) : [['CPU cores', specValue(p, /cores/i)], ['Max turbo', specValue(p, /turbo/i)], ['AI engine (NPU)', specValue(p, /NPU/i)]];
  const tiles = stats.concat(series3 ? [['Battery', '27 hrs*', 'up to ']] : []).filter(([, v]) => v);
  $('#rec-tiles').innerHTML = tiles.map(([l, v, pre]) => `<div class="tile stat-tile" style="--accent:${esc(p.accent)}"><b>${pre ? `<small>${esc(pre)}</small>` : ''}${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
  // "What AI does for you": max 3, from the shopper's picks (order of the list below)
  const feats = AI_FEATS.filter(f => f.ids.some(id => state.answers.has(id)))
    .map(f => f.ids.includes('gaming') && !p.arcB390 ? { ...f, text: 'Smooth everyday gaming with Intel graphics', copilot: false } : f)
    .filter(f => !f.copilot || copilot).slice(0, 3);
  $('#rec-ai').innerHTML = feats.map(f => `<li class="tile" style="--accent:${esc(p.accent)}">${lineIcon(f.icon)}<span>${esc(f.text)}</span></li>`).join('');
  $('.ai-for-you').hidden = !feats.length;
  $('.ai-for-you .fine').hidden = !feats.some(f => f.copilot);
  // tech-specs sheet content
  $('#sheet-title').textContent = `${chipName(p)} · tech specs`;
  $('#sheet-specs').innerHTML = p.specs.map(s => `<div><span>${esc(s.label)}</span><b>${esc(s.value)}</b></div>`).join('');
  $('#sheet-roles').innerHTML = [['CPU', p.roles.cpu], ['GPU', p.roles.gpu], ['NPU', p.roles.npu]]
    .map(([k, v]) => `<div><b>${k}</b><p>${esc(v)}</p></div>`).join('');
  $('#sheet-also').textContent = p.laptop.alsoIn || '';
}

/* ---- laptops screen: hero + up to 2 alternatives; tap to select */
const laptopsFor = p => state.result?.laptops || modelsOf(p);
const modelsOf = p => { const ms = (p.laptop.models || []).slice(); const h = heroOf(p.laptop); return h ? [h, ...ms.filter(m => m !== h)].slice(0, 3) : ms.slice(0, 3); };
const cpuShort = cpu => String(cpu || '').replace(/\s*\(.*\)\s*$/, '');
function renderLaptops() {
  const { p } = curChip(), ms = laptopsFor(p);
  if (!ms.includes(state.model)) state.model = ms[0] || null;
  const chipModel = String(state.result?.chip.key || p.model || '');
  const allThisChip = ms.length && ms.every(m => cpuShort(m.cpu).endsWith(' ' + chipModel));
  // accuracy: only say "this processor" when every listed laptop really has it
  $('#lap-title').textContent = allThisChip ? 'Laptops with this processor' : 'Recommended laptops';
  const batt = p.series3 !== false; // "All-day battery" only on Core Ultra Series 3 chips
  const card = (m, i) => {
    const meta = [m.memory, m.price && `${m.price}*`].filter(Boolean).join(' · ');
    return `<article class="card lap-card" data-k="${i}" aria-roledescription="slide" aria-label="${i + 1} of ${ms.length}" style="--accent:${esc(p.accent)}">
      ${i === 0 && m.hero !== false ? '<span class="chip-pill ribbon">MOST RECOMMENDED</span>' : ''}
      <div class="lap-card-art">${laptopSVG(m.brand, p.accent, { sub: m.name })}</div>
      <b class="lc-name">${esc(m.brand)} ${esc(m.name)}</b>
      <span class="lc-chip">${esc(poweredChip(m.cpu))}</span>
      ${m.whyItFits ? `<span class="lc-why">${esc(m.whyItFits)}</span>` : ''}
      ${meta ? `<span class="lc-meta">${esc(meta)}</span>` : ''}
      ${batt ? '<span class="chip-pill batt-badge">All-day battery</span>' : ''}
    </article>`;
  };
  const row = $('#lap-cards');
  row.innerHTML = ms.map(card).join('');
  $('#lap-dots').innerHTML = ms.length > 1 ? ms.map((_, i) => `<button class="lap-dot" data-k="${i}" aria-label="Laptop ${i + 1} of ${ms.length}"></button>`).join('') : '';
  $('.lap-carousel').classList.toggle('single', ms.length < 2);
  const select = k => {
    if (!ms[k]) return;
    state.model = ms[k];
    $$('.lap-card', row).forEach(c => c.setAttribute('aria-current', String(+c.dataset.k === k)));
    $$('.lap-dot').forEach(d => d.setAttribute('aria-current', String(+d.dataset.k === k)));
    $('.lap-arrow.prev').disabled = k === 0; $('.lap-arrow.next').disabled = k === ms.length - 1;
    window.__app && window.__app.saveProgress?.();
  };
  const goTo = (k, smooth = true) => {
    const c = row.children[k]; if (!c) return;
    row.scrollTo({ left: c.offsetLeft - (row.clientWidth - c.offsetWidth) / 2, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
  };
  // the card snapped to the centre is the selected one
  lapObserver?.disconnect();
  lapObserver = new IntersectionObserver(entries => {
    const best = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (best) select(+best.target.dataset.k);
  }, { root: row, rootMargin: '0px -35% 0px -35%', threshold: [0, .25, .5, .75, 1] });
  $$('.lap-card', row).forEach(c => lapObserver.observe(c));
  $('#lap-dots').onclick = e => { const d = e.target.closest('.lap-dot'); if (d) goTo(+d.dataset.k); };
  row.onclick = e => { const c = e.target.closest('.lap-card'); if (c && +c.dataset.k !== ms.indexOf(state.model)) goTo(+c.dataset.k); }; // tap a peeking card to bring it to the centre
  $('.lap-arrow.prev').onclick = () => goTo(Math.max(0, ms.indexOf(state.model) - 1));
  $('.lap-arrow.next').onclick = () => goTo(Math.min(ms.length - 1, ms.indexOf(state.model) + 1));
  const k0 = Math.max(0, ms.indexOf(state.model));
  select(k0);
  requestAnimationFrame(() => goTo(k0, false));
}
let lapObserver = null;
/* laptops row: mouse wheel scrolls sideways; mouse drag scrolls (touch/trackpad scroll natively) */
{
  const row = $('#lap-cards');
  row.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault(); row.scrollBy({ left: e.deltaY, behavior: 'auto' });
  }, { passive: false });
  let drag = null;
  row.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: row.scrollLeft, moved: false };
    row.classList.add('dragging');
  });
  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true;
    row.scrollLeft = drag.left - dx;
  });
  addEventListener('pointerup', () => {
    if (!drag) return;
    row.classList.remove('dragging'); drag = null; // scroll-snap settles on the nearest card
  });
  row.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') $('.lap-arrow.next').click();
    if (e.key === 'ArrowLeft') $('.lap-arrow.prev').click();
  });
}

function renderComparison() {
  const { p, cmp: c } = curChip();
  const picks = [...state.answers];
  const article = /^[aeiou]|^(AMD|HP|LG|MSI)\b/i.test(c.competitorName) ? 'an' : 'a';
  $('#cmp-title').innerHTML = `${esc(chipName(p))} <span class="vs">vs</span> ${esc(c.competitorName)}`; // chip vs chip

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
    rows.map(({ r, hl }, k) => `<div class="tile cmp-row ${hl ? 'hl' : ''}" style="animation-delay:${k * 60}ms">
        <span class="lbl">${esc(r.label)}${hl ? '<em class="chip-pill tag">Matters to you</em>' : ''}</span>
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
  const { p } = curChip();
  const m = state.model || laptopsFor(p)[0];
  $('#end-art').innerHTML = m ? laptopSVG(m.brand, p.accent, { small: true, sub: m.name }) : laptopSVG(p.laptop.title, p.accent, { small: true });
  $('#end-ask').innerHTML = m ? `Ask for the <b>${esc(m.brand)} ${esc(m.name)}</b>` : `Ask for the <b>${esc(p.laptop.title)}</b>`;
  $('#end-sku').textContent = m ? `SKU ${m.sku} · ${poweredChip(m.cpu)}` : chipName(p);
  $('#end-price').hidden = !(m && m.price);
  $('#end-price').textContent = m && m.price ? `${m.price} · Price seen online in 2026, check today's price in store.` : '';
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('result', state.tier);
  if (m && m.sku) url.searchParams.set('model', m.sku);
  try {
    const qr = window.qrcode(0, 'M'); qr.addData(url.href); qr.make();
    $('#end-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    $('.end-qr').hidden = false;
  } catch { $('.end-qr').hidden = true; }
}

/* ---- phone card from the QR: ?result=<tier>&model=<sku> */
function renderShare(tier, sku) {
  const p = DATA.processors[tier]; if (!p) return false;
  const all = DATA.tierOrder.flatMap(t => DATA.processors[t].laptop.models || [])
    .concat(BUDGET.laptops.map(l => ({ brand: l.brand, name: l.name, sku: l.sku, cpu: BUDGET.chips[l.chip].name.replace(/^Intel®\s*/, '').replace(/™/g, ''), price: inr(l.price) })));
  const m = all.find(x => x.sku === sku) || heroOf(p.laptop);
  $('#share-art').innerHTML = m ? laptopSVG(m.brand, p.accent, { small: true, sub: m.name }) : laptopSVG(p.laptop.title, p.accent, { small: true });
  $('#share-model').textContent = m ? `${m.brand} ${m.name}` : p.laptop.title;
  $('#share-chip').textContent = m ? `${poweredChip(m.cpu)}${m.sku ? ' · SKU ' + m.sku : ''}` : chipName(p);
  $('#share-price').textContent = m && m.price ? `${m.price} · price seen online in 2026` : '';
  return true;
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
  else if (state.screen === 'attract') race2d.demo();
}

const makeGame = mod => mod.createGame({
  root: $('#game-root'),
  canvas: $('#game-canvas'),
  onActivity: bumpActivity,
  onFallback: RACE_MODE === '3d' ? null : (why) => start2D(why)
});

/* ------------------------------------------- attract mode (kiosk) */
let attractTimer = 0, swallowClickUntil = 0;
async function startAttract() {
  if (state.screen !== 'landing') return;
  state.screen = 'attract';
  stopStars();
  $$('.screen.active').forEach(s => s.classList.remove('active'));
  $('#screen-game').classList.add('active');
  document.body.classList.add('attract-on');
  if (window.SFX) window.SFX.silent = true;
  const uniq = ['Intel AI PC', 'Faster AI, on-device', 'All-day battery', 'Works offline', 'AI upscaling for games']; // no laptop names before the quiz
  let k = 0;
  const rot = () => { const el = $('#attract-lap'); el.textContent = uniq[k++ % uniq.length] || ''; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); };
  rot(); clearInterval(attractTimer); attractTimer = setInterval(rot, 2800);
  renderBoard($('#attract-lb'));
  try {
    if (!use2d && !game) { gameModulePromise ||= window.loadGameModule(); game = makeGame(await gameModulePromise); }
  } catch { use2d = true; }
  if (state.screen !== 'attract') return;
  $('#game-canvas').hidden = use2d; $('#game-canvas-2d').hidden = !use2d;
  if (use2d) start2D(); else game.demo();
}
function exitAttract() {
  clearInterval(attractTimer);
  race()?.stop();
  document.body.classList.remove('attract-on');
  if (window.SFX) window.SFX.silent = false;
  state.screen = 'game';
  show('landing');
  lastActivity = performance.now();
}
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, e => {
  if (state.screen !== 'attract') return;
  e.preventDefault(); e.stopPropagation();
  swallowClickUntil = performance.now() + 700; // the tap that wakes the kiosk must not also press ENTER
  exitAttract();
}, { capture: true }));
window.addEventListener('click', e => { if (performance.now() < swallowClickUntil) { e.preventDefault(); e.stopPropagation(); } }, { capture: true });

/* ------------------------------------------ daily leaderboard (local) */
const lbKey = () => { const d = new Date(); return `lb-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function loadBoard() {
  try {
    const key = lbKey();
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('lb-') && k !== key) localStorage.removeItem(k); } // daily reset
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function saveBoard(list) { try { localStorage.setItem(lbKey(), JSON.stringify(list)); } catch {} }
const fmtTime = t => `${t.toFixed(1)}s`;
function renderBoard(el, mark) {
  const top = loadBoard().sort((a, b) => a.t - b.t).slice(0, 5);
  el.innerHTML = top.length ? `<li class="lb-head">TODAY'S TOP 5</li>` + top.map((r, i) => `<li class="${r === mark || (mark && r.id === mark.id) ? 'me' : ''}"><span>${i + 1}</span><b>${esc(r.n)}</b><em>${fmtTime(r.t)}</em></li>`).join('') : '';
  el.hidden = !top.length;
}
document.addEventListener('race-finished', e => {
  const t = e.detail.time, box = $('#res-lb');
  const ini = ['A', 'A', 'A'];
  box.innerHTML = `<div class="lb-entry"><span class="lb-time">YOUR TIME <b>${fmtTime(t)}</b></span>
      <div class="lb-ini">${ini.map((c, i) => `<div class="ini" data-i="${i}"><button data-d="1" aria-label="Next letter">▲</button><b>${c}</b><button data-d="-1" aria-label="Previous letter">▼</button></div>`).join('')}</div>
      <button class="hex-btn hex-sm lb-save">SAVE</button></div>
    <ol class="lb-list" hidden></ol>`;
  const paint = () => $$('.ini b', box).forEach((b, i) => b.textContent = ini[i]);
  let cur = 0;
  box.onclick = ev => {
    const btn = ev.target.closest('button'); if (!btn) return;
    if (btn.classList.contains('lb-save')) {
      const rec = { id: Date.now(), n: ini.join(''), t: Math.round(t * 10) / 10 };
      saveBoard([...loadBoard(), rec]);
      $('.lb-entry', box).remove();
      renderBoard($('.lb-list', box), rec);
      window.SFX?.tick();
      return;
    }
    const i = +btn.closest('.ini').dataset.i; cur = i;
    ini[i] = String.fromCharCode(65 + (ini[i].charCodeAt(0) - 65 + +btn.dataset.d + 26) % 26); paint(); window.SFX?.tick();
  };
  // typed initials on a keyboard kiosk
  box.onkeydown = null;
  const onType = ev => {
    if (!box.isConnected || !$('.lb-entry', box) || !$('#game-results').classList.contains('show')) { removeEventListener('keydown', onType); return; }
    if (/^[a-z]$/i.test(ev.key)) { ini[cur] = ev.key.toUpperCase(); cur = Math.min(2, cur + 1); paint(); }
  };
  addEventListener('keydown', onType);
});

async function startGame() {
  show('game');
  if (use2d) { start2D(); return; }
  const loading = $('#game-loading');
  try {
    if (!game) {
      loading.classList.add('show');
      gameModulePromise ||= window.loadGameModule();
      const mod = await gameModulePromise;
      game = makeGame(mod);
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

/* ------------------------------------------- activity (attract mode only) */
// No inactivity reset: progress is never thrown away. The only idle behaviour is the
// silent attract demo, and only while the landing screen is showing.
let lastActivity = performance.now();
function bumpActivity() { lastActivity = performance.now(); }
['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev =>
  window.addEventListener(ev, bumpActivity, { passive: true, capture: true }));
setInterval(() => {
  if (state.screen !== 'landing') return;
  if (performance.now() - lastActivity >= ATTRACT_AFTER_MS) startAttract();
}, 250);

/* --------------------------------- progress survives an accidental refresh */
const SAVE_KEY = 'aipc-progress';
const RESUMABLE = ['landing', 'select', 'quiz', 'budget', 'rec', 'laptops', 'compare', 'end'];
function saveProgress() {
  if (state.screen === 'share') return;
  try {
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({
      screen: RESUMABLE.includes(state.screen) ? state.screen : 'select', // mid-game -> mission select
      unlocked: state.unlocked, completed: [...state.completed], answers: [...state.answers],
      budget: state.budget === Infinity ? 'Infinity' : state.budget,
      custom: $('#budget-input').value, model: state.model?.sku || null
    }));
  } catch {}
}
function restoreProgress() {
  let d;
  try { d = JSON.parse(sessionStorage.getItem(SAVE_KEY) || 'null'); } catch { return false; }
  if (!d || !RESUMABLE.includes(d.screen) || d.screen === 'landing') return false;
  (d.completed || []).forEach(id => markComplete(id, true));
  state.unlocked = !!d.unlocked;
  (d.answers || []).forEach(id => { state.answers.add(id); $(`.quiz-opt[data-id="${id}"]`)?.setAttribute('aria-pressed', 'true'); });
  if (state.answers.size) $('#quiz-msg').textContent = `${state.answers.size} selected`;
  state.budget = d.budget === 'Infinity' ? Infinity : d.budget;
  $('#budget-input').value = d.custom || '';
  if (!d.custom) $$('.budget-opt').forEach(o => o.setAttribute('aria-pressed', String(Number(o.dataset.max) === state.budget)));
  let screen = d.screen;
  if (['rec', 'laptops', 'compare', 'end'].includes(screen)) {
    if (!(state.budget > 0) || !state.answers.size) screen = state.answers.size ? 'budget' : 'quiz';
    else {
      state.result = recommendWithBudget([...state.answers], state.budget);
      state.tier = state.result.chip.idealFor || computeTier([...state.answers]);
      state.model = state.result.laptops.find(m => m.sku === d.model) || null;
      renderRecommendation();
      if (screen === 'laptops') renderLaptops();
      if (screen === 'compare') renderComparison();
      if (screen === 'end') renderEnd();
    }
  }
  show(screen);
  return true;
}
// save after every interaction that can change progress (clicks, typing a budget)
document.addEventListener('click', () => setTimeout(saveProgress, 0));
document.addEventListener('input', () => setTimeout(saveProgress, 0));

/* ---------------------------------------------- landing pixel visuals */
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
buildBudget();
const SHARE = new URLSearchParams(location.search);
if (SHARE.get('result') && renderShare(SHARE.get('result'), SHARE.get('model'))) {
  document.body.classList.add('share-view');
  show('share');
} else if (!restoreProgress()) startStars();
// Warm the 3D engine download in the background so the race starts fast.
setTimeout(() => {
  if (gameModulePromise || use2d || state.screen === 'share') return;
  gameModulePromise = window.loadGameModule();
  gameModulePromise.catch(e => { gameModulePromise = null; console.warn('3D engine prefetch failed (will retry on play):', e); });
}, 1200);

// Dev only: ?debug=layout loads the overflow checker (window.__layoutCheck)
if (new URLSearchParams(location.search).get('debug') === 'layout') {
  const sc = document.createElement('script'); sc.src = 'js/debug-layout.js'; document.head.appendChild(sc);
}

// Expose for automated testing / debugging
window.__app = { state, show, computeTier, recommendWithBudget, get game() { return game; }, get idleMs() { return performance.now() - lastActivity; }, saveProgress };
