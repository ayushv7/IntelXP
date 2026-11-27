/* =========================================================================
   mini-study.js — LEARNING minigame: "Study" (hostel room, assignment deadline)
   Flow: intro -> drag 3 notes into the web AI -> slow (unlock faster AI)
         -> token limit (₹399 vs ₹0 on the Intel NPU) -> power cut (unlock
         offline AI) -> congratulations. All on-screen text lives in TEXT.
   ========================================================================= */
(() => {
  const TEXT = {
    title: 'STUDY MISSION',
    intro: {
      title: 'Beat the deadline!',
      lines: ['Your assignment is due at midnight.', 'Drag your 3 lecture notes into the AI on your laptop to write the answers.'],
      start: 'START ▶'
    },
    clock: m => `⏰ 11:${String(m).padStart(2, '0')} PM · due 11:59`,
    notes: [['Lecture 1', 'Physics'], ['Lecture 2', 'Chemistry'], ['Lecture 3', 'Maths']],
    dragHint: 'Drag your notes onto the laptop',
    dropHint: 'Drop lecture notes here',
    appName: 'StudyGPT',
    pillOnline: '☁ Web AI · online',
    pillLocal: '◆ Local AI · Intel NPU · ₹0',
    pillOffline: '◆ Offline · on-device AI',
    outTitle: 'Assignment 4 · answers',
    waiting: 'Waiting for your notes…',
    generating: 'Generating answers…',
    answer: 'Q1. A body stays at rest or keeps moving in a straight line unless a force acts on it (Newton\'s first law). ' +
      'Q2. In an exothermic reaction, energy is released as heat, so the surroundings get warmer. ' +
      'Q3. d/dx (x²) = 2x, so the slope of y = x² at x = 3 is 6. ' +
      'Q4. Speed is how fast; velocity is speed with a direction. ' +
      'Q5. Catalysts speed up a reaction without being used up.',
    slow: { title: 'Hmm, this is taking too long…', text: 'Your basic laptop is struggling with AI. Unlock an AI PC feature?', yes: 'UNLOCK FASTER AI ▶' },
    feat1: { name: 'Faster AI processing', sub: 'Intel® Core™ Ultra: CPU + GPU + NPU together' },
    token: {
      banner: 'TOKEN LIMIT REACHED',
      title: 'Out of free AI tokens!',
      text: 'The web AI wants you to pay to continue. How do you want to finish?',
      pay: 'Pay ₹399 for subscription',
      npu: 'Pay ₹0 with Intel NPU',
      wrong: "That's a waste of money! Choose again."
    },
    feat2: { name: 'Free local AI on the NPU', sub: 'No subscription, no token limits' },
    localNote: 'Now answering with a local model on the Intel NPU',
    power: { title: 'Power cut!', text: "The hostel lights are out and the Wi-Fi is down. The online AI can't reach its server.", yes: 'UNLOCK OFFLINE AI ▶' },
    offline: '⚠ No internet connection',
    feat3: { name: 'Offline AI workload', sub: 'Runs on your laptop, no internet needed' },
    labelBasic: 'Basic laptop',
    done: {
      title: 'ASSIGNMENT DONE!',
      lines: ['Submitted before the deadline, on battery, with no internet and no subscription.'],
      features: ['Faster AI processing', 'Free local AI on the Intel NPU', 'Offline AI workload'],
      tryIt: 'Try it: Intel AI Playground, free on-device AI for chat and images.',
      laptop: name => `Get it on the ${name}`
    }
  };

  window.Minis.register('learning', (ctx, kit) => {
    const { esc, clamp } = ctx;
    const hero = ctx.heroOf('everyday');
    const ui = kit.shell({ title: TEXT.title, cls: 'mg-study' });
    ui.scene.innerHTML = `
      <div class="st">
        <canvas class="st-room" aria-hidden="true"></canvas>
        <div class="st-router" aria-hidden="true"><i class="st-wifi"></i><b>WI-FI</b></div>
        <div class="st-clock">${esc(TEXT.clock(40))}</div>
        <div class="st-notes">${TEXT.notes.map(([a, b], i) => `<button class="st-note n${i}" aria-label="${esc(a)} ${esc(b)}"><b>${esc(a)}</b><span>${esc(b)}</span><i></i><i></i><i></i></button>`).join('')}
          <p class="st-hint">${esc(TEXT.dragHint)}</p></div>
        <div class="st-lap">
          <div class="st-lid"><div class="st-screen">
            <div class="app">
              <div class="app-bar"><b>${esc(TEXT.appName)}</b><span class="app-pill">${esc(TEXT.pillOnline)}</span></div>
              <div class="app-body">
                <div class="app-drop"><p>${esc(TEXT.dropHint)}</p><ul class="app-files"></ul></div>
                <div class="app-out"><p class="app-h">${esc(TEXT.outTitle)}</p><p class="app-status">${esc(TEXT.waiting)}</p><p class="app-text"></p></div>
              </div>
              <div class="app-prog"><i></i><span>0%</span></div>
              <div class="app-token">${esc(TEXT.token.banner)}</div>
              <div class="app-offline">${esc(TEXT.offline)}</div>
            </div>
          </div></div>
          <div class="st-base"></div>
          <p class="st-label">${esc(TEXT.labelBasic)}</p>
        </div>
        <div class="st-dark" aria-hidden="true"></div>
      </div>`;
    const $ = s => ui.scene.querySelector(s);
    const st = $('.st'), room = $('.st-room'), g = room.getContext('2d');
    const prog = $('.app-prog i'), pct = $('.app-prog span'), out = $('.app-text'), status = $('.app-status');

    /* ---------------- pixel-art hostel room (canvas, redrawn a few times a second) */
    let dark = false;
    const fit = () => { const r = st.getBoundingClientRect(); room.width = 192; room.height = Math.max(60, Math.round(192 * r.height / Math.max(1, r.width))); };
    const ro = new ResizeObserver(fit); ro.observe(st); ctx.onCleanup(() => ro.disconnect()); fit();
    const stars = Array.from({ length: 18 }, () => [Math.random(), Math.random() * .7]);
    function drawRoom(t) {
      const W = room.width, H = room.height, P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0)); };
      P(0, 0, W, H, '#16224a');
      for (let y = 4; y < H * .7; y += 6) for (let x = (y / 6 % 2) * 6; x < W; x += 12) P(x, y, 11, 1, '#1a2956');   // brick hint
      P(0, H * .78, W, H * .22, '#2a1e3a'); for (let x = 0; x < W; x += 16) P(x, H * .78, 1, H * .22, '#231830');   // floor planks
      // window: night sky + city (city lights go out in the power cut)
      const wx = W * .07, wy = H * .1, ww = W * .26, wh = H * .38;
      P(wx - 2, wy - 2, ww + 4, wh + 4, '#c9d6ee'); P(wx, wy, ww, wh, '#0a1438');
      stars.forEach(([sx, sy], i) => { if ((Math.sin(t * 2 + i) + 1) > .6) P(wx + sx * ww, wy + sy * wh * .6, 1, 1, '#cfe9ff'); });
      P(wx + ww * .72, wy + wh * .12, 4, 4, '#f3f0d8');
      for (let i = 0; i < 6; i++) {
        const bx = wx + i * ww / 6, bh = wh * (.25 + ((i * 37) % 5) * .07);
        P(bx, wy + wh - bh, ww / 6 - 1, bh, '#121b3a');
        if (!dark) for (let k = 2; k < bh - 2; k += 4) if ((i + k) % 3) P(bx + 2, wy + wh - bh + k, 1, 1, '#ffd25e');
      }
      P(wx + ww / 2 - 1, wy, 2, wh, '#c9d6ee'); P(wx, wy + wh / 2 - 1, ww, 2, '#c9d6ee');
      // poster + wall clock
      P(W * .38, H * .12, W * .09, H * .22, '#ff5a5f'); P(W * .39, H * .14, W * .07, H * .1, '#ffd25e'); P(W * .4, H * .27, W * .05, 2, '#16224a');
      const cx = W * .55, cy = H * .18; P(cx - 5, cy - 5, 10, 10, '#e9eef6'); P(cx - .5, cy - 4, 1, 4, '#16224a'); P(cx, cy - .5, 3, 1, '#ff5a5f');
      // shelf (router sits on it, DOM) + books
      P(W * .7, H * .32, W * .2, 2, '#6b4a2b'); ['#3ddc97', '#5ec8ff', '#ff8c42'].forEach((c, i) => P(W * .84 + i * 3, H * .32 - 8, 2, 8, c));
      // bed
      P(W * .74, H * .6, W * .26, H * .2, '#2f5fe0'); P(W * .74, H * .56, W * .26, H * .06, '#5c86ff'); P(W * .76, H * .52, W * .08, H * .06, '#e9eef6');
      // desk
      P(W * .1, H * .69, W * .62, H * .04, '#8a5a32'); P(W * .1, H * .73, W * .62, 2, '#5e3b1f');
      P(W * .12, H * .73, 3, H * .22, '#5e3b1f'); P(W * .69, H * .73, 3, H * .22, '#5e3b1f');
      // desk lamp (cone of light when the power is on)
      const lx = W * .17, ly = H * .5;
      P(lx, ly, 2, H * .19, '#9aa7bf'); P(lx - 5, ly - 3, 11, 4, dark ? '#4a5570' : '#ffd25e');
      if (!dark) { g.fillStyle = 'rgba(255,224,140,.13)'; g.beginPath(); g.moveTo(lx - 5, ly + 1); g.lineTo(lx + 6, ly + 1); g.lineTo(lx + 26, H * .69); g.lineTo(lx - 22, H * .69); g.closePath(); g.fill(); }
    }

    /* ---------------- drag the notes into the web AI */
    let uploaded = 0, phase = 'upload', p = 0, rate = 0, minute = 40, flick = 0;
    const screen = $('.st-screen');
    $$(ui.scene, '.st-note').forEach((el, i) => kit.draggable(el, (r, tap) => {
      if (phase !== 'upload') return false;
      const s = screen.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (!tap && !(cx > s.left && cx < s.right && cy > s.top && cy < s.bottom)) return false;
      // fly into the screen
      const dx = s.left + s.width * .25 - cx, dy = s.top + s.height * .45 - cy;
      el.style.transition = 'transform .45s cubic-bezier(.3,.7,.2,1), opacity .45s';
      el.style.transform = `translate(${dx}px, ${dy}px) scale(.25) rotate(8deg)`; el.style.opacity = '0'; el.classList.add('gone');
      window.SFX?.pop();
      ctx.later(() => {
        $('.app-files').insertAdjacentHTML('beforeend', `<li>📄 ${esc(TEXT.notes[i].join(' · '))}</li>`);
        uploaded++; if (uploaded === 3) begin();
      }, 380);
      return true;
    }));
    function $$(r, s) { return [...r.querySelectorAll(s)]; }

    function begin() {
      phase = 'slow'; rate = .9; $('.st-hint').hidden = true; $('.app-drop').classList.add('full');
      status.textContent = TEXT.generating; window.SFX?.whoosh();
      run();
    }

    async function run() {
      await ctx.wait(3600); if (ctx.dead) return;
      await ui.ask({ title: TEXT.slow.title, text: TEXT.slow.text, choices: [{ label: TEXT.slow.yes }] }); if (ctx.dead) return;
      ui.unlock(TEXT.feat1); rate = 11; phase = 'fast'; st.classList.add('boosted');
      await until(() => p >= 40); if (ctx.dead) return;
      // token limit
      rate = 0; phase = 'token'; st.classList.add('token'); window.SFX?.error();
      await ctx.wait(1800); if (ctx.dead) return;
      await ui.ask({ title: TEXT.token.title, text: TEXT.token.text, tone: 'alert', choices: [{ label: TEXT.token.pay, kind: 'ghost', wrong: TEXT.token.wrong }, { label: TEXT.token.npu }] }); if (ctx.dead) return;
      st.classList.remove('token'); st.classList.add('local');
      $('.app-pill').textContent = TEXT.pillLocal; status.textContent = TEXT.localNote;
      ui.unlock(TEXT.feat2); rate = 11; phase = 'fast';
      await until(() => p >= 75); if (ctx.dead) return;
      // power cut
      rate = 0; phase = 'power'; dark = true; st.classList.add('dark'); window.SFX?.crash(.4);
      await ctx.wait(1400); if (ctx.dead) return;
      await ui.ask({ title: TEXT.power.title, text: TEXT.power.text, tone: 'alert', choices: [{ label: TEXT.power.yes }] }); if (ctx.dead) return;
      st.classList.add('offline-ok'); $('.app-pill').textContent = TEXT.pillOffline;
      ui.unlock(TEXT.feat3); rate = 11; phase = 'fast';
      await until(() => p >= 100); if (ctx.dead) return;
      phase = 'done'; status.textContent = '✓ Assignment submitted';
      await ctx.wait(900); if (ctx.dead) return;
      ui.finish({
        title: TEXT.done.title, lines: TEXT.done.lines, features: TEXT.done.features,
        extraHTML: `${hero ? `<p class="mini-brand">${esc(TEXT.done.laptop(ctx.fullName(hero)))}</p>` : ''}<p class="mini-try">${esc(TEXT.done.tryIt)}</p>`
      });
    }
    const until = cond => new Promise(res => { const chk = () => { if (ctx.dead || cond()) res(); else ctx.later(chk, 80); }; chk(); });

    /* ---------------- loop: progress, typed answers, clock, room */
    let drawT = 0;
    ctx.loop((dt, t) => {
      if (rate > 0) p = Math.min(100, p + rate * dt);
      prog.style.transform = `scaleX(${p / 100})`; pct.textContent = `${Math.floor(p)}%`;
      out.textContent = TEXT.answer.slice(0, Math.floor(TEXT.answer.length * p / 100));
      const m = Math.min(58, 40 + Math.floor(p * .18)); if (m !== minute) { minute = m; $('.st-clock').textContent = TEXT.clock(m); }
      if (phase === 'power') { flick += dt; st.style.setProperty('--flick', Math.random() < .08 ? '.6' : '1'); }
      drawT -= dt; if (drawT <= 0) { drawT = .2; drawRoom(t); }
    });
    ui.intro(TEXT.intro);
  });
})();
