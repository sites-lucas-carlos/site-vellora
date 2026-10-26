/* ==========================================================================
   VELLORA: stream de partículas da página (three.js)
   Uma faixa de partículas e filamentos violeta que desce a página inteira,
   desenhada num canvas fixo do tamanho da tela (mix-blend: screen) e lida
   através da placa de vidro. Shaders e parâmetros do template Relay; cores
   vindas dos tokens --stream-* do CSS.
   ========================================================================== */
(() => {
'use strict';

const CONFIG = {
  particles: 36000, lowShare: 0.45, strands: 44,
  flowPx: 90, scrollFlow: 1.25,
  spread: 8, spreadEnds: 190, turnHold: 0.5, pinchReach: 300,
  breath: 0.35, breathWavelength: 900, breathSpeed: 0.6,
  spraySpread: 2.4, bokehSpread: 3.2, dustSpread: 5.5,
  wobble: 4,
  size: 2.1, focal: 0.15, dof: 0.55, dofSize: 2.2, twinkle: 2.4,
  brightness: 0.64, heat: 0.85,
  altShare: 0.3, altStrands: 0.22,
  lineBase: 0.16, lineSpread: 0.9,
  lineWavelength: 1560, lineWaveAmp: 0.22, lineWaveSpeed: 0.25,
  pulseSpacing: 1130, pulseSpeed: 205, pulseGain: 1.3, pulseSharp: 9,
  parallax: 0.22,
  revealPx: 2600, revealMs: 2200,
  bloomStr: 0.55, bloomRadius: 0.57, bloomThresh: 0.08,
};
const SAMPLES = 2048;
const SEGMENTS = 1400;
const CAM_Z = 6, FOV = 35, DAMP = 3.2;
const TURN_BASE = 12, TURN_HOLD = 28, TURN_SMOOTH = 48, TURN_OPEN = 1e4;
const REVEALED = 1e7;
const DPR = { full: 1.35, low: 1.2 };
const HALF_H = CAM_Z * Math.tan(((FOV / 2) * Math.PI) / 180);
const SHIFT = 200 / 1440;

/* Caminho ancorado nos blocos da Vellora (x: fração da coluna; y: fração do bloco) */
const HERO = {
  1440: [{ at: 'inicio', x: 1.14, y: -0.46, z: -2.6 }, { at: 'inicio', x: 0.84, y: 0.02, z: -1.8 }, { at: 'inicio', x: 0.52, y: 0.36, z: -0.9 }, { at: 'inicio', x: 0.3, y: 0.9, z: 0, pinch: 1 }],
  1024: [{ at: 'inicio', x: 1.08, y: -0.4, z: -2.6 }, { at: 'inicio', x: 0.86, y: 0.03, z: -1.8 }, { at: 'inicio', x: 0.52, y: 0.4, z: -0.9 }, { at: 'inicio', x: 0.32, y: 0.88, z: 0, pinch: 1 }],
  768: [{ at: 'inicio', x: 1.08, y: 0.12, z: -2.4 }, { at: 'inicio', x: 0.8, y: 0.4, z: -1.6 }, { at: 'inicio', x: 0.3, y: 0.6, z: -0.8 }, { at: 'inicio', x: -0.02, y: 0.8, z: 0, pinch: 1 }],
  390: [{ at: 'inicio', x: 1.1, y: 0.2, z: -2.4 }, { at: 'inicio', x: 0.75, y: 0.45, z: -1.6 }, { at: 'inicio', x: 0.25, y: 0.65, z: -0.8 }, { at: 'inicio', x: -0.02, y: 0.84, z: 0, pinch: 1 }],
};
const TAIL = [
  { at: 'segmentos', x: 0.5, y: -0.06, z: 0 },
  { at: 'segmentos', x: 0.605, y: 0.54, z: -0.2 },
  { at: 'servicos', x: 0.5, y: 0.12, z: 0.2 },
  { at: 'servicos', x: -0.06, y: 0.5, z: 0.2, pinch: 1 },
  { at: 'sobre', x: 0.5, y: 0.3, z: -0.5 },
  { at: 'diferenciais', x: 0.92, y: 0.9, z: 0.2, pinch: 1 },
  { at: 'trabalhos', x: 0.4, y: 0.75, z: -0.4 },
  { at: 'processo', x: -0.06, y: 0.6, z: 0.2, pinch: 1 },
  { at: 'duvidas', x: 0.46, y: -0.1, z: -0.2 },
  { at: 'duvidas', x: 0.96, y: 0.35, z: 0.1, pinch: 0.8 },
  { at: 'duvidas', x: 0.48, y: 0.85, z: 0 },
  { at: 'duvidas', x: -0.49, y: 1.04, z: 0 },
];
const PATH = { 1440: [...HERO[1440], ...TAIL], 1024: [...HERO[1024], ...TAIL], 768: [...HERO[768], ...TAIL], 390: [...HERO[390], ...TAIL] };

const PRELUDE = /* glsl */`
  uniform sampler2D uCurve;
  uniform float uHalfH, uCamZ, uPx, uLen;
  uniform vec3 uView; // half viewport width, half height (CSS px), scrollY
  vec4 curveRow(float u, float row) {
    float x = clamp(u, 0.0, 1.0) * ${SAMPLES - 1}.0;
    float i = floor(x);
    float v = (row + 0.5) / 2.0;
    vec4 a = texture2D(uCurve, vec2((i + 0.5) / ${SAMPLES}.0, v));
    vec4 b = texture2D(uCurve, vec2((min(i + 1.0, ${SAMPLES - 1}.0) + 0.5) / ${SAMPLES}.0, v));
    return mix(a, b, x - i);
  }
  // a point offset from the spine: o.x across it (design px), o.y in depth
  vec3 onSpine(float u, vec2 o) {
    vec4 p = curveRow(u, 0.0);
    vec2 n = curveRow(u, 1.0).xy;
    vec2 page = p.xy + n * o.x * uPx * uView.y;
    return vec3(
      (page.x - uView.x) / uView.y,
      (uView.y - (page.y - uView.z)) / uView.y,
      p.z + o.y * uPx
    );
  }
  uniform float uTurnHold, uBreath, uBreathWave, uBreathSpeed, uTimeS;
  // stream radius at u (design px): pinched, breathing, held under the turn
  float widthAt(float u, float pinch, float narrow, float wide) {
    float a = u * uLen;
    float swell = 1.0 + uBreath * sin(a / uBreathWave * 6.2831 - uTimeS * uBreathSpeed);
    float w = mix(wide, narrow, pinch) * swell;
    // a soft min: a hard one kinks the outer strands where it takes over
    float r = max(curveRow(u, 1.0).z * uTurnHold, 1.0);
    return w * r / pow(pow(w, 4.0) + pow(r, 4.0), 0.25);
  }
  vec3 toWorld(vec3 s) {
    float k = (uCamZ - s.z) / uCamZ;
    return vec3(s.x * uHalfH * k, s.y * uHalfH * k, s.z);
  }
`;

const POINTS_VERT = PRELUDE + /* glsl */`
  attribute float aU;
  attribute float aSeed;
  attribute float aSize;
  attribute float aKind;
  attribute vec2 aOff;
  uniform float uTime, uFlow, uScrollU, uRevealPx, uFadeIn, uFadeOut, uSpread,
    uSpreadEnds, uSpray, uBokeh, uDust, uWobble, uSize, uScale, uFocal, uDof,
    uDofSize, uTwinkle, uHeat, uAltShare;
  uniform vec3 uColMain, uColAlt, uColCore, uColDeep, uColSpark;
  varying vec3 vColor;
  varying float vBlur;
  void main() {
    float ph = aSeed * 6.2831;
    // stream (0) and spray (1) ride at speed; bokeh (2) and dust (3) drift
    float speed = (aKind < 1.5 ? 1.0 : 0.3) * (0.65 + 0.7 * fract(aSeed * 7.13));
    float u = fract(aU + uTime * uFlow * speed + uScrollU);
    float pinch = curveRow(u, 0.0).w;
    float spread = widthAt(u, pinch, uSpread, uSpreadEnds);
    if (aKind > 2.5) spread *= uDust;
    else if (aKind > 1.5) spread *= uBokeh;
    else if (aKind > 0.5) spread *= uSpray;
    vec2 o = aOff * spread
      + vec2(sin(uTime * 0.7 + ph), cos(uTime * 0.6 + ph * 1.3)) * uWobble;
    vec3 s = onSpine(u, o);
    s.z += position.z; // bokeh sits toward the camera, dust away from it
    float a = u * uLen;
    float fade = smoothstep(0.0, uFadeIn, a) * smoothstep(uLen, uLen - uFadeOut, a)
      * smoothstep(uRevealPx, uRevealPx - 220.0, a);
    float heat = pinch * (aKind < 1.5 ? 1.0 : 0.3);
    // a share of the motes carry the second hue
    vec3 hue = fract(aSeed * 3.77) < uAltShare ? uColAlt : uColMain;
    vec3 base = mix(uColDeep, hue, 0.55 + 0.45 * fract(aSeed * 5.31));
    vec4 mv = modelViewMatrix * vec4(toWorld(s), 1.0);
    float depth = -mv.z;
    float blur = clamp(abs(depth - (uCamZ - uFocal)) * uDof, 0.0, 1.0);
    if (aKind > 1.5 && aKind < 2.5) blur = max(blur, 0.8);
    vBlur = blur;
    float tw = 0.55 + 0.45 * sin(uTime * uTwinkle + ph);
    vec3 c = mix(base, uColCore, clamp(heat * 0.85, 0.0, 1.0)) * (1.0 + heat * uHeat);
    if (fract(aSeed * 13.7) < 0.05) c = uColSpark * 1.3;
    // a blurred mote spreads the same light over a bigger disc
    float spreadOut = 1.0 + blur * uDofSize;
    vColor = c * fade * tw / (spreadOut * spreadOut);
    gl_PointSize = uSize * aSize * uScale * (uCamZ / depth) * spreadOut;
    gl_Position = projectionMatrix * mv;
  }
`;

const POINTS_FRAG = /* glsl */`
  uniform float uBright;
  varying vec3 vColor;
  varying float vBlur;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    // sharp glint in focus, soft rimmed disc out of it
    float glint = exp(-r * r * 6.0);
    float disc = smoothstep(1.0, 0.6, r) * 0.5
      + smoothstep(0.5, 0.92, r) * (1.0 - smoothstep(0.9, 1.0, r)) * 0.55;
    gl_FragColor = vec4(vColor * mix(glint, disc, vBlur) * uBright, 1.0);
  }
`;

const LINES_VERT = PRELUDE + /* glsl */`
  attribute float aU;
  attribute vec4 aStrand; // x normal offset, y depth offset, z phase, w end
  uniform float uTime, uRevealPx, uFadeIn, uFadeOut, uSpread, uSpreadEnds,
    uLineSpread, uLineWavelength, uLineWaveAmp, uLineWaveSpeed, uPulseGain,
    uLineBase, uHeat, uAltStrands;
  uniform vec3 uColMain, uColAlt, uColCore, uColDeep;
  varying vec3 vColor;
  varying vec3 vPulse;
  varying float vA;
  varying float vPhase;
  void main() {
    float u = aU;
    float a = u * uLen;
    float pinch = curveRow(u, 0.0).w;
    float spread = widthAt(u, pinch, uSpread, uSpreadEnds) * uLineSpread;
    float wave = sin(a / uLineWavelength * 6.2831 + aStrand.z + uTime * uLineWaveSpeed) * uLineWaveAmp;
    vec3 s = onSpine(u, vec2(aStrand.x + wave, aStrand.y) * spread);
    float fade = smoothstep(0.0, uFadeIn, a) * smoothstep(uLen * aStrand.w, uLen * aStrand.w - uFadeOut, a)
      * smoothstep(uRevealPx, uRevealPx - 260.0, a);
    // a share of the strands run in the second hue
    vec3 hue = fract(aStrand.z * 1.618) < uAltStrands ? uColAlt : uColMain;
    vec3 c = mix(mix(uColDeep, hue, 0.75), uColCore, pinch * 0.6);
    vColor = c * fade * uLineBase * (1.0 + pinch * uHeat);
    vPulse = c * fade * uPulseGain;
    // the pulse is placed per fragment from the arc length — per vertex it
    // hopped from vertex to vertex
    vA = a;
    vPhase = aStrand.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(toWorld(s), 1.0);
  }
`;

const LINES_FRAG = /* glsl */`
  uniform float uBright, uPulseSpacing, uPulseShift, uPulseSharp;
  varying vec3 vColor;
  varying vec3 vPulse;
  varying float vA;
  varying float vPhase;
  void main() {
    float p = fract((vA - uPulseShift) / uPulseSpacing + vPhase) - 0.5;
    float pulse = exp(-p * p * uPulseSharp * uPulseSharp);
    gl_FragColor = vec4((vColor + vPulse * pulse) * uBright, 1.0);
  }
`;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const idle = () => new Promise((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r(), { timeout: 120 }) : setTimeout(r, 0)));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function slideMin(arr, rad) {
  const n = arr.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let j = Math.max(0, i - rad); j <= Math.min(n - 1, i + rad); j++) if (arr[j] < m) m = arr[j];
    out[i] = m;
  }
  return out;
}
function slideMean(arr, rad) {
  const n = arr.length, out = new Float32Array(n);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - rad), b = Math.min(n - 1, i + rad);
    out[i] = (pre[b + 1] - pre[a]) / (b - a + 1);
  }
  return out;
}

