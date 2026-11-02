// Shared rendering core for the SOLICE explorer views.
// Same safety features as the intro: HDR glow with a pixel-cleanup pass, quality ladder if the GPU renders black,
// automatic resolution drop if it runs slowly, and a clean exit if the GPU resets.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import * as IS from "../intro/shaders.js";

export const TAU = Math.PI * 2;
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function rng(seed) {
  let s = Math.floor(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

// approximate colour of a star from its surface temperature (blackbody, sRGB)
export function starColor(teff) {
  const t = Math.min(40000, Math.max(1000, teff || 5772)) / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = (v) => Math.min(255, Math.max(0, v)) / 255;
  // soften toward white a little so stars don't look like coloured lamps
  const col = new THREE.Color(c(r), c(g), c(b));
  return col.lerp(new THREE.Color(1, 1, 1), 0.18);
}

// RA/Dec (degrees) -> unit direction, same convention as utils.toXYZ
export function raDecDir(raDeg, decDeg, out = new THREE.Vector3()) {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return out.set(Math.cos(dec) * Math.cos(ra), Math.sin(dec), -Math.cos(dec) * Math.sin(ra));
}
// The Milky Way's real orientation on the sky
export const GAL_NORTH = raDecDir(192.859, 27.128);
export const GAL_CENTRE = raDecDir(266.405, -28.936);

/* ------------------------------------------- Stage ------------------------------------------- */

export class Stage {
  constructor(canvas, { maxDpr = 1.5, onContextLost, bloom = [0.6, 0.5, 1.0] } = {}) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;
    this.pr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(this.pr);
    this.onContextLost = onContextLost;
    this.onLost = (e) => {
      e.preventDefault();
      console.warn("[SOLICE] WebGL context lost");
      renderer.setAnimationLoop(null);
      onContextLost?.();
    };
    canvas.addEventListener("webglcontextlost", this.onLost);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 6000);
    this.bloomParams = bloom;
    this.bakes = [];
    this.disposables = [];
    this.updaters = [];
    const forced = new URLSearchParams(location.search).get("intro");
    this.mode = forced === "basic" ? 2 : forced === "safe" ? 1 : 0;
    this.health = { frames: 0, ok: false };
    this.perf = { frames: 0, time: 0, checked: false };
    this.buildComposer();

    this.bakeTri = new THREE.BufferGeometry();
    this.bakeTri.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.resize = this.resize.bind(this);
    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(canvas);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.t = 0;
    this.lastNow = null;
  }

  start(frameFn) {
    this.frameFn = frameFn;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  frame() {
    const now = performance.now();
    let dt = 0;
    if (this.lastNow != null) {
      const real = (now - this.lastNow) / 1000;
      dt = Math.min(0.05, real);
      this.watchPerf(real);
    }
    this.lastNow = now;
    this.t += dt;
    this.frameFn?.(this.t, dt);
    this.render();
    this.checkHealth();
  }

  buildComposer() {
    this.composer?.renderTarget1?.dispose();
    this.composer?.renderTarget2?.dispose();
    this.composer = null;
    if (this.mode >= 2) return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.mode === 0 ? 4 : 0 });
    const c = new EffectComposer(this.renderer, rt);
    this.mainPass = new RenderPass(this.scene, this.camera);
    c.addPass(this.mainPass);
    c.addPass(new ShaderPass(IS.SANITIZE_SHADER));
    const [s, r, th] = this.bloomParams;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), s, r, th);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.composer = c;
    if (this.size) this.resize();
  }

  render() {
    if (this.composer) {
      this.composer.render();
      return;
    }
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  // if the screen comes out black, step down to simpler rendering (see intro for the same idea)
  checkHealth() {
    const H = this.health;
    if (H.ok) return;
    H.frames++;
    if (H.frames < 15) return;
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const N = 64;
    const buf = new Uint8Array(N * N * 4);
    let max = 0;
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.3], [0.75, 0.7]]) {
      gl.readPixels(Math.floor(w * fx) - N / 2, Math.floor(h * fy) - N / 2, N, N, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      for (let i = 0; i < buf.length; i += 4) max = Math.max(max, buf[i], buf[i + 1], buf[i + 2]);
    }
    if (max > 10) {
      H.ok = true;
      return;
    }
    if (H.frames < 40) return; // give the scene a moment to fade in before judging
    console.warn(`[SOLICE] black frame at render level ${this.mode}, stepping down`);
    this.mode++;
    H.frames = 0;
    if (this.mode > 2) {
      H.ok = true;
      return;
    }
    this.buildComposer();
  }

  watchPerf(real) {
    const P = this.perf;
    if (P.checked) return;
    P.frames++;
    if (P.frames <= 20) return;
    P.time += real;
    if (P.frames < 110) return;
    P.checked = true;
    const fps = (P.frames - 20) / P.time;
    if (fps < 40 && this.pr > 1) {
      this.pr = 1;
      this.resize();
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (this.size && this.size.w === w && this.size.h === h && this.size.pr === this.pr) return;
    this.size = { w, h, pr: this.pr };
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pr);
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize?.(w, h, this.pr);
  }

  /* ---- baking helpers: generate a texture once on the GPU, in small tiles ---- */

  bake(fragmentShader, uniforms, w, h, { wrap = true } = {}) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      generateMipmaps: false,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
    });
    rt.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: IS.BAKE_VERT, fragmentShader, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(this.bakeTri, mat);
    mesh.frustumCulled = false;
    const sc = new THREE.Scene();
    sc.add(mesh);
    const R = this.renderer;
    const TILE = 256;
    rt.scissorTest = true;
    const nx = Math.ceil(w / TILE);
    const ny = Math.ceil(h / TILE);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (i === nx - 1 && j === ny - 1) rt.texture.generateMipmaps = true;
        rt.scissor.set(i * TILE, j * TILE, TILE, TILE);
        rt.viewport.set(0, 0, w, h);
        R.setRenderTarget(rt);
        R.render(sc, this.bakeCam);
      }
    }
    rt.scissorTest = false;
    R.setRenderTarget(null);
    mat.dispose();
    this.bakes.push(rt);
    return rt.texture;
  }

  // nebula + Milky Way band, baked once into a cube map. bandN / core: directions in this scene's space.
  bakeSky({ band = 1, nebula = 0.7, bandN = GAL_NORTH, core = GAL_CENTRE, size = 1024 } = {}) {
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uBand: { value: band },
        uNebula: { value: nebula },
        uBandN: { value: bandN.clone().normalize() },
        uCore: { value: core.clone().normalize() },
      },
      vertexShader: IS.SKY_VERT,
      fragmentShader: IS.SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat);
    const sc = new THREE.Scene();
    const cc = new THREE.CubeCamera(0.1, 100, rt);
    sc.add(sky, cc);
    cc.update(this.renderer, sc);
    sky.geometry.dispose();
    mat.dispose();
    this.bakes.push(rt);
    return rt.texture;
  }

  // a dome of steady background stars that always sits at infinity
  makeStarDome(n = 7000, seed = 9) {
    const r = rng(seed);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const sd = new Float32Array(n);
    const palette = ["#ffb38a", "#ffd2a1", "#fff1dc", "#f4f6ff", "#cbd9ff", "#aac4ff"].map((c) => new THREE.Color(c));
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1;
      const th = r() * TAU;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * 9, u * 9, Math.sin(th) * s * 9], i * 3);
      c.copy(palette[Math.min(5, Math.floor(Math.pow(r(), 0.7) * 6))]);
      c.multiplyScalar(Math.min(0.85, 0.4 + Math.pow(r(), 2.5) * 0.5));
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = 0.5 + Math.pow(r(), 6) * 1.4;
      sd[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: this.pr }, uFixed: { value: 1 }, uFade: { value: 1 }, uSpike: { value: 0 } },
      vertexShader: IS.STAR_VERT,
      fragmentShader: IS.STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(g, mat);
    p.frustumCulled = false;
    p.renderOrder = -5;
    return p;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    const all = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) all.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        all.add(m);
        if (m.map) all.add(m.map);
      });
    });
    all.forEach((x) => x.dispose?.());
    this.disposables.forEach((x) => x.dispose?.());
    this.bakes.forEach((rt) => rt.dispose());
    this.bakeTri.dispose();
    this.composer?.renderTarget1?.dispose();
    this.composer?.renderTarget2?.dispose();
    this.renderer.dispose();
  }
}

