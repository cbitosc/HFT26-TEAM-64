// One planetary system in 3D, built from NASA data.
// Orbits use each planet's real distance on a log scale (so tight systems like TRAPPIST-1 stay readable),
// orbital speeds keep their real ratios, and the habitable zone is computed from the star's brightness
// with the same thresholds the backend uses (0.36 to 1.1 times Earth's starlight).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Stage, Labels, TAU, smooth, easeInOut, easeOut, clamp01, rng, hashString, starColor } from "./core.js";
import * as IS from "../intro/shaders.js";
import * as S from "./shaders.js";

const lin = (hex) => new THREE.Color(hex);

/* ------------------------------ how each planet looks (illustrative) ------------------------------ */

// effective temperature: the catalogue value, or estimated from the starlight it receives
export function tempOf(p) {
  if (p.pl_eqt != null) return p.pl_eqt;
  if (p.flux != null) return 255 * Math.pow(p.flux, 0.25);
  return null;
}

// Pick a look from radius + temperature. Purely illustrative: no exoplanet surface has been imaged.
export function lookFor(p) {
  const R = p.pl_rade ?? 1.5;
  const T = tempOf(p) ?? 300;
  const r = rng(hashString(p.pl_name) + 7);
  const jit = (c, k = 0.06) => {
    const col = lin(c);
    col.offsetHSL((r() - 0.5) * k, (r() - 0.5) * k, (r() - 0.5) * k);
    return col;
  };
  const L = { seed: r() * 50, bands: 26 + r() * 20, wet: 0.5, clouds: 0, heat: 0, spec: 0, atmo: null, atmoK: 0, label: "" };
  if (R >= 6) {
    if (T > 1000) Object.assign(L, { kind: 7, A: jit("#3a2420"), B: jit("#7a3a22"), C: jit("#c25a2a"), heat: smooth(1000, 2200, T), atmo: "#ff9a62", atmoK: 0.5, label: "Hot Jupiter" });
    else if (T > 400) Object.assign(L, { kind: 5, A: jit("#dcc3a0"), B: jit("#a87e5a"), C: jit("#7a5a40"), atmo: "#f0c99a", atmoK: 0.35, label: "Warm gas giant" });
    else if (T > 160) Object.assign(L, { kind: 5, A: jit("#ebdcc2"), B: jit("#c09a74"), C: jit("#9a6a4a"), atmo: "#f2dcb8", atmoK: 0.3, label: "Jupiter-like giant" });
    else Object.assign(L, { kind: 5, A: jit("#e6dcc0"), B: jit("#c8b590"), C: jit("#a89672"), bands: 22, atmo: "#efe4c8", atmoK: 0.3, label: "Cold gas giant" });
  } else if (R >= 2) {
    if (T > 800) Object.assign(L, { kind: 6, A: jit("#b88a6a"), B: jit("#7a5040"), C: jit("#e0b090"), heat: smooth(800, 1800, T) * 0.7, atmo: "#ffb88a", atmoK: 0.6, label: "Hot Neptune" });
    else if (T > 300) Object.assign(L, { kind: 6, A: jit("#8fb3b8"), B: jit("#5f8a96"), C: jit("#c4dade"), atmo: "#a8d8e0", atmoK: 0.6, label: "Warm sub-Neptune" });
    else Object.assign(L, { kind: 6, A: jit("#6fa0e0"), B: jit("#3f6cc0"), C: jit("#b6d4ff"), atmo: "#8ab8ff", atmoK: 0.75, label: "Ice giant" });
  } else {
    if (T > 1200) Object.assign(L, { kind: 1, A: jit("#3a302c"), B: jit("#1e1816"), C: jit("#5a4a42"), heat: smooth(1000, 2400, T) * 0.9 + 0.25, atmo: "#ff8a4a", atmoK: 0.25, label: "Lava world" });
    else if (T > 650) Object.assign(L, { kind: 0, A: jit("#7a685c"), B: jit("#4a3e36"), C: jit("#2e2622"), atmo: null, label: "Scorched rock" });
    else if (T > 330) Object.assign(L, { kind: 2, A: jit("#e2c48e"), B: jit("#b88a54"), C: jit("#f4e2b8"), atmo: "#f2d8a0", atmoK: 0.55, label: "Hot, cloudy world" });
    else if (T > 180)
      Object.assign(L, {
        kind: 3,
        A: jit("#1d4c7a", 0.08),
        B: jit(r() < 0.5 ? "#5c6a3c" : "#7a6248", 0.1),
        C: jit(r() < 0.5 ? "#8a7a5c" : "#4e6a3a", 0.1),
        wet: 0.35 + r() * 0.4,
        clouds: 1,
        spec: 1,
        atmo: "#8ab4ff",
        atmoK: 1.0,
        // keep the label consistent with the habitable-zone result shown next to it
        label: p.hz_status === "Too hot" ? "Warm rocky world" : p.hz_status === "Too cold" ? "Cool rocky world" : "Temperate world",
      });
    else Object.assign(L, { kind: 4, A: jit("#dfe8f2"), B: jit("#a8bcd2"), C: jit("#7f98b8"), atmo: "#cfe0ff", atmoK: 0.35, label: "Frozen world" });
  }
  return L;
}