async function create(canvas, opts) {
  const THREE = await import('three');
  const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
  ]);
  const main = opts.main;
  let tier = opts.tier || 'full';
  let unit = opts.unit();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.set(0, 0, CAM_Z);

  const css = getComputedStyle(document.documentElement);
  const col = (name, fb) => new THREE.Color((css.getPropertyValue(name) || fb).trim() || fb);
  const shared = {
    uCurve: { value: null }, uHalfH: { value: HALF_H }, uCamZ: { value: CAM_Z }, uPx: { value: 1 }, uLen: { value: 1 },
    uView: { value: new THREE.Vector3(1, 1, 0) }, uTime: { value: 0 }, uTimeS: { value: 0 },
    uTurnHold: { value: CONFIG.turnHold }, uBreath: { value: CONFIG.breath }, uBreathWave: { value: CONFIG.breathWavelength }, uBreathSpeed: { value: CONFIG.breathSpeed },
    uRevealPx: { value: 0 }, uFadeIn: { value: 120 }, uFadeOut: { value: 400 },
    uSpread: { value: CONFIG.spread }, uSpreadEnds: { value: CONFIG.spreadEnds }, uHeat: { value: CONFIG.heat }, uBright: { value: CONFIG.brightness },
    uColMain: { value: col('--stream-main', '#7B3FFF') }, uColAlt: { value: col('--stream-alt', '#4C6BFF') }, uAltShare: { value: CONFIG.altShare },
    uColCore: { value: col('--stream-core', '#D9CEFF') }, uColDeep: { value: col('--stream-deep', '#2A0F8F') }, uColSpark: { value: col('--stream-spark', '#F4F1FF') },
  };

  /* --- pontos --- */
  await idle();
  const N = CONFIG.particles, rand = mulberry32(0x5eed1e);
  const kinds = new Float32Array(N);
  const counts = [Math.round(N * 0.79), Math.round(N * 0.14), Math.round(N * 0.03)];
  counts.push(N - counts[0] - counts[1] - counts[2]);
  let w = 0;
  counts.forEach((c, k) => { for (let i = 0; i < c; i++) kinds[w++] = k; });
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t; }
  const aU = new Float32Array(N), aSeed = new Float32Array(N), aOff = new Float32Array(N * 2), aSize = new Float32Array(N), pos = new Float32Array(N * 3);
  const gauss = () => rand() + rand() + rand() + rand() - 2;
  for (let i = 0; i < N; i++) {
    aU[i] = rand(); aSeed[i] = rand();
    aOff[i * 2] = gauss() * 0.5; aOff[i * 2 + 1] = gauss() * 0.5;
    const k = kinds[i];
    if (k === 0) aSize[i] = 0.35 + Math.pow(rand(), 4) * 2.4;
    else if (k === 1) aSize[i] = 0.3 + rand() * 0.6;
    else if (k === 2) { aSize[i] = 1.2 + rand() * 1.6; pos[i * 3 + 2] = 1.0 + rand() * 1.4; }
    else { aSize[i] = 0.25 + rand() * 0.4; pos[i * 3 + 2] = -1.2 + rand() * 1.0; }
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
  pg.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  pg.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  pg.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  pg.setAttribute('aOff', new THREE.BufferAttribute(aOff, 2));
  const pUniforms = Object.assign({}, shared, {
    uFlow: { value: 0 }, uScrollU: { value: 0 }, uSpray: { value: CONFIG.spraySpread }, uBokeh: { value: CONFIG.bokehSpread }, uDust: { value: CONFIG.dustSpread },
    uWobble: { value: CONFIG.wobble }, uSize: { value: CONFIG.size }, uScale: { value: 1 }, uFocal: { value: CONFIG.focal }, uDof: { value: CONFIG.dof },
    uDofSize: { value: CONFIG.dofSize }, uTwinkle: { value: CONFIG.twinkle },
  });
  const pm = new THREE.ShaderMaterial({ uniforms: pUniforms, vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false });
  const points = new THREE.Points(pg, pm);
  points.frustumCulled = false;
  scene.add(points);

  /* --- filamentos --- */
  await idle();
  const S = CONFIG.strands, rl = mulberry32(0xf11a), V = S * (SEGMENTS + 1);
  const lU = new Float32Array(V), lStrand = new Float32Array(V * 4), lPos = new Float32Array(V * 3);
  const index = new Uint32Array(S * SEGMENTS * 2);
  let ii = 0;
  for (let s = 0; s < S; s++) {
    const nx = (rl() - 0.5) * 2, nz = (rl() - 0.5) * 1.2, phase = rl() * Math.PI * 2, end = 0.93 + rl() * 0.07;
    const base = s * (SEGMENTS + 1);
    for (let i = 0; i <= SEGMENTS; i++) {
      const v = base + i;
      lU[v] = i / SEGMENTS;
      lStrand[v * 4] = nx; lStrand[v * 4 + 1] = nz; lStrand[v * 4 + 2] = phase; lStrand[v * 4 + 3] = end;
      if (i < SEGMENTS) { index[ii++] = v; index[ii++] = v + 1; }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
  lg.setAttribute('aU', new THREE.BufferAttribute(lU, 1));
  lg.setAttribute('aStrand', new THREE.BufferAttribute(lStrand, 4));
  lg.setIndex(new THREE.BufferAttribute(index, 1));
  const lUniforms = Object.assign({}, shared, {
    uPulseShift: { value: 0 }, uPulseSharp: { value: CONFIG.pulseSharp }, uAltStrands: { value: CONFIG.altStrands }, uLineSpread: { value: CONFIG.lineSpread },
    uLineWavelength: { value: CONFIG.lineWavelength }, uLineWaveAmp: { value: CONFIG.lineWaveAmp }, uLineWaveSpeed: { value: CONFIG.lineWaveSpeed },
    uPulseSpacing: { value: CONFIG.pulseSpacing }, uPulseGain: { value: CONFIG.pulseGain }, uLineBase: { value: CONFIG.lineBase },
  });
  const lm = new THREE.ShaderMaterial({ uniforms: lUniforms, vertexShader: LINES_VERT, fragmentShader: LINES_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false });
  const lines = new THREE.LineSegments(lg, lm);
  lines.frustumCulled = false;
  scene.add(lines);

  /* --- pós-processamento --- */
  await idle();
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), CONFIG.bloomStr, CONFIG.bloomRadius, CONFIG.bloomThresh);
  composer.addPass(bloom);
  const output = new OutputPass();
  composer.addPass(output);

  /* --- curva (espinha) em textura --- */
  let curveTex = null;
  function blockOf(el) {
    for (let n = el.parentElement; n && n !== main; n = n.parentElement) if (getComputedStyle(n).position === 'sticky') return n.parentElement;
    return el;
  }
  const docTop = (el) => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
  function resolve() {
    const column = main.getBoundingClientRect(), list = PATH[opts.frame()] || PATH[1440], out = [];
    for (const p of list) {
      const el = document.getElementById(p.at);
      if (!el) continue;
      const block = blockOf(el);
      out.push({ x: column.left + (p.x + SHIFT) * column.width, y: docTop(block) + p.y * block.offsetHeight, z: p.z, pinch: p.pinch || 0 });
    }
    return out;
  }
  function bake() {
    unit = opts.unit();
    const pts = resolve();
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)), false, 'centripetal');
    const length = Math.max(1, curve.getLength());
    const angle = new Float32Array(SAMPLES), P = new Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      const u = i / (SAMPLES - 1);
      P[i] = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      angle[i] = Math.atan2(t.y, t.x);
    }
    const step = length / (SAMPLES - 1), r = new Float32Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      let turn = Math.abs(angle[Math.min(SAMPLES - 1, i + TURN_BASE)] - angle[Math.max(0, i - TURN_BASE)]);
      if (turn > Math.PI) turn = Math.PI * 2 - turn;
      r[i] = Math.min(TURN_OPEN, (2 * TURN_BASE * step) / Math.max(1e-4, turn) / unit);
    }
    const held = slideMean(slideMean(slideMin(r, TURN_HOLD), TURN_SMOOTH), TURN_SMOOTH);
    const peaks = [];
    pts.forEach((p) => {
      if (!p.pinch) return;
      let best = 0, bd = Infinity;
      for (let i = 0; i < SAMPLES; i++) { const d = (P[i].x - p.x) ** 2 + (P[i].y - p.y) ** 2; if (d < bd) { bd = d; best = i; } }
      peaks.push({ at: best / (SAMPLES - 1), pinch: p.pinch });
    });
    const data = new Float32Array(SAMPLES * 2 * 4);
    for (let i = 0; i < SAMPLES; i++) {
      const at = i / (SAMPLES - 1);
      let pinch = 0;
      for (const pk of peaks) { const d = (at - pk.at) * length / (CONFIG.pinchReach * unit); pinch = Math.max(pinch, pk.pinch * Math.exp(-d * d)); }
      data[i * 4] = P[i].x; data[i * 4 + 1] = P[i].y; data[i * 4 + 2] = P[i].z; data[i * 4 + 3] = pinch;
      const o = (SAMPLES + i) * 4;
      data[o] = -Math.sin(angle[i]); data[o + 1] = Math.cos(angle[i]); data[o + 2] = held[i]; data[o + 3] = 0;
    }
    if (curveTex) curveTex.dispose();
    curveTex = new THREE.DataTexture(data, SAMPLES, 2, THREE.RGBAFormat, THREE.FloatType);
    curveTex.minFilter = curveTex.magFilter = THREE.NearestFilter;
    curveTex.needsUpdate = true;
    shared.uCurve.value = curveTex;
    shared.uLen.value = length;
    shared.uFadeOut.value = Math.min(length / 4, 400 * unit);
    pUniforms.uFlow.value = (CONFIG.flowPx * unit) / length;
  }

  /* --- tamanho e qualidade --- */
  let W = 1, H = 1, dpr = 1;
  function retune(t) {
    tier = t;
    const low = t === 'low';
    pg.setDrawRange(0, Math.floor(N * (low ? CONFIG.lowShare : 1)));
    lg.setDrawRange(0, Math.ceil(S * (low ? 0.6 : 1)) * SEGMENTS * 2);
  }
  function resize(w, h, t) {
    if (t && t !== tier) retune(t);
    W = Math.max(1, w); H = Math.max(1, h);
    dpr = Math.min(window.devicePixelRatio || 1, DPR[tier]);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(dpr);
    composer.setSize(W, H);
    if (tier === 'low') bloom.setSize(Math.ceil(W * dpr * 0.5), Math.ceil(H * dpr * 0.5));
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    unit = opts.unit();
    pUniforms.uScale.value = unit * dpr;
    shared.uPx.value = unit / (H / 2);
    shared.uFadeIn.value = 120 * unit;
    lUniforms.uLineWavelength.value = CONFIG.lineWavelength * unit;
    lUniforms.uPulseSpacing.value = CONFIG.pulseSpacing * unit;
    shared.uBreathWave.value = CONFIG.breathWavelength * unit;
    bake();
  }
  retune(tier);
  resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight, tier);

  /* --- pré-aquecimento: nada compila com a página já viva --- */
  await idle();
  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    const mats = [bloom.materialHighPassFilter, ...(bloom.separableBlurMaterials || []), bloom.compositeMaterial, bloom.blendMaterial, output.material, composer.copyPass && composer.copyPass.material].filter(Boolean);
    const warm = new THREE.Scene();
    const plane = new THREE.PlaneGeometry(2, 2);
    mats.forEach((m) => warm.add(new THREE.Mesh(plane, m)));
    if (renderer.compileAsync) await renderer.compileAsync(warm, camera);
    plane.dispose();
  } catch (e) { /* o pré-aquecimento é só otimização */ }

  /* --- estado por quadro --- */
  const pointer = new THREE.Vector2(0, 0), look = new THREE.Vector2(0, 0);
  let lastTime = -1, revealStart = -1, scrollPx = 0, lastScroll = 0, scrollY = 0;
  function render(now) {
    const dt = lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    look.lerp(pointer, 1 - Math.exp(-DAMP * dt));
    camera.position.set(-look.x * CONFIG.parallax, look.y * CONFIG.parallax, CAM_Z);
    camera.lookAt(0, 0, 0);
    const t = revealStart < 0 ? 0 : Math.min(1, (now - revealStart) / CONFIG.revealMs);
    shared.uRevealPx.value = t >= 1 ? REVEALED : easeOutCubic(t) * CONFIG.revealPx * unit;
    shared.uTime.value = now / 1000;
    shared.uTimeS.value = (now / 1000) % 1000;
    shared.uView.value.set(W / 2, H / 2, scrollY);
    pUniforms.uScrollU.value = (scrollPx / shared.uLen.value) % 1;
    const spacing = CONFIG.pulseSpacing * unit;
    lUniforms.uPulseShift.value = ((now / 1000) * CONFIG.pulseSpeed * unit + scrollPx) % spacing;
    composer.render(dt);
  }
  render(0);

  return {
    resize,
    rebake: bake,
    render,
    reveal(now, instant) { revealStart = instant ? now - CONFIG.revealMs : now; },
    setScroll(y) { scrollPx += Math.abs(y - lastScroll) * CONFIG.scrollFlow; lastScroll = y; scrollY = y; },
    setPointer(x, y) { pointer.set(x, y); },
  };
}

window.VelloraStream = { create };
})();
