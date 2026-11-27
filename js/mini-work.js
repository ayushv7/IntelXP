/* =========================================================================
   mini-work.js — WORK minigame (busy metro, inbox sorting with an AI helper)
   Flow: intro -> sort emails (accept/reject the AI's suggestion)
         -> battery drain (AI PC toggle) -> tunnel, no internet (on-device AI)
         -> loud metro (AI noise cancellation) -> congratulations.
   All on-screen text lives in TEXT.
   ========================================================================= */
(() => {
  const TEXT = {
    title: 'WORK MISSION',
    intro: {
      title: 'Clear your inbox on the metro',
      lines: ['The built-in AI suggests if each email is SPAM or IMPORTANT.', 'Tap ACCEPT if it is right, REJECT if it is wrong.'],
      start: 'START ▶'
    },
    appName: 'Mail',
    inbox: 'Inbox', work: 'Work', trash: 'Trash',
    aiSays: 'AI suggests:',
    aiSaysLocal: 'On-device AI suggests:',
    spam: 'SPAM', important: 'IMPORTANT',
    accept: '✓ ACCEPT', reject: '✕ REJECT',
    good: 'Sorted!', bad: 'Oops, wrong folder',
    noNet: 'No connection: online AI suggestions unavailable',
    battery: 'Battery',
    labelBasic: 'Basic laptop',
    labelAI: 'Intel AI PC',
    batt: { title: 'Battery draining fast!', text: 'Your basic laptop runs AI on the CPU and burns through the battery. Switch to an AI PC?', toggle: 'AI PC mode' },
    feat1: { name: 'All-day battery', sub: 'AI runs on the low-power Intel NPU' },
    tunnel: { title: 'Tunnel: no internet!', text: 'The online AI can\'t reach its server, so your work stops. Upgrade to an AI PC?', yes: 'KEEP WORKING OFFLINE ▶' },
    feat2: { name: 'On-device AI, works offline', sub: 'Suggestions keep coming without internet' },
    noise: { title: 'It\'s getting loud!', text: 'More passengers keep boarding and you can\'t concentrate on your call notes. Unlock the third AI PC feature?', yes: 'TURN ON AI NOISE CANCELLATION ▶' },
    feat3: { name: 'AI noise cancellation', sub: 'Runs on the NPU, barely touches the battery' },
    chatter: ['BLAH BLAH', 'HAHA!', 'NEXT STATION…', 'HELLO?? CAN YOU HEAR ME?', '♪♪♪', 'MOVE IN PLEASE!'],
    done: {
      title: 'INBOX ZERO!',
      lines: ['All emails sorted before your stop, with battery to spare.'],
      features: ['All-day battery (AI on the NPU)', 'On-device AI that works offline', 'AI noise cancellation'],
      laptop: name => `Get it on the ${name}`
    },
    // Work emails look professional; spam looks obviously like spam.
    workMails: [
      { from: 'Priya Sharma · Finance', addr: 'priya.sharma@acmecorp.in', subj: 'Q3 budget: please approve by 5 PM', body: 'Hi, the final Q3 numbers are attached. I need your sign-off before the board call.', file: 'Q3_budget.xlsx' },
      { from: 'Rahul Mehta · Client Success', addr: 'rahul.mehta@acmecorp.in', subj: 'Client call moved to 3:30 PM', body: 'The Reliance team asked to move today\'s review. Updated invite attached.', file: 'invite.ics' },
      { from: 'HR Team', addr: 'hr@acmecorp.in', subj: 'Your appraisal meeting: Thursday 11 AM', body: 'Please fill in the self-review form before the meeting.', file: 'self_review.pdf' },
      { from: 'Ananya Iyer · Product', addr: 'ananya.iyer@acmecorp.in', subj: 'Launch deck v4 for your review', body: 'Updated pricing slides and the demo script. Comments by tonight please.', file: 'launch_v4.pptx' },
      { from: 'Vikram Rao · Sales', addr: 'vikram.rao@acmecorp.in', subj: 'Signed contract: order #4471', body: 'Great news, the contract is signed. Sharing the PO for processing.', file: 'PO_4471.pdf' },
      { from: 'IT Helpdesk', addr: 'it-support@acmecorp.in', subj: 'Planned VPN maintenance tonight', body: 'VPN will be down from 11 PM to 1 AM. Save your work before then.', file: '' }
    ],
    spamMails: [
      { from: 'LUCKY DRAW WINNER', addr: 'win@lucky-prizes4u.biz', subj: '🎉🎉 CONGRATULATIONS!!! You WON ₹10,00,000 🎉🎉', body: 'CLICK NOW to claim your prize!!! Offer ends in 5 MINUTES!!!' },
      { from: 'Parcel Service', addr: 'track@p4rcel-deliv.xyz', subj: '📦 YOUR PARCEL IS ON HOLD!!! Pay ₹25 NOW', body: 'Pay a small fee or your parcel will be RETURNED!!! Click here!!!' },
      { from: 'Bank KYC Alert', addr: 'kyc-update@bank-k1c.info', subj: '⚠️ URGENT: Account will be BLOCKED today!!', body: 'Share your OTP and PIN to keep your account active!!!' },
      { from: 'Work From Home $$$', addr: 'rich@easy-money.top', subj: '💰💰 Earn ₹50,000 PER DAY from home!!! 💰💰', body: 'No skills needed!!! 100% GUARANTEED!!! Join NOW!!!' },
      { from: 'Mega Sale', addr: 'deals@fr33-phones.shop', subj: '🔥 FREE SMARTPHONE, only 2 left!!! 🔥', body: 'You have been SELECTED!!! Just pay shipping!!!' },
      { from: 'Miracle Health', addr: 'offer@miracle-pills.club', subj: 'Lose 10 kg in 3 days!!! 😱😱', body: 'Doctors HATE this one trick!!! Buy now, 90% OFF!!!' }
    ]
  };

  window.Minis.register('work', (ctx, kit) => {
    const { esc, clamp, rand } = ctx;
    const hero = ctx.heroOf('pro');
    const ui = kit.shell({ title: TEXT.title, cls: 'mg-work' });
    ui.scene.innerHTML = `
      <div class="wk">
        <canvas class="wk-metro" aria-hidden="true"></canvas>
        <div class="wk-bubbles" aria-hidden="true"></div>
        <div class="wk-batt" aria-label="${esc(TEXT.battery)}"><span class="wk-batt-ico"><i></i></span><span class="wk-batt-nub"></span><b>100%</b></div>
        <div class="wk-lap">
          <div class="wk-lid"><div class="wk-screen">
            <div class="mail">
              <div class="mail-bar"><b>${esc(TEXT.appName)}</b><span class="mail-net"><i class="wk-wifi"></i></span></div>
              <div class="mail-main">
                <nav class="mail-side">
                  <div class="fold"><span>📥</span>${esc(TEXT.inbox)}<em class="n-in">0</em></div>
                  <div class="fold f-work"><span>📁</span>${esc(TEXT.work)}<em class="n-work">0</em></div>
                  <div class="fold f-trash"><span>🗑️</span>${esc(TEXT.trash)}<em class="n-trash">0</em></div>
                </nav>
                <div class="mail-pane">
                  <div class="mail-stack"></div>
                  <div class="mail-ai"><span class="ai-lbl">${esc(TEXT.aiSays)}</span><b class="ai-pick"></b>
                    <button class="mg-btn ok">${esc(TEXT.accept)}</button><button class="mg-btn no">${esc(TEXT.reject)}</button></div>
                  <div class="mail-offline">${esc(TEXT.noNet)}</div>
                  <p class="mail-fb" aria-live="polite"></p>
                </div>
              </div>
            </div>
          </div></div>
          <div class="wk-base"></div>
          <p class="wk-label">${esc(TEXT.labelBasic)}</p>
        </div>
      </div>`;
    const $ = s => ui.scene.querySelector(s);
    const wk = $('.wk'), cv = $('.wk-metro'), g = cv.getContext('2d');
    const stack = $('.mail-stack'), pick = $('.ai-pick'), fb = $('.mail-fb');

    /* ---------------- email queue (AI is right most of the time; sometimes you must REJECT) */
    const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]);
    let queue = [];
    const refill = () => {
      const w = shuffle(TEXT.workMails), s = shuffle(TEXT.spamMails), out = [];
      for (let i = 0; i < 6; i++) out.push({ ...w[i], spam: false }, { ...s[i], spam: true });
      shuffle(out).forEach((m, i) => { m.aiSpam = (i % 5 === 3) ? !m.spam : m.spam; queue.push(m); }); // every 5th suggestion is wrong
    };
    refill();
    const cardHTML = m => m.spam
      ? `<article class="mail-card spam"><header><span class="av">!!</span><div><b>${esc(m.from)}</b><small>${esc(m.addr)}</small></div><em class="tag">⚠ Suspicious</em></header>
          <h4>${esc(m.subj)}</h4><p>${esc(m.body)}</p><span class="cta">CLICK HERE!!!</span></article>`
      : `<article class="mail-card work"><header><span class="av">${esc(m.from.split(/\s/).filter(Boolean).slice(0, 2).map(x => x[0]).join(''))}</span><div><b>${esc(m.from)}</b><small>${esc(m.addr)}</small></div><em class="tag">Work</em></header>
          <h4>${esc(m.subj)}</h4><p>${esc(m.body)}</p>${m.file ? `<span class="file">📎 ${esc(m.file)}</span>` : ''}</article>`;
    function renderStack() {
      if (queue.length < 4) refill();
      stack.innerHTML = queue.slice(0, 3).map((m, i) => `<div class="slot s${i}">${cardHTML(m)}</div>`).reverse().join('');
      const m = queue[0];
      pick.textContent = m.aiSpam ? `🗑️ ${TEXT.spam}` : `📁 ${TEXT.important}`;
      pick.className = 'ai-pick ' + (m.aiSpam ? 'is-spam' : 'is-work');
      $('.n-in').textContent = String(Math.max(0, 10 - sorted));
    }

    /* ---------------- state */
    let sorted = 0, busy = false, batt = 100, drain = 2.4, offline = false, tunnelT = 0, noise = 0, quiet = false, nWork = 0, nTrash = 0;
    let blocked = true, started = false; // dialogs / intro / tunnel without upgrade
    function sort(acceptAI) {
      if (busy || blocked) return;
      const m = queue[0], toSpam = acceptAI ? m.aiSpam : !m.aiSpam, right = toSpam === m.spam;
      busy = true;
      const card = stack.querySelector('.slot.s0'), target = $(toSpam ? '.f-trash' : '.f-work');
      const a = card.getBoundingClientRect(), b = target.getBoundingClientRect();
      card.style.transition = 'transform .5s cubic-bezier(.5,0,.75,0), opacity .5s';
      card.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.08) rotate(${toSpam ? -18 : 10}deg)`;
      card.style.opacity = '.2';
      window.SFX?.[toSpam ? 'paper' : 'whoosh']();
      fb.textContent = right ? TEXT.good : TEXT.bad; fb.className = 'mail-fb ' + (right ? 'good' : 'bad');
      if (!right) window.SFX?.error();
      ctx.later(() => {
        target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump');
        if (toSpam) nTrash++; else nWork++;
        $('.n-work').textContent = nWork; $('.n-trash').textContent = nTrash;
        queue.shift(); sorted++; busy = false; renderStack();
      }, 520);
    }
    $('.mail-ai .ok').addEventListener('click', () => sort(true));
    $('.mail-ai .no').addEventListener('click', () => sort(false));

    async function run() {
      await ui.intro(TEXT.intro); if (ctx.dead) return;
      blocked = false; started = true;
      // 1) battery
      await until(() => batt <= 55); if (ctx.dead) return;
      blocked = true;
      await ui.ask({ title: TEXT.batt.title, text: TEXT.batt.text, tone: 'alert', choices: [{ label: TEXT.batt.toggle, kind: 'toggle' }] }); if (ctx.dead) return;
      drain = .12; ui.unlock(TEXT.feat1); wk.classList.add('ai'); $('.wk-label').textContent = hero ? ctx.fullName(hero) : TEXT.labelAI; blocked = false;
      // 2) tunnel
      await until(() => sorted >= 4 && !busy); if (ctx.dead) return;
      blocked = true; offline = true; tunnelT = 0; wk.classList.add('tunnel', 'nonet'); window.SFX?.beep();
      await ctx.wait(1500); if (ctx.dead) return;
      await ui.ask({ title: TEXT.tunnel.title, text: TEXT.tunnel.text, tone: 'alert', choices: [{ label: TEXT.tunnel.yes }] }); if (ctx.dead) return;
      ui.unlock(TEXT.feat2); wk.classList.remove('nonet'); wk.classList.add('local'); $('.ai-lbl').textContent = TEXT.aiSaysLocal; blocked = false;
      ctx.later(() => { offline = false; wk.classList.remove('tunnel'); }, 6000);
      // 3) noise
      await until(() => sorted >= 7 && !busy); if (ctx.dead) return;
      noise = .01;
      await until(() => noise >= 1); if (ctx.dead) return;
      blocked = true;
      await ui.ask({ title: TEXT.noise.title, text: TEXT.noise.text, tone: 'alert', choices: [{ label: TEXT.noise.yes }] }); if (ctx.dead) return;
      quiet = true; wk.classList.add('quiet'); ui.unlock(TEXT.feat3); blocked = false;
      // finish
      await until(() => sorted >= 10 && !busy); if (ctx.dead) return;
      blocked = true;
      await ctx.wait(500); if (ctx.dead) return;
      ui.finish({ title: TEXT.done.title, lines: TEXT.done.lines, features: TEXT.done.features,
        extraHTML: hero ? `<p class="mini-brand">${esc(TEXT.done.laptop(ctx.fullName(hero)))}</p>` : '' });
    }
    const until = cond => new Promise(res => { const chk = () => { if (ctx.dead || cond()) res(); else ctx.later(chk, 80); }; chk(); });

    /* ---------------- metro (pixel canvas): windows show city or tunnel; passengers board as noise rises */
    const fit = () => { const r = wk.getBoundingClientRect(); cv.width = 192; cv.height = Math.max(60, Math.round(192 * r.height / Math.max(1, r.width))); };
    const ro = new ResizeObserver(fit); ro.observe(wk); ctx.onCleanup(() => ro.disconnect()); fit();
    const people = Array.from({ length: 20 }, (_, i) => ({ x: (i * 37) % 184 + 2, h: rand(.26, .34), c: ['#ff5a5f', '#3ddc97', '#ff8c42', '#9b5de5', '#5ec8ff', '#f7f7f2', '#ffd25e'][i % 7], at: i < 3 ? 0 : (i - 2) / 17 }));
    let scroll = 0;
    function drawMetro(t) {
      const W = cv.width, H = cv.height, P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0)); };
      P(0, 0, W, H, '#cdd6e6');                                // carriage wall
      // rattling carriage: shake grows with the noise (drawn inside the canvas, so layout never moves)
      const j = quiet || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : noise;
      g.setTransform(1, 0, 0, 1, Math.round(rand(-1.5, 1.5) * j), Math.round(rand(-1, 1) * j));
      const wy = H * .1, wh = H * .3;
      for (let k = 0; k < 4; k++) {                              // windows
        const x = 6 + k * (W - 12) / 4, w = (W - 12) / 4 - 6;
        P(x - 1, wy - 1, w + 2, wh + 2, '#7d8aa3');
        if (offline) {
          P(x, wy, w, wh, '#05070d');
          for (let j = 0; j < 3; j++) { const lx = ((scroll * 3 + j * 40 + k * 17) % (w + 30)) - 15; P(x + lx, wy + wh * .45, 10, 1, '#ffd98a'); }
        } else {
          P(x, wy, w, wh, '#7cc6ff');
          for (let j = 0; j < 6; j++) { const bx = ((j * 23 - scroll) % 140 + 140) % 140 - 20, bh = wh * (.35 + (j % 3) * .15); if (bx < w && bx + 12 > 0) P(x + Math.max(0, bx), wy + wh - bh, Math.min(12, w - bx, 12 + bx), bh, '#5a6f99'); }
        }
      }
      P(0, H * .46, W, 2, '#9aa7bf');                             // handrail
      for (let x = 20; x < W; x += 48) P(x, 0, 2, H, '#b8c2d6');  // poles
      P(0, H * .8, W, H * .2, '#5c6680'); P(0, H * .8, W, 1, '#3c4660'); // floor
      for (let x = 4; x < W; x += 36) { P(x, H * .62, 28, H * .1, '#2f5fe0'); P(x, H * .55, 28, H * .07, '#3b6ef0'); } // seats
      const crowd = clamp(noise, 0, 1);
      for (const pp of people) {                                  // passengers
        if (pp.at > crowd + .001 && pp.at > 0) continue;
        const sway = Math.sin(t * 2 + pp.x) * 1, ph = H * pp.h, x = pp.x + sway;
        P(x, H * .8 - ph, 7, ph * .62, pp.c); P(x + 1, H * .8 - ph - 6, 5, 6, '#f1c27d'); P(x + 1, H * .8 - ph * .38, 2, ph * .38, '#2a2e3a'); P(x + 4, H * .8 - ph * .38, 2, ph * .38, '#2a2e3a');
      }
    }

    /* ---------------- loop */
    const drawMetroFrame = t => { drawMetro(t); g.setTransform(1, 0, 0, 1, 0, 0); };
    const bubbles = $('.wk-bubbles');
    let drawT = 0, bubT = 0;
    ctx.loop((dt, t) => {
      if (started) batt = Math.max(15, batt - drain * dt); // idles on the intro page
      const bEl = $('.wk-batt'); bEl.style.setProperty('--b', batt / 100);
      bEl.classList.toggle('low', batt < 30); bEl.classList.toggle('mid', batt >= 30 && batt < 60);
      bEl.querySelector('b').textContent = `${Math.round(batt)}%`;
      scroll += dt * (offline ? 60 : 26);
      if (noise > 0 && !quiet) noise = Math.min(1, noise + dt * .28);
      if (quiet) noise = Math.max(.35, noise);
      wk.style.setProperty('--noise', quiet ? 0 : noise);
      bubT -= dt;
      if (noise > .15 && bubT <= 0) {
        bubT = quiet ? .9 : .45 - noise * .25;
        const b = document.createElement('span'); b.className = 'bub'; b.textContent = TEXT.chatter[(Math.random() * TEXT.chatter.length) | 0];
        b.style.left = rand(2, 82) + '%'; b.style.top = rand(8, 58) + '%'; bubbles.appendChild(b);
        ctx.later(() => b.remove(), 1600);
      }
      window.SFX?.rumble(quiet ? .15 : .35 + noise * .6, offline ? 1 : 0);
      drawT -= dt; if (drawT <= 0) { drawT = 1 / 20; drawMetroFrame(t); }
    });
    renderStack();
    run();
  });
})();