/* --------------------------------------------- engine --------------------------------------------- */

export class SystemEngine {
  constructor(canvas, container, cb = {}) {
    this.cb = cb; // onSelect, onHover, onContextLost
    this.stage = new Stage(canvas, { onContextLost: cb.onContextLost, bloom: [0.5, 0.45, 1.0] });
    this.scene = this.stage.scene;
    this.camera = this.stage.camera;
    this.camera.fov = 45;
    this.camera.near = 0.02;
    this.camera.far = 4000;
    this.camera.updateProjectionMatrix();
    this.labels = new Labels(container);
    this.items = [];
    this.focus = -1;
    this.hover = -1;
    this.speed = 1;
    this.inset = 0;

    this.scene.background = this.stage.bakeSky({ band: 1, nebula: 0.7 });
    this.dome = this.stage.makeStarDome(6000, 33);
    this.scene.add(this.dome);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 140;
    this.controls.enabled = false;

    this.raycaster = new THREE.Raycaster();
    this.bindInput();
    this.stage.onResize = () => this.applyInset();
    this.stage.start((t, dt) => this.update(t, dt));
  }

  /* ---------------------------------------- build a system ---------------------------------------- */

  setSystem(hostname, planets) {
    this.clearSystem();
    this.hostname = hostname;
    const first = planets[0] || {};
    const teff = first.st_teff ?? null;
    const srad = first.st_rad ?? null;
    const sCol = starColor(teff ?? 5200);
    this.starCol = sCol;

    // star size in the scene (compressed so giants and dwarfs both fit)
    const starR = THREE.MathUtils.clamp(0.9 * Math.pow(srad ?? 1, 0.45), 0.45, 2.6);
    this.starR = starR;
    const group = (this.sys = new THREE.Group());
    this.scene.add(group);

    const starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: sCol.clone() } },
      vertexShader: IS.SUN_VERT,
      fragmentShader: S.STAR_SURF_FRAG,
    });
    this.starMat = starMat;
    group.add(new THREE.Mesh(new THREE.SphereGeometry(starR, 96, 64), starMat));
    const glowTex = this.glowTexture();
    [
      [starR * 3.2, 0.55],
      [starR * 7.5, 0.1],
    ].forEach(([s, o]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: sCol, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.scale.setScalar(s);
      group.add(sp);
    });

    // orbit distances in AU (catalogue value, or from Kepler's third law)
    const mStar = srad != null ? Math.pow(srad, 1.25) : 1;
    const aOf = (p) => {
      if (p.pl_orbsmax != null && p.pl_orbsmax > 0) return p.pl_orbsmax;
      if (p.pl_orbper != null) return Math.cbrt(Math.pow(p.pl_orbper / 365.25, 2) * mStar);
      return null;
    };
    const withA = planets.map((p, i) => ({ p, a: aOf(p) ?? 0.05 * (i + 1) }));
    const logs = withA.map((x) => Math.log10(x.a));
    let lo = Math.min(...logs);
    let hi = Math.max(...logs);
    if (hi - lo < 0.5) {
      const mid = (hi + lo) / 2;
      lo = mid - 0.25;
      hi = mid + 0.25;
    }
    const rIn = starR * 2.4 + 0.9;
    const span = Math.min(16, 4.5 + 2.1 * planets.length);
    this.mapA = (a) => rIn + (span * (Math.log10(a) - lo)) / (hi - lo);
    this.span = span;
    this.rOut = rIn + span;

    // habitable zone: star luminosity from radius and temperature, or from a planet's starlight
    let Lum = null;
    if (teff != null && srad != null) Lum = srad * srad * Math.pow(teff / 5772, 4);
    else {
      const q = withA.find((x) => x.p.flux != null && x.a);
      if (q) Lum = q.p.flux * q.a * q.a;
    }
    this.hz = null;
    if (Lum) {
      const aIn = Math.sqrt(Lum / 1.1);
      const aOut = Math.sqrt(Lum / 0.36);
      const rI = this.mapA(aIn);
      const rO = this.mapA(aOut);
      const lim0 = starR * 1.3;
      const lim1 = this.rOut + span * 0.6;
      if (rO > lim0 && rI < lim1) {
        const a = Math.max(rI, lim0);
        const b = Math.min(rO, lim1);
        this.hz = { inner: a, outer: b, aIn, aOut, clippedIn: rI < lim0, clippedOut: rO > lim1 };
        this.hzMat = new THREE.ShaderMaterial({
          uniforms: { uIn: { value: a }, uOut: { value: b }, uFade: { value: 0 }, uTime: { value: 0 } },
          vertexShader: S.HZ_VERT,
          fragmentShader: S.HZ_FRAG,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, a - (b - a) * 0.2), b + (b - a) * 0.2, 192, 1), this.hzMat);
        ring.rotation.x = -Math.PI / 2;
        group.add(ring);
        this.labels.set("hz", "Habitable zone", "sx-hz");
      }
    }

    // orbital speed: the innermost planet laps in ~14 s, the rest keep their real period ratios
    const periods = withA.map((x) => x.p.pl_orbper ?? 365.25 * Math.sqrt(Math.pow(x.a, 3) / mStar));
    const pMin = Math.min(...periods);
    const radii = withA.map((x) => this.mapA(x.a));

    withA.forEach(({ p, a }, i) => {
      const L = lookFor(p);
      const orbitR = radii[i];
      const gap = Math.min(i > 0 ? orbitR - radii[i - 1] : 9, i < radii.length - 1 ? radii[i + 1] - orbitR : 9);
      const size = THREE.MathUtils.clamp(0.25 * Math.pow(p.pl_rade ?? 1.3, 0.55), 0.15, Math.min(0.95, Math.max(0.13, gap * 0.42)));
      const omega = (TAU / 14) * (pMin / periods[i]);
      const r0 = rng(hashString(p.pl_name));
      const item = { p, look: L, orbitR, size, omega, ang: r0() * TAU, spin: 0.15 + r0() * 0.3, a };

      // surface
      const map = this.stage.bake(
        S.BAKE_WORLD,
        {
          uKind: { value: L.kind },
          uSeed: { value: L.seed },
          uA: { value: L.A },
          uB: { value: L.B },
          uC: { value: L.C },
          uBands: { value: L.bands },
          uWet: { value: L.wet },
        },
        1024,
        512
      );
      const clouds = L.clouds ? this.stage.bake(S.BAKE_CLOUDS, { uSeed: { value: L.seed }, uAmount: { value: 0.5 } }, 1024, 512) : null;
      const heatCol = new THREE.Color().setRGB(1.0, 0.35, 0.08).multiplyScalar(L.heat * 2.2);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: map },
          uClouds: { value: clouds || map },
          uHasClouds: { value: clouds ? 1 : 0 },
          uTime: { value: 0 },
          uStar: { value: sCol.clone().convertSRGBToLinear() },
          uHeat: { value: heatCol },
          uAtmo: { value: lin(L.atmo || "#000000") },
          uAtmoK: { value: L.atmoK },
          uSpec: { value: L.spec },
          uHighlight: { value: 0 },
        },
        vertexShader: S.WORLD_VERT,
        fragmentShader: S.WORLD_FRAG,
      });
      const holder = new THREE.Group();
      const tilt = new THREE.Group();
      tilt.rotation.z = (r0() - 0.5) * 0.6;
      holder.add(tilt);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 96, 64), mat);
      tilt.add(mesh);
      if (L.atmo) {
        const atmo = new THREE.Mesh(
          new THREE.SphereGeometry(size * 1.12, 64, 48),
          new THREE.ShaderMaterial({
            uniforms: { uColor: { value: lin(L.atmo) }, uR: { value: size }, uH: { value: L.kind === 3 ? 0.022 : 0.03 }, uK: { value: L.atmoK * 1.1 } },
            vertexShader: IS.ATMO_VERT,
            fragmentShader: IS.ATMO_FRAG,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
        );
        holder.add(atmo);
      }
      // invisible, larger sphere so small planets are easy to click
      const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(size * 1.8, 0.45), 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.index = i;
      holder.add(hit);
      group.add(holder);

      // orbit with a fading trail
      const N = 360;
      const pts = new Float32Array((N + 1) * 3);
      const ang = new Float32Array(N + 1);
      for (let k = 0; k <= N; k++) {
        const t = (k / N) * TAU;
        pts.set([Math.cos(t) * orbitR, 0, -Math.sin(t) * orbitR], k * 3);
        ang[k] = t;
      }
      const og = new THREE.BufferGeometry();
      og.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      og.setAttribute("aAng", new THREE.BufferAttribute(ang, 1));
      const inHz = p.hz_status === "In habitable zone";
      const orbitMat = new THREE.ShaderMaterial({
        uniforms: {
          uAng: { value: 0 },
          uColor: { value: lin(inHz ? "#8af0c4" : "#b8c3e8") },
          uBase: { value: inHz ? 0.16 : 0.09 },
          uTrail: { value: 0.55 },
        },
        vertexShader: S.ORBIT_VERT,
        fragmentShader: S.ORBIT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const orbit = new THREE.Line(og, orbitMat);
      group.add(orbit);

      Object.assign(item, { holder, mesh, mat, orbitMat, hit, inHz });
      this.items.push(item);
      const short = p.pl_name.startsWith(hostname) ? p.pl_name.slice(hostname.length).trim() || p.pl_name : p.pl_name;
      this.labels.set(`p${i}`, short, "sx-planet" + (inHz ? " is-hz" : ""));
    });
    this.labels.set("star", hostname, "sx-star");

    // camera: start far above and glide in to an overview
    this.overview = new THREE.Vector3(0, this.rOut * 0.62, this.rOut * 1.22);
    this.introFly = { t: 0, dur: 2.6, p0: new THREE.Vector3(0, this.rOut * 4, this.rOut * 5.5), p1: this.overview.clone() };
    this.camera.position.copy(this.introFly.p0);
    this.controls.target.set(0, 0, 0);
    this.controls.enabled = false;
    this.controls.maxDistance = this.rOut * 4;
    this.focus = -1;
    this.pendingFocus = null;
    this.lastFocusPos = null;
  }

  glowTexture() {
    if (this._glow) return this._glow;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.1, "rgba(255,255,255,0.7)");
    grd.addColorStop(0.3, "rgba(255,255,255,0.18)");
    grd.addColorStop(0.6, "rgba(255,255,255,0.04)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.stage.disposables.push(t);
    return (this._glow = t);
  }

  clearSystem() {
    if (!this.sys) return;
    this.sys.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        o.material.uniforms?.uMap?.value?.dispose?.();
        o.material.uniforms?.uClouds?.value?.dispose?.();
        o.material.dispose();
      }
    });
    this.scene.remove(this.sys);
    this.sys = null;
    this.items = [];
    this.labels.clear();
  }

  /* --------------------------------------------- control --------------------------------------------- */

  setFocus(name) {
    const i = name ? this.items.findIndex((it) => it.p.pl_name === name) : -1;
    if (this.introFly) {
      // wait for the opening glide to finish, then fly to the planet
      this.pendingFocus = name;
      return;
    }
    if (i === this.focus) return;
    this.focus = i;
    this.items.forEach((it, k) => {
      it.orbitMat.uniforms.uBase.value = k === i ? 0.22 : it.inHz ? 0.16 : 0.09;
    });
    if (i < 0) {
      this.camFly = { t: 0, dur: 1.8, p0: this.camera.position.clone(), p1: this.overview.clone(), t0: this.controls.target.clone(), follow: -1 };
      this.lastFocusPos = null;
      return;
    }
    const it = this.items[i];
    const pos = it.holder.position;
    // view the planet from slightly sunward and above, so its lit side faces us
    const toStar = pos.clone().negate().normalize();
    const side = new THREE.Vector3(-toStar.z, 0, toStar.x);
    const off = toStar.multiplyScalar(0.55).add(side.multiplyScalar(0.84)).normalize().multiplyScalar(it.size * 6.5).add(new THREE.Vector3(0, it.size * 2.0, 0));
    this.camFly = { t: 0, dur: 1.8, p0: this.camera.position.clone(), off, t0: this.controls.target.clone(), follow: i };
    this.lastFocusPos = pos.clone();
  }

  // test helper: run the simulation forward without drawing
  advance(sec, step = 1 / 30) {
    for (let k = 0; k < sec / step; k++) {
      this.stage.t += step;
      this.update(this.stage.t, step);
    }
  }

  setPaused(v) {
    this.speed = v ? 0 : 1;
  }

  // keep the centre of interest in the middle of the space left free by the side panel
  setInsetRight(px) {
    this.inset = px;
    this.applyInset();
  }
  applyInset() {
    const { w, h } = this.stage.size;
    if (this.inset > 0) this.camera.setViewOffset(w, h, this.inset / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  bindInput() {
    const el = this.stage.canvas;
    let down = null;
    this.onDown = (e) => (down = { x: e.clientX, y: e.clientY });
    this.onUp = (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        const i = this.pick(e);
        this.cb.onSelect?.(i >= 0 ? this.items[i].p : null);
      }
      down = null;
    };
    this.onMove = (e) => {
      if (down) return;
      const i = this.pick(e);
      if (i !== this.hover) {
        this.hover = i;
        el.style.cursor = i >= 0 ? "pointer" : "";
        this.cb.onHover?.(i >= 0 ? this.items[i].p : null);
      }
    };
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointermove", this.onMove);
  }

  pick(e) {
    const rect = this.stage.canvas.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(m, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.items.map((it) => it.hit),
      false
    );
    return hits.length ? hits[0].object.userData.index : -1;
  }

  /* ---------------------------------------------- frame ---------------------------------------------- */

  update(t, dt) {
    if (!this.sys) return;
    const cam = this.camera;
    const sdt = dt * this.speed;
    this.starMat.uniforms.uTime.value = t;
    if (this.hzMat) {
      this.hzMat.uniforms.uTime.value = t;
      // the zone fades back when you're close to a planet, so it doesn't sit like a sheet across the view
      const close = this.focus >= 0 ? smooth(this.items[this.focus].size * 4, this.items[this.focus].size * 30, cam.position.distanceTo(this.controls.target)) : 1;
      const goal = 0.25 + 0.75 * close;
      const u = this.hzMat.uniforms.uFade;
      u.value += (goal - u.value) * Math.min(1, dt * (u.value < goal ? 0.8 : 3));
    }
    this.items.forEach((it, i) => {
      it.ang += it.omega * sdt;
      it.holder.position.set(Math.cos(it.ang) * it.orbitR, 0, -Math.sin(it.ang) * it.orbitR);
      it.mesh.rotation.y += it.spin * dt;
      it.mat.uniforms.uTime.value = t;
      it.orbitMat.uniforms.uAng.value = it.ang;
      if (i === this.focus) {
        const near = smooth(it.size * 4, it.size * 20, cam.position.distanceTo(it.holder.position));
        it.orbitMat.uniforms.uTrail.value = 0.55 * near;
        it.orbitMat.uniforms.uBase.value = 0.05 + 0.17 * near;
      } else it.orbitMat.uniforms.uTrail.value = 0.55;
      const target = i === this.focus ? 0.25 : i === this.hover ? 1 : 0;
      it.mat.uniforms.uHighlight.value += (target - it.mat.uniforms.uHighlight.value) * Math.min(1, dt * 8);
    });

    // camera
    if (this.introFly) {
      const f = this.introFly;
      f.t += dt;
      const e = easeOut(clamp01(f.t / f.dur));
      cam.position.lerpVectors(f.p0, f.p1, e);
      cam.lookAt(0, 0, 0);
      if (f.t >= f.dur) {
        this.introFly = null;
        this.controls.enabled = true;
        this.controls.target.set(0, 0, 0);
        if (this.pendingFocus) {
          const n = this.pendingFocus;
          this.pendingFocus = null;
          this.setFocus(n);
        }
      }
    } else if (this.camFly) {
      const f = this.camFly;
      f.t += dt;
      const e = easeInOut(clamp01(f.t / f.dur));
      if (f.follow >= 0) {
        const pos = this.items[f.follow].holder.position;
        this.controls.target.lerpVectors(f.t0, pos, e);
        cam.position.lerpVectors(f.p0, pos.clone().add(f.off), e);
      } else {
        this.controls.target.lerpVectors(f.t0, new THREE.Vector3(), e);
        cam.position.lerpVectors(f.p0, f.p1, e);
      }
      if (f.t >= f.dur) {
        this.camFly = null;
        if (f.follow >= 0) this.lastFocusPos = this.items[f.follow].holder.position.clone();
      }
      this.controls.update();
    } else {
      // follow the focused planet along its orbit; the user can still orbit around it
      if (this.focus >= 0 && this.lastFocusPos) {
        const pos = this.items[this.focus].holder.position;
        const d = pos.clone().sub(this.lastFocusPos);
        cam.position.add(d);
        this.controls.target.add(d);
        this.lastFocusPos.copy(pos);
      }
      this.controls.minDistance = this.focus >= 0 ? this.items[this.focus].size * 1.6 : this.starR * 2;
      this.controls.update();
    }
    this.dome.position.copy(cam.position);
    cam.updateMatrixWorld();

    // labels
    const { w, h } = this.stage.size;
    const v = new THREE.Vector3();
    const camDist = cam.position.distanceTo(this.controls.target);
    this.items.forEach((it, i) => {
      const el = this.labels.items.get(`p${i}`);
      const active = i === this.focus || i === this.hover;
      if (el) el.classList.toggle("is-active", active);
      // labels of other planets fade when you're zoomed in close on one
      const op = this.focus >= 0 && i !== this.focus ? smooth(it.size * 6, it.size * 25, camDist) * 0.7 + 0.15 : 1;
      v.copy(it.holder.position);
      this.labels.place(`p${i}`, v, cam, w, h, op, 0, 0);
      // nudge the label below the planet in screen space
      if (el) el.style.marginTop = `${Math.min(80, this.screenRadius(it, camDist) + 10)}px`;
    });
    this.labels.place("star", v.set(0, 0, 0), cam, w, h, this.focus >= 0 ? 0.4 : 0.9);
    const starEl = this.labels.items.get("star");
    if (starEl) starEl.style.marginTop = `${Math.min(140, this.screenRadiusAt(this.starR, cam.position.length()) + 14)}px`;
    if (this.hz) {
      const mid = (this.hz.inner + this.hz.outer) / 2;
      // put the label on the side of the band facing the camera
      const dir = cam.position.clone().setY(0).normalize();
      v.copy(dir).multiplyScalar(mid);
      this.labels.place("hz", v, cam, w, h, (this.hzMat?.uniforms.uFade.value ?? 0) * (this.focus >= 0 ? 0.3 : 0.9));
    }
  }

  screenRadius(it, camDist) {
    return this.screenRadiusAt(it.size, this.camera.position.distanceTo(it.holder.position) || camDist);
  }
  screenRadiusAt(r, d) {
    const h = this.stage.size.h;
    return (r / Math.max(d, 1e-3)) * (h / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
  }

  dispose() {
    const el = this.stage.canvas;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointermove", this.onMove);
    this.clearSystem();
    this.controls.dispose();
    this.labels.dispose();
    this.stage.dispose();
  }
}
