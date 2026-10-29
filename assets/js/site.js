/* ==========================================================================
   VELLORA: script do site
   Motor de movimento herdado do template Relay (molas no lugar de keyframes,
   ticker único, "seen" por IntersectionObserver), adaptado à Vellora.
   ========================================================================== */
(() => {
'use strict';

/* --------------------------------------------------------------------------
   CONTATOS: preencha para ativar os botões, os links e o envio da mensagem.
   A janela "Fale com a gente" monta a mensagem e abre o WhatsApp (ou o e-mail)
   com o texto pronto. Enquanto tudo estiver vazio, ela oferece copiar o texto.
-------------------------------------------------------------------------- */
const CONTATO = {
  whatsapp: '',  // só números, com DDI e DDD. Ex.: 5561912345678
  instagram: 'vellora.marketing', // usuário sem @. Ex.: vellora
  email: 'velloramarketingg@gmail.com' // provisório. Ex.: contato@vellora.com.br
};

/* ---------- Ambiente ---------- */
const d = document.documentElement;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BOT = 'bot' in d.dataset;
const MOTION = !RM && !BOT;
const FINE = matchMedia('(hover: hover) and (pointer: fine)');
const COARSE = matchMedia('(hover: none) and (pointer: coarse)');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const E = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuad: (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
const frame = () => { const w = innerWidth; return w <= 580 ? 390 : w <= 900 ? 768 : w <= 1200 ? 1024 : 1440; };
let UNIT = 1;
const measureUnit = () => { UNIT = (parseFloat(getComputedStyle(d).fontSize) || 16) / 16; };
measureUnit();

function docTop(el) { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; }

/* ==========================================================================
   Ticker único + molas (integração do react-spring: passos de 1 ms)
   ========================================================================== */
const SPRING = { tension: 280, friction: 32 };
const SOFT = { tension: 120, friction: 26 };
const STEP = 70;
const GROW = { tension: 180, friction: 31.72, clamp: true };
const QUICK = { tension: 420, friction: 39.04 };
const POP = { tension: 420, friction: 14 };

const motions = new Set();
const subs = new Set();
let rafId = 0, lastStep = 0;

function loop(now) {
  rafId = 0;
  if (motions.size) {
    const dt = lastStep ? Math.min(64, Math.max(0, now - lastStep)) : 16;
    lastStep = now;
    for (const m of motions) if (!m._step(dt, now)) motions.delete(m);
    if (!motions.size) lastStep = 0;
  }
  for (const s of subs) if (now - s.last >= s.gap) { s.last = now; s.fn(now); }
  if (motions.size || subs.size) rafId = requestAnimationFrame(loop);
}
function wake() { if (!rafId) rafId = requestAnimationFrame(loop); }
function onFrame(fn, gap = 0) { const s = { fn, gap, last: -1e9 }; subs.add(s); wake(); return () => subs.delete(s); }

class Motion {
  constructor(init, render, cfg = SPRING) {
    this.v = Object.assign({}, init);
    this.s = {};
    this.render = render;
    this.cfg = cfg;
    this.timers = [];
    this.rest = null;
    for (const k in init) this.s[k] = { to: init[k], from: init[k], vel: 0, done: true, cfg, timed: null };
    if (render) render(this.v);
  }
  to(target, o = {}) {
    const imm = o.immediate != null ? o.immediate : !MOTION;
    if (o.delay > 0 && !imm) { this.timers.push(setTimeout(() => this._go(target, o, false), o.delay)); return this; }
    this._go(target, o, imm);
    return this;
  }
  set(target) { this.cancel(); this._go(target, {}, true); return this; }
  cancel() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    this.rest = null;
    return this;
  }
  _go(target, o, imm) {
    const cfg = o.cfg || this.cfg, now = performance.now();
    for (const k in target) {
      let s = this.s[k];
      if (!s) { s = this.s[k] = { to: target[k], from: target[k], vel: 0, done: true, cfg, timed: null }; this.v[k] = target[k]; }
      s.from = this.v[k]; s.to = target[k]; s.cfg = cfg;
      if (imm) { this.v[k] = s.to; s.vel = 0; s.done = true; s.timed = null; continue; }
      if (cfg.duration != null) { s.timed = { start: now, dur: cfg.duration, ease: cfg.easing || E.linear, from: this.v[k] }; s.vel = 0; }
      else s.timed = null;
      s.done = false;
    }
    this.rest = o.onRest || null;
    if (imm) {
      if (this.render) this.render(this.v);
      const cb = this.rest; this.rest = null; if (cb) cb();
      return;
    }
    motions.add(this); wake();
  }
  _step(dt, now) {
    let moving = false;
    for (const k in this.s) {
      const s = this.s[k];
      if (s.done) continue;
      if (s.timed) {
        const t = s.timed.dur > 0 ? clamp((now - s.timed.start) / s.timed.dur) : 1;
        this.v[k] = s.timed.from + (s.to - s.timed.from) * s.timed.ease(t);
        if (t >= 1) { this.v[k] = s.to; s.done = true; } else moving = true;
        continue;
      }
      const c = s.cfg, mass = c.mass || 1;
      const prec = s.from === s.to ? .005 : Math.min(1, Math.abs(s.to - s.from) * .001);
      const restV = prec / 10;
      let x = this.v[k], vel = s.vel;
      const n = Math.max(1, Math.ceil(dt));
      for (let i = 0; i < n; i++) {
        if (Math.abs(vel) <= restV && Math.abs(s.to - x) <= prec) { x = s.to; vel = 0; s.done = true; break; }
        const f = -c.tension * 1e-6 * (x - s.to), dmp = -c.friction * 1e-3 * vel;
        vel += (f + dmp) / mass; x += vel;
        if (c.clamp && (s.from < s.to ? x >= s.to : x <= s.to)) { x = s.to; vel = 0; s.done = true; break; }
      }
      this.v[k] = x; s.vel = vel;
      if (!s.done) moving = true;
    }
    if (this.render) this.render(this.v);
    if (!moving) { const cb = this.rest; this.rest = null; if (cb) cb(); }
    for (const k in this.s) if (!this.s[k].done) return true;
    return false;
  }
}

/* ==========================================================================
   Layout, rolagem e liberação do preloader
   ========================================================================== */
const layoutFns = new Set();
const onLayout = (fn) => { layoutFns.add(fn); return fn; };
let layoutQueued = false, FRAME = frame();
const frameFns = new Set();
function relayout() {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => {
    layoutQueued = false;
    measureUnit();
    const f = frame();
    if (f !== FRAME) { FRAME = f; frameFns.forEach((fn) => fn(f)); }
    layoutFns.forEach((fn) => fn());
    emitScroll();
  });
}
addEventListener('resize', relayout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { relayout(); if (scroll.lenis) scroll.lenis.resize(); });

const scroll = { y: window.scrollY, lenis: null };
const scrollFns = new Set();
const onScroll = (fn) => { scrollFns.add(fn); return () => scrollFns.delete(fn); };
function emitScroll() {
  scroll.y = scroll.lenis ? scroll.lenis.scroll : window.scrollY;
  scrollFns.forEach((f) => f(scroll.y));
}
addEventListener('scroll', () => { if (!scroll.lenis) emitScroll(); }, { passive: true });

function initLenis() {
  if (!MOTION) return;
  import('lenis').then(({ default: Lenis }) => {
    const lenis = new Lenis({ smoothWheel: true });
    scroll.lenis = lenis;
    lenis.on('scroll', emitScroll);
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    if ('preload' in d.dataset || dialogOpen) lenis.stop();
  }).catch((err) => console.warn('[Vellora] rolagem suave indisponível:', err));
}

const rel = { start: false, done: false, sf: [], df: [] };
const onReleaseStart = (fn) => (rel.start ? fn() : rel.sf.push(fn));
const onRelease = (fn) => (rel.done ? fn() : rel.df.push(fn));
function releaseStart() { if (rel.start) return; rel.start = true; rel.sf.splice(0).forEach((f) => f()); }
function releaseDone() { releaseStart(); if (rel.done) return; rel.done = true; rel.df.splice(0).forEach((f) => f()); }

/* ==========================================================================
   "Seen": uma entrada começa quando o elemento está claramente na tela
   ========================================================================== */
const pending = new Map();
const seenIO = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) fireSeen(e.target);
}, { rootMargin: '0px 0px 5% 0px' });
function whenSeen(el, cb) {
  if (!el) return;
  if (!MOTION) { cb(); return; }
  let l = pending.get(el);
  if (!l) { l = []; pending.set(el, l); seenIO.observe(el); }
  l.push(cb);
}
function fireSeen(el) {
  const l = pending.get(el);
  if (!l) return;
  pending.delete(el); seenIO.unobserve(el);
  l.forEach((f) => f());
}
onScroll((y) => {
  if (!rel.start || !pending.size) return;
  if (y + innerHeight < document.documentElement.scrollHeight - 4) return;
  for (const el of Array.from(pending.keys())) if (el.getBoundingClientRect().top < innerHeight) fireSeen(el);
});

