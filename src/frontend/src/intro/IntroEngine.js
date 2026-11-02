// SOLICE cinematic intro, written in plain three.js so the whole timeline lives in one place.
// Journey: deep universe -> Milky Way -> hyperspace -> Orion Arm -> Earth -> the Solar System -> (Enter) -> out to the stars.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import * as S from "./shaders.js";

/* --------------------------------------- timeline --------------------------------------- */

// every time is in seconds from the start of the intro
export const TL = {
  approach: 4.2, // end of the flight through intergalactic space
  warpIn: 7.0, // streaks start
  swap: 9.3, // peak of the warp: cosmos scene -> local scene
  warpOut: 11.4, // streaks gone, we are in the Orion Arm
  earth: 15.2, // arrive at Earth
  pullBack: 17.0, // start pulling back from Earth
  wide: 21.8, // whole Solar System in view
  title: 20.6, // SOLICE starts drawing
  tagline: 22.6,
  button: 23.6,
  exit: 3.2, // length of the exit flight after Enter
  exitFade: 2.1, // when the page starts fading into the explorer
};

// short location tags shown during the journey
export const CAPTIONS = [
  { from: 2.2, to: 7.0, text: "Milky Way", sub: "100,000 light-years across" },
  { from: 11.0, to: 14.0, text: "Orion Arm", sub: "26,000 light-years from the core" },
  { from: 15.0, to: 17.0, text: "Earth", sub: "Third planet from the Sun" },
];

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const expLerp = (a, b, t) => Math.exp(THREE.MathUtils.lerp(Math.log(a), Math.log(b), t));
const rgb = (hex) => new THREE.Color(hex);

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/* ------------------------------------ galaxy layout ------------------------------------ */

const ARMS = 4;
const SPIN = 0.22;
const GALAXY_R = 40;
const SUN_R = 26;
const OMEGA0 = 0.05; // slow, majestic spin (fast spin made the particles shimmer)
const omega = (r) => OMEGA0 / (1 + r * 0.1);
const glslF = (x) => x.toFixed(3);

/* ------------------------------------ solar system ------------------------------------ */

const SIZE_K = 1.7;
const ORBIT_K = 1.1; // orbital speed
// type: 0 rocky, 2 banded gas giant, 3 hazy / ice giant (Earth has its own shader)
const PLANETS = [
  { name: "Mercury", r: 3.6, size: 0.1, a0: 0.5, spin: 0.1, type: 0, colA: "#9a928b", colB: "#5f5953", colC: "#3b3733", seed: 1.3 },
  { name: "Venus", r: 5.0, size: 0.24, a0: 2.1, spin: -0.04, type: 3, colA: "#e8cf98", colB: "#c49558", colC: "#f3e6c0", contrast: 0.3, seed: 2.1, atmo: "#f0d9a8", atmoK: 0.5 },
  { name: "Earth", r: 6.5, size: 0.25, a0: 0.9, earth: true },
  { name: "Mars", r: 8.0, size: 0.14, a0: 2.4, spin: 0.2, tilt: 0.44, type: 0, colA: "#b8714a", colB: "#7a4a33", colC: "#4a2e22", cap: 0.85, seed: 4.2, atmo: "#e8a27a", atmoK: 0.3 },
  { name: "Jupiter", r: 12.6, size: 1.15, a0: 5.3, spin: 0.35, tilt: 0.05, type: 2, colA: "#e6d3b3", colB: "#b07650", colC: "#7d4a2c", bands: 30, contrast: 0.6, spot: 1, seed: 5.5 },
  { name: "Saturn", r: 16.0, size: 0.95, a0: 4.6, spin: 0.3, tilt: 0.47, type: 2, colA: "#e8d8aa", colB: "#c9ad78", colC: "#ad9464", bands: 22, contrast: 0.4, seed: 6.1, ring: true },
  { name: "Uranus", r: 18.8, size: 0.5, a0: 3.4, spin: 0.25, tilt: 1.71, type: 3, colA: "#a6dfe2", colB: "#86cbd6", colC: "#c6f1f2", contrast: 0.12, seed: 7.4, atmo: "#9be8f0", atmoK: 0.7 },
  { name: "Neptune", r: 21.2, size: 0.48, a0: 2.6, spin: 0.25, tilt: 0.49, type: 3, colA: "#3a5fcf", colB: "#28409c", colC: "#a9c4ff", contrast: 0.4, seed: 8.8, atmo: "#5b86ff", atmoK: 0.8 },
];
const EARTH = PLANETS[2];
const EARTH_RADIUS = EARTH.size * SIZE_K;
const orbitAngle = (pl, t) => pl.a0 + (t * ORBIT_K) / Math.pow(pl.r, 1.5);
const orbitPos = (pl, t, out) => {
  const a = orbitAngle(pl, t);
  return out.set(Math.cos(a) * pl.r, 0, -Math.sin(a) * pl.r);
};

/* ----------------------------------- canvas textures ----------------------------------- */

