// Star map: every known exoplanet, in two views that morph into each other.
//   "sky": you stand at Earth and see each planet's host star where it is on the sky (real RA / Dec)
//   "map": the 3D neighbourhood around the Sun, distance on a log scale, in the real plane of the Milky Way
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Stage, Labels, raDecDir, GAL_NORTH, GAL_CENTRE, TAU, smooth, easeInOut, clamp01 } from "./core.js";
import * as S from "./shaders.js";

const SKY_R = 50;
const LY_PER_PC = 3.2616;
export const mapRadius = (ly) => 6 * Math.log10(1 + ly / 10);
const RINGS = [10, 100, 1000, 10000];
const MIN_FOV = 8;
const MAX_FOV = 75;
const MAP_HOME = new THREE.Vector3(0, 20, 36);

// marker colours (match utils.colorFor)
const STATUS = {
  "In habitable zone": { col: "#8af0c4", size: 11 },
  "Too hot": { col: "#d9a688", size: 6.5 },
  "Too cold": { col: "#9cc2ff", size: 6.5 },
};
const OTHER = { col: "#aab2c8", size: 6 };

export class StarMapEngine {
  constructor(canvas, container, cb = {}) {
    this.cb = cb; // onSelect, onHover, onModeChange, onContextLost
    const st = (this.stage = new Stage(canvas, { onContextLost: cb.onContextLost, bloom: [0.55, 0.45, 1.0] }));
    this.scene = st.scene;
    this.camera = st.camera;
    this.camera.fov = 60;
    this.camera.near = 0.01;
    this.camera.updateProjectionMatrix();
    this.labels = new Labels(container);
    this.planets = [];
    this.selected = -1;
    this.hover = -1;
    this.mode = "sky";
    this.morph = 0; // animated 0..1
    this.morphTarget = 0;

    // look-around state for the sky view
    this.yaw = 0.4;
    this.pitch = 0.15;
    this.vel = { yaw: 0, pitch: 0 };
    this.fov = 60;
    this.fovTarget = 60;
    this.fly = null;
    this.idle = 0;

    this.build();
    this.bindInput();

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 90;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.enabled = false;
    this.controls.enableZoom = true;

    st.onResize = () => (this.markerMat.uniforms.uPR.value = st.pr);
    st.start((t, dt) => this.update(t, dt));
  }

  /* ------------------------------------------- scene ------------------------------------------- */