/* Loops: armam a 12% do pé da tela, desarmam quando saem por completo */
function loopWatch(el, arm, disarm) {
  let armed = false;
  const a = new IntersectionObserver(([e]) => { if (e.isIntersecting && !armed) { armed = true; arm(); } }, { rootMargin: '0px 0px -12% 0px' });
  const b = new IntersectionObserver(([e]) => { if (!e.isIntersecting && armed) { armed = false; disarm(); } });
  a.observe(el); b.observe(el);
}
function inViewWatch(el, cb) {
  const io = new IntersectionObserver(([e]) => cb(e.isIntersecting));
  io.observe(el);
}

/* ==========================================================================
   Primitivas de entrada
   ========================================================================== */
function charEdges(el) {
  const rect = el.getBoundingClientRect();
  const scale = rect.width ? el.offsetWidth / rect.width : 1;
  const out = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node;
  while ((node = walker.nextNode())) {
    for (let i = 0; i < node.length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width || r.height) out.push((r.right - rect.left) * scale);
    }
  }
  return out;
}
function clipTyped(el, edges, k) {
  const n = edges.length, kk = Math.floor(k);
  if (kk >= n) { el.style.clipPath = 'none'; return; }
  const W = el.offsetWidth;
  const right = kk > 0 ? Math.max(0, W - edges[kk - 1] - .5) : W;
  el.style.clipPath = `inset(0 ${right}px 0 0)`;
}
function makeTyper(el, per = 30) {
  let m = null, edges = null;
  const ensure = () => { if (!edges || !edges.length) edges = charEdges(el); return edges; };
  return {
    play(delay = 0, done) {
      if (!el) return;
      if (!MOTION) { el.style.clipPath = 'none'; if (done) done(); return; }
      if (m) m.cancel();
      const go = () => {
        edges = null;
        const e = ensure();
        m = new Motion({ k: 0 }, (v) => clipTyped(el, e, v.k));
        m.to({ k: e.length + .5 }, { cfg: { duration: e.length * per }, onRest: done });
      };
      if (delay > 0) { const t = setTimeout(go, delay); this._t = t; } else go();
    },
    reset() { clearTimeout(this._t); if (m) m.cancel(); if (MOTION) el.style.clipPath = 'inset(0 100% 0 0)'; },
    get length() { return ensure().length; },
  };
}
function typeText(el, delay = 0, per = 30, done) { makeTyper(el, per).play(delay, done); }

const renderRise = (el, dist = 1.5) => (v) => { el.style.opacity = v.p; el.style.transform = v.p >= 1 && Math.abs(v.p - 1) < .001 ? 'none' : `translate3d(0,${(1 - v.p) * dist}rem,0)`; };
const renderFocus = (el, blur) => (v) => {
  el.style.opacity = clamp(v.p);
  if (v.p >= .999) { el.style.filter = 'none'; el.style.webkitMaskImage = 'none'; el.style.maskImage = 'none'; return; }
  el.style.filter = `blur(${(1 - v.p) * blur}px)`;
  el.style.setProperty('--reveal', `${v.p * 140}%`);
};
function aRise(el, delay = 0, cfg = SPRING, dist = 1.5) { if (!el) return null; return new Motion({ p: 0 }, renderRise(el, dist), cfg).to({ p: 1 }, { delay }); }
function aFade(el, delay = 0, cfg = SOFT) { if (!el) return null; return new Motion({ p: 0 }, (v) => { el.style.opacity = v.p; }, cfg).to({ p: 1 }, { delay }); }
function aFocus(el, delay = 0, blur = 10, cfg = SOFT) { if (!el) return null; return new Motion({ p: 0 }, renderFocus(el, blur), cfg).to({ p: 1 }, { delay }); }
function aDraw(el, delay = 0, axis = 'X') { if (!el) return null; return new Motion({ p: 0 }, (v) => { el.style.transform = v.p >= .999 ? 'none' : `scale${axis}(${Math.max(0, v.p)})`; }, SOFT).to({ p: 1 }, { delay }); }
function aPop(el, delay = 0, from = .4, cfg = SOFT) { if (!el) return null; return new Motion({ p: 0 }, (v) => { el.style.opacity = clamp(v.p); el.style.transform = `scale(${from + (1 - from) * v.p})`; }, cfg).to({ p: 1 }, { delay }); }

function prepRoll(el) {
  const txt = el.textContent.trim();
  el.setAttribute('aria-label', txt);
  el.textContent = '';
  for (const ch of txt) {
    const dgt = parseInt(ch, 10);
    const wrap = document.createElement('span'); wrap.className = 'roll'; wrap.setAttribute('aria-hidden', 'true');
    const strip = document.createElement('span'); strip.className = 'roll__strip';
    for (let i = 0; i <= 10 + dgt; i++) { const s = document.createElement('span'); s.textContent = i % 10; strip.append(s); }
    wrap.append(strip); el.append(wrap);
  }
}
function playRoll(el, delay) {
  $$('.roll__strip', el).forEach((strip, i) => {
    const n = strip.children.length - 1;
    const lh = strip.firstElementChild.offsetHeight || 20;
    new Motion({ y: 0 }, (v) => { strip.style.transform = `translateY(${-v.y * lh}px)`; }, SOFT).to({ y: n }, { delay: delay + i * STEP });
  });
}

function initReveals() {
  if (!MOTION) return;
  const groups = new Map();
  for (const el of $$('[data-r]')) {
    const stage = el.closest('[data-stage]') || el;
    if (!groups.has(stage)) groups.set(stage, []);
    groups.get(stage).push(el);
    if (el.dataset.r === 'roll') prepRoll(el);
  }
  for (const [stage, els] of groups) {
    whenSeen(stage, () => els.forEach((el) => play(el, +(el.dataset.d || 0))));
  }
  function play(el, delay) {
    switch (el.dataset.r) {
      case 'rise': aRise(el, delay); break;
      case 'fade': aFade(el, delay); break;
      case 'focus': aFocus(el, delay, 10); break;
      case 'soft': aFocus(el, delay, 8); break;
      case 'draw': aDraw(el, delay); break;
      case 'type': typeText(el, delay); break;
      case 'roll': playRoll(el, delay); break;
      case 'pulse':
        new Motion({ p: 0 }, (v) => { el.style.opacity = .8 * (1 - v.p); el.style.transform = `scale(${1 + 1.6 * v.p})`; }, SOFT).to({ p: 1 }, { delay });
        break;
    }
  }
}

/* ==========================================================================
   Botões: principal (ciano), navegação, secundário e sobre faixa Profundo
   ========================================================================== */
function arrowSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg'); s.setAttribute('class', 'btn__arrow'); s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(ns, 'use'); u.setAttribute('href', '#i-arrow'); s.append(u);
  return s;
}
function initButtons() {
  for (const b of $$('.btn')) enhanceButton(b);
}
function enhanceButton(b) {
  const label = $('.btn__label', b);
  if (!label || b._enh) return;
  b._enh = true;
  const glow = b.classList.contains('btn--glow'), light = b.classList.contains('btn--light');
  const glass = b.classList.contains('btn--glass'), noite = b.classList.contains('btn--noite'), outline = b.classList.contains('btn--outline');
  let arrow = null, ink = null, inkLabel = null, inkArrow = null, halo = null, ring = null, fillw = null;
  if (glow || light || noite) { arrow = arrowSvg(); label.after(arrow); }
  if (light) {
    ink = document.createElement('span'); ink.className = 'btn__ink'; ink.setAttribute('aria-hidden', 'true');
    inkLabel = document.createElement('span'); inkLabel.className = 'btn__label'; inkLabel.textContent = label.textContent;
    inkArrow = arrowSvg(); ink.append(inkLabel, inkArrow); b.prepend(ink);
  }
  if (glow) { halo = document.createElement('span'); halo.className = 'btn__halo'; halo.setAttribute('aria-hidden', 'true'); b.prepend(halo); }
  if (glow || light || glass || noite) { ring = document.createElement('span'); ring.className = 'btn__ring'; ring.setAttribute('aria-hidden', 'true'); b.append(ring); }
  if (outline) { fillw = document.createElement('span'); fillw.className = 'btn__fillw'; fillw.setAttribute('aria-hidden', 'true'); b.prepend(fillw); }
  if (!MOTION) return;

  let hovered = false;
  const m = new Motion({ p: 0, s: 1 }, (v) => {
    if (halo) halo.style.opacity = v.p;
    if (fillw) fillw.style.opacity = v.p;
    if (ink) ink.style.clipPath = `inset(0 ${(1 - clamp(v.p)) * 100}% 0 0 round var(--vl-raio-botao))`;
    if (arrow && FINE.matches) {
      label.style.transform = `translateX(${-5 * v.p}px)`;
      arrow.style.transform = `translateX(${-8 + 8 * v.p}px)`;
      arrow.style.opacity = clamp(v.p);
      if (inkLabel) { inkLabel.style.transform = label.style.transform; inkArrow.style.transform = arrow.style.transform; }
    }
    b.style.transform = Math.abs(v.s - 1) < .0005 ? '' : `scale(${v.s})`;
  }, SPRING);
  const r = ring ? new Motion({ f: 0 }, (v) => ring.style.setProperty('--fill', `${v.f}%`)) : null;

  b.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || !FINE.matches) return;
    hovered = true;
    m.to({ p: 1, s: glass ? 1 : 1.02 }, { cfg: glass ? SOFT : SPRING });
    if (r) r.to({ f: 100 }, { cfg: { duration: 1100, easing: E.inOutCubic } });
  });
  b.addEventListener('pointerleave', () => {
    hovered = false;
    m.to({ p: 0, s: 1 });
    if (r) r.to({ f: 0 }, { cfg: { duration: 450, easing: E.inOutCubic } });
  });
  b.addEventListener('pointerdown', () => m.to({ s: .97 }, { cfg: glass ? SOFT : SPRING }));
  const up = () => m.to({ s: hovered ? (glass ? 1 : 1.02) : 1 }, { cfg: glass ? SOFT : SPRING });
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
}

