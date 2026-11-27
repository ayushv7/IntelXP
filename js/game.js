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
  const [THREE, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }, { RoundedBoxGeometry }, { mergeGeometries }] = await Promise.all([
    import('three'),
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
    import('three/addons/postprocessing/ShaderPass.js'),
    import('three/addons/geometries/RoundedBoxGeometry.js'),
    import('three/addons/utils/BufferGeometryUtils.js')
  ]);

/* ------------------------------------------------------------ tuning */
const TRACK_LEN = 4000;
const COIN_S = [430, 1250, 2480];         // guaranteed upgrade coins, in order
const CONG_START = 1700, CONG_END = 2900; // congested zone
const ROAD_HALF = 8;                      // 4 lanes x 4 m
const LANES = [-6, -2, 2, 6];
const PLAYER_LIMIT = 9.0; // car centre limit; the guard rail sits just beyond
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
/* Real auto-quality ladder: costly effects go first (live reflections, then
   ambient animation/particles), resolution and shadows last. cube = update the
   reflection cube every N frames (0 = static sky env), fx = 2 all / 1 most / 0 minimal. */
const QUALITY = [
  { name: 'ULTRA',  pr: 1.0,  shadow: 2048, cube: 2, cubeRes: 256, fx: 2 },
  { name: 'HIGH',   pr: 1.0,  shadow: 2048, cube: 6, cubeRes: 128, fx: 2 },
  { name: 'MEDIUM', pr: 1.0,  shadow: 2048, cube: 0, cubeRes: 128, fx: 1 },
  { name: 'LOW',    pr: .8,   shadow: 1024, cube: 0, cubeRes: 128, fx: 1 },
  { name: 'LOWER',  pr: .65,  shadow: 1024, cube: 0, cubeRes: 128, fx: 0 },
  { name: 'MIN',    pr: .5,   shadow: 0,    cube: 0, cubeRes: 128, fx: 0 }
];
const RESTITUTION = .35;

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
function createGame({ root, canvas, onActivity = () => {}, onFallback = null }) {
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
  renderer.shadowMap.autoUpdate = false; // updated once per main frame (not per reflection face)

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, .3, 2400);
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
  Object.assign(moon.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 220 }); // tight = crisp
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

  /* ------------------------------- vertex animation (trees sway, flags wave) */
  const uTime = { value: 0 }, uSway = { value: 1 };
  const SWAY = amp => `
    #ifdef USE_INSTANCING
      vec3 swP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    #else
      vec3 swP = vec3(0.0);
    #endif
    float swA = max(position.y, 0.0) * uSway * (sin(uTime * 1.7 + swP.x * .11 + swP.z * .07) * ${amp} + sin(uTime * 3.1 + swP.z * .2) * ${amp * .35});
    transformed.x += swA; transformed.z += swA * .7;`;
  const WAVE = `float wvA = clamp(position.x / 2.2, 0.0, 1.0);
    transformed.z += (sin(position.x * 2.8 - uTime * 7.0) * .18 + sin(position.x * 5.0 - uTime * 11.0) * .04) * wvA * uSway;
    transformed.y -= wvA * wvA * .12;`;
  function injectVertex(mat, key, code, extra = '') {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = uTime; sh.uniforms.uSway = uSway;
      sh.vertexShader = 'uniform float uTime;\nuniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${code}\n${extra}`);
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  }
  const outlineSwayMat = (t, key, code) => injectVertex(new THREE.MeshBasicMaterial({ color: 0x141a2e, side: THREE.BackSide }), 'olsw' + key, code, `transformed += normalize(normal) * ${t.toFixed(3)};`);

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
      g.font = 'bold 34px Arial, sans-serif'; g.fillStyle = '#dff1ff'; g.fillText(line1, w / 2, h * .74);
      let fs = 76; do { g.font = `900 ${fs}px Arial, sans-serif`; fs -= 2; } while (g.measureText(line2).width > w * .9 && fs > 30);
      g.lineWidth = 10; g.strokeStyle = '#0a2470'; g.strokeText(line2, w / 2, h * .42);
      g.fillStyle = accent; g.fillText(line2, w / 2, h * .42);
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
  const cloudList = [];
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
      skyGroup.add(cloud); cloudList.push(cloud);
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
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.25;
  ground.renderOrder = -1; // always under the road, whatever order shader programs sort in
  dual(ground, M(0xffffff, { loColor: 0x6f9a56, map: grassTex, r: .95, m: 0, env: .25 }));
  for (const m of [dualList[dualList.length - 1].lo, dualList[dualList.length - 1].hi]) { m.polygonOffset = true; m.polygonOffsetFactor = 2; m.polygonOffsetUnits = 2; }
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
    injectVertex(dualList.find(p => p.mesh === crowns).hi, 'swayC', SWAY(.07));
    outline(crowns, .05).material = outlineSwayMat(.05, 'c', SWAY(.07));

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
    injectVertex(dualList.find(p => p.mesh === pineMesh).hi, 'swayP', SWAY(.022));
    outline(pineMesh, .03).material = outlineSwayMat(.03, 'p', SWAY(.022));

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
    // billboards rotate the 4 hero laptops from processors.js: "[Brand Model] · Intel Core Ultra AI laptop"
    const D = window.PROCESSOR_DATA, heroes = D ? D.tierOrder.map(t => { const ms = D.processors[t].laptop?.models || []; return ms.find(m => m.hero) || ms[0]; }).filter(Boolean) : [];
    const boards = heroes.length
      ? Array.from({ length: 5 }, (_, i) => { const h = heroes[i % heroes.length]; return ['Intel® Core™ Ultra AI laptop', `${h.brand} ${h.name}`, i % 2 ? '#ffffff' : '#ffd25e']; })
      : [['INTEL CORE ULTRA', 'AI PC', '#ffd25e'], ['ON-DEVICE AI', 'NPU', '#ffffff']];
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
  const premiumWheels = [], frontPivots = [], flames = [];
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
    premium.userData.tail = tail;
    // side mirrors
    for (const sx of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(.18, .05, .06), dark); stalk.position.set(sx * 1.0, 1.08, -.62);
      const mir = new THREE.Mesh(new RoundedBoxGeometry(.12, .16, .28, 2, .05), paint); mir.position.set(sx * 1.12, 1.12, -.6); mir.castShadow = true;
      const glassFace = new THREE.Mesh(new THREE.PlaneGeometry(.22, .12), chrome); glassFace.position.set(sx * 1.12, 1.12, -.45); glassFace.rotation.y = 0;
      premium.add(stalk, mir, glassFace); outline(mir, .02);
    }
    // number plate
    const plateTex = canvasTex(128, 40, (gg, w, h) => { gg.fillStyle = '#ffd93b'; gg.fillRect(0, 0, w, h); gg.strokeStyle = '#111'; gg.lineWidth = 3; gg.strokeRect(2, 2, w - 4, h - 4);
      gg.fillStyle = '#111'; gg.font = 'bold 22px Arial'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText('AI·PC 26', w / 2, h / 2 + 1); });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(.64, .2), new THREE.MeshStandardMaterial({ map: plateTex, roughness: .4 }));
    plate.position.set(0, .64, 2.53); premium.add(plate);
    // ---- detail pass (premium car = AI Upscaling stage on)
    const seam = new THREE.MeshBasicMaterial({ color: 0x07101f });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); premium.add(m); return m; };
    for (const sx of [-1, 1]) {
      for (const z of [-.78, .62]) add(new THREE.BoxGeometry(.03, .46, .03), seam, sx * 1.02, .8, z);  // door cut lines
      add(new THREE.BoxGeometry(.03, .03, 1.4), seam, sx * 1.02, .57, -.08);                              // door bottom seam
      add(new THREE.BoxGeometry(.03, .03, .16), seam, sx * 1.03, .9, -.55);                               // handle
      // side intake ahead of the rear wheel
      add(new RoundedBoxGeometry(.08, .26, .52, 2, .04), dark, sx * 1.0, .74, .92);
      for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(.09, .022, .48), chrome, sx * 1.02, .66 + k * .075, .92);
    }
    // front grille + lower intakes
    add(new RoundedBoxGeometry(1.1, .26, .08, 2, .04), dark, 0, .6, -2.44);
    for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(1.0, .025, .03), chrome, 0, .52 + k * .08, -2.49);
    for (const sx of [-1, 1]) add(new RoundedBoxGeometry(.42, .14, .08, 2, .04), dark, sx * .72, .4, -2.36);
    // rear diffuser with fins
    add(new RoundedBoxGeometry(1.7, .12, .5, 2, .04), dark, 0, .28, 2.3);
    for (let k = -2; k <= 2; k++) add(new THREE.BoxGeometry(.03, .16, .46), dark, k * .3, .24, 2.34);
    // roof shark-fin antenna + whip
    add(new THREE.ConeGeometry(.09, .32, 4).scale(.5, 1, 2.2), dark, 0, 1.95, .92, -.5);
    add(new THREE.CylinderGeometry(.008, .014, .55, 5), dark, 0, 2.22, 1.08, -.35);
    // tinted glass shows the cockpit: seats + driver (right-hand drive) + steering wheel
    glass.transparent = true; glass.opacity = .58;
    const seat = new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: .8 });
    for (const sx of [-1, 1]) {
      add(new RoundedBoxGeometry(.42, .5, .14, 2, .05), seat, sx * .32, 1.22, .32, -.18);
      add(new RoundedBoxGeometry(.42, .1, .44, 2, .04), seat, sx * .32, 1.0, .1);
    }
    const suit = new THREE.MeshStandardMaterial({ color: 0x0b2a6b, roughness: .7 });
    const helm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .25, clearcoat: 1 });
    add(new RoundedBoxGeometry(.38, .42, .26, 2, .08), suit, .32, 1.22, .12);
    add(new THREE.SphereGeometry(.16, 16, 12), helm, .32, 1.52, .1);
    add(new THREE.BoxGeometry(.24, .07, .04), seam, .32, 1.53, -.05);                  // visor
    add(new THREE.TorusGeometry(.13, .022, 6, 18), seam, .32, 1.28, -.32, -.35);       // steering wheel
    add(new THREE.BoxGeometry(1.5, .16, .3), seat, 0, 1.12, -.55);                       // dashboard
    // indicators (front + rear corners) and reversing lamps
    const indMat = sx => { const m = new THREE.MeshStandardMaterial({ color: 0x4a2a00, emissive: 0xffa31a, emissiveIntensity: 0 }); return m; };
    const indL = indMat(), indR = indMat();
    for (const [sx, m] of [[-1, indL], [1, indR]]) {
      add(new RoundedBoxGeometry(.2, .08, .06, 2, .03), m, sx * .98, .72, -2.3);
      add(new RoundedBoxGeometry(.14, .14, .06, 2, .03), m, sx * .98, .98, 2.43);
    }
    const revMat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, emissive: 0xffffff, emissiveIntensity: 0 });
    for (const sx of [-1, 1]) add(new RoundedBoxGeometry(.2, .09, .06, 2, .03), revMat, sx * .3, .74, 2.48);
    premium.userData.ind = [indL, indR]; premium.userData.rev = revMat;

    // exhaust flames (boost)
    const flameOuter = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, .9, .25), transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const flameInner = new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 1.2, 2.6), transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const x of [-.42, .42]) {
      const fl = new THREE.Group(); fl.position.set(x, .42, 2.62);
      fl.add(new THREE.Mesh(new THREE.ConeGeometry(.13, .8, 12).translate(0, .4, 0).rotateX(Math.PI / 2), flameOuter),
             new THREE.Mesh(new THREE.ConeGeometry(.07, .45, 10).translate(0, .22, 0).rotateX(Math.PI / 2), flameInner));
      fl.visible = false; premium.add(fl); flames.push(fl);
    }

    // chunky wheels — exaggerated rear tyres
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .6, roughness: .25, envMapIntensity: 1.4 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xffc53d, metalness: .4, roughness: .3 });
    const treadTex = canvasTex(64, 16, (gg, w, h) => { gg.fillStyle = '#2a2e38'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#0b0d12';
      for (let i = 0; i < 4; i++) { gg.fillRect(i * 16 + 2, 0, 5, h * .45); gg.fillRect(i * 16 + 10, h * .55, 5, h * .45); } gg.fillRect(0, h * .46, w, 2); }, { repeat: true });
    treadTex.repeat.set(10, 1);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: treadTex, roughness: .85 });
    const discMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: .9, roughness: .35 });
    const calMat = new THREE.MeshStandardMaterial({ color: 0xe8202a, roughness: .35, metalness: .2 });
    for (const [x, z, r, w] of [[-1.0, -1.45, .46, .42], [1.0, -1.45, .46, .42], [-1.04, 1.38, .56, .52], [1.04, 1.38, .56, .52]]) {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(r * .72, r * .3, 16, 32).rotateY(Math.PI / 2).scale(w * 2.2, 1, 1), tireMat); tire.castShadow = true;
      const out = Math.sign(x) * w * .26; // rim face sits on the outside so the brake shows between spokes
      const rimParts = [new THREE.TorusGeometry(r * .47, r * .05, 6, 28).rotateY(Math.PI / 2).translate(out, 0, 0), new THREE.CylinderGeometry(r * .14, r * .14, w * .2, 12).rotateZ(Math.PI / 2).translate(out, 0, 0)];
      for (let i = 0; i < 5; i++) rimParts.push(new THREE.BoxGeometry(w * .16, r * .12, r * .92).translate(out, 0, 0).rotateX(i / 5 * Math.PI));
      const rim = new THREE.Mesh(mergeGeometries(rimParts.map(p => p.toNonIndexed())), rimMat);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * .16, r * .16, w * .78, 12).rotateZ(Math.PI / 2), hubMat);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * .44, r * .44, w * .07, 24).rotateZ(Math.PI / 2), discMat); disc.position.x = -out * .2;
      g.add(tire, rim, hub, disc); g.userData.r = r;
      const cal = new THREE.Mesh(new RoundedBoxGeometry(w * .2, r * .3, r * .26, 2, .03), calMat); // caliper does not spin
      const holder = new THREE.Group(); holder.add(g); cal.position.set(-out * .05, r * .26, r * .2); holder.add(cal);
      holder.position.set(x, r, z); premium.add(holder);
      if (z < 0) frontPivots.push(holder); // steerable
      premiumWheels.push(g);
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

  /* ------------------------------------------ contact shadows (blob under cars) */
  const hiOnly = []; // meshes that only exist in the upgraded look
  const blobTex = canvasTex(64, 64, (gg, w) => {
    const gr = gg.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(.55, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, w, w);
  }, { srgb: false });
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  function contactShadow(parent, w, l) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.3, l * 1.15), blobMat);
    m.rotation.x = -Math.PI / 2; m.position.y = .04; m.renderOrder = 1; parent.add(m); hiOnly.push(m); return m;
  }
  contactShadow(premium, 2.1, 4.9);

  /* ---------------------------------------------------- traffic fleet */
  // Each vehicle is a rigid body in track space (mass, yaw inertia) with its own driver.
  const VEH = {
    hatch: { L: 3.7, W: 1.75, H: 1.5,  mass: 900,   r: .34, cols: [0xff5a5f, 0xffc93c, 0x3ddc97, 0xf7f7f2] },
    sedan: { L: 4.6, W: 1.85, H: 1.42, mass: 1350,  r: .36, cols: [0x9b5de5, 0x2b6cff, 0xf7f7f2, 0x2b2f3a] },
    suv:   { L: 4.8, W: 2.0,  H: 1.85, mass: 2100,  r: .45, cols: [0xff8c42, 0x2b2f3a, 0xe8ecf2] },
    truck: { L: 8.4, W: 2.5,  H: 3.4,  mass: 9000,  r: .55, cols: [0x1f6bff, 0xe8453c] },
    bus:   { L: 11,  W: 2.55, H: 3.25, mass: 12000, r: .55, cols: [0xffc53d, 0xe8453c] },
    rick:  { L: 2.8, W: 1.45, H: 1.85, mass: 380,   r: .3,  cols: [0x2fbf4a] } // auto-rickshaw
  };
  const POOL = ['hatch', 'hatch', 'hatch', 'hatch', 'sedan', 'sedan', 'sedan', 'sedan', 'suv', 'suv', 'suv',
                'truck', 'truck', 'bus', 'bus', 'rick', 'rick', 'rick', 'hatch', 'sedan'];
  const paintCache = new Map();
  const paintPair = c => {
    if (!paintCache.has(c)) paintCache.set(c, M(c, { loColor: new THREE.Color(c).lerp(new THREE.Color(0x8a8a8a), .45).getHex(), r: .3, m: .15, physical: true, env: 1 }));
    return paintCache.get(c);
  };
  const glassP = M(0x15284d, { loColor: 0x2a3550, r: .05, m: .1, env: 1.8 });
  const darkP = M(0x1c1f27, { loColor: 0x222222, r: .6 });
  const whiteP = M(0xf2f2ec, { loColor: 0xb5b5b0, r: .45, m: .05 });
  const yellowP = M(0xffd23f, { loColor: 0xb8a050, r: .5 });
  const tireP = M(0x1c1f27, { loColor: 0x111111, r: .85 });
  const rimTex = canvasTex(64, 64, (gg, w) => {
    gg.fillStyle = '#1c1f27'; gg.fillRect(0, 0, w, w);
    gg.fillStyle = '#d9dee8'; gg.beginPath(); gg.arc(w / 2, w / 2, w * .34, 0, Math.PI * 2); gg.fill();
    gg.strokeStyle = '#5a6275'; gg.lineWidth = 5;
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; gg.beginPath(); gg.moveTo(w / 2, w / 2); gg.lineTo(w / 2 + Math.cos(a) * w * .32, w / 2 + Math.sin(a) * w * .32); gg.stroke(); }
  });
  const rimP = M(0xffffff, { loColor: 0x9a9a9a, map: rimTex, r: .35, m: .5 });
  const headP = M(0xfff6dc, { loBasic: true, loColor: 0xfff2c0, e: 0xfff1c9, ei: 1.4 });
  const tTail = M(0x5a0010, { loBasic: true, loColor: 0xff3344, e: 0xff2b4a, ei: 1.2, neon: true });
  const indP = M(0x5a3000, { loBasic: true, loColor: 0xffaa33, e: 0xffa020, ei: 2.4 });
  const wheelGeos = new Map();
  const wheelGeo = (r, w) => { const k = r + ':' + w; if (!wheelGeos.has(k)) wheelGeos.set(k, new THREE.CylinderGeometry(r, r, w, 20).rotateZ(Math.PI / 2)); return wheelGeos.get(k); };
  const pairGeo = (w, h, d, x) => mergeGeometries([new THREE.BoxGeometry(w, h, d).translate(-x, 0, 0), new THREE.BoxGeometry(w, h, d).translate(x, 0, 0)]);

  function buildVehicle(type) {
    const T = VEH[type], { L, W, H, r } = T, y0 = r * .9;
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const pp = paintPair(pick(T.cols)), wheels = [];
    const part = (geo, pair, x, y, z, parent = body, cast = true) => { const m = new THREE.Mesh(geo, null); dual(m, pair); m.position.set(x, y, z); m.castShadow = cast; parent.add(m); return m; };
    const wheel = (x, z) => {
      const m = new THREE.Mesh(wheelGeo(r, r * .75), null);
      const lo = [tireP.lo, rimP.lo, rimP.lo], hi = [tireP.hi, rimP.hi, rimP.hi];
      dualList.push({ mesh: m, lo, hi }); m.material = lo; m.position.set(x, r, z); m.castShadow = true; g.add(m); wheels.push(m);
    };
    let lightY = y0 + H * .3;
    if (type === 'truck') {
      outline(part(new RoundedBoxGeometry(W, H * .62, 2.3, 3, .25), pp, 0, y0 + H * .31, -L / 2 + 1.15), .04);
      part(new THREE.BoxGeometry(W * .86, H * .24, .06), glassP, 0, y0 + H * .46, -L / 2 - .01, body, false);
      outline(part(new RoundedBoxGeometry(W * 1.02, H * .88, L - 2.5, 2, .12), whiteP, 0, y0 + H * .44 + .1, 1.25), .04);
      for (const z of [-L / 2 + 1.25, L / 2 - 2.5, L / 2 - 1.3]) { wheel(-W / 2 + .2, z); wheel(W / 2 - .2, z); }
      lightY = y0 + .35;
    } else if (type === 'bus') {
      outline(part(new RoundedBoxGeometry(W, H * .9, L, 4, .45), pp, 0, y0 + H * .45 + .05, 0), .04);
      part(new THREE.BoxGeometry(W * 1.012, H * .26, L * .86), glassP, 0, y0 + H * .62, .2, body, false);
      part(new THREE.BoxGeometry(W * .88, H * .38, .06), glassP, 0, y0 + H * .58, -L / 2 - .01, body, false);
      for (const z of [-L / 2 + 2.1, L / 2 - 2.3, L / 2 - 3.5]) { wheel(-W / 2 + .2, z); wheel(W / 2 - .2, z); }
      lightY = y0 + .45;
    } else if (type === 'rick') {
      outline(part(new RoundedBoxGeometry(W, .78, L * .9, 4, .3), pp, 0, y0 + .45, .15), .035);
      outline(part(new RoundedBoxGeometry(W * .55, 1.0, .45, 3, .18), pp, 0, y0 + .75, -L / 2 + .2), .03);
      outline(part(new RoundedBoxGeometry(W * 1.02, .18, L * .82, 3, .08), yellowP, 0, y0 + 1.66, .1), .03);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part(new THREE.CylinderGeometry(.035, .035, .85, 6), darkP, x * W * .45, y0 + 1.2, .1 + z * L * .34, body, false);
      wheel(0, -L / 2 + .35); wheel(-W / 2 + .12, L / 2 - .5); wheel(W / 2 - .12, L / 2 - .5);
      lightY = y0 + .6;
    } else { // hatchback / sedan / SUV
      outline(part(new RoundedBoxGeometry(W, H * .5, L, 4, Math.min(.35, H * .2)), pp, 0, y0 + H * .27, 0), .04);
      const cabL = L * (type === 'hatch' ? .58 : type === 'suv' ? .7 : .5), cabZ = L * (type === 'hatch' ? .1 : type === 'suv' ? .08 : .03);
      outline(part(new RoundedBoxGeometry(W * .88, H * .46, cabL, 4, .26), glassP, 0, y0 + H * .68, cabZ), .035);
      if (type === 'suv') for (const x of [-1, 1]) part(new THREE.BoxGeometry(.06, .06, cabL * .9), darkP, x * W * .38, y0 + H * .93, cabZ, body, false);
      for (const z of [-L / 2 + .85, L / 2 - .8]) { wheel(-W / 2 + .12, z); wheel(W / 2 - .12, z); }
    }
    part(pairGeo(.34, .12, .06, W * .33), headP, 0, lightY, -L / 2 - .02, body, false);
    part(pairGeo(.34, .14, .06, W * .33), tTail, 0, lightY + (type === 'bus' ? .2 : 0), L / 2 + .02, body, false);
    const ind = side => { const m = part(mergeGeometries([new THREE.BoxGeometry(.12, .1, .1).translate(side * (W / 2 - .02), 0, -L / 2), new THREE.BoxGeometry(.12, .1, .1).translate(side * (W / 2 - .02), 0, L / 2)]), indP, 0, lightY, 0, body, false); m.visible = false; return m; };
    const indL = ind(-1), indR = ind(1);
    contactShadow(g, W, L);
    g.visible = false; scene.add(g);
    return { g, body, wheels, indL, indR, type, m: T.mass, I: T.mass * (L * L + W * W) / 12, hl: L / 2, hw: W / 2, r,
      active: false, s: 0, d: 0, v: 0, vd: 0, ang: 0, w: 0, lane: 0, nextLane: 0, cruise: 0, recover: 0, blink: 0, laneT: 0, changing: false, wob: 0 };
  }
  const traffic = POOL.map(buildVehicle);

  // Obstacles — knockable cones, barrels, signs and striped barriers
  const coneGeo = mergeGeometries([
    new THREE.ConeGeometry(.42, 1.0, 20).translate(0, .55, 0),
    new THREE.CylinderGeometry(.55, .58, .1, 20).translate(0, .05, 0)
  ]);
  const conePair = M(0xff7a1a, { loColor: 0xc0703a, r: .4, e: 0x3a1500, ei: 1 });
  const barrierGeo = new RoundedBoxGeometry(3.4, 1.05, .6, 3, .2); barrierGeo.translate(0, .55, 0);
  const barrierPair = M(0xffffff, { loColor: 0xc0803a, map: stripeTex, r: .45 });
  const lampPair = M(0x5a2a00, { loBasic: true, loColor: 0xffaa33, e: 0xffa020, ei: 2.2, neon: true });
  const lampGeo = new THREE.SphereGeometry(.16, 12, 8);
  const barrelTex = canvasTex(64, 64, gg => { gg.fillStyle = '#ff7a1a'; gg.fillRect(0, 0, 64, 64); gg.fillStyle = '#fff6e6'; gg.fillRect(0, 14, 64, 9); gg.fillRect(0, 40, 64, 9); });
  const barrelGeo = new THREE.CylinderGeometry(.42, .42, 1.05, 18); barrelGeo.translate(0, .525, 0);
  const barrelPair = M(0xffffff, { loColor: 0xc0703a, map: barrelTex, r: .5 });
  const signTex = canvasTex(128, 128, gg => { gg.fillStyle = '#ffd23f'; gg.fillRect(0, 0, 128, 128); gg.strokeStyle = '#1b1e2a'; gg.lineWidth = 8; gg.strokeRect(6, 6, 116, 116);
    gg.fillStyle = '#1b1e2a'; gg.font = '900 40px Arial'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText('SLOW', 64, 66); });
  const signGeo = new RoundedBoxGeometry(1.2, 1.2, .08, 2, .04); signGeo.translate(0, 2.0, 0);
  const signPair = M(0xffffff, { loColor: 0xc0a850, map: signTex, r: .5 });
  const postGeo = new THREE.CylinderGeometry(.06, .06, 1.5, 8); postGeo.translate(0, .75, 0);
  const obstacles = [];
  const debris = []; // knocked pieces: free rigid bodies with gravity, bounce, fade

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

  /* ------------------------------------------ smoke / dust (soft particles) */
  const SMK = 320;
  const sPos = new Float32Array(SMK * 3).fill(-9999), sCol = new Float32Array(SMK * 4), sVel = new Float32Array(SMK * 3);
  const sLife = new Float32Array(SMK), sMax = new Float32Array(SMK), sBase = new Float32Array(SMK * 3);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 4).setUsage(THREE.DynamicDrawUsage));
  const smoke = new THREE.Points(sGeo, new THREE.PointsMaterial({ size: 1.7, map: dotTex, vertexColors: true, transparent: true, depthWrite: false }));
  smoke.frustumCulled = false; scene.add(smoke);
  let sHead = 0, sAny = false;
  function spawnSmoke(x, y, z, vx, vy, vz, r, g, b, life) {
    const i = sHead; sHead = (sHead + 1) % SMK;
    sPos.set([x, y, z], i * 3); sVel.set([vx, vy, vz], i * 3); sBase.set([r, g, b], i * 3);
    sLife[i] = sMax[i] = life; sAny = true;
  }
  function updateSmoke(dt) {
    if (!sAny) return;
    const drag = Math.exp(-1.6 * dt);
    for (let i = 0; i < SMK; i++) {
      if (sLife[i] <= 0) continue;
      const i3 = i * 3, i4 = i * 4;
      sLife[i] -= dt;
      if (sLife[i] <= 0) { sPos[i3 + 1] = -9999; sCol[i4 + 3] = 0; continue; }
      sVel[i3] *= drag; sVel[i3 + 1] = sVel[i3 + 1] * drag + .8 * dt; sVel[i3 + 2] *= drag;
      sPos[i3] += sVel[i3] * dt; sPos[i3 + 1] += sVel[i3 + 1] * dt; sPos[i3 + 2] += sVel[i3 + 2] * dt;
      const k = sLife[i] / sMax[i];
      sCol[i4] = sBase[i3]; sCol[i4 + 1] = sBase[i3 + 1]; sCol[i4 + 2] = sBase[i3 + 2]; sCol[i4 + 3] = .42 * k * Math.min(1, (1 - k) * 6);
    }
    sGeo.attributes.position.needsUpdate = true; sGeo.attributes.color.needsUpdate = true;
  }

  /* ------------------------------------------------ light trails (stage 4) */
  const TRAIL_N = 40;
  const trails = [-.62, .62].map(x => {
    const pos = new Float32Array(TRAIL_N * 2 * 3), col = new Float32Array(TRAIL_N * 2 * 3), idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.frustumCulled = false; m.visible = false; scene.add(m);
    return { x, m, geo, pos, col, pts: [] };
  });
  const _tv = new THREE.Vector3();
  function updateTrails() {
    const on = stage >= 4 && QUALITY[quality].fx >= 1 && phase !== 'idle';
    for (const tr of trails) {
      tr.m.visible = on;
      if (!on) { tr.pts.length = 0; continue; }
      _tv.set(tr.x, .98 + P.suspY, 2.5); premium.localToWorld(_tv);
      tr.pts.unshift(_tv.x, _tv.y, _tv.z); if (tr.pts.length > TRAIL_N * 3) tr.pts.length = TRAIL_N * 3;
      const n = tr.pts.length / 3;
      for (let i = 0; i < TRAIL_N; i++) {
        const j = Math.min(i, n - 1) * 3, k = Math.pow(1 - i / TRAIL_N, 1.6) * (i < n ? 1 : 0), hw = .07 * (1 - i / TRAIL_N) + .015;
        tr.pos.set([tr.pts[j], tr.pts[j + 1] + hw, tr.pts[j + 2], tr.pts[j], tr.pts[j + 1] - hw, tr.pts[j + 2]], i * 6);
        tr.col.set([2.6 * k, .25 * k, .4 * k, 2.6 * k, .25 * k, .4 * k], i * 6);
      }
      tr.geo.attributes.position.needsUpdate = true; tr.geo.attributes.color.needsUpdate = true;
    }
  }

  /* --------------------------- extra FX (pooled; scaled by the quality ladder's fx level) */
  const fxLevel = () => (stage >= 3 ? QUALITY[quality].fx : -1);
  const fwd = f => [f.nz, -f.nx];
  // upgrade shockwave rings (pool of 3)
  const shocks = Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(.6, 1.6, 2.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.visible = false; m.userData.t = 9; scene.add(m); return m;
  });
  function spawnShock(x, y, z) { const m = shocks.find(k => k.userData.t > .8) || shocks[0]; m.position.set(x, y, z); m.userData.t = 0; m.visible = true; }
  // tyre marks: ring buffer of road quads, alpha fades with age
  const MARKS = 700;
  const mPos = new Float32Array(MARKS * 12), mCol = new Float32Array(MARKS * 16), mBorn = new Float32Array(MARKS).fill(-99), mIdx = [];
  for (let i = 0; i < MARKS; i++) { const a = i * 4; mIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3).setUsage(THREE.DynamicDrawUsage));
  mGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 4).setUsage(THREE.DynamicDrawUsage));
  mGeo.setIndex(mIdx);
  const marks = new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
  marks.frustumCulled = false; marks.renderOrder = 2; scene.add(marks);
  let mHead = 0; const lastMark = [null, null];
  function addMark(k, x, z, nx, nz, now) {
    const L = lastMark[k]; lastMark[k] = [x, z];
    if (!L || Math.hypot(x - L[0], z - L[1]) > 4) return;
    const i = mHead; mHead = (mHead + 1) % MARKS; const hw = .15;
    mPos.set([L[0] - nx * hw, .03, L[1] - nz * hw, L[0] + nx * hw, .03, L[1] + nz * hw, x - nx * hw, .03, z - nz * hw, x + nx * hw, .03, z + nz * hw], i * 12);
    mBorn[i] = now; mGeo.attributes.position.needsUpdate = true;
  }
  // speed lines (camera space)
  const SPL = 48, slPos = new Float32Array(SPL * 6), slSeed = Array.from({ length: SPL }, () => ({ a: Math.random() * 6.283, r: rand(.55, 1), z: -rand(4, 46), len: rand(3, 7) }));
  const slGeo = new THREE.BufferGeometry(); slGeo.setAttribute('position', new THREE.BufferAttribute(slPos, 3).setUsage(THREE.DynamicDrawUsage));
  const speedLines = new THREE.LineSegments(slGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  speedLines.frustumCulled = false; speedLines.renderOrder = 5; camera.add(speedLines); scene.add(camera);
  // leaves blowing across the road (instanced)
  const LEAVES = 40, leafObj = new THREE.Object3D();
  const leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.22, .14), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), LEAVES);
  const leafCols = [0x6fae3a, 0xd98c2b, 0xc2541f, 0x9bbf3d, 0xe0b23a];
  const leaves = Array.from({ length: LEAVES }, (_, i) => { leafMesh.setColorAt(i, new THREE.Color(pick(leafCols))); return { s: -1e9, d: 0, vd: 0, ph: Math.random() * 6.3 }; });
  leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); leafMesh.frustumCulled = false; scene.add(leafMesh);
  // heat haze (post pass, stage 4)
  const hazePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uC: { value: new THREE.Vector2(.5, .3) }, uAmt: { value: 0 }, uTime: { value: 0 }, uAsp: { value: 1.7 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uC; uniform float uAmt, uTime, uAsp; varying vec2 vUv;
      void main(){ vec2 d = vUv - uC; d.x *= uAsp; float m = uAmt * smoothstep(.13, 0., length(d * vec2(1., 1.5))) * smoothstep(-.06, .04, uC.y - vUv.y + .05);
        vec2 off = m * .006 * vec2(sin(vUv.y * 140. + uTime * 26.), cos(vUv.x * 110. - uTime * 21.));
        gl_FragColor = texture2D(tDiffuse, vUv + off); }`
  });
  hazePass.enabled = false;
  const _ex = new THREE.Vector3(), _ex2 = new THREE.Vector3();

  function updateExtraFX(dt, t) {
    const fx = fxLevel(), now = performance.now() / 1000, racing = phase === 'race' || phase === 'finishing';
    // shockwaves
    for (const m of shocks) if (m.visible) {
      m.userData.t += dt; const k = m.userData.t / .75;
      if (k >= 1) { m.visible = false; continue; }
      m.scale.setScalar(1 + k * 16); m.material.opacity = (1 - k) * (1 - k);
    }
    const pf = frame(P.s, P.d, tmpF), [fx0, fz0] = fwd(pf);
    // tyre marks while drifting / hard braking
    const marking = fx >= 0 && racing && ((P.slip > 1.8 && P.v > 26) || Math.abs(P.drift) > .1 || (P.brake > .7 && P.v > 22));
    for (const k of [0, 1]) {
      if (!marking) { lastMark[k] = null; continue; }
      const sd = k ? .95 : -.95, x = pf.x - fx0 * 1.4 + pf.nx * sd, z = pf.z - fz0 * 1.4 + pf.nz * sd;
      addMark(k, x, z, pf.nx, pf.nz, now);
    }
    for (let i = 0; i < MARKS; i++) {
      const age = now - mBorn[i], a = age > 9 ? 0 : .5 * Math.min(1, (9 - age) / 3);
      for (let v = 0; v < 4; v++) mCol.set([.05, .05, .06, a], (i * 4 + v) * 4);
    }
    mGeo.attributes.color.needsUpdate = true; marks.visible = fx >= 0;
    if (fx < 0) { speedLines.visible = false; leafMesh.visible = false; hazePass.enabled = false; return; }
    // wheel dust behind the rear tyres at speed
    if (racing && P.v > 40 && Math.random() < (fx >= 1 ? 14 : 5) * dt) {
      const sd = Math.random() < .5 ? -1 : 1;
      spawnSmoke(pf.x - fx0 * 1.8 + pf.nx * sd, .18, pf.z - fz0 * 1.8 + pf.nz * sd, -fx0 * 3 + rand(-.6, .6), rand(.2, .7), -fz0 * 3 + rand(-.6, .6), .62, .6, .58, rand(.4, .8));
    }
    // boost: exhaust flame sparks
    if (P.boosting && fx >= 1) for (const sx of [-.42, .42]) if (Math.random() < 50 * dt * fx) {
      _ex.set(sx, .42 + P.suspY, 2.75); premium.localToWorld(_ex);
      const c = Math.random() < .5 ? [2.4, .9, .25] : [.6, 1.3, 2.6];
      spawnP(_ex.x, _ex.y, _ex.z, -fx0 * 6 + rand(-1, 1), rand(0, 1.5), -fz0 * 6 + rand(-1, 1), c[0], c[1], c[2], rand(.15, .3));
    }
    // heat haze behind the exhausts while boosting (post-processing stage only)
    const hazeOn = stage >= 4 && fx >= 1 && P.boosting;
    hazePass.uniforms.uAmt.value = damp(hazePass.uniforms.uAmt.value, hazeOn ? 1 : 0, 6, dt);
    hazePass.enabled = hazePass.uniforms.uAmt.value > .02;
    if (hazePass.enabled) {
      _ex2.set(0, .7 + P.suspY, 3.2); premium.localToWorld(_ex2); _ex2.project(camera);
      hazePass.uniforms.uC.value.set(_ex2.x * .5 + .5, _ex2.y * .5 + .5); hazePass.uniforms.uTime.value = t; hazePass.uniforms.uAsp.value = camera.aspect;
    }
    // speed lines at high speed
    const sp = clamp((P.v / V_MAX - .78) / .2, 0, 1) * (racing ? 1 : 0);
    speedLines.visible = sp > .01; speedLines.material.opacity = sp * .55;
    if (speedLines.visible) {
      const n = fx >= 2 ? SPL : SPL >> 1, tanH = Math.tan(camera.fov * Math.PI / 360);
      for (let i = 0; i < n; i++) {
        const L = slSeed[i]; L.z += P.v * dt * 1.4;
        if (L.z > -2) { L.z = -rand(30, 46); L.a = Math.random() * 6.283; L.r = rand(.6, 1); }
        const rr = -L.z * tanH * L.r, x = Math.cos(L.a) * rr * camera.aspect, y = Math.sin(L.a) * rr, z2 = L.z + L.len * (.6 + sp);
        const rr2 = -Math.min(-2.2, z2) * tanH * L.r;
        slPos.set([x, y, L.z, Math.cos(L.a) * rr2 * camera.aspect, Math.sin(L.a) * rr2, Math.min(-2.2, z2)], i * 6);
      }
      slGeo.setDrawRange(0, n * 2); slGeo.attributes.position.needsUpdate = true;
    }
    // leaves drifting across the road
    const nLeaves = fx >= 2 ? LEAVES : fx === 1 ? LEAVES >> 1 : 0;
    leafMesh.visible = nLeaves > 0; leafMesh.count = nLeaves;
    for (let i = 0; i < nLeaves; i++) {
      const L = leaves[i];
      if (L.s < P.s - 6 || Math.abs(L.d) > 17) { const side = Math.random() < .5 ? -1 : 1; L.s = P.s + rand(15, 120); L.d = side * rand(11, 16); L.vd = -side * rand(2.5, 5.5); }
      L.d += L.vd * dt + Math.sin(t * 2 + L.ph) * .02;
      const f = frame(L.s, L.d, tmpF);
      leafObj.position.set(f.x, .25 + Math.abs(Math.sin(t * 2.4 + L.ph)) * .9, f.z);
      leafObj.rotation.set(t * 3 + L.ph, t * 1.7 + L.ph * 2, t * 2.3);
      leafObj.updateMatrix(); leafMesh.setMatrixAt(i, leafObj.matrix);
    }
    if (nLeaves) leafMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- birds */
  const birds = new THREE.Group(); scene.add(birds); hiOnly.push(birds);
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2f45, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.25, 1.3, 0, .1, 0, 0, .35], 3));
  const birdList = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group(), l = new THREE.Mesh(wingGeo, birdMat), r = new THREE.Mesh(wingGeo, birdMat);
    r.scale.x = -1; b.add(l, r);
    const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
    b.position.set(side * row * 2.6, rand(-.6, .6), row * 2.4);
    b.userData = { l, r, ph: rand(0, 6) };
    birds.add(b); birdList.push(b);
  }
  let birdT = rand(0, 30);
  function updateBirds(dt, t, f) {
    const on = stage >= 3 && QUALITY[quality].fx >= 1;
    birds.visible = on; if (!on) return;
    birdT += dt;
    const across = ((birdT * 9) % 420) - 210;               // drift across the view
    birds.position.set(f.x + f.nx * across - f.nz * 170, 34 + Math.sin(birdT * .4) * 4, f.z + f.nz * across + f.nx * 170);
    birds.rotation.y = f.yaw + Math.PI / 2;
    for (const b of birdList) { const a = Math.sin(t * 9 + b.userData.ph) * .7; b.userData.l.rotation.z = a; b.userData.r.rotation.z = -a; }
  }

  /* ---------------------------------------------------------------- flags */
  const flagGeo = new THREE.PlaneGeometry(2.2, 1.3, 16, 4); flagGeo.translate(1.1, 0, 0);
  const poleGeo = new THREE.CylinderGeometry(.06, .07, 6, 8); poleGeo.translate(0, 3, 0);
  const polePair = M(0xe0e4ea, { loColor: 0x9a9a9a, m: .8, r: .3 });
  const flagPairs = [0x1f6bff, 0xffffff, 0xffc53d].map((c, i) => { const p = M(c, { loColor: c, r: .7, side: THREE.DoubleSide }); injectVertex(p.hi, 'wave' + i, WAVE); return p; });
  for (const base of [0, TRACK_LEN]) for (let k = -2; k <= 3; k++) for (const side of [-1, 1]) {
    const s = base + k * 16, f = frame(s, side * 12, {});
    const pole = new THREE.Mesh(poleGeo, null); dual(pole, polePair); pole.position.set(f.x, 0, f.z); pole.castShadow = true; scene.add(pole);
    const fl = new THREE.Mesh(flagGeo, null); dual(fl, flagPairs[(k + 2 + (side > 0 ? 1 : 0)) % 3]);
    fl.position.set(f.x, 5.2, f.z); fl.rotation.y = f.yaw + (side > 0 ? 0 : Math.PI); fl.castShadow = true; scene.add(fl);
  }

  /* ----------------------------------------------- spectators (wave in hi) */
  const personGeo = new THREE.CapsuleGeometry(.27, .62, 4, 10); personGeo.translate(0, .6 + .27, 0);
  const headGeo = new THREE.SphereGeometry(.2, 14, 10); headGeo.translate(0, 1.62, 0);
  const armGeo = new THREE.BoxGeometry(.1, .62, .1); armGeo.translate(0, .31, 0);
  const crowdPair = M(0xffffff, { loColor: 0xffffff, r: .8 }), skinPair = M(0xffffff, { loColor: 0xffffff, r: .7 });
  const shirts = [0xff5a5f, 0x1f6bff, 0xffc53d, 0x3ddc97, 0x9b5de5, 0xffffff, 0xff8c42], skins = [0xf1c27d, 0xc68642, 0x8d5524, 0xe0ac69, 0xffdbac];
  const crowds = [0, TRACK_LEN].map(sC => {
    const n = 48, bodies = new THREE.InstancedMesh(personGeo, null, n), heads = new THREE.InstancedMesh(headGeo, null, n), arms = new THREE.InstancedMesh(armGeo, null, n);
    dual(bodies, crowdPair); dual(heads, skinPair); dual(arms, crowdPair);
    const base = [], col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, f = frame(sC + rand(-30, 30), side * rand(13, 17), {});
      const yaw = f.yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2), sc = rand(.9, 1.12), shirt = pick(shirts);
      dummy.position.set(f.x, 0, f.z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix);
      bodies.setColorAt(i, col.setHex(shirt)); heads.setColorAt(i, col.setHex(pick(skins))); arms.setColorAt(i, col.setHex(shirt));
      const bx = f.x + Math.cos(yaw) * .3 * sc, bz = f.z - Math.sin(yaw) * .3 * sc;
      base.push({ x: bx, z: bz, y: 1.28 * sc, yaw, sc, ph: rand(0, 6), sp: rand(5, 8) });
      dummy.position.set(bx, 1.28 * sc, bz); dummy.rotation.set(0, yaw, .3); dummy.updateMatrix(); arms.setMatrixAt(i, dummy.matrix);
    }
    bodies.castShadow = true; scene.add(bodies, heads, arms);
    return { sC, arms, base };
  });
  function updateCrowds(t) {
    if (stage < 3 || QUALITY[quality].fx < 1) return;
    for (const c of crowds) {
      if (Math.abs(c.sC - P.s) > 320) continue;
      c.base.forEach((b, i) => {
        dummy.position.set(b.x, b.y, b.z); dummy.rotation.set(0, b.yaw, 2.5 + Math.sin(t * b.sp + b.ph) * .55); dummy.scale.setScalar(b.sc); dummy.updateMatrix();
        c.arms.setMatrixAt(i, dummy.matrix);
      });
      c.arms.instanceMatrix.needsUpdate = true;
    }
  }

  /* ---------------------------------------- live reflections (cube camera) */
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(.5, 900, cubeRT);
  let cubeFrame = 0;
  const reflectMats = new Set();
  // wet road: low-roughness puddle patches in the roughness map
  const puddleTex = canvasTex(256, 512, (gg, w, h) => {
    gg.fillStyle = '#d0d0d0'; gg.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { const x = rand(.15, .85) * w, y = rand(0, h), rx = rand(10, 34), ry = rand(18, 60);
      const gr = gg.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); gr.addColorStop(0, '#141414'); gr.addColorStop(.7, '#404040'); gr.addColorStop(1, 'rgba(208,208,208,0)');
      gg.fillStyle = gr; gg.beginPath(); gg.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); gg.fill(); }
  }, { repeat: true, srgb: false });
  {
    const roadHi = dualList.find(p => p.mesh === road).hi;
    roadHi.roughnessMap = puddleTex; roadHi.roughness = .62; roadHi.metalness = 0; roadHi.envMapIntensity = 1.15;
    reflectMats.add(roadHi);
    premium.traverse(o => { if (o.isMesh && (o.material.isMeshPhysicalMaterial || o.material.metalness > .5)) reflectMats.add(o.material); });
    for (const p of paintCache.values()) reflectMats.add(p.hi);
    reflectMats.add(glassP.hi); reflectMats.add(goldPair.hi);
  }
  // The cube is pre-filtered to PMREM here, outside the main render: letting three convert it
  // lazily mid-frame left GL state out of sync (the ground drew over the road afterwards).
  let envRT = null, reflOn = false;
  function setReflections(on) {
    reflOn = on;
    const want = on && envRT ? envRT.texture : null;
    for (const m of reflectMats) if (m.envMap !== want) { m.envMap = want; m.needsUpdate = true; }
  }
  function updateCube() {
    cubeCam.position.set(player.position.x, 1.1, player.position.z); cubeCam.updateMatrixWorld();
    premium.visible = false; smoke.visible = false; sparks.visible = false;
    cubeCam.update(renderer, scene);
    envRT = pmrem.fromCubemap(cubeRT.texture, envRT);
    renderer.resetState();
    premium.visible = stage >= 3; smoke.visible = true; sparks.visible = true;
    if (reflOn) setReflections(true);
  }

  /* --------------------------------------------- rigid-body contact physics */
  // Bodies: { s, d, v, vd, m, hl, hw, ang?, w?, I? } in track space (metres, m/s).
  const PB = { s: 0, d: 0, v: 0, vd: 0, m: 1300, hl: 2.4, hw: .98, ang: 0 };
  function ext(o) { const c = Math.abs(Math.cos(o.ang || 0)), sn = Math.abs(Math.sin(o.ang || 0)); return [o.hl * c + o.hw * sn, o.hw * c + o.hl * sn]; }
  /** Impulse-based collision with restitution; off-centre hits add spin. Returns impulse (kg·m/s). */
  function collide(A, B) {
    const [ahl, ahw] = ext(A), [bhl, bhw] = ext(B);
    const ds = B.s - A.s, dd = B.d - A.d;
    const px = ahl + bhl - Math.abs(ds), py = ahw + bhw - Math.abs(dd);
    if (px <= 0 || py <= 0) return 0;
    const alongS = px < py, nS = alongS ? (Math.sign(ds) || 1) : 0, nD = alongS ? 0 : (Math.sign(dd) || 1);
    const im = 1 / A.m + 1 / B.m, corr = Math.min(px, py) * .9 / im;
    A.s -= nS * corr / A.m; A.d -= nD * corr / A.m; B.s += nS * corr / B.m; B.d += nD * corr / B.m;
    const rv = (B.v - A.v) * nS + (B.vd - A.vd) * nD;
    if (rv >= 0) return 0;
    const j = -(1 + RESTITUTION) * rv / im;
    A.v -= j * nS / A.m; A.vd -= j * nD / A.m; B.v += j * nS / B.m; B.vd += j * nD / B.m;
    const lever = alongS ? clamp(dd, -bhw, bhw) : clamp(ds, -bhl, bhl);
    const torque = (alongS ? -1 : 1) * j * lever * .18;
    if (B.I) B.w += torque / B.I;
    if (A.I) A.w -= torque / A.I;
    if (alongS) { const side = Math.sign(dd) || (Math.random() < .5 ? -1 : 1); B.vd += side * j * .22 / B.m; A.vd -= side * j * .22 / A.m; }
    return j;
  }
  function contactFX(A, B, j) {
    const f = frame((A.s + B.s) / 2, (A.d + B.d) / 2, tmpF), n = Math.min(40, 8 + j / 1500) | 0;
    burst(f.x, .8, f.z, n, [C_GOLD, C_WHITE, C_GOLD], 9, .5);
    if (stage >= 3) {
      burst(f.x, .9, f.z, n >> 1, [[.18, .18, .2], [.45, .45, .5], [.8, .8, .85]], 6, .8); // debris chips
      for (let i = 0; i < 6; i++) spawnSmoke(f.x + rand(-1, 1), .6, f.z + rand(-1, 1), rand(-2, 2), rand(.5, 2), rand(-2, 2), .85, .85, .88, rand(.8, 1.4));
    }
  }
  function penalize(j) {
    shake = Math.max(shake, clamp(j / 30000, .35, 1.2));
    if (P.hitCd > 0) return;
    window.SFX?.crash(j / 40000);
    P.hits++; P.hitCd = .9; P.penalty += 1; P.score = Math.max(0, P.score - 150);
    showMiniToast('+1s  COLLISION');
  }
  const nearestLane = d => LANES.reduce((b, l) => Math.abs(l - d) < Math.abs(b - d) ? l : b, LANES[0]);
  function driveVehicle(c, dt) {
    if (c.recover > 0) { // sliding after a hit: tyre friction bleeds off sideways speed and spin
      c.recover -= dt;
      c.vd *= Math.exp(-2.4 * dt); c.w *= Math.exp(-1.8 * dt);
      c.v += (c.cruise * .6 - c.v) * (1 - Math.exp(-.7 * dt));
      if (c.recover <= 0) { c.lane = LANES.indexOf(nearestLane(c.d)); c.changing = false; }
    } else {
      c.laneT -= dt;
      if (!c.changing && c.laneT <= 0) {
        c.laneT = rand(5, 11);
        const nl = c.lane + (Math.random() < .5 ? -1 : 1), inZone = c.s > CONG_START && c.s < CONG_END;
        const free = nl >= 0 && nl < 4 && !traffic.some(o => o !== c && o.active && Math.abs(o.s - c.s) < 18 && Math.abs(o.d - LANES[nl]) < 2.5) && !(Math.abs(P.s - c.s) < 16 && Math.abs(P.d - LANES[nl]) < 2.5);
        if (!inZone && free) { c.changing = true; c.blink = 1.5; c.nextLane = nl; }
      }
      if (c.changing && (c.blink -= dt) <= 0) { c.lane = c.nextLane; c.changing = false; }
      c.vd += ((LANES[c.lane] - c.d) * 2.2 - c.vd * 2.6) * dt;            // driver steering (spring-damper)
      c.w += ((Math.atan2(c.vd, Math.max(6, c.v)) - c.ang) * 14 - c.w * 6) * dt; // heading follows travel
      let vt = c.cruise;
      for (const o of traffic) if (o !== c && o.active && o.s > c.s && o.s - c.s < c.hl + o.hl + 8 && Math.abs(o.d - c.d) < 2.2) vt = Math.min(vt, o.v);
      c.v += clamp(vt - c.v, -8 * dt, 3 * dt);
    }
    c.ang += c.w * dt; c.d += c.vd * dt; c.s += c.v * dt;
    c.wob = damp(c.wob, 0, 2.5, dt);
    const lim = 10.4 - c.hw;
    if (Math.abs(c.d) > lim) { // bounce off the guard rail
      const sg = Math.sign(c.d); c.d = sg * lim;
      if (c.vd * sg > 0) {
        if (Math.abs(c.vd) > 1.5) { const f = frame(c.s, sg * 10.4, tmpF); burst(f.x, .6, f.z, 10, [C_GOLD, C_WHITE], 6, .4); }
        c.vd = -c.vd * .45; c.w -= sg * rand(.3, 1.2); c.wob = Math.min(1.5, c.wob + .5);
      }
    }
  }
  function knock(o, vs, vd) {
    o.hit = true; window.SFX?.knock();
    const f = frame(o.s, o.d, tmpF), fwd = new THREE.Vector3(f.nz, 0, -f.nx), right = new THREE.Vector3(f.nx, 0, f.nz);
    for (const ch of [...o.g.children]) {
      scene.attach(ch);
      const vel = fwd.clone().multiplyScalar(Math.max(4, vs) * rand(.45, .85)).addScaledVector(right, vd * .5 + rand(-4, 4));
      vel.y = rand(4, 9) * o.lift;
      debris.push({ m: ch, vel, ang: new THREE.Vector3(rand(-9, 9), rand(-5, 5), rand(-9, 9)).multiplyScalar(o.lift), t: 0, faded: false });
    }
    scene.remove(o.g);
    burst(f.x, .6, f.z, 10, [C_GOLD, C_WHITE], 5, .35);
  }
  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const b = debris[i], p = b.m.position; b.t += dt;
      b.vel.y -= 22 * dt; p.addScaledVector(b.vel, dt);
      b.m.rotation.x += b.ang.x * dt; b.m.rotation.y += b.ang.y * dt; b.m.rotation.z += b.ang.z * dt;
      if (p.y < 0) { // ground contact: bounce with restitution + friction
        p.y = 0;
        if (b.vel.y < -1.5) b.vel.y *= -.35; else b.vel.y = 0;
        b.vel.x *= .72; b.vel.z *= .72; b.ang.multiplyScalar(.7);
      }
      if (b.t > 3) {
        if (!b.faded) { b.faded = true; b.m.material = [].concat(b.m.material).map(m => { const c = m.clone(); c.transparent = true; return c; }); if (b.m.material.length === 1) b.m.material = b.m.material[0]; }
        const a = Math.max(0, 1 - (b.t - 3) / .6);
        [].concat(b.m.material).forEach(m => { m.opacity = a; });
        if (a <= 0) { [].concat(b.m.material).forEach(m => m.dispose()); scene.remove(b.m); debris.splice(i, 1); }
      }
    }
  }
  function emitSurfaceFX(dt) {
    if (stage < 3) return;
    const rate = QUALITY[quality].fx === 0 ? .35 : 1;
    const pf = frame(P.s, P.d, tmpF), fx = pf.nz, fz = -pf.nx;
    const rear = side => [pf.x - fx * 1.4 + pf.nx * side, pf.z - fz * 1.4 + pf.nz * side];
    const skid = (P.slip > 2.2 && P.v > 30) || (P.brake > .7 && P.v > 25);
    if (skid && Math.random() < 34 * dt * rate) for (const sd of [-1, 1]) { const [x, z] = rear(sd); spawnSmoke(x, .3, z, rand(-1, 1), rand(.4, 1.4), rand(-1, 1), .92, .92, .95, rand(.9, 1.5)); }
    if (Math.abs(P.d) > 8.3 && Math.abs(P.v) > 12 && Math.random() < 40 * dt * rate) {
      const sd = Math.sign(P.d), [x, z] = rear(sd);
      spawnSmoke(x, .2, z, rand(-1, 1) + sd * 2 * pf.nx, rand(.5, 2), rand(-1, 1) + sd * 2 * pf.nz, .82, .7, .5, rand(.6, 1.1)); // dust
    }
  }

  /* ---------------------------------------------- post-processing */
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(hazePass);
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
  let wasBoosting = false, demoMode = false, aiLane = LANES[1];
  const boostHint = window.createBoostHint ? window.createBoostHint(root) : null;
  let lastActivityPing = 0, rafCount = 0, rafT0 = 0, slowSecs = 0;
  const portraitMQ = matchMedia('(orientation: portrait)'), reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function inStutterZone() { return stage < 4 && P.s > CONG_START && P.s < CONG_END; }

  function resetState() {
    Object.assign(P, { s: 0, d: LANES[1], v: 0, steer: 0, throttle: 0, brake: 0, accel: 0, boost: 55, fuel: 100,
      score: 0, coins: 0, ups: 0, hits: 0, time: 0, penalty: 0, hitCd: 0, boosting: false, lastV: 0, roll: 0, pitch: 0,
      vd: 0, slip: 0, drift: 0, yawKick: 0, suspY: 0, suspV: 0 });
    stage = 1; nextTrafficS = 140; freezeUntil = 0; shake = 0; camInit = false; zoneShown = false; nearLagHint = false;
    for (const c of traffic) { c.active = false; c.g.visible = false; }
    for (const b of debris) scene.remove(b.m);
    debris.length = 0;
    trails.forEach(tr => { tr.pts.length = 0; });
    mBorn.fill(-99); lastMark[0] = lastMark[1] = null; leaves.forEach(L => { L.s = -1e9; });
    sLife.fill(0); sPos.fill(-9999); sCol.fill(0); sGeo.attributes.position.needsUpdate = true; sGeo.attributes.color.needsUpdate = true;
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
        const kind = inZone ? pick(['barrier', 'barrier', 'cones', 'barrels', 'sign']) : pick(['cones', 'barrels', 'sign']);
        const g = new THREE.Group();
        const piece = (geo, pair, x, y = 0) => { const m = new THREE.Mesh(geo, null); dual(m, pair); m.castShadow = true; m.position.set(x, y, 0); g.add(m); return m; };
        let w = 3.4, slow = .9, lift = 1; // lift: lighter things fly higher (mass matters)
        if (kind === 'barrier') { piece(barrierGeo, barrierPair, 0); for (const x of [-1.4, 1.4]) piece(lampGeo, lampPair, x, 1.12); slow = .6; lift = .45; }
        else if (kind === 'cones') { for (const x of [-1.1, 0, 1.1]) piece(coneGeo, conePair, x); slow = .92; lift = 1.2; }
        else if (kind === 'barrels') { for (const x of [-.6, .6]) piece(barrelGeo, barrelPair, x); w = 2.3; slow = .8; lift = .8; }
        else { piece(postGeo, darkP, 0); piece(signGeo, signPair, 0); w = 1.5; slow = .88; lift = 1; }
        const f = frame(s, LANES[lane], {});
        g.position.set(f.x, 0, f.z); g.rotation.y = f.yaw;
        scene.add(g);
        obstacles.push({ g, s, d: LANES[lane], w, l: 1.2, hit: false, slow, lift });
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
    hiOnly.forEach(m => { m.visible = hi; });
    const Q = QUALITY[quality];
    if (Q.cube && cubeRT.width !== Q.cubeRes) cubeRT.setSize(Q.cubeRes, Q.cubeRes);
    setReflections(hi && Q.cube > 0);
    uSway.value = hi && Q.fx >= 1 ? 1 : 0;
    renderer.shadowMap.needsUpdate = true;
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
    window.SFX?.upgrade(P.ups);
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
    { const pf2 = frame(P.s, P.d, {}); spawnShock(pf2.x, .25, pf2.z); }
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
        const free = traffic.filter(c => !c.active);
        if (!free.length) break;
        const car = pick(free);
        if (traffic.some(o => o.active && Math.abs(o.s - s) < o.hl + car.hl + 4 && Math.abs(o.d - LANES[li]) < 2.5)) continue;
        const heavy = car.type === 'truck' || car.type === 'bus';
        Object.assign(car, { active: true, s: s + rand(-4, 4), lane: li, d: LANES[li], vd: 0, ang: 0, w: 0, recover: 0, changing: false, blink: 0, laneT: rand(3, 9), wob: 0,
          cruise: (inZone ? 12 : 24) + li * 1.6 - (heavy ? 3 : 0) - (car.type === 'rick' ? 5 : 0) });
        car.v = car.cruise; car.g.visible = true;
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
    const gas = racing && (keys.gas || document.body.classList.contains('touch')), brk = racing && keys.brake; // touch: auto-accelerate
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

    // --- lateral: tyre-grip model (grip falls with speed -> slight oversteer/drift); impulses feed P.vd
    const steerIn = racing ? (keys.right ? 1 : 0) - (keys.left ? 1 : 0) : 0;
    P.steer = damp(P.steer, steerIn, 7, dt);
    const vLat = P.steer * (8 + Math.max(0, P.v) * .13);
    const grip = (Math.abs(P.d) > 8.2 ? 3.5 : 8.5) * (P.brake > .5 && P.v > 30 ? .5 : 1) / (1 + Math.max(0, P.v - 50) / 35);
    P.vd = damp(P.vd, vLat, grip, dt);
    P.d += P.vd * dt;
    P.slip = Math.abs(vLat - P.vd);
    P.drift = damp(P.drift, clamp(P.steer * Math.max(0, P.v - 35) / 60 * .22 + (vLat - P.vd) * .02, -.3, .3), 5, dt);
    P.yawKick = damp(P.yawKick, 0, 4, dt);
    if (Math.abs(P.d) > PLAYER_LIMIT) { // guard rail: bounce + scrape sparks
      const sg = Math.sign(P.d); P.d = sg * PLAYER_LIMIT;
      if (P.vd * sg > 0) { if (Math.abs(P.vd) > 2) shake = Math.max(shake, .35); P.vd = -P.vd * .4; }
      P.v -= P.v * .35 * dt;
      if (P.v > 8) window.SFX?.scrape();
      if (P.v > 8 && Math.random() < .7) {
        const sf = frame(P.s + rand(-1.5, 1.5), sg * (PLAYER_LIMIT + .9), tmpF), [gx, gz] = fwd(sf), n = stage >= 3 ? 3 + 3 * QUALITY[quality].fx : 2;
        for (let k = 0; k < n; k++) spawnP(sf.x, rand(.3, .7), sf.z, gx * P.v * rand(.3, .7) - sg * sf.nx * rand(1, 4), rand(1.5, 5), gz * P.v * rand(.3, .7) - sg * sf.nz * rand(1, 4), 2.2, rand(.9, 1.4), .3, rand(.2, .45));
      }
    }
    P.hitCd = Math.max(0, P.hitCd - dt);

    // --- traffic: drivers + rigid bodies
    spawnTraffic(dt);
    for (const c of traffic) {
      if (!c.active) continue;
      if (c.s < P.s - 60 || c.s > P.s + 700) { c.active = false; c.g.visible = false; continue; }
      driveVehicle(c, dt);
    }
    for (let i = 0; i < traffic.length; i++) {
      const a = traffic[i]; if (!a.active) continue;
      for (let k = i + 1; k < traffic.length; k++) {
        const b = traffic[k]; if (!b.active || Math.abs(a.s - b.s) > 16) continue;
        const j = collide(a, b);
        if (j > 4000) { a.recover = Math.max(a.recover, 1.5); b.recover = Math.max(b.recover, 1.5); a.wob = b.wob = 1; contactFX(a, b, j); }
      }
    }
    PB.s = P.s; PB.d = P.d; PB.v = P.v; PB.vd = P.vd;
    for (const c of traffic) {
      if (!c.active || Math.abs(c.s - P.s) > 16) continue;
      const j = collide(PB, c);
      if (j > 0) {
        c.recover = Math.max(c.recover, j > 3000 ? 2.6 : .8); c.wob = Math.min(1.5, c.wob + j / 15000);
        P.yawKick += clamp((P.d - c.d) * j / 4e5, -.2, .2);
        if (j > 3000) { contactFX(PB, c, j); penalize(j); }
      }
    }
    P.s = PB.s; P.d = PB.d; P.v = PB.v; P.vd = PB.vd;
    // --- knockable obstacles (player or traffic)
    for (const o of obstacles) {
      if (o.hit) continue;
      o.g.visible = Math.abs(o.s - P.s) < 520;
      if (Math.abs(o.s - P.s) < 3 && Math.abs(o.d - P.d) < o.w / 2 + .95) { knock(o, P.v, P.vd); P.v *= o.slow; penalize(14000 * (1 - o.slow) / .1); }
      else for (const c of traffic) if (c.active && Math.abs(o.s - c.s) < c.hl + .6 && Math.abs(o.d - c.d) < o.w / 2 + c.hw) { knock(o, c.v, c.vd); break; }
    }
    updateDebris(dt);
    emitSurfaceFX(dt);
    // --- coins
    for (const c of coins) {
      if (c.taken) continue;
      const ds = c.s - P.s;
      c.m.visible = ds > -10 && ds < 520;
      // magnet (stage 3+): nearby coins get pulled in, leaving a sparkle trail
      if (stage >= 3 && ds > -1 && ds < 11 && Math.abs(c.d - P.d) < 4.5) {
        c.mag = Math.min(1, (c.mag || 0) + dt * 3);
        c.d += (P.d - c.d) * Math.min(1, dt * 7 * c.mag); c.s += (P.s + .5 - c.s) * Math.min(1, dt * 4 * c.mag);
        const fm = frame(c.s, c.d, tmpF); c.m.position.x = fm.x; c.m.position.z = fm.z;
        if (QUALITY[quality].fx >= 1 && Math.random() < .9) spawnP(fm.x + rand(-.25, .25), 1 + rand(-.25, .25), fm.z + rand(-.25, .25), 0, .6, 0, C_GOLD[0], C_GOLD[1], C_GOLD[2], .3);
      }
      if (Math.abs(c.s - P.s) < 2.6 && Math.abs(c.d - P.d) < 1.9) {
        c.taken = true; c.m.visible = false; P.coins++; P.score += 100; window.SFX?.coin();
        P.boost = Math.min(100, P.boost + 12); P.fuel = Math.min(100, P.fuel + 4);
        burst(c.m.position.x, 1, c.m.position.z, stage >= 3 ? 12 + 12 * QUALITY[quality].fx : 16, [C_GOLD, C_WHITE, C_GOLD], 7, .6);
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
      phase = 'finishing'; finishAt = performance.now(); window.SFX?.finish();
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
    updateSmoke(dt);
  }

  let miniTimer = 0;
  function showMiniToast(t) {
    hud.zoneToast.textContent = t; hud.zoneToast.classList.add('show');
    clearTimeout(miniTimer); miniTimer = setTimeout(() => hud.zoneToast.classList.remove('show'), 800);
  }

  /* ---------------------------------------------------- scene sync */
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpV = new THREE.Vector3();
  let orbit = 0;
  const _up = new THREE.Vector3(0, 1, 0);
  function sync(dt, t) {
    const f = frame(P.s, P.d, tmpF);
    player.position.set(f.x, 0, f.z);
    player.rotation.y = f.yaw - Math.atan2(P.vd, Math.max(8, Math.abs(P.v))) - P.drift + P.yawKick;
    P.roll = damp(P.roll, -(P.steer * .045 + P.vd * .006) * Math.min(1, Math.abs(P.v) / 40), 6, dt);
    P.pitch = damp(P.pitch, (P.brake * .03) - P.accel * .035, 5, dt);
    // suspension: spring-damper over road bumps and kerbs
    const kerb = Math.abs(P.d) > 8.2 ? 1 : 0;
    const bumpT = ((Math.sin(P.s * 1.9) + Math.sin(P.s * .71 + 1)) * .012 + kerb * Math.sin(P.s * 26) * .04) * Math.min(1, Math.abs(P.v) / 20);
    P.suspV += ((bumpT - P.suspY) * 260 - P.suspV * 16) * Math.min(dt, .05); P.suspY += P.suspV * Math.min(dt, .05);
    playerModel.position.y = P.suspY;
    playerModel.rotation.set(P.pitch + P.suspV * .004, 0, P.roll);
    playerModel.scale.setScalar(damp(playerModel.scale.x, 1, 7, dt));
    playerModel.visible = true;
    for (const w of premiumWheels) w.rotation.x -= P.v * dt / (w.userData.r || .5);
    for (const pv of frontPivots) pv.rotation.y = -P.steer * .42;
    const tailM = premium.userData.tail; if (tailM) tailM.emissiveIntensity = (stage >= 4 ? 2.2 : 1.1) + P.brake * 3.5; // brake lights
    for (const fl of flames) { fl.visible = P.boosting && stage >= 3; if (fl.visible) fl.scale.set(1, 1, .55 + Math.random() * .7); }
    const ind = premium.userData.ind, blink = Math.floor(t * 3.2) % 2 === 0;
    if (ind) { ind[0].emissiveIntensity = P.steer < -.25 && blink ? 3 : 0; ind[1].emissiveIntensity = P.steer > .25 && blink ? 3 : 0; }
    if (premium.userData.rev) premium.userData.rev.emissiveIntensity = P.brake > .5 && P.v < 8 ? 2.5 : 0;
    updateExtraFX(dt, t);

    // traffic: pose, body wobble, wheels, indicators
    const blinkOn = Math.floor(t * 3) % 2 === 0;
    for (const c of traffic) if (c.active) {
      const tf = frame(c.s, c.d, _m); c.g.position.set(tf.x, 0, tf.z); c.g.rotation.y = tf.yaw - c.ang;
      c.body.rotation.z = Math.sin(t * 13 + c.s) * c.wob * .07 - c.vd * .012; c.body.rotation.x = Math.sin(t * 9 + c.d) * c.wob * .04;
      for (const w of c.wheels) w.rotation.x -= c.v * dt / c.r;
      const hazard = c.recover > 0;
      c.indL.visible = blinkOn && (hazard || (c.changing && c.nextLane < c.lane));
      c.indR.visible = blinkOn && (hazard || (c.changing && c.nextLane > c.lane));
    }
    // world life
    for (const cl of cloudList) cl.position.applyAxisAngle(_up, dt * .004);
    updateBirds(dt, t, f); updateCrowds(t); updateTrails();
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
    const sh = (shake * shake * .22 + (P.boosting ? .015 : 0) + (stage >= 3 ? spd * spd * .025 : 0)) * (reduceMotion.matches ? .15 : 1); // collision + subtle speed shake
    camera.position.set(camPos.x + rand(-sh, sh), camPos.y + rand(-sh, sh), camPos.z);
    camera.lookAt(camLook);
    const fov = 60 + spd * 16 + (P.boosting ? 4 : 0);
    if (Math.abs(camera.fov - fov) > .05) { camera.fov = damp(camera.fov, fov, 2.5, dt); camera.updateProjectionMatrix(); }

    // world anchors
    skyGroup.position.set(camera.position.x, 0, camera.position.z);
    ground.position.set(Math.round(camera.position.x / 20) * 20, -.25, Math.round(camera.position.z / 20) * 20);
    const sf = frame(P.s + 10, 0, _m); moon.target.position.set(sf.x, 0, sf.z); moon.position.copy(moon.target.position).add(SUN_OFFSET);
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
    setText(hud.speed, String(Math.round(Math.abs(P.v) * 3.6)));
    setW(hud.prog, P.s / TRACK_LEN);
    setText(hud.fps, String(fpsShown));
    // the number is always REAL measured FPS; the label says when a simulated limit is in effect
    setText(hud.fpsMode, phase === 'race' && (stage === 1 || inStutterZone()) ? 'SIMULATED' : 'REAL');
    if (mg) drawMinimap(performance.now() / 1000);
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
    // REAL rAF rate watchdog (independent of the simulated cap): <20 fps for 3 s -> 2D fallback
    if (onFallback && (phase === 'tutorial' || phase === 'race') && now - tutorialStart > 1500) {
      rafCount++;
      if (now - rafT0 >= 1000) { slowSecs = rafCount * 1000 / (now - rafT0) < 20 ? slowSecs + 1 : 0; rafCount = 0; rafT0 = now; if (slowSecs >= 3) { stop(); onFallback('slow'); return; } }
    } else { rafCount = 0; rafT0 = now; slowSecs = 0; }
    if (!demoMode && document.body.classList.contains('touch') && portraitMQ.matches) { lastT = now; return; } // paused behind "rotate" overlay
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
        hud.go.classList.remove('show'); void hud.go.offsetWidth; hud.go.classList.add('show'); window.SFX?.go();
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
    if (demoMode && phase === 'race') autopilot();
    if (!demoMode && phase === 'race' && (keys.gas || keys.brake || keys.left || keys.right || keys.boost) && now - lastActivityPing > 1000) {
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
    uTime.value = t;
    const Q = QUALITY[quality];
    if (stage >= 3 && Q.cube && (cubeFrame++ % Q.cube === 0)) updateCube();
    renderer.shadowMap.needsUpdate = true;
    if (stage >= 4) composer.render(dt); else renderer.render(scene, camera);
    updateHUD();
    // sound: engine pitch follows speed (real sim, so it also stutters in the lag zone), tyre skid, boost whoosh
    if (window.SFX) {
      SFX.engine(Math.abs(P.v) / V_BOOST, P.boosting, phase === 'race' || phase === 'finishing' || phase === 'tutorial');
      SFX.skid(phase === 'race' && ((P.slip > 2.2 && P.v > 30) || (P.brake > .7 && P.v > 25)) ? 1 : 0);
      if (P.boosting && !wasBoosting) SFX.boost();
      wasBoosting = P.boosting;
    }
    boostHint?.update(now, { racing: phase === 'race' && !demoMode, boosting: P.boosting, boostReady: P.boost >= 50, straight: Math.abs(slope(P.s + 60) - slope(P.s)) < .03 });
    if (!shotBefore && stage === 1 && phase === 'race' && P.time > 1.2) { shotBefore = true; snap('res-before'); }
    if (wantAfterShot) { wantAfterShot = false; snap('res-after'); hud.results.classList.add('show'); }

    // ---- REAL fps measurement (rendered frames / second)
    fpsFrames++;
    if (now - fpsT0 >= 500) { fpsShown = Math.round(fpsFrames * 1000 / (now - fpsT0)); fpsFrames = 0; fpsT0 = now; }

    lastRendered = true;
  }

  function showResults() {
    if (phase === 'done') return;
    if (demoMode) { demo(); return; }
    phase = 'done';
    document.dispatchEvent(new CustomEvent('race-finished', { detail: { time: P.time + P.penalty } }));
    wantAfterShot = true; // captured right after the next render, then the card opens
  }

  /* ------------------------------------------------------ public API */
  function warmUp() {
    // pre-compile hi-quality shaders + post-processing so upgrades don't hitch
    try {
      traffic.forEach(c => { c.g.visible = true; c.g.position.set(0, -50, 0); });
      stage = 4; applyVisualStage(); sync(0.016, 0); renderer.compile(scene, camera); composer.render(0.016);
      traffic.forEach(c => { c.g.visible = false; });
      stage = 3; applyVisualStage(); renderer.render(scene, camera);
      stage = 1; applyVisualStage(); renderer.render(scene, camera);
    } catch (e) { console.warn('Warm-up skipped:', e); }
  }

  /* ---- attract-mode autopilot: pick the lane with the most free road ahead */
  function autopilot() {
    const look = 40 + P.v * 1.1;
    const clearOf = ld => {
      let c = look;
      for (const t of traffic) if (t.active && Math.abs(t.d - ld) < 2.8 && t.s > P.s - 4) c = Math.min(c, t.s - t.hl - P.s);
      for (const o of obstacles) if (!o.hit && Math.abs(o.d - ld) < o.w / 2 + 1.8 && o.s > P.s - 3) c = Math.min(c, o.s - P.s);
      return c;
    };
    let best = aiLane, bestC = clearOf(aiLane);
    const cur = bestC;
    for (const ld of LANES) { const c = clearOf(ld) - Math.abs(ld - P.d) * .8; if (c > bestC + 6) { best = ld; bestC = c; } }
    aiLane = best;
    const err = aiLane - P.d;
    keys.left = err < -.5; keys.right = err > .5; keys.gas = true;
    keys.brake = cur < 14 && Math.abs(err) > 1 && P.v > 22;
    keys.boost = P.boost > 30 && cur >= look - 1 && Math.abs(err) < 1;
  }
  /** Silent attract loop: AI-max stage (all upgrades), AI-driven car, restarts at the finish. */
  function demo() {
    restart(); demoMode = true; aiLane = P.d;
    hud.tutorial.classList.remove('show'); phase = 'race';
    upCoins.forEach(u => { u.taken = true; u.g.visible = false; });
    slots.forEach(x => x.classList.add('on')); cps.forEach(c => c.classList.add('got'));
    P.ups = 3; P.v = 30; stage = 4; setText(hud.system, UPGRADES[2].system); hud.system.classList.add('ai');
    applyVisualStage();
  }

  function restart() {
    demoMode = false;
    hud.results.classList.remove('show');
    hud.error.classList.remove('show');
    hud.toast.classList.remove('show');
    hud.zoneToast.classList.remove('show');
    Object.keys(keys).forEach(k => keys[k] = false);
    root.querySelectorAll('.tc-btn.held').forEach(b => b.classList.remove('held'));
    resetState();
    shotBefore = false; wantAfterShot = false; slowUntil = 0; hud.wipe?.classList.remove('run');
    phase = 'tutorial'; tutorialStart = performance.now(); orbit = 0; boostHint?.reset();
    hud.tutorial.classList.add('show');
    hud.tutBar.style.width = '0%';
    running = true;
    pending = 0; lastT = performance.now(); fpsT0 = lastT; fpsFrames = 0; fpsShown = 0; natT0 = lastT; lastRendered = false;
    sync(0.016, lastT / 1000); camInit = false; sync(0.016, lastT / 1000);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false; phase = 'idle'; demoMode = false;
    cancelAnimationFrame(raf); raf = 0; window.SFX?.stopLoops(); boostHint?.reset();
    Object.keys(keys).forEach(k => keys[k] = false);
    hud.tutorial.classList.remove('show');
    hud.results.classList.remove('show');
    hud.toast.classList.remove('show');
    hud.zoneToast.classList.remove('show');
  }

  const ro = new ResizeObserver(() => { if (running) applySize(); });
  ro.observe(root);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); onFallback ? onFallback('context-lost') : hud.error.classList.add('show'); });

  resetState();
  warmUp();

  const api = {
    restart, stop, demo,
    get debug() { return { P, stage, phase, quality, fps: fpsShown, upgrades: P.ups, keys: { ...keys } }; },
    _jump(s) { P.s = s; nextTrafficS = Math.max(nextTrafficS, s + 60); },
    _cars() { return traffic.filter(c => c.active).map(c => ({ s: c.s, d: c.d })); },
    get _hint() { return boostHint ? { count: boostHint.count, visible: boostHint.visible } : null; }
  };
  window.__game = api;
  return api;
}

  return { createGame };
};
