/* ==========================================================================
   VELLORA: fundo da página inteira (three.js r0.143.0)
   "Corner Flames": chamas turbulentas saindo dos cantos superior esquerdo e
   inferior direito, sobre uma vinheta escura, em loop. Quad em clip-space,
   três composers (torus, bloom e final) e o FinalPass da especificação.
   Cores adaptadas à paleta Cobalto e ciano do guia da marca:
   chama = Azul #1E88B6, dobra fria = Profundo #0D3B66, vinheta = Fundo #06121F.
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

const LAYERS = { NONE: 0, TORUS_SCENE: 1, BLOOM_SCENE: 2, ENTIRE_SCENE: 3 }

function start() {
  if (!canvas || 'bot' in root.dataset) { if (canvas) canvas.remove(); return }

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

  // área visível da janela (sem a barra de rolagem), igual ao tamanho do canvas fixo
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

  /* Tamanho */
  function resize() {
    const { w, h } = size()
    const dpr = pixelRatio()
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    for (const c of [torusComposer, bloomComposer, finalComposer]) { c.setPixelRatio(dpr); c.setSize(w, h) }
  }
  resize()

  function draw() {
    sceneObj.render()
    camera.layers.set(LAYERS.TORUS_SCENE); torusComposer.render()
    camera.layers.set(LAYERS.BLOOM_SCENE); bloomComposer.render()
    camera.layers.set(LAYERS.ENTIRE_SCENE); finalComposer.render()
  }

  // "Reduzir movimento": um quadro parado, já aceso, redesenhado só ao redimensionar
  if (reduceMotion) {
    sceneObj.appearStart = -1e6
    draw()
    let queued = false
    window.addEventListener('resize', () => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => { queued = false; resize(); draw() })
    })
    return
  }

  // A entrada das chamas começa quando o preloader libera a página
  if ('preload' in root.dataset) {
    new MutationObserver((list, obs) => {
      if (!('preload' in root.dataset)) { sceneObj.appearStart = performance.now(); obs.disconnect() }
    }).observe(root, { attributes: true, attributeFilter: ['data-preload'] })
  }

  let resizeQueued = false
  window.addEventListener('resize', () => {
    if (resizeQueued) return
    resizeQueued = true
    requestAnimationFrame(() => { resizeQueued = false; resize() })
  })

  function render() {
    requestAnimationFrame(render)
    draw()
  }
  render()
}

start()