/* ==========================================================================
   01 Navegação
   ========================================================================== */
const menuCtl = { close: () => {} };
function initNav() {
  const nav = $('[data-nav]'); if (!nav) return;
  const plate = $('[data-nav-plate]', nav), row = $('[data-nav-row]', nav), slot = $('.nav-slot');
  /* o logo iluminado (brilho ciano) só no topo: apaga quando a placa da navegação aparece */
  const pm = new Motion({ o: 0 }, (v) => { plate.style.opacity = v.o; nav.style.setProperty('--lit', (1 - clamp(v.o)).toFixed(3)); }, SPRING);
  let on = false;
  const check = (y) => { const want = y > (slot ? slot.offsetHeight : 88); if (want !== on) { on = want; pm.to({ o: want ? 1 : 0 }); } };
  onScroll(check); check(scroll.y);
  onRelease(() => { if (MOTION) new Motion({ o: 0 }, (v) => { row.style.opacity = v.o; }, SOFT).to({ o: 1 }); });

  const btn = $('[data-menu-btn]', nav), menu = $('[data-menu]', nav);
  if (!btn || !menu) return;
  const bars = $$('i', btn), rows = $$('li', menu);
  let open = false, rowTimer = 0;
  menu.inert = true;
  let rowM = [];
  rowM = rows.map((li, i) => new Motion({ t: 0 }, (v) => {
    li.style.opacity = clamp(v.t);
    li.style.transform = `translateY(${(1 - v.t) * .5}rem)`;
    if (rowM && rowM[i + 1]) rowM[i + 1].to({ t: v.t }, { immediate: !MOTION });
  }, SPRING));
  const t = new Motion({ t: 0 }, (v) => {
    const x = v.t;
    bars[0].style.transform = `translateY(${x * .375}rem) rotate(${x * 45}deg)`;
    bars[1].style.opacity = 1 - clamp(x);
    bars[2].style.transform = `translateY(${-x * .3125}rem) rotate(${-x * 45}deg) scaleX(${1 + .6 * x})`;
    menu.style.opacity = clamp(x);
    menu.style.transform = `scale(${.94 + .06 * x})`;
    menu.style.visibility = x < .01 ? 'hidden' : 'visible';
  }, SPRING);
  function setOpen(v) {
    if (v === open) return;
    open = v;
    btn.setAttribute('aria-expanded', String(v));
    btn.setAttribute('aria-label', v ? 'Fechar menu' : 'Abrir menu');
    menu.inert = !v;
    t.to({ t: v ? 1 : 0 });
    clearTimeout(rowTimer);
    if (v) rowTimer = setTimeout(() => rowM[0].to({ t: 1 }), MOTION ? 60 : 0);
    else rowM[0].to({ t: 0 });
  }
  menuCtl.close = () => setOpen(false);
  btn.addEventListener('click', () => setOpen(!open));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { setOpen(false); btn.focus(); } });
  document.addEventListener('pointerdown', (e) => { if (open && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false); });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  frameFns.add((f) => { if (f > 768) setOpen(false); });
}

/* ==========================================================================
   Preloader: anel = progresso real, inunda de Profundo e dobra até o logo
   ========================================================================== */
function initPreloader() {
  const el = $('[data-preloader]');
  if (!('preload' in d.dataset) || !el) { if (el) el.remove(); releaseDone(); return; }
  try { sessionStorage.setItem('vl-intro', '1'); } catch (e) {}
  const ring = $('[data-pre-ring]', el), rect = $('rect', ring);
  const flood = $('[data-pre-flood]', el), fpath = $('path', flood), grad = $('linearGradient', flood);
  const stage = $('[data-pre-stage]', el), tile = $('[data-pre-tile]', el), mark = $('[data-pre-mark]', el), logo = $('.pre__logo', el);
  let w = 0, h = 0, k = 1, phase = 'draw';
  const measure = () => {
    w = innerWidth; h = innerHeight; k = UNIT;
    ring.setAttribute('viewBox', `0 0 ${w} ${h}`);
    flood.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const ins = 8 * k;
    rect.setAttribute('x', ins); rect.setAttribute('y', ins);
    rect.setAttribute('width', Math.max(0, w - 2 * ins)); rect.setAttribute('height', Math.max(0, h - 2 * ins));
    rect.setAttribute('rx', 24 * k); rect.setAttribute('stroke-width', 2 * k);
    grad.setAttribute('x2', w); grad.setAttribute('y2', h);
  };
  measure();
  addEventListener('resize', measure);
  flood.style.opacity = 0;

  const hole = (s) => {
    const x0 = s, y0 = s, x1 = w - s, y1 = h - s;
    if (x1 - x0 < 1 || y1 - y0 < 1) return '';
    const r = Math.min(24 * k, (x1 - x0) / 2, (y1 - y0) / 2);
    return `M${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}Z`;
  };
  const half = (v) => (1 - v) * (Math.max(w, h) / 2);
  const mask = (v) => {
    const H = half(v);
    const hw = Math.min(H, w / 2), hh = Math.min(H, h / 2);
    const side = Math.min(hw, hh) * 2;
    const squared = Math.max(w, h) === Math.min(w, h) ? 1
      : Math.min(1, Math.max(0, (Math.max(w, h) / 2 - H) / ((Math.max(w, h) - Math.min(w, h)) / 2)));
    const round = side * (24 / 76) * squared;
    return `inset(${h / 2 - hh}px ${w / 2 - hw}px round ${round}px)`;
  };
  const cut = (v) => {
    const side = half(v) * 2, t = 76 * k;
    if (side >= t) return 'none';
    return `inset(${(t - side) / 2}px round ${side * (24 / 76)}px)`;
  };

  let progress = .04;
  const dm = new Motion({ d: 0 }, (v) => {
    rect.setAttribute('stroke-dashoffset', 100 * (1 - v.d));
    if (phase === 'draw' && v.d >= .96) startFlood();
  }, { tension: 90, friction: 24 });
  const raise = (p) => { if (p > progress) { progress = p; dm.to({ d: progress }); } };
  const imgs = $$('img').filter((i) => i.loading !== 'lazy');
  let done = 0, fonts = 0;
  const upd = () => raise(.04 + .76 * (done + fonts) / (imgs.length + 1));
  imgs.forEach((i) => {
    if (i.complete) done++;
    else { const f = () => { done++; upd(); }; i.addEventListener('load', f, { once: true }); i.addEventListener('error', f, { once: true }); }
  });
  if (document.fonts) document.fonts.ready.then(() => { fonts = 1; upd(); });
  if (document.readyState === 'complete') raise(1); else addEventListener('load', () => raise(1));
  setTimeout(() => raise(1), 3000);
  dm.to({ d: progress }); upd();

  const fm = new Motion({ k: 0 }, (v) => {
    const ins = 8 * k, reach = Math.ceil(Math.max(w, h) / 2) + 2;
    fpath.setAttribute('d', `M0 0H${w}V${h}H0Z` + hole(ins + v.k * (reach - ins)));
    mark.style.opacity = clamp(v.k);
    logo.style.opacity = clamp(1 - v.k * 1.4);
    if (phase === 'flood' && v.k >= .97) startFold();
  }, { tension: 140, friction: 26 });
  function startFlood() { phase = 'flood'; flood.style.opacity = 1; fm.to({ k: 1 }); }
  function startFold() {
    phase = 'fold';
    d.dataset.preloadClosing = '';
    delete d.dataset.preload;
    stage.style.display = 'none'; ring.style.display = 'none';
    fpath.setAttribute('d', `M0 0H${w}V${h}H0Z`);
    flood.style.clipPath = mask(0);
    if (scroll.lenis) { scroll.lenis.start(); scroll.lenis.resize(); }
    releaseStart(); relayout();
    new Motion({ c: 0 }, (v) => { flood.style.clipPath = mask(v.c); tile.style.clipPath = cut(v.c); })
      .to({ c: 1 }, { cfg: { duration: 900, easing: E.inOutQuad }, onRest: () => {
        delete d.dataset.preloadClosing;
        el.remove();
        removeEventListener('resize', measure);
        releaseDone(); relayout();
      } });
  }
}