  build() {
    const st = this.stage;
    this.scene.background = st.bakeSky({ band: 1, nebula: 0.6, bandN: GAL_NORTH, core: GAL_CENTRE });
    this.scene.backgroundIntensity = 1;
    this.dome = st.makeStarDome(6500, 21);
    this.scene.add(this.dome);

    // faint celestial grid on the sky (RA every 2h, Dec every 30°)
    const grid = [];
    for (let h = 0; h < 24; h += 2) {
      for (let d = -80; d < 80; d += 4) {
        grid.push(raDecDir(h * 15, d).multiplyScalar(SKY_R * 1.4), raDecDir(h * 15, d + 4).multiplyScalar(SKY_R * 1.4));
      }
    }
    for (let d = -60; d <= 60; d += 30) {
      for (let r = 0; r < 360; r += 3) {
        grid.push(raDecDir(r, d).multiplyScalar(SKY_R * 1.4), raDecDir(r + 3, d).multiplyScalar(SKY_R * 1.4));
      }
    }
    this.gridMat = new THREE.LineBasicMaterial({ color: "#8f9cd8", transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending });
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid), this.gridMat);
    this.grid.frustumCulled = false;
    this.scene.add(this.grid);

    // map view: the plane of the Milky Way, distance rings and the Sun
    const gq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), GAL_NORTH);
    this.mapGroup = new THREE.Group();
    this.mapGroup.quaternion.copy(gq);
    this.discMat = new THREE.ShaderMaterial({
      uniforms: { uFade: { value: 0 } },
      vertexShader: S.UV_VERT,
      fragmentShader: S.DISC_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), this.discMat);
    this.mapGroup.add(disc);
    this.ringMat = new THREE.LineBasicMaterial({ color: "#aab4e6", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ringPos = [];
    RINGS.forEach((ly) => {
      const r = mapRadius(ly);
      const pts = [];
      for (let i = 0; i <= 256; i++) {
        const a = (i / 256) * TAU;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
      }
      this.mapGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.ringMat));
      this.ringPos.push({ ly, local: new THREE.Vector3(r * Math.cos(-0.5), r * Math.sin(-0.5), 0) });
      this.labels.set(`ring${ly}`, `${ly.toLocaleString()} ly`, "sx-ring");
    });
    this.scene.add(this.mapGroup);

    // the Sun in the map view
    const glow = document.createElement("canvas");
    glow.width = glow.height = 128;
    const g = glow.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,245,225,1)");
    grd.addColorStop(0.12, "rgba(255,220,160,0.7)");
    grd.addColorStop(0.4, "rgba(255,190,120,0.12)");
    grd.addColorStop(1, "rgba(255,180,110,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const gt = new THREE.CanvasTexture(glow);
    gt.colorSpace = THREE.SRGBColorSpace;
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sun.scale.setScalar(2.2);
    this.scene.add(this.sun);
    this.labels.set("sun", "Sun <span>you are here</span>", "sx-sun");
    this.labels.set("gc", "Galactic centre →", "sx-ring");

    // line from the Sun to the selected system (map view)
    this.lineMat = new THREE.LineBasicMaterial({ color: "#dfe6ff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), this.lineMat);
    this.line.frustumCulled = false;
    this.scene.add(this.line);

    // planet markers
    this.markerMat = new THREE.ShaderMaterial({
      uniforms: {
        uMorph: { value: 0 },
        uPR: { value: st.pr },
        uZoom: { value: 1 },
        uHover: { value: -1 },
        uSel: { value: -1 },
        uFade: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: S.MARKER_VERT,
      fragmentShader: S.MARKER_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.markers = new THREE.Points(new THREE.BufferGeometry(), this.markerMat);
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 5;
    this.scene.add(this.markers);
    this.labels.set("sel", "", "sx-target");
  }

  setPlanets(list) {
    const n = list.length;
    // habitable-zone planets draw last, so they sit on top
    const order = list.map((p, i) => i).sort((a, b) => (list[a].hz_status === "In habitable zone") - (list[b].hz_status === "In habitable zone"));
    const pl = order.map((i) => list[i]);
    const sky = new Float32Array(n * 3);
    const map = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const id = new Float32Array(n);
    const c = new THREE.Color();
    const d = new THREE.Vector3();
    pl.forEach((p, i) => {
      raDecDir(p.ra, p.dec, d);
      sky.set([d.x * SKY_R, d.y * SKY_R, d.z * SKY_R], i * 3);
      const r = mapRadius((p.sy_dist ?? 0) * LY_PER_PC);
      map.set([d.x * r, d.y * r, d.z * r], i * 3);
      const s = STATUS[p.hz_status] || OTHER;
      c.set(s.col);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = s.size;
      id[i] = i;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sky, 3)); // only used for bounds
    g.setAttribute("aSky", new THREE.BufferAttribute(sky, 3));
    g.setAttribute("aMap", new THREE.BufferAttribute(map, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aId", new THREE.BufferAttribute(id, 1));
    this.markers.geometry.dispose();
    this.markers.geometry = g;
    this.planets = pl;
    this.skyPos = sky;
    this.mapPos = map;
    this.markerMat.uniforms.uFade.value = 0; // fade the new set in
    this.hover = -1;
    this.markerMat.uniforms.uHover.value = -1;
    this.setSelected(this.selectedName ? { pl_name: this.selectedName } : null);
  }

  setSelected(p) {
    this.selectedName = p?.pl_name ?? null;
    this.selected = p ? this.planets.findIndex((q) => q.pl_name === p.pl_name) : -1;
    this.markerMat.uniforms.uSel.value = this.selected;
    const lab = this.labels.items.get("sel");
    if (lab) {
      const sp = this.selected >= 0 ? this.planets[this.selected] : null;
      lab.innerHTML = sp ? `<b>${sp.pl_name}</b><span>${sp.sy_dist != null ? (sp.sy_dist * LY_PER_PC).toFixed(0) + " light-years" : ""}</span>` : "";
      lab._html = lab.innerHTML;
    }
    if (this.selected >= 0) this.idle = 0;
  }

  /* ------------------------------------------- input ------------------------------------------- */

  bindInput() {
    const el = this.stage.canvas;
    let down = null;
    this.onDown = (e) => {
      down = { x: e.clientX, y: e.clientY, moved: false };
      this.dragging = this.mode === "sky";
      this.last = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.fly = null;
      this.idle = 0;
      el.setPointerCapture?.(e.pointerId);
    };
    this.onMove = (e) => {
      if (down && (Math.abs(e.clientX - down.x) > 4 || Math.abs(e.clientY - down.y) > 4)) down.moved = true;
      if (this.dragging && down) {
        const k = (this.fov / 60) * 0.0042;
        const dx = e.clientX - this.last.x;
        const dy = e.clientY - this.last.y;
        this.yaw += dx * k;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.45, 1.45);
        this.vel.yaw = dx * k * 60;
        this.vel.pitch = dy * k * 60;
        this.last = { x: e.clientX, y: e.clientY, t: performance.now() };
        this.cb.onHover?.(null);
        return;
      }
      if (!down) this.pick(e, false);
    };
    this.onUp = (e) => {
      this.dragging = false;
      if (down && !down.moved) this.pick(e, true);
      down = null;
    };
    this.onWheel = (e) => {
      if (this.mode !== "sky") return; // OrbitControls zooms the map view
      e.preventDefault();
      const k = e.ctrlKey ? 0.01 : 0.0015;
      this.fovTarget = THREE.MathUtils.clamp(this.fovTarget * Math.exp(e.deltaY * k), MIN_FOV, MAX_FOV);
      this.idle = 0;
    };
    this.onLeave = () => this.cb.onHover?.(null);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("wheel", this.onWheel, { passive: false });
  }

  // find the marker nearest the pointer (in screen space), within a few pixels
  pick(e, click) {
    const n = this.planets.length;
    if (!n) return;
    const rect = this.stage.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const m = this.morph;
    const v = new THREE.Vector3();
    const M = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    let best = -1;
    let bestD = 14 * 14;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      v.set(
        this.skyPos[j] + (this.mapPos[j] - this.skyPos[j]) * m,
        this.skyPos[j + 1] + (this.mapPos[j + 1] - this.skyPos[j + 1]) * m,
        this.skyPos[j + 2] + (this.mapPos[j + 2] - this.skyPos[j + 2]) * m
      ).applyMatrix4(M);
      if (v.z > 1 || v.z < -1) continue;
      const sx = (v.x * 0.5 + 0.5) * w - mx;
      const sy = (-v.y * 0.5 + 0.5) * h - my;
      let d = sx * sx + sy * sy;
      if (this.planets[i].hz_status === "In habitable zone") d *= 0.7; // a little easier to hit
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const p = best >= 0 ? this.planets[best] : null;
    if (click) {
      this.cb.onSelect?.(p);
      return;
    }
    if (best !== this.hover) {
      this.hover = best;
      this.markerMat.uniforms.uHover.value = best;
      this.stage.canvas.style.cursor = p ? "pointer" : "";
    }
    this.cb.onHover?.(p, e);
  }

  /* ------------------------------------------ controls ------------------------------------------ */

  zoomBy(f) {
    if (this.mode === "sky") {
      this.fovTarget = THREE.MathUtils.clamp(this.fovTarget * f, MIN_FOV, MAX_FOV);
    } else {
      const c = this.controls;
      const off = this.camera.position.clone().sub(c.target).multiplyScalar(f);
      const len = THREE.MathUtils.clamp(off.length(), c.minDistance, c.maxDistance);
      this.camera.position.copy(c.target).add(off.setLength(len));
    }
    this.idle = 0;
  }

  resetView() {
    if (this.mode === "sky") {
      this.fovTarget = 60;
    } else {
      this.flyMap(MAP_HOME.clone(), new THREE.Vector3());
    }
  }

  // turn the sky view smoothly to face a direction (planet or any RA/Dec)
  lookAtRaDec(ra, dec, fov) {
    if (this.mode !== "sky") return;
    const d = raDecDir(ra, dec);
    const yaw = Math.atan2(d.x, -d.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    let dy = yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy)); // shortest way round
    this.fly = { t: 0, dur: 1.6, y0: this.yaw, y1: this.yaw + dy, p0: this.pitch, p1: THREE.MathUtils.clamp(pitch, -1.45, 1.45), f0: this.fovTarget, f1: fov ?? this.fovTarget };
    this.vel.yaw = this.vel.pitch = 0;
  }

  flyTo(p, fov) {
    if (!p) return;
    if (this.mode === "sky") this.lookAtRaDec(p.ra, p.dec, fov);
    else {
      const d = raDecDir(p.ra, p.dec);
      const r = mapRadius((p.sy_dist ?? 0) * LY_PER_PC);
      const target = d.clone().multiplyScalar(r);
      const pos = target.clone().add(d.clone().multiplyScalar(4).add(new THREE.Vector3(0, 2.5, 0)));
      this.flyMap(pos, target);
    }
  }

  flyMap(pos, target, dur = 1.6) {
    this.mapFly = { t: 0, dur, p0: this.camera.position.clone(), p1: pos, t0: this.controls.target.clone(), t1: target };
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.morphTarget = mode === "map" ? 1 : 0;
    this.trans = { t: 0, dur: 2.4, to: mode, from: this.camera.position.clone(), look: this.lookDir().clone(), fov0: this.fov };
    this.controls.enabled = false;
    this.fly = null;
    this.cb.onModeChange?.(mode);
  }

  lookDir(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.pitch) * Math.sin(this.yaw), Math.sin(this.pitch), -Math.cos(this.pitch) * Math.cos(this.yaw));
  }

  // "View system": rush toward the planet, then hand over to the system view
  dive(p, done) {
    if (this.mode === "sky") {
      this.lookAtRaDec(p.ra, p.dec, 2.5);
      this.fly.dur = 1.1;
    } else {
      const d = raDecDir(p.ra, p.dec);
      const r = mapRadius((p.sy_dist ?? 0) * LY_PER_PC);
      const target = d.clone().multiplyScalar(r);
      this.flyMap(target.clone().add(d.clone().multiplyScalar(0.15)), target, 1.1);
    }
    setTimeout(done, 950);
  }

  /* ------------------------------------------- frame ------------------------------------------- */

  update(t, dt) {
    const cam = this.camera;
    const st = this.stage;
    const u = this.markerMat.uniforms;
    u.uTime.value = t;
    u.uFade.value = Math.min(1, u.uFade.value + dt * 1.6);
    this.idle += dt;

    // morph between sky and map
    if (this.trans) {
      const tr = this.trans;
      tr.t += dt;
      const k = clamp01(tr.t / tr.dur);
      const e = easeInOut(k);
      this.morph = tr.to === "map" ? e : 1 - e;
      if (tr.to === "map") {
        // pull back out of the sky dome to an overview of the neighbourhood, keeping the same heading
        const home = this.mapHomeFor(tr.look);
        cam.position.lerpVectors(tr.from, home, e);
        const look = new THREE.Vector3().copy(tr.look).multiplyScalar(30).lerp(new THREE.Vector3(), smooth(0.2, 0.9, k));
        cam.up.set(0, 1, 0);
        cam.lookAt(look);
        this.fov = THREE.MathUtils.lerp(tr.fov0, 50, e);
        if (k >= 1) {
          this.trans = null;
          this.controls.target.set(0, 0, 0);
          this.controls.enabled = true;
          this.controls.update();
        }
      } else {
        // fly back to Earth, ending with the same view direction as before
        cam.position.lerpVectors(tr.from, new THREE.Vector3(), e);
        const dir = this.lookDir();
        const look = new THREE.Vector3().lerpVectors(new THREE.Vector3(), dir.clone().multiplyScalar(30), smooth(0.4, 1.0, k));
        if (k < 0.4) look.set(0, 0, 0);
        cam.lookAt(look.lengthSq() < 1e-6 ? dir : look);
        this.fov = THREE.MathUtils.lerp(tr.fov0, this.fovTarget, e);
        if (k >= 1) this.trans = null;
      }
    } else if (this.mode === "sky") {
      if (this.fly) {
        const f = this.fly;
        f.t += dt;
        const e = easeInOut(clamp01(f.t / f.dur));
        this.yaw = THREE.MathUtils.lerp(f.y0, f.y1, e);
        this.pitch = THREE.MathUtils.lerp(f.p0, f.p1, e);
        this.fovTarget = THREE.MathUtils.lerp(f.f0, f.f1, e);
        if (f.t >= f.dur) this.fly = null;
      } else if (!this.dragging) {
        // inertia after a drag, then a slow drift when idle and nothing is selected
        this.yaw += this.vel.yaw * dt;
        this.pitch = THREE.MathUtils.clamp(this.pitch + this.vel.pitch * dt, -1.45, 1.45);
        const damp = Math.exp(-dt * 4);
        this.vel.yaw *= damp;
        this.vel.pitch *= damp;
        if (this.selected < 0 && this.idle > 2.5) this.yaw += dt * 0.012 * (this.fov / 60);
      }
      this.fov += (this.fovTarget - this.fov) * (1 - Math.exp(-dt * 8));
      cam.position.set(0, 0, 0);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.lookDir());
    } else {
      // map view
      if (this.mapFly) {
        const f = this.mapFly;
        f.t += dt;
        const e = easeInOut(clamp01(f.t / f.dur));
        cam.position.lerpVectors(f.p0, f.p1, e);
        this.controls.target.lerpVectors(f.t0, f.t1, e);
        if (f.t >= f.dur) this.mapFly = null;
      }
      this.controls.autoRotate = this.selected < 0 && !this.mapFly;
      this.controls.update();
      this.fov = 50;
    }

    if (Math.abs(cam.fov - this.fov) > 1e-3) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    u.uMorph.value = this.morph;
    u.uZoom.value = this.mode === "sky" && !this.trans ? Math.min(1.8, Math.max(1, Math.pow(60 / this.fov, 0.4))) : 1;

    // what's visible in which view
    const m = this.morph;
    this.gridMat.opacity = 0.05 * (1 - m);
    this.discMat.uniforms.uFade.value = m;
    this.ringMat.opacity = 0.32 * m;
    this.sun.material.opacity = m;
    this.dome.position.copy(cam.position);
    this.grid.position.copy(cam.position);

    // selection line (map view)
    const sel = this.selected >= 0 ? this.selected : -1;
    const sp = new THREE.Vector3();
    if (sel >= 0) {
      const j = sel * 3;
      sp.set(
        this.skyPos[j] + (this.mapPos[j] - this.skyPos[j]) * m,
        this.skyPos[j + 1] + (this.mapPos[j + 1] - this.skyPos[j + 1]) * m,
        this.skyPos[j + 2] + (this.mapPos[j + 2] - this.skyPos[j + 2]) * m
      );
      const pa = this.line.geometry.attributes.position;
      pa.setXYZ(1, sp.x, sp.y, sp.z);
      pa.needsUpdate = true;
    }
    this.lineMat.opacity = sel >= 0 ? 0.4 * m : 0;

    // labels
    const { w, h } = st.size;
    const v = new THREE.Vector3();
    this.mapGroup.updateMatrixWorld();
    this.ringPos.forEach((r) => {
      v.copy(r.local).applyMatrix4(this.mapGroup.matrixWorld);
      this.labels.place(`ring${r.ly}`, v, cam, w, h, smooth(0.6, 1, m));
    });
    this.labels.place("sun", v.set(0, 0, 0), cam, w, h, smooth(0.6, 1, m), 0, 18);
    this.labels.place("gc", v.copy(GAL_CENTRE).multiplyScalar(mapRadius(26000)), cam, w, h, smooth(0.6, 1, m) * 0.8);
    if (sel >= 0) this.labels.place("sel", sp, cam, w, h, 1, 0, 0);
    else this.labels.place("sel", sp, cam, w, h, 0);
  }

  mapHomeFor(look) {
    // stand back from the Sun on the opposite side of where we were looking, slightly above the plane
    const flat = look.clone().setY(0);
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
    flat.normalize();
    return flat.multiplyScalar(-36).add(new THREE.Vector3(0, 20, 0));
  }

  dispose() {
    const el = this.stage.canvas;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("wheel", this.onWheel);
    this.controls.dispose();
    this.labels.dispose();
    this.stage.dispose();
  }
}
