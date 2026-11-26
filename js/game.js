/* =========================================================================
   game.js — "AI PC Quest" 3D racing minigame (Three.js r160 via CDN)
   -------------------------------------------------------------------------
   Story beats (all PERFORMANCE EFFECTS ARE SIMULATED, time-based, and
   identical on every device; the FPS counter always shows REAL measured
   rendered frames):
     Stage 1  Basic PC   — boxy car, low-res, flat colours, 15–20 FPS cap
     Coin 1   +FPS       — cap removed
     Coin 2   XeSS       — full resolution, rounded car, lighting, shadows,
                           reflections, headlights
     Zone     Congestion — traffic, obstacles, intentional stutter
     Coin 3   Low lag    — stutter removed, bloom / neon / particles
     Finish   Results
   ========================================================================= */
/* Loaded as a classic script so the page also works when opened from disk (file://).
   Three.js itself is fetched from the CDN as an ES module (resolved via the import map). */
window.loadGameModule = async function loadGameModule() {
  const [THREE, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { RoundedBoxGeometry }, { mergeGeometries }] = await Promise.all([
    import('three'),
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
    import('three/addons/geometries/RoundedBoxGeometry.js'),
    import('three/addons/utils/BufferGeometryUtils.js')
  ]);

/* ------------------------------------------------------------ tuning */
const TRACK_LEN = 4000;
const COIN_S = [430, 1250, 2480];         // guaranteed upgrade coins, in order
const CONG_START = 1700, CONG_END = 2900; // congested zone
const ROAD_HALF = 8;                      // 4 lanes x 4 m
const LANES = [-6, -2, 2, 6];
const PLAYER_LIMIT = 7.0;
const V_MAX = 72, V_BOOST = 96, V_CRUISE = 30, V_MIN_BRAKE = 12;
const ACCEL = 15, BRAKE_DECEL = 34, BOOST_ACCEL = 26;
const TUTORIAL_MS = 4000;

const UPGRADES = [
  { name: 'INCREASED FRAME RATE', system: 'BASIC PC + FPS',
    desc: 'Intel Arc graphics render more frames, more smoothly.' },
  { name: 'AI UPSCALING', system: 'AI PC · XeSS',
    desc: 'XeSS uses AI on the GPU to sharpen every frame.' },
  { name: 'REDUCED LAG', system: 'INTEL AI PC',
    desc: 'Hybrid cores keep background tasks off your game.' }
];

/* Auto-quality ladder (only real rendering cost; never touches simulated effects) */
const QUALITY = [
  { name: 'ULTRA',  pr: 1.0,  shadow: 2048, bloomScale: .5 },
  { name: 'HIGH',   pr: .85,  shadow: 1024, bloomScale: .5 },
  { name: 'MEDIUM', pr: .7,   shadow: 1024, bloomScale: .4 },
  { name: 'LOW',    pr: .58,  shadow: 512,  bloomScale: .33 },
  { name: 'MIN',    pr: .48,  shadow: 0,    bloomScale: .25 }
];

/* ---------------------------------------------------------- track math */
function center(s) {
  const k = Math.min(1, Math.max(0, s / 400));
  const ramp = k * k * (3 - 2 * k);
  return ramp * (68 * Math.sin(s / 520) + 22 * Math.sin(s / 170 + 1.3));
}
function slope(s) { return (center(s + .5) - center(s - .5)); }
const _f = { x: 0, z: 0, nx: 1, nz: 0, yaw: 0 };
function frame(s, d = 0, out = _f) {
  const c = slope(s), n = Math.hypot(1, c);
  out.nx = 1 / n; out.nz = c / n;
  out.x = center(s) + d * out.nx;
  out.z = -s + d * out.nz;
  out.yaw = -Math.atan(c);
  return out;
}

/* ------------------------------------------------------------ helpers */
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

/* ====================================================================== */
function createGame({ root, canvas, onActivity = () => {} }) {
  /* ------------------------------------------------------- renderer */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  } catch (e) {
    throw new Error('WebGL unavailable: ' + (e && e.message));
  }
  if (!renderer.getContext()) throw new Error('WebGL unavailable');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, .1, 2400);
  const FOG_BASE = new THREE.Color(0xcfe4f7), FOG_LAG = new THREE.Color(0x9d8fb0);
  scene.fog = new THREE.Fog(FOG_BASE.clone(), 90, 800);
  scene.background = new THREE.Color(0xffe2b8);

  const pmrem = new THREE.PMREMGenerator(renderer);

  /* -------------------------------------------- dual material system */
  const dualList = [];      // {mesh, lo, hi}
  const neonHi = [];        // hi materials whose glow intensifies at stage 4
  function dual(mesh, pair) { dualList.push({ mesh, lo: pair.lo, hi: pair.hi }); mesh.material = pair.lo; return mesh; }
  function M(color, o = {}) {
    const loColor = o.loColor ?? color;
    const lo = o.loBasic
      ? new THREE.MeshBasicMaterial({ color: loColor, map: o.loMap || null, side: o.side || THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1, blending: o.blending || THREE.NormalBlending, depthWrite: o.depthWrite ?? true })
      : new THREE.MeshLambertMaterial({ color: loColor, flatShading: true, side: o.side || THREE.FrontSide });
    let hi;
    if (o.hiBasic) {
      hi = new THREE.MeshBasicMaterial({ color, map: o.map || null, side: o.side || THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1, blending: o.blending || THREE.NormalBlending, depthWrite: o.depthWrite ?? true, toneMapped: o.toneMapped ?? true });
    } else {
      const Ctor = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
      hi = new Ctor({
        color, map: o.map || null, roughness: o.r ?? .6, metalness: o.m ?? .1,
        emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, emissiveMap: o.emap || null,
        side: o.side || THREE.FrontSide, envMapIntensity: o.env ?? .35
      });
      if (o.physical) { hi.clearcoat = o.cc ?? 1; hi.clearcoatRoughness = o.ccr ?? .06; }
    }
    if (o.neon) { hi.userData.baseEI = hi.emissiveIntensity ?? 1; neonHi.push(hi); }
    return { lo, hi };
  }

  /* ----------------------------------------------------------- lights */
  // Stylized golden-hour daylight: warm key sun with soft shadows + sky/ground bounce
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6f8f3c, 1.15);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xfff0d6, 3.4); // the "sun" (name kept for shared code)
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 220 });
  moon.shadow.bias = -.00025; moon.shadow.normalBias = .04;
  scene.add(moon, moon.target);
  const SUN_OFFSET = new THREE.Vector3(48, 62, -46);

  /* ----------------------------------------------- outlines (bold silhouettes) */
  const outlines = []; // only visible in the upgraded (hi) look
  const _olMats = new Map();
  function outlineMat(t) {
    if (_olMats.has(t)) return _olMats.get(t);
    const m = new THREE.MeshBasicMaterial({ color: 0x141a2e, side: THREE.BackSide });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${t.toFixed(3)};`);
    };
    m.customProgramCacheKey = () => 'outline' + t;
    _olMats.set(t, m);
    return m;
  }
  function outline(mesh, t = .035) {
    let o;
    if (mesh.isInstancedMesh) {
      o = new THREE.InstancedMesh(mesh.geometry, outlineMat(t), mesh.count);
      o.instanceMatrix = mesh.instanceMatrix; o.count = mesh.count;
      o.position.copy(mesh.position); o.rotation.copy(mesh.rotation); o.scale.copy(mesh.scale);
      (mesh.parent || scene).add(o);
    } else {
      o = new THREE.Mesh(mesh.geometry, outlineMat(t));
      mesh.add(o);
    }
    o.visible = false; o.frustumCulled = mesh.frustumCulled;
    outlines.push(o);
    return o;
  }

  /* -------------------------------------------- hand-painted textures */
  const hex = h => '#' + h.toString(16).padStart(6, '0');
  function shade(h, k) { // k>0 lighten, k<0 darken
    const c = new THREE.Color(h);
    return k > 0 ? c.lerp(new THREE.Color(0xffffff), k) : c.multiplyScalar(1 + k);
  }
  function brush(g, x, y, rx, ry, rot, col, a) {
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = a; g.fillStyle = col;
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  /** Soft painterly albedo: base colour + layered translucent brush strokes */
  function painted(w, h, base, { strokes = 260, size = .12, light = .22, dark = -.22, stretch = 2.4, repeat = true } = {}) {
    return canvasTex(w, h, g => {
      g.fillStyle = hex(base); g.fillRect(0, 0, w, h);
      for (let i = 0; i < strokes; i++) {
        const k = Math.random() < .5 ? rand(.04, light) : rand(dark, -.03);
        const r = rand(.4, 1) * size * w;
        brush(g, rand(0, w), rand(0, h), r * stretch, r, rand(-.5, .5), '#' + shade(base, k).getHexString(), rand(.08, .22));
      }
    }, { repeat });
  }

  const grassTex = painted(256, 256, 0x5fb83a, { strokes: 420, size: .07, light: .3, dark: -.28, stretch: 2.8 });
  grassTex.repeat.set(160, 160);
  const roadTex = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#4b4f5c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 380; i++) {
      const k = Math.random() < .5 ? rand(.03, .12) : rand(-.16, -.03);
      brush(g, rand(0, w), rand(0, h), rand(8, 22), rand(4, 10), rand(-.3, .3), '#' + shade(0x4b4f5c, k).getHexString(), rand(.1, .25));
    }
    const u = d => (d + 10) / 20 * w;
    // soft darker tyre tracks
    for (const d of [-6, -2, 2, 6]) for (const o of [-1, 1]) { g.globalAlpha = .08; g.fillStyle = '#20232b'; g.fillRect(u(d + o * .9) - 5, 0, 10, h); }
    g.globalAlpha = 1;
    // red / white painted curbs
    for (const [a, b] of [[-10, -8.2], [8.2, 10]]) {
      for (let y = 0; y < h; y += 64) {
        g.fillStyle = (y / 64) % 2 ? '#f4f1ea' : '#e8453c';
        g.fillRect(u(a), y, u(b) - u(a), 64);
      }
    }
    // hand-drawn lane dashes (slightly wobbly, rounded)
    g.fillStyle = '#fbf7ec';
    for (const d of [-4, 0, 4]) {
      g.beginPath(); g.roundRect(u(d) - 3 + rand(-.6, .6), 10, 6, h * .42, 3); g.fill();
    }
    g.fillStyle = '#fbf7ec'; g.fillRect(u(-8.2), 0, 3, h); g.fillRect(u(8.2) - 3, 0, 3, h);
  }, { repeat: true });
  const foliageTex = painted(128, 128, 0x3fae49, { strokes: 220, size: .16, light: .34, dark: -.3, stretch: 1.2 });
  const pineTex = painted(128, 128, 0x2c8a5a, { strokes: 200, size: .12, light: .25, dark: -.3, stretch: 1.6 });
  const barkTex = painted(64, 128, 0x8a5a36, { strokes: 120, size: .1, stretch: .3 });
  const hillTex = painted(256, 256, 0x7cc24b, { strokes: 300, size: .1, light: .25, dark: -.2, stretch: 3 });
  hillTex.repeat.set(4, 2);
  const dotTex = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const coinFaceTex = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w * .4, w * .35, 6, w / 2, w / 2, w / 2);
    gr.addColorStop(0, '#5cc2ff'); gr.addColorStop(1, '#0a5ce6');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#ffd25e'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 7, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff'; g.font = 'bold 56px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = '#0a2f8f'; g.strokeText('AI', w / 2, w / 2 + 3); g.fillText('AI', w / 2, w / 2 + 3);
  });
  const checkerTex = canvasTex(64, 16, (g) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#1b1e2a'; g.fillRect(x * 4, y * 4, 4, 4); }
  });
  checkerTex.magFilter = THREE.NearestFilter;
  const stripeTex = canvasTex(64, 16, (g) => {
    g.fillStyle = '#ff7a1a'; g.fillRect(0, 0, 64, 16);
    g.fillStyle = '#fff6e6'; for (let i = -1; i < 9; i++) { g.beginPath(); g.moveTo(i * 8, 16); g.lineTo(i * 8 + 4, 16); g.lineTo(i * 8 + 12, 0); g.lineTo(i * 8 + 8, 0); g.fill(); }
  });
  function billboardTex(line1, line2, accent) {
    return canvasTex(512, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1f7bff'); gr.addColorStop(1, '#0a3fc2');
      g.fillStyle = gr; g.beginPath(); g.roundRect(0, 0, w, h, 36); g.fill();
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(w * .3, h * .1, w * .5, h * .25, -.1, 0, Math.PI * 2); g.fill();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 40px Arial, sans-serif'; g.fillStyle = '#dff1ff'; g.fillText(line1, w / 2, h * .34);
      g.font = '900 76px Arial, sans-serif'; g.lineWidth = 10; g.strokeStyle = '#0a2470'; g.strokeText(line2, w / 2, h * .66);
      g.fillStyle = accent; g.fillText(line2, w / 2, h * .66);
    });
  }

  /* ------------------------------------------------------------- sky */
  const skyUniforms = {
    top: { value: new THREE.Color(0x2f74ff) }, mid: { value: new THREE.Color(0x7cc4ff) },
    hor: { value: new THREE.Color(0xffe2b8) }, sunDir: { value: SUN_OFFSET.clone().normalize() }
  };
  function skyMaterial() {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; varying vec3 vP;
        void main(){ float h = vP.y;
          vec3 c = mix(hor, mid, smoothstep(-0.02, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.85, h));
          float s = max(dot(normalize(vP), normalize(sunDir)), 0.0);
          c += vec3(1.0, 0.85, 0.55) * (pow(s, 12.0) * 0.35 + smoothstep(0.9965, 0.9985, s) * 1.6);
          if (h < 0.0) c = mix(hor, vec3(0.45,0.62,0.4), smoothstep(0.0, -0.2, h));
          gl_FragColor = vec4(c, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
  }
  const skyGroup = new THREE.Group(); scene.add(skyGroup);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), skyMaterial());
  sky.renderOrder = -10;
  skyGroup.add(sky);
  {
    // distant rolling hills (aerial perspective tint, no fog)
    const tints = [0x86c39a, 0x9fd0ad, 0x78b892];
    tints.forEach((tint, k) => {
      const parts = [];
      for (let i = 0; i < 16; i++) {
        const a = (i + k / 3) / 16 * Math.PI * 2 + rand(-.08, .08), r = 1050 - k * 90;
        const sx = rand(170, 300), sy = rand(70, 160);
        parts.push(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(sx, sy, sx * .7).rotateY(-a).translate(Math.cos(a) * r, -8, Math.sin(a) * r));
      }
      skyGroup.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ color: tint, fog: false })));
    });
    // puffy cartoon clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xc9dcff, emissiveIntensity: .45, fog: false });
    for (let i = 0; i < 14; i++) {
      const parts = [];
      const n = 4 + (Math.random() * 3 | 0);
      for (let j = 0; j < n; j++) {
        const r = rand(18, 34) * (j === 0 ? 1.3 : 1);
        parts.push(new THREE.IcosahedronGeometry(r, 3).scale(1, .72, 1).translate((j - n / 2) * r * .9, rand(-4, 8), rand(-8, 8)));
      }
      const cloud = new THREE.Mesh(mergeGeometries(parts), cloudMat);
      const a = rand(0, Math.PI * 2), r = rand(650, 1000);
      cloud.position.set(Math.cos(a) * r, rand(170, 330), Math.sin(a) * r);
      cloud.lookAt(0, cloud.position.y, 0);
      skyGroup.add(cloud);
    }
  }

  // Sky-coloured environment map => reflections that match the world
  {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMaterial()));
    const groundEnv = new THREE.Mesh(new THREE.CircleGeometry(9.5, 32), new THREE.MeshBasicMaterial({ color: 0x6aa84a }));
    groundEnv.rotation.x = -Math.PI / 2; groundEnv.position.y = -1; envScene.add(groundEnv);
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(.7, 16, 8), new THREE.MeshBasicMaterial({ color: 0xfff2d0 }));
    sunBall.position.copy(SUN_OFFSET).setLength(8.5); envScene.add(sunBall);
    scene.environment = pmrem.fromScene(envScene, .02).texture;
  }

  /* ---------------------------------------------------------- ground */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), null);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.06;
  dual(ground, M(0xffffff, { loColor: 0x6f9a56, map: grassTex, r: .95, m: 0, env: .25 }));
  ground.receiveShadow = true;
  scene.add(ground);

  /* ------------------------------------------------------------ road */
  const S0 = -250, S1 = TRACK_LEN + 700, STEP = 4;
  function ribbon(dL, dR, y0, y1, vertical, vPeriod) {
    const segs = Math.ceil((S1 - S0) / STEP);
    const pos = new Float32Array((segs + 1) * 6), uv = new Float32Array((segs + 1) * 4), idx = [];
    const f = {};
    for (let i = 0; i <= segs; i++) {
      const s = S0 + i * STEP;
      if (vertical) {
        frame(s, dL, f); pos.set([f.x, y0, f.z, f.x, y1, f.z], i * 6);
      } else {
        frame(s, dL, f); const lx = f.x, lz = f.z; frame(s, dR, f);
        pos.set([lx, y0, lz, f.x, y0, f.z], i * 6);
      }
      uv.set([0, s / vPeriod, 1, s / vPeriod], i * 4);
      if (i < segs) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  const road = new THREE.Mesh(ribbon(-10, 10, .03, .03, false, 24), null);
  dual(road, M(0xffffff, { map: roadTex, r: .36, m: .05, env: .7 }));
  dualList[dualList.length - 1].lo = new THREE.MeshLambertMaterial({ map: roadTex, color: 0x9a9a9a, flatShading: true });
  road.material = dualList[dualList.length - 1].lo;
  road.receiveShadow = true;
  scene.add(road);
  // soft dirt shoulder
  for (const [a, b] of [[-13, -10], [10, 13]]) {
    const sh = new THREE.Mesh(ribbon(a, b, .015, .015, false, 10), null);
    dual(sh, M(0xc9a46a, { loColor: 0x8c7a5a, r: .9, env: .2 })); sh.receiveShadow = true; scene.add(sh);
  }
  // low glossy Intel-blue barrier (lights up in the AI PC finale)
  const railPair = M(0x1f6bff, { loColor: 0x3a5aa8, e: 0x39b8ff, ei: .12, r: .25, m: .2, env: 1, physical: true, side: THREE.DoubleSide });
  railPair.hi.userData.baseEI = .12; railPair.hi.userData.boostEI = 1.9; neonHi.push(railPair.hi);
  for (const d of [-10.7, 10.7]) {
    const rail = new THREE.Mesh(ribbon(d, d, .25, .72, true, 10), null);
    dual(rail, railPair); rail.castShadow = true; rail.receiveShadow = true; scene.add(rail);
  }

  /* ------------------------------------------- scenery (kept airy) */
  const dummy = new THREE.Object3D();
  {
    const f = {};
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    // place items with breathing room: clearings + nothing near gates / billboards
    const keepClear = s => [0, CONG_START, TRACK_LEN].some(g => Math.abs(g - s) < 30);
    function scatter(count, dMin, dMax, minGap) {
      const out = []; let tries = 0;
      while (out.length < count && tries++ < count * 20) {
        const s = rand(S0, S1), side = Math.random() < .5 ? -1 : 1, d = side * rand(dMin, dMax);
        if (keepClear(s)) continue;
        if (Math.sin(s / 140) > .55 && Math.abs(d) < dMin + 25) continue; // open meadows every so often
        if (out.some(o => Math.abs(o.s - s) < minGap && Math.abs(o.d - d) < minGap)) continue;
        out.push({ s, d });
      }
      return out;
    }

    // round "lollipop" trees — exaggerated, smooth, outlined
    const round = scatter(170, 16, 70, 9);
    const trunkGeo = new THREE.CylinderGeometry(.35, .6, 1, 10); trunkGeo.translate(0, .5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 3);
    const trunks = new THREE.InstancedMesh(trunkGeo, null, round.length);
    const crowns = new THREE.InstancedMesh(crownGeo, null, round.length);
    dual(trunks, M(0xffffff, { loColor: 0x6b4a33, map: barkTex, r: .9, env: .2 }));
    dual(crowns, M(0xffffff, { loColor: 0x4f8a45, map: foliageTex, r: .8, env: .35 }));
    const crownTint = [0xffffff, 0xd8ffb0, 0xfff1a8, 0xc6f7d0];
    round.forEach((p, i) => {
      frame(p.s, p.d, f);
      const hgt = rand(3.5, 6), cr = rand(2.6, 4.4);
      dummy.position.set(f.x, 0, f.z); dummy.rotation.set(0, rand(0, 6), 0); dummy.scale.set(1, hgt, 1); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = hgt + cr * .7; dummy.scale.set(cr, cr * rand(1.05, 1.35), cr); dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(i, col.setHex(pick(crownTint)));
    });
    trunks.castShadow = crowns.castShadow = true; crowns.receiveShadow = true;
    scene.add(trunks, crowns);
    outline(crowns, .05);

    // tall cartoon pines
    const pines = scatter(110, 20, 80, 10);
    const pineGeo = mergeGeometries([
      new THREE.ConeGeometry(1, 1.3, 14).translate(0, 1.0, 0),
      new THREE.ConeGeometry(.8, 1.1, 14).translate(0, 1.65, 0),
      new THREE.ConeGeometry(.55, .9, 14).translate(0, 2.2, 0),
      new THREE.CylinderGeometry(.18, .25, .5, 8).translate(0, .25, 0)
    ]);
    const pineMesh = new THREE.InstancedMesh(pineGeo, null, pines.length);
    dual(pineMesh, M(0xffffff, { loColor: 0x3d6b4e, map: pineTex, r: .85, env: .3 }));
    pines.forEach((p, i) => {
      frame(p.s, p.d, f);
      const k = rand(3.2, 5.5);
      dummy.position.set(f.x, 0, f.z); dummy.rotation.set(0, rand(0, 6), 0); dummy.scale.set(k, k * rand(1.4, 1.9), k); dummy.updateMatrix();
      pineMesh.setMatrixAt(i, dummy.matrix);
    });
    pineMesh.castShadow = true; scene.add(pineMesh);
    outline(pineMesh, .03);

    // a few big soft hills for depth
    const hills = scatter(46, 85, 260, 70);
    const hillGeo = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const hillMesh = new THREE.InstancedMesh(hillGeo, null, hills.length);
    dual(hillMesh, M(0xffffff, { loColor: 0x6c9a52, map: hillTex, r: .95, env: .25 }));
    hills.forEach((p, i) => {
      frame(p.s, p.d, f);
      const w = rand(40, 90);
      dummy.position.set(f.x, -2, f.z); dummy.rotation.set(0, rand(0, 6), 0); dummy.scale.set(w, rand(14, 34), w * rand(.6, 1)); dummy.updateMatrix();
      hillMesh.setMatrixAt(i, dummy.matrix);
      hillMesh.setColorAt(i, col.setHex(pick([0xffffff, 0xe8ffd0, 0xd9f5c4])));
    });
    hillMesh.receiveShadow = true; scene.add(hillMesh);

    // a handful of billboards (fewer = cleaner)
    const boards = [['INTEL CORE ULTRA', 'AI PC', '#ffd25e'], ['CPU · GPU · NPU', 'TEAMWORK', '#ffffff'], ['AI UPSCALING', 'XeSS', '#ffd25e'],
      ['ON-DEVICE AI', 'NPU', '#ffffff'], ['1 MILLION', 'MINDS', '#ffd25e']];
    const postPair = M(0xf4f1ea, { loColor: 0xb0b0b0, r: .5, m: .3 });
    boards.forEach(([a, b, c], i) => {
      const tex = billboardTex(a, b, c);
      const s = 260 + i * 820, side = i % 2 ? 1 : -1;
      frame(s, side * 17, f);
      const grp = new THREE.Group();
      const panel = new THREE.Mesh(new RoundedBoxGeometry(14, 7, .5, 4, .5), null);
      const pm = M(0xffffff, { loBasic: true, loMap: tex, loColor: 0xaab4c8, map: tex, emap: tex, e: 0xffffff, ei: .35, r: .4, env: .5 });
      dual(panel, pm); panel.position.y = 9; panel.castShadow = true;
      const posts = [-4, 4].map(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.3, .35, 9, 10), null); dual(p, postPair); p.position.set(x, 4.5, -.4); p.castShadow = true; return p; });
      grp.add(panel, ...posts);
      grp.position.set(f.x, 0, f.z); grp.rotation.y = f.yaw - side * .3;
      scene.add(grp);
      outline(panel, .08);
    });
  }

  /* --------------------------------------------- start / finish arches */
  function gate(s, label, color) {
    const f = frame(s, 0, {});
    const g = new THREE.Group();
    const line = new THREE.Mesh(new THREE.PlaneGeometry(16.4, 2.4), null);
    dual(line, M(0xffffff, { loBasic: true, loMap: checkerTex, map: checkerTex, r: .5 }));
    line.rotation.x = -Math.PI / 2; line.position.y = .05;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(12, .85, 20, 64, Math.PI), null);
    dual(arch, M(color, { loColor: color, r: .3, m: .1, env: .8, physical: true }));
    arch.castShadow = true;
    const btex = canvasTex(512, 96, (gg, w, h) => {
      gg.fillStyle = '#ffffff'; gg.beginPath(); gg.roundRect(0, 0, w, h, 40); gg.fill();
      gg.fillStyle = '#10204a'; gg.font = '900 54px Arial'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(label, w / 2, h / 2 + 3);
    });
    const banner = new THREE.Mesh(new RoundedBoxGeometry(13, 2.4, .5, 4, .5), null);
    dual(banner, M(0xffffff, { loBasic: true, loMap: btex, map: btex, emap: btex, e: 0xffffff, ei: .3, r: .5 }));
    banner.position.y = 12.2; banner.castShadow = true;
    g.add(line, arch, banner);
    g.position.set(f.x, 0, f.z); g.rotation.y = f.yaw;
    scene.add(g);
    outline(arch, .06); outline(banner, .08);
  }
  gate(0, 'START', 0x1f6bff);
  gate(CONG_START, 'TRAFFIC AHEAD', 0xff8a3d);
  gate(TRACK_LEN, 'FINISH', 0xffc53d);

  /* -------------------------------------------------------- cars */
  const player = new THREE.Group(); scene.add(player);
  const playerModel = new THREE.Group(); player.add(playerModel);

  // Basic boxy car (stage 1–2): low-poly, flat colours, no outline
  const boxy = new THREE.Group();
  {
    const flat = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, .7, 4.2), flat(0x2f5fe0)); body.position.y = .6;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, .62, 2), flat(0x9fb6d8)); cab.position.set(0, 1.25, .35);
    boxy.add(body, cab);
    const wGeo = new THREE.BoxGeometry(.36, .7, .7), wMat = flat(0x111111);
    for (const [x, z] of [[-.95, -1.35], [.95, -1.35], [-.95, 1.35], [.95, 1.35]]) { const w = new THREE.Mesh(wGeo, wMat); w.position.set(x, .35, z); boxy.add(w); }
    const lMat = flat(0xfff2a0);
    for (const x of [-.65, .65]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.4, .2, .05), lMat); l.position.set(x, .7, -2.12); boxy.add(l); }
    const tMat = flat(0xaa2222);
    for (const x of [-.65, .65]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.4, .2, .05), tMat); l.position.set(x, .7, 2.12); boxy.add(l); }
  }
  playerModel.add(boxy);

  // Upgraded cartoon sports car (stage 3+): chunky, bubbly, big rear wheels, glossy clear-coat
  const premium = new THREE.Group();
  const premiumWheels = [];
  {
    const paint = new THREE.MeshPhysicalMaterial({ color: 0x1a6bff, metalness: .25, roughness: .3, clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 1.35 });
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf6f4ee, metalness: .05, roughness: .35, clearcoat: 1, clearcoatRoughness: .05 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0d1f3d, metalness: .1, roughness: .04, clearcoat: 1, envMapIntensity: 2.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f2c, roughness: .6, metalness: .2 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe9eef6, metalness: 1, roughness: .12, envMapIntensity: 1.6 });
    const head = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff1c9, emissiveIntensity: 1.6 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x5a0010, emissive: 0xff2b4a, emissiveIntensity: 1.3 });
    tail.userData.baseEI = 1.3; tail.userData.boostEI = 3; neonHi.push(tail);

    const bs = new THREE.Shape();
    bs.moveTo(-2.1, .46);
    bs.lineTo(1.9, .46);
    bs.quadraticCurveTo(2.32, .48, 2.26, .72);
    bs.quadraticCurveTo(2.12, .9, 1.4, .94);
    bs.quadraticCurveTo(.8, 1.02, .5, 1.04);
    bs.lineTo(-1.5, 1.08);
    bs.quadraticCurveTo(-2.15, 1.14, -2.2, .94);
    bs.quadraticCurveTo(-2.26, .64, -2.1, .46);
    const bodyGeo = new THREE.ExtrudeGeometry(bs, { depth: 1.42, bevelEnabled: true, bevelThickness: .3, bevelSize: .22, bevelSegments: 8, curveSegments: 24 });
    bodyGeo.translate(0, 0, -.71); bodyGeo.rotateY(Math.PI / 2); bodyGeo.computeVertexNormals();
    const body = new THREE.Mesh(bodyGeo, paint); body.castShadow = true; body.receiveShadow = true;

    const cs = new THREE.Shape();
    cs.moveTo(.72, 1.04);
    cs.quadraticCurveTo(.15, 1.62, -.42, 1.68);
    cs.lineTo(-1.0, 1.66);
    cs.quadraticCurveTo(-1.72, 1.52, -1.92, 1.08);
    cs.lineTo(.72, 1.04);
    const cabGeo = new THREE.ExtrudeGeometry(cs, { depth: .92, bevelEnabled: true, bevelThickness: .18, bevelSize: .14, bevelSegments: 6, curveSegments: 20 });
    cabGeo.translate(0, 0, -.46); cabGeo.rotateY(Math.PI / 2); cabGeo.computeVertexNormals();
    const cab = new THREE.Mesh(cabGeo, glass); cab.castShadow = true;

    // white racing stripe over the roof
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(.34, .06, 1.5, 3, .03), white); stripe.position.set(0, 1.86, -.72); stripe.rotation.x = .06;

    const wing = new THREE.Mesh(new RoundedBoxGeometry(2.3, .12, .55, 3, .05), white); wing.position.set(0, 1.55, 2.1); wing.castShadow = true;
    const posts = [-.62, .62].map(x => { const p = new THREE.Mesh(new RoundedBoxGeometry(.1, .4, .18, 2, .04), dark); p.position.set(x, 1.32, 2.06); return p; });
    const hl = [-.66, .66].map(x => { const m = new THREE.Mesh(new THREE.SphereGeometry(.2, 20, 12).scale(1.4, .8, .5), head); m.position.set(x, .78, -2.42); return m; });
    const tl = [-.62, .62].map(x => { const m = new THREE.Mesh(new RoundedBoxGeometry(.6, .18, .1, 2, .05), tail); m.position.set(x, .98, 2.48); return m; });
    const exhausts = [-.42, .42].map(x => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, .3, 16).rotateX(Math.PI / 2), chrome); m.position.set(x, .42, 2.48); return m; });
    const splitter = new THREE.Mesh(new RoundedBoxGeometry(2.0, .08, .4, 2, .03), dark); splitter.position.set(0, .3, -2.32);
    premium.add(body, cab, stripe, wing, ...posts, ...hl, ...tl, ...exhausts, splitter);
    outline(body, .035); outline(cab, .03); outline(wing, .03);

    // chunky wheels — exaggerated rear tyres
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .6, roughness: .25, envMapIntensity: 1.4 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xffc53d, metalness: .4, roughness: .3 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1f27, roughness: .8 });
    for (const [x, z, r, w] of [[-1.0, -1.45, .46, .42], [1.0, -1.45, .46, .42], [-1.04, 1.38, .56, .52], [1.04, 1.38, .56, .52]]) {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(r * .72, r * .3, 16, 32).rotateY(Math.PI / 2).scale(w * 2.2, 1, 1), tireMat); tire.castShadow = true;
      const rimParts = [new THREE.CylinderGeometry(r * .5, r * .5, w * .7, 24).rotateZ(Math.PI / 2)];
      for (let i = 0; i < 5; i++) rimParts.push(new THREE.BoxGeometry(w * .72, r * .14, r * 1.0).rotateX(i / 5 * Math.PI));
      const rim = new THREE.Mesh(mergeGeometries(rimParts.map(p => p.toNonIndexed())), rimMat);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * .16, r * .16, w * .78, 12).rotateZ(Math.PI / 2), hubMat);
      g.add(tire, rim, hub); g.position.set(x, r, z);
      premium.add(g); premiumWheels.push(g);
      outline(tire, .03);
    }
  }
  premium.visible = false;
  playerModel.add(premium);

  // headlights (always present so the light count never changes => no shader recompiles)
  const headlights = [-.62, .62].map(x => {
    const L = new THREE.SpotLight(0xfff1d0, 0, 50, .45, .6, 1.5);
    L.position.set(x, .8, -2.3);
    L.target.position.set(x * 2, 0, -24);
    player.add(L, L.target);
    return L;
  });
  const HEADLIGHT_ON = 40;

  // Traffic — bubbly toy cars in candy colours
  const trafficCols = [[0xff5a5f, 0xa06a6c], [0xffc93c, 0xa8996a], [0x3ddc97, 0x6f9a86], [0xff8c42, 0xa8866a], [0x9b5de5, 0x85709c], [0xf7f7f2, 0xb5b5b0]];
  const trafficPairs = trafficCols.map(([c, lo]) => M(c, { loColor: lo, r: .32, m: .1, physical: true, env: 1 }));
  const tGlass = M(0x15284d, { loColor: 0x2a3550, r: .05, m: .1, env: 1.8 });
  const tTail = M(0x5a0010, { loBasic: true, loColor: 0xff3344, e: 0xff2b4a, ei: 1.2, neon: true });
  const tWheel = M(0x1c1f27, { loColor: 0x111111, r: .85 });
  const tBodyGeo = new RoundedBoxGeometry(2.1, .95, 4.2, 5, .42);
  const tCabGeo = new RoundedBoxGeometry(1.75, .8, 2.0, 5, .38);
  const tTailGeo = new RoundedBoxGeometry(1.6, .16, .1, 2, .05);
  const tWheelGeo = mergeGeometries([[-.95, -1.35], [.95, -1.35], [-.95, 1.35], [.95, 1.35]].map(([x, z]) => new THREE.CylinderGeometry(.44, .44, .38, 20).rotateZ(Math.PI / 2).translate(x, .44, z)));
  const traffic = [];
  for (let i = 0; i < 24; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(tBodyGeo, null); dual(body, trafficPairs[i % trafficPairs.length]); body.position.y = .86; body.castShadow = true;
    const cab = new THREE.Mesh(tCabGeo, null); dual(cab, tGlass); cab.position.set(0, 1.62, .25); cab.castShadow = true;
    const tl = new THREE.Mesh(tTailGeo, null); dual(tl, tTail); tl.position.set(0, 1.02, 2.12);
    const wh = new THREE.Mesh(tWheelGeo, null); dual(wh, tWheel);
    g.add(body, cab, tl, wh); g.visible = false;
    outline(body, .04); outline(cab, .035);
    scene.add(g);
    traffic.push({ g, active: false, s: 0, d: 0, v: 0, hitCd: 0 });
  }

  // Obstacles — chunky cones & striped rounded barriers
  const coneGeo = mergeGeometries([
    new THREE.ConeGeometry(.42, 1.0, 20).translate(0, .55, 0),
    new THREE.CylinderGeometry(.55, .58, .1, 20).translate(0, .05, 0)
  ]);
  const conePair = M(0xff7a1a, { loColor: 0xc0703a, r: .4, e: 0x3a1500, ei: 1 });
  const barrierGeo = new RoundedBoxGeometry(3.4, 1.05, .6, 3, .2); barrierGeo.translate(0, .55, 0);
  const barrierPair = M(0xffffff, { loColor: 0xc0803a, map: stripeTex, r: .45 });
  const lampPair = M(0x5a2a00, { loBasic: true, loColor: 0xffaa33, e: 0xffa020, ei: 2.2, neon: true });
  const lampGeo = new THREE.SphereGeometry(.16, 12, 8);
  const obstacles = [];

  // Coins — glossy gold (reflect the sky) + guaranteed AI upgrade coins
  const smallCoinGeo = new THREE.CylinderGeometry(.62, .62, .16, 28); smallCoinGeo.rotateX(Math.PI / 2);
  const goldPair = M(0xffc53d, { loColor: 0xd9a93a, m: 1, r: .18, e: 0x5a3a00, ei: .5, env: 1.4 });
  const coins = [];
  const upCoinGeo = new THREE.CylinderGeometry(1.35, 1.35, .3, 48); upCoinGeo.rotateX(Math.PI / 2);
  const upRim = M(0xffc53d, { loColor: 0xd9a93a, m: 1, r: .15, e: 0x6a4500, ei: .8, neon: true, env: 1.5 });
  const upFace = M(0xffffff, { loBasic: true, loMap: coinFaceTex, loColor: 0xffffff, hiBasic: true, map: coinFaceTex, toneMapped: false });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide });
  const upCoins = COIN_S.map((s, i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(upCoinGeo, [upRim.lo, upFace.lo, upFace.lo]);
    dualList.push({ mesh: m, lo: [upRim.lo, upFace.lo, upFace.lo], hi: [upRim.hi, upFace.hi, upFace.hi] });
    m.position.y = 1.9;
    outline(m, .05);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.4, 40, 24, 1, true), beamMat); beam.position.y = 20;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.9, .08, 10, 48), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: .9 }));
    halo.position.y = 1.9;
    g.add(m, beam, halo); scene.add(g);
    return { g, coin: m, halo, s, d: LANES[(i + 1) % 4], taken: false };
  });

  /* ------------------------------------------------------- particles */
  const MAXP = 900;
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 4);
  const pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP), pMax = new Float32Array(MAXP), pBase = new Float32Array(MAXP * 3);
  pPos.fill(-9999);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 4).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .24, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false; scene.add(sparks);
  let pHead = 0, pAlive = 0;
  function spawnP(x, y, z, vx, vy, vz, r, g, b, life) {
    const i = pHead; pHead = (pHead + 1) % MAXP;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pBase[i * 3] = r; pBase[i * 3 + 1] = g; pBase[i * 3 + 2] = b;
    pLife[i] = pMax[i] = life; pAlive = MAXP;
  }
  function burst(x, y, z, n, colors, speed = 10, life = .9) {
    for (let i = 0; i < n; i++) {
      const c = pick(colors), th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI;
      const sp = speed * rand(.3, 1);
      spawnP(x, y, z, Math.sin(ph) * Math.cos(th) * sp, Math.abs(Math.cos(ph)) * sp * .8 + 2, Math.sin(ph) * Math.sin(th) * sp, c[0], c[1], c[2], life * rand(.6, 1.2));
    }
  }
  function updateParticles(dt) {
    if (!pAlive) return;
    for (let i = 0; i < MAXP; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      const i3 = i * 3;
      const i4 = i * 4;
      if (pLife[i] <= 0) { pPos[i3 + 1] = -9999; pCol[i4 + 3] = 0; continue; }
      pVel[i3 + 1] -= 9 * dt;
      pPos[i3] += pVel[i3] * dt; pPos[i3 + 1] = Math.max(.05, pPos[i3 + 1] + pVel[i3 + 1] * dt); pPos[i3 + 2] += pVel[i3 + 2] * dt;
      const k = pLife[i] / pMax[i];
      pCol[i4] = pBase[i3]; pCol[i4 + 1] = pBase[i3 + 1]; pCol[i4 + 2] = pBase[i3 + 2]; pCol[i4 + 3] = Math.min(1, k * 1.6);
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }
  const C_CYAN = [.25, .85, 1], C_GOLD = [1, .78, .2], C_BLUE = [.15, .45, 1], C_WHITE = [1, 1, 1], C_RED = [1, .32, .35], C_PURPLE = [.7, .4, 1];

  // ambient neon dust (stage 4)
  const DUST = 160;
  const dPos = new Float32Array(DUST * 3), dCol = new Float32Array(DUST * 4);
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage));
  dGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 4));
  for (let i = 0; i < DUST; i++) { const c = pick([C_CYAN, C_GOLD, C_WHITE]); dCol.set([...c, .85], i * 4); }
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ size: .32, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
  dust.frustumCulled = false; dust.visible = false; scene.add(dust);
  const dustRel = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) dustRel.set([rand(-40, 40), rand(.3, 14), -1e9], i * 3); // [d, y, s]

  /* ---------------------------------------------- post-processing */
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .45, .22, 1.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ------------------------------------------------------------ HUD */
  const $ = id => root.querySelector('#' + id);
  const hud = {
    system: $('hud-system'), dist: $('hud-dist'), prog: $('hud-progress-bar'), time: $('hud-time'), zone: $('hud-zone'),
    score: $('hud-score'), coins: $('hud-coins'), fps: $('hud-fps'), simtag: $('hud-simtag'), speed: $('hud-speed'),
    accel: $('bar-accel'), brake: $('bar-brake'), fuel: $('bar-fuel'), boost: $('bar-boost'),
    tutorial: $('game-tutorial'), tutBar: $('tutorial-bar'), tutCount: $('tutorial-count'),
    toast: $('upgrade-toast'), toastName: $('ut-name'), toastDesc: $('ut-desc'), zoneToast: $('zone-toast'), go: $('go-text'),
    results: $('game-results'), error: $('game-error'), fpsMode: $('hud-fpsmode'), wipe: $('wipe'), flash: $('flash')
  };
  const slots = [...root.querySelectorAll('.upgrade-slots .slot')];
  const cps = [...root.querySelectorAll('.bar.progress .cp')];
  const hudRoot = $('hud');
  COIN_S.forEach((s, i) => hudRoot.style.setProperty(`--cp${i + 1}`, (s / TRACK_LEN * 100) + '%'));
  const _last = new Map();
  const setText = (el, v) => { if (el && _last.get(el) !== v) { _last.set(el, v); el.textContent = v; } };
  const setW = (el, f) => { const v = (clamp(f, 0, 1) * 100).toFixed(1) + '%'; if (el && _last.get(el) !== v) { _last.set(el, v); el.style.width = v; } };

  const speedo = $('speedo'), sg = speedo && speedo.getContext('2d');
  function drawSpeedo(kmh, boosting) {
    const W = speedo.width, cx = W / 2, cy = W / 2, r = W * .42;
    const a0 = Math.PI * .75, a1 = Math.PI * 2.25, MAXK = 360;
    const f = clamp(kmh / MAXK, 0, 1);
    sg.clearRect(0, 0, W, W);
    sg.lineCap = 'round'; sg.lineWidth = W * .07;
    sg.strokeStyle = 'rgba(255,255,255,.12)';
    sg.beginPath(); sg.arc(cx, cy, r, a0, a1); sg.stroke();
    const grad = sg.createLinearGradient(0, W, W, 0);
    grad.addColorStop(0, '#1f8bff'); grad.addColorStop(.7, '#00e0ff'); grad.addColorStop(1, boosting ? '#d58bff' : '#ffc845');
    sg.strokeStyle = grad;
    if (f > .002) { sg.beginPath(); sg.arc(cx, cy, r, a0, a0 + (a1 - a0) * f); sg.stroke(); }
    sg.lineCap = 'butt'; sg.lineWidth = 2; sg.strokeStyle = 'rgba(255,255,255,.35)';
    for (let k = 0; k <= MAXK; k += 60) {
      const a = a0 + (a1 - a0) * k / MAXK, r1 = r - W * .07, r2 = r1 - W * .04;
      sg.beginPath(); sg.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); sg.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); sg.stroke();
    }
  }

  const mini = $('minimap'), mg = mini && mini.getContext('2d');
  const _m = {};
  function drawMinimap(t) {
    const W = mini.width, H = mini.height;
    mg.clearRect(0, 0, W, H);
    mg.save(); mg.beginPath(); mg.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); mg.clip();
    mg.fillStyle = 'rgba(4,14,34,.55)'; mg.fillRect(0, 0, W, H);
    const pf = frame(P.s, P.d, {});
    const fx = pf.nz, fz = -pf.nx; // forward unit vector along the track
    const rx = pf.nx, rz = pf.nz;
    const sc = H * .6 / 360, ox = W / 2, oy = H * .66;
    const toMap = (x, z) => { const dx = x - pf.x, dz = z - pf.z; return [ox + (dx * rx + dz * rz) * sc, oy - (dx * fx + dz * fz) * sc]; };
    // road
    mg.lineJoin = 'round'; mg.lineCap = 'round';
    mg.beginPath();
    for (let s = P.s - 120; s <= P.s + 520; s += 10) { frame(s, 0, _m); const [x, y] = toMap(_m.x, _m.z); s === P.s - 120 ? mg.moveTo(x, y) : mg.lineTo(x, y); }
    mg.strokeStyle = 'rgba(255,255,255,.85)'; mg.lineWidth = 16 * sc + 4; mg.stroke();
    mg.strokeStyle = '#3a4258'; mg.lineWidth = 16 * sc; mg.stroke();
    // congestion zone overlay
    const zs = Math.max(CONG_START, P.s - 120), ze = Math.min(CONG_END, P.s + 520);
    if (ze > zs) {
      mg.beginPath();
      for (let s = zs; s <= ze; s += 10) { frame(s, 0, _m); const [x, y] = toMap(_m.x, _m.z); s === zs ? mg.moveTo(x, y) : mg.lineTo(x, y); }
      mg.strokeStyle = 'rgba(255,77,109,.45)'; mg.lineWidth = 16 * sc + 2; mg.stroke();
    }
    // finish
    if (TRACK_LEN - P.s < 520) {
      const [x, y] = toMap(frame(TRACK_LEN, -9, _m).x, _m.z), [x2, y2] = toMap(frame(TRACK_LEN, 9, _m).x, _m.z);
      mg.strokeStyle = '#ffc845'; mg.lineWidth = 3; mg.beginPath(); mg.moveTo(x, y); mg.lineTo(x2, y2); mg.stroke();
    }
    const dot = (s, d, col, r) => { if (s < P.s - 120 || s > P.s + 520) return; frame(s, d, _m); const [x, y] = toMap(_m.x, _m.z); mg.fillStyle = col; mg.beginPath(); mg.arc(x, y, r, 0, Math.PI * 2); mg.fill(); };
    for (const c of coins) if (!c.taken) dot(c.s, c.d, '#ffc845', 1.6);
    for (const o of obstacles) if (!o.hit) dot(o.s, o.d, '#ff8a1a', 1.8);
    for (const c of traffic) if (c.active) dot(c.s, c.d, '#ff4d6d', 2.4);
    for (const u of upCoins) if (!u.taken) { dot(u.s, u.d, 'rgba(0,224,255,.35)', 6 + Math.sin(t * 6) * 2); dot(u.s, u.d, '#00e0ff', 3.5); }
    // player
    mg.save(); mg.translate(ox, oy);
    mg.fillStyle = '#ffffff'; mg.shadowColor = '#00e0ff'; mg.shadowBlur = 10;
    mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(5, 5); mg.lineTo(0, 2); mg.lineTo(-5, 5); mg.closePath(); mg.fill();
    mg.restore();
    mg.restore();
  }

  /* ---------------------------------------------------------- state */
  const P = {}; // player state
  let stage = 0, running = false, phase = 'idle'; // idle | tutorial | race | finishing | done
  let raf = 0, lastT = 0, pending = 0, nextCap = 1 / 18, freezeUntil = 0;
  let tutorialStart = 0, finishAt = 0, nextTrafficS = 0;
  let fpsFrames = 0, fpsT0 = 0, fpsShown = 0, lastRendered = false, natTime = 0, natFrames = 0, natT0 = 0;
  let quality = 0, shake = 0, camInit = false, toastTimer = 0, zoneShown = false, nearLagHint = false;
  const keys = { left: false, right: false, gas: false, brake: false, boost: false };
  let viewW = 1, viewH = 1;
  let lastActivityPing = 0;

  function inStutterZone() { return stage < 4 && P.s > CONG_START && P.s < CONG_END; }

  function resetState() {
    Object.assign(P, { s: 0, d: LANES[1], v: 0, steer: 0, throttle: 0, brake: 0, accel: 0, boost: 55, fuel: 100,
      score: 0, coins: 0, ups: 0, hits: 0, time: 0, penalty: 0, hitCd: 0, boosting: false, lastV: 0, roll: 0, pitch: 0 });
    stage = 1; nextTrafficS = 140; freezeUntil = 0; shake = 0; camInit = false; zoneShown = false; nearLagHint = false;
    for (const c of traffic) { c.active = false; c.g.visible = false; }
    // rebuild obstacles & coins (fresh layout every race)
    for (const o of obstacles) scene.remove(o.g);
    obstacles.length = 0;
    for (const c of coins) scene.remove(c.m);
    coins.length = 0;
    buildObstacles(); buildCoins();
    upCoins.forEach((u, i) => { u.taken = false; u.g.visible = true; u.d = LANES[(i + 1) % 4]; u.g.scale.setScalar(1); });
    slots.forEach(s => s.classList.remove('on'));
    cps.forEach(c => c.classList.remove('got'));
    hud.system.classList.remove('ai'); setText(hud.system, 'BASIC PC');
    neonHi.forEach(m => { m.emissiveIntensity = m.userData.baseEI; });
    scene.fog.color.copy(FOG_BASE);
    pLife.fill(0); pPos.fill(-9999); pCol.fill(0);
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    applyVisualStage();
  }

  function buildObstacles() {
    let s = 700;
    while (s < CONG_END - 30) {
      const inZone = s > CONG_START;
      if (s > COIN_S[0] + 80 || inZone) {
        const lane = (Math.random() * 4) | 0;
        const isBarrier = inZone && Math.random() < .55;
        const g = new THREE.Group();
        if (isBarrier) {
          const b = new THREE.Mesh(barrierGeo, null); dual(b, barrierPair); b.castShadow = true; g.add(b);
          for (const x of [-1.4, 1.4]) { const l = new THREE.Mesh(lampGeo, null); dual(l, lampPair); l.position.set(x, 1.12, 0); g.add(l); }
        } else {
          for (const x of [-1.1, 0, 1.1]) { const c = new THREE.Mesh(coneGeo, null); dual(c, conePair); c.castShadow = true; c.position.x = x; g.add(c); }
        }
        const f = frame(s, LANES[lane], {});
        g.position.set(f.x, 0, f.z); g.rotation.y = f.yaw;
        scene.add(g);
        obstacles.push({ g, s, d: LANES[lane], w: 3.4, l: 1.2, hit: false, vy: 0, vx: 0, vz: 0, spin: 0 });
      }
      s += inZone ? rand(55, 85) : rand(170, 260);
    }
  }
  function removeDual(mesh) { const i = dualList.findIndex(p => p.mesh === mesh); if (i >= 0) dualList.splice(i, 1); }
  // keep dualList from growing across restarts
  const _sceneRemove = scene.remove.bind(scene);
  scene.remove = (...objs) => { objs.forEach(o => o.traverse(ch => ch.isMesh && removeDual(ch))); return _sceneRemove(...objs); };

  function buildCoins() {
    let s = 120;
    while (s < TRACK_LEN - 60) {
      const lane = LANES[(Math.random() * 4) | 0];
      const n = 4 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const cs = s + i * 7;
        if (COIN_S.some(u => Math.abs(u - cs) < 25)) continue;
        if (obstacles.some(o => Math.abs(o.s - cs) < 6 && Math.abs(o.d - lane) < 3)) continue;
        const m = new THREE.Mesh(smallCoinGeo, null); dual(m, goldPair);
        const f = frame(cs, lane, {});
        m.position.set(f.x, 1.0, f.z);
        scene.add(m);
        coins.push({ m, s: cs, d: lane, taken: false });
      }
      s += rand(85, 140);
    }
  }

  /* ---------------------------------------------- visual stage logic */
  function applySize() {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    viewW = w; viewH = h;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const pr = stage >= 3
      ? Math.min(devicePixelRatio || 1, 2) * QUALITY[quality].pr
      : clamp(400 / w, .12, 1); // simulated "low resolution": ~400px wide on every device
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    canvas.classList.toggle('pixelated', stage < 3);
  }
  function setMaterials(hi) { for (const p of dualList) p.mesh.material = hi ? p.hi : p.lo; }
  function applyVisualStage() {
    const hi = stage >= 3;
    setMaterials(hi);
    boxy.visible = !hi; premium.visible = hi;
    const sh = hi && QUALITY[quality].shadow > 0;
    if (renderer.shadowMap.enabled !== sh) { renderer.shadowMap.enabled = sh; dualList.forEach(p => [].concat(p.hi).forEach(m => m.needsUpdate = true)); }
    if (sh && moon.shadow.mapSize.x !== QUALITY[quality].shadow) {
      moon.shadow.mapSize.set(QUALITY[quality].shadow, QUALITY[quality].shadow);
      moon.shadow.map?.dispose(); moon.shadow.map = null;
    }
    headlights.forEach(l => { l.intensity = hi ? HEADLIGHT_ON : 0; });
    hemi.intensity = hi ? 1.05 : 1.35;
    moon.intensity = hi ? 3.4 : 2.0;
    scene.fog.near = hi ? 90 : 30; scene.fog.far = hi ? 800 : 420;
    outlines.forEach(o => { o.visible = hi; });
    dust.visible = stage >= 4;
    if (stage >= 4) neonHi.forEach(m => { m.emissiveIntensity = m.userData.boostEI ?? m.userData.baseEI * 1.8; });
    applySize();
  }

  function setQuality(q) {
    q = clamp(q, 0, QUALITY.length - 1);
    if (q === quality) return;
    quality = q;
    applyVisualStage();
  }

  /* ---------------------------------------------------- upgrades */
  function showToast(i) {
    const u = UPGRADES[i];
    hud.toastName.textContent = u.name;
    hud.toastDesc.textContent = u.desc;
    hud.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hud.toast.classList.remove('show'), 2500);
  }
  function collectUpgrade(u) {
    u.taken = true; u.g.visible = false;
    const i = P.ups; P.ups++; P.coins++; P.score += 1000;
    P.boost = Math.min(100, P.boost + 40); P.fuel = Math.min(100, P.fuel + 15);
    slots[i]?.classList.add('on'); retrigger(slots[i], 'pop'); cps[i]?.classList.add('got');
    slowUntil = performance.now() + 400; retrigger(hud.flash, 'go');
    if (i === 1) wipeToSharp();
    setText(hud.system, UPGRADES[i].system);
    if (i === 2) hud.system.classList.add('ai');
    showToast(i);
    const f = frame(u.s, u.d, {});
    burst(f.x, 1.9, f.z, 160, [C_CYAN, C_GOLD, C_WHITE, C_BLUE], 14, 1.2);
    stage = i + 2;
    if (stage === 3) {
      const pf = frame(P.s, P.d, {});
      burst(pf.x, 1, pf.z, 220, [C_CYAN, C_BLUE, C_WHITE], 9, 1.1);
      playerModel.scale.setScalar(.6);
    }
    if (stage === 4) { scene.fog.color.copy(FOG_BASE); hud.zoneToast.classList.remove('show'); freezeUntil = 0; }
    applyVisualStage();
  }

  /* ------------------------------------------------------- traffic */
  function spawnTraffic(dt) {
    while (nextTrafficS < P.s + 340 && nextTrafficS < TRACK_LEN + 100) {
      const s = nextTrafficS;
      const inZone = s > CONG_START && s < CONG_END;
      const nCars = inZone ? (Math.random() < .45 ? 2 : 1) : 1;
      const lanes = [0, 1, 2, 3].sort(() => Math.random() - .5).slice(0, nCars);
      for (const li of lanes) {
        if (COIN_S.some(u => Math.abs(u - s) < 30) && Math.abs(LANES[li] - P.d) < 3) continue;
        const car = traffic.find(c => !c.active);
        if (!car) break;
        car.active = true; car.s = s + rand(-4, 4); car.d = LANES[li]; car.hitCd = 0;
        car.v = (inZone ? 12 : 24) + li * 1.6;
        car.g.visible = true;
      }
      nextTrafficS += inZone ? rand(26, 40) : rand(80, 130);
    }
  }

  /* -------------------------------------------------------- input */
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'boost' };
  function onKey(e) {
    const k = KEYMAP[e.code]; if (!k || !running) return;
    e.preventDefault();
    keys[k] = e.type === 'keydown';
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', () => Object.keys(keys).forEach(k => keys[k] = false));
  root.querySelectorAll('.tc-btn').forEach(btn => {
    const k = btn.dataset.key;
    const on = e => { e.preventDefault(); keys[k] = true; btn.classList.add('held'); btn.setPointerCapture?.(e.pointerId); };
    const off = () => { keys[k] = false; btn.classList.remove('held'); };
    btn.addEventListener('pointerdown', on);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, off));
    btn.addEventListener('contextmenu', e => e.preventDefault());
  });

  /* ------------------------------------------------------- simulation */
  const tmpF = {};
  function step(dt) {
    const racing = phase === 'race';
    const finishing = phase === 'finishing' || phase === 'done';
    // --- longitudinal
    const gas = racing && keys.gas, brk = racing && keys.brake;
    P.throttle = damp(P.throttle, gas ? 1 : 0, 10, dt);
    P.brake = damp(P.brake, (brk || finishing) ? 1 : 0, 12, dt);
    P.boosting = racing && keys.boost && P.boost > 2;
    if (P.boosting) P.boost = Math.max(0, P.boost - 32 * dt); else P.boost = Math.min(100, P.boost + 3.5 * dt);
    const vTop = P.boosting ? V_BOOST : V_MAX;
    let a = 0;
    if (racing) {
      if (gas || P.boosting) a += (P.boosting ? BOOST_ACCEL : ACCEL) * (1 - Math.pow(P.v / vTop, 2.2));
      else if (P.v < V_CRUISE && !brk) a += 9;          // gentle auto-cruise keeps the race moving
      if (brk) a -= BRAKE_DECEL;
      a -= .0016 * P.v * P.v + (P.v > vTop ? (P.v - vTop) * 1.2 : 0);
    } else if (finishing) a = -26;
    P.v = Math.max(racing ? Math.min(P.v, V_MIN_BRAKE) : 0, P.v + a * dt);
    P.accel = damp(P.accel, Math.max(0, a) / BOOST_ACCEL, 6, dt);
    P.s += P.v * dt;
    P.fuel = Math.max(6, P.fuel - (.35 + .55 * P.throttle + (P.boosting ? .8 : 0)) * dt);
    if (racing) { P.time += dt; P.score += P.v * dt * .5; }

    // --- lateral
    const steerIn = racing ? (keys.right ? 1 : 0) - (keys.left ? 1 : 0) : 0;
    P.steer = damp(P.steer, steerIn, 7, dt);
    P.d = clamp(P.d + P.steer * (8 + P.v * .13) * dt, -PLAYER_LIMIT, PLAYER_LIMIT);
    P.hitCd = Math.max(0, P.hitCd - dt);

    // --- traffic
    spawnTraffic(dt);
    for (const c of traffic) {
      if (!c.active) continue;
      c.s += c.v * dt; c.hitCd = Math.max(0, c.hitCd - dt);
      if (c.s < P.s - 40 || c.s > P.s + 700) { c.active = false; c.g.visible = false; continue; }
      if (P.hitCd <= 0 && Math.abs(c.s - P.s) < 4.2 && Math.abs(c.d - P.d) < 1.95) hit(c.s, c.d, c);
    }
    // --- obstacles
    for (const o of obstacles) {
      if (o.hit) {
        if (o.g.visible) {
          o.vy -= 22 * dt; o.g.position.x += o.vx * dt; o.g.position.y = Math.max(0, o.g.position.y + o.vy * dt); o.g.position.z += o.vz * dt;
          o.g.rotation.x += o.spin * dt; o.g.rotation.z += o.spin * .7 * dt;
          if (P.s - o.s > 60) o.g.visible = false;
        }
        continue;
      }
      o.g.visible = Math.abs(o.s - P.s) < 520;
      if (P.hitCd <= 0 && Math.abs(o.s - P.s) < (2.2 + o.l / 2) && Math.abs(o.d - P.d) < (o.w / 2 + .95)) {
        o.hit = true;
        const f = frame(o.s, 0, tmpF);
        o.vy = 9; o.vx = (o.d - P.d >= 0 ? 1 : -1) * 8 * f.nx - f.nz * 0; o.vz = -P.v * .5; o.spin = rand(4, 9);
        hit(o.s, o.d, null);
      }
    }
    // --- coins
    for (const c of coins) {
      if (c.taken) continue;
      const ds = c.s - P.s;
      c.m.visible = ds > -10 && ds < 520;
      if (Math.abs(ds) < 2.6 && Math.abs(c.d - P.d) < 1.9) {
        c.taken = true; c.m.visible = false; P.coins++; P.score += 100;
        P.boost = Math.min(100, P.boost + 12); P.fuel = Math.min(100, P.fuel + 4);
        burst(c.m.position.x, 1, c.m.position.z, 24, [C_GOLD, C_WHITE], 7, .6);
      }
    }
    // --- upgrade coins: guaranteed, in order (they home onto the player)
    const u = upCoins[P.ups];
    if (u && !u.taken) {
      const ds = u.s - P.s;
      if (ds < 90) u.d = damp(u.d, P.d, ds < 30 ? 9 : 2.5, dt);
      if ((Math.abs(ds) < 3.5 && Math.abs(u.d - P.d) < 2.6) || ds < -2) collectUpgrade(u);
    }
    // later coins wait until earlier ones are taken
    for (let i = P.ups + 1; i < upCoins.length; i++) {
      const w = upCoins[i]; if (w.s - P.s < 1) w.s = P.s + 1;
    }

    // --- zone messaging
    if (!zoneShown && stage < 4 && P.s > CONG_START - 10) {
      zoneShown = true;
      hud.zoneToast.innerHTML = '⚠ CONGESTED ZONE<br>BACKGROUND TASKS ARE CAUSING LAG';
      hud.zoneToast.classList.add('show');
      setTimeout(() => hud.zoneToast.classList.remove('show'), 2600);
    }
    if (!nearLagHint && stage < 4 && P.ups === 2 && upCoins[2].s - P.s < 160) {
      nearLagHint = true;
      hud.zoneToast.innerHTML = 'GRAB THE COIN TO<br>REDUCE LAG!';
      hud.zoneToast.classList.add('show');
      setTimeout(() => hud.zoneToast.classList.remove('show'), 2000);
    }
    const lagT = inStutterZone() ? 1 : 0;
    scene.fog.color.lerp(lagT ? FOG_LAG : FOG_BASE, 1 - Math.exp(-dt * 1.5));

    // --- finish
    if (racing && P.s >= TRACK_LEN) {
      phase = 'finishing'; finishAt = performance.now();
      const f = frame(TRACK_LEN, 0, tmpF);
      burst(f.x, 4, f.z, 260, [C_GOLD, C_CYAN, C_WHITE, C_PURPLE], 18, 1.6);
    }
    if (phase === 'finishing' && (P.v < 1 || performance.now() - finishAt > 2600)) showResults();

    // --- particles: exhaust/boost trails
    const pf = frame(P.s, P.d, tmpF);
    const back = 2.4;
    const ex = pf.x - pf.nz * back, ez = pf.z + pf.nx * back; // rear of car (forward = (nz, -nx))
    if (P.boosting || stage >= 4) {
      const rate = P.boosting ? 60 : 14;
      const n = Math.random() < (rate * dt % 1) ? Math.ceil(rate * dt) : Math.floor(rate * dt);
      for (let i = 0; i < n; i++) {
        const side = Math.random() < .5 ? -.55 : .55;
        spawnP(ex + side * pf.nx, .45, ez + side * pf.nz + .2, rand(-1, 1), rand(.5, 2), rand(2, 6), ...(P.boosting ? pick([C_PURPLE, C_CYAN, C_WHITE]) : pick([C_CYAN, C_BLUE])), rand(.25, .5));
      }
    }
    updateParticles(dt);
  }

  function hit(s, d, car) {
    P.hits++; P.hitCd = .9; P.penalty += 1; P.score = Math.max(0, P.score - 150);
    P.v *= .45;
    if (car) { car.v = Math.max(car.v, P.v + 6); car.hitCd = 1; }
    P.d = clamp(P.d + (P.d >= d ? 1 : -1) * 1.2, -PLAYER_LIMIT, PLAYER_LIMIT);
    shake = 1;
    const f = frame(P.s + 2, (P.d + d) / 2, tmpF);
    burst(f.x, .9, f.z, 22, [C_RED, C_GOLD, C_WHITE], 7, .45);
    showMiniToast('+1s  COLLISION');
  }
  let miniTimer = 0;
  function showMiniToast(t) {
    hud.zoneToast.textContent = t; hud.zoneToast.classList.add('show');
    clearTimeout(miniTimer); miniTimer = setTimeout(() => hud.zoneToast.classList.remove('show'), 800);
  }

  /* ---------------------------------------------------- scene sync */
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpV = new THREE.Vector3();
  let orbit = 0;
  function sync(dt, t) {
    const f = frame(P.s, P.d, tmpF);
    player.position.set(f.x, 0, f.z);
    player.rotation.y = f.yaw - P.steer * .08;
    P.roll = damp(P.roll, -P.steer * .05 * Math.min(1, P.v / 40), 8, dt);
    P.pitch = damp(P.pitch, (P.brake * .025) - P.accel * .03, 6, dt);
    playerModel.rotation.set(P.pitch, 0, P.roll);
    playerModel.scale.setScalar(damp(playerModel.scale.x, 1, 7, dt));
    if (P.hitCd > 0) playerModel.visible = Math.floor(P.hitCd * 12) % 2 === 0; else playerModel.visible = true;
    for (const w of premiumWheels) w.rotation.x -= P.v * dt / .37;

    // traffic, coins
    for (const c of traffic) if (c.active) { const tf = frame(c.s, c.d, _m); c.g.position.set(tf.x, 0, tf.z); c.g.rotation.y = tf.yaw; }
    for (const c of coins) if (c.m.visible) c.m.rotation.y = t * 3 + c.s;
    for (const u of upCoins) {
      if (u.taken) continue;
      const uf = frame(u.s, u.d, _m);
      u.g.position.set(uf.x, Math.sin(t * 2.4) * .25, uf.z);
      u.g.rotation.y = uf.yaw;
      u.coin.rotation.y = t * 2.2;
      u.halo.rotation.x = t * 1.3; u.halo.rotation.y = t * 1.9;
    }

    // ambient neon dust (stage 4), anchored in track space
    if (dust.visible) updateDust(dt);

    // camera
    const spd = P.v / V_BOOST;
    const back = 8.6 + spd * 1.6, height = 3.1 + spd * .5;
    const bf = frame(P.s - back, P.d * .85, _m);
    tmpV.set(bf.x, height, bf.z);
    const lf = frame(P.s + 14, P.d * .6, _m);
    const look = new THREE.Vector3(lf.x, 1.1, lf.z);
    if (phase === 'done' || phase === 'finishing') {
      orbit += dt * .35;
      const of = frame(P.s, P.d, _m);
      tmpV.set(of.x + Math.sin(orbit) * 9, 3.2, of.z + Math.cos(orbit) * 9);
      look.set(of.x, .9, of.z);
    }
    if (!camInit) { camPos.copy(tmpV); camLook.copy(look); camInit = true; }
    camPos.x = damp(camPos.x, tmpV.x, 6, dt); camPos.y = damp(camPos.y, tmpV.y, 4, dt); camPos.z = damp(camPos.z, tmpV.z, 12, dt);
    camLook.lerp(look, 1 - Math.exp(-dt * 7));
    shake = Math.max(0, shake - dt * 2.4);
    const sh = shake * shake * .22 + (P.boosting ? .015 : 0);
    camera.position.set(camPos.x + rand(-sh, sh), camPos.y + rand(-sh, sh), camPos.z);
    camera.lookAt(camLook);
    const fov = 60 + spd * 16 + (P.boosting ? 4 : 0);
    if (Math.abs(camera.fov - fov) > .05) { camera.fov = damp(camera.fov, fov, 2.5, dt); camera.updateProjectionMatrix(); }

    // world anchors
    skyGroup.position.set(camera.position.x, 0, camera.position.z);
    ground.position.set(Math.round(camera.position.x / 20) * 20, -.06, Math.round(camera.position.z / 20) * 20);
    const sf = frame(P.s + 16, 0, _m); moon.target.position.set(sf.x, 0, sf.z); moon.position.copy(moon.target.position).add(SUN_OFFSET);
  }

  function updateDust(dt) {
    for (let i = 0; i < DUST; i++) {
      const i3 = i * 3;
      let s = dustRel[i3 + 2];
      if (s < P.s - 15 || s > P.s + 220) { s = P.s + rand(60, 200); dustRel[i3 + 2] = s; dustRel[i3] = (Math.random() < .5 ? -1 : 1) * rand(11, 42); dustRel[i3 + 1] = rand(.5, 16); }
      const f = frame(s, dustRel[i3], _m);
      dPos[i3] = f.x; dPos[i3 + 1] = dustRel[i3 + 1] + Math.sin(s * .1 + i) * .3; dPos[i3 + 2] = f.z;
    }
    dGeo.attributes.position.needsUpdate = true;
  }

  /* --------------------------------------------------------- HUD */
  function updateHUD() {
    setText(hud.speed, String(Math.round(P.v * 3.6)));
    setW(hud.prog, P.s / TRACK_LEN);
    setText(hud.fps, String(fpsShown));
    // the number is always REAL measured FPS; the label says when a simulated limit is in effect
    setText(hud.fpsMode, phase === 'race' && (stage === 1 || inStutterZone()) ? 'SIMULATED' : 'REAL');
  }

  /* ---- coin pickup feedback, before/after snapshots */
  let slowUntil = 0, wantAfterShot = false, shotBefore = false;
  function snap(id) {
    const c = root.querySelector('#' + id); if (!c) return;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = stage >= 3;
    g.drawImage(canvas, 0, 0, c.width, c.height);
  }
  function retrigger(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function wipeToSharp() {
    // freeze the current low-res frame on an overlay, then wipe it away left-to-right over the sharp frame
    const w = hud.wipe; if (!w) return;
    renderer.render(scene, camera);
    w.width = canvas.width; w.height = canvas.height;
    w.getContext('2d').drawImage(canvas, 0, 0);
    retrigger(w, 'run');
  }

  /* ------------------------------------------------------- main loop */
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const realDt = Math.min(.25, (now - lastT) / 1000 || 0);
    lastT = now;
    pending = Math.min(.25, pending + realDt);

    // ---- tutorial countdown (real time)
    if (phase === 'tutorial') {
      const el = now - tutorialStart;
      hud.tutBar.style.width = Math.min(100, el / TUTORIAL_MS * 100) + '%';
      setText(hud.tutCount, `Starting in ${Math.max(1, Math.ceil((TUTORIAL_MS - el) / 1000))}…`);
      if (el >= TUTORIAL_MS) {
        phase = 'race';
        hud.tutorial.classList.remove('show');
        hud.go.classList.remove('show'); void hud.go.offsetWidth; hud.go.classList.add('show');
      }
    }

    // ---- SIMULATED performance effects (time-based, identical on every device)
    let gated = false;
    if (phase !== 'tutorial' && phase !== 'done') {
      if (stage === 1) {                            // 15–20 FPS cap
        if (pending < nextCap) gated = true; else nextCap = 1 / rand(15, 20);
      } else if (inStutterZone() && phase === 'race') {    // intentional stutter
        if (now < freezeUntil) gated = true;
        else if (Math.random() < pending * 1.6) { freezeUntil = now + rand(110, 300); gated = true; }
        else if (Math.random() < .25) gated = true;  // uneven frame pacing
      }
    }
    if (gated) { lastRendered = false; return; }

    const dt = pending; pending = 0;
    // held touch controls emit no new DOM events: keep the kiosk idle timer alive while driving
    if (phase === 'race' && (keys.gas || keys.brake || keys.left || keys.right || keys.boost) && now - lastActivityPing > 1000) {
      lastActivityPing = now; onActivity();
    }
    let rem = now < slowUntil ? dt * .25 : dt; // 0.4 s slow-mo on upgrade pickup
    while (rem > 1e-6) { const h = Math.min(rem, 1 / 120); step(h); rem -= h; }
    const t = now / 1000;
    sync(dt, t);

    // ---- automatic REAL quality scaling (before rendering, so a resize never shows a blank frame)
    if (lastRendered && stage >= 3 && !inStutterZone() && phase === 'race') {
      natTime += realDt; natFrames++;
      if (now - natT0 > 2000) {
        const natFps = natFrames / Math.max(.001, natTime);
        if (natFps < 50 && quality < QUALITY.length - 1) setQuality(quality + 1);
        natTime = 0; natFrames = 0; natT0 = now;
      }
    } else { natT0 = now; natTime = 0; natFrames = 0; }
    if (stage >= 4) composer.render(dt); else renderer.render(scene, camera);
    updateHUD();
    if (!shotBefore && stage === 1 && phase === 'race' && P.time > 1.2) { shotBefore = true; snap('res-before'); }
    if (wantAfterShot) { wantAfterShot = false; snap('res-after'); hud.results.classList.add('show'); }

    // ---- REAL fps measurement (rendered frames / second)
    fpsFrames++;
    if (now - fpsT0 >= 500) { fpsShown = Math.round(fpsFrames * 1000 / (now - fpsT0)); fpsFrames = 0; fpsT0 = now; }

    lastRendered = true;
  }

  function showResults() {
    if (phase === 'done') return;
    phase = 'done';
    wantAfterShot = true; // captured right after the next render, then the card opens
  }

  /* ------------------------------------------------------ public API */
  function warmUp() {
    // pre-compile hi-quality shaders + post-processing so upgrades don't hitch
    try {
      stage = 4; applyVisualStage(); sync(0.016, 0); composer.render(0.016);
      stage = 3; applyVisualStage(); renderer.render(scene, camera);
      stage = 1; applyVisualStage(); renderer.render(scene, camera);
    } catch (e) { console.warn('Warm-up skipped:', e); }
  }

  function restart() {
    hud.results.classList.remove('show');
    hud.error.classList.remove('show');
    hud.toast.classList.remove('show');
    hud.zoneToast.classList.remove('show');
    Object.keys(keys).forEach(k => keys[k] = false);
    root.querySelectorAll('.tc-btn.held').forEach(b => b.classList.remove('held'));
    resetState();
    shotBefore = false; wantAfterShot = false; slowUntil = 0; hud.wipe?.classList.remove('run');
    phase = 'tutorial'; tutorialStart = performance.now(); orbit = 0;
    hud.tutorial.classList.add('show');
    hud.tutBar.style.width = '0%';
    running = true;
    pending = 0; lastT = performance.now(); fpsT0 = lastT; fpsFrames = 0; fpsShown = 0; natT0 = lastT; lastRendered = false;
    sync(0.016, lastT / 1000); camInit = false; sync(0.016, lastT / 1000);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false; phase = 'idle';
    cancelAnimationFrame(raf); raf = 0;
    Object.keys(keys).forEach(k => keys[k] = false);
    hud.tutorial.classList.remove('show');
    hud.results.classList.remove('show');
    hud.toast.classList.remove('show');
    hud.zoneToast.classList.remove('show');
  }

  const ro = new ResizeObserver(() => { if (running) applySize(); });
  ro.observe(root);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); hud.error.classList.add('show'); });

  resetState();
  warmUp();

  const api = {
    restart, stop,
    get debug() { return { P, stage, phase, quality, fps: fpsShown, upgrades: P.ups, keys: { ...keys } }; },
    _jump(s) { P.s = s; nextTrafficS = Math.max(nextTrafficS, s + 60); }
  };
  window.__game = api;
  return api;
}

  return { createGame };
};