/* ==========================================================================
   02 Hero: entrada do texto, centralizado
   ========================================================================== */
function initHero() {
  const hero = $('[data-hero]'); if (!hero) return;
  const H = (n) => $$(`[data-h="${n}"]`, hero);
  function sequence() {
    if (!MOTION) return;
    aRise(H('chip')[0], 0);
    typeText($('[data-h-type="120"]', hero), 120);
    const title = H('title')[0];
    const tm = new Motion({ r: 0, f: 0 }, (v) => {
      title.style.transform = v.r >= .999 ? 'none' : `translate3d(0,${(1 - v.r) * 1.5}rem,0)`;
      renderFocus(title, 10)({ p: v.f });
    });
    tm.to({ r: 1 }, { delay: STEP, cfg: SPRING }); tm.to({ f: 1 }, { delay: STEP, cfg: SOFT });
    aFade(H('sub')[0], 2 * STEP);
    aRise(H('actions')[0], 3 * STEP);
    aRise(H('note')[0], 4 * STEP);
    const notes = $$('.hero__note [data-h-type]', hero);
    typeText(notes[0], 400, 30, () => typeText(notes[1], 0));
  }
  whenSeen(hero, () => onReleaseStart(sequence));
}

/* ==========================================================================
   03 Segmentos: trilho tracejado e o pacote que acende cada tile
   ========================================================================== */
function initSegs() {
  const sec = $('[data-segs]'); if (!sec) return;
  const row = $('[data-segs-row]', sec), rail = $('[data-segs-rail]', sec);
  const svg = $('svg', rail), path = $('path', svg), grad = $('#segs-grad'), stops = $$('stop', grad);
  const packet = $('[data-segs-packet]', sec);
  const typers = $$('[data-segs-type]', sec);
  let tiles = [], railX = 0, railW = 1, tileW = 60, pitch = 100, x0 = 0;
  const tileM = new Map();

  function measure() {
    tiles = $$('.tile', sec).filter((t) => t.offsetParent !== null);
    railX = rail.offsetLeft; railW = Math.max(1, rail.offsetWidth);
    tileW = tiles[0] ? tiles[0].offsetWidth : 60;
    x0 = tiles[0] ? tiles[0].offsetLeft : 0;
    pitch = tiles[1] ? tiles[1].offsetLeft - tiles[0].offsetLeft : 100;
    path.setAttribute('d', `M0 1H${railW}`);
    grad.setAttribute('x2', railW);
    const stopsCss = [];
    tiles.forEach((t) => {
      const a = t.offsetLeft - railX - 2, b = t.offsetLeft + tileW - railX + 2;
      stopsCss.push(`#000 ${a}px`, `transparent ${a}px`, `transparent ${b}px`, `#000 ${b}px`);
    });
    const mask = `linear-gradient(90deg, #000 0, ${stopsCss.join(', ')}, #000 100%)`;
    rail.style.webkitMaskImage = mask; rail.style.maskImage = mask;
    tiles.forEach((t) => { if (!tileM.has(t)) tileM.set(t, makeTile(t)); });
    placePacket(curX, curO);
  }
  function makeTile(t) {
    const st = { a: new Motion({ a: 0 }, (v) => t.style.setProperty('--a', clamp(v.a)), SOFT), shown: !MOTION };
    st.pop = new Motion({ p: MOTION ? 0 : 1 }, (v) => { t.style.opacity = clamp(v.p); t.style.setProperty('--s', .8 + .2 * v.p); }, SOFT);
    return st;
  }
  const centre = (i) => x0 + i * pitch + tileW / 2;
  let curX = 0, curO = 0, lit = -1;
  function placePacket(x, o) {
    curX = x; curO = o;
    packet.style.transform = `translateX(${x - railX}px)`;
    packet.style.opacity = o;
    const peak = (x - railX) / railW;
    stops[0].setAttribute('offset', peak - .1001);
    stops[1].setAttribute('offset', peak);
    stops[2].setAttribute('offset', peak + .8999);
    stops[1].style.setProperty('--lit', o);
  }
  function light(i) {
    if (i === lit) return;
    lit = i;
    tiles.forEach((t, n) => { const s = tileM.get(t); if (s) s.a.to({ a: n === i ? 1 : 0 }); });
  }
  measure();
  onLayout(measure);

  const rest = () => centre(0) + .62 * pitch;
  if (!MOTION) { placePacket(rest(), 1); light(1); rail.style.clipPath = 'none'; return; }

  rail.style.clipPath = 'inset(0 100% 0 0)';
  let drawM = null, lapStop = null, lapTimer = 0, popTimer = 0, active = false;
  const glide = (t) => { const k = 1 / (1 - .09); return t < .18 ? k * t * t / .36 : k * (t - .09); };
  function reveal() {
    active = true;
    const vis = typers.filter((el) => el.offsetParent !== null);
    typeText(vis[0], 0, 30, () => { if (vis[1]) typeText(vis[1], 0); });
    drawM = new Motion({ p: 0 }, (v) => {
      rail.style.clipPath = `inset(0 ${(1 - v.p) * 100}% 0 0)`;
      const edge = railX + v.p * railW;
      tiles.forEach((t) => { const s = tileM.get(t); if (!s.shown && edge >= t.offsetLeft) { s.shown = true; s.pop.to({ p: 1 }); } });
      if (!lapStop && edge >= rest()) { placePacket(rest(), 1); light(1); }
    });
    drawM.to({ p: 1 }, { cfg: { duration: 1760, easing: E.inOutQuad }, onRest: () => {
      popTimer = setTimeout(() => tiles.forEach((t) => { const s = tileM.get(t); if (!s.shown) { s.shown = true; s.pop.to({ p: 1 }); } }), 160);
    } });
    startLap();
  }
  function startLap() {
    let step = 0, t0 = performance.now();
    const fade = new Motion({ o: 0 }, () => {});
    placePacket(centre(0), 0); light(0);
    lapStop = onFrame((now) => {
      if (!active) return;
      const t = now - t0;
      if (step === 0) { placePacket(centre(0), 0); light(0); if (t >= 30) { step = 1; t0 = now; fade.set({ o: 0 }); fade.to({ o: 1 }, { cfg: { duration: 360 } }); } }
      else if (step === 1) {
        const last = tiles.length - 1, u = clamp(t / 5600), x = mix(centre(0), centre(last), clamp(glide(u)));
        placePacket(x, fade.v.o);
        light(clamp(Math.floor((x - x0 + .4 * tileW) / pitch), 0, last));
        if (t >= 5800) { step = 2; t0 = now; fade.to({ o: 0 }, { cfg: { duration: 360 } }); }
      } else if (step === 2) {
        placePacket(curX, fade.v.o); light(tiles.length - 1);
        if (t >= 380) { step = 0; t0 = now; }
      }
    });
  }
  function resetAll() {
    active = false;
    if (lapStop) { lapStop(); lapStop = null; }
    if (drawM) drawM.cancel();
    clearTimeout(lapTimer); clearTimeout(popTimer);
    rail.style.clipPath = 'inset(0 100% 0 0)';
    placePacket(rest(), 0); lit = -1;
    tiles.forEach((t) => { const s = tileM.get(t); s.shown = false; s.pop.set({ p: 0 }); s.a.set({ a: 0 }); });
    typers.forEach((el) => { el.style.clipPath = 'inset(0 100% 0 0)'; });
  }
  let started = false;
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !started && rel.start) { started = true; reveal(); } }, { rootMargin: '0px 0px -12% 0px' });
  io.observe(row);
  inViewWatch(sec, (on) => { if (!on && started) { started = false; resetAll(); } });
  onReleaseStart(() => { const r = row.getBoundingClientRect(); if (!started && r.top < innerHeight * .88 && r.bottom > 0) { started = true; reveal(); } });
}

