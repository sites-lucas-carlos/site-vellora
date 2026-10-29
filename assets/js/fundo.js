/* ==========================================================================
   VELLORA: chamas de canto na placa do hero e nos cartões-janela
   "Corner Flames" (three.js r0.143.0) nas cores da marca. Em vez de cobrir
   a página inteira, ele desenha dentro da placa do hero.
   No mesmo quadro, cada cartão [data-janela] copia a sua fatia desse desenho.
   A fatia é medida na caixa que envolve todas as células do grupo, então um
   grupo lê um fundo só, contínuo de uma célula à outra.
   ========================================================================== */
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js'
import { CopyShader } from 'three/addons/shaders/CopyShader.js'

/* Parâmetros fixos */
const COLOR_A = '#1E88B6'   // corpo da chama (Azul da marca)
const COLOR_B = '#0D3B66'   // dobra fria (Profundo)
const BG_COLOR = '#06121F'  // vinheta atrás das chamas (Fundo)
const BRIGHTNESS = 1.35
const SPEED = 1.5
const SPREAD = 0.17
const DIAG = -1
const ALPHA = 2

const root = document.documentElement
const canvas = document.getElementById('scene')
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const coarse = matchMedia('(pointer: coarse)').matches

// Resolução: até 1,5x em telas densas (1x no celular) para o fundo não pesar na rolagem
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, coarse ? 1 : 1.5)

