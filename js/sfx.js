/* =========================================================================
   sfx.js — procedural sound effects (Web Audio API; no audio files, no network)
   Audio unlocks on the first tap/key (browser autoplay rules). Mute persists.
   ========================================================================= */
window.SFX = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, noiseBuf = null;
  let muted = (() => { try { return localStorage.getItem('sfx-muted') !== '0'; } catch { return true; } })(); // muted by default
  const VOL = .55;
  let silent = false; // attract mode: no sound, no haptics
  const buzz = ms => { if (!silent && navigator.vibrate) try { navigator.vibrate(ms); } catch {} };

  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : VOL;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    return ctx;
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(e => addEventListener(e, ensure, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => { if (!ctx) return; document.hidden ? ctx.suspend() : ctx.resume(); });

  const live = () => ctx && !muted && !silent && ctx.state === 'running';
  function noise() {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return noiseBuf;
  }
  /** One-shot oscillator with pitch sweep and exponential decay. */
  function tone({ f = 440, f2 = 0, type = 'sine', t = 0, dur = .12, vol = .3, attack = .004 }) {
    if (!live()) return;
    const t0 = ctx.currentTime + t, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + .05);
  }
  /** One-shot filtered noise (impacts, whooshes, paper, sparkle). */
  function hiss({ t = 0, dur = .2, vol = .3, freq = 1200, f2 = 0, q = .8, type = 'lowpass', attack = .004 }) {
    if (!live()) return;
    const t0 = ctx.currentTime + t, s = ctx.createBufferSource(), b = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise(); s.loop = true; b.type = type; b.Q.value = q; b.frequency.setValueAtTime(freq, t0);
    if (f2) b.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    s.connect(b).connect(g).connect(master); s.start(t0, Math.random() * .5); s.stop(t0 + dur + .05);
  }
  const lastAt = {};
  const throttle = (key, ms) => { const n = performance.now(); if (n - (lastAt[key] || 0) < ms) return false; lastAt[key] = n; return true; };

  /* ---------------- continuous loops (engine, tyre skid, train rumble) */
  let eng = null, skidN = null, rumbleN = null;
  function loopNoise(type, freq, q) {
    const s = ctx.createBufferSource(), b = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise(); s.loop = true; b.type = type; b.frequency.value = freq; b.Q.value = q; g.gain.value = 0;
    s.connect(b).connect(g).connect(master); s.start(); return { s, b, g };
  }
  function engine(speed01, boosting, on = true) {
    if (!ctx || ctx.state !== 'running') return;
    if (!eng) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = -1200 + 7; f.type = 'lowpass'; f.Q.value = 2; g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g).connect(master); o1.start(); o2.start();
      eng = { o1, o2, f, g };
    }
    const now = ctx.currentTime, v = Math.max(0, Math.min(1.2, speed01));
    const gear = (v * 5) % 1;                                 // fake gear shifts: rpm climbs then drops
    const rpm = 45 + v * 120 + gear * 55 + (boosting ? 30 : 0);
    eng.o1.frequency.setTargetAtTime(rpm, now, .06); eng.o2.frequency.setTargetAtTime(rpm, now, .06);
    eng.f.frequency.setTargetAtTime(380 + v * 1500 + (boosting ? 900 : 0), now, .08);
    eng.g.gain.setTargetAtTime(on && !muted && !silent ? .05 + v * .05 : 0, now, .1);
  }
  function skid(amount) {
    if (!ctx || ctx.state !== 'running') return;
    if (!skidN) skidN = loopNoise('bandpass', 950, 3);
    skidN.g.gain.setTargetAtTime(!muted && !silent ? Math.max(0, Math.min(1, amount)) * .16 : 0, ctx.currentTime, .05);
  }
  function rumble(amount, tunnel = 0) {
    if (!ctx || ctx.state !== 'running') return;
    if (!rumbleN) rumbleN = loopNoise('lowpass', 160, 1);
    rumbleN.b.frequency.setTargetAtTime(160 + tunnel * 260, ctx.currentTime, .2);
    rumbleN.g.gain.setTargetAtTime(!muted && !silent ? amount * (.12 + tunnel * .1) : 0, ctx.currentTime, .15);
  }
  function stopLoops() { engine(0, false, false); skid(0); rumble(0); }

  /* ---------------- one-shot library */
  const notes = (list, type = 'triangle', step = .08, dur = .22, vol = .14) => list.forEach((f, i) => tone({ f, type, t: i * step, dur, vol }));
  const api = {
    // UI
    click: () => tone({ f: 760, f2: 1180, type: 'square', dur: .05, vol: .06 }),
    tick: () => tone({ f: 1250, type: 'triangle', dur: .035, vol: .07 }),
    error: () => { tone({ f: 200, f2: 140, type: 'sawtooth', dur: .2, vol: .1 }); tone({ f: 150, f2: 110, type: 'square', t: .05, dur: .18, vol: .06 }); },
    unlock: () => notes([523, 659, 784, 1047], 'triangle', .07, .28, .15),
    jingle: () => { notes([523, 659, 784, 1047, 1319], 'triangle', .09, .35, .13); hiss({ t: .35, dur: .6, vol: .05, freq: 6000, type: 'highpass' }); },
    whoosh: () => hiss({ dur: .45, vol: .12, freq: 300, f2: 2600, type: 'bandpass', q: 1.2, attack: .12 }),
    // race
    go: () => { tone({ f: 880, type: 'square', dur: .12, vol: .1 }); tone({ f: 1760, type: 'square', t: .1, dur: .35, vol: .1 }); },
    coin: () => { if (!throttle('coin', 40)) return; buzz(30); tone({ f: 988, type: 'square', dur: .06, vol: .07 }); tone({ f: 1319, type: 'square', t: .055, dur: .16, vol: .07 }); },
    upgrade: (i = 0) => {
      const base = [392, 440, 523][i] || 440;
      [1, 1.25, 1.5, 2, 2.5].forEach((m, k) => tone({ f: base * m, type: 'triangle', t: k * .06, dur: .3, vol: .13 }));
      tone({ f: base / 2, f2: base * 2, type: 'sawtooth', dur: .45, vol: .05 });
      hiss({ t: .1, dur: .7, vol: .06, freq: 5000, type: 'highpass' });
    },
    boost: () => { if (!throttle('boost', 300)) return; hiss({ dur: .5, vol: .16, freq: 400, f2: 3000, type: 'bandpass', q: 1.5, attack: .05 }); },
    crash: (k = 1) => {
      if (!throttle('crash', 120)) return;
      buzz(30);
      k = Math.max(.3, Math.min(1, k));
      tone({ f: 110, f2: 38, type: 'sine', dur: .35, vol: .45 * k });          // body thump
      hiss({ dur: .4, vol: .32 * k, freq: 900, f2: 200, type: 'lowpass' });     // crunch
      hiss({ t: .02, dur: .25, vol: .14 * k, freq: 3400, type: 'bandpass', q: 6 }); // metal
      tone({ f: 1900 + Math.random() * 400, type: 'triangle', t: .03, dur: .3, vol: .05 * k }); // ring
    },
    knock: () => { if (!throttle('knock', 60)) return; tone({ f: 520, f2: 260, type: 'triangle', dur: .09, vol: .14 }); hiss({ dur: .08, vol: .1, freq: 1600, type: 'bandpass', q: 2 }); },
    scrape: () => { if (!throttle('scrape', 90)) return; hiss({ dur: .14, vol: .08, freq: 3600 + Math.random() * 800, type: 'bandpass', q: 5 }); },
    finish: () => { notes([523, 659, 784], 'square', .12, .25, .1); notes([1047], 'square', .4, .7, .12); hiss({ t: .2, dur: 1, vol: .05, freq: 3000, type: 'highpass' }); },
    // minigames
    pop: () => tone({ f: 420, f2: 900, type: 'sine', dur: .1, vol: .14 }),
    sparkle: () => { [1568, 2093, 2637].forEach((f, i) => tone({ f, type: 'sine', t: i * .045, dur: .18, vol: .07 })); },
    paper: () => { if (!throttle('paper', 80)) return; hiss({ dur: .12, vol: .1, freq: 2500, type: 'highpass', attack: .01 }); },
    chime: () => { tone({ f: 1047, type: 'sine', dur: .5, vol: .12 }); tone({ f: 1568, type: 'sine', t: .07, dur: .6, vol: .09 }); },
    type: () => { if (!throttle('type', 55)) return; tone({ f: 1800 + Math.random() * 300, type: 'square', dur: .015, vol: .025 }); },
    shield: () => { tone({ f: 660, f2: 1320, type: 'sine', dur: .35, vol: .12 }); tone({ f: 990, type: 'triangle', t: .12, dur: .5, vol: .08 }); },
    beep: () => tone({ f: 660, f2: 440, type: 'square', dur: .09, vol: .05 }),
    engine, skid, rumble, stopLoops,
    get muted() { return muted; },
    get silent() { return silent; },
    set silent(v) { silent = !!v; if (silent) stopLoops(); },
    get state() { return ctx ? ctx.state : 'none'; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('sfx-muted', muted ? '1' : '0'); } catch {}
      if (ensure()) master.gain.setTargetAtTime(muted ? 0 : VOL, ctx.currentTime, .05);
      return muted;
    }
  };
  return api;
})();