/* ==========================================================================
   Passagem entre blocos: ScrollBlur (opacidade + deriva, sem desfoque)
   ========================================================================== */
function initScrollBlur() {
  if (!MOTION) return;
  for (const wrap of $$('[data-sb]')) {
    const inner = $('[data-sb-in]', wrap);
    const flags = wrap.dataset.sb.split(/\s+/);
    const enter = flags.includes('enter'), leave = flags.includes('leave'), still = flags.includes('still');
    let top0 = 0, h = 0, vh = innerHeight, key = NaN, stop = null;
    const m = new Motion({ o: 1, y: 0 }, (v) => {
      inner.style.opacity = Math.abs(v.o - 1) < .001 ? '' : v.o;
      inner.style.transform = Math.abs(v.y) < .05 ? '' : `translate3d(0,${v.y}px,0)`;
    }, SPRING);
    const measure = () => { const r = wrap.getBoundingClientRect(); top0 = r.top + scroll.y; h = r.height; vh = innerHeight; update(); };
    const update = () => {
      const drift = still ? 0 : 48 * UNIT;
      const top = top0 - scroll.y, bottom = top + h;
      let o = 1, y = 0;
      if (enter) { const p = clamp((vh - top) / (vh / 2)); o *= mix(.6, 1, p); y += mix(drift, 0, p); }
      if (leave) { const p = clamp((vh / 2 - bottom) / (vh / 2)); o *= mix(1, .25, p); y += mix(0, -drift, p); }
      const k = Math.round(o * 1e4) + Math.round(y * 10) / 10;
      if (k !== key) { key = k; m.to({ o, y }); }
    };
    measure();
    onLayout(measure);
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap); ro.observe($('.page'));
    inViewWatch(wrap, (on) => {
      if (on && !stop) stop = onScroll(update);
      else if (!on && stop) { update(); stop(); stop = null; }
    });
    onReleaseStart(measure);
  }
}

/* ==========================================================================
   Linhas do tempo em loop (cartões de serviço e processo)
   ========================================================================== */
const KIND = {
  rise: { off: { p: 0 }, on: { p: 1 }, cfg: SPRING, r: (el, v) => { el.style.opacity = clamp(v.p); el.style.transform = `translate3d(0,${(1 - v.p) * .5}rem,0)`; } },
  fade: { off: { p: 0 }, on: { p: 1 }, cfg: SOFT, r: (el, v) => { el.style.opacity = clamp(v.p); } },
  growx: { off: { p: 0 }, on: { p: 1 }, cfg: SOFT, r: (el, v) => { el.style.transform = `scaleX(${Math.max(0, v.p)})`; } },
  growy: { off: { p: 0 }, on: { p: 1 }, cfg: { tension: 390, friction: 20.8 }, r: (el, v) => { el.style.transform = `scaleY(${Math.max(0, v.p)})`; } },
  pop: { off: { p: 0 }, on: { p: 1 }, cfg: { tension: 320, friction: 17 }, r: (el, v) => { el.style.opacity = clamp(v.p); el.style.transform = `scale(${Math.max(0, .6 + .4 * v.p)})`; } },
  drop: { off: { p: 0 }, on: { p: 1 }, cfg: SPRING, r: (el, v) => { el.style.opacity = clamp(v.p); el.style.transform = `translate3d(0,${-(1 - v.p) * 1.25}rem,0)`; } },
  on: { off: { p: 0 }, on: { p: 1 }, cfg: SOFT, r: (el, v) => { el.style.setProperty('--on', clamp(v.p)); } },
  dash: { off: { p: 0 }, on: { p: 1 }, cfg: SOFT, r: (el, v) => { el.style.strokeDashoffset = 1 - clamp(v.p, -1, 1); } },
};
function makeTimeline(steps, playMs) {
  const items = steps.filter((s) => s.el).map((s) => {
    let K = KIND[s.kind];
    if (s.kind === 'type') {
      let edges = null;
      const ens = () => (edges && edges.length ? edges : (edges = charEdges(s.el)));
      K = { off: { k: 0 }, on: { k: 0 }, cfg: SPRING, r: (el, v) => clipTyped(el, ens(), v.k) };
      s.prep = () => { edges = null; const n = ens().length; K.on = { k: n + .5 }; s.cfg = { duration: n * (s.per || 24) }; };
    } else if (s.kind === 'custom') K = { off: s.off, on: s.on, cfg: s.cfg || SPRING, r: s.render };
    const m = new Motion(Object.assign({}, K.off), (v) => K.r(s.el, v), s.cfg || K.cfg);
    return { s, K, m };
  });
  return {
    playMs,
    play() { items.forEach(({ s, K, m }) => { if (s.prep) s.prep(); m.cancel(); m.to(K.on, { delay: s.at, cfg: s.cfg || K.cfg }); }); },
    reverse() {
      [...items].sort((a, b) => b.s.at - a.s.at).forEach(({ s, K, m }, rank) => { m.cancel(); m.to(K.off, { delay: rank * 22, cfg: s.kind === 'type' ? { duration: 200 } : SPRING }); });
    },
    reset() { items.forEach(({ K, m }) => m.set(K.off)); },
    finish() { items.forEach(({ s, K, m }) => { if (s.prep) s.prep(); m.set(K.on); }); },
  };
}
function loopTimeline(el, tl, hold = 2800, back = 800) {
  if (!MOTION) { tl.finish(); return; }
  tl.reset();
  let timer = 0;
  const cycle = () => { tl.play(); timer = setTimeout(() => { tl.reverse(); timer = setTimeout(cycle, back); }, tl.playMs + hold); };
  loopWatch(el, () => { clearTimeout(timer); cycle(); }, () => { clearTimeout(timer); tl.reset(); });
}