function hexToVec3(hex) {
  const n = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// posição no documento pelo layout (offset*), sem os deslocamentos das entradas
function docBox(el) {
  let x = 0, y = 0
  for (let n = el; n; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}

const LAYERS = { NONE: 0, TORUS_SCENE: 1, BLOOM_SCENE: 2, ENTIRE_SCENE: 3 }

function start() {
  if (!canvas || 'bot' in root.dataset) return

  let renderer
  try {
    renderer = new THREE.WebGL1Renderer({ canvas, antialias: true })
  } catch (e) {
    console.warn('[Vellora] fundo WebGL indisponível:', e)
    canvas.remove()
    return
  }
  renderer.setPixelRatio(pixelRatio())
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.VSMShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  scene.fog = new THREE.Fog(0x000000, 0, 15)

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 80)
  camera.position.set(0, 0, 3)
  scene.add(camera)
  camera.layers.enable(LAYERS.TORUS_SCENE)
  camera.layers.enable(LAYERS.BLOOM_SCENE)
  camera.layers.enable(LAYERS.ENTIRE_SCENE)

  /* Composição final: torus + bloom + render base sobre a vinheta de uBg */
  const FinalPass = {
    uniforms: {
      tDiffuse: { value: null }, torusTexture: { value: null }, bloomTexture: { value: null }, haloTexture: { value: null },
      uBg: { value: hexToVec3(BG_COLOR) }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform sampler2D bloomTexture; uniform sampler2D torusTexture; uniform sampler2D haloTexture; uniform vec3 uBg;
      varying vec2 vUv;
      void main() {
        vec3 halo = texture2D(haloTexture, vUv).xyz;
        vec3 bg = uBg * (1.0 - 0.4 * length(2. * vUv - 1.));
        gl_FragColor = vec4(bg + texture2D(bloomTexture, vUv).xyz + texture2D(torusTexture, vUv).xyz + texture2D(tDiffuse, vUv).xyz + halo, 1.);
      }`
  }

  // o tamanho da placa do hero (o canvas a preenche)
  const size = () => ({ w: canvas.clientWidth || window.innerWidth, h: canvas.clientHeight || window.innerHeight })
  const { w: w0, h: h0 } = size()

  const renderScene = new RenderPass(scene, camera)

  const torusComposer = new EffectComposer(renderer); torusComposer.renderToScreen = false
  torusComposer.addPass(renderScene)
  torusComposer.addPass(new ShaderPass(GammaCorrectionShader))
  torusComposer.addPass(new UnrealBloomPass(new THREE.Vector2(w0, h0), 0.22, 0.2, 0))
  torusComposer.addPass(new ShaderPass(CopyShader))

  const bloomComposer = new EffectComposer(renderer); bloomComposer.renderToScreen = false
  bloomComposer.addPass(renderScene)
  bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(w0, h0), 0.4, 0.55, 0))
  bloomComposer.addPass(new ShaderPass(GammaCorrectionShader))

  const finalPass = new ShaderPass(FinalPass)
  finalPass.uniforms.bloomTexture.value = bloomComposer.renderTarget1.texture
  finalPass.uniforms.torusTexture.value = torusComposer.renderTarget1.texture

  const finalComposer = new EffectComposer(renderer)
  finalComposer.addPass(renderScene); finalComposer.addPass(finalPass)

  /* As chamas: um quad de tela cheia em clip-space */
  const sceneObj = {
    uniforms: {
      iTime: { value: 0 },
      iAlpha: { value: 0 },
      uColorA: { value: hexToVec3(COLOR_A) },
      uColorB: { value: hexToVec3(COLOR_B) },
      uBrightness: { value: BRIGHTNESS },
      uSpeed: { value: SPEED },
      uSpread: { value: SPREAD },
      uDiag: { value: DIAG }
    },
    appearStart: performance.now(),
    render() {
      this.uniforms.iTime.value = performance.now() / 1000
      const elapsed = performance.now() - this.appearStart
      const fade = Math.max(0, Math.min(1, (elapsed - 200) / 1500))   // 1,5 s de entrada, 200 ms de espera
      this.uniforms.iAlpha.value = fade * ALPHA
    }
  }

  const material = new THREE.ShaderMaterial({
    uniforms: sceneObj.uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float iTime; uniform float iAlpha;
      uniform vec3 uColorA; uniform vec3 uColorB;
      uniform float uBrightness; uniform float uSpeed; uniform float uSpread; uniform float uDiag;
      varying vec2 vUv;

      vec3 warp3d(vec3 pos, float t) {
        float curv = .8, a = 1.9, b = 0.7;
        pos *= 2.;
        pos.x += curv * sin(t + a * pos.y) + t * b;
        pos.y += curv * cos(t + a * pos.x);
        pos.y += curv * sin(t + a * pos.z) + t * b;
        pos.z += curv * cos(t + a * pos.y);
        pos.z += curv * sin(t + a * pos.x) + t * b;
        pos.x += curv * cos(t + a * pos.z);
        return 0.5 + 0.5 * cos(pos.xyz + vec3(1, 2, 4));
      }

      void main() {
        vec2 uv = 2. * vUv - 1.;
        vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime * uSpeed), vec3(1.5));
        vec3 col = 1.5 * uColorA * w.x;
        col *= w.y;
        col += uColorB * w.z;
        col *= smoothstep(uSpread, 1., abs(uv.y));          // faixas de cima e de baixo
        float m = smoothstep(uDiag, 1., -uv.y * uv.x);       // canto superior esquerdo + inferior direito
        col *= m * m;
        gl_FragColor = vec4(col * uBrightness, iAlpha);
      }`
  })

  const mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), material)
  mesh.frustumCulled = false
  mesh.layers.enable(LAYERS.ENTIRE_SCENE)
  scene.add(mesh)

  /* As janelas: um canvas 2D por cartão [data-janela], agrupados pelo valor */
  const groups = new Map()
  const windows = Array.from(document.querySelectorAll('[data-janela]')).map((cell) => {
    const slot = document.createElement('span')
    slot.className = 'janela__asset'
    slot.setAttribute('aria-hidden', 'true')
    const c = document.createElement('canvas')
    slot.appendChild(c)
    cell.prepend(slot)
    cell.classList.add('is-janela')
    const win = { cell, canvas: c, ctx: c.getContext('2d', { alpha: false }), visible: false, lit: false, u: null }
    const key = cell.dataset.janela
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(win)
    return win
  })

  // a caixa de cada grupo e a fatia de cada célula dentro dela
  function measure() {
    for (const list of groups.values()) {
      const boxes = list.map((win) => docBox(win.cell))
      const L = Math.min(...boxes.map((b) => b.x)), T = Math.min(...boxes.map((b) => b.y))
      const W = Math.max(...boxes.map((b) => b.x + b.w)) - L, H = Math.max(...boxes.map((b) => b.y + b.h)) - T
      list.forEach((win, i) => {
        const b = boxes[i]
        win.u = { x: b.x - L, y: b.y - T, w: b.w, h: b.h, W, H }
        // as chamas são macias: 1x basta e poupa a cópia
        const cw = Math.max(1, b.w), ch = Math.max(1, b.h)
        if (win.canvas.width !== cw || win.canvas.height !== ch) { win.canvas.width = cw; win.canvas.height = ch }
      })
    }
  }

  function copyWindows(all) {
    const sw = canvas.width, sh = canvas.height
    for (const win of windows) {
      if (!win.u || (!all && !win.visible)) continue
      const { x, y, w, h, W, H } = win.u
      win.ctx.drawImage(canvas, x / W * sw, y / H * sh, w / W * sw, h / H * sh, 0, 0, win.canvas.width, win.canvas.height)
      if (!win.lit) { win.lit = true; win.canvas.classList.add('is-lit') }
    }
  }

  /* Tamanho (a página muda de altura à toa; a placa, raramente) */
  let last = ''
  function resize() {
    const { w, h } = size()
    const dpr = pixelRatio()
    if (last === `${w}x${h}@${dpr}`) return
    last = `${w}x${h}@${dpr}`
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    for (const c of [torusComposer, bloomComposer, finalComposer]) { c.setPixelRatio(dpr); c.setSize(w, h) }
  }
  resize()
  measure()

  // desenhar e copiar no mesmo quadro: depois dele o buffer do WebGL não é garantido
  function draw(all) {
    sceneObj.render()
    camera.layers.set(LAYERS.TORUS_SCENE); torusComposer.render()
    camera.layers.set(LAYERS.BLOOM_SCENE); bloomComposer.render()
    camera.layers.set(LAYERS.ENTIRE_SCENE); finalComposer.render()
    copyWindows(all)
  }

  // tudo que muda de tamanho (a placa, os cartões, a página) mede de novo
  const watched = [canvas, ...windows.map((w) => w.cell), document.querySelector('.page') || document.body]
  function onResize(after) {
    let queued = false
    const ro = new ResizeObserver(() => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => { queued = false; resize(); measure(); after() })
    })
    watched.forEach((el) => ro.observe(el))
  }

  // "Reduzir movimento": um quadro parado, já aceso, redesenhado só quando algo muda de tamanho
  if (reduceMotion) {
    sceneObj.appearStart = -1e6
    draw(true)
    onResize(() => draw(true))
    return
  }

  // A entrada das chamas começa quando o preloader libera a página
  if ('preload' in root.dataset) {
    new MutationObserver((list, obs) => {
      if (!('preload' in root.dataset)) { sceneObj.appearStart = performance.now(); obs.disconnect() }
    }).observe(root, { attributes: true, attributeFilter: ['data-preload'] })
  }

  /* Só anima enquanto a placa ou alguma janela estiver na tela */
  let plateVisible = true, rafId = 0
  function render() {
    rafId = 0
    if (!plateVisible && !windows.some((w) => w.visible)) return
    rafId = requestAnimationFrame(render)
    draw(false)
  }
  const wake = () => { if (!rafId) rafId = requestAnimationFrame(render) }
  onResize(() => {})
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === canvas) plateVisible = e.isIntersecting
      else { const win = windows.find((w) => w.canvas === e.target); if (win) win.visible = e.isIntersecting }
    }
    wake()
  })
  io.observe(canvas)
  windows.forEach((w) => io.observe(w.canvas))
  wake()
}

start()
