/* boosthint.js — "Press SHIFT to BOOST" coaching hint, shared by the 3D and 2D races.
   Shows when boost is ready, the player hasn't boosted for 5 s and the road is straight;
   hides once they boost; at most 3 times per race. Silent, fades in/out. */
window.createBoostHint = function (root) {
  const el = root.querySelector('#boost-hint'), btn = root.querySelector('.tc-boost');
  if (!el) return { reset() {}, update() {} };
  const text = el.querySelector('.bh-text'), key = el.querySelector('.bh-key');
  let shown = 0, on = false, since = 0, lastBoost = 0;
  const touch = () => document.body.classList.contains('touch');
  function show(now) {
    on = true; since = now; shown++;
    const t = touch();
    text.textContent = t ? 'Tap BOOST' : 'Press SHIFT to BOOST';
    key.hidden = t; el.classList.toggle('touch', t); el.classList.add('show');
    if (t) btn?.classList.add('hint');
  }
  function hide() { on = false; el.classList.remove('show'); btn?.classList.remove('hint'); }
  return {
    reset(now = performance.now()) { shown = 0; lastBoost = now; hide(); },
    update(now, { racing, boosting, boostReady, straight }) {
      if (!racing || boosting) { lastBoost = now; if (on) hide(); return; }
      if (on) { if (now - since > 6000 || (!straight && now - since > 1500)) hide(); return; }
      if (shown < 3 && boostReady && straight && now - lastBoost > 5000) show(now);
    },
    get count() { return shown; }, get visible() { return on; }
  };
};