function initCards() {
  const K = (card, k) => $(`[data-k="${k}"]`, card);
  /* 01 site institucional */
  const site = $('[data-loop="site"]');
  if (site) loopTimeline(site, makeTimeline([
    { el: K(site, 'url'), kind: 'type', at: 240, per: 24 },
    { el: K(site, 'nav'), kind: 'rise', at: 360 },
    { el: K(site, 't1'), kind: 'growx', at: 520 },
    { el: K(site, 't2'), kind: 'growx', at: 620 },
    { el: K(site, 'img'), kind: 'rise', at: 660 },
    { el: K(site, 'p1'), kind: 'growx', at: 720 },
    { el: K(site, 'p2'), kind: 'growx', at: 790 },
    { el: K(site, 'btn'), kind: 'pop', at: 900 },
    { el: K(site, 'c1'), kind: 'rise', at: 1000 },
    { el: K(site, 'c2'), kind: 'rise', at: 1080 },
    { el: K(site, 'c3'), kind: 'rise', at: 1160 },
  ], 1600));

  /* 02 landing page */
  const lp = $('[data-loop="lp"]');
  if (lp) {
    const box = $('.lp', lp), cur = K(lp, 'cursor'), btn = K(lp, 'btn');
    const g = { sx: 0, sy: 0, ex: 0, ey: 0 };
    const prepCursor = () => {
      const b = box.getBoundingClientRect(), r = btn.getBoundingClientRect();
      const sc = box.offsetWidth / (b.width || 1);
      const tip = 5 / 24 * (cur.getBoundingClientRect().width * sc || 24 * UNIT);
      g.ex = (r.left - b.left + r.width * .62) * sc - tip; g.ey = (r.top - b.top + r.height * .55) * sc - tip * .5;
      g.sx = box.offsetWidth * .86; g.sy = box.offsetHeight * .72;
    };
    loopTimeline(lp, makeTimeline([
      { el: K(lp, 'logo'), kind: 'fade', at: 240 },
      { el: K(lp, 'h1'), kind: 'growx', at: 320 },
      { el: K(lp, 'h2'), kind: 'growx', at: 400 },
      { el: K(lp, 's1'), kind: 'on', at: 360 },
      { el: K(lp, 'sub'), kind: 'growx', at: 480 },
      { el: K(lp, 'b1'), kind: 'rise', at: 600 },
      { el: K(lp, 's2'), kind: 'on', at: 620 },
      { el: K(lp, 'b2'), kind: 'rise', at: 660 },
      { el: K(lp, 'b3'), kind: 'rise', at: 720 },
      { el: K(lp, 'proof'), kind: 'fade', at: 860 },
      { el: K(lp, 's3'), kind: 'on', at: 860 },
      { el: btn, kind: 'pop', at: 1000 },
      { el: K(lp, 's4'), kind: 'on', at: 1000 },
      { el: cur, kind: 'custom', at: 1200, off: { p: 0, o: 0 }, on: { p: 1, o: 1 }, cfg: { tension: 110, friction: 22 }, prep: prepCursor,
        render: (el, v) => { el.style.opacity = clamp(v.o * 1.6); el.style.transform = `translate(${mix(g.sx, g.ex, v.p)}px, ${mix(g.sy, g.ey, v.p)}px)`; } },
      { el: $('.lp__btn', lp), kind: 'custom', at: 1950, off: { s: 0 }, on: { s: 1 }, cfg: { duration: 280 },
        render: (el, v) => { if (v.s > 0 && v.s < 1) el.style.transform = `scale(${1 - .07 * Math.sin(Math.PI * v.s)})`; } },
      { el: K(lp, 'toast'), kind: 'pop', at: 2080 },
    ], 2500));
  }

  /* 03 identidade visual */
  const id = $('[data-loop="id"]');
  if (id) {
    const steps = [
      { el: K(id, 'aa'), kind: 'rise', at: 200 },
      { el: K(id, 'ai'), kind: 'rise', at: 320 },
      { el: K(id, 'fn'), kind: 'fade', at: 440 },
    ];
    for (let i = 0; i < 6; i++) {
      steps.push({ el: K(id, `w${i}`), kind: 'growy', at: 240 + i * 120 });
      steps.push({ el: K(id, `x${i}`), kind: 'drop', at: 240 + i * 120 + 208 });
    }
    steps.push({ el: K(id, 'glow'), kind: 'custom', at: 240 + 5 * 120 + 208 + 304, off: { g: 0 }, on: { g: 1 }, cfg: { tension: 60, friction: 18 },
      render: (el, v) => { const s = Math.sin(Math.PI * clamp(v.g)); el.style.opacity = Math.max(s, .45 * clamp(v.g)); el.style.transform = `scale(${.8 + .4 * s + .2 * clamp(v.g)})`; } });
    loopTimeline(id, makeTimeline(steps, 1900));
  }

  /* 04 Instagram */
  const ig = $('[data-loop="ig"]');
  if (ig) {
    const steps = [
      { el: K(ig, 'av'), kind: 'pop', at: 240, cfg: POP },
      { el: K(ig, 'ring'), kind: 'dash', at: 320 },
      { el: K(ig, 'name'), kind: 'rise', at: 400 },
      { el: K(ig, 'cat'), kind: 'fade', at: 470 },
      { el: K(ig, 'bio'), kind: 'fade', at: 540 },
    ];
    for (let i = 0; i < 4; i++) steps.push({ el: K(ig, `h${i}`), kind: 'pop', at: 640 + i * 70 });
    for (let i = 0; i < 6; i++) steps.push({ el: K(ig, `g${i}`), kind: 'rise', at: 560 + ((i % 3) + Math.floor(i / 3)) * 90 });
    loopTimeline(ig, makeTimeline(steps, 1600));
  }
}

/* ==========================================================================
   07 Trabalhos: carrossel real da Vellora e deriva dos estudos
   ========================================================================== */
function initWork() {
  const car = $('[data-carousel]');
  if (car) {
    const slides = $$('.carousel__track li', car), dotsBox = $('[data-carousel-dots]', car);
    let idx = 0, timer = 0, paused = false, live = false;
    const ms = slides.map((li, i) => new Motion({ o: i === 0 ? 1 : 0 }, (v) => { li.style.opacity = v.o; }, SOFT));
    const dots = slides.map((li, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-label', `Slide ${i + 1} de ${slides.length}`);
      b.setAttribute('aria-current', String(i === 0));
      b.addEventListener('click', () => { go(i); restart(); });
      dotsBox.append(b);
      return b;
    });
    slides.forEach((li, i) => { li.setAttribute('aria-hidden', String(i !== 0)); });
    function go(i) {
      if (i === idx) return;
      ms[idx].to({ o: 0 }); slides[idx].setAttribute('aria-hidden', 'true'); dots[idx].setAttribute('aria-current', 'false');
      idx = i;
      ms[idx].to({ o: 1 }); slides[idx].setAttribute('aria-hidden', 'false'); dots[idx].setAttribute('aria-current', 'true');
    }
    const restart = () => { clearInterval(timer); if (live && !paused && MOTION) timer = setInterval(() => go((idx + 1) % slides.length), 2800); };
    car.addEventListener('pointerenter', () => { paused = true; restart(); });
    car.addEventListener('pointerleave', () => { paused = false; restart(); });
    car.addEventListener('focusin', () => { paused = true; restart(); });
    car.addEventListener('focusout', () => { paused = false; restart(); });
    loopWatch(car, () => { live = true; restart(); }, () => { live = false; restart(); });
  }
  if (!MOTION) return;
  /* deriva: blooms (±40 px), presa à rolagem */
  const items = [];
  $$('[data-drift]').forEach((el) => items.push({ el, scope: el.closest('section'), amp: 40, dir: +el.dataset.drift }));
  const geo = new Map();
  const measure = () => items.forEach((it) => { const r = it.scope.getBoundingClientRect(); geo.set(it, { top: r.top + scroll.y, h: r.height }); });
  measure(); onLayout(measure); onReleaseStart(measure);
  onScroll((y) => {
    const vh = innerHeight;
    for (const it of items) {
      const g = geo.get(it); if (!g) continue;
      const top = g.top - y; if (top > vh || top + g.h < 0) continue;
      const p = clamp((vh - top) / (vh + g.h));
      it.el.style.translate = `0 ${mix(-it.amp, it.amp, p) * it.dir * UNIT}px`;
    }
  });
}

/* ==========================================================================
   08 Processo: quatro widgets que se repetem enquanto estão na tela
   ========================================================================== */