/* ---------------- DOM labels that follow 3D points (cheaper and crisper than HTML-in-canvas) ---------------- */

export class Labels {
  constructor(container) {
    this.root = document.createElement("div");
    this.root.className = "sx-labels";
    container.appendChild(this.root);
    this.items = new Map();
    this.v = new THREE.Vector3();
  }
  set(key, html, className = "") {
    let el = this.items.get(key);
    if (!el) {
      el = document.createElement("div");
      this.root.appendChild(el);
      this.items.set(key, el);
    }
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
    }
    const cls = "sx-label " + className;
    if (el.className !== cls) el.className = cls;
    return el;
  }
  remove(key) {
    const el = this.items.get(key);
    if (el) {
      el.remove();
      this.items.delete(key);
    }
  }
  clear() {
    this.items.forEach((el) => el.remove());
    this.items.clear();
  }
  // place a label at a world position; hides it when behind the camera
  place(key, pos, camera, w, h, opacity = 1, dx = 0, dy = 0) {
    const el = this.items.get(key);
    if (!el) return;
    const v = this.v.copy(pos).project(camera);
    const vis = v.z < 1 && v.z > -1 && opacity > 0.01;
    if (!vis) {
      if (el.style.display !== "none") el.style.display = "none";
      return;
    }
    el.style.display = "";
    const x = (v.x * 0.5 + 0.5) * w + dx;
    const y = (-v.y * 0.5 + 0.5) * h + dy;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    el.style.opacity = opacity.toFixed(3);
  }
  dispose() {
    this.root.remove();
  }
}