function radialTexture(stops, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a small distant galaxy drawn from thousands of dots along log-spiral arms
function galaxyTexture(seed, kind) {
  const S2 = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S2;
  const ctx = c.getContext("2d");
  const r = rng(seed);
  const cx = S2 / 2;
  ctx.globalCompositeOperation = "lighter";
  const ell = kind === "elliptical";
  const core = ctx.createRadialGradient(cx, cx, 0, cx, cx, ell ? 120 : 46);
  core.addColorStop(0, ell ? "rgba(255,236,215,0.7)" : "rgba(255,236,205,0.95)");
  core.addColorStop(ell ? 0.08 : 0.25, ell ? "rgba(255,214,175,0.22)" : "rgba(255,206,150,0.45)");
  core.addColorStop(1, "rgba(255,190,140,0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, S2, S2);
  if (kind === "spiral") {
    const arms = 2 + Math.floor(r() * 2);
    const twist = 2.2 + r() * 1.6;
    for (let i = 0; i < 5200; i++) {
      const arm = i % arms;
      const t = Math.pow(r(), 0.75);
      const rad = 8 + t * 108;
      const th = (arm / arms) * TAU + Math.log(rad / 8) * twist + (r() - 0.5) * (0.55 - t * 0.25);
      const x = cx + Math.cos(th) * rad + (r() - 0.5) * 6;
      const y = cx + Math.sin(th) * rad + (r() - 0.5) * 6;
      const blue = t > 0.3 && r() < 0.7;
      const a = (1 - t) * 0.22 + 0.04;
      ctx.fillStyle = blue ? `rgba(170,195,255,${a})` : `rgba(255,215,170,${a})`;
      const s = r() < 0.04 ? 2.2 : 1.2;
      ctx.fillRect(x, y, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ----------------------------------------- engine ----------------------------------------- */

export class IntroEngine {
  constructor(canvas, { maxDpr = 1.5, onTime, onExitFade, onExitDone, onContextLost, manual = false, bakeScale = 1 } = {}) {
    this.canvas = canvas;
    this.onTime = onTime;
    this.onExitFade = onExitFade;
    this.onExitDone = onExitDone;
    this.fixedT = null; // for testing: freeze the timeline at a given time
    this.exitAt = null;
    this.exitFadeSent = false;
    this.exitDoneSent = false;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    // if the GPU resets, hand over to the app instead of showing a black screen
    this.onLostCb = onContextLost;
    this.onLost = (e) => {
      e.preventDefault();
      console.warn("SOLICE intro: WebGL context lost, skipping intro");
      renderer.setAnimationLoop(null);
      onContextLost?.();
    };
    canvas.addEventListener("webglcontextlost", this.onLost);
    this.pr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(this.pr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;
    this.maxDpr = maxDpr;
    this.bakeScale = bakeScale;
    this.bakes = [];
    this.bakeTri = new THREE.BufferGeometry();
    this.bakeTri.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 5000);
    this.cosmos = new THREE.Scene();
    this.local = new THREE.Scene();
    this.fx = new THREE.Scene();

    this.tmp = {
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      d: new THREE.Vector3(),
      look: new THREE.Vector3(),
      earth: new THREE.Vector3(),
      q: new THREE.Quaternion(),
    };

    this.buildCosmos();
    this.buildLocal();
    this.buildFx();

    // Render quality ladder. If a GPU can't handle a level (the screen comes out black), drop to the next:
    //   0: HDR + 4x MSAA + bloom + film grade   1: HDR + bloom, no MSAA, no grade   2: plain rendering, no post effects
    this.mainScene = this.cosmos;
    // ?intro=safe forces level 1, ?intro=basic forces level 2 (handy for checking GPU problems)
    const forced = typeof location !== "undefined" ? new URLSearchParams(location.search).get("intro") : null;
    this.mode = forced === "basic" ? 2 : forced === "safe" ? 1 : 0;
    this.health = { frames: 0, ok: false };
    this.buildComposer();
    this.perf = { frames: 0, time: 0, checked: false };

    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize);
    this.resize();

    // compile every shader up front so the first seconds of the journey don't stutter
    [this.cosmos, this.local, this.fx].forEach((sc) => renderer.compile(sc, this.camera));

    // the timeline advances by real frame time, capped per frame, so a slow frame never skips part of the intro
    this.tAcc = 0;
    this.lastNow = null;
    if (!manual) renderer.setAnimationLoop(() => this.frame());
  }

  buildComposer() {
    this.composer?.renderTarget1?.dispose();
    this.composer?.renderTarget2?.dispose();
    this.composer = null;
    this.grade = null;
    if (this.mode >= 2) return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.mode === 0 ? 4 : 0 });
    const composer = new EffectComposer(this.renderer, rt);
    this.mainPass = new RenderPass(this.mainScene, this.camera);
    this.fxPass = new RenderPass(this.fx, this.camera);
    this.fxPass.clear = false;
    this.fxPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 1.0); // only truly bright things (the Sun, warp) glow
    composer.addPass(this.mainPass);
    composer.addPass(this.fxPass);
    composer.addPass(new ShaderPass(S.SANITIZE_SHADER)); // stops one bad pixel from blacking out the frame
    composer.addPass(this.bloom);
    if (this.mode === 0) {
      this.grade = new ShaderPass(S.GRADE_SHADER);
      composer.addPass(this.grade);
    }
    composer.addPass(new OutputPass());
    this.composer = composer;
    if (this.size) this.resize();
  }

  render() {
    if (this.composer) {
      this.mainPass.scene = this.mainScene;
      this.composer.render();
      return;
    }
    const R = this.renderer;
    R.setRenderTarget(null);
    R.autoClear = true;
    R.render(this.mainScene, this.camera);
    R.autoClear = false;
    R.clearDepth();
    R.render(this.fx, this.camera);
    R.autoClear = true;
  }

  // The first frames of the intro always show the bright galaxy core in the middle of the screen.
  // If the middle is pure black, this GPU didn't like the current render level: step down.
  checkHealth(t) {
    const H = this.health;
    if (H.ok) return;
    H.frames++;
    if (H.frames < 12 || t < 0.3) return;
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const N = 48;
    const buf = new Uint8Array(N * N * 4);
    gl.readPixels(Math.max(0, (w >> 1) - N / 2), Math.max(0, (h >> 1) - N / 2), N, N, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let max = 0;
    for (let i = 0; i < buf.length; i += 4) max = Math.max(max, buf[i], buf[i + 1], buf[i + 2]);
    if (max > 12) {
      H.ok = true;
      console.info(`[SOLICE] intro rendering OK at level ${this.mode}`);
      return;
    }
    console.warn(`[SOLICE] black frame at render level ${this.mode}, stepping down`);
    this.mode++;
    H.frames = 0;
    if (this.mode > 2) {
      H.ok = true;
      this.renderer.setAnimationLoop(null);
      this.onLostCb?.();
      return;
    }
    this.buildComposer();
  }

  /* ------------------------------------ public controls ------------------------------------ */

  time() {
    return this.fixedT ?? this.tAcc;
  }

  jumpTo(t) {
    if (this.exitAt == null) this.tAcc = Math.max(this.tAcc, t);
  }

  enter() {
    if (this.exitAt != null) return;
    this.exitAt = this.time();
    this.exitFrom = this.camera.position.clone();
    this.exitDir = new THREE.Vector3();
    this.camera.getWorldDirection(this.exitDir);
    // fly up over the plane of the planets, toward the stars beyond
    const flat = this.exitDir.clone().setY(0).normalize();
    this.exitTo = flat.multiplyScalar(0.92).addScaledVector(UP, 0.4).normalize();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    window.removeEventListener("resize", this.resize);
    const all = new Set();
    [this.cosmos, this.local, this.fx].forEach((s) =>
      s.traverse((o) => {
        if (o.geometry) all.add(o.geometry);
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          all.add(m);
          if (m.map) all.add(m.map);
        });
      })
    );
    all.forEach((x) => x.dispose?.());
    this.bakes.forEach((rt) => rt.dispose());
    this.bakeTri.dispose();
    this.composer?.renderTarget1?.dispose();
    this.composer?.renderTarget2?.dispose();
    this.renderer.dispose();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pr);
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.size = { w, h };
    this.streakMat.uniforms.uRes.value.set(w * this.pr, h * this.pr);
    this.streakMat.uniforms.uPR.value = this.pr;
    [this.cosmosFarStars, this.cosmosNearStars, this.cosmosSparkle, this.localFarStars, this.localNearStars, this.localSparkle].forEach(
      (p) => p && (p.material.uniforms.uPR.value = this.pr)
    );
    this.glowMat.uniforms.uAspect.value = w / h;
  }

  /* ---------------------------------------- builders ---------------------------------------- */

  bake(fragmentShader, uniforms, w, h) {
    w = Math.round(w * this.bakeScale);
    h = Math.round(h * this.bakeScale);
    const rt = new THREE.WebGLRenderTarget(w, h, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
    });
    rt.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: S.BAKE_VERT, fragmentShader, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(this.bakeTri, mat);
    mesh.frustumCulled = false;
    const sc = new THREE.Scene();
    sc.add(mesh);
    // draw in small tiles: one huge draw can take long enough that the browser resets the GPU (black screen)
    const R = this.renderer;
    const TILE = 256;
    rt.scissorTest = true; // a render target uses its own scissor settings
    rt.texture.generateMipmaps = false;
    const nx = Math.ceil(w / TILE);
    const ny = Math.ceil(h / TILE);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (i === nx - 1 && j === ny - 1) rt.texture.generateMipmaps = true; // build mipmaps after the last tile
        rt.scissor.set(i * TILE, j * TILE, TILE, TILE);
        rt.viewport.set(0, 0, w, h);
        R.setRenderTarget(rt);
        R.render(sc, this.bakeCam);
      }
    }
    rt.scissor.set(0, 0, w, h);
    rt.scissorTest = false;
    R.setRenderTarget(null);
    mat.dispose();
    this.bakes.push(rt);
    return rt.texture;
  }

  // the nebula sky is expensive, so it is rendered once into a cube map and used as the scene background
  bakeSky(band, nebula) {
    const size = Math.round(1024 * this.bakeScale);
    const rt = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    const sky = this.makeSky(band);
    sky.material.uniforms.uNebula.value = nebula;
    const sc = new THREE.Scene();
    const cc = new THREE.CubeCamera(0.1, 100, rt);
    sc.add(sky, cc);
    cc.update(this.renderer, sc);
    sky.geometry.dispose();
    sky.material.dispose();
    this.bakes.push(rt);
    return rt.texture;
  }

  makeSky(band) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uBand: { value: band },
        uNebula: { value: 1 },
        uBandN: { value: new THREE.Vector3(0.18, 0.95, 0.25).normalize() },
        uCore: { value: new THREE.Vector3(-0.9, 0.05, -0.4).normalize() },
      },
      vertexShader: S.SKY_VERT,
      fragmentShader: S.SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    return m;
  }

  makeStars({ n, seed, volume, radius, inner = 0, sizes = [0.6, 2.2], fixed = true, warmth = 0.5, spike = 0, bright: brightK = 1 }) {
    const r = rng(seed);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const sd = new Float32Array(n);
    // star colours by temperature: red dwarfs, orange, sun-like, white, blue-white
    const palette = ["#ffb38a", "#ffd2a1", "#fff1dc", "#f4f6ff", "#cbd9ff", "#aac4ff"].map(rgb);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1;
      const th = r() * TAU;
      const s = Math.sqrt(1 - u * u);
      const d = volume ? inner + Math.pow(r(), 0.6) * (radius - inner) : radius;
      pos.set([Math.cos(th) * s * d, u * d, Math.sin(th) * s * d], i * 3);
      const k = r();
      const idx = Math.min(5, Math.floor(Math.pow(k, 1 - warmth * 0.6) * 6));
      c.copy(palette[idx]);
      const bright = Math.min(0.85, (r() < 0.015 ? 1.0 : 0.45 + Math.pow(r(), 2.5) * 0.45) * brightK);
      c.multiplyScalar(bright);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = sizes[0] + Math.pow(r(), 6) * (sizes[1] - sizes[0]);
      sd[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: this.pr }, uFixed: { value: fixed ? 1 : 0 }, uFade: { value: 1 }, uSpike: { value: spike } },
      vertexShader: S.STAR_VERT,
      fragmentShader: S.STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(g, mat);
    p.frustumCulled = false;
    return p;
  }

  buildCosmos() {
    const sc = this.cosmos;
    sc.background = this.bakeSky(0, 0.55);
    sc.backgroundIntensity = 1;
    this.cosmosSparkle = this.makeStars({ n: 45, seed: 31, radius: 9, sizes: [5, 9], spike: 1, warmth: 0.1, bright: 0.9 });
    // (big soft sparkle stars removed: they read as blurry blobs)
    this.cosmosFarStars = this.makeStars({ n: 2500, seed: 3, radius: 9, sizes: [0.5, 1.6] });
    sc.add(this.cosmosFarStars);
    this.cosmosNearStars = this.makeStars({ n: 1400, seed: 5, volume: true, radius: 700, inner: 60, sizes: [0.6, 2.4], fixed: false });
    // (nearby 3D stars removed: up close they looked like blurry blobs)

    // distant galaxies, each a tilted disc so it reads as 3D while the camera moves
    const texes = [
      galaxyTexture(11, "spiral"),
      galaxyTexture(23, "spiral"),
      galaxyTexture(37, "spiral"),
      galaxyTexture(41, "spiral"),
      galaxyTexture(47, "spiral"),
      galaxyTexture(53, "elliptical"),
    ];
    const r = rng(77);
    const geo = new THREE.PlaneGeometry(1, 1);
    this.galaxies = new THREE.Group();
    for (let i = 0; i < 170; i++) {
      const u = r() * 2 - 1;
      const th = r() * TAU;
      const s = Math.sqrt(1 - u * u);
      const d = 260 + r() * 1100;
      const pos = new THREE.Vector3(Math.cos(th) * s * d, u * d * 0.8, Math.sin(th) * s * d);
      const mat = new THREE.MeshBasicMaterial({
        map: texes[Math.floor(r() * texes.length)],
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        opacity: 0.35 + r() * 0.5,
        color: new THREE.Color().setHSL([0.62, 0.7, 0.76, 0.08][Math.floor(r() * 4)] + r() * 0.04, 0.45, 0.74),
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.scale.setScalar(8 + Math.pow(r(), 3) * 46);
      m.lookAt(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      this.galaxies.add(m);
    }
    // two big neighbours that pass close to the camera early on
    [
      { p: [-160, 90, 330], s: 120, rot: [0.9, 0.3, 0.2], tex: 0, o: 0.8 },
      { p: [210, -60, 260], s: 70, rot: [-0.4, 1.1, 0.3], tex: 2, o: 0.65 },
    ].forEach((g) => {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ map: texes[g.tex], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: g.o })
      );
      m.position.set(...g.p);
      m.scale.setScalar(g.s);
      m.rotation.set(...g.rot);
      this.galaxies.add(m);
    });
    // (the swirly background galaxies were removed: they looked cartoonish)

    // the Milky Way: shader disc + particles, in a tilted group
    const mw = new THREE.Group();
    mw.rotation.set(-Math.PI / 2 + 0.12, 0, 0.05);
    this.milkyWay = mw;
    this.discMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: S.DISC_VERT,
      fragmentShader: S.discFrag(ARMS, glslF(SPIN), glslF(OMEGA0)),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), this.discMat);
    disc.frustumCulled = false;
    mw.add(disc);

    const n = 26000;
    const polar = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const sb = new Float32Array(n * 2);
    const seed = new Float32Array(n);
    const cCore = new THREE.Vector3(1, 0.94, 0.81);
    const cMid = new THREE.Vector3(0.88, 0.67, 0.37);
    const cOuter = new THREE.Vector3(0.5, 0.42, 0.78);
    const cBlue = new THREE.Vector3(0.62, 0.7, 1);
    const cc = new THREE.Vector3();
    const R = rng(11);
    const gauss = () => (R() + R() + R() - 1.5) * 2;
    for (let i = 0; i < n; i++) {
      let rad, th, y, size, bright;
      if (R() < 0.12) {
        rad = Math.abs(gauss()) * 4 + 0.2;
        th = R() * TAU;
        y = gauss() * 1.1;
        size = 0.1 + R() * 0.1;
        bright = 0.3;
      } else {
        rad = 2 + Math.pow(R(), 1.3) * GALAXY_R;
        th = (i % ARMS) * (TAU / ARMS) + rad * SPIN + gauss() * (0.3 - 0.12 * (rad / GALAXY_R));
        y = gauss() * (1 - 0.65 * (rad / GALAXY_R));
        size = 0.12 + Math.pow(R(), 3) * 0.26;
        bright = 0.5 + R() * 0.5;
      }
      const k = Math.min(1, rad / GALAXY_R);
      if (k < 0.35) cc.lerpVectors(cCore, cMid, k / 0.35);
      else cc.lerpVectors(cMid, cOuter, (k - 0.35) / 0.65);
      if (R() < 0.18) {
        cc.lerpVectors(cMid, cBlue, 0.85);
        bright *= 1.4;
      }
      polar.set([rad, th, y], i * 3);
      col.set([cc.x, cc.y, cc.z], i * 3);
      sb.set([size, bright], i * 2);
      seed[i] = R();
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(polar, 3));
    gg.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    gg.setAttribute("aSB", new THREE.BufferAttribute(sb, 2));
    gg.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.galaxyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 1400 }, uMaxSize: { value: 4 }, uFade: { value: 1 } },
      vertexShader: S.galaxyVert(glslF(OMEGA0)),
      fragmentShader: S.GALAXY_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(gg, this.galaxyMat);
    pts.frustumCulled = false;
    mw.add(pts);

    // the destination marker: a soft warm point where the Sun sits on its arm
    this.sunMarker = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture([
          [0, "rgba(255,240,215,1)"],
          [0.12, "rgba(255,214,160,0.55)"],
          [0.4, "rgba(255,190,120,0.08)"],
          [1, "rgba(255,180,110,0)"],
        ]),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.sunLocal = new THREE.Vector3();
    sc.add(this.sunMarker);
    sc.add(mw);
  }

  buildLocal() {
    const sc = this.local;
    sc.background = this.bakeSky(1, 0.75);
    sc.backgroundIntensity = 0;
    this.localSparkle = this.makeStars({ n: 70, seed: 37, radius: 9, sizes: [5, 10], spike: 1, warmth: 0.15, bright: 0.9 });
    // (big soft sparkle stars removed: they read as blurry blobs)
    this.localFarStars = this.makeStars({ n: 6000, seed: 9, radius: 9, sizes: [0.5, 1.8], warmth: 0.6, bright: 0.85 });
    sc.add(this.localFarStars);
    this.localNearStars = this.makeStars({ n: 1500, seed: 13, volume: true, radius: 900, inner: 120, sizes: [0.6, 2.6], fixed: false });
    // (nearby 3D stars removed: up close they looked like blurry blobs)

    // Sun
    this.sunMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: S.SUN_VERT, fragmentShader: S.SUN_FRAG });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1.5, 96, 64), this.sunMat);
    sc.add(sun);
    this.sunGlow = [];
    const glowTex = radialTexture([
      [0, "rgba(255,236,200,1)"],
      [0.08, "rgba(255,210,150,0.75)"],
      [0.25, "rgba(255,170,90,0.22)"],
      [0.55, "rgba(255,140,70,0.05)"],
      [1, "rgba(255,120,60,0)"],
    ]);
    [
      [6, 0.7],
      [14, 0.14],
    ].forEach(([s, o]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.scale.set(s, s, 1);
      sp.userData.op = o;
      this.sunGlow.push(sp);
      sc.add(sp);
    });

    // orbits: thin silver lines that fade in as we pull back
    this.orbitMat = new THREE.LineBasicMaterial({ color: "#9fb0d6", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    PLANETS.forEach((pl) => {
      const pts = [];
      for (let i = 0; i <= 256; i++) {
        const a = (i / 256) * TAU;
        pts.push(new THREE.Vector3(Math.cos(a) * pl.r, 0, -Math.sin(a) * pl.r));
      }
      sc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.orbitMat));
    });

    // asteroid belt
    const R = rng(21);
    const nb = 1800;
    const belt = new Float32Array(nb * 3);
    for (let i = 0; i < nb; i++) {
      const rr = 9.6 + (R() + R() - 1) * 0.8;
      const th = R() * TAU;
      belt.set([Math.cos(th) * rr, (R() - 0.5) * 0.3, Math.sin(th) * rr], i * 3);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(belt, 3));
    this.belt = new THREE.Points(bg, new THREE.PointsMaterial({ color: "#7d7466", size: 1.0 * this.pr, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false }));
    sc.add(this.belt);

    // planets
    this.planetObjs = PLANETS.map((pl) => {
      const holder = new THREE.Group();
      const tilt = new THREE.Group();
      tilt.rotation.z = pl.earth ? 0.41 : pl.tilt || 0;
      holder.add(tilt);
      const rad = pl.size * SIZE_K;
      let mat;
      if (pl.earth) {
        const uA = this.bake(S.BAKE_EARTH_A, {}, 4096, 2048);
        const uB = this.bake(S.BAKE_EARTH_B, {}, 2048, 1024);
        mat = new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uA: { value: uA }, uB: { value: uB } },
          vertexShader: S.PLANET_VERT,
          fragmentShader: S.EARTH_FRAG,
        });
      } else {
        mat = this.bakedPlanetMaterial(pl);
      }
      const segs = pl.earth ? [160, 120] : [64, 48];
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(rad, ...segs), mat);
      tilt.add(mesh);
      if (pl.earth || pl.atmo) {
        const atmo = new THREE.Mesh(
          new THREE.SphereGeometry(rad * 1.12, 96, 64),
          new THREE.ShaderMaterial({
            uniforms: {
              uColor: { value: rgb(pl.earth ? "#a3c6ff" : pl.atmo) },
              uR: { value: rad },
              uH: { value: pl.earth ? 0.018 : 0.02 },
              uK: { value: pl.earth ? 1.1 : (pl.atmoK || 0.5) * 0.9 },
            },
            vertexShader: S.ATMO_VERT,
            fragmentShader: S.ATMO_FRAG,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
        );
        holder.add(atmo);
      }
      if (pl.ring) {
        const ringMat = new THREE.ShaderMaterial({
          uniforms: { uRadii: { value: new THREE.Vector2(rad * 1.35, rad * 2.3) } },
          vertexShader: S.RING_VERT,
          fragmentShader: S.RING_FRAG,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.CustomBlending,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(rad * 1.35, rad * 2.3, 160, 1), ringMat);
        ring.rotation.x = -Math.PI / 2;
        tilt.add(ring);
      }
      sc.add(holder);
      return { pl, holder, mesh, mat };
    });

    // the Moon
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 0.27, 64, 48),
      this.bakedPlanetMaterial({ type: 0, colA: "#9b9893", colB: "#5d5a56", colC: "#c9c6c0", seed: 12 }, 1024)
    );
    sc.add(this.moon);
  }

  bakedPlanetMaterial(pl, w = 2048) {
    const map = this.bake(
      S.BAKE_PLANET_FRAG,
      {
        uType: { value: pl.type },
        uColA: { value: rgb(pl.colA) },
        uColB: { value: rgb(pl.colB) },
        uColC: { value: rgb(pl.colC) },
        uSeed: { value: pl.seed },
        uBands: { value: pl.bands || 0 },
        uContrast: { value: pl.contrast ?? 0.5 },
        uSpot: { value: pl.spot || 0 },
        uCap: { value: pl.cap || 0 },
      },
      w,
      w / 2
    );
    return new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uAtmo: { value: rgb(pl.atmo || "#000000") }, uAtmoK: { value: pl.atmoK || 0 } },
      vertexShader: S.PLANET_VERT,
      fragmentShader: S.PLANET_FRAG,
    });
  }

  buildFx() {
    const N = 2600;
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3));
    quad.setIndex([0, 1, 2, 2, 1, 3]);
    const xy = new Float32Array(N * 2);
    const z = new Float32Array(N);
    const spd = new Float32Array(N);
    const col = new Float32Array(N * 3);
    const w = new Float32Array(N);
    const r = rng(101);
    // real star colours (blue-white to warm), with a light touch of the violet theme
    const pal = [
      ["#eef2ff", 0.42],
      ["#c4d4ff", 0.22],
      ["#a9c1ff", 0.12],
      ["#cbb6ff", 0.1],
      ["#ffe1c2", 0.08],
      ["#f0b8dc", 0.06],
    ];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const rad = 0.4 + Math.sqrt(r()) * 38;
      const th = r() * TAU;
      xy.set([Math.cos(th) * rad, Math.sin(th) * rad], i * 2);
      z[i] = r() * 420;
      spd[i] = 0.6 + r() * 0.8;
      let k = r();
      let j = 0;
      while (j < pal.length - 1 && k > pal[j][1]) k -= pal[j++][1];
      c.set(pal[j][0]);
      const b = 0.55 + r() * 0.7;
      col.set([c.r * b, c.g * b, c.b * b], i * 3);
      w[i] = r() < 0.06 ? 2.6 : 0.7 + r() * 0.9;
    }
    quad.setAttribute("aXY", new THREE.InstancedBufferAttribute(xy, 2));
    quad.setAttribute("aZ", new THREE.InstancedBufferAttribute(z, 1));
    quad.setAttribute("aSpd", new THREE.InstancedBufferAttribute(spd, 1));
    quad.setAttribute("aCol", new THREE.InstancedBufferAttribute(col, 3));
    quad.setAttribute("aW", new THREE.InstancedBufferAttribute(w, 1));
    quad.instanceCount = N;
    this.streakMat = new THREE.ShaderMaterial({
      uniforms: {
        uTravel: { value: 0 },
        uStretch: { value: 0 },
        uIntensity: { value: 0 },
        uShape: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uPR: { value: this.pr },
      },
      vertexShader: S.STREAK_VERT,
      fragmentShader: S.STREAK_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const streaks = new THREE.Mesh(quad, this.streakMat);
    this.streaks = streaks;
    streaks.frustumCulled = false;
    this.fx.add(streaks);

    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { uGlow: { value: 0 }, uFlash: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: S.GLOW_VERT,
      fragmentShader: S.GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const glow = new THREE.Mesh(tri, this.glowMat);
    glow.frustumCulled = false;
    this.fx.add(glow);
    this.travel = 0;
  }

  /* ----------------------------------------- per frame ----------------------------------------- */

  frame() {
    const now = performance.now();
    if (this.lastNow != null) {
      const real = (now - this.lastNow) / 1000;
      this.tAcc += Math.min(0.05, real);
      this.watchPerf(real);
    }
    this.lastNow = now;
    const t = this.time();
    const dt = Math.min(0.05, Math.max(0, t - (this.lastT ?? t)));
    this.lastT = t;
    this.update(t, dt);
    if (this.grade) this.grade.uniforms.uTime.value = t;
    this.render();
    if (this.fixedT == null) this.checkHealth(t);
    this.onTime?.(t, this.exitAt != null ? t - this.exitAt : null);
  }

  // if the first couple of seconds run slowly, drop the resolution once so the rest of the intro stays smooth
  watchPerf(real) {
    const P = this.perf;
    if (P.checked) return;
    P.frames++;
    if (P.frames <= 20) return; // ignore warm-up frames
    P.time += real;
    if (P.frames < 110) return;
    P.checked = true;
    const fps = (P.frames - 20) / P.time;
    if (fps < 40 && this.pr > 1) {
      this.pr = 1;
      this.resize();
    } else if (fps < 40 && this.bloom) {
      this.bloom.enabled = fps > 30;
    }
  }

  // warp strength 0..1 over time (the intro warp plus the exit warp)
  warpAt(t) {
    let w = smooth(TL.warpIn, TL.swap - 0.3, t) * (1 - smooth(TL.swap + 0.2, TL.warpOut, t));
    if (this.exitAt != null) {
      const u = t - this.exitAt;
      w = Math.max(w, smooth(0.9, 2.2, u) * 0.85);
    }
    return w;
  }

  update(t, dt) {
    const cam = this.camera;
    const T = this.tmp;
    const inCosmos = t < TL.swap && this.exitAt == null;
    this.mainScene = inCosmos ? this.cosmos : this.local;

    // ---- warp effect
    const warp = this.warpAt(t);
    // travel speed follows the warp, plus a gentle base speed so streaks never freeze mid-screen
    const speed = 6 + 560 * Math.pow(warp, 2.2); // units per second: gentle at first, then it really goes
    this.travel += dt * speed;
    if (this.fixedT != null) this.travel = t * 160;
    const su = this.streakMat.uniforms;
    su.uTravel.value = this.travel;
    su.uStretch.value = 0.2 * speed; // a streak is how far a star moves while the "shutter" is open
    su.uShape.value = smooth(0.05, 0.4, warp);
    su.uIntensity.value = smooth(0.0, 0.3, warp);
    this.streaks.visible = su.uIntensity.value > 0.002; // the warp layer isn't drawn at all when we're not warping
    this.glowMat.uniforms.uGlow.value = Math.pow(warp, 3) * 0.18; // only a faint haze at the very peak
    this.glowMat.uniforms.uFlash.value = 0;
    let fov = 50 + 22 * warp;

    if (inCosmos) {
      this.updateCosmos(t);
    } else {
      this.updateLocal(t);
    }

    if (this.exitAt != null) fov = THREE.MathUtils.lerp(fov, 50 + 30 * warp, 1);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  updateCosmos(t) {
    const cam = this.camera;
    const T = this.tmp;
    const mw = this.milkyWay;

    // Sun position on its spiral arm, in world space
    const th = SUN_R * SPIN + t * omega(SUN_R) + 0.35;
    this.sunLocal.set(Math.cos(th) * SUN_R, Math.sin(th) * SUN_R, 0);
    mw.updateMatrixWorld();
    const sunW = T.a.copy(this.sunLocal).applyMatrix4(mw.matrixWorld);

    // phase 1: fly in from deep space toward the galaxy (exponential zoom feels steady)
    const p1 = smooth(0, TL.approach, t) * 0.5 + clamp01(t / TL.approach) * 0.5;
    const startDir = T.b.set(0.42, 0.62, 1).normalize();
    const dist1 = expLerp(900, 95, p1);
    // phase 2: dive toward the Sun's arm
    const p2 = smooth(TL.approach - 0.8, TL.swap, t);
    const p2e = p2 * p2 * (3 - 2 * p2);
    const target = T.c.set(0, 0, 0).lerp(sunW, p2e);
    const dist = expLerp(dist1, 4.5, p2e * p2e);
    const dir = T.d.copy(startDir).lerp(T.look.set(0.1, 0.55, 1).normalize(), p2e).normalize();
    cam.position.copy(target).addScaledVector(dir, dist);
    // look slightly ahead along the arm during the dive
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    cam.near = Math.max(0.05, dist * 0.01);
    cam.far = 6000;
    cam.updateProjectionMatrix();

    // galaxy animation
    this.discMat.uniforms.uTime.value = t;
    const gu = this.galaxyMat.uniforms;
    gu.uTime.value = t;
    gu.uScale.value = (this.size.h * this.pr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    const out = 1 - smooth(TL.swap - 1.3, TL.swap - 0.05, t); // the galaxy dissolves into the streaks
    const fade = THREE.MathUtils.lerp(0.35, 1, smooth(6, 60, dist)) * out;
    this.discMat.uniforms.uFade.value = fade;
    gu.uFade.value = fade;
    this.cosmos.backgroundIntensity = out;
    this.cosmosFarStars.material.uniforms.uFade.value = out;
    this.cosmosSparkle.material.uniforms.uFade.value = out;
    this.galaxies.visible = out > 0.01;
    this.galaxies.children.forEach((g) => (g.material.opacity = (g.userData.op ?? (g.userData.op = g.material.opacity)) * out));

    // far stars travel with the camera, so they act as infinitely far away
    this.cosmosFarStars.position.copy(cam.position);
    this.cosmosSparkle.position.copy(cam.position);
    this.cosmosSparkle.material.uniforms.uTime.value = t;
    this.cosmosFarStars.material.uniforms.uTime.value = t;
    this.cosmosNearStars.material.uniforms.uTime.value = t;
    this.cosmosNearStars.material.uniforms.uFade.value = (1 - smooth(TL.approach - 1, TL.approach + 1.5, t) * 0.7) * out;

    this.sunMarker.position.copy(sunW);
    this.sunMarker.scale.setScalar(Math.max(0.6, dist * 0.06));
    this.sunMarker.material.opacity = smooth(TL.approach - 2, TL.approach, t) * 0.9 * out;
  }

  updateLocal(t) {
    const cam = this.camera;
    const T = this.tmp;

    // planets move, spin and the Moon goes round Earth
    this.planetObjs.forEach(({ pl, holder, mesh, mat }) => {
      orbitPos(pl, t, holder.position);
      mesh.rotation.y = t * (pl.earth ? 0.05 : pl.spin);
      if (mat.uniforms.uTime) mat.uniforms.uTime.value = t;
    });
    this.sunMat.uniforms.uTime.value = t;
    this.belt.rotation.y = -t * 0.01;
    const earth = orbitPos(EARTH, t, T.earth);

    // a stable framing direction around Earth: partly toward the Sun so Earth is mostly lit
    const eHat = T.a.copy(earth).normalize();
    const tang = T.b.set(-eHat.z, 0, eHat.x); // direction of travel
    const offE = T.c.copy(eHat).multiplyScalar(-0.42).addScaledVector(tang, -0.86).addScaledVector(UP, 0.2).normalize();

    // the Moon sits behind Earth and to one side of the close-up, drifting slowly
    this.moon.position.copy(earth).addScaledVector(T.d.copy(offE).negate().applyAxisAngle(UP, 0.62 + t * 0.004).setY(0.1).normalize(), 3.2);

    let camPos = new THREE.Vector3();
    let look = new THREE.Vector3();

    if (t < TL.earth) {
      // out of hyperspace in the Orion Arm, racing in toward the Sun and then Earth
      const u = clamp01((t - TL.swap) / (TL.earth - TL.swap));
      const e = u * 0.55 + easeOut(u) * 0.45;
      const D = expLerp(260, EARTH_RADIUS * 3.4, e);
      const dir = T.d.copy(offE).addScaledVector(UP, 0.5 * (1 - e)).addScaledVector(eHat, 0.25 * (1 - e)).normalize();
      camPos.copy(earth).addScaledVector(dir, D);
      look.set(0, 0, 0).lerp(earth, smooth(0.0, 0.3, u));
    } else if (t < TL.pullBack) {
      // close-up: a slow orbit around Earth
      const u = (t - TL.earth) / (TL.pullBack - TL.earth);
      const dir = T.d.copy(offE).applyAxisAngle(UP, -0.1 * u);
      camPos.copy(earth).addScaledVector(dir, EARTH_RADIUS * THREE.MathUtils.lerp(3.4, 3.15, u));
      look.copy(earth);
    } else {
      // pull back to reveal the whole Solar System
      const u = clamp01((t - TL.pullBack) / (TL.wide - TL.pullBack));
      const e = easeInOut(u);
      const dirE = T.d.copy(offE).applyAxisAngle(UP, -0.1);
      // the wide view direction is fixed (taken at the start of the pull back) and then drifts slowly
      if (!this.wideDir || this.wideAt !== TL.pullBack) {
        const eh = orbitPos(EARTH, TL.pullBack, new THREE.Vector3()).normalize();
        const tg = new THREE.Vector3(-eh.z, 0, eh.x);
        const oe = eh.clone().multiplyScalar(-0.42).addScaledVector(tg, -0.86).setY(0).normalize();
        this.wideDir = oe.applyAxisAngle(UP, -0.5).multiplyScalar(Math.cos(0.42)).setY(Math.sin(0.42)).normalize();
        this.wideAt = TL.pullBack;
      }
      const drift = Math.max(0, t - TL.wide) * 0.018 + u * 0.08;
      const wide = T.a.copy(this.wideDir).applyAxisAngle(UP, -drift);
      const dir = new THREE.Vector3().copy(dirE).lerp(wide, e).normalize();
      const sunLook = T.b.set(0, 3.6, 0);
      const lw = smooth(0.1, 0.9, e);
      look.copy(earth).lerp(sunLook, lw);
      const dist = expLerp(EARTH_RADIUS * 3.15, 47, e);
      camPos.copy(look).addScaledVector(dir, dist);
    }

    // exit: turn toward the stars beyond the system and accelerate away
    if (this.exitAt != null) {
      const u = t - this.exitAt;
      const s = 3 * (Math.exp(1.9 * u) - 1);
      camPos.copy(this.exitFrom).addScaledVector(this.exitTo, s);
      const d = new THREE.Vector3().copy(this.exitDir).lerp(this.exitTo, smooth(0, 1.3, u)).normalize();
      look.copy(camPos).add(d);
      this.orbitMat.opacity = 0.16 * (1 - smooth(0.2, 1.2, u));
    } else {
      this.orbitMat.opacity = 0.16 * smooth(TL.pullBack + 1.2, TL.wide - 0.6, t);
    }

    cam.position.copy(camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    const dLook = camPos.distanceTo(look);
    cam.near = Math.max(0.01, Math.min(1, dLook * 0.05));
    cam.far = 6000;
    cam.updateProjectionMatrix();

    this.localFarStars.position.copy(cam.position);
    this.localSparkle.position.copy(cam.position);
    this.localSparkle.material.uniforms.uTime.value = t;
    this.localFarStars.material.uniforms.uTime.value = t;
    this.localNearStars.material.uniforms.uTime.value = t;
    // the sky brightens in as we drop out of warp
    const skyIn = this.exitAt != null ? 1 : smooth(TL.swap, TL.warpOut, t);
    this.local.backgroundIntensity = skyIn;
    this.localSparkle.material.uniforms.uFade.value = skyIn;
    this.localFarStars.material.uniforms.uFade.value = skyIn;
    this.localNearStars.material.uniforms.uFade.value = skyIn;
    const sunIn = this.exitAt != null ? 1 : smooth(TL.swap, TL.swap + 1.4, t);
    this.sunGlow.forEach((g) => (g.material.opacity = g.userData.op * sunIn));

    if (this.exitAt != null) {
      const u = t - this.exitAt;
      if (u > TL.exitFade && !this.exitFadeSent) {
        this.exitFadeSent = true;
        this.onExitFade?.();
      }
      if (u > TL.exit && !this.exitDoneSent) {
        this.exitDoneSent = true;
        this.onExitDone?.();
      }
    }
  }
}