function initProc() {
  const W = (n) => $(`[data-wdg="${n}"]`);
  /* 01 conversa */
  const chat = W('chat');
  if (chat) {
    const K = (k) => $(`[data-k="${k}"]`, chat), dots = $$('.chat__typing i', chat);
    loopTimeline(chat, makeTimeline([
      { el: K('m1'), kind: 'rise', at: 200 },
      { el: K('typing'), kind: 'custom', at: 700, off: { o: 0 }, on: { o: 1 }, cfg: SPRING, render: (el, v) => { el.style.opacity = clamp(v.o); } },
      { el: dots[0] && dots[0].parentElement, kind: 'custom', at: 820, off: { t: 0 }, on: { t: 1 }, cfg: { duration: 640 },
        render: (el, v) => dots.forEach((dd, i) => { const p = clamp(v.t * 2.5 - i * .25, 0, 2); dd.style.transform = `translateY(${-3 * Math.abs(Math.sin(Math.PI * p))}px)`; }) },
      { el: K('typing'), kind: 'custom', at: 1520, off: { o: 1 }, on: { o: 0 }, cfg: SPRING, render: () => {} },
      { el: K('m2'), kind: 'rise', at: 1560 },
      { el: K('m3'), kind: 'rise', at: 2240 },
    ], 2600));
    /* a digitação some quando a resposta chega */
    const typing = K('typing'), m2 = K('m2');
    new MutationObserver(() => { if (parseFloat(m2.style.opacity) > .05) typing.style.opacity = Math.max(0, 1 - parseFloat(m2.style.opacity) * 2); }).observe(m2, { attributes: true, attributeFilter: ['style'] });
  }

  /* 02 estratégia: três linhas que convergem */
  const cw = W('curves');
  if (cw) {
    const paths = $$('[data-cv]', cw), end = $('[data-cv-end]', cw), labelEls = $$('.curves__labels li', cw);
    const BASE = [
      { s: [8, 18], c1: [150, 18], c2: [250, 66], e: [392, 66], dir: 1 },
      { s: [8, 66], c1: [150, 96], c2: [250, 40], e: [392, 66], dir: -1 },
      { s: [8, 114], c1: [150, 114], c2: [250, 66], e: [392, 66], dir: 1 },
    ];
    const setPaths = (dx) => paths.forEach((p, i) => {
      const b = BASE[i], o = dx * b.dir;
      p.setAttribute('d', `M${b.s[0]} ${b.s[1]}C${b.c1[0]} ${b.c1[1] + o} ${b.c2[0]} ${b.c2[1] - o} ${b.e[0]} ${b.e[1]}`);
    });
    setPaths(0);
    end.setAttribute('transform', 'translate(392 66)');
    const typers = labelEls.map((el) => makeTyper(el, 30));
    const pm = paths.map((p) => new Motion({ p: 0 }, (v) => { p.style.strokeDashoffset = 1 - v.p; if (v.p >= .999) p.style.strokeDasharray = 'none'; else p.style.strokeDasharray = '1 1'; }, GROW));
    const em = new Motion({ m: 0 }, (v) => { end.style.opacity = clamp(v.m); end.style.transform = `translate(392px, 66px) scale(${.4 + .6 * v.m})`; }, SOFT);
    end.style.transformBox = 'view-box';
    let drift = null, t0 = 0, timers = [];
    const start = () => {
      typers.forEach((t, i) => t.play(400 + i * 80));
      pm.forEach((m, i) => m.to({ p: 1 }, { delay: 550 + i * 112 }));
      em.to({ m: 1 }, { delay: 1270 });
      const halo = $('.cv__halo', end);
      timers.push(setTimeout(() => { t0 = performance.now(); drift = onFrame((now) => { const dx = 10 * Math.sin(2 * Math.PI * (now - t0) / 4800); setPaths(dx); halo.setAttribute('r', 13 + 2.5 * Math.sin(2 * Math.PI * (now - t0) / 2400)); }); }, 550 + 1360));
    };
    const reset = () => { timers.forEach(clearTimeout); timers = []; if (drift) { drift(); drift = null; } setPaths(0); typers.forEach((t) => t.reset()); pm.forEach((m) => m.set({ p: 0 })); em.set({ m: 0 }); };
    if (!MOTION) { pm.forEach((m) => m.set({ p: 1 })); em.set({ m: 1 }); labelEls.forEach((l) => { l.style.clipPath = 'none'; }); }
    else { reset(); loopWatch(cw, start, reset); }
  }

  /* 03 criação: a grade acende em diagonal e desenha o V */
  const gw = W('grid');
  if (gw) {
    const ul = $('[data-vgrid]', gw), COLS = 9, ROWS = 5, cells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const li = document.createElement('li');
      const isV = c === r || c === COLS - 1 - r, peak = r === ROWS - 1 && c === 4;
      const a = .05 + .1 * (1 - Math.abs(c - 4) / 5) * (1 - r / 7) + ((c * 7 + r * 3) % 5) * .012;
      li.style.setProperty('--cell', `rgba(182, 156, 255, ${a.toFixed(3)})`);
      if (isV) li.classList.add('is-v');
      if (peak) li.classList.add('is-peak');
      ul.append(li); cells.push({ li, c, r, peak });
    }
    const cm = cells.map(({ li }) => new Motion({ t: 0 }, (v) => { li.style.opacity = clamp(v.t); li.style.transform = v.t >= .999 ? '' : `scale(${.92 + .08 * v.t})`; }, { tension: 105, friction: 26.9 }));
    const peakCell = cells.find((x) => x.peak);
    const gm = new Motion({ g: 0 }, (v) => { peakCell.li.style.setProperty('--g', Math.max(Math.sin(Math.PI * clamp(v.g)), .5 * clamp(v.g))); }, { tension: 33, friction: 15.9 });
    let timers = [];
    const play = () => {
      cells.forEach((x, i) => cm[i].to({ t: 1 }, { delay: 208 + (x.c + x.r) * 36, cfg: { tension: 105, friction: 26.9 } }));
      gm.set({ g: 0 }); gm.to({ g: 1 }, { delay: 208 + (4 + 4) * 36 + 96 });
      timers.push(setTimeout(() => {
        cells.forEach((x, i) => cm[i].to({ t: 0 }, { delay: (x.c + x.r) * 20, cfg: SPRING }));
        gm.to({ g: 0 }, { cfg: SPRING });
        timers.push(setTimeout(play, 1200));
      }, 2240 + 2800));
    };
    const reset = () => { timers.forEach(clearTimeout); timers = []; cm.forEach((m) => m.set({ t: 0 })); gm.set({ g: 0 }); };
    if (!MOTION) { cm.forEach((m) => m.set({ t: 1 })); gm.set({ g: 1 }); }
    else { reset(); loopWatch(gw, play, reset); }
  }

  /* 04 lançamento: pinos que caem e pulsam */
  const pw = W('pins');
  if (pw) {
    const pins = $$('[data-pin]', pw), field = $('.pins__field', pw);
    const P = pins.map((pin) => ({
      plate: $('.pin__plate', pin), ring: $('.pin__ring', pin), ping: $('[data-pin-ping]', pin), dot: $('[data-pin-dot]', pin),
      typer: makeTyper($('[data-pin-type]', pin), 30),
    }));
    const fm = new Motion({ o: 0 }, (v) => { field.style.opacity = v.o; }, GROW);
    const pm = P.map((p) => new Motion({ o: 0, y: -14 }, (v) => {
      p.ring.style.opacity = clamp(v.o); p.plate.style.opacity = clamp(v.o);
      p.dot.style.opacity = clamp(v.o); p.dot.style.transform = `translateY(${v.y * UNIT}px)`;
    }, QUICK));
    let stop = null, timers = [], t0 = 0;
    const start = () => {
      fm.to({ o: 1 }, { delay: 120 });
      P.forEach((p, k) => { pm[k].to({ o: 1, y: 0 }, { delay: 416 + k * 112 }); p.typer.play(416 + k * 112 + 160); });
      timers.push(setTimeout(() => {
        t0 = performance.now();
        stop = onFrame((now) => P.forEach((p, k) => {
          const t = (now - t0 - k * 360) % 2400;
          if (t < 0 || t > 1040) { p.ping.style.opacity = 0; return; }
          const e = E.outCubic(t / 1040);
          p.ping.style.opacity = .8 * (1 - e); p.ping.style.transform = `scale(${.28 + (1.6 - .28) * e})`;
        }));
      }, 416 + 336 + 400));
    };
    const reset = () => { timers.forEach(clearTimeout); timers = []; if (stop) { stop(); stop = null; } fm.set({ o: 0 }); pm.forEach((m) => m.set({ o: 0, y: -14 })); P.forEach((p) => { p.typer.reset(); p.ping.style.opacity = 0; }); };
    if (!MOTION) { fm.set({ o: 1 }); pm.forEach((m) => m.set({ o: 1, y: 0 })); P.forEach((p) => p.typer.play()); }
    else { reset(); loopWatch(pw, start, reset); }
  }
}

/* ==========================================================================
   09 Dúvidas: acordeão com mola
   ========================================================================== */
function initFaq() {
  for (const q of $$('.qa__q')) {
    const a = document.getElementById(q.getAttribute('aria-controls')), ic = $('.qa__ic svg', q);
    let open = false;
    const hm = new Motion({ h: 0 }, (v) => { a.style.height = `${Math.max(0, v.h)}px`; }, SPRING);
    const rm = new Motion({ r: 0 }, (v) => { ic.style.transform = `rotate(${v.r * 45}deg)`; }, SPRING);
    q.addEventListener('click', () => {
      open = !open;
      q.setAttribute('aria-expanded', String(open));
      rm.to({ r: open ? 1 : 0 });
      if (open) {
        a.hidden = false;
        const target = a.scrollHeight;
        hm.set({ h: 0 });
        hm.to({ h: target }, { onRest: () => { if (open) a.style.height = 'auto'; } });
      } else {
        hm.set({ h: a.offsetHeight });
        hm.to({ h: 0 }, { onRest: () => { if (!open) a.hidden = true; } });
      }
    });
  }
}

/* ==========================================================================
   10 Rodapé: uma linha do tempo, presa a dois sentinelas
   ========================================================================== */
function initFooter() {
  const foot = $('[data-foot]'); if (!foot) return;
  const F = (n) => $$(`[data-f="${n}"]`, foot);
  const top = $('[data-foot-top]', foot), bottom = $('[data-foot-bottom]', foot);
  const glyph = $('.foot__glyph', foot), gf = F('gfront')[0], gb = F('gback')[0];
  if (!MOTION) return;
  let topAt = -1, bottomReady = false, unlocked = false;
  const lineRise = (el, delay) => new Motion({ p: 0 }, (v) => { el.style.transform = v.p >= .999 ? 'none' : `translateY(${(1 - v.p) * 110}%)`; }, SPRING).to({ p: 1 }, { delay });
  whenSeen(top, () => {
    topAt = performance.now();
    aRise(F('cta')[0], 0);
    aRise(F('brand')[0], 50);
    typeText(F('eyebrow')[0], 160);
    lineRise(F('line')[0], 160);
    aFocus(F('copy')[0], 260, 8);
    aRise(F('actions')[0], 350);
    aFocus(F('tag')[0], 430, 8);
    aDraw(F('bhair')[0], 490);
    aFade(F('social')[0], 540);
    F('sdot').forEach((el, i) => new Motion({ p: 0 }, (v) => { el.style.opacity = .2 + .8 * v.p; el.style.transform = `scale(${.6 + .4 * v.p})`; }, SPRING).to({ p: 1 }, { delay: 620 + i * 130 }));
    F('slabel').forEach((el, i) => aFade(el, 680 + i * 130));
    setTimeout(() => { unlocked = true; glyphLoop(); }, 1200);
    maybeBottom();
  });
  whenSeen(bottom, () => { bottomReady = true; maybeBottom(); });
  function maybeBottom() {
    if (!bottomReady || topAt < 0 || maybeBottom.done) return;
    maybeBottom.done = true;
    const wait = Math.max(0, 350 - (performance.now() - topAt));
    setTimeout(() => {
      aDraw(F('rule1')[0], 0);
      aRise(F('company')[0], 40);
      F('col').forEach((el, i) => aRise(el, 100 + i * 50));
      aDraw(F('rule2')[0], 300);
      aFade(F('legal')[0], 380);
    }, wait);
  }
  /* "passo à frente": as duas facetas do V avançam e voltam */
  const lead = (p) => Math.min(1, p / .7), trail = (p) => Math.max(0, (p - .3) / .7);
  const gm = new Motion({ p: 0 }, (v) => {
    const l = lead(clamp(v.p)), t = trail(clamp(v.p));
    gf.style.transform = `translate(${14 * l}px, ${-20 * l}px)`; gf.style.opacity = .12 + .08 * l;
    gb.style.transform = `translate(${14 * t}px, ${-20 * t}px)`; gb.style.opacity = .07 + .05 * t;
  }, QUICK);
  let glyphOn = false, gTimer = 0;
  function glyphLoop() {
    clearTimeout(gTimer);
    if (!unlocked || !glyphOn) return;
    gTimer = setTimeout(() => gm.to({ p: 1 }, { onRest: () => { gTimer = setTimeout(() => gm.to({ p: 0 }, { onRest: () => { gTimer = setTimeout(glyphLoop, 2080 - 320); } }), 720); } }), 320);
  }
  inViewWatch(glyph, (on) => { glyphOn = on; if (on) glyphLoop(); else { clearTimeout(gTimer); gm.set({ p: 0 }); } });
}

/* ==========================================================================
   Contato: janela, canais configurados e a mensagem pronta
   ========================================================================== */
let dialogOpen = false;
function initContact() {
  const wa = String(CONTATO.whatsapp || '').replace(/\D/g, '');
  const ig = String(CONTATO.instagram || '').replace('@', '').trim();
  const em = String(CONTATO.email || '').trim();
  const map = {
    whatsapp: wa && { href: `https://wa.me/${wa}` },
    instagram: ig && { href: `https://instagram.com/${encodeURIComponent(ig)}` },
    email: em && { href: `mailto:${em}` },
  };
  let any = false;
  $$('[data-contact]').forEach((a) => { const m = map[a.dataset.contact]; if (!m) return; any = true; a.href = m.href; a.hidden = false; });
  $$('[data-contact-item]').forEach((li) => { li.hidden = !map[li.dataset.contactItem]; });
  $$('[data-contact-fallback]').forEach((li) => { li.hidden = any; });
  if (!any) console.info('[Vellora] Nenhum canal de contato configurado: preencha CONTATO em assets/js/site.js.');

  const dlg = $('[data-contact-dialog]'); if (!dlg) return;
  const form = $('[data-contact-form]', dlg), formWrap = $('[data-contact-form-wrap]', dlg), done = $('[data-contact-done]', dlg);
  const err = $('[data-contact-err]', dlg);
  const preview = $('[data-contact-preview]', dlg), doneText = $('[data-contact-done-text]', dlg), copyBtn = $('[data-contact-copy]', dlg);
  const select = $('#cf-servico', dlg);
  const channel = wa ? 'whatsapp' : em ? 'email' : null;
  let last = null, message = '';
  function open(service, trigger) {
    last = trigger || document.activeElement;
    formWrap.hidden = false; done.hidden = true; err.hidden = true;
    if (service && select) { const opt = Array.from(select.options).find((o) => o.text === service); select.value = opt ? opt.value : ''; }
    dlg.showModal();
    dialogOpen = true;
    if (scroll.lenis) scroll.lenis.stop();
    menuCtl.close();
    setTimeout(() => { const f = $('#cf-nome', dlg); if (f) f.focus(); }, 30);
  }
  function close() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => { dialogOpen = false; if (scroll.lenis) scroll.lenis.start(); if (last && last.focus) last.focus({ preventScroll: true }); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  $$('[data-contact-close]', dlg).forEach((b) => b.addEventListener('click', close));
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open-contact]');
    if (!t) return;
    e.preventDefault();
    open(t.getAttribute('data-open-contact') || '', t);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const val = (k) => String(data.get(k) || '').trim();
    const nome = val('nome'), empresa = val('empresa'), whats = val('whatsapp'), email = val('email');
    const segmento = val('segmento'), servico = val('servico'), msg = val('mensagem');
    if (!nome || (!whats && !email)) { err.hidden = false; $(!nome ? '#cf-nome' : '#cf-whats', dlg).focus(); return; }
    err.hidden = true;
    message = `Olá, Vellora! Meu nome é ${nome}${empresa ? `, da ${empresa}` : ''}.`
      + (segmento ? `\nSegmento: ${segmento}.` : '')
      + (servico ? `\nTenho interesse em: ${servico}.` : '')
      + (msg ? `\n\nObjetivo: ${msg}` : '')
      + `\n\nContato: ${[whats, email].filter(Boolean).join(' · ')}`;
    preview.textContent = message;
    if (channel === 'whatsapp') {
      window.open(`https://wa.me/${wa}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
      doneText.textContent = 'Abrimos o WhatsApp com a sua mensagem. Se a janela não abriu, copie o texto abaixo.';
    } else if (channel === 'email') {
      location.href = `mailto:${em}?subject=${encodeURIComponent('Contato pelo site')}&body=${encodeURIComponent(message)}`;
      doneText.textContent = 'Abrimos o seu e-mail com a mensagem pronta. Se nada abriu, copie o texto abaixo.';
    } else {
      doneText.textContent = 'Sua mensagem está pronta. Copie o texto abaixo para enviar à Vellora pelo canal de sua preferência.';
    }
    formWrap.hidden = true; done.hidden = false;
    copyBtn.focus();
  });
  copyBtn.addEventListener('click', () => {
    const ok = () => $$('.btn__label', copyBtn).forEach((l) => { l.textContent = 'Copiado'; });
    if (navigator.clipboard) navigator.clipboard.writeText(message).then(ok).catch(() => {});
  });
}

/* ==========================================================================
   Âncoras com rolagem suave
   ========================================================================== */
function initAnchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.hasAttribute('data-open-contact') || e.defaultPrevented) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const el = document.getElementById(id.slice(1));
    if (!el) return;
    e.preventDefault();
    menuCtl.close();
    const navH = ($('.nav-slot') || {}).offsetHeight || 0;
    let y;
    if (id === '#inicio') y = 0;
    else y = el.getBoundingClientRect().top + scroll.y - navH + (el.matches('section, footer') ? 0 : -16);
    if (scroll.lenis) scroll.lenis.scrollTo(Math.max(0, y), { duration: 1.4 });
    else window.scrollTo({ top: Math.max(0, y), behavior: RM ? 'auto' : 'smooth' });
    if (id !== '#inicio') { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
  });
}

/* ==========================================================================
   Pendências: dados que ainda faltam, marcados com class="tbd" no index.html
   ========================================================================== */
function initPending() {
  const n = $$('.tbd').length;
  if (n) console.info(`[Vellora] ${n} dados ainda por preencher: procure class="tbd" no index.html.`);
}

/* ==========================================================================
   Partida
   ========================================================================== */
function safe(name, fn) {
  try { fn(); } catch (e) {
    console.error(`[Vellora] falha em ${name}:`, e);
    d.classList.remove('is-motion'); d.classList.add('is-still');
  }
}
function boot() {
  d.dataset.ready = '1';
  safe('lenis', initLenis);
  safe('botões', initButtons);
  safe('navegação', initNav);
  safe('entradas', initReveals);
  safe('hero', initHero);
  safe('segmentos', initSegs);
  safe('passagens', initScrollBlur);
  safe('serviços', initCards);
  safe('trabalhos', initWork);
  safe('processo', initProc);
  safe('dúvidas', initFaq);
  safe('rodapé', initFooter);
  safe('contato', initContact);
  safe('âncoras', initAnchors);
  safe('pendências', initPending);
  safe('preloader', initPreloader);
  emitScroll();
  /* a altura da página muda (fontes, imagens): todos os módulos medem de novo */
  const page = $('.page');
  if (page && 'ResizeObserver' in window) { let h0 = page.offsetHeight; new ResizeObserver(() => { const h = page.offsetHeight; if (h !== h0) { h0 = h; relayout(); } }).observe(page); }}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
